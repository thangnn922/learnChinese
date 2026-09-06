import { useCallback, useState } from 'react';
import type { ContentType, ValidatedBatch } from '@yct/shared';
import { KIND_SPECS, toTsv } from '@yct/shared';
import { api, backendMode } from '../api/index';
import type { ImportPreview, SessionUser } from '../api/types';
import { useAsync, useOnce } from '../hooks';
import { Banner, DraftBadge, EmptyState, ErrorState, Loading } from '../components/States';
import { useSession } from '../session';

export function Teacher() {
  const [me, reloadMe] = useAsync(() => api().me(), []);

  if (me.status === 'loading' || me.status === 'idle') return <Loading />;
  if (me.status === 'error') return <ErrorState message={me.message} onRetry={reloadMe} />;

  const user = me.data;
  if (!user || user.role === 'student') return <TeacherLogin onDone={reloadMe} />;
  return <TeacherDashboard user={user} />;
}

function TeacherLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api().loginTeacher(email, password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Khu vực giáo viên</h1>
      {backendMode === 'demo' ? (
        <Banner kind="warn">
          Bản dùng thử trên thiết bị này <b>không có tài khoản giáo viên</b>. Tài khoản do quản trị viên cấp và chỉ
          hoạt động khi chạy bản có máy chủ.
        </Banner>
      ) : null}
      <form className="card" onSubmit={submit}>
        <p className="muted" style={{ marginTop: 0 }}>
          Tài khoản do quản trị viên cấp. Không có đăng ký tự do.
        </p>
        <label htmlFor="t-email">
          <b>Email</b>
        </label>
        <input
          id="t-email"
          type="text"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <label htmlFor="t-pass">
          <b>Mật khẩu</b>
        </label>
        <input
          id="t-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {error ? <Banner kind="bad">{error}</Banner> : null}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}

function TeacherDashboard({ user }: { user: SessionUser }) {
  const { curriculumId, level } = useSession();
  const [tab, setTab] = useState<'content' | 'import' | 'classes'>('content');

  return (
    <div className="page page--wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Bảng điều khiển giáo viên</h1>
        <span className="muted">
          {user.displayName} · {backendMode === 'demo' ? 'bản trên thiết bị này' : 'máy chủ'}
        </span>
      </div>

      <div className="chips" style={{ margin: '14px 0' }}>
        <button type="button" className="chip" aria-pressed={tab === 'content'} onClick={() => setTab('content')}>
          Nội dung
        </button>
        <button type="button" className="chip" aria-pressed={tab === 'import'} onClick={() => setTab('import')}>
          Nhập dữ liệu
        </button>
        <button type="button" className="chip" aria-pressed={tab === 'classes'} onClick={() => setTab('classes')}>
          Lớp &amp; báo cáo
        </button>
      </div>

      {tab === 'content' ? <ContentPanel curriculumId={curriculumId} level={level} /> : null}
      {tab === 'import' ? <ImportPanel curriculumId={curriculumId} level={level} /> : null}
      {tab === 'classes' ? <ClassPanel /> : null}
    </div>
  );
}

function ContentPanel({ curriculumId, level }: { curriculumId: 'yct' | 'hsk'; level: number }) {
  const [state, reload] = useAsync(() => api().teacherListDraft(curriculumId, level), [curriculumId, level]);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const review = useOnce(async () => {
    const r = await api().teacherReview(selected);
    setMsg(`Đã đánh dấu ${r.reviewed} mục là đã duyệt.`);
    setSelected([]);
    reload();
  });

  if (state.status === 'loading' || state.status === 'idle') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  const items = state.data;
  if (!items.length) return <EmptyState icon="📭" title="Chưa có nội dung nào cho chương trình này" />;

  const counts = {
    draft: items.filter((i) => i.status === 'draft').length,
    reviewed: items.filter((i) => i.status === 'reviewed').length,
    published: items.filter((i) => i.status === 'published').length,
  };

  return (
    <div className="card">
      <h2 className="section">Ngân hàng nội dung</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {items.length} mục · nháp {counts.draft} · đã duyệt {counts.reviewed} · đã xuất bản {counts.published}
      </p>
      {msg ? <Banner kind="ok">{msg}</Banner> : null}

      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">Danh sách nội dung, chọn để đánh dấu đã duyệt</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Chọn</span>
              </th>
              <th scope="col">Bài</th>
              <th scope="col">Hán tự</th>
              <th scope="col">Pinyin</th>
              <th scope="col">Nghĩa tiếng Việt</th>
              <th scope="col">Nguồn</th>
              <th scope="col">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 400).map((i) => (
              <tr key={i.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${i.hanzi}`}
                    checked={selected.includes(i.id)}
                    onChange={(e) =>
                      setSelected((cur) => (e.target.checked ? [...cur, i.id] : cur.filter((x) => x !== i.id)))
                    }
                  />
                </td>
                <td>{i.lessonId.split('-l')[1]}</td>
                <td lang="zh-Hans" style={{ fontFamily: 'var(--font-zh)', fontSize: 18 }}>
                  {i.hanzi}
                </td>
                <td>{i.pinyin}</td>
                <td>{i.meaningVi}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {i.source.fileName}
                  {i.source.printedPage ? ` · tr.${i.source.printedPage}` : ''}
                  <br />
                  {i.meaningOrigin === 'ai_draft' ? 'Nghĩa Việt: bản dịch AI' : 'Nghĩa Việt: người soạn'}
                </td>
                <td>
                  {i.status === 'published' && i.source.verificationStatus !== 'verified_by_teacher' ? (
                    <DraftBadge />
                  ) : (
                    i.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 400 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Đang hiện 400 mục đầu tiên trong {items.length}.
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn--secondary"
        style={{ marginTop: 12 }}
        disabled={selected.length === 0}
        onClick={() => void review()}
      >
        Đánh dấu {selected.length} mục là đã duyệt
      </button>
    </div>
  );
}

function ImportPanel({ curriculumId, level }: { curriculumId: 'yct' | 'hsk'; level: number }) {
  const [kind, setKind] = useState<ContentType>('vocab');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [batch, setBatch] = useState<ValidatedBatch | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** Sửa nội dung hoặc đổi loại → huỷ kết quả kiểm tra cũ. */
  const invalidate = useCallback(() => {
    setPreview(null);
    setBatch(null);
    setMsg(null);
  }, []);

  const validate = useOnce(async () => {
    setBusy(true);
    try {
      const p = await api().teacherValidateImport(kind, text, curriculumId, level, mode);
      setPreview(p);
      setBatch(p.batch);
      setMsg(
        p.canPublish
          ? { kind: 'ok', text: `Đọc được ${p.rowsRead} dòng, hợp lệ ${p.rowsRead - p.rowsRejected}.` }
          : { kind: 'bad', text: 'Có lỗi — chưa xuất bản được. Sửa các dòng bên dưới rồi kiểm tra lại.' },
      );
    } catch (e) {
      setMsg({ kind: 'bad', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  });

  const publish = useOnce(async () => {
    if (!batch) {
      setMsg({ kind: 'bad', text: 'Bấm “Kiểm tra” trước đã.' });
      return;
    }
    setBusy(true);
    try {
      const r = await api().teacherPublish(batch, text, mode);
      // CHỈ báo thành công sau khi máy chủ xác nhận
      setMsg({ kind: 'ok', text: `Đã xuất bản phiên bản ${r.revision} với ${r.publishedCount} mục.` });
      setBatch(null);
      setPreview(null);
    } catch (e) {
      const err = e as { code?: string; message: string };
      setMsg({
        kind: 'bad',
        text:
          err.code === 'BATCH_STALE'
            ? 'Nội dung đã thay đổi sau lần kiểm tra. Bấm “Kiểm tra” lại rồi xuất bản.'
            : err.code === 'REVISION_CONFLICT'
              ? 'Có người vừa xuất bản phiên bản mới hơn. Tải lại, đối chiếu rồi xuất bản lại.'
              : err.message,
      });
      setBatch(null);
    } finally {
      setBusy(false);
    }
  });

  const spec = KIND_SPECS[kind];
  const errors = preview?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === 'warning') ?? [];

  return (
    <div className="card">
      <h2 className="section">Nhập nội dung từ Google Sheets / CSV</h2>

      <div className="chips" style={{ marginBottom: 12 }}>
        {(['vocab', 'sentence', 'grammar'] as ContentType[]).map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              invalidate(); // đổi loại → batch cũ hết hiệu lực
            }}
          >
            {KIND_SPECS[k].titleVi}
          </button>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Cột: <code>{spec.templateHeader.join(', ')}</code>. Dán trực tiếp từ Google Sheets (TSV) hoặc dán CSV.
      </p>

      <label htmlFor="imp">
        <b>Dữ liệu</b>
      </label>
      <textarea
        id="imp"
        rows={10}
        value={text}
        placeholder="Dán dữ liệu vào đây…"
        onChange={(e) => {
          setText(e.target.value);
          invalidate(); // sửa nội dung → batch cũ hết hiệu lực
        }}
      />

      <div className="chips" style={{ margin: '12px 0' }}>
        <button
          type="button"
          className="chip"
          aria-pressed={mode === 'merge'}
          onClick={() => {
            setMode('merge');
            invalidate();
          }}
        >
          Gộp theo ID (mặc định)
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={mode === 'replace'}
          onClick={() => {
            setMode('replace');
            invalidate();
          }}
        >
          Thay thế toàn bộ loại này
        </button>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" disabled={busy || !text.trim()} onClick={() => void validate()}>
          Kiểm tra
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !preview?.canPublish || !batch}
          onClick={() => void publish()}
        >
          Xuất bản cho lớp
        </button>
      </div>

      {msg ? (
        <div style={{ marginTop: 12 }}>
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      ) : null}

      {preview?.diff ? (
        <div style={{ marginTop: 12 }}>
          <h2 className="section">Xem trước thay đổi</h2>
          <p style={{ margin: 0 }}>
            Thêm <b>{preview.diff.added.length}</b> · Sửa <b>{preview.diff.updated.length}</b> · Giữ nguyên{' '}
            <b>{preview.diff.unchanged}</b>
            {mode === 'replace' ? (
              <>
                {' '}
                · <b style={{ color: 'var(--seal-text)' }}>Xoá {preview.diff.removed.length}</b>
              </>
            ) : null}
          </p>
          {mode === 'replace' && preview.diff.removed.length > 0 ? (
            <>
              <Banner kind="warn">
                Chế độ thay thế sẽ xoá {preview.diff.removed.length} mục không có trong lô mới. Danh sách bên dưới.
              </Banner>
              <ul className="issue-list">
                {preview.diff.removed.slice(0, 30).map((r) => (
                  <li key={r.id} className="issue" data-sev="warning">
                    {r.hanzi} — {r.meaningVi}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {errors.length > 0 || warnings.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <h2 className="section">
            {errors.length} lỗi · {warnings.length} cảnh báo
          </h2>
          <ul className="issue-list">
            {[...errors, ...warnings].slice(0, 60).map((i, n) => (
              <li key={n} className="issue" data-sev={i.severity}>
                {i.line ? `Dòng ${i.line}` : 'Chung'}
                {i.column ? ` · ${i.column}` : ''}: {i.messageVi}
              </li>
            ))}
          </ul>
          {errors.length > 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Còn lỗi thì không xuất bản được — kể cả những dòng hợp lệ trong cùng lô.
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <h2 className="section">Mẫu để tạo Sheet</h2>
        <textarea
          readOnly
          rows={3}
          value={toTsv(spec.templateHeader, [
            kind === 'vocab'
              ? ['1', '你', 'nǐ', 'bạn', '👤']
              : kind === 'sentence'
                ? ['1', '你好！', 'Nǐ hǎo!', 'Xin chào!']
                : ['1', '老师___！', 'Chào cô giáo', '好', '再见', '你', '十', 'Chào ai đó: tên/chức danh + 好.'],
          ])}
        />
      </div>
    </div>
  );
}

function ClassPanel() {
  const [state, reload] = useAsync(() => api().teacherListClassrooms(), []);
  if (state.status === 'loading' || state.status === 'idle') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  if (!state.data.length)
    return (
      <EmptyState icon="🏫" title="Chưa có lớp nào">
        {backendMode === 'demo'
          ? 'Bản trên thiết bị này không quản lý lớp được. Cần chạy bản có máy chủ.'
          : 'Quản trị viên chưa gán lớp nào cho tài khoản này.'}
      </EmptyState>
    );
  return (
    <div className="card">
      <h2 className="section">Lớp của tôi</h2>
      <ul>
        {state.data.map((c) => (
          <li key={c.classroomId}>
            {c.name} — {c.studentCount} học sinh
          </li>
        ))}
      </ul>
    </div>
  );
}
