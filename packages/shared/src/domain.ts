import { z } from 'zod';

export const SCHEMA_VERSION = 1;

/* ────────────────────────────── Curriculum ────────────────────────────── */

export const CurriculumIdSchema = z.enum(['yct', 'hsk']);
export type CurriculumId = z.infer<typeof CurriculumIdSchema>;

/**
 * lessonId is fully qualified: `${curriculumId}${level}-l${n}`.
 * YCT lesson 1 and HSK lesson 1 are NEVER the same thing.
 */
export const LessonIdSchema = z
  .string()
  .regex(/^(yct|hsk)[1-6]-l\d{1,2}$/, 'lessonId phải có dạng yct1-l3 hoặc hsk1-l12');
export type LessonId = z.infer<typeof LessonIdSchema>;

export function makeLessonId(curriculumId: CurriculumId, level: number, n: number): LessonId {
  return `${curriculumId}${level}-l${n}`;
}

export function parseLessonId(
  id: string,
): { curriculumId: CurriculumId; level: number; n: number } | null {
  const m = /^(yct|hsk)([1-6])-l(\d{1,2})$/.exec(id);
  if (!m) return null;
  return { curriculumId: m[1] as CurriculumId, level: Number(m[2]), n: Number(m[3]) };
}

export const LessonSchema = z.object({
  lessonId: LessonIdSchema,
  curriculumId: CurriculumIdSchema,
  level: z.number().int().positive(),
  edition: z.string().min(1),
  n: z.number().int().positive(),
  titleZh: z.string().min(1),
  titlePinyin: z.string().min(1),
  titleEn: z.string().default(''),
  titleVi: z.string().min(1),
  goalsVi: z.array(z.string()).default([]),
  printedStart: z.number().int().positive().nullable(),
  printedEnd: z.number().int().positive().nullable(),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const CurriculumSchema = z.object({
  curriculumId: CurriculumIdSchema,
  level: z.number().int().positive(),
  edition: z.string().min(1),
  nameVi: z.string().min(1),
  /** Nguồn giáo trình gốc đã được đối chiếu hay chưa. */
  sourceVerified: z.boolean(),
  noteVi: z.string().default(''),
  lessons: z.array(LessonSchema),
});
export type Curriculum = z.infer<typeof CurriculumSchema>;

/* ─────────────────────────────── Content ──────────────────────────────── */

export const ContentStatusSchema = z.enum(['draft', 'reviewed', 'published', 'archived']);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const OriginSchema = z.enum(['textbook', 'teacher_authored', 'ai_draft']);
export type Origin = z.infer<typeof OriginSchema>;

export const VerificationStatusSchema = z.enum([
  'verified_by_teacher',
  'needs_teacher_check',
  'unverified_no_source',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const SourceRefSchema = z.object({
  fileName: z.string().min(1),
  /** 1-based physical page of the PDF. */
  pdfPage: z.number().int().positive().nullable(),
  /** Page number printed on the page. String because books use i, ii, iii… */
  printedPage: z.string().nullable(),
  section: z.string().min(1),
  verificationStatus: VerificationStatusSchema,
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ContentTypeSchema = z.enum(['vocab', 'sentence', 'grammar']);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContentItemSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  type: ContentTypeSchema,
  curriculumId: CurriculumIdSchema,
  level: z.number().int().positive(),
  edition: z.string().min(1),
  lessonId: LessonIdSchema,

  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  meaningVi: z.string().min(1),
  glossEn: z.string().default(''),
  emoji: z.string().default(''),
  pinyinNote: z.string().default(''),

  /** grammar only */
  promptVi: z.string().default(''),
  correct: z.string().default(''),
  wrongs: z.array(z.string()).default([]),
  explainVi: z.string().default(''),

  /** sentence only: 'key' | 'dialogue' */
  section: z.string().default(''),

  isExtended: z.boolean().default(false),
  origin: OriginSchema,
  /** Nguồn riêng của phần nghĩa tiếng Việt (sách gốc là Trung–Anh). */
  meaningOrigin: OriginSchema,
  source: SourceRefSchema,
  status: ContentStatusSchema,
  reviewedBy: z.string().nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

/* ─────────────────────────────── Questions ────────────────────────────── */

export const QuestionKindSchema = z.enum([
  'vocab_h2m', // Hán tự → nghĩa
  'vocab_m2h', // nghĩa → Hán tự
  'vocab_p2m', // pinyin → nghĩa
  'vocab_pic', // hình → từ
  'listen_pick', // nghe → chọn nghĩa/hình
  'grammar_fill', // điền chỗ trống
  'translate_c2v',
  'translate_v2c',
  'flashcard', // thẻ nhớ, tự đánh giá
  'order_words', // sắp xếp từ thành câu
  'match_pairs', // ghép cặp
]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

/** Câu hỏi được chấm khách quan (đưa vào mẫu số độ chính xác). */
export const OBJECTIVE_KINDS: ReadonlySet<QuestionKind> = new Set<QuestionKind>([
  'vocab_h2m',
  'vocab_m2h',
  'vocab_p2m',
  'vocab_pic',
  'listen_pick',
  'grammar_fill',
  'translate_c2v',
  'translate_v2c',
  'order_words',
]);

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const OptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /** phụ đề hiển thị dưới text (pinyin) — không bao giờ chứa đáp án của đề bài */
  sub: z.string().default(''),
});
export type Option = z.infer<typeof OptionSchema>;

/**
 * Câu hỏi gửi tới client: KHÔNG chứa đáp án.
 * Đáp án nằm ở server (bảng question_key), so khớp bằng questionId + revision.
 */
export const QuestionSchema = z.object({
  questionId: z.string().min(1),
  kind: QuestionKindSchema,
  instructionVi: z.string().min(1),
  /** nội dung đề bài */
  promptHanzi: z.string().default(''),
  promptPinyin: z.string().default(''),
  promptText: z.string().default(''),
  promptEmoji: z.string().default(''),
  /** id nội dung để phát âm; client gọi TTS, không lộ đáp án */
  audioContentId: z.string().nullable().default(null),
  options: z.array(OptionSchema).default([]),
  lessonId: LessonIdSchema,
  refContentIds: z.array(z.string()).default([]),
  /** phạm vi kiến thức được phép xuất hiện trong câu này */
  scopeLessonIds: z.array(LessonIdSchema).default([]),
  assistance: z.object({
    showPinyin: z.boolean(),
    showEmoji: z.boolean(),
    allowReplayAudio: z.boolean(),
  }),
});
export type Question = z.infer<typeof QuestionSchema>;

/** Bản đầy đủ chỉ tồn tại ở server / demo repository. */
export interface QuestionWithKey {
  question: Question;
  correctOptionId: string | null;
  /** với dạng tự luận/sắp xếp: danh sách chuỗi được duyệt là đúng */
  acceptedAnswers: string[];
  explainVi: string;
  revealAfterAnswer: {
    hanzi: string;
    pinyin: string;
    meaningVi: string;
  };
}

/* ─────────────────────────────── Attempts ─────────────────────────────── */

export const AnswerEventSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  /** optionId, hoặc chuỗi trả lời với dạng nhập */
  response: z.string(),
  /** lần thử thứ mấy cho chính câu này trong attempt, 1-based */
  tryIndex: z.number().int().min(1),
  assistanceUsed: z.array(z.string()).default([]),
  /** ms học sinh dừng ở câu này; chỉ để báo cáo, KHÔNG dùng để chấm điểm */
  activeMs: z.number().int().min(0).max(1000 * 60 * 60),
  clientSentAt: z.string(),
});
export type AnswerEvent = z.infer<typeof AnswerEventSchema>;

export const SelfReportSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  attemptId: z.string().min(1),
  contentId: z.string().min(1),
  remembered: z.boolean(),
  clientSentAt: z.string(),
});
export type SelfReport = z.infer<typeof SelfReportSchema>;

export const AttemptModeSchema = z.enum(['practice', 'assessment']);
export type AttemptMode = z.infer<typeof AttemptModeSchema>;

export interface AttemptSummary {
  attemptId: string;
  mode: AttemptMode;
  /** số câu chấm khách quan đã trả lời */
  answeredObjective: number;
  /** đúng ngay lần đầu */
  firstTryCorrect: number;
  skipped: number;
  /** null khi chưa có câu nào được chấm — không chia cho 0 */
  firstTryAccuracy: number | null;
  selfReportRemembered: number;
  selfReportTotal: number;
  wrongContentIds: string[];
}

/* ────────────────────────────── Classroom ─────────────────────────────── */

export const RoleSchema = z.enum(['admin', 'teacher', 'student']);
export type Role = z.infer<typeof RoleSchema>;

export const AssignmentConfigSchema = z.object({
  lessonIds: z.array(LessonIdSchema).min(1),
  kinds: z.array(QuestionKindSchema).min(1),
  questionCount: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(0)]), // 0 = toàn bộ ngân hàng hợp lệ
  difficulty: DifficultySchema,
  mode: AttemptModeSchema,
  dueAt: z.string().nullable(),
});
export type AssignmentConfig = z.infer<typeof AssignmentConfigSchema>;

