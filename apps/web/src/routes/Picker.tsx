import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Difficulty, LessonId, QuestionKind } from '@yct/shared';
import { api } from '../api/index';
import { useAsync, useOnce } from '../hooks';
import { Banner, ErrorState, Loading } from '../components/States';
import { useSession } from '../session';

const KIND_GROUPS: { id: string; labelVi: string; kinds: QuestionKind[]; hintVi: string }[] = [
  { id: 'tu', labelVi: 'Từ vựng', kinds: ['vocab_h2m', 'vocab_m2h', 'vocab_p2m', 'vocab_pic'], hintVi: 'Nhìn chữ, nhìn hình, đoán nghĩa' },
  { id: 'nghe', labelVi: 'Nghe', kinds: ['listen_pick'], hintVi: 'Nghe rồi chọn nghĩa đúng' },
  { id: 'the', labelVi: 'Thẻ nhớ', kinds: ['flashcard'], hintVi: 'Lật thẻ, con tự đánh giá' },
  { id: 'nguphap', labelVi: 'Mẫu câu', kinds: ['grammar_fill'], hintVi: 'Điền từ vào chỗ trống' },
  { id: 'dich', labelVi: 'Dịch câu', kinds: ['translate_c2v', 'translate_v2c'], hintVi: 'Trung ↔ Việt' },
];

const DIFFICULTY: { v: Difficulty; labelVi: string; noteVi: string }[] = [
  { v: 'easy', labelVi: 'Dễ', noteVi: 'Có hình gợi ý và pinyin dưới chữ Hán.' },
  { v: 'medium', labelVi: 'Trung bình', noteVi: 'Ẩn pinyin gợi ý — con tự nhớ cách đọc.' },
  { v: 'hard', labelVi: 'Khó', noteVi: 'Ẩn cả pinyin lẫn hình — chỉ còn chữ Hán.' },
];

export function Picker() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const s = useSession();
  const [catalog, reload] = useAsync(() => api().getCatalog(s.curriculumId, s.level), [s.curriculumId, s.level]);
  const [groups, setGroups] = useState<string[]>(['tu', 'nghe']);
  const [startError, setStartError] = useState<string | null>(null);

  const preset = params.get('lesson') as LessonId | null;
  useEffect(() => {
    if (preset && !s.lessonIds.includes(preset)) s.setLessons([preset]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const start = useOnce(async () => {
    setStartError(null);
    const kinds = [...new Set(groups.flatMap((g) => KIND_GROUPS.find((k) => k.id === g)?.kinds ?? []))];
    try {
      const a = await api().startAttempt({
        curriculumId: s.curriculumId,
        level: s.level,
        lessonIds: s.lessonIds,
        kinds,
        questionCount: s.questionCount,
        difficulty: s.difficulty,
        mode: 'practice',
      });
      nav(`/hoc/${a.attemptId}`);
    } catch (e) {
      setStartError((e as Error).message);
    }
  });

  if (catalog.status === 'loading' || catalog.status === 'idle') return <Loading />;
  if (catalog.status === 'error') return <ErrorState message={catalog.message} onRetry={reload} />;

  const ready = catalog.data.lessons.filter((l) => l.ready);
  const chosenReady = s.lessonIds.filter((id) => ready.some((l) => l.lessonId === id));
  const canStart = chosenReady.length > 0 && groups.length > 0;

  return (
    <div className="page">
      <h1>Chọn bài để học</h1>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section" style={{ margin: 0 }}>Phạm vi bài</h2>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ minHeight: 36, padding: '6px 12px', fontSize: 13 }}
            onClick={() => s.setLessons(ready.map((l) => l.lessonId))}
          >
            Chọn tất cả
          </button>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {catalog.data.lessons.map((l) => (
            <button
              key={l.lessonId}
              type="button"
              className="chip"
              aria-pressed={s.lessonIds.includes(l.lessonId)}
              disabled={!l.ready}
              title={l.ready ? l.titleVi : 'Bài này chưa có nội dung được duyệt'}
              onClick={() => s.toggleLesson(l.lessonId)}
            >
              Bài {l.n}
              {!l.ready ? ' · chưa sẵn sàng' : ''}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Đang chọn: {chosenReady.length} bài.
        </p>
      </div>

      <div className="card">
        <h2 className="section">Hôm nay mình luyện gì?</h2>
        <div className="chips">
          {KIND_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip"
              aria-pressed={groups.includes(g.id)}
              title={g.hintVi}
              onClick={() =>
                setGroups((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))
              }
            >
              {g.labelVi}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section">Số câu</h2>
        <div className="chips">
          {[5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              className="chip"
              aria-pressed={s.questionCount === n}
              onClick={() => s.setQuestionCount(n)}
            >
              {n} câu
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={s.questionCount === 0}
            onClick={() => s.setQuestionCount(0)}
          >
            Toàn bộ
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Buổi tự học nên khoảng 5–10 phút. Cô giáo có thể chọn 20 câu hoặc toàn bộ ngân hàng.
        </p>
      </div>

      <div className="card">
        <h2 className="section">Độ khó</h2>
        <div className="chips">
          {DIFFICULTY.map((d) => (
            <button
              key={d.v}
              type="button"
              className="chip"
              aria-pressed={s.difficulty === d.v}
              onClick={() => s.setDifficulty(d.v)}
            >
              {d.labelVi}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {DIFFICULTY.find((d) => d.v === s.difficulty)?.noteVi}
        </p>
      </div>

      {startError ? <Banner kind="bad">{startError}</Banner> : null}

      <button type="button" className="btn btn--primary btn--block" disabled={!canStart} onClick={() => void start()}>
        Bắt đầu ▶
      </button>
      {!canStart ? (
        <p className="muted" style={{ marginTop: 8, textAlign: 'center' }}>
          {chosenReady.length === 0 ? 'Con chọn ít nhất một bài đã sẵn sàng nhé.' : 'Con chọn ít nhất một dạng bài nhé.'}
        </p>
      ) : null}
    </div>
  );
}
