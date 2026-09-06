import { DemoApi } from './demo/demoApi';
import { HttpApi } from './httpApi';
import type { BackendMode, LearnApi } from './types';

/**
 * Chọn chế độ:
 *   VITE_BACKEND=server  → gọi máy chủ thật (lớp học, bài giao, báo cáo)
 *   mặc định             → bản demo trên thiết bị này
 *
 * Giao diện phải luôn hiển thị nhãn chế độ cho người dùng — xem <ModeBadge />.
 */
const mode: BackendMode =
  (import.meta.env.VITE_BACKEND as BackendMode | undefined) === 'server' ? 'server' : 'demo';

let instance: LearnApi | null = null;

export function api(): LearnApi {
  if (!instance) instance = mode === 'server' ? new HttpApi() : new DemoApi();
  return instance;
}

export const backendMode = mode;
export type { LearnApi } from './types';
export * from './types';
