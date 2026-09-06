/**
 * Kho lưu trữ cho BẢN DEMO — chạy hoàn toàn trên thiết bị này.
 *
 * Dùng IndexedDB; nếu trình duyệt chặn (chế độ riêng tư, thiết lập chặn dữ liệu trang)
 * thì tự rơi về bộ nhớ tạm trong phiên và báo cho giao diện biết.
 *
 * KHÔNG lưu ở đây: token đăng nhập, đáp án của bài kiểm tra thật, dữ liệu riêng của trẻ.
 * Bản demo chỉ có biệt danh do người dùng tự đặt.
 */

const DB_NAME = 'yct-demo';
const DB_VERSION = 1;
const STORES = ['content', 'attempts', 'answers', 'selfReports', 'review', 'meta', 'revisions'] as const;
export type StoreName = (typeof STORES)[number];

export interface DemoStore {
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  all<T>(store: StoreName): Promise<{ key: string; value: T }[]>;
  clear(store: StoreName): Promise<void>;
}

function memoryStore(): DemoStore {
  const data = new Map<StoreName, Map<string, unknown>>();
  const of = (s: StoreName) => {
    let m = data.get(s);
    if (!m) {
      m = new Map();
      data.set(s, m);
    }
    return m;
  };
  return {
    persistent: false,
    async get<T>(s: StoreName, k: string) {
      return of(s).get(k) as T | undefined;
    },
    async put<T>(s: StoreName, k: string, v: T) {
      of(s).set(k, v);
    },
    async all<T>(s: StoreName) {
      return [...of(s).entries()].map(([key, value]) => ({ key, value: value as T }));
    },
    async clear(s: StoreName) {
      of(s).clear();
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB lỗi'));
    req.onblocked = () => reject(new Error('IndexedDB đang bị khoá bởi tab khác'));
  });
}

function idbStore(db: IDBDatabase): DemoStore {
  const tx = <T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error('Lỗi ghi dữ liệu'));
    });

  return {
    persistent: true,
    get: (s, k) => tx(s, 'readonly', (os) => os.get(k)),
    put: (s, k, v) => tx<void>(s, 'readwrite', (os) => os.put(v, k)).then(() => undefined),
    async all<T>(s: StoreName) {
      const keys = await tx<IDBValidKey[]>(s, 'readonly', (os) => os.getAllKeys());
      const values = await tx<T[]>(s, 'readonly', (os) => os.getAll());
      return keys.map((k, i) => ({ key: String(k), value: values[i] as T }));
    },
    clear: (s) => tx<void>(s, 'readwrite', (os) => os.clear()).then(() => undefined),
  };
}

let cached: Promise<DemoStore> | null = null;

export function getDemoStore(): Promise<DemoStore> {
  if (cached) return cached;
  cached = (async () => {
    if (typeof indexedDB === 'undefined') return memoryStore();
    try {
      return idbStore(await openDb());
    } catch {
      return memoryStore();
    }
  })();
  return cached;
}

/** Chỉ dùng trong kiểm thử. */
export function __resetDemoStore(): void {
  cached = null;
}
