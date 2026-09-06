import { NavLink, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './session';
import { Home } from './routes/Home';
import { Picker } from './routes/Picker';
import { Learn } from './routes/Learn';
import { Result } from './routes/Result';
import { Games } from './routes/Games';
import { ProgressPage } from './routes/Progress';
import { Teacher } from './routes/Teacher';
import { EmptyState } from './components/States';

const TABS = [
  { to: '/', icon: '🏠', label: 'Học', end: true },
  { to: '/luyen-tap', icon: '✏️', label: 'Luyện tập', end: false },
  { to: '/tro-choi', icon: '🎲', label: 'Trò chơi', end: false },
  { to: '/tien-do', icon: '🌱', label: 'Tiến độ', end: false },
];

export function App() {
  return (
    <SessionProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Bỏ qua điều hướng
        </a>
        <nav className="tabbar" aria-label="Điều hướng chính">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}>
              <span className="ico" aria-hidden="true">
                {t.icon}
              </span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>

        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chon" element={<Picker />} />
            <Route path="/luyen-tap" element={<Picker />} />
            <Route path="/hoc/:attemptId" element={<Learn />} />
            <Route path="/ket-qua/:attemptId" element={<Result />} />
            <Route path="/tro-choi" element={<Games />} />
            <Route path="/tien-do" element={<ProgressPage />} />
            <Route path="/giao-vien" element={<Teacher />} />
            <Route
              path="*"
              element={
                <div className="page">
                  <EmptyState icon="🧭" title="Không tìm thấy trang này">
                    Con quay về trang đầu nhé.
                  </EmptyState>
                </div>
              }
            />
          </Routes>
        </main>

        <footer style={{ textAlign: 'center', padding: '8px 16px 88px' }}>
          <NavLink to="/giao-vien" className="muted link-tap" style={{ fontSize: 13 }}>
            Khu vực giáo viên
          </NavLink>
        </footer>
      </div>
    </SessionProvider>
  );
}
