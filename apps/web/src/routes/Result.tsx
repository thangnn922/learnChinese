import { Link, useParams } from 'react-router-dom';
import { encouragementVi, formatAccuracyVi } from '@yct/shared';
import { api } from '../api/index';
import { useAsync } from '../hooks';
import { ErrorState, Loading } from '../components/States';
import { MascotLine } from '../components/Mascot';

export function Result() {
  const { attemptId = '' } = useParams();
  const [state, reload] = useAsync(() => api().getAttemptSummary(attemptId), [attemptId]);
  const [progress] = useAsync(() => api().getProgress(), [attemptId]);

  if (state.status === 'loading' || state.status === 'idle') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  const s = state.data;

  const wrongWords =
    progress.status === 'ok'
      ? progress.data.dueForReview.filter((d) => s.wrongContentIds.includes(d.contentId))
      : [];

  return (
    <div className="page page--learn">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44 }} aria-hidden="true">
          🎋
        </div>
        <h1>Xong buổi học rồi!</h1>

        <div style={{ display: 'grid', gap: 10, marginTop: 14, textAlign: 'left' }}>
          <Row
            label="Đúng ngay lần đầu"
            value={
              s.answeredObjective === 0
                ? 'Chưa có dữ liệu'
                : `${s.firstTryCorrect}/${s.answeredObjective} câu · ${formatAccuracyVi(s.firstTryAccuracy)}`
            }
          />
          {s.skipped > 0 ? <Row label="Câu bỏ qua" value={`${s.skipped} câu`} /> : null}
          {s.selfReportTotal > 0 ? (
            <Row
              label="Thẻ nhớ con tự đánh giá"
              value={`${s.selfReportRemembered}/${s.selfReportTotal} thẻ · ghi riêng, không tính vào điểm`}
            />
          ) : null}
        </div>

        <MascotLine mood="cheer" text={encouragementVi(s)} />
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Làm xong bài không có nghĩa là đã thành thạo — mình ôn lại vài lần nữa cho chắc nhé.
        </p>
      </div>

      {wrongWords.length > 0 ? (
        <div className="card">
          <h2 className="section">Mình ôn lại mấy mục này nhé</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {wrongWords.map((w) => (
              <li key={w.contentId} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <b lang="zh-Hans" style={{ fontFamily: 'var(--font-zh)', fontSize: 24 }}>
                  {w.hanzi}
                </b>
                <span style={{ color: 'var(--seal-text)', fontWeight: 700 }}>{w.pinyin}</span>
                <span>{w.meaningVi}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <Link to="/chon" className="btn btn--primary btn--block" style={{ textAlign: 'center', textDecoration: 'none' }}>
          Học tiếp bài khác
        </Link>
        <Link to="/" className="btn btn--ghost btn--block" style={{ textAlign: 'center', textDecoration: 'none' }}>
          Về trang đầu
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
      }}
    >
      <span className="muted">{label}</span>
      <b style={{ textAlign: 'right' }}>{value}</b>
    </div>
  );
}
