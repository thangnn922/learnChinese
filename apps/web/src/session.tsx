import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Difficulty, LessonId, QuestionKind } from '@yct/shared';

/**
 * Lựa chọn của phiên làm việc (phạm vi bài, độ khó, dạng bài).
 * Chỉ là tiện ích trên thiết bị: KHÔNG lưu token, KHÔNG lưu đáp án.
 * Ghi vào sessionStorage để F5 không mất lựa chọn; mọi truy cập đều bọc try/catch.
 */
export interface SessionState {
  curriculumId: 'yct' | 'hsk';
  level: number;
  lessonIds: LessonId[];
  difficulty: Difficulty;
  kinds: QuestionKind[];
  questionCount: number;
}

const DEFAULT: SessionState = {
  curriculumId: 'yct',
  level: 1,
  lessonIds: [],
  difficulty: 'easy',
  kinds: ['vocab_h2m', 'vocab_m2h', 'listen_pick'],
  questionCount: 10,
};

const KEY = 'yct.session.v1';

function load(): SessionState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SessionState>) };
  } catch {
    return DEFAULT;
  }
}

function save(s: SessionState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* trình duyệt chặn lưu — bỏ qua, app vẫn chạy */
  }
}

interface Ctx extends SessionState {
  setCurriculum(curriculumId: 'yct' | 'hsk', level: number): void;
  setLessons(ids: LessonId[]): void;
  toggleLesson(id: LessonId): void;
  setDifficulty(d: Difficulty): void;
  setKinds(k: QuestionKind[]): void;
  setQuestionCount(n: number): void;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(load);

  const value = useMemo<Ctx>(() => {
    const update = (patch: Partial<SessionState>) =>
      setState((cur) => {
        const next = { ...cur, ...patch };
        save(next);
        return next;
      });
    return {
      ...state,
      setCurriculum: (curriculumId, level) => update({ curriculumId, level, lessonIds: [] }),
      setLessons: (lessonIds) => update({ lessonIds }),
      toggleLesson: (id) =>
        update({
          lessonIds: state.lessonIds.includes(id)
            ? state.lessonIds.filter((x) => x !== id)
            : [...state.lessonIds, id],
        }),
      setDifficulty: (difficulty) => update({ difficulty }),
      setKinds: (kinds) => update({ kinds }),
      setQuestionCount: (questionCount) => update({ questionCount }),
    };
  }, [state]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession phải nằm trong <SessionProvider>');
  return c;
}
