/**
 * Tiến độ, chấm điểm tổng và lịch ôn lại.
 *
 * Định nghĩa dùng thống nhất toàn hệ thống:
 *   Độ chính xác lần đầu = (số câu ĐÚNG ở lần trả lời đầu) / (số câu ĐÃ TRẢ LỜI được chấm khách quan)
 *   - Câu bỏ qua: đếm riêng, KHÔNG nằm ở tử số lẫn mẫu số.
 *   - Thẻ nhớ tự đánh giá: KHÔNG bao giờ vào mẫu số.
 *   - Chưa có câu nào được chấm → null ("Chưa có dữ liệu"), không chia cho 0.
 *   - Hoàn thành bài KHÔNG đồng nghĩa đã thành thạo.
 */
import type { AttemptMode, AttemptSummary, QuestionKind } from './domain.js';
import { isObjective } from './questions.js';

export interface GradedAnswerRow {
  questionId: string;
  kind: QuestionKind;
  contentIds: string[];
  tryIndex: number;
  correct: boolean;
  skipped: boolean;
}

export interface SelfReportRow {
  contentId: string;
  remembered: boolean;
}

export function summarizeAttempt(
  attemptId: string,
  mode: AttemptMode,
  answers: GradedAnswerRow[],
  selfReports: SelfReportRow[],
): AttemptSummary {
  const firstByQuestion = new Map<string, GradedAnswerRow>();
  for (const a of answers) {
    const prev = firstByQuestion.get(a.questionId);
    if (!prev || a.tryIndex < prev.tryIndex) firstByQuestion.set(a.questionId, a);
  }

  let answeredObjective = 0;
  let firstTryCorrect = 0;
  let skipped = 0;
  const wrong = new Set<string>();

  for (const a of firstByQuestion.values()) {
    if (a.skipped) {
      skipped++;
      continue;
    }
    if (!isObjective(a.kind)) continue;
    answeredObjective++;
    if (a.correct) firstTryCorrect++;
    else a.contentIds.forEach((c) => wrong.add(c));
  }

  return {
    attemptId,
    mode,
    answeredObjective,
    firstTryCorrect,
    skipped,
    firstTryAccuracy: answeredObjective === 0 ? null : firstTryCorrect / answeredObjective,
    selfReportRemembered: selfReports.filter((s) => s.remembered).length,
    selfReportTotal: selfReports.length,
    wrongContentIds: [...wrong],
  };
}

export function formatAccuracyVi(acc: number | null): string {
  return acc === null ? 'Chưa có dữ liệu' : `${Math.round(acc * 100)}%`;
}

/* ─────────────────────────── Lịch ôn lại ──────────────────────────────── */

/**
 * Heuristic sản phẩm, cấu hình được. KHÔNG phải bằng chứng về mức thành thạo.
 * Mặc định: sai → ôn sau 1 ngày; đúng lần sau → 3 ngày; đúng tiếp → 7 ngày.
 */
export const DEFAULT_REVIEW_STEPS_DAYS = [1, 3, 7] as const;

export interface ReviewState {
  contentId: string;
  /** bậc hiện tại trong DEFAULT_REVIEW_STEPS_DAYS, -1 = chưa vào lịch */
  step: number;
  dueAt: string | null;
  lastResult: 'correct' | 'wrong' | null;
}

export function nextReview(
  state: ReviewState,
  correct: boolean,
  now: Date,
  steps: readonly number[] = DEFAULT_REVIEW_STEPS_DAYS,
): ReviewState {
  const step = correct ? Math.min(state.step + 1, steps.length - 1) : 0;
  const days = steps[step] ?? steps[0] ?? 1;
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    contentId: state.contentId,
    step,
    dueAt: due.toISOString(),
    lastResult: correct ? 'correct' : 'wrong',
  };
}

export function dueNow(states: ReviewState[], now: Date): ReviewState[] {
  return states.filter((s) => s.dueAt !== null && new Date(s.dueAt).getTime() <= now.getTime());
}

/* ─────────────────────── Lời khích lệ (không ép buộc) ─────────────────── */

/**
 * Không đếm chuỗi ngày, không xếp hạng, không thưởng ngẫu nhiên.
 * Lời khen dựa trên việc học sinh đã học được gì trong buổi này.
 */
export function encouragementVi(summary: AttemptSummary): string {
  if (summary.answeredObjective === 0 && summary.selfReportTotal > 0) {
    return `Con đã ôn ${summary.selfReportTotal} thẻ rồi!`;
  }
  if (summary.answeredObjective === 0) return 'Lần sau mình học tiếp nhé!';
  const learned = summary.firstTryCorrect;
  if (learned === summary.answeredObjective) return 'Con làm đúng hết cả bài rồi!';
  if (learned === 0) return 'Mình thử lại nhé! Cô sẽ ôn lại các từ này với con.';
  return `Con đã nhớ được ${learned} mục rồi! Còn ${summary.answeredObjective - learned} mục mình ôn thêm nhé.`;
}
