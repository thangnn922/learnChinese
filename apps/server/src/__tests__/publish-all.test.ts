/**
 * Xuất bản hàng loạt phải đi qua đúng cơ chế revision của ứng dụng, và tuyệt đối
 * KHÔNG được tự nhận vai người duyệt nội dung.
 *
 * Cần Postgres THẬT — bộ test xoá sạch dữ liệu trong cơ sở dữ liệu được trỏ tới.
 */
import { beforeAll, beforeEach, describe, expect, it, afterAll } from 'vitest';
import { migrate } from '../migrate.js';
import { seed } from '../seed.js';
import { publishAll } from '../publish-all.js';
import { headRevision, itemsAt } from '../content.js';
import { closePool, one, query } from '../db.js';

const TEACHER = 'giaovien@example.local';

beforeAll(async () => {
  await migrate(() => undefined);
});

beforeEach(async () => {
  await query(
    `TRUNCATE audit_events, answer_events, self_reports, review_states, attempts, assignments,
             memberships, classrooms, sessions, login_throttle, users,
             content_item_versions, content_revisions, content_head, lessons, curricula CASCADE`,
  );
  await seed({ quiet: true });
});

afterAll(async () => {
  await closePool();
});

describe('publishAll', () => {
  it('tạo revision MỚI, không sửa đè revision cũ', async () => {
    const before = await headRevision();
    const r = await publishAll({ actorEmail: TEACHER });

    expect(r.baseRevision).toBe(before);
    expect(r.revision).toBe(before + 1);
    expect(await headRevision()).toBe(before + 1);

    // revision cũ còn nguyên để quay lui được
    const old = await itemsAt(before);
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((i) => i.status !== 'published')).toBe(true);

    const now = await itemsAt(r.revision as number);
    expect(now.length).toBe(old.length);
    expect(now.every((i) => i.status === 'published')).toBe(true);
  });

  it('KHÔNG tự đánh dấu nội dung là đã được giáo viên duyệt', async () => {
    const r = await publishAll({ actorEmail: TEACHER });
    const items = await itemsAt(r.revision as number);
    expect(items.length).toBeGreaterThan(0);
    // nhãn cảnh báo trên giao diện dựa vào đúng trường này
    expect(items.some((i) => i.source.verificationStatus === 'verified_by_teacher')).toBe(false);
    expect(items.every((i) => i.reviewedBy === null)).toBe(true);
  });

  it('ghi audit event kèm người thực hiện', async () => {
    const r = await publishAll({ actorEmail: TEACHER });
    const teacher = await one<{ id: string }>('SELECT id FROM users WHERE lower(email)=lower($1)', [TEACHER]);
    const ev = await one<{ actor_id: string; action: string; target: string }>(
      'SELECT actor_id, action, target FROM audit_events ORDER BY id DESC LIMIT 1',
    );
    expect(ev?.action).toBe('content.publish');
    expect(ev?.target).toBe(`revision:${r.revision}`);
    expect(ev?.actor_id).toBe(teacher?.id);
  });

  it('chạy lại không tạo revision thừa', async () => {
    await publishAll({ actorEmail: TEACHER });
    const head = await headRevision();
    const again = await publishAll({ actorEmail: TEACHER });
    expect(again.changed).toBe(0);
    expect(again.revision).toBeNull();
    expect(await headRevision()).toBe(head);
  });

  it('DRY_RUN đếm đúng mà không ghi gì', async () => {
    const head = await headRevision();
    const r = await publishAll({ actorEmail: TEACHER, dryRun: true });
    expect(r.changed).toBeGreaterThan(0);
    expect(r.revision).toBeNull();
    expect(await headRevision()).toBe(head);
    const items = await itemsAt(head);
    expect(items.every((i) => i.status !== 'published')).toBe(true);
  });

  it('từ chối tài khoản không tồn tại hoặc đã bị vô hiệu hoá', async () => {
    await expect(publishAll({ actorEmail: 'khong-co@example.local' })).rejects.toThrow(/Không tìm thấy/);

    await query('UPDATE users SET disabled = true WHERE lower(email) = lower($1)', [TEACHER]);
    await expect(publishAll({ actorEmail: TEACHER })).rejects.toThrow(/Không tìm thấy/);
  });

  it('học sinh không thể là người xuất bản: lược đồ cấm học sinh có email', async () => {
    const student = await one<{ id: string }>("SELECT id FROM users WHERE role='student' LIMIT 1");
    expect(student).not.toBeNull();
    await expect(
      query('UPDATE users SET email = $1 WHERE id = $2', ['hocsinh@example.local', student?.id]),
    ).rejects.toThrow(/student_has_no_email/);
  });
});
