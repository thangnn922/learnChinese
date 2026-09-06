import { describe, it, expect } from 'vitest';
import {
  summarizeAttempt,
  nextReview,
  dueNow,
  formatAccuracyVi,
  encouragementVi,
  type GradedAnswerRow,
} from '../progress.js';

const row = (over: Partial<GradedAnswerRow>): GradedAnswerRow => ({
  questionId: 'q1',
  kind: 'vocab_h2m',
  contentIds: ['c1'],
  tryIndex: 1,
  correct: true,
  skipped: false,
  ...over,
});

describe('EDU-03 — điểm lần đầu và tự đánh giá', () => {
  it('sai lần đầu rồi thử lại đúng: điểm lần đầu KHÔNG bị sửa', () => {
    const s = summarizeAttempt(
      'a1',
      'practice',
      [
        row({ questionId: 'q1', tryIndex: 1, correct: false }),
        row({ questionId: 'q1', tryIndex: 2, correct: true }),
        row({ questionId: 'q2', tryIndex: 1, correct: true, contentIds: ['c2'] }),
      ],
      [],
    );
    expect(s.answeredObjective).toBe(2);
    expect(s.firstTryCorrect).toBe(1);
    expect(s.firstTryAccuracy).toBe(0.5);
    expect(s.wrongContentIds).toEqual(['c1']);
  });

  it('thẻ nhớ tự đánh giá KHÔNG vào mẫu số độ chính xác', () => {
    const s = summarizeAttempt(
      'a1',
      'practice',
      [
        row({ questionId: 'q1', correct: true }),
        row({ questionId: 'q2', kind: 'flashcard', correct: false, contentIds: ['c9'] }),
      ],
      [
        { contentId: 'c9', remembered: true },
        { contentId: 'c8', remembered: false },
      ],
    );
    expect(s.answeredObjective).toBe(1);
    expect(s.firstTryAccuracy).toBe(1);
    expect(s.selfReportTotal).toBe(2);
    expect(s.selfReportRemembered).toBe(1);
    expect(s.wrongContentIds).not.toContain('c9');
  });

  it('câu bỏ qua đếm riêng, không vào tử số lẫn mẫu số', () => {
    const s = summarizeAttempt(
      'a1',
      'assessment',
      [row({ questionId: 'q1', correct: true }), row({ questionId: 'q2', skipped: true, correct: false })],
      [],
    );
    expect(s.answeredObjective).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.firstTryAccuracy).toBe(1);
  });

  it('chưa có câu nào được chấm → null, không chia cho 0', () => {
    const s = summarizeAttempt('a1', 'practice', [], []);
    expect(s.firstTryAccuracy).toBeNull();
    expect(formatAccuracyVi(s.firstTryAccuracy)).toBe('Chưa có dữ liệu');
    expect(Number.isNaN(s.firstTryAccuracy as unknown as number)).toBe(false);
  });

  it('lời khích lệ không nhắc chuỗi ngày, không xếp hạng', () => {
    const s = summarizeAttempt('a1', 'practice', [row({ correct: true })], []);
    const msg = encouragementVi(s);
    expect(msg).not.toMatch(/chuỗi|xếp hạng|hạng|streak/i);
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('lịch ôn lại 1/3/7 ngày', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');

  it('sai → ôn lại sau 1 ngày; đúng liên tiếp → 3 rồi 7 ngày', () => {
    let st = { contentId: 'c1', step: -1, dueAt: null as string | null, lastResult: null as null };
    const s1 = nextReview(st, false, now);
    expect(s1.dueAt).toBe('2026-09-07T00:00:00.000Z');
    const s2 = nextReview(s1, true, new Date('2026-09-07T00:00:00.000Z'));
    expect(s2.dueAt).toBe('2026-09-10T00:00:00.000Z');
    const s3 = nextReview(s2, true, new Date('2026-09-10T00:00:00.000Z'));
    expect(s3.dueAt).toBe('2026-09-17T00:00:00.000Z');
    const s4 = nextReview(s3, false, new Date('2026-09-17T00:00:00.000Z'));
    expect(s4.step).toBe(0);
  });

  it('dueNow chỉ lấy mục đã đến hạn', () => {
    const list = [
      { contentId: 'a', step: 0, dueAt: '2026-09-05T00:00:00.000Z', lastResult: 'wrong' as const },
      { contentId: 'b', step: 1, dueAt: '2026-09-09T00:00:00.000Z', lastResult: 'correct' as const },
      { contentId: 'c', step: -1, dueAt: null, lastResult: null },
    ];
    expect(dueNow(list, now).map((s) => s.contentId)).toEqual(['a']);
  });
});
