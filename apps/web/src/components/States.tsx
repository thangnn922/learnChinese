import type { ReactNode } from 'react';

/** Trạng thái đang tải — có vùng aria-live để trình đọc màn hình biết. */
export function Loading({ label = 'Đang tải…', full = true }: { label?: string; full?: boolean }) {
  return (
    <div className={full ? 'state state--page' : 'state'} role="status" aria-live="polite">
      <div className="state-ico" aria-hidden="true">
        ⏳
      </div>
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state-ico" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Có gì đó chưa ổn',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state" role="alert">
      <div className="state-ico" aria-hidden="true">
        🙁
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn--ghost" style={{ marginTop: 16 }} onClick={onRetry}>
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

export function Banner({
  kind,
  children,
  icon,
}: {
  kind: 'ok' | 'warn' | 'bad' | 'info';
  children: ReactNode;
  icon?: string;
}) {
  const fallback = { ok: '✓', warn: '⚠', bad: '✕', info: 'ℹ' }[kind];
  return (
    <div className="banner" data-kind={kind} role={kind === 'bad' ? 'alert' : undefined}>
      <span aria-hidden="true">{icon ?? fallback}</span>
      <span>{children}</span>
    </div>
  );
}

/** Nhãn nội dung chưa được giáo viên duyệt — bắt buộc hiển thị ở mọi nơi dùng nội dung nháp. */
export function DraftBadge({ reason }: { reason?: string }) {
  return (
    <span className="pill-draft" title={reason}>
      <span aria-hidden="true">✎</span> Nội dung nháp — chưa có giáo viên duyệt
    </span>
  );
}
