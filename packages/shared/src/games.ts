/**
 * Hai trò chơi ngắn, đều sinh từ dữ liệu học ĐÃ DUYỆT, mỗi vòng 1–3 phút.
 *
 * Nguyên tắc: không tính điểm theo tốc độ bấm, không xếp hạng, không thưởng ngẫu nhiên,
 * không ép chuỗi ngày học. Sai chỉ nhận phản hồi thân thiện.
 */
import type { ContentItem, LessonId } from './domain.js';
import { createRng, type Rng } from './rng.js';
import { meaningsOverlap } from './text.js';

export interface MatchPair {
  pairId: string;
  contentId: string;
  emoji: string;
  hanzi: string;
  pinyin: string;
  meaningVi: string;
}

export interface MatchGame {
  kind: 'match_pairs';
  roundSeconds: number;
  pairs: MatchPair[];
  /** thẻ bên trái (hình) và bên phải (từ) đã trộn riêng */
  leftOrder: string[];
  rightOrder: string[];
  lessonIds: LessonId[];
}

/** Ghép hình – từ. Loại các cặp có nghĩa trùng nhau để không có hai đáp án đúng. */
export function buildMatchGame(
  items: ContentItem[],
  scopeLessonIds: LessonId[],
  seed: string,
  size = 5,
): MatchGame | null {
  const rng = createRng(`match:${seed}`);
  const scope = new Set<string>(scopeLessonIds);
  const pool = items.filter(
    (i) => i.type === 'vocab' && i.status === 'published' && scope.has(i.lessonId) && i.emoji,
  );
  const chosen: ContentItem[] = [];
  for (const it of rng.shuffle(pool)) {
    if (chosen.length >= size) break;
    const clash = chosen.some(
      (c) => c.emoji === it.emoji || meaningsOverlap(c.meaningVi, it.meaningVi),
    );
    if (!clash) chosen.push(it);
  }
  if (chosen.length < 3) return null;

  const pairs: MatchPair[] = chosen.map((c) => ({
    pairId: `p_${c.id}`,
    contentId: c.id,
    emoji: c.emoji,
    hanzi: c.hanzi,
    pinyin: c.pinyin,
    meaningVi: c.meaningVi,
  }));
  return {
    kind: 'match_pairs',
    roundSeconds: 120,
    pairs,
    leftOrder: rng.shuffle(pairs.map((p) => p.pairId)),
    rightOrder: rng.shuffle(pairs.map((p) => p.pairId)),
    lessonIds: scopeLessonIds,
  };
}

export interface OrderGame {
  kind: 'order_sentence';
  roundSeconds: number;
  rounds: {
    roundId: string;
    contentId: string;
    meaningVi: string;
    pinyin: string;
    tokens: { id: string; text: string }[];
    /** chuỗi đúng, chỉ tồn tại phía server/demo repo */
    answer: string;
  }[];
  lessonIds: LessonId[];
}

/** Xếp câu: kéo thả HOẶC chạm-chọn (bàn phím dùng được). */
export function buildOrderGame(
  items: ContentItem[],
  scopeLessonIds: LessonId[],
  seed: string,
  rounds = 4,
): OrderGame | null {
  const rng: Rng = createRng(`order:${seed}`);
  const scope = new Set<string>(scopeLessonIds);
  const pool = items.filter(
    (i) => i.type === 'sentence' && i.status === 'published' && scope.has(i.lessonId),
  );
  const usable = pool.filter((i) => {
    const n = i.hanzi.replace(/[，。！？、]/g, '').length;
    return n >= 3 && n <= 8;
  });
  if (usable.length < 2) return null;

  const chosen = rng.shuffle(usable).slice(0, rounds);
  return {
    kind: 'order_sentence',
    roundSeconds: 180,
    lessonIds: scopeLessonIds,
    rounds: chosen.map((c) => {
      const tokens = c.hanzi.replace(/[，。！？、]/g, '').split('');
      const scrambled = rng.shuffle(tokens);
      if (scrambled.join('') === tokens.join('')) scrambled.reverse();
      return {
        roundId: `r_${c.id}`,
        contentId: c.id,
        meaningVi: c.meaningVi,
        pinyin: c.pinyin,
        tokens: scrambled.map((t, i) => ({ id: `t${i}`, text: t })),
        answer: tokens.join(''),
      };
    }),
  };
}

export const MASCOT_LINES_VI = {
  start: ['Mình bắt đầu nhé!', 'Cùng học nào!'],
  correct: ['Đúng rồi!', 'Con nhớ thêm một từ rồi!', 'Giỏi quá!'],
  wrong: ['Mình thử lại nhé!', 'Gần đúng rồi, mình xem lại nào.', 'Không sao đâu, mình học tiếp.'],
  done: ['Xong rồi! Hẹn gặp con lần sau.', 'Hôm nay con học tốt lắm!'],
  offline: ['Máy đang mất mạng. Con chờ một chút nhé!'],
} as const;
