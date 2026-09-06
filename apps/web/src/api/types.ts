import type {
  AssignmentConfig,
  AttemptSummary,
  ContentItem,
  Curriculum,
  Difficulty,
  LessonId,
  Question,
  QuestionKind,
  ContentType,
  Role,
} from '@yct/shared';
import type { ImportIssue, ValidatedBatch, DiffSummary } from '@yct/shared';

export type BackendMode = 'demo' | 'server';

export interface SessionUser {
  userId: string;
  displayName: string;
  role: Role;
  /** lớp mà tài khoản này được phép thao tác */
  classroomIds: string[];
}

export interface LessonStatus {
  lessonId: LessonId;
  n: number;
  titleVi: string;
  titleZh: string;
  titlePinyin: string;
  goalsVi: string[];
  publishedItems: number;
  draftItems: number;
  /** true khi có đủ nội dung ĐÃ DUYỆT để học */
  ready: boolean;
}

export interface CatalogView {
  curriculum: Curriculum;
  lessons: LessonStatus[];
  /** revision hiện hành của nội dung đã xuất bản */
  revision: number;
  /** chương trình chưa có nội dung nào được duyệt */
  emptyPublished: boolean;
  noteVi: string;
}

export interface StartAttemptInput {
  curriculumId: 'yct' | 'hsk';
  level: number;
  lessonIds: LessonId[];
  kinds: QuestionKind[];
  questionCount: number;
  difficulty: Difficulty;
  mode: 'practice' | 'assessment';
  assignmentId?: string | null;
}

export interface AttemptView {
  attemptId: string;
  /** phiên bản nội dung bị KHOÁ cho lượt học này */
  revision: number;
  mode: 'practice' | 'assessment';
  questions: Question[];
  /** vị trí đang làm dở khi resume */
  cursor: number;
  answeredQuestionIds: string[];
  reducedNotice: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AnswerResult {
  correct: boolean;
  /** chỉ trả về sau khi đã trả lời */
  correctOptionId: string | null;
  explainVi: string;
  reveal: { hanzi: string; pinyin: string; meaningVi: string };
  /** true nếu sự kiện này đã được ghi trước đó (idempotent) */
  duplicate: boolean;
}

export interface ProgressView {
  totalAnswered: number;
  firstTryAccuracy: number | null;
  dueForReview: { contentId: string; hanzi: string; pinyin: string; meaningVi: string }[];
  recentAttempts: { attemptId: string; at: string; summary: AttemptSummary }[];
}

export interface ImportPreview {
  batch: ValidatedBatch | null;
  issues: ImportIssue[];
  rowsRead: number;
  rowsRejected: number;
  diff: DiffSummary | null;
  canPublish: boolean;
}

export interface PublishResult {
  revision: number;
  publishedCount: number;
  at: string;
}

export interface ClassroomView {
  classroomId: string;
  name: string;
  studentCount: number;
}

export interface StudentReportRow {
  studentId: string;
  nickname: string;
  attempts: number;
  firstTryAccuracy: number | null;
  lastActiveAt: string | null;
  weakContentIds: string[];
}

/**
 * Hợp đồng chung cho cả bản demo (trên thiết bị) và bản server.
 * Giao diện KHÔNG được biết mình đang chạy chế độ nào.
 */
export interface LearnApi {
  readonly mode: BackendMode;

  /* phiên */
  me(): Promise<SessionUser | null>;
  loginTeacher(email: string, password: string): Promise<SessionUser>;
  loginStudent(classCode: string, nickname: string, accessCode: string): Promise<SessionUser>;
  logout(): Promise<void>;

  /* nội dung */
  listCurricula(): Promise<{ curriculumId: 'yct' | 'hsk'; level: number; nameVi: string; sourceVerified: boolean }[]>;
  getCatalog(curriculumId: 'yct' | 'hsk', level: number): Promise<CatalogView>;

  /* lượt học */
  startAttempt(input: StartAttemptInput): Promise<AttemptView>;
  resumeAttempt(attemptId: string): Promise<AttemptView>;
  findResumableAttempt(): Promise<{ attemptId: string; label: string } | null>;
  submitAnswer(input: {
    attemptId: string;
    questionId: string;
    response: string;
    tryIndex: number;
    assistanceUsed: string[];
    activeMs: number;
    idempotencyKey: string;
  }): Promise<AnswerResult>;
  submitSelfReport(input: {
    attemptId: string;
    contentId: string;
    remembered: boolean;
    idempotencyKey: string;
  }): Promise<{ duplicate: boolean }>;
  finishAttempt(attemptId: string): Promise<AttemptSummary>;
  getAttemptSummary(attemptId: string): Promise<AttemptSummary>;

  /* tiến độ */
  getProgress(): Promise<ProgressView>;

  /* trò chơi */
  getGameData(kind: 'match' | 'order', lessonIds: LessonId[]): Promise<unknown | null>;

  /* giáo viên */
  teacherListDraft(curriculumId: 'yct' | 'hsk', level: number): Promise<ContentItem[]>;
  teacherValidateImport(
    kind: ContentType,
    text: string,
    curriculumId: 'yct' | 'hsk',
    level: number,
    mode: 'merge' | 'replace',
  ): Promise<ImportPreview>;
  teacherPublish(batch: ValidatedBatch, text: string, mode: 'merge' | 'replace'): Promise<PublishResult>;
  teacherReview(itemIds: string[]): Promise<{ reviewed: number }>;
  teacherListClassrooms(): Promise<ClassroomView[]>;
  teacherCreateAssignment(classroomId: string, config: AssignmentConfig): Promise<{ assignmentId: string }>;
  teacherReport(classroomId: string): Promise<StudentReportRow[]>;
  teacherRollback(toRevision: number): Promise<PublishResult>;
}
