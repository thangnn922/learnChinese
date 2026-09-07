import { Link } from 'react-router-dom';
import { formatAccuracyVi } from '@yct/shared';
import { api } from '../api/index';
import { useAsync } from '../hooks';
import { EmptyState, ErrorState, Loading } from '../components/States';

export function ProgressPage() {
  const [state, reload] = useAsync(() => api().getProgress(), []);
  const [me] = useAsync(() => api().me(), []);

  if (state.status === 'loading' || state.status === 'idle') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  const p = state.data;

  // Khách luyện tập không có tiến độ được lưu. Nói thẳng điều đó, thay vì để trẻ vừa
  // học xong lại thấy "chưa có dữ liệu" rồi tưởng mình làm sai ở đâu.
  const isGuest = me.status === 'ok' && me.data === null;
  if (isGuest) {
    return (
      <div className="page">
        <h1>Tiến độ của con</h1>
        <EmptyState icon="🌱" title="Buổi luyện tập không được lưu lại">
          Con đang luyện tập ở chế độ khách nên máy không nhớ kết quả sau khi đóng trang. Con vẫn
          học và chơi thoải mái nhé!
          <br />
          <br />
          Muốn xem mình tiến bộ tới đâu thì đăng nhập bằng mã lớp cô giáo cho.
          <br />
          <Link className="link-tap" to="/giao-vien">
            Khu vực giáo viên
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (p.totalAnswered === 0 && p.dueForReview.length === 0) {
    return (
      <div className="page">
        <h1>Tiến độ của con</h1>
        <EmptyState icon="🌱" title="Chưa có dữ liệu">
          Con làm một buổi học ngắn đi, rồi quay lại đây xem mình đã nhớ được những gì nhé.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Tiến độ của con</h1>

      <div className="card">
        <h2 className="section">Tổng quan</h2>
        <p style={{ margin: 0 }}>
          Đã trả lời <b>{p.totalAnswered}</b> câu được chấm.
          <br />
          Đúng ngay lần đầu: <b>{formatAccuracyVi(p.firstTryAccuracy)}</b>
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Chỉ tính câu chấm khách quan ở <b>lần trả lời đầu tiên</b>. Thẻ nhớ con tự đánh giá và câu bỏ qua được
          ghi riêng.
        </p>
      </div>

      <div className="card">
        <h2 className="section">Đến hẹn ôn lại</h2>
        {p.dueForReview.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Hôm nay chưa có mục nào tới hạn ôn. Mình học bài mới nhé!
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {p.dueForReview.map((w) => (
              <li key={w.contentId} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <b lang="zh-Hans" style={{ fontFamily: 'var(--font-zh)', fontSize: 24 }}>
                  {w.hanzi}
                </b>
                <span style={{ color: 'var(--seal-text)', fontWeight: 700 }}>{w.pinyin}</span>
                <span>{w.meaningVi}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Lịch ôn 1 / 3 / 7 ngày là cách sắp xếp của ứng dụng để con đỡ quên — không phải kết luận về mức thành
          thạo.
        </p>
      </div>

      {p.recentAttempts.length > 0 ? (
        <div className="card">
          <h2 className="section">Các buổi gần đây</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Lúc</th>
                  <th scope="col">Số câu</th>
                  <th scope="col">Đúng lần đầu</th>
                  <th scope="col">Thẻ nhớ</th>
                </tr>
              </thead>
              <tbody>
                {p.recentAttempts.map((a) => (
                  <tr key={a.attemptId}>
                    <td>{new Date(a.at).toLocaleString('vi-VN')}</td>
                    <td>{a.summary.answeredObjective}</td>
                    <td>{formatAccuracyVi(a.summary.firstTryAccuracy)}</td>
                    <td>
                      {a.summary.selfReportTotal
                        ? `${a.summary.selfReportRemembered}/${a.summary.selfReportTotal}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
