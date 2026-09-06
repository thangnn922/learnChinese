/**
 * Sinh câu hỏi — hàm thuần, tách hoàn toàn khỏi giao diện, có seed để tái hiện.
 *
 * Luật bắt buộc (xem docs/source-audit.md §4.4):
 *  1. Không có mục nào ngoài phạm vi bài đã chọn (trừ khi giáo viên bật ôn kiến thức cũ).
 *  2. Mỗi câu có đúng MỘT đáp án hợp lệ — loại phương án trùng nghĩa hoặc trùng pinyin.
 *  3. Thiếu phương án → giảm còn 3 hoặc 2 và hiển thị đúng số lượng; dưới 2 → chuyển thẻ nhớ.
 *  4. Không lặp lại câu để cho đủ số lượng; số câu thực tế ≤ ngân hàng hợp lệ.
 *  5. Độ khó chỉ đổi mức TRỢ GIÚP. Pinyin là đề bài thì không bao giờ bị ẩn.
 */
import {
  OBJECTIVE_KINDS,
  type ContentItem,
  type Difficulty,
  type LessonId,
  type Question,
  type QuestionKind,
  type QuestionWithKey,
} from './domain.js';
import { createRng, type Rng } from './rng.js';
import { meaningsOverlap, normalizePinyinForCompare } from './text.js';

export interface Assistance {
  showPinyin: boolean;
  showEmoji: boolean;
  allowReplayAudio: boolean;
}

/**
 * Với những dạng mà ĐÁP ÁN là nghĩa của từ, hình minh hoạ chính là bức tranh của đáp án
 * (7️⃣ cho 七 → lộ ngay "số bảy"). Mức Dễ chỉ được hiện hình khi hình KHÔNG làm lộ đáp án.
 * Xem quy tắc chung §M03 và mục "Độ khó" trong đề bài.
 */
export function emojiWouldRevealAnswer(kind: QuestionKind): boolean {
  return kind === 'vocab_h2m' || kind === 'vocab_p2m' || kind === 'translate_c2v' || kind === 'listen_pick';
}

export function assistanceFor(difficulty: Difficulty): Assistance {
  switch (difficulty) {
    case 'easy':
      return { showPinyin: true, showEmoji: true, allowReplayAudio: true };
    case 'medium':
      return { showPinyin: false, showEmoji: true, allowReplayAudio: true };
    case 'hard':
      return { showPinyin: false, showEmoji: false, allowReplayAudio: true };
  }
}

export interface GenerateOptions {
  items: ContentItem[];
  scopeLessonIds: LessonId[];
  kinds: QuestionKind[];
  /** 0 = toàn bộ ngân hàng hợp lệ */
  requestedCount: number;
  difficulty: Difficulty;
  seed: string;
  /** cho phép lấy distractor từ các bài đã học trước đó */
  allowPriorKnowledgeDistractors: boolean;
  /** danh sách bài đã học (dùng khi allowPriorKnowledgeDistractors) */
  priorLessonIds?: LessonId[];
  /** chỉ nhận nội dung ở các trạng thái này */
  acceptStatuses?: ReadonlyArray<ContentItem['status']>;
}

export interface GenerateResult {
  questions: QuestionWithKey[];
  /** số câu yêu cầu ban đầu (0 = tất cả) */
  requestedCount: number;
  /** true khi phải giảm số câu vì ngân hàng không đủ */
  reduced: boolean;
  reasonVi: string | null;
  /** thống kê để kiểm thử: có mục nào ngoài phạm vi không */
  outOfScopeCount: number;
  /** những mục phải chuyển sang thẻ nhớ vì không đủ phương án */
  fallbackToFlashcard: number;
}

const INSTRUCTIONS: Record<QuestionKind, string> = {
  vocab_h2m: 'Chữ này nghĩa là gì?',
  vocab_m2h: 'Chọn chữ Hán đúng',
  vocab_p2m: 'Cách đọc này là từ nào?',
  vocab_pic: 'Hình này là từ nào?',
  listen_pick: 'Nghe rồi chọn đáp án đúng',
  grammar_fill: 'Chọn từ điền vào chỗ trống',
  translate_c2v: 'Câu này nghĩa là gì?',
  translate_v2c: 'Chọn câu tiếng Trung đúng',
  flashcard: 'Nhớ lại rồi lật thẻ xem đáp án',
  order_words: 'Sắp xếp thành câu đúng',
  match_pairs: 'Ghép hình với từ',
};

function inScope(item: ContentItem, scope: ReadonlySet<string>): boolean {
  return scope.has(item.lessonId);
}

/**
 * Một mục có thể làm phương án nhiễu cho `answer` không?
 * Loại khi: trùng chính nó · trùng chuỗi hiển thị · nghĩa tương đương ·
 * (với đề bài là pinyin) trùng cách đọc.
 */
