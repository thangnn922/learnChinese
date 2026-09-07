/**
 * Lỗi cấu hình khi triển khai phải nói được vì sao. Hai test dưới đây khoá lại
 * đúng hai trường hợp từng làm lệnh migrate thoát im lặng với mã 1.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { describeError, requireDatabaseUrl } from '../startup.js';

const saved = process.env.DATABASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
});

describe('requireDatabaseUrl', () => {
  it('báo lỗi rõ ràng khi thiếu DATABASE_URL, không im lặng thử localhost', () => {
    delete process.env.DATABASE_URL;
    expect(() => requireDatabaseUrl()).toThrowError(/DATABASE_URL/);
    process.env.DATABASE_URL = '   ';
    expect(() => requireDatabaseUrl()).toThrowError(/DATABASE_URL/);
  });

  it('trả về chuỗi khi đã đặt', () => {
    process.env.DATABASE_URL = 'postgresql://u@h/db';
    expect(requireDatabaseUrl()).toBe('postgresql://u@h/db');
  });
});

describe('describeError', () => {
  it('AggregateError với message rỗng vẫn mô tả được nguyên nhân', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const agg = new AggregateError([inner], '');
    const out = describeError(agg);
    expect(out).not.toBe('');
    expect(out).toContain('AggregateError');
    expect(out).toContain('ECONNREFUSED');
  });

  it('gộp cả mã lỗi và nguyên nhân gốc', () => {
    const e = Object.assign(new Error('không kết nối được'), { code: 'ENOTFOUND' });
    (e as Error & { cause?: unknown }).cause = new Error('DNS hỏng');
    const out = describeError(e);
    expect(out).toContain('ENOTFOUND');
    expect(out).toContain('DNS hỏng');
  });

  it('không ném lỗi với giá trị không phải Error', () => {
    expect(describeError('hỏng rồi')).toBe('hỏng rồi');
  });
});
