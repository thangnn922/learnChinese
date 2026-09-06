import { Link, useNavigate } from 'react-router-dom';
import { api, backendMode } from '../api/index';
import { useAsync } from '../hooks';
import { Banner, DraftBadge, ErrorState } from '../components/States';
import { MascotLine } from '../components/Mascot';
import { useSession } from '../session';

export function Home() {
  const nav = useNavigate();
  const { curriculumId, level, setCurriculum, lessonIds } = useSession();
  const [curricula] = useAsync(() => api().listCurricula(), []);
  const [catalog, reload] = useAsync(() => api().getCatalog(curriculumId, level), [curriculumId, level]);
  const [resumable] = useAsync(() => api().findResumableAttempt(), []);

  // Khi đang tải, dựng sẵn KHUNG đúng kích thước (skeleton) thay vì một vòng xoay ở giữa,
  // để lúc dữ liệu về trang không bị nhảy (CLS).
  if (catalog.status === 'loading' || catalog.status === 'idle') return <HomeSkeleton />;
  if (catalog.status === 'error')
    return <ErrorState message={catalog.message} onRetry={reload} />;

  const c = catalog.data;
  const readyLessons = c.lessons.filter((l) => l.ready);
  const draftOnly = c.lessons.some((l) => l.publishedItems > 0) && !c.curriculum.sourceVerified;

  return (
    <div className="page">
      <header style={{ textAlign: 'center', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          Hôm nay mình học gì?
        </p>
        <h1>
          <span lang="zh-Hans" style={{ color: 'var(--seal-text)', fontFamily: 'var(--font-zh)' }}>
            学
          </span>{' '}
          Học tiếng Trung cùng Panda
        </h1>
      </header>

      {backendMode === 'demo' ? (
        <Banner kind="info" icon="📱">
          Bản dùng thử — <b>dữ liệu chỉ nằm trên thiết bị này</b>. Chưa có lớp học, chưa đồng bộ giữa hai máy.
        </Banner>
      ) : null}

      {draftOnly ? (
        <div style={{ marginBottom: 12 }}>
          <DraftBadge reason={c.noteVi} />
        </div>
      ) : null}

      {resumable.status === 'ok' && resumable.data ? (
        <div className="card">
          <h2 className="section">Đang học dở</h2>
          <p style={{ margin: '0 0 12px' }}>{resumable.data.label}</p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => nav(`/hoc/${resumable.data!.attemptId}`)}
          >
            Học tiếp ▶
          </button>
        </div>
      ) : null}

      <div className="card">
        <h2 className="section">Chương trình</h2>
        <div className="chips">
          {(curricula.status === 'ok' ? curricula.data : []).map((cu) => (
            <button
              key={`${cu.curriculumId}${cu.level}`}
              type="button"
              className="chip"
              aria-pressed={cu.curriculumId === curriculumId && cu.level === level}
              onClick={() => setCurriculum(cu.curriculumId, cu.level)}
            >
              {cu.nameVi}
            </button>
          ))}
        </div>
        {!c.curriculum.sourceVerified ? (
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {c.noteVi}
          </p>
        ) : null}
      </div>

      {c.emptyPublished ? (
        <div className="card">
          <div className="state">
            <div className="state-ico" aria-hidden="true">
              📭
            </div>
            <h2>Chưa có bài học</h2>
            <p>
              Chương trình này chưa có nội dung nào được giáo viên duyệt. Con chọn chương trình khác, hoặc nhờ cô
              đăng bài mới nhé.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2 className="section">Bài học</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {c.lessons.map((l) => (
              <li key={l.lessonId}>
                <Link
                  to={`/chon?lesson=${l.lessonId}`}
                  className="lesson-link"
                  aria-disabled={!l.ready}
                  tabIndex={l.ready ? undefined : -1}
                  onClick={(e) => {
                    if (!l.ready) e.preventDefault();
                  }}
                >
                  <span className="num" aria-hidden="true">
                    {l.n}
                  </span>
                  <span className="body">
                    <b>{l.titleVi}</b>
                    <br />
                    <span lang="zh-Hans" className="muted">
                      {l.titleZh}
                    </span>
                  </span>
                  <span className="meta">{l.ready ? `${l.publishedItems} mục` : 'Chưa sẵn sàng'}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Bài chưa sẵn sàng là bài chưa có nội dung được duyệt.
          </p>
        </div>
      )}

      {readyLessons.length > 0 ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 14 }}
          onClick={() => nav(`/chon${lessonIds.length ? '' : `?lesson=${readyLessons[0]!.lessonId}`}`)}
        >
          Bắt đầu học ▶
        </button>
      ) : null}

      <MascotLine text="Mỗi buổi 5–10 phút thôi, mình học đều là nhớ lâu!" />
    </div>
  );
}


/** Khung giữ chỗ cho trang đầu — cùng số hàng, cùng chiều cao với nội dung thật. */
function HomeSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <header style={{ textAlign: 'center', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          Hôm nay mình học gì?
        </p>
        <h1>
          <span lang="zh-Hans" style={{ color: 'var(--seal-text)', fontFamily: 'var(--font-zh)' }}>
            学
          </span>{' '}
          Học tiếng Trung cùng Panda
        </h1>
      </header>
      <div className="card">
        <h2 className="section">Chương trình</h2>
        <div className="skeleton-row" style={{ height: 44 }} />
      </div>
      <div className="card">
        <h2 className="section">Bài học</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="skeleton-row" style={{ height: 68 }} />
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">
        Đang tải danh sách bài học…
      </p>
    </div>
  );
}