export function isUsableDistractor(
  answer: ContentItem,
  candidate: ContentItem,
  field: 'meaningVi' | 'hanzi',
  promptIsPinyin: boolean,
): boolean {
  if (candidate.id === answer.id) return false;
  const a = field === 'meaningVi' ? answer.meaningVi : answer.hanzi;
  const c = field === 'meaningVi' ? candidate.meaningVi : candidate.hanzi;
  if (a.trim() === c.trim()) return false;
  if (field === 'meaningVi' && meaningsOverlap(a, c)) return false;
  if (field === 'hanzi' && meaningsOverlap(answer.meaningVi, candidate.meaningVi)) return false;
  if (
    promptIsPinyin &&
    normalizePinyinForCompare(answer.pinyin) === normalizePinyinForCompare(candidate.pinyin)
  ) {
    return false;
  }
  return true;
}

function buildOptions(
  answer: ContentItem,
  pool: ContentItem[],
  field: 'meaningVi' | 'hanzi',
  promptIsPinyin: boolean,
  rng: Rng,
  showPinyinOnOptions: boolean,
): { options: { id: string; text: string; sub: string }[]; correctOptionId: string } | null {
  const usable = pool.filter((c) => isUsableDistractor(answer, c, field, promptIsPinyin));
  // loại các ứng viên trùng nghĩa/chuỗi với nhau
  const chosen: ContentItem[] = [];
  for (const c of rng.shuffle(usable)) {
    if (chosen.length >= 3) break;
    const clash = chosen.some(
      (x) =>
        (field === 'meaningVi' ? x.meaningVi.trim() === c.meaningVi.trim() : x.hanzi.trim() === c.hanzi.trim()) ||
        meaningsOverlap(x.meaningVi, c.meaningVi),
    );
    if (!clash) chosen.push(c);
  }
  if (chosen.length < 1) return null; // dưới 2 lựa chọn → không tạo câu

  const mk = (it: ContentItem) => ({
    id: `o_${it.id}`,
    text: field === 'meaningVi' ? it.meaningVi : it.hanzi,
    sub: showPinyinOnOptions && field === 'hanzi' ? it.pinyin : '',
  });
  const options = rng.shuffle([mk(answer), ...chosen.map(mk)]);
  return { options, correctOptionId: `o_${answer.id}` };
}

function qid(kind: QuestionKind, itemId: string, seed: string): string {
  return `${kind}:${itemId}:${seed.slice(0, 12)}`;
}

export function generateQuestions(opts: GenerateOptions): GenerateResult {
  const accept = new Set(opts.acceptStatuses ?? ['published']);
  const scope = new Set<string>(opts.scopeLessonIds);
  const distractorScope = new Set<string>([
    ...opts.scopeLessonIds,
    ...(opts.allowPriorKnowledgeDistractors ? (opts.priorLessonIds ?? []) : []),
  ]);

  const usable = opts.items.filter((i) => accept.has(i.status));
  const scoped = usable.filter((i) => inScope(i, scope));
  const distractorPool = usable.filter((i) => distractorScope.has(i.lessonId));

  const vocab = scoped.filter((i) => i.type === 'vocab');
  const vocabDistractors = distractorPool.filter((i) => i.type === 'vocab');
  const sentences = scoped.filter((i) => i.type === 'sentence');
  const sentenceDistractors = distractorPool.filter((i) => i.type === 'sentence');
  const grammar = scoped.filter((i) => i.type === 'grammar');

  const rng = createRng(opts.seed);
  const assist = assistanceFor(opts.difficulty);
  const out: QuestionWithKey[] = [];
  let fallbackToFlashcard = 0;

  const candidates: { kind: QuestionKind; item: ContentItem }[] = [];
  for (const kind of opts.kinds) {
    if (kind === 'vocab_h2m' || kind === 'vocab_p2m' || kind === 'vocab_m2h' || kind === 'vocab_pic' || kind === 'listen_pick' || kind === 'flashcard') {
      for (const it of vocab) candidates.push({ kind, item: it });
    } else if (kind === 'grammar_fill') {
      for (const it of grammar) candidates.push({ kind, item: it });
    } else if (kind === 'translate_c2v' || kind === 'translate_v2c' || kind === 'order_words') {
      for (const it of sentences) candidates.push({ kind, item: it });
    }
  }

  // Không lặp lại cùng một mục nội dung trong một lượt học.
  const shuffled = rng.shuffle(candidates);
  const usedItemIds = new Set<string>();
  const picked: { kind: QuestionKind; item: ContentItem }[] = [];
  for (const c of shuffled) {
    if (usedItemIds.has(c.item.id)) continue;
    usedItemIds.add(c.item.id);
    picked.push(c);
  }

  for (const { kind, item } of picked) {
    if (opts.requestedCount > 0 && out.length >= opts.requestedCount) break;
    const built = buildQuestion(kind, item, {
      vocabDistractors,
      sentenceDistractors,
      rng,
      assist,
      seed: opts.seed,
      scopeLessonIds: opts.scopeLessonIds,
    });
    if (!built) {
      fallbackToFlashcard++;
      const fc = buildQuestion('flashcard', item, {
        vocabDistractors,
        sentenceDistractors,
        rng,
        assist,
        seed: opts.seed,
        scopeLessonIds: opts.scopeLessonIds,
      });
      if (fc) out.push(fc);
      continue;
    }
    out.push(built);
  }

  const outOfScopeCount = out.filter((q) => !scope.has(q.question.lessonId)).length;
  const reduced = opts.requestedCount > 0 && out.length < opts.requestedCount;
  return {
    questions: out,
    requestedCount: opts.requestedCount,
    reduced,
    reasonVi: reduced
      ? `Trong phạm vi đã chọn chỉ có ${out.length} câu hợp lệ, ít hơn ${opts.requestedCount} câu yêu cầu.`
      : null,
    outOfScopeCount,
    fallbackToFlashcard,
  };
}

