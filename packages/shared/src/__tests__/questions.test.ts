import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateQuestions,
  assistanceFor,
  isUsableDistractor,
  grade,
} from '../questions.js';
import { ContentItemSchema, type ContentItem, type LessonId } from '../domain.js';

const raw = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../content/yct1/items.json'), 'utf8'),
) as unknown[];

/** Nội dung thật của YCT 1, nâng lên "published" để kiểm thử bộ sinh câu hỏi. */
const ITEMS: ContentItem[] = raw.map((r) =>
  ContentItemSchema.parse({ ...(r as object), status: 'published' }),
);

const L = (n: number) => `yct1-l${n}` as LessonId;

describe('EDU-01 — phạm vi bài', () => {
  it('100 lượt sinh với seed ghi lại: không có mục nào ngoài bài 1', () => {
    const scope = [L(1)];
    let outOfScope = 0;
    let totalQuestions = 0;
    for (let i = 0; i < 100; i++) {
      const seed = `EDU-01/run-${i}`;
      const res = generateQuestions({
        items: ITEMS,
        scopeLessonIds: scope,
        kinds: ['vocab_h2m', 'vocab_m2h', 'vocab_p2m', 'vocab_pic', 'listen_pick', 'grammar_fill'],
        requestedCount: 10,
        difficulty: 'easy',
        seed,
        allowPriorKnowledgeDistractors: false,
      });
      outOfScope += res.outOfScopeCount;
      totalQuestions += res.questions.length;
      for (const q of res.questions) {
        expect(q.question.lessonId, `seed=${seed}`).toBe('yct1-l1');
        for (const id of q.question.refContentIds) {
          const item = ITEMS.find((x) => x.id === id)!;
          expect(item.lessonId, `seed=${seed} item=${id}`).toBe('yct1-l1');
        }
      }
    }
    expect(outOfScope).toBe(0);
    expect(totalQuestions).toBeGreaterThan(0);
  });

  it('không lẫn nội dung HSK: mọi lessonId đều bắt đầu bằng yct1', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(1), L(2), L(3)],
      kinds: ['vocab_h2m'],
      requestedCount: 0,
      difficulty: 'easy',
      seed: 'EDU-01/mix',
      allowPriorKnowledgeDistractors: false,
    });
    for (const q of res.questions) expect(q.question.lessonId.startsWith('yct1-')).toBe(true);
  });

  it('cùng seed → cùng đề (tái hiện được)', () => {
    const opts = {
      items: ITEMS,
      scopeLessonIds: [L(4)],
      kinds: ['vocab_h2m' as const],
      requestedCount: 5,
      difficulty: 'medium' as const,
      seed: 'repro-1',
      allowPriorKnowledgeDistractors: false,
    };
    const a = generateQuestions(opts);
    const b = generateQuestions(opts);
    expect(a.questions.map((q) => q.question.questionId)).toEqual(
      b.questions.map((q) => q.question.questionId),
    );
  });
});

