/**
 * Luyện tập khi CHƯA đăng nhập.
 *
 * Vì sao có phần này: trẻ 6–12 tuổi vào trang là muốn học ngay. Bắt nhớ mã lớp, biệt danh và
 * mã truy cập trước khi được làm một câu nào là rào cản không cần thiết cho việc tự luyện.
 *
 * Ranh giới của chế độ khách:
 *  - Máy chủ VẪN chấm điểm. Đáp án không bao giờ được gửi về trình duyệt.
 *  - Máy chủ KHÔNG lưu gì. Không tài khoản, không cookie, không thu thập gì về đứa trẻ.
 *  - Vì không lưu ở máy chủ, tiến trình trong buổi được giữ tạm ở sessionStorage của tab.
 *    Đóng tab là mất — và điều đó được nói thẳng trên giao diện, không hứa hẹn gì thêm.
 *  - Muốn có tiến độ lưu lại, bài cô giao và báo cáo thì phải đăng nhập.
 */
import type { AttemptSummary, GradedAnswerRow, Question, QuestionKind } from '@yct/shared';
import { summarizeAttempt } from '@yct/shared';
import type { AnswerResult, AttemptView, ProgressView, StartAttemptInput } from './types';

/** practiceId là chuỗi base64url dài, khác hẳn UUID của lượt học có tài khoản. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isGuestAttemptId(id: string): boolean {
  return !UUID.test(id);
}

interface GuestSession {
  practiceId: string;
  revision: number;
  questions: Question[];
  answers: GradedAnswerRow[];
  reducedNotice: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const KEY = (practiceId: string) => `yct.practice.${practiceId}`;

function load(practiceId: string): GuestSession | null {
  try {
    const raw = sessionStorage.getItem(KEY(practiceId));
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

function save(s: GuestSession): void {
  try {
    sessionStorage.setItem(KEY(s.practiceId), JSON.stringify(s));
  } catch {
    /* trình duyệt chặn lưu (chế độ riêng tư, hết chỗ) — buổi học vẫn chạy tiếp trong tab này */
  }
}

function toView(s: GuestSession): AttemptView {
  const answered = [...new Set(s.answers.map((a) => a.questionId))];
  return {
    attemptId: s.practiceId,
    revision: s.revision,
    mode: 'practice',
    questions: s.questions,
    cursor: answered.length,
    answeredQuestionIds: answered,
    reducedNotice: s.reducedNotice,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt,
  };
}

type PracticeResponse = {
  practiceId: string;
  revision: number;
  questions: Question[];
  reducedNotice: string | null;
};

export function createGuestPractice(
  post: <T>(path: string, body: unknown) => Promise<T>,
) {
  const remember = (r: PracticeResponse, existing?: GuestSession | null): GuestSession => {
    const s: GuestSession = {
      practiceId: r.practiceId,
      revision: r.revision,
      questions: r.questions,
      answers: existing?.answers ?? [],
      reducedNotice: r.reducedNotice,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      finishedAt: existing?.finishedAt ?? null,
    };
    save(s);
    return s;
  };

  return {
    async start(input: StartAttemptInput): Promise<AttemptView> {
      const r = await post<PracticeResponse>('/practice/start', {
        curriculumId: input.curriculumId,
        level: input.level,
        lessonIds: input.lessonIds,
        kinds: input.kinds,
        // buổi tự luyện của trẻ ngắn; máy chủ cũng chỉ nhận tối đa 40 câu cho chế độ khách
        questionCount: Math.min(Math.max(input.questionCount, 1), 40),
        difficulty: input.difficulty,
      });
      return toView(remember(r));
    },

    /** Tải lại trang: câu hỏi lấy lại từ máy chủ, phần đã trả lời lấy từ tab hiện tại. */
    async resume(practiceId: string): Promise<AttemptView> {
      const existing = load(practiceId);
      if (existing && existing.questions.length) return toView(existing);
      const r = await post<PracticeResponse>('/practice/resume', { practiceId });
      return toView(remember(r, existing));
    },

    async answer(input: {
      attemptId: string;
      questionId: string;
      response: string;
      tryIndex: number;
    }): Promise<AnswerResult> {
      const result = await post<AnswerResult>('/practice/answer', {
        practiceId: input.attemptId,
        questionId: input.questionId,
        response: input.response,
      });

      const s = load(input.attemptId);
      if (s) {
        const q = s.questions.find((x) => x.questionId === input.questionId);
        // Chỉ ghi nhận lần trả lời ĐẦU cho mỗi câu, giống cách máy chủ tính tỉ lệ đúng lần đầu.
        const already = s.answers.some((a) => a.questionId === input.questionId && a.tryIndex === input.tryIndex);
        if (q && !already) {
          s.answers.push({
            questionId: input.questionId,
            kind: q.kind as QuestionKind,
            contentIds: q.refContentIds,
            tryIndex: input.tryIndex,
            correct: result.correct,
            skipped: input.response === '',
          });
          save(s);
        }
      }
      return result;
    },

    finish(practiceId: string): AttemptSummary {
      const s = load(practiceId);
      if (s && !s.finishedAt) {
        s.finishedAt = new Date().toISOString();
        save(s);
      }
      return this.summary(practiceId);
    },

    /** Tổng kết tính ngay trên máy bằng CÙNG hàm mà máy chủ dùng, từ kết quả máy chủ đã chấm. */
    summary(practiceId: string): AttemptSummary {
      const s = load(practiceId);
      return summarizeAttempt(practiceId, 'practice', s?.answers ?? [], []);
    },

    /** Khách không có tiến độ được lưu — nói thật, không bịa số. */
    emptyProgress(): ProgressView {
      return { totalAnswered: 0, firstTryAccuracy: null, dueForReview: [], recentAttempts: [] };
    },
  };
}
