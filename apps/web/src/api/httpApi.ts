/**
 * Bản chạy thật: mọi thứ đi qua máy chủ.
 * - Phiên đăng nhập nằm trong cookie HttpOnly (JS không đọc được).
 * - Thao tác thay đổi dữ liệu gửi kèm CSRF token đọc từ cookie "csrf" (cookie này KHÔNG phải phiên).
 * - Không lưu token hay đáp án ở localStorage.
 */
import type {
  AssignmentConfig,
  AttemptSummary,
  ContentItem,
  ContentType,
  LessonId,
  ValidatedBatch,
} from '@yct/shared';
import type {
  AnswerResult,
  AttemptView,
  CatalogView,
  ClassroomView,
  ImportPreview,
  LearnApi,
  ProgressView,
  PublishResult,
  SessionUser,
  StartAttemptInput,
  StudentReportRow,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1] as string) : '';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body) headers.set('content-type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-csrf-token', readCookie('csrf'));

  let res: Response;
  try {
    res = await fetch('/api' + path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Máy đang mất mạng. Con thử lại khi có mạng nhé.', 'OFFLINE', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; messageVi?: string; details?: unknown };
    throw new ApiError(d.messageVi ?? 'Có lỗi xảy ra.', d.code ?? 'UNKNOWN', res.status, d.details);
  }
  return data as T;
}

export class HttpApi implements LearnApi {
  readonly mode = 'server' as const;

  me = () => req<SessionUser | null>('/me');
  loginTeacher = (email: string, password: string) =>
    req<SessionUser>('/auth/teacher/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  loginStudent = (classCode: string, nickname: string, accessCode: string) =>
    req<SessionUser>('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ classCode, nickname, accessCode }),
    });
  logout = () => req<void>('/auth/logout', { method: 'POST' });

  listCurricula = () =>
    req<{ curriculumId: 'yct' | 'hsk'; level: number; nameVi: string; sourceVerified: boolean }[]>('/curricula');
  getCatalog = (curriculumId: 'yct' | 'hsk', level: number) =>
    req<CatalogView>(`/curricula/${curriculumId}/${level}/catalog`);

  startAttempt = (input: StartAttemptInput) =>
    req<AttemptView>('/attempts', { method: 'POST', body: JSON.stringify(input) });
  resumeAttempt = (attemptId: string) => req<AttemptView>(`/attempts/${attemptId}`);
  findResumableAttempt = () => req<{ attemptId: string; label: string } | null>('/attempts/resumable');
  submitAnswer = (input: {
    attemptId: string;
    questionId: string;
    response: string;
    tryIndex: number;
    assistanceUsed: string[];
    activeMs: number;
    idempotencyKey: string;
  }) =>
    req<AnswerResult>(`/attempts/${input.attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  submitSelfReport = (input: {
    attemptId: string;
    contentId: string;
    remembered: boolean;
    idempotencyKey: string;
  }) =>
    req<{ duplicate: boolean }>(`/attempts/${input.attemptId}/self-reports`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  finishAttempt = (attemptId: string) =>
    req<AttemptSummary>(`/attempts/${attemptId}/finish`, { method: 'POST' });
  getAttemptSummary = (attemptId: string) => req<AttemptSummary>(`/attempts/${attemptId}/summary`);

  getProgress = () => req<ProgressView>('/progress');
  getGameData = (kind: 'match' | 'order', lessonIds: LessonId[]) =>
    req<unknown | null>(`/games/${kind}?lessons=${encodeURIComponent(lessonIds.join(','))}`);

  teacherListDraft = (curriculumId: 'yct' | 'hsk', level: number) =>
    req<ContentItem[]>(`/teacher/content?curriculum=${curriculumId}&level=${level}`);
  teacherValidateImport = (
    kind: ContentType,
    text: string,
    curriculumId: 'yct' | 'hsk',
    level: number,
    mode: 'merge' | 'replace',
  ) =>
    req<ImportPreview>('/teacher/import/validate', {
      method: 'POST',
      body: JSON.stringify({ kind, text, curriculumId, level, mode }),
    });
  teacherPublish = (batch: ValidatedBatch, text: string, mode: 'merge' | 'replace') =>
    req<PublishResult>('/teacher/import/publish', {
      method: 'POST',
      body: JSON.stringify({ batch, text, mode }),
    });
  teacherReview = (itemIds: string[]) =>
    req<{ reviewed: number }>('/teacher/content/review', { method: 'POST', body: JSON.stringify({ itemIds }) });
  teacherListClassrooms = () => req<ClassroomView[]>('/teacher/classrooms');
  teacherCreateAssignment = (classroomId: string, config: AssignmentConfig) =>
    req<{ assignmentId: string }>(`/teacher/classrooms/${classroomId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  teacherReport = (classroomId: string) => req<StudentReportRow[]>(`/teacher/classrooms/${classroomId}/report`);
  teacherRollback = (toRevision: number) =>
    req<PublishResult>('/teacher/content/rollback', {
      method: 'POST',
      body: JSON.stringify({ toRevision }),
    });
}
