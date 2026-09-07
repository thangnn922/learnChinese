import type { PoolClient } from 'pg';
import { ContentItemSchema, type ContentItem } from '@yct/shared';
import { query, one, tx } from './db.js';

/** Revision đang hành. */
export async function headRevision(): Promise<number> {
  const r = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
  return r?.revision ?? 0;
}

export async function itemsAt(revision: number, filter?: { lessonIds?: string[]; statuses?: string[] }): Promise<ContentItem[]> {
  const params: unknown[] = [revision];
  let sql = 'SELECT payload FROM content_item_versions WHERE revision = $1';
  if (filter?.lessonIds?.length) {
    params.push(filter.lessonIds);
    sql += ` AND lesson_id = ANY($${params.length}::text[])`;
  }
  if (filter?.statuses?.length) {
    params.push(filter.statuses);
    sql += ` AND status = ANY($${params.length}::text[])`;
  }
  sql = sql.replace('SELECT payload FROM', 'SELECT payload, status FROM');
  // Thứ tự PHẢI ổn định: bộ sinh câu hỏi dùng RNG có seed, nên cùng seed mà thứ tự đầu vào
  // khác nhau sẽ ra bộ câu hỏi khác nhau. Postgres không bảo đảm thứ tự khi thiếu ORDER BY.
  sql += ' ORDER BY item_id';
  const rows = await query<{ payload: Record<string, unknown>; status: string }>(sql, params);
  // Cột `status` là nguồn thật: payload có thể còn trạng thái cũ nếu được đổi bằng SQL.
  return rows.map((r) => ContentItemSchema.parse({ ...r.payload, status: r.status }));
}

/**
 * Nội dung đã xuất bản của MỘT revision, nhớ trong bộ nhớ tiến trình.
 *
 * Revision là bất biến: xuất bản luôn tạo revision mới chứ không sửa revision cũ, nên bản nhớ
 * không bao giờ cũ. Nhờ vậy luyện tập ẩn danh — vốn dựng lại bộ câu hỏi ở mỗi lần chấm — không
 * phải đọc lại 571 dòng từ Neon mỗi lần, và Neon còn ngủ được.
 */
const publishedCache = new Map<number, ContentItem[]>();
const PUBLISHED_CACHE_MAX = 3;

export async function publishedItemsAt(revision: number): Promise<ContentItem[]> {
  const hit = publishedCache.get(revision);
  if (hit) return hit;
  const items = await itemsAt(revision, { statuses: ['published'] });
  publishedCache.set(revision, items);
  // giữ vài revision gần nhất, đủ cho lúc vừa xuất bản xong mà vẫn còn người đang làm bài cũ
  while (publishedCache.size > PUBLISHED_CACHE_MAX) {
    const oldest = publishedCache.keys().next().value;
    if (oldest === undefined) break;
    publishedCache.delete(oldest);
  }
  return items;
}

/** Dùng trong kiểm thử: xoá bản nhớ để mỗi test bắt đầu từ trạng thái sạch. */
export function clearPublishedCache(): void {
  publishedCache.clear();
}

export interface PublishInput {
  actorId: string;
  baseRevision: number;
  /** các mục sẽ được ghi đè / thêm mới, đã ở trạng thái cuối cùng */
  upsert: ContentItem[];
  /** id các mục bị xoá (chỉ khi thay thế toàn bộ) */
  removeIds: string[];
  note: string;
  rolledBackFrom?: number | null;
}

export class RevisionConflict extends Error {
  constructor(readonly currentRevision: number) {
    super('Có phiên bản mới hơn.');
    this.name = 'RevisionConflict';
  }
}

/**
 * Xuất bản NGUYÊN KHỐI:
 *  - khoá bảng content_head để hai giáo viên không ghi đè nhau
 *  - kiểm tra optimistic concurrency bằng baseRevision
 *  - chụp lại TOÀN BỘ nội dung vào revision mới (mục không đổi cũng được mang sang)
 *  - chỉ khi COMMIT xong mới có revision mới; lỗi giữa chừng → không có gì thay đổi
 */
export async function publish(input: PublishInput): Promise<{ revision: number; at: string }> {
  return tx(async (c: PoolClient) => {
    await c.query('LOCK TABLE content_head IN EXCLUSIVE MODE');
    const cur = await c.query<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    const current = cur.rows[0]?.revision ?? 0;
    if (current !== input.baseRevision) throw new RevisionConflict(current);

    const next = current + 1;
    await c.query(
      'INSERT INTO content_revisions (revision, created_by, note, rolled_back_from) VALUES ($1,$2,$3,$4)',
      [next, input.actorId, input.note, input.rolledBackFrom ?? null],
    );

    // mang toàn bộ mục cũ sang revision mới, trừ những mục bị xoá
    await c.query(
      `INSERT INTO content_item_versions (revision, item_id, payload, status, lesson_id, type)
       SELECT $1, item_id, payload, status, lesson_id, type
         FROM content_item_versions
        WHERE revision = $2 AND NOT (item_id = ANY($3::text[]))`,
      [next, current, input.removeIds],
    );

    for (const it of input.upsert) {
      await c.query(
        `INSERT INTO content_item_versions (revision, item_id, payload, status, lesson_id, type)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (revision, item_id) DO UPDATE
           SET payload = EXCLUDED.payload, status = EXCLUDED.status,
               lesson_id = EXCLUDED.lesson_id, type = EXCLUDED.type`,
        [next, it.id, JSON.stringify(it), it.status, it.lessonId, it.type],
      );
    }

    await c.query('UPDATE content_head SET revision = $1 WHERE only_row', [next]);
    await c.query(
      'INSERT INTO audit_events (actor_id, action, target, details) VALUES ($1,$2,$3,$4)',
      [
        input.actorId,
        input.rolledBackFrom ? 'content.rollback' : 'content.publish',
        `revision:${next}`,
        JSON.stringify({
          from: current,
          upsert: input.upsert.length,
          removed: input.removeIds.length,
          rolledBackFrom: input.rolledBackFrom ?? null,
        }),
      ],
    );
    const at = await c.query<{ now: Date }>('SELECT now() as now');
    return { revision: next, at: (at.rows[0]?.now ?? new Date()).toISOString() };
  });
}

/** Rollback = tạo revision MỚI từ nội dung của revision cũ. Không xoá lịch sử, không xoá audit. */
export async function rollback(actorId: string, toRevision: number): Promise<{ revision: number; at: string }> {
  const exists = await one('SELECT 1 FROM content_revisions WHERE revision = $1', [toRevision]);
  if (!exists) throw new Error('Không tìm thấy phiên bản đó.');
  const items = await itemsAt(toRevision);
  const head = await headRevision();
  const currentIds = (
    await query<{ item_id: string }>('SELECT item_id FROM content_item_versions WHERE revision = $1', [head])
  ).map((r) => r.item_id);
  const keep = new Set(items.map((i) => i.id));
  return publish({
    actorId,
    baseRevision: head,
    upsert: items,
    removeIds: currentIds.filter((id) => !keep.has(id)),
    note: `Quay lại nội dung của phiên bản ${toRevision}`,
    rolledBackFrom: toRevision,
  });
}
