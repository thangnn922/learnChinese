/**
 * Bản DEMO — mọi thứ chạy trên thiết bị này.
 *
 * Bản demo mô phỏng đúng LUỒNG của bản server (khoá revision cho lượt học, chấm ở "server",
 * ghi idempotent, publish nguyên khối) để giao diện không phải biết mình chạy chế độ nào.
 * Nhưng nó KHÔNG phải môi trường thật: không có phân quyền giữa hai người dùng,
 * không đồng bộ giữa hai thiết bị. Giao diện luôn hiển thị nhãn "Dữ liệu trên thiết bị này".
 */
import {
  ContentItemSchema,
  CurriculumSchema,
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
  type AssignmentConfig,
  type AttemptSummary,
  type ContentItem,
  type ContentType,
  type Curriculum,
  type GradedAnswerRow,
  type LessonId,
  type Question,
  type QuestionWithKey,
  type ReviewState,
  type ValidatedBatch,
} from '@yct/shared';
import { getDemoStore, type DemoStore } from './store';
import type {
  AnswerResult,
  AttemptView,
  CatalogView,
  ClassroomView,
  ImportPreview,
  LearnApi,
  LessonStatus,
  ProgressView,
  PublishResult,
  SessionUser,
  StartAttemptInput,
  StudentReportRow,
} from '../types';

/**
 * Nội dung được nạp CHẬM (dynamic import) — không nằm trong gói JS đầu tiên,
 * để mở trang không phải tải toàn bộ ngân hàng câu hỏi.
 */
let contentPromise: Promise<{ curricula: Curriculum[]; items: ContentItem[] }> | null = null;

async function loadSeedContent(): Promise<{ curricula: Curriculum[]; items: ContentItem[] }> {
  if (!contentPromise) {
    contentPromise = (async () => {
      const [yctItems, yctCur, hskItems, hskCur] = await Promise.all([
        import('../../../../../content/yct1/items.json'),
        import('../../../../../content/yct1/curriculum.json'),
        import('../../../../../content/hsk1/items.json'),
        import('../../../../../content/hsk1/curriculum.json'),
      ]);
      return {
        curricula: [CurriculumSchema.parse(yctCur.default), CurriculumSchema.parse(hskCur.default)],
        items: [...(yctItems.default as unknown[]), ...(hskItems.default as unknown[])].map((r) =>
          ContentItemSchema.parse(r),
        ),
      };
    })();
  }
  return contentPromise;
}

interface StoredAttempt {
  attemptId: string;
  revision: number;
  mode: 'practice' | 'assessment';
  keys: QuestionWithKey[];
  cursor: number;
  createdAt: string;
  finishedAt: string | null;
  reducedNotice: string | null;
  label: string;
}

interface StoredAnswer extends GradedAnswerRow {
  attemptId: string;
  idempotencyKey: string;
  at: string;
  activeMs: number;
  assistanceUsed: string[];
}

