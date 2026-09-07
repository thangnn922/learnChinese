import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './db.js';
import { isMainModule } from './is-main.js';
import { describeError, requireDatabaseUrl } from './startup.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../migrations');

export async function migrate(log = console.log): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(resolve(dir, f), 'utf8');
      // mỗi migration chạy trong MỘT giao dịch: lỗi giữa chừng không để lại lược đồ nửa vời
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
        log(`✓ ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} thất bại: ${(e as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  Promise.resolve()
    .then(() => {
      requireDatabaseUrl();
      return migrate();
    })
    .then((a) => {
      console.log(a.length ? `Đã áp dụng ${a.length} migration.` : 'Lược đồ đã cập nhật.');
      return closePool();
    })
    .catch((e: unknown) => {
      console.error(describeError(e));
      process.exit(1);
    });
}