describe('EDU-02 — thiếu phương án / nghĩa tương đương', () => {
  const mk = (over: Partial<ContentItem>): ContentItem =>
    ContentItemSchema.parse({
      id: 'x',
      schemaVersion: 1,
      type: 'vocab',
      curriculumId: 'yct',
      level: 1,
      edition: 'test',
      lessonId: 'yct1-l1',
      hanzi: '一',
      pinyin: 'yī',
      meaningVi: 'số một',
      origin: 'textbook',
      meaningOrigin: 'ai_draft',
      source: {
        fileName: 't',
        pdfPage: null,
        printedPage: null,
        section: 't',
        verificationStatus: 'needs_teacher_check',
      },
      status: 'published',
      ...over,
    });

  it('không dùng mục cùng pinyin làm nhiễu khi đề bài là pinyin (他 / 她)', () => {
    const ta1 = mk({ id: 'a', hanzi: '他', pinyin: 'tā', meaningVi: 'bạn ấy (con trai)' });
    const ta2 = mk({ id: 'b', hanzi: '她', pinyin: 'tā', meaningVi: 'bạn ấy (con gái)' });
    expect(isUsableDistractor(ta1, ta2, 'meaningVi', true)).toBe(false);
    // khi đề bài là chữ Hán thì phân biệt được, vẫn dùng làm nhiễu
    expect(isUsableDistractor(ta1, ta2, 'meaningVi', false)).toBe(true);
  });

  it('không dùng mục trùng nghĩa làm nhiễu (học / học)', () => {
    const a = mk({ id: 'a', hanzi: '学', pinyin: 'xué', meaningVi: 'học' });
    const b = mk({ id: 'b', hanzi: '学习', pinyin: 'xuéxí', meaningVi: 'học' });
    expect(isUsableDistractor(a, b, 'meaningVi', false)).toBe(false);
  });

  it('chỉ có 2 từ trong phạm vi → tạo câu 2 lựa chọn, không bao giờ 1 lựa chọn', () => {
    const items = [
      mk({ id: 'a', hanzi: '猫', pinyin: 'māo', meaningVi: 'con mèo', emoji: '🐱' }),
      mk({ id: 'b', hanzi: '狗', pinyin: 'gǒu', meaningVi: 'con chó', emoji: '🐶' }),
    ];
    const res = generateQuestions({
      items,
      scopeLessonIds: [L(1)],
      kinds: ['vocab_h2m'],
      requestedCount: 5,
      difficulty: 'easy',
      seed: 'two-only',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.length).toBe(2);
    for (const q of res.questions) {
      expect(q.question.options.length).toBe(2);
      expect(new Set(q.question.options.map((o) => o.text)).size).toBe(2);
    }
    expect(res.reduced).toBe(true);
    expect(res.reasonVi).toMatch(/chỉ có 2 câu hợp lệ/);
  });

  it('chỉ có 1 từ → chuyển sang thẻ nhớ, không tạo câu một lựa chọn', () => {
    const items = [mk({ id: 'a' })];
    const res = generateQuestions({
      items,
      scopeLessonIds: [L(1)],
      kinds: ['vocab_h2m'],
      requestedCount: 5,
      difficulty: 'easy',
      seed: 'one-only',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.fallbackToFlashcard).toBe(1);
    expect(res.questions.every((q) => q.question.kind === 'flashcard')).toBe(true);
  });

  it('mỗi câu chỉ có đúng một đáp án hợp lệ trên toàn bộ ngân hàng YCT 1', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(1), L(2), L(3), L(4), L(5), L(6), L(7), L(8), L(9), L(10), L(11)],
      kinds: ['vocab_h2m', 'vocab_m2h', 'vocab_p2m', 'translate_c2v', 'translate_v2c'],
      requestedCount: 0,
      difficulty: 'easy',
      seed: 'unique-answer',
      allowPriorKnowledgeDistractors: false,
    });
    for (const q of res.questions) {
      const texts = q.question.options.map((o) => o.text);
      expect(new Set(texts).size, `trùng phương án: ${q.question.questionId}`).toBe(texts.length);
      const correct = q.question.options.filter((o) => o.id === q.correctOptionId);
      expect(correct.length).toBe(1);
    }
    expect(res.questions.length).toBeGreaterThan(50);
  });

  it('không lặp một mục nội dung hai lần trong cùng một lượt', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(1)],
      kinds: ['vocab_h2m', 'vocab_m2h', 'vocab_p2m'],
      requestedCount: 40,
      difficulty: 'easy',
      seed: 'no-repeat',
      allowPriorKnowledgeDistractors: false,
    });
    const ids = res.questions.flatMap((q) => q.question.refContentIds);
    expect(new Set(ids).size).toBe(ids.length);
    // bài 1 chỉ có 14 từ → tối đa 14 câu, không nhân bản cho đủ 40
    expect(res.questions.length).toBeLessThanOrEqual(14);
    expect(res.reduced).toBe(true);
  });
});