/* ──────────────────────────────── Errors ─────────────────────────────── */

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  BATCH_STALE: 'BATCH_STALE',
  RATE_LIMITED: 'RATE_LIMITED',
  EMPTY_BANK: 'EMPTY_BANK',
  NOT_ENOUGH_OPTIONS: 'NOT_ENOUGH_OPTIONS',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES_VI: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Bạn cần đăng nhập lại.',
  FORBIDDEN: 'Tài khoản này không có quyền với lớp hoặc dữ liệu đó.',
  NOT_FOUND: 'Không tìm thấy nội dung.',
  VALIDATION_FAILED: 'Dữ liệu chưa hợp lệ — xem chi tiết theo từng dòng.',
  REVISION_CONFLICT: 'Có người vừa xuất bản một phiên bản mới. Hãy tải lại rồi đối chiếu trước khi lưu.',
  BATCH_STALE: 'Nội dung đã thay đổi sau lần kiểm tra. Hãy bấm “Kiểm tra” lại.',
  RATE_LIMITED: 'Thử lại sau ít phút nhé.',
  EMPTY_BANK: 'Chưa có bài học nào được duyệt cho phạm vi này.',
  NOT_ENOUGH_OPTIONS: 'Không đủ phương án để tạo câu hỏi trong phạm vi đã chọn.',
};
