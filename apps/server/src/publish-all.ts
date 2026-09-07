/**
 * Xuất bản toàn bộ nội dung đang có, để giáo viên dùng thử được ngay.
 *
 *   DATABASE_URL='…' ACTOR_EMAIL='giaovien@…' npm run -w @yct/server publish-all
 *   thêm DRY_RUN=1 để chỉ xem sẽ đổi gì mà không ghi.
 *
 * KHÔNG phải là "duyệt nội dung". Script này chỉ đổi `status` sang `published`;
 * `source.verificationStatus` giữ nguyên, nên giao diện vẫn hiện nhãn
 * "chưa có giáo viên duyệt" trên trang chủ học sinh và trên từng mục ở khu vực giáo viên.
 * Người duyệt thật vẫn là giáo viên, qua nút "Đánh dấu đã duyệt".
 *
 * Đi qua đúng cơ chế publish của ứng dụng nên:
 *   - tạo một revision MỚI, không sửa đè lịch sử
 *   - ghi audit_events kèm người thực hiện
 *   - quay lui được bằng chức năng rollback có sẵn trong khu vực giáo viên
 */
import { itemsAt, headRevision, publish } from './content.js';
import { one, closePool } from './db.js';
import { isMainModule } from './is-main.js';
import { describeError, requireDatabaseUrl } from './startup.js';

export interface PublishAllResult {
  baseRevision: number;
  revision: number | null;
  changed: number;
  alreadyPublished: number;
  byCurriculum: Record<string, number>;
  dryRun: boolean;
}

export async function publishAll(opts: { actorEmail: string; dryRun?: boolean }): Promise<PublishAllResult> {
  const actor = await one<{ id: string; role: string }>(
    "SELECT id, role FROM users WHERE lower(email) = lower($1) AND disabled = false",
    [opts.actorEmail],
  );
  if (!actor) throw new Error(`Không tìm thấy tài khoản đang hoạt động với email ${opts.actorEmail}.`);
  if (actor.role !== 'teacher' && actor.role !== 'admin') {
    throw new Error('Chỉ tài khoản giáo viên hoặc quản trị mới được xuất bản nội dung.');
  }

  const baseRevision = await headRevision();
  if (baseRevision === 0) throw new Error('Chưa có nội dung nào trong cơ sở dữ liệu. Chạy seed trước.');

  const items = await itemsAt(baseRevision);
  const toPublish = items.filter((i) => i.status !== 'published' && i.status !== 'archived');
  const alreadyPublished = items.filter((i) => i.status === 'published').length;

  const byCurriculum: Record<string, number> = {};
  for (const i of toPublish) {
    const key = `${i.curriculumId}${i.level}`;
    byCurriculum[key] = (byCurriculum[key] ?? 0) + 1;
  }

  if (opts.dryRun || toPublish.length === 0) {
    return { baseRevision, revision: null, changed: toPublish.length, alreadyPublished, byCurriculum, dryRun: true };
  }

  // Giữ nguyên `source` — không tự nhận vai người duyệt.
  const upsert = toPublish.map((i) => ({ ...i, status: 'published' as const }));
  const r = await publish({
    actorId: actor.id,
    baseRevision,
    upsert,
    removeIds: [],
    note: `Xuất bản toàn bộ ${upsert.length} mục để giáo viên dùng thử (chưa đối chiếu nguồn)`,
  });

  return { baseRevision, revision: r.revision, changed: upsert.length, alreadyPublished, byCurriculum, dryRun: false };
}

if (isMainModule(import.meta.url)) {
  const actorEmail = process.env.ACTOR_EMAIL;
  const dryRun = process.env.DRY_RUN === '1';
  Promise.resolve()
    .then(() => {
      requireDatabaseUrl();
      if (!actorEmail) {
        throw new Error(
          'Thiếu ACTOR_EMAIL. Việc xuất bản phải ghi được là ai làm.\n' +
            "  ACTOR_EMAIL='giaovien@example.local' npm run -w @yct/server publish-all",
        );
      }
      return publishAll({ actorEmail, dryRun });
    })
    .then((r) => {
      const scope = Object.entries(r.byCurriculum)
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      if (r.changed === 0) {
        console.log(`Không có gì để xuất bản — cả ${r.alreadyPublished} mục đã ở trạng thái published.`);
      } else if (r.dryRun) {
        console.log(`[DRY_RUN] Sẽ xuất bản ${r.changed} mục (${scope}) từ revision ${r.baseRevision}.`);
        console.log('Bỏ DRY_RUN=1 để thực hiện.');
      } else {
        console.log(`Đã xuất bản ${r.changed} mục (${scope}).`);
        console.log(`Revision ${r.baseRevision} → ${r.revision}. Quay lui được ở Khu vực giáo viên → Nội dung.`);
        console.log('Nhãn "chưa có giáo viên duyệt" vẫn hiện — nội dung chưa được đối chiếu với sách.');
      }
      return closePool();
    })
    .catch((e: unknown) => {
      console.error(describeError(e));
      process.exit(1);
    });
}