describe('EDU-04 — độ khó chỉ đổi mức trợ giúp', () => {
  it('mức Khó ẩn pinyin ở dạng Hán tự → nghĩa', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(7)],
      kinds: ['vocab_h2m'],
      requestedCount: 3,
      difficulty: 'hard',
      seed: 'hard-h2m',
      allowPriorKnowledgeDistractors: false,
    });
    for (const q of res.questions) {
      expect(q.question.promptPinyin).toBe('');
      expect(q.question.promptEmoji).toBe('');
    }
  });

  it('mức Khó KHÔNG ẩn pinyin ở dạng pinyin → nghĩa (pinyin là đề bài)', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(7)],
      kinds: ['vocab_p2m'],
      requestedCount: 3,
      difficulty: 'hard',
      seed: 'hard-p2m',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.length).toBeGreaterThan(0);
    for (const q of res.questions) {
      expect(q.question.promptPinyin).not.toBe('');
      expect(q.question.assistance.showPinyin).toBe(true);
    }
  });

  it('dạng nghe không lộ chữ Hán / pinyin / nghĩa trước khi trả lời', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(9)],
      kinds: ['listen_pick'],
      requestedCount: 5,
      difficulty: 'easy',
      seed: 'listen',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.length).toBeGreaterThan(0);
    for (const q of res.questions) {
      expect(q.question.promptHanzi).toBe('');
      expect(q.question.promptPinyin).toBe('');
      expect(q.question.promptText).toBe('');
      expect(q.question.promptEmoji).toBe('');
      expect(q.question.audioContentId).not.toBeNull();
      // đáp án chỉ có trong khoá, không có trong payload gửi client
      expect(JSON.stringify(q.question)).not.toContain('"correctOptionId"');
    }
  });

  it('assistanceFor đúng theo ba mức', () => {
    expect(assistanceFor('easy')).toEqual({ showPinyin: true, showEmoji: true, allowReplayAudio: true });
    expect(assistanceFor('medium')).toEqual({ showPinyin: false, showEmoji: true, allowReplayAudio: true });
    expect(assistanceFor('hard')).toEqual({ showPinyin: false, showEmoji: false, allowReplayAudio: true });
  });
});

describe('chấm điểm ở server', () => {
  it('chỉ chấp nhận optionId đúng; dạng thẻ nhớ không được chấm khách quan', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(1)],
      kinds: ['vocab_h2m'],
      requestedCount: 1,
      difficulty: 'easy',
      seed: 'grade',
      allowPriorKnowledgeDistractors: false,
    });
    const q = res.questions[0]!;
    expect(grade(q, q.correctOptionId!)).toEqual({ correct: true, objective: true });
    const wrong = q.question.options.find((o) => o.id !== q.correctOptionId)!;
    expect(grade(q, wrong.id)).toEqual({ correct: false, objective: true });
    // gửi thẳng chuỗi đáp án thay vì optionId → vẫn sai
    expect(grade(q, q.revealAfterAnswer.meaningVi).correct).toBe(false);
  });
});

describe('hình gợi ý không được làm lộ đáp án', () => {
  const kindsRevealing = ['vocab_h2m', 'vocab_p2m', 'listen_pick', 'flashcard'] as const;

  it.each(kindsRevealing)('dạng %s không hiện emoji dù ở mức Dễ', (kind) => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(1), L(7), L(11)],
      kinds: [kind],
      requestedCount: 20,
      difficulty: 'easy',
      seed: `emoji-${kind}`,
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.length).toBeGreaterThan(0);
    for (const q of res.questions) {
      expect(q.question.promptEmoji, `${kind}/${q.question.questionId}`).toBe('');
      expect(q.question.assistance.showEmoji).toBe(false);
    }
  });

  it('dạng Nghĩa → Hán tự VẪN hiện emoji (emoji minh hoạ đề bài, không phải đáp án)', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(7)],
      kinds: ['vocab_m2h'],
      requestedCount: 5,
      difficulty: 'easy',
      seed: 'emoji-m2h',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.some((q) => q.question.promptEmoji !== '')).toBe(true);
  });

  it('dạng Hình → từ dùng emoji làm đề bài kể cả mức Khó', () => {
    const res = generateQuestions({
      items: ITEMS,
      scopeLessonIds: [L(7)],
      kinds: ['vocab_pic'],
      requestedCount: 5,
      difficulty: 'hard',
      seed: 'emoji-pic',
      allowPriorKnowledgeDistractors: false,
    });
    expect(res.questions.length).toBeGreaterThan(0);
    for (const q of res.questions) expect(q.question.promptEmoji).not.toBe('');
  });
});
