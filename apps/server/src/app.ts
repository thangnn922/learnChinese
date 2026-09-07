import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ERROR_CODES,
  ERROR_MESSAGES_VI,
  attemptSeed,
  buildMatchGame,
  buildOrderGame,
  contentHash,
  diffItems,
  generateQuestions,
  grade,
  nextReview,
  parseImport,
  summarizeAttempt,
  ValidatedBatchSchema,
  type ContentItem,
  type ErrorCode,
  type GradedAnswerRow,
  type QuestionWithKey,
  type ReviewState,
} from '@yct/shared';
import { query, one, tx } from './db.js';
import {
  clearThrottle,
  createSession,
  csrfOk,
  destroySession,
  hashPassword,
  loadUser,
  throttle,
  verifyPassword,
  type AuthUser,
} from './auth.js';
import { headRevision, itemsAt, publishedItemsAt, publish, rollback, RevisionConflict } from './content.js';

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_MESSAGES_VI[code]);
  }
}

function ipHash(req: FastifyRequest): string {
  return createHash('sha256').update(String(req.ip ?? '')).digest('hex').slice(0, 32);
}

/* ── phục vụ giao diện đã build trên CÙNG origin với API ────────────────
   Đường dẫn tính từ vị trí tệp này (ESM), không phụ thuộc thư mục đang đứng khi
   chạy lệnh: cả `src/` (tsx) lẫn `dist/` (node) đều ra `apps/web/dist`. */
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_DIST = resolve(HERE, '../../web/dist');

/**
 * Chỉ tệp có vân tay nội dung mới được cache dài hạn.
 * Vite đặt chúng trong thư mục `assets/` với tên dạng `ten-<vân tay>.ext`.
 * Tệp chép thẳng từ `public/` nằm ở gốc và KHÔNG có vân tay → luôn phải kiểm tra lại.
 */
const HASHED_NAME = /-[0-9A-Za-z_-]{8,}\.[0-9a-z]+$/;

/** Mã/thông báo cho lỗi 4xx do framework sinh ra, để không trả 500 sai sự thật. */
const CLIENT_ERROR_CODES: Record<number, ErrorCode> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  413: ERROR_CODES.VALIDATION_FAILED,
  429: ERROR_CODES.RATE_LIMITED,
};
const CLIENT_ERROR_MESSAGES_VI: Record<number, string> = {
  400: 'Dữ liệu gửi lên không đọc được.',
  401: ERROR_MESSAGES_VI.UNAUTHENTICATED,
  403: ERROR_MESSAGES_VI.FORBIDDEN,
  404: 'Không tìm thấy đường dẫn này.',
  405: 'Cách gọi này không được hỗ trợ.',
  413: 'Nội dung gửi lên quá lớn.',
  415: 'Định dạng dữ liệu không được hỗ trợ.',
  429: ERROR_MESSAGES_VI.RATE_LIMITED,
};

const API_404 = {
  code: ERROR_CODES.NOT_FOUND,
  messageVi: 'Không tìm thấy đường dẫn này.',
} as const;

function pathOf(req: FastifyRequest): string {
  const i = req.url.indexOf('?');
  return i === -1 ? req.url : req.url.slice(0, i);
}

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/** Đường dẫn trông như tệp tĩnh (đoạn cuối có phần mở rộng) — KHÔNG trả index.html thay thế. */
function looksLikeAsset(path: string): boolean {
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last.includes('.');
}

function acceptsHtml(req: FastifyRequest): boolean {
  const accept = req.headers.accept;
  if (!accept) return true;
  return accept.includes('text/html') || accept.includes('*/*');
}

export interface BuildAppOptions {
  /** Thư mục build của @yct/web. Mặc định: apps/web/dist nếu tồn tại. */
  webDist?: string | null;
}

