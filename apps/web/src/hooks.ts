import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string; code?: string };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const alive = useRef(true);
  const run = useCallback(() => {
    setState({ status: 'loading' });
    fn()
      .then((data) => alive.current && setState({ status: 'ok', data }))
      .catch((e: unknown) => {
        const err = e as { message?: string; code?: string };
        if (alive.current)
          setState({ status: 'error', message: err.message ?? 'Có lỗi xảy ra.', code: err.code });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
  }, [run]);

  return [state, run];
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Khoá tránh double-submit; trả về hàm bọc chỉ chạy một lần cho tới khi xong. */
export function useOnce<A extends unknown[]>(fn: (...a: A) => Promise<void>) {
  const busy = useRef(false);
  return useCallback(
    async (...a: A) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await fn(...a);
      } finally {
        busy.current = false;
      }
    },
    [fn],
  );
}

/** Khoá idempotency ổn định cho một hành động cụ thể. */
export function idemKey(parts: (string | number)[]): string {
  return parts.join('|').slice(0, 120);
}

/** Đo thời gian thực sự ở trên màn hình (dừng khi tab bị ẩn). */
export function useActiveTimer(resetKey: string): () => number {
  const acc = useRef(0);
  const last = useRef<number>(Date.now());
  const hidden = useRef(false);

  useEffect(() => {
    acc.current = 0;
    last.current = Date.now();
  }, [resetKey]);

  useEffect(() => {
    const onVis = () => {
      const now = Date.now();
      if (document.hidden) {
        if (!hidden.current) acc.current += now - last.current;
        hidden.current = true;
      } else {
        last.current = now;
        hidden.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return useCallback(() => {
    const now = Date.now();
    const total = acc.current + (hidden.current ? 0 : now - last.current);
    return Math.min(total, 60 * 60 * 1000);
  }, []);
}