const CONTENT_KEY = 'items';
const REVISION_KEY = 'revision';
const USER_KEY = 'user';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  const b = new Uint8Array(9);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint8Array) => a } as Crypto)).getRandomValues(b);
  return prefix + '_' + Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export class DemoApi implements LearnApi {
  readonly mode = 'demo' as const;
  private store: DemoStore | null = null;

  private async db(): Promise<DemoStore> {
    if (!this.store) {
      this.store = await getDemoStore();
      await this.seed();
    }
    return this.store;
  }

  /**
   * Bản demo publish sẵn nội dung ĐÃ ĐÁNH DẤU LÀ NHÁP để trẻ thử được ngay.
   * `status` chuyển sang published nhưng `verificationStatus` giữ nguyên
   * needs_teacher_check / unverified_no_source — giao diện hiển thị cảnh báo.
   * HSK (unverified_no_source) KHÔNG được publish trong demo.
   */
  private async seed(): Promise<void> {
    const s = this.store!;
    const existing = await s.get<ContentItem[]>('content', CONTENT_KEY);
    if (existing && existing.length) return;
    const { items } = await loadSeedContent();
    const seeded = items.map((i) =>
      i.source.verificationStatus === 'unverified_no_source' ? i : { ...i, status: 'published' as const },
    );
    await s.put('content', CONTENT_KEY, seeded);
    await s.put('meta', REVISION_KEY, 1);
    await s.put('revisions', '1', { revision: 1, at: nowIso(), items: seeded });
  }

  private async items(): Promise<ContentItem[]> {
    const s = await this.db();
    return (await s.get<ContentItem[]>('content', CONTENT_KEY)) ?? [];
  }

  private async revision(): Promise<number> {
    const s = await this.db();
    return (await s.get<number>('meta', REVISION_KEY)) ?? 1;
  }

  /* ── phiên ───────────────────────────────────────────────────────────── */

  async me(): Promise<SessionUser | null> {
    const s = await this.db();
    return (await s.get<SessionUser>('meta', USER_KEY)) ?? null;
  }

  async loginTeacher(): Promise<SessionUser> {
    throw new Error(
      'Bản demo trên thiết bị này không có tài khoản giáo viên thật. ' +
        'Hãy chạy bản có máy chủ để đăng nhập và quản lý lớp.',
    );
  }

  async loginStudent(_classCode: string, nickname: string): Promise<SessionUser> {
    const s = await this.db();
    const user: SessionUser = {
      userId: 'demo-student',
      displayName: nickname || 'Bạn nhỏ',
      role: 'student',
      classroomIds: [],
    };
    await s.put('meta', USER_KEY, user);
    return user;
  }

  async logout(): Promise<void> {
    const s = await this.db();
    await s.put('meta', USER_KEY, null);
  }

  /* ── nội dung ────────────────────────────────────────────────────────── */

  async listCurricula() {
    const { curricula } = await loadSeedContent();
    return curricula.map((c) => ({
      curriculumId: c.curriculumId,
      level: c.level,
      nameVi: c.nameVi,
      sourceVerified: c.sourceVerified,
    }));
  }

  async getCatalog(curriculumId: 'yct' | 'hsk', level: number): Promise<CatalogView> {
    const { curricula } = await loadSeedContent();
    const cur = curricula.find((c) => c.curriculumId === curriculumId && c.level === level);
    if (!cur) throw new Error('Chưa có chương trình này.');
    const items = await this.items();
    const lessons: LessonStatus[] = cur.lessons.map((l) => {
      const mine = items.filter((i) => i.lessonId === l.lessonId);
      const published = mine.filter((i) => i.status === 'published').length;
      return {
        lessonId: l.lessonId,
        n: l.n,
        titleVi: l.titleVi,
        titleZh: l.titleZh,
        titlePinyin: l.titlePinyin,
        goalsVi: l.goalsVi,
        publishedItems: published,
        draftItems: mine.filter((i) => i.status === 'draft').length,
        ready: published >= 2,
      };
    });
    return {
      curriculum: cur,
      lessons,
      revision: await this.revision(),
      emptyPublished: lessons.every((l) => l.publishedItems === 0),
      noteVi: cur.noteVi,
    };
  }

  /* ── lượt học ────────────────────────────────────────────────────────── */

  async startAttempt(input: StartAttemptInput): Promise<AttemptView> {
    const s = await this.db();
    const items = await this.items();
    const revision = await this.revision();
    const attemptId = uid('at');
    const res = generateQuestions({
      items,
      scopeLessonIds: input.lessonIds,
      kinds: input.kinds,
      requestedCount: input.questionCount,
      difficulty: input.difficulty,
      seed: attemptSeed(attemptId, revision),
      allowPriorKnowledgeDistractors: false,
      acceptStatuses: ['published'],
    });
    if (res.questions.length === 0) {
      throw Object.assign(new Error('Chưa có bài học nào được duyệt cho phạm vi này.'), {
        code: 'EMPTY_BANK',
      });
    }
    const stored: StoredAttempt = {
      attemptId,
      revision,
      mode: input.mode,
      keys: res.questions,
      cursor: 0,
      createdAt: nowIso(),
      finishedAt: null,
      reducedNotice: res.reasonVi,
      label: input.lessonIds.length === 1 ? `Bài ${input.lessonIds[0]?.split('-l')[1]}` : `${input.lessonIds.length} bài`,
    };
    await s.put('attempts', attemptId, stored);
    return this.toView(stored, []);
  }

  private toView(a: StoredAttempt, answered: string[]): AttemptView {
    return {
      attemptId: a.attemptId,
      revision: a.revision,
      mode: a.mode,
      questions: a.keys.map((k) => k.question satisfies Question),
      cursor: a.cursor,
      answeredQuestionIds: answered,
      reducedNotice: a.reducedNotice,
      createdAt: a.createdAt,
      finishedAt: a.finishedAt,
    };
  }

  async resumeAttempt(attemptId: string): Promise<AttemptView> {
    const s = await this.db();
    const a = await s.get<StoredAttempt>('attempts', attemptId);
    if (!a) throw new Error('Không tìm thấy lượt học.');
    const answers = await this.answersOf(attemptId);
    return this.toView(a, [...new Set(answers.map((x) => x.questionId))]);
  }

  async findResumableAttempt(): Promise<{ attemptId: string; label: string } | null> {
    const s = await this.db();
    const all = await s.all<StoredAttempt>('attempts');
    const open = all
      .map((x) => x.value)
      .filter((a) => a && !a.finishedAt)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const a = open[0];
    return a ? { attemptId: a.attemptId, label: a.label } : null;
  }

  private async answersOf(attemptId: string): Promise<StoredAnswer[]> {
    const s = await this.db();
    const all = await s.all<StoredAnswer>('answers');
    return all.map((x) => x.value).filter((v) => v && v.attemptId === attemptId);
  }

  async submitAnswer(input: {
    attemptId: string;
    questionId: string;
    response: string;
    tryIndex: number;
    assistanceUsed: string[];
    activeMs: number;
    idempotencyKey: string;
  }): Promise<AnswerResult> {
    const s = await this.db();
    const a = await s.get<StoredAttempt>('attempts', input.attemptId);
    if (!a) throw new Error('Không tìm thấy lượt học.');
    const key = a.keys.find((k) => k.question.questionId === input.questionId);
    if (!key) throw new Error('Câu hỏi không thuộc lượt học này.');

    const existing = await s.get<StoredAnswer>('answers', input.idempotencyKey);
    if (existing) {
      return {
        correct: existing.correct,
        correctOptionId: key.correctOptionId,
        explainVi: key.explainVi,
        reveal: key.revealAfterAnswer,
        duplicate: true,
      };
    }

    // Chấm ở "server": client chỉ gửi lựa chọn, không gửi điểm.
    const { correct } = grade(key, input.response);
    const row: StoredAnswer = {
      attemptId: input.attemptId,
      idempotencyKey: input.idempotencyKey,
      questionId: input.questionId,
      kind: key.question.kind,
      contentIds: key.question.refContentIds,
      tryIndex: input.tryIndex,
      correct,
      skipped: input.response === '',
      at: nowIso(),
      activeMs: input.activeMs,
      assistanceUsed: input.assistanceUsed,
    };
    await s.put('answers', input.idempotencyKey, row);

    if (input.tryIndex === 1 && !row.skipped) {
      for (const cid of row.contentIds) await this.updateReview(cid, correct);
    }
    a.cursor = Math.max(a.cursor, a.keys.findIndex((k) => k.question.questionId === input.questionId) + 1);
    await s.put('attempts', a.attemptId, a);

    return {
      correct,
      correctOptionId: key.correctOptionId,
      explainVi: key.explainVi,
      reveal: key.revealAfterAnswer,
      duplicate: false,
    };
  }

  private async updateReview(contentId: string, correct: boolean): Promise<void> {
    const s = await this.db();
    const prev =
      (await s.get<ReviewState>('review', contentId)) ??
      ({ contentId, step: -1, dueAt: null, lastResult: null } as ReviewState);
    await s.put('review', contentId, nextReview(prev, correct, new Date()));
  }

  async submitSelfReport(input: {
    attemptId: string;
    contentId: string;
    remembered: boolean;
    idempotencyKey: string;
  }): Promise<{ duplicate: boolean }> {
    const s = await this.db();
    if (await s.get('selfReports', input.idempotencyKey)) return { duplicate: true };
    await s.put('selfReports', input.idempotencyKey, { ...input, at: nowIso() });
    return { duplicate: false };
  }

  async finishAttempt(attemptId: string): Promise<AttemptSummary> {
    const s = await this.db();
    const a = await s.get<StoredAttempt>('attempts', attemptId);
    if (!a) throw new Error('Không tìm thấy lượt học.');
    if (!a.finishedAt) {
      a.finishedAt = nowIso();
      await s.put('attempts', attemptId, a);
    }
    return this.getAttemptSummary(attemptId);
  }

  async getAttemptSummary(attemptId: string): Promise<AttemptSummary> {
    const s = await this.db();
    const a = await s.get<StoredAttempt>('attempts', attemptId);
    if (!a) throw new Error('Không tìm thấy lượt học.');
    const answers = await this.answersOf(attemptId);
    const reports = (await s.all<{ attemptId: string; contentId: string; remembered: boolean }>('selfReports'))
      .map((x) => x.value)
      .filter((v) => v && v.attemptId === attemptId)
      .map((v) => ({ contentId: v.contentId, remembered: v.remembered }));
    return summarizeAttempt(attemptId, a.mode, answers, reports);
  }

  async getProgress(): Promise<ProgressView> {
    const s = await this.db();
    const items = await this.items();
    const answers = (await s.all<StoredAnswer>('answers')).map((x) => x.value).filter(Boolean);
    const attempts = (await s.all<StoredAttempt>('attempts')).map((x) => x.value).filter(Boolean);

    const firstByQ = new Map<string, StoredAnswer>();
    for (const a of answers) {
      const p = firstByQ.get(a.attemptId + a.questionId);
      if (!p || a.tryIndex < p.tryIndex) firstByQ.set(a.attemptId + a.questionId, a);
    }
    const objective = [...firstByQ.values()].filter((a) => !a.skipped && a.kind !== 'flashcard');
    const correct = objective.filter((a) => a.correct).length;

    const reviews = (await s.all<ReviewState>('review')).map((x) => x.value).filter(Boolean);
    const now = Date.now();
    const due = reviews
      .filter((r) => r.dueAt && new Date(r.dueAt).getTime() <= now)
      .map((r) => items.find((i) => i.id === r.contentId))
      .filter((i): i is ContentItem => Boolean(i))
      .slice(0, 30)
      .map((i) => ({ contentId: i.id, hanzi: i.hanzi, pinyin: i.pinyin, meaningVi: i.meaningVi }));

    const recent = await Promise.all(
      attempts
        .filter((a) => a.finishedAt)
        .sort((x, y) => (y.finishedAt ?? '').localeCompare(x.finishedAt ?? ''))
        .slice(0, 5)
        .map(async (a) => ({
          attemptId: a.attemptId,
          at: a.finishedAt as string,
          summary: await this.getAttemptSummary(a.attemptId),
        })),
    );

    return {
      totalAnswered: objective.length,
      firstTryAccuracy: objective.length === 0 ? null : correct / objective.length,
      dueForReview: due,
      recentAttempts: recent,
    };
  }

  async getGameData(kind: 'match' | 'order', lessonIds: LessonId[]): Promise<unknown | null> {
    const items = await this.items();
    const seed = `${kind}:${lessonIds.join(',')}:${Math.floor(Date.now() / 60000)}`;
    return kind === 'match' ? buildMatchGame(items, lessonIds, seed) : buildOrderGame(items, lessonIds, seed);
  }

  /* ── giáo viên (bản demo: chỉ nháp trên thiết bị này) ─────────────────── */

  async teacherListDraft(curriculumId: 'yct' | 'hsk', level: number): Promise<ContentItem[]> {
    const items = await this.items();
    return items.filter((i) => i.curriculumId === curriculumId && i.level === level);
  }

  async teacherValidateImport(
    kind: ContentType,
    text: string,
    curriculumId: 'yct' | 'hsk',
    level: number,
    mode: 'merge' | 'replace',
  ): Promise<ImportPreview> {
    const { curricula } = await loadSeedContent();
    const cur = curricula.find((c) => c.curriculumId === curriculumId && c.level === level);
    const res = parseImport(kind, text, {
      curriculumId,
      level,
      edition: cur?.edition ?? 'unknown',
      validLessonNumbers: cur?.lessons.map((l) => l.n) ?? [],
      importedBy: 'demo',
    });
    const hasError = res.issues.some((i) => i.severity === 'error');
    const current = (await this.items()).filter(
      (i) => i.type === kind && i.curriculumId === curriculumId && i.level === level,
    );
    return {
      batch: hasError
        ? null
        : {
            kind,
            curriculumId,
            level,
            edition: cur?.edition ?? 'unknown',
            contentHash: contentHash(text),
            schemaVersion: 1,
            validatedAt: nowIso(),
            baseRevision: await this.revision(),
          },
      issues: res.issues,
      rowsRead: res.rowsRead,
      rowsRejected: res.rowsRejected,
      diff: hasError ? null : diffItems(current, res.items, mode),
      canPublish: !hasError && res.items.length > 0,
    };
  }

  async teacherPublish(batch: ValidatedBatch, text: string, mode: 'merge' | 'replace'): Promise<PublishResult> {
    const s = await this.db();
    const current = await this.items();
    const revision = await this.revision();
    if (batch.baseRevision !== revision) {
      throw Object.assign(new Error('Có phiên bản mới hơn. Hãy tải lại và đối chiếu.'), {
        code: 'REVISION_CONFLICT',
      });
    }
    if (batch.contentHash !== contentHash(text)) {
      throw Object.assign(new Error('Nội dung đã thay đổi sau lần kiểm tra. Hãy bấm “Kiểm tra” lại.'), {
        code: 'BATCH_STALE',
      });
    }
    const { curricula } = await loadSeedContent();
    const cur = curricula.find((c) => c.curriculumId === batch.curriculumId && c.level === batch.level);
    const parsed = parseImport(batch.kind, text, {
      curriculumId: batch.curriculumId,
      level: batch.level,
      edition: batch.edition,
      validLessonNumbers: cur?.lessons.map((l) => l.n) ?? [],
      importedBy: 'demo',
    });
    if (parsed.issues.some((i) => i.severity === 'error')) {
      throw Object.assign(new Error('Lô dữ liệu có lỗi — không xuất bản.'), { code: 'VALIDATION_FAILED' });
    }

    const scopeOf = (i: ContentItem) =>
      i.type === batch.kind && i.curriculumId === batch.curriculumId && i.level === batch.level;
    const byId = new Map(current.map((i) => [i.id, i]));
    for (const it of parsed.items) byId.set(it.id, { ...it, status: 'published' });
    let next = [...byId.values()];
    if (mode === 'replace') {
      const keepIds = new Set(parsed.items.map((i) => i.id));
      next = next.filter((i) => !scopeOf(i) || keepIds.has(i.id));
    }

    // "atomic": chỉ khi tất cả các bước dưới thành công mới nâng revision
    const newRevision = revision + 1;
    await s.put('revisions', String(newRevision), { revision: newRevision, at: nowIso(), items: next });
    await s.put('content', CONTENT_KEY, next);
    await s.put('meta', REVISION_KEY, newRevision);
    return { revision: newRevision, publishedCount: parsed.items.length, at: nowIso() };
  }

  async teacherReview(itemIds: string[]): Promise<{ reviewed: number }> {
    const s = await this.db();
    const items = await this.items();
    const set = new Set(itemIds);
    const next = items.map((i) =>
      set.has(i.id)
        ? {
            ...i,
            status: 'reviewed' as const,
            reviewedBy: 'demo (không phải người duyệt thật)',
            reviewedAt: nowIso(),
          }
        : i,
    );
    await s.put('content', CONTENT_KEY, next);
    return { reviewed: itemIds.length };
  }

  async teacherRollback(toRevision: number): Promise<PublishResult> {
    const s = await this.db();
    const snap = await s.get<{ revision: number; items: ContentItem[] }>('revisions', String(toRevision));
    if (!snap) throw new Error('Không tìm thấy phiên bản đó.');
    const newRevision = (await this.revision()) + 1;
    await s.put('revisions', String(newRevision), { revision: newRevision, at: nowIso(), items: snap.items });
    await s.put('content', CONTENT_KEY, snap.items);
    await s.put('meta', REVISION_KEY, newRevision);
    return { revision: newRevision, publishedCount: snap.items.length, at: nowIso() };
  }

  async teacherListClassrooms(): Promise<ClassroomView[]> {
    return [];
  }

  async teacherCreateAssignment(_c: string, _cfg: AssignmentConfig): Promise<{ assignmentId: string }> {
    throw new Error('Bản demo không giao bài cho lớp được. Cần bản có máy chủ.');
  }

  async teacherReport(): Promise<StudentReportRow[]> {
    return [];
  }
}