async function audit(actorId: string | null, action: string, target: string, details: unknown, req: FastifyRequest) {
  await query('INSERT INTO audit_events (actor_id, action, target, details, ip_hash) VALUES ($1,$2,$3,$4,$5)', [
    actorId,
    action,
    target,
    JSON.stringify(details ?? {}),
    ipHash(req),
  ]);
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const isProd = process.env.NODE_ENV === 'production';

  /* Sau reverse proxy của Render, IP thật nằm ở X-Forwarded-For.
     `trustProxy: true` sẽ tin mọi X-Forwarded-For do CHÍNH client đặt — kẻ tấn công chỉ cần
     đổi header là có IP mới và né được giới hạn tần suất đăng nhập.
     Thay vào đó chỉ tin khi máy nối trực tiếp nằm trong dải mạng riêng (proxy của nền tảng):
     lúc đó IP client là địa chỉ ngoài cùng KHÔNG thuộc dải tin cậy, nên thêm địa chỉ giả
     vào đầu header cũng vô ích.
     Chạy sau proxy khác thì đặt TRUST_PROXY bằng danh sách IP/CIDR của proxy đó. */
  const trustProxy: string | boolean =
    process.env.TRUST_PROXY ?? (isProd ? 'loopback, linklocal, uniquelocal' : false);

  const app: FastifyInstance = Fastify({ logger: false, trustProxy, bodyLimit: 4 * 1024 * 1024 });

  await app.register(cookie, {});
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        // media chỉ từ chính ứng dụng — không fetch URL tuỳ ý do người dùng nhập
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  /* ── xác thực + CSRF cho mọi request ─────────────────────────────────── */
  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Tệp tĩnh của giao diện không cần phiên: bỏ qua để mỗi ảnh/JS không tạo một truy vấn DB.
    if (!isApiPath(pathOf(req))) return;
    (req as FastifyRequest & { user: AuthUser | null }).user = await loadUser(req);
    if (!csrfOk(req)) {
      reply.code(403);
      throw new HttpError(403, ERROR_CODES.FORBIDDEN, 'Phiên làm việc không hợp lệ. Hãy tải lại trang.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ code: err.code, messageVi: err.message, details: err.details });
    }
    if (err instanceof RevisionConflict) {
      return reply
        .code(409)
        .send({ code: ERROR_CODES.REVISION_CONFLICT, messageVi: ERROR_MESSAGES_VI.REVISION_CONFLICT });
    }
    if (err instanceof z.ZodError) {
      return reply.code(400).send({
        code: ERROR_CODES.VALIDATION_FAILED,
        messageVi: ERROR_MESSAGES_VI.VALIDATION_FAILED,
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    /* Lỗi do Fastify/plugin sinh ra có sẵn mã HTTP (JSON hỏng 400, body quá lớn 413,
       tệp bị từ chối 403…). Trả đúng mã đó — biến tất cả thành 500 khiến giao diện
       báo sai cho người dùng và che mất lỗi thật ở phía client.
       Vẫn KHÔNG chuyển nguyên văn thông báo nội bộ ra ngoài. */
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({
        code: CLIENT_ERROR_CODES[status] ?? ERROR_CODES.VALIDATION_FAILED,
        messageVi: CLIENT_ERROR_MESSAGES_VI[status] ?? 'Yêu cầu không hợp lệ.',
      });
    }
    // KHÔNG log nội dung riêng của trẻ, token hay mật khẩu
    console.error('[error]', (err as Error).name, (err as Error).message);
    return reply.code(500).send({ code: 'INTERNAL', messageVi: 'Máy chủ gặp lỗi. Thử lại sau nhé.' });
  });

  const userOf = (req: FastifyRequest): AuthUser => {
    const u = (req as FastifyRequest & { user: AuthUser | null }).user;
    if (!u) throw new HttpError(401, ERROR_CODES.UNAUTHENTICATED);
    return u;
  };
  const teacherOf = (req: FastifyRequest): AuthUser => {
    const u = userOf(req);
    if (u.role !== 'teacher' && u.role !== 'admin') throw new HttpError(403, ERROR_CODES.FORBIDDEN);
    return u;
  };
  /** Giáo viên chỉ thao tác được trên lớp được cấp quyền. */
  const requireClassroom = (u: AuthUser, classroomId: string): void => {
    if (u.role === 'admin') return;
    if (!u.classroomIds.includes(classroomId)) throw new HttpError(403, ERROR_CODES.FORBIDDEN);
  };

  /* ── phiên ───────────────────────────────────────────────────────────── */

  app.get('/api/me', async (req) => {
    const u = (req as FastifyRequest & { user: AuthUser | null }).user;
    return u
      ? { userId: u.userId, displayName: u.displayName, role: u.role, classroomIds: u.classroomIds }
      : null;
  });

  app.post('/api/auth/teacher/login', async (req, reply) => {
    const body = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const key = `t:${body.email.toLowerCase()}:${ipHash(req)}`;
    if (!(await throttle(key))) throw new HttpError(429, ERROR_CODES.RATE_LIMITED);
    const row = await one<{ id: string; role: AuthUser['role']; display_name: string; password_hash: string | null; disabled: boolean }>(
      'SELECT id, role, display_name, password_hash, disabled FROM users WHERE lower(email) = lower($1)',
      [body.email],
    );
    const ok = row && !row.disabled && row.role !== 'student' && (await verifyPassword(body.password, row.password_hash));
    if (!ok || !row) {
      await audit(null, 'auth.login_failed', 'teacher', { email: body.email }, req);
      throw new HttpError(401, ERROR_CODES.UNAUTHENTICATED, 'Email hoặc mật khẩu chưa đúng.');
    }
    await clearThrottle(key);
    await createSession(reply, row.id);
    await audit(row.id, 'auth.login', 'teacher', {}, req);
    const classes = await query<{ classroom_id: string }>('SELECT classroom_id FROM memberships WHERE user_id = $1', [row.id]);
    return { userId: row.id, displayName: row.display_name, role: row.role, classroomIds: classes.map((c) => c.classroom_id) };
  });

  app.post('/api/auth/student/login', async (req, reply) => {
    const body = z
      .object({
        classCode: z.string().min(3).max(40),
        nickname: z.string().min(1).max(40),
        accessCode: z.string().min(4).max(60),
      })
      .parse(req.body);
    const key = `s:${body.classCode}:${body.nickname}:${ipHash(req)}`;
    if (!(await throttle(key))) throw new HttpError(429, ERROR_CODES.RATE_LIMITED);

    const row = await one<{ user_id: string; display_name: string; access_hash: string | null; classroom_id: string; disabled: boolean }>(
      `SELECT m.user_id, u.display_name, m.access_hash, m.classroom_id, u.disabled
         FROM classrooms c
         JOIN memberships m ON m.classroom_id = c.id AND m.role = 'student'
         JOIN users u ON u.id = m.user_id
        WHERE c.code = $1 AND lower(u.display_name) = lower($2)`,
      [body.classCode, body.nickname],
    );
    // Mã lớp KHÔNG đủ để vào: phải đúng mã truy cập riêng của học sinh đó.
    const ok = row && !row.disabled && (await verifyPassword(body.accessCode, row.access_hash));
    if (!ok || !row) {
      await audit(null, 'auth.login_failed', 'student', { classCode: body.classCode }, req);
      throw new HttpError(401, ERROR_CODES.UNAUTHENTICATED, 'Mã lớp, biệt danh hoặc mã truy cập chưa đúng.');
    }
    await clearThrottle(key);
    await createSession(reply, row.user_id);
    await audit(row.user_id, 'auth.login', 'student', {}, req);
    return { userId: row.user_id, displayName: row.display_name, role: 'student', classroomIds: [row.classroom_id] };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const u = (req as FastifyRequest & { user: AuthUser | null }).user;
    await destroySession(req, reply);
    if (u) await audit(u.userId, 'auth.logout', '', {}, req);
    reply.code(204);
  });

  /* ── chương trình & catalog ──────────────────────────────────────────── */

  app.get('/api/curricula', async () => {
    return query(
      'SELECT curriculum_id AS "curriculumId", level, name_vi AS "nameVi", source_verified AS "sourceVerified" FROM curricula ORDER BY curriculum_id, level',
    );
  });

  app.get('/api/curricula/:curriculumId/:level/catalog', async (req) => {
    const p = z.object({ curriculumId: z.enum(['yct', 'hsk']), level: z.coerce.number().int().positive() }).parse(req.params);
    const cur = await one<{ curriculum_id: string; level: number; edition: string; name_vi: string; source_verified: boolean; note_vi: string }>(
      'SELECT * FROM curricula WHERE curriculum_id = $1 AND level = $2',
      [p.curriculumId, p.level],
    );
    if (!cur) throw new HttpError(404, ERROR_CODES.NOT_FOUND);
    const revision = await headRevision();
    const lessons = await query<{
      lesson_id: string; n: number; title_zh: string; title_pinyin: string; title_vi: string; goals_vi: string[];
    }>(
      'SELECT lesson_id, n, title_zh, title_pinyin, title_vi, goals_vi FROM lessons WHERE curriculum_id = $1 AND level = $2 ORDER BY n',
      [p.curriculumId, p.level],
    );
    const counts = await query<{ lesson_id: string; status: string; c: string }>(
      `SELECT lesson_id, status, count(*)::text AS c
         FROM content_item_versions WHERE revision = $1 GROUP BY lesson_id, status`,
      [revision],
    );
    const at = (id: string, st: string) => Number(counts.find((c) => c.lesson_id === id && c.status === st)?.c ?? 0);
    const view = lessons.map((l) => {
      const published = at(l.lesson_id, 'published');
      return {
        lessonId: l.lesson_id,
        n: l.n,
        titleVi: l.title_vi,
        titleZh: l.title_zh,
        titlePinyin: l.title_pinyin,
        goalsVi: l.goals_vi ?? [],
        publishedItems: published,
        draftItems: at(l.lesson_id, 'draft'),
        ready: published >= 2,
      };
    });
    return {
      curriculum: {
        curriculumId: cur.curriculum_id,
        level: cur.level,
        edition: cur.edition,
        nameVi: cur.name_vi,
        sourceVerified: cur.source_verified,
        noteVi: cur.note_vi,
        lessons: [],
      },
      lessons: view,
      revision,
      emptyPublished: view.every((l) => l.publishedItems === 0),
      noteVi: cur.note_vi,
    };
  });

  /* ── lượt học ────────────────────────────────────────────────────────── */

  const StartSchema = z.object({
    curriculumId: z.enum(['yct', 'hsk']),
    level: z.number().int().positive(),
    lessonIds: z.array(z.string()).min(1).max(30),
    kinds: z.array(z.string()).min(1),
    questionCount: z.number().int().min(0).max(500),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    mode: z.enum(['practice', 'assessment']),
    assignmentId: z.string().uuid().nullable().optional(),
  });

  app.post('/api/attempts', async (req) => {
    const u = userOf(req);
    const body = StartSchema.parse(req.body);

    let revision = await headRevision();
    let classroomId: string | null = null;
    if (body.assignmentId) {
      const a = await one<{ classroom_id: string; revision: number; config: unknown }>(
        'SELECT classroom_id, revision, config FROM assignments WHERE id = $1',
        [body.assignmentId],
      );
      if (!a) throw new HttpError(404, ERROR_CODES.NOT_FOUND);
      // học sinh chỉ làm bài của lớp mình
      if (!u.classroomIds.includes(a.classroom_id)) throw new HttpError(403, ERROR_CODES.FORBIDDEN);
      revision = a.revision;
      classroomId = a.classroom_id;
    }

    const items = await itemsAt(revision, { statuses: ['published'] });
    const attemptId = randomUUID();
    const res = generateQuestions({
      items,
      scopeLessonIds: body.lessonIds as never,
      kinds: body.kinds as never,
      requestedCount: body.questionCount,
      difficulty: body.difficulty,
      seed: attemptSeed(attemptId, revision),
      allowPriorKnowledgeDistractors: false,
      acceptStatuses: ['published'],
    });
    if (res.questions.length === 0) throw new HttpError(409, ERROR_CODES.EMPTY_BANK);

    const label = body.lessonIds.length === 1 ? `Bài ${String(body.lessonIds[0]).split('-l')[1]}` : `${body.lessonIds.length} bài`;
    await query(
      `INSERT INTO attempts (id, user_id, assignment_id, classroom_id, revision, mode, question_keys, reduced_note, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [attemptId, u.userId, body.assignmentId ?? null, classroomId, revision, body.mode, JSON.stringify(res.questions), res.reasonVi, label],
    );
    return attemptView(attemptId, u.userId);
  });

  async function loadAttempt(attemptId: string, userId: string) {
    const a = await one<{
      id: string; user_id: string; revision: number; mode: 'practice' | 'assessment';
      question_keys: QuestionWithKey[]; cursor: number; reduced_note: string | null;
      created_at: Date; finished_at: Date | null; label: string;
    }>('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (!a) throw new HttpError(404, ERROR_CODES.NOT_FOUND);
    // Học sinh chỉ đọc được lượt học của CHÍNH MÌNH — kiểm tra ở server, không dựa vào client.
    if (a.user_id !== userId) throw new HttpError(403, ERROR_CODES.FORBIDDEN);
    return a;
  }

  async function attemptView(attemptId: string, userId: string) {
    const a = await loadAttempt(attemptId, userId);
    const answered = await query<{ question_id: string }>(
      'SELECT DISTINCT question_id FROM answer_events WHERE attempt_id = $1',
      [attemptId],
    );
    return {
      attemptId: a.id,
      revision: a.revision,
      mode: a.mode,
      // CHỈ gửi phần câu hỏi — đáp án ở lại máy chủ
      questions: a.question_keys.map((k) => k.question),
      cursor: a.cursor,
      answeredQuestionIds: answered.map((r) => r.question_id),
      reducedNotice: a.reduced_note,
      createdAt: a.created_at.toISOString(),
      finishedAt: a.finished_at ? a.finished_at.toISOString() : null,
    };
  }

  app.get('/api/attempts/resumable', async (req) => {
    const u = userOf(req);
    const a = await one<{ id: string; label: string }>(
      'SELECT id, label FROM attempts WHERE user_id = $1 AND finished_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [u.userId],
    );
    return a ? { attemptId: a.id, label: a.label } : null;
  });

  app.get('/api/attempts/:attemptId', async (req) => {
    const u = userOf(req);
    const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(req.params);
    return attemptView(attemptId, u.userId);
  });

  app.post('/api/attempts/:attemptId/answers', async (req) => {
    const u = userOf(req);
    const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        questionId: z.string().min(1),
        response: z.string().max(400),
        tryIndex: z.number().int().min(1).max(20),
        assistanceUsed: z.array(z.string()).max(10).default([]),
        activeMs: z.number().int().min(0).max(3600_000).default(0),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(req.body);

    const a = await loadAttempt(attemptId, u.userId);
    const key = a.question_keys.find((k) => k.question.questionId === body.questionId);
    if (!key) throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Câu hỏi không thuộc lượt học này.');

    // SEC-04: điểm do MÁY CHỦ chấm, client chỉ gửi lựa chọn.
    const { correct } = grade(key, body.response);
    const skipped = body.response === '';

    const inserted = await query<{ correct: boolean }>(
      `INSERT INTO answer_events
         (idempotency_key, attempt_id, question_id, kind, content_ids, response, try_index, correct, skipped, assistance_used, active_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING correct`,
      [
        body.idempotencyKey,
        attemptId,
        body.questionId,
        key.question.kind,
        JSON.stringify(key.question.refContentIds),
        body.response,
        body.tryIndex,
        correct,
        skipped,
        JSON.stringify(body.assistanceUsed),
        body.activeMs,
      ],
    );
    const duplicate = inserted.length === 0;

    if (!duplicate && body.tryIndex === 1 && !skipped) {
      for (const cid of key.question.refContentIds) {
        const prev = await one<{ step: number; due_at: Date | null; last_result: string | null }>(
          'SELECT step, due_at, last_result FROM review_states WHERE user_id = $1 AND content_id = $2',
          [u.userId, cid],
        );
        const st: ReviewState = {
          contentId: cid,
          step: prev?.step ?? -1,
          dueAt: prev?.due_at ? prev.due_at.toISOString() : null,
          lastResult: (prev?.last_result as ReviewState['lastResult']) ?? null,
        };
        const nx = nextReview(st, correct, new Date());
        await query(
          `INSERT INTO review_states (user_id, content_id, step, due_at, last_result)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_id, content_id) DO UPDATE
             SET step = EXCLUDED.step, due_at = EXCLUDED.due_at, last_result = EXCLUDED.last_result`,
          [u.userId, cid, nx.step, nx.dueAt, nx.lastResult],
        );
      }
    }

    const pos = a.question_keys.findIndex((k) => k.question.questionId === body.questionId) + 1;
    await query('UPDATE attempts SET cursor = GREATEST(cursor, $2) WHERE id = $1', [attemptId, pos]);

    return {
      correct: duplicate ? Boolean((await one<{ correct: boolean }>('SELECT correct FROM answer_events WHERE idempotency_key = $1', [body.idempotencyKey]))?.correct) : correct,
      correctOptionId: key.correctOptionId,
      explainVi: key.explainVi,
      reveal: key.revealAfterAnswer,
      duplicate,
    };
  });

  app.post('/api/attempts/:attemptId/self-reports', async (req) => {
    const u = userOf(req);
    const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        contentId: z.string().min(1).max(200),
        remembered: z.boolean(),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(req.body);
    await loadAttempt(attemptId, u.userId);
    const r = await query(
      `INSERT INTO self_reports (idempotency_key, attempt_id, content_id, remembered)
       VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`,
      [body.idempotencyKey, attemptId, body.contentId, body.remembered],
    );
    return { duplicate: r.length === 0 };
  });

  async function summaryOf(attemptId: string, userId: string) {
    const a = await loadAttempt(attemptId, userId);
    const answers = await query<{
      question_id: string; kind: string; content_ids: string[]; try_index: number; correct: boolean; skipped: boolean;
    }>('SELECT question_id, kind, content_ids, try_index, correct, skipped FROM answer_events WHERE attempt_id = $1', [attemptId]);
    const reports = await query<{ content_id: string; remembered: boolean }>(
      'SELECT content_id, remembered FROM self_reports WHERE attempt_id = $1',
      [attemptId],
    );
    const rows: GradedAnswerRow[] = answers.map((r) => ({
      questionId: r.question_id,
      kind: r.kind as GradedAnswerRow['kind'],
      contentIds: r.content_ids,
      tryIndex: r.try_index,
      correct: r.correct,
      skipped: r.skipped,
    }));
    return summarizeAttempt(attemptId, a.mode, rows, reports.map((r) => ({ contentId: r.content_id, remembered: r.remembered })));
  }

  app.post('/api/attempts/:attemptId/finish', async (req) => {
    const u = userOf(req);
    const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(req.params);
    await loadAttempt(attemptId, u.userId);
    await query('UPDATE attempts SET finished_at = COALESCE(finished_at, now()) WHERE id = $1', [attemptId]);
    return summaryOf(attemptId, u.userId);
  });

  app.get('/api/attempts/:attemptId/summary', async (req) => {
    const u = userOf(req);
    const { attemptId } = z.object({ attemptId: z.string().uuid() }).parse(req.params);
    return summaryOf(attemptId, u.userId);
  });

  /* ── tiến độ ─────────────────────────────────────────────────────────── */

  app.get('/api/progress', async (req) => {
    const u = userOf(req);
    const answers = await query<{ attempt_id: string; question_id: string; kind: string; try_index: number; correct: boolean; skipped: boolean }>(
      `SELECT ae.attempt_id, ae.question_id, ae.kind, ae.try_index, ae.correct, ae.skipped
         FROM answer_events ae JOIN attempts a ON a.id = ae.attempt_id
        WHERE a.user_id = $1`,
      [u.userId],
    );
    const first = new Map<string, (typeof answers)[number]>();
    for (const a of answers) {
      const k = a.attempt_id + a.question_id;
      const p = first.get(k);
      if (!p || a.try_index < p.try_index) first.set(k, a);
    }
    const objective = [...first.values()].filter((a) => !a.skipped && a.kind !== 'flashcard');
    const correct = objective.filter((a) => a.correct).length;

    const revision = await headRevision();
    const due = await query<{ content_id: string; payload: ContentItem }>(
      `SELECT r.content_id, v.payload
         FROM review_states r
         JOIN content_item_versions v ON v.item_id = r.content_id AND v.revision = $2
        WHERE r.user_id = $1 AND r.due_at IS NOT NULL AND r.due_at <= now()
        ORDER BY r.due_at LIMIT 30`,
      [u.userId, revision],
    );

    const recentIds = await query<{ id: string; finished_at: Date }>(
      'SELECT id, finished_at FROM attempts WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 5',
      [u.userId],
    );
    const recentAttempts = [];
    for (const r of recentIds) {
      recentAttempts.push({ attemptId: r.id, at: r.finished_at.toISOString(), summary: await summaryOf(r.id, u.userId) });
    }

    return {
      totalAnswered: objective.length,
      firstTryAccuracy: objective.length === 0 ? null : correct / objective.length,
      dueForReview: due.map((d) => ({
        contentId: d.content_id,
        hanzi: d.payload.hanzi,
        pinyin: d.payload.pinyin,
        meaningVi: d.payload.meaningVi,
      })),
      recentAttempts,
    };
  });

  /* ── trò chơi ────────────────────────────────────────────────────────── */

  /* Trò chơi chỉ dùng nội dung ĐÃ XUẤT BẢN và không đọc, không ghi dữ liệu của ai.
     Vì vậy không cần đăng nhập — trẻ vào là chơi được ngay. */
  app.get('/api/games/:kind', async (req) => {
    const p = z.object({ kind: z.enum(['match', 'order']) }).parse(req.params);
    const q = z.object({ lessons: z.string().max(1000).default('') }).parse(req.query);
    const lessonIds = q.lessons.split(',').filter(Boolean).slice(0, 30);
    if (!lessonIds.length) return null;
    const revision = await headRevision();
    const items = await publishedItemsAt(revision);
    const seed = `${p.kind}:${lessonIds.join(',')}:${Math.floor(Date.now() / 60000)}`;
    return p.kind === 'match'
      ? buildMatchGame(items, lessonIds as never, seed)
      : buildOrderGame(items, lessonIds as never, seed);
  });

  /* ── giáo viên: nội dung ─────────────────────────────────────────────── */

  /* ── luyện tập ẩn danh ────────────────────────────────────────────────
     Trẻ vào luyện tập và chơi mà KHÔNG cần tài khoản. Ràng buộc của phần này:

     - KHÔNG ghi gì vào cơ sở dữ liệu. Địa chỉ này công khai trên Internet; cho phép người
       lạ tạo dòng dữ liệu là mở đường cho spam làm đầy 0.5 GB của gói Neon miễn phí.
     - KHÔNG có tiến độ, không có cookie, không thu thập gì về đứa trẻ.
     - Điểm vẫn do MÁY CHỦ chấm. Đáp án không bao giờ rời khỏi máy chủ, y như lượt học có
       tài khoản — không tạo ra một đường chấm điểm yếu hơn song song.

     Cách làm: bộ sinh câu hỏi tất định theo seed, nên thay vì lưu bộ câu hỏi, máy chủ
     DỰNG LẠI đúng bộ đó từ `practiceId` mỗi lần chấm. `practiceId` mang sẵn phạm vi bài và
     revision, nên phiên luyện tập sống sót qua cả việc tải lại trang lẫn khởi động lại máy chủ. */

  const GuestScopeSchema = z.object({
    curriculumId: z.enum(['yct', 'hsk']),
    level: z.number().int().positive().max(10),
    lessonIds: z.array(z.string().min(1).max(80)).min(1).max(20),
    kinds: z.array(z.string().min(1).max(40)).min(1).max(12),
    // Thấp hơn mức của lượt học có tài khoản: buổi tự học của trẻ chỉ 5–10 phút, và mỗi lần
    // chấm phải dựng lại cả bộ câu hỏi nên không cho phép bộ quá lớn.
    questionCount: z.number().int().min(1).max(40),
    difficulty: z.enum(['easy', 'medium', 'hard']),
  });
  type GuestScope = z.infer<typeof GuestScopeSchema>;

  const PracticeIdSchema = z.object({ v: z.literal(1), r: z.number().int().nonnegative(), n: z.string().min(1).max(40), s: GuestScopeSchema });

  function encodePracticeId(revision: number, scope: GuestScope): string {
    const payload = { v: 1 as const, r: revision, n: randomUUID(), s: scope };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  function decodePracticeId(practiceId: string): { revision: number; scope: GuestScope } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(practiceId, 'base64url').toString('utf8'));
    } catch {
      throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Buổi luyện tập không còn hợp lệ. Con bắt đầu lại nhé.');
    }
    const r = PracticeIdSchema.safeParse(parsed);
    if (!r.success) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Buổi luyện tập không còn hợp lệ. Con bắt đầu lại nhé.');
    }
    return { revision: r.data.r, scope: r.data.s };
  }

  /** Dựng lại đúng bộ câu hỏi (kèm đáp án) mà `practiceId` mô tả. */
  async function guestQuestions(practiceId: string, revision: number, scope: GuestScope): Promise<QuestionWithKey[]> {
    const items = await publishedItemsAt(revision);
    return generateQuestions({
      items,
      scopeLessonIds: scope.lessonIds as never,
      kinds: scope.kinds as never,
      requestedCount: scope.questionCount,
      difficulty: scope.difficulty,
      // seed CHÍNH là practiceId → cùng practiceId luôn ra cùng bộ câu hỏi
      seed: practiceId,
      allowPriorKnowledgeDistractors: false,
      acceptStatuses: ['published'],
    }).questions;
  }

  app.post('/api/practice/start', async (req) => {
    const scope = GuestScopeSchema.parse(req.body);
    const revision = await headRevision();
    const practiceId = encodePracticeId(revision, scope);

    const items = await publishedItemsAt(revision);
    const res = generateQuestions({
      items,
      scopeLessonIds: scope.lessonIds as never,
      kinds: scope.kinds as never,
      requestedCount: scope.questionCount,
      difficulty: scope.difficulty,
      seed: practiceId,
      allowPriorKnowledgeDistractors: false,
      acceptStatuses: ['published'],
    });
    if (res.questions.length === 0) throw new HttpError(409, ERROR_CODES.EMPTY_BANK);

    return {
      practiceId,
      revision,
      // CHỈ phần câu hỏi — đáp án ở lại máy chủ, giống hệt lượt học có tài khoản
      questions: res.questions.map((k) => k.question),
      reducedNotice: res.reasonVi,
    };
  });

  /* Tải lại trang hoặc mở lại đúng đường dẫn buổi luyện tập: dựng lại nguyên bộ câu hỏi
     từ practiceId. Không cần lưu gì ở máy chủ. */
  app.post('/api/practice/resume', async (req) => {
    const body = z.object({ practiceId: z.string().min(8).max(4000) }).parse(req.body);
    const { revision, scope } = decodePracticeId(body.practiceId);
    const keys = await guestQuestions(body.practiceId, revision, scope);
    if (keys.length === 0) throw new HttpError(409, ERROR_CODES.EMPTY_BANK);
    return {
      practiceId: body.practiceId,
      revision,
      questions: keys.map((k) => k.question),
      reducedNotice: null,
    };
  });

  app.post('/api/practice/answer', async (req) => {
    const body = z
      .object({
        practiceId: z.string().min(8).max(4000),
        questionId: z.string().min(1).max(300),
        response: z.string().max(400),
      })
      .parse(req.body);

    const { revision, scope } = decodePracticeId(body.practiceId);
    const keys = await guestQuestions(body.practiceId, revision, scope);
    const key = keys.find((k) => k.question.questionId === body.questionId);
    if (!key) throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Câu hỏi không thuộc buổi luyện tập này.');

    const { correct } = grade(key, body.response);
    return {
      correct,
      correctOptionId: key.correctOptionId,
      explainVi: key.explainVi,
      reveal: key.revealAfterAnswer,
      duplicate: false,
    };
  });

  app.get('/api/teacher/content', async (req) => {
    teacherOf(req);
    const q = z.object({ curriculum: z.enum(['yct', 'hsk']), level: z.coerce.number().int() }).parse(req.query);
    const revision = await headRevision();
    const items = await itemsAt(revision);
    return items.filter((i) => i.curriculumId === q.curriculum && i.level === q.level);
  });

  app.post('/api/teacher/content/review', async (req) => {
    const u = teacherOf(req);
    const body = z.object({ itemIds: z.array(z.string()).min(1).max(2000) }).parse(req.body);
    const revision = await headRevision();
    const items = await itemsAt(revision);
    const set = new Set(body.itemIds);
    const upsert = items
      .filter((i) => set.has(i.id))
      .map((i) => ({
        ...i,
        status: 'reviewed' as const,
        reviewedBy: u.userId,
        reviewedAt: new Date().toISOString(),
        source: { ...i.source, verificationStatus: 'verified_by_teacher' as const },
      }));
    if (!upsert.length) throw new HttpError(404, ERROR_CODES.NOT_FOUND);
    await publish({ actorId: u.userId, baseRevision: revision, upsert, removeIds: [], note: 'Đánh dấu đã duyệt' });
    return { reviewed: upsert.length };
  });

  const ImportSchema = z.object({
    kind: z.enum(['vocab', 'sentence', 'grammar']),
    text: z.string().max(2 * 1024 * 1024),
    curriculumId: z.enum(['yct', 'hsk']),
    level: z.number().int().positive(),
    mode: z.enum(['merge', 'replace']),
  });

  async function validImport(input: z.infer<typeof ImportSchema>) {
    const cur = await one<{ edition: string }>('SELECT edition FROM curricula WHERE curriculum_id = $1 AND level = $2', [
      input.curriculumId,
      input.level,
    ]);
    if (!cur) throw new HttpError(404, ERROR_CODES.NOT_FOUND);
    const lessons = await query<{ n: number }>('SELECT n FROM lessons WHERE curriculum_id = $1 AND level = $2', [
      input.curriculumId,
      input.level,
    ]);
    return parseImport(input.kind, input.text, {
      curriculumId: input.curriculumId,
      level: input.level,
      edition: cur.edition,
      validLessonNumbers: lessons.map((l) => l.n),
      importedBy: 'server',
    });
  }

  app.post('/api/teacher/import/validate', async (req) => {
    teacherOf(req);
    const body = ImportSchema.parse(req.body);
    const res = await validImport(body);
    const hasError = res.issues.some((i) => i.severity === 'error');
    const revision = await headRevision();
    const current = (await itemsAt(revision)).filter(
      (i) => i.type === body.kind && i.curriculumId === body.curriculumId && i.level === body.level,
    );
    return {
      batch: hasError
        ? null
        : {
            kind: body.kind,
            curriculumId: body.curriculumId,
            level: body.level,
            edition: current[0]?.edition ?? '',
            contentHash: contentHash(body.text),
            schemaVersion: 1,
            validatedAt: new Date().toISOString(),
            baseRevision: revision,
          },
      issues: res.issues,
      rowsRead: res.rowsRead,
      rowsRejected: res.rowsRejected,
      diff: hasError ? null : diffItems(current, res.items, body.mode),
      canPublish: !hasError && res.items.length > 0,
    };
  });

  app.post('/api/teacher/import/publish', async (req) => {
    const u = teacherOf(req);
    const body = z
      .object({ batch: ValidatedBatchSchema, text: z.string().max(2 * 1024 * 1024), mode: z.enum(['merge', 'replace']) })
      .parse(req.body);

    // DATA-02: batch phải khớp CHÍNH văn bản đang xuất bản
    if (body.batch.contentHash !== contentHash(body.text)) {
      throw new HttpError(409, ERROR_CODES.BATCH_STALE);
    }
    // Máy chủ validate lại CHÍNH payload sắp publish, không tin kết quả client gửi
    const res = await validImport({
      kind: body.batch.kind,
      text: body.text,
      curriculumId: body.batch.curriculumId,
      level: body.batch.level,
      mode: body.mode,
    });
    if (res.issues.some((i) => i.severity === 'error')) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Lô dữ liệu có lỗi — không xuất bản.', res.issues.filter((i) => i.severity === 'error').slice(0, 50));
    }

    const revision = await headRevision();
    if (body.batch.baseRevision !== revision) throw new RevisionConflict(revision);

    const upsert: ContentItem[] = res.items.map((i) => ({ ...i, status: 'published' as const }));
    let removeIds: string[] = [];
    if (body.mode === 'replace') {
      const current = await itemsAt(revision);
      const keep = new Set(upsert.map((i) => i.id));
      removeIds = current
        .filter((i) => i.type === body.batch.kind && i.curriculumId === body.batch.curriculumId && i.level === body.batch.level)
        .filter((i) => !keep.has(i.id))
        .map((i) => i.id);
    }

    const r = await publish({
      actorId: u.userId,
      baseRevision: revision,
      upsert,
      removeIds,
      note: `Nhập ${body.batch.kind} (${body.mode})`,
    });
    return { revision: r.revision, publishedCount: upsert.length, at: r.at };
  });

  app.post('/api/teacher/content/rollback', async (req) => {
    const u = teacherOf(req);
    const body = z.object({ toRevision: z.number().int().min(1) }).parse(req.body);
    const r = await rollback(u.userId, body.toRevision);
    const n = await one<{ c: string }>('SELECT count(*)::text AS c FROM content_item_versions WHERE revision = $1', [r.revision]);
    return { revision: r.revision, publishedCount: Number(n?.c ?? 0), at: r.at };
  });

  /* ── giáo viên: lớp & báo cáo ────────────────────────────────────────── */

  app.get('/api/teacher/classrooms', async (req) => {
    const u = teacherOf(req);
    const rows = await query<{ id: string; name: string; students: string }>(
      `SELECT c.id, c.name,
              (SELECT count(*)::text FROM memberships m2 WHERE m2.classroom_id = c.id AND m2.role='student') AS students
         FROM classrooms c
         JOIN memberships m ON m.classroom_id = c.id AND m.user_id = $1 AND m.role = 'teacher'
        ORDER BY c.name`,
      [u.userId],
    );
    if (u.role === 'admin' && rows.length === 0) {
      const all = await query<{ id: string; name: string; students: string }>(
        `SELECT c.id, c.name, (SELECT count(*)::text FROM memberships m2 WHERE m2.classroom_id=c.id AND m2.role='student') AS students FROM classrooms c ORDER BY c.name`,
      );
      return all.map((r) => ({ classroomId: r.id, name: r.name, studentCount: Number(r.students) }));
    }
    return rows.map((r) => ({ classroomId: r.id, name: r.name, studentCount: Number(r.students) }));
  });

  app.post('/api/teacher/classrooms/:classroomId/assignments', async (req) => {
    const u = teacherOf(req);
    const { classroomId } = z.object({ classroomId: z.string().uuid() }).parse(req.params);
    requireClassroom(u, classroomId);
    const cfg = z
      .object({
        lessonIds: z.array(z.string()).min(1),
        kinds: z.array(z.string()).min(1),
        questionCount: z.number().int().min(0).max(500),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        mode: z.enum(['practice', 'assessment']),
        dueAt: z.string().nullable(),
      })
      .parse(req.body);
    const revision = await headRevision();
    // chỉ giao bài dựa trên nội dung ĐÃ XUẤT BẢN
    const items = await itemsAt(revision, { lessonIds: cfg.lessonIds, statuses: ['published'] });
    if (items.length === 0) throw new HttpError(409, ERROR_CODES.EMPTY_BANK);
    const row = await one<{ id: string }>(
      'INSERT INTO assignments (classroom_id, revision, config, due_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [classroomId, revision, JSON.stringify(cfg), cfg.dueAt, u.userId],
    );
    await audit(u.userId, 'assignment.create', `classroom:${classroomId}`, { revision }, req);
    // Xuất bản/giao bài KHÔNG tự gửi email hay tin nhắn cho ai.
    return { assignmentId: row?.id ?? '' };
  });

  app.get('/api/teacher/classrooms/:classroomId/report', async (req) => {
    const u = teacherOf(req);
    const { classroomId } = z.object({ classroomId: z.string().uuid() }).parse(req.params);
    requireClassroom(u, classroomId);
    const students = await query<{ id: string; display_name: string }>(
      `SELECT u.id, u.display_name FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.classroom_id = $1 AND m.role = 'student' ORDER BY u.display_name`,
      [classroomId],
    );
    const out = [];
    for (const s of students) {
      const rows = await query<{ question_id: string; attempt_id: string; try_index: number; correct: boolean; skipped: boolean; kind: string; content_ids: string[] }>(
        `SELECT ae.attempt_id, ae.question_id, ae.try_index, ae.correct, ae.skipped, ae.kind, ae.content_ids
           FROM answer_events ae JOIN attempts a ON a.id = ae.attempt_id
          WHERE a.user_id = $1 AND a.classroom_id = $2`,
        [s.id, classroomId],
      );
      const first = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const k = r.attempt_id + r.question_id;
        const p = first.get(k);
        if (!p || r.try_index < p.try_index) first.set(k, r);
      }
      const obj = [...first.values()].filter((r) => !r.skipped && r.kind !== 'flashcard');
      const last = await one<{ at: Date }>(
        'SELECT max(created_at) AS at FROM attempts WHERE user_id = $1 AND classroom_id = $2',
        [s.id, classroomId],
      );
      out.push({
        studentId: s.id,
        nickname: s.display_name,
        attempts: new Set(rows.map((r) => r.attempt_id)).size,
        firstTryAccuracy: obj.length ? obj.filter((r) => r.correct).length / obj.length : null,
        lastActiveAt: last?.at ? new Date(last.at).toISOString() : null,
        weakContentIds: [...new Set(obj.filter((r) => !r.correct).flatMap((r) => r.content_ids))].slice(0, 20),
      });
    }
    return out;
  });

  /* ── quản trị: tạo tài khoản (không có đăng ký tự do) ────────────────── */

  app.post('/api/admin/users', async (req) => {
    const u = userOf(req);
    if (u.role !== 'admin') throw new HttpError(403, ERROR_CODES.FORBIDDEN);
    const body = z
      .object({
        role: z.enum(['teacher', 'admin']),
        email: z.string().min(3).max(200),
        displayName: z.string().min(1).max(80),
        password: z.string().min(10).max(200),
      })
      .parse(req.body);
    const hash = await hashPassword(body.password);
    const row = await one<{ id: string }>(
      'INSERT INTO users (role, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      [body.role, body.email, body.displayName, hash],
    );
    await audit(u.userId, 'admin.create_user', `user:${row?.id}`, { role: body.role }, req);
    return { userId: row?.id };
  });

  /* ── health ───────────────────────────────────────────────────────────
     /api/health = LIVENESS: chỉ trả lời tiến trình còn sống, KHÔNG chạm cơ sở dữ liệu.
     Render gọi endpoint này định kỳ; nếu nó truy vấn DB thì Neon không bao giờ ngủ được
     và giờ compute miễn phí sẽ bị đốt hết.
     Không trả về cấu hình, phiên bản hay tên máy chủ. */
  app.get('/api/health', async () => ({ ok: true }));

  /* /api/health/db = READINESS: có chạm DB, nhưng kết quả được nhớ tạm để một vòng lặp
     gọi liên tục cũng không đánh thức Neon liên tục. Dùng cho smoke test sau khi deploy. */
  let dbProbe: { at: number; ok: boolean } | null = null;
  const DB_PROBE_TTL_MS = 30_000;
  app.get('/api/health/db', async (_req, reply) => {
    const now = Date.now();
    if (!dbProbe || now - dbProbe.at > DB_PROBE_TTL_MS) {
      let ok = false;
      try {
        await one('SELECT 1');
        ok = true;
      } catch (e) {
        console.error('[health.db]', (e as Error).name);
      }
      dbProbe = { at: now, ok };
    }
    reply.header('cache-control', 'no-store');
    if (!dbProbe.ok) return reply.code(503).send({ ok: false });
    return { ok: true };
  });

  /* ── giao diện đã build (cùng origin với API) ─────────────────────────── */
  const webDist =
    options.webDist === null
      ? null
      : (options.webDist ?? process.env.WEB_DIST_DIR ?? DEFAULT_WEB_DIST);

  const serveWeb = webDist !== null && existsSync(resolve(webDist, 'index.html'));
  if (webDist !== null && !serveWeb) {
    console.warn(`[web] Không thấy bản build giao diện tại ${webDist} — chỉ phục vụ API.`);
  }

  if (serveWeb && webDist) {
    const assetsDir = resolve(webDist, 'assets') + sep;
    // CHỈ thư mục build của web được mở ra ngoài. Không phục vụ repo root, .env,
    // mã nguồn máy chủ, migration hay tài liệu nội bộ.
    await app.register(fastifyStatic, {
      root: resolve(webDist),
      prefix: '/',
      index: ['index.html'],
      // tệp ẩn đặt nhầm vào thư mục build được coi như không tồn tại
      dotfiles: 'ignore',
      cacheControl: false,
      setHeaders(reply, filePath) {
        if (filePath.startsWith(assetsDir) && HASHED_NAME.test(basename(filePath))) {
          // tên tệp đã chứa vân tay nội dung → đổi nội dung là đổi URL
          reply.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          // index.html và mọi tệp không có vân tay: luôn hỏi lại máy chủ
          reply.header('cache-control', 'no-cache');
        }
      },
    });
  }

  /* ── 404 ──────────────────────────────────────────────────────────────
     API không tồn tại → JSON 404. Tệp tĩnh không tồn tại → 404.
     CHỈ điều hướng trang (GET/HEAD, chấp nhận HTML) mới nhận index.html,
     để lỗi API không bao giờ biến thành trang trắng với status 200. */
  app.setNotFoundHandler((req, reply) => {
    const path = pathOf(req);
    const method = req.method.toUpperCase();
    const notFoundJson = () => reply.code(404).type('application/json; charset=utf-8').send(API_404);

    if (isApiPath(path)) return notFoundJson();
    if (!serveWeb) return notFoundJson();
    if (method !== 'GET' && method !== 'HEAD') return notFoundJson();
    if (looksLikeAsset(path)) return notFoundJson();
    if (!acceptsHtml(req)) return notFoundJson();

    reply.header('cache-control', 'no-cache');
    return reply.code(200).sendFile('index.html');
  });

  return app;
}

export { tx };
