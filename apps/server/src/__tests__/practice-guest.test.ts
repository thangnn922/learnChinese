/**
 * Luyện tập và trò chơi cho khách chưa đăng nhập.
 *
 * Ba điều phải giữ, vì địa chỉ này công khai trên Internet:
 *  1. Không ghi bất cứ dòng nào vào cơ sở dữ liệu.
 *  2. Đáp án không rời khỏi máy chủ — máy chủ vẫn là nơi chấm.
 *  3. Chỉ nội dung ĐÃ XUẤT BẢN mới lộ ra; nội dung nháp thì không.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { migrate } from '../migrate.js';
import { seed } from '../seed.js';
import { publishAll } from '../publish-all.js';
import { clearPublishedCache } from '../content.js';
import { closePool, one, query } from '../db.js';

let app: FastifyInstance;

const SCOPE = {
  curriculumId: 'yct' as const,
  level: 1,
  lessonIds: ['yct1-l1', 'yct1-l2'],
  kinds: ['vocab_h2m'],
  questionCount: 5,
  difficulty: 'easy' as const,
};

async function countRows(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['attempts', 'answer_events', 'users', 'sessions', 'review_states', 'audit_events']) {
    const r = await one<{ c: string }>(`SELECT count(*)::text AS c FROM ${t}`);
    out[t] = Number(r?.c ?? 0);
  }
  return out;
}

beforeAll(async () => {
  await migrate(() => undefined);
  app = await buildApp({ webDist: null });
  await app.ready();
});

beforeEach(async () => {
  await query(
    `TRUNCATE audit_events, answer_events, self_reports, review_states, attempts, assignments,
             memberships, classrooms, sessions, login_throttle, users,
             content_item_versions, content_revisions, content_head, lessons, curricula CASCADE`,
  );
  clearPublishedCache();
  await seed({ quiet: true });
});

afterAll(async () => {
  await app.close();
  await closePool();
});

const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as never });

describe('luyện tập ẩn danh', () => {
  it('chưa có nội dung xuất bản thì báo rõ, không lộ nội dung nháp', async () => {
    const r = await post('/api/practice/start', SCOPE);
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).code).toBe('EMPTY_BANK');
    expect(r.body).not.toContain('你好');
  });

  it('không đăng nhập vẫn bắt đầu luyện tập được', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const r = await post('/api/practice/start', SCOPE);
    expect(r.statusCode).toBe(200);
    const b = JSON.parse(r.body) as { practiceId: string; questions: unknown[] };
    expect(b.questions.length).toBe(5);
    expect(b.practiceId.length).toBeGreaterThan(10);
    // không cấp phiên, không đặt cookie nào
    expect(r.cookies.length).toBe(0);
  });

  it('KHÔNG gửi đáp án về cho trình duyệt', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const r = await post('/api/practice/start', SCOPE);
    const raw = r.body;
    for (const leak of ['correctOptionId', 'acceptedAnswers', 'revealAfterAnswer', 'explainVi']) {
      expect(raw, `rò rỉ ${leak}`).not.toContain(leak);
    }
  });

  it('máy chủ chấm điểm: đáp án đúng và sai được phân biệt, kèm phần hé lộ', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const start = JSON.parse((await post('/api/practice/start', SCOPE)).body) as {
      practiceId: string;
      questions: { questionId: string; options: { id: string }[] }[];
    };
    const q = start.questions[0]!;

    const results = await Promise.all(
      q.options.map(async (o) => {
        const r = await post('/api/practice/answer', {
          practiceId: start.practiceId,
          questionId: q.questionId,
          response: o.id,
        });
        expect(r.statusCode).toBe(200);
        return JSON.parse(r.body) as { correct: boolean; correctOptionId: string; reveal: unknown };
      }),
    );
    // đúng một phương án đúng
    expect(results.filter((x) => x.correct).length).toBe(1);
    expect(results.every((x) => x.reveal !== undefined)).toBe(true);
  });

  it('dựng lại đúng bộ câu hỏi: cùng practiceId luôn ra cùng câu hỏi', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const a = JSON.parse((await post('/api/practice/start', SCOPE)).body) as {
      practiceId: string;
      questions: { questionId: string }[];
    };
    // chấm câu CUỐI trước: chỉ đúng nếu máy chủ dựng lại được nguyên bộ, không phải chỉ câu đầu
    const last = a.questions[a.questions.length - 1]!;
    const r = await post('/api/practice/answer', {
      practiceId: a.practiceId,
      questionId: last.questionId,
      response: '',
    });
    expect(r.statusCode).toBe(200);
  });

  it('hai buổi luyện tập khác nhau ra bộ câu hỏi khác nhau', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const a = JSON.parse((await post('/api/practice/start', SCOPE)).body) as { practiceId: string };
    const b = JSON.parse((await post('/api/practice/start', SCOPE)).body) as { practiceId: string };
    expect(a.practiceId).not.toBe(b.practiceId);
  });

  it('practiceId bịa hoặc hỏng bị từ chối bằng thông báo cho trẻ hiểu', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    for (const bad of ['khong-phai-base64!!!', Buffer.from('{"v":9}').toString('base64url')]) {
      const r = await post('/api/practice/answer', { practiceId: bad, questionId: 'x', response: 'y' });
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).messageVi).toContain('bắt đầu lại');
    }
  });

  it('câu hỏi không thuộc buổi luyện tập bị từ chối', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const a = JSON.parse((await post('/api/practice/start', SCOPE)).body) as { practiceId: string };
    const r = await post('/api/practice/answer', {
      practiceId: a.practiceId,
      questionId: 'vocab_h2m:khong-co-that:0000',
      response: 'x',
    });
    expect(r.statusCode).toBe(400);
  });

  it('KHÔNG ghi bất cứ dòng nào vào cơ sở dữ liệu', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    const before = await countRows();

    const start = JSON.parse((await post('/api/practice/start', SCOPE)).body) as {
      practiceId: string;
      questions: { questionId: string; options: { id: string }[] }[];
    };
    for (const q of start.questions) {
      await post('/api/practice/answer', {
        practiceId: start.practiceId,
        questionId: q.questionId,
        response: q.options[0]?.id ?? '',
      });
    }

    expect(await countRows()).toEqual(before);
  });
});

describe('trò chơi ẩn danh', () => {
  it('chơi được khi chưa đăng nhập', async () => {
    await publishAll({ actorEmail: 'giaovien@example.local' });
    clearPublishedCache();
    for (const kind of ['match', 'order']) {
      const r = await app.inject({ method: 'GET', url: `/api/games/${kind}?lessons=yct1-l1,yct1-l2` });
      expect(r.statusCode, kind).toBe(200);
      expect(r.body, kind).not.toBe('null');
    }
  });

  it('không chọn bài thì trả null chứ không lỗi', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/games/match' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('null');
  });
});

describe('ranh giới quyền vẫn nguyên', () => {
  it('khách vẫn KHÔNG chạm được dữ liệu học sinh hay khu vực giáo viên', async () => {
    for (const url of ['/api/progress', '/api/teacher/classrooms', '/api/attempts/resumable']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(401);
    }
  });

  it('khách không tạo được lượt học có lưu tiến độ', async () => {
    const r = await post('/api/attempts', { ...SCOPE, mode: 'practice' });
    expect(r.statusCode).toBe(401);
  });
});
