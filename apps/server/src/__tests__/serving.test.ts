/**
 * Kiểm thử phần triển khai: một origin phục vụ cả giao diện đã build lẫn API.
 *
 * Không cần cơ sở dữ liệu cho phần lớn các trường hợp ở đây — chỉ /api/health/db mới chạm DB.
 * Dùng một thư mục build giả để không phụ thuộc vào việc đã chạy `vite build` hay chưa.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { closePool } from '../db.js';

let app: FastifyInstance;
let webDist: string;

const HASHED_JS = 'app-Ab12Cd34.js';
const INDEX_HTML = '<!doctype html><html lang="vi"><head><title>YCT</title></head><body><div id="root"></div></body></html>';

beforeAll(async () => {
  webDist = mkdtempSync(join(tmpdir(), 'yct-web-dist-'));
  mkdirSync(join(webDist, 'assets'));
  writeFileSync(join(webDist, 'index.html'), INDEX_HTML, 'utf8');
  writeFileSync(join(webDist, 'assets', HASHED_JS), 'export const ok = 1;\n', 'utf8');
  // Tệp KHÔNG được phép lộ ra ngoài nếu ai đó vô tình đặt nhầm chỗ.
  writeFileSync(join(webDist, '.env'), 'DATABASE_URL=postgres://khong-duoc-lo\n', 'utf8');
  app = await buildApp({ webDist });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closePool().catch(() => undefined);
  rmSync(webDist, { recursive: true, force: true });
});

describe('DEP-02 — điều hướng giao diện', () => {
  it('trang gốc trả index.html', async () => {
    const r = await app.inject({ method: 'GET', url: '/' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('id="root"');
  });

  it('mở thẳng / tải lại một route bài học trả index.html chứ không 404', async () => {
    for (const url of ['/hoc/6f1d9a2e-0d2a-4d8f-9a1e-2c3b4d5e6f70', '/tien-do', '/giao-vien', '/chon']) {
      const r = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });
      expect(r.statusCode, url).toBe(200);
      expect(r.headers['content-type'], url).toContain('text/html');
      expect(r.body, url).toContain('id="root"');
    }
  });

  it('index.html luôn được kiểm tra lại, không bị cache dài hạn', async () => {
    for (const url of ['/', '/tien-do']) {
      const r = await app.inject({ method: 'GET', url });
      expect(String(r.headers['cache-control']), url).toContain('no-cache');
    }
  });

  it('tệp có vân tay nội dung được cache dài hạn', async () => {
    const r = await app.inject({ method: 'GET', url: `/assets/${HASHED_JS}` });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['cache-control'])).toContain('immutable');
  });
});

describe('DEP-03 — 404 đúng loại', () => {
  it('API không tồn tại trả JSON 404, KHÔNG trả index.html', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/khong-co-that' });
    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.body).not.toContain('id="root"');
    expect(JSON.parse(r.body).code).toBe('NOT_FOUND');
  });

  it('API không tồn tại với method ghi cũng trả JSON 404', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/khong-co-that', payload: {} });
    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toContain('application/json');
  });

  it('tệp tĩnh không tồn tại trả 404, không nuốt bằng SPA fallback', async () => {
    for (const url of ['/assets/khong-co.js', '/assets/khong-co.css', '/anh/thieu.png']) {
      const r = await app.inject({ method: 'GET', url, headers: { accept: '*/*' } });
      expect(r.statusCode, url).toBe(404);
      expect(r.body, url).not.toContain('id="root"');
    }
  });

  it('request không phải điều hướng trang (không nhận HTML) không nhận index.html', async () => {
    const r = await app.inject({ method: 'GET', url: '/khong-co', headers: { accept: 'application/json' } });
    expect(r.statusCode).toBe(404);
    expect(r.headers['content-type']).toContain('application/json');
  });

  it('POST vào đường dẫn giao diện không trả index.html với status 200', async () => {
    const r = await app.inject({ method: 'POST', url: '/tien-do', payload: {} });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain('id="root"');
  });
});

describe('SEC-01 — không lộ tệp ngoài thư mục build', () => {
  it('tệp ẩn trong thư mục build bị từ chối', async () => {
    const r = await app.inject({ method: 'GET', url: '/.env' });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain('DATABASE_URL');
  });

  it('đi ngược thư mục không lấy được tệp của repo', async () => {
    for (const url of ['/../package.json', '/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json']) {
      const r = await app.inject({ method: 'GET', url, headers: { accept: '*/*' } });
      expect(r.statusCode, url).toBeGreaterThanOrEqual(400);
      expect(r.body, url).not.toContain('"@yct/server"');
      expect(r.body, url).not.toContain('"workspaces"');
    }
  });
});

describe('health', () => {
  it('liveness không chạm cơ sở dữ liệu và không lộ cấu hình', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
    expect(r.body).not.toContain('postgres');
    expect(r.body).not.toContain('NODE_ENV');
  });

  it('readiness trả 200 khi DB phản hồi, 503 khi không', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health/db' });
    expect([200, 503]).toContain(r.statusCode);
    expect(String(r.headers['cache-control'])).toContain('no-store');
  });
});

describe('chạy không có bản build giao diện', () => {
  it('chỉ phục vụ API; đường dẫn giao diện trả 404 JSON', async () => {
    const apiOnly = await buildApp({ webDist: null });
    await apiOnly.ready();
    const html = await apiOnly.inject({ method: 'GET', url: '/tien-do', headers: { accept: 'text/html' } });
    expect(html.statusCode).toBe(404);
    expect(html.headers['content-type']).toContain('application/json');
    const health = await apiOnly.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    await apiOnly.close();
  });
});