interface BuildCtx {
  vocabDistractors: ContentItem[];
  sentenceDistractors: ContentItem[];
  rng: Rng;
  assist: Assistance;
  seed: string;
  scopeLessonIds: LessonId[];
}

export function buildQuestion(
  kind: QuestionKind,
  item: ContentItem,
  ctx: BuildCtx,
): QuestionWithKey | null {
  const base = {
    questionId: qid(kind, item.id, ctx.seed),
    kind,
    instructionVi: INSTRUCTIONS[kind],
    promptHanzi: '',
    promptPinyin: '',
    promptText: '',
    promptEmoji: '',
    audioContentId: null as string | null,
    options: [] as { id: string; text: string; sub: string }[],
    lessonId: item.lessonId,
    refContentIds: [item.id],
    scopeLessonIds: ctx.scopeLessonIds,
    assistance: { ...ctx.assist },
  };
  const reveal = { hanzi: item.hanzi, pinyin: item.pinyin, meaningVi: item.meaningVi };

  switch (kind) {
    case 'vocab_h2m': {
      const built = buildOptions(item, ctx.vocabDistractors, 'meaningVi', false, ctx.rng, false);
      if (!built) return null;
      return {
        question: {
          ...base,
          promptHanzi: item.hanzi,
          promptPinyin: ctx.assist.showPinyin ? item.pinyin : '',
          // KHÔNG hiện emoji: đáp án là nghĩa, hình sẽ lộ đáp án
          promptEmoji: '',
          audioContentId: item.id,
          options: built.options,
          assistance: { ...ctx.assist, showEmoji: false },
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.meaningVi],
        explainVi: item.pinyinNote || '',
        revealAfterAnswer: reveal,
      };
    }
    case 'vocab_p2m': {
      // pinyin LÀ đề bài → luôn hiện, kể cả mức Khó
      const built = buildOptions(item, ctx.vocabDistractors, 'meaningVi', true, ctx.rng, false);
      if (!built) return null;
      return {
        question: {
          ...base,
          promptPinyin: item.pinyin,
          // KHÔNG hiện emoji: đáp án là nghĩa
          promptEmoji: '',
          options: built.options,
          assistance: { ...ctx.assist, showPinyin: true, showEmoji: false },
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.meaningVi],
        explainVi: item.pinyinNote || '',
        revealAfterAnswer: reveal,
      };
    }
    case 'vocab_m2h': {
      const built = buildOptions(item, ctx.vocabDistractors, 'hanzi', false, ctx.rng, ctx.assist.showPinyin);
      if (!built) return null;
      return {
        question: {
          ...base,
          promptText: item.meaningVi,
          promptEmoji: ctx.assist.showEmoji ? item.emoji : '',
          options: built.options,
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.hanzi],
        explainVi: item.pinyinNote || '',
        revealAfterAnswer: reveal,
      };
    }
    case 'vocab_pic': {
      if (!item.emoji) return null;
      const built = buildOptions(item, ctx.vocabDistractors, 'hanzi', false, ctx.rng, ctx.assist.showPinyin);
      if (!built) return null;
      return {
        question: {
          ...base,
          promptEmoji: item.emoji, // hình LÀ đề bài
          options: built.options,
          assistance: { ...ctx.assist, showEmoji: true },
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.hanzi],
        explainVi: '',
        revealAfterAnswer: reveal,
      };
    }
    case 'listen_pick': {
      // Chế độ nghe: KHÔNG hiện chữ Hán, pinyin, hay nghĩa trước khi trả lời.
      const built = buildOptions(item, ctx.vocabDistractors, 'meaningVi', true, ctx.rng, false);
      if (!built) return null;
      return {
        question: {
          ...base,
          audioContentId: item.id,
          options: built.options,
          assistance: { ...ctx.assist, showPinyin: false, showEmoji: false, allowReplayAudio: true },
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.meaningVi],
        explainVi: item.pinyinNote || '',
        revealAfterAnswer: reveal,
      };
    }
    case 'grammar_fill': {
      const wrongs = item.wrongs.filter((w) => w && w !== item.correct);
      const uniq = Array.from(new Set(wrongs)).slice(0, 3);
      if (uniq.length < 1) return null;
      const opts = ctx.rng.shuffle(
        [item.correct, ...uniq].map((t, i) => ({ id: `g_${item.id}_${i}_${t}`, text: t, sub: '' })),
      );
      const correctOption = opts.find((o) => o.text === item.correct);
      if (!correctOption) return null;
      return {
        question: {
          ...base,
          promptHanzi: item.hanzi,
          promptText: item.promptVi,
          options: opts,
        },
        correctOptionId: correctOption.id,
        acceptedAnswers: [item.correct],
        explainVi: item.explainVi,
        revealAfterAnswer: {
          hanzi: item.hanzi.replace(/_{2,}|＿/, item.correct),
          pinyin: item.pinyin === '-' ? '' : item.pinyin,
          meaningVi: item.promptVi || item.meaningVi,
        },
      };
    }
    case 'translate_c2v': {
      const built = buildOptions(item, ctx.sentenceDistractors, 'meaningVi', false, ctx.rng, false);
      if (!built) return null;
      return {
        question: {
          ...base,
          promptHanzi: item.hanzi,
          promptPinyin: ctx.assist.showPinyin ? item.pinyin : '',
          promptEmoji: '',
          audioContentId: item.id,
          options: built.options,
          assistance: { ...ctx.assist, showEmoji: false },
        },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.meaningVi],
        explainVi: '',
        revealAfterAnswer: reveal,
      };
    }
    case 'translate_v2c': {
      const built = buildOptions(item, ctx.sentenceDistractors, 'hanzi', false, ctx.rng, ctx.assist.showPinyin);
      if (!built) return null;
      return {
        question: { ...base, promptText: item.meaningVi, options: built.options },
        correctOptionId: built.correctOptionId,
        acceptedAnswers: [item.hanzi],
        explainVi: '',
        revealAfterAnswer: reveal,
      };
    }
    case 'order_words': {
      const tokens = splitSentence(item.hanzi);
      if (tokens.length < 3 || tokens.length > 8) return null;
      const scrambled = ctx.rng.shuffle(tokens);
      if (scrambled.join('') === tokens.join('')) scrambled.reverse();
      return {
        question: {
          ...base,
          promptText: item.meaningVi,
          promptPinyin: ctx.assist.showPinyin ? item.pinyin : '',
          options: scrambled.map((t, i) => ({ id: `t_${item.id}_${i}`, text: t, sub: '' })),
        },
        correctOptionId: null,
        acceptedAnswers: [tokens.join('')],
        explainVi: '',
        revealAfterAnswer: reveal,
      };
    }
    case 'flashcard': {
      // Mặt trước chỉ có chữ Hán: hiện emoji sẽ lộ nghĩa trước khi con tự nhớ.
      return {
        question: {
          ...base,
          promptHanzi: item.hanzi,
          promptEmoji: '',
          audioContentId: item.id,
          options: [],
          assistance: { ...ctx.assist, showEmoji: false },
        },
        correctOptionId: null,
        acceptedAnswers: [],
        explainVi: item.pinyinNote || '',
        revealAfterAnswer: reveal,
      };
    }
    case 'match_pairs':
      return null; // trò chơi ghép cặp có bộ sinh riêng (games.ts)
  }
}

/** Tách câu tiếng Trung thành các "khối" để sắp xếp: bỏ dấu câu, mỗi chữ là một khối. */
export function splitSentence(s: string): string[] {
  return s
    .replace(/[，。！？、,.!?]/g, '')
    .split('')
    .filter((c) => c.trim() !== '');
}

export function isObjective(kind: QuestionKind): boolean {
  return OBJECTIVE_KINDS.has(kind);
}

/** Chấm một câu — chạy ở SERVER, không tin điểm client gửi. */
export function grade(
  key: QuestionWithKey,
  response: string,
): { correct: boolean; objective: boolean } {
  const objective = isObjective(key.question.kind);
  if (!objective) return { correct: false, objective: false };
  if (key.correctOptionId) return { correct: response === key.correctOptionId, objective };
  // dạng sắp xếp: so chuỗi đã bỏ dấu câu và khoảng trắng
  const norm = (s: string) => s.replace(/[\s，。！？、,.!?]/g, '');
  return { correct: key.acceptedAnswers.some((a) => norm(a) === norm(response)), objective };
}
