import { describe, it, expect } from 'vitest';
import { parseDelimited, detectDelimiter, toTsv } from '../csv.js';
import { parseImport, contentHash, isBatchFresh, diffItems, type ImportContext } from '../import.js';
import { normalizeHeader, normalizePinyinForCompare, hasToneMark, csvSafeCell } from '../text.js';
import { ContentItemSchema, type ContentItem } from '../domain.js';

const CTX: ImportContext = {
  curriculumId: 'yct',
  level: 1,
  edition: 'standard-course',
  validLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  importedBy: 'teacher-1',
};

describe('DATA-01 — parser CSV/TSV', () => {
  it('đọc BOM, dấu nháy, dấu phẩy và xuống dòng trong ô', () => {
    const csv =
      '﻿bai,hanzi,pinyin,nghia\n' +
      '1,你,nǐ,"bạn, cậu"\n' +
      '2,好,hǎo,"tốt\nkhỏe"\n' +
      '3,他,tā,"anh ""ấy"""\n';
    const { rows, delimiter } = parseDelimited(csv);
    expect(delimiter).toBe(',');
    expect(rows.length).toBe(4);
    expect(rows[1]).toEqual(['1', '你', 'nǐ', 'bạn, cậu']);
    expect(rows[2]?.[3]).toBe('tốt\nkhỏe');
    expect(rows[3]?.[3]).toBe('anh "ấy"');
  });

  it('nhận TSV dán từ Google Sheets', () => {
    const tsv = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn\n';
    expect(detectDelimiter(tsv)).toBe('\t');
    const r = parseImport('vocab', tsv, CTX);
    expect(r.items.length).toBe(1);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('KHÔNG biến -1 thành 1, không biến 1abc2 thành 12', () => {
    const tsv =
      'bai\thanzi\tpinyin\tnghia\n' +
      '-1\t你\tnǐ\tbạn\n' +
      '1abc2\t好\thǎo\ttốt\n' +
      '99\t他\ttā\tanh ấy\n' +
      '3\t她\ttā\tcô ấy\n';
    const r = parseImport('vocab', tsv, CTX);
    const errs = r.issues.filter((i) => i.severity === 'error');
    expect(errs.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errs[0]?.messageVi).toMatch(/“-1”/);
    expect(errs[1]?.messageVi).toMatch(/“1abc2”/);
    expect(errs[2]?.messageVi).toMatch(/không có trong chương trình/);
    // chỉ dòng hợp lệ được nhận
    expect(r.items.map((i) => i.hanzi)).toEqual(['她']);
    expect(r.rowsRejected).toBe(3);
  });

  it('thiếu cột bắt buộc → chặn, không nhận dòng nào', () => {
    const tsv = 'bai\thanzi\tpinyin\n1\t你\tnǐ\n';
    const r = parseImport('vocab', tsv, CTX);
    expect(r.items).toHaveLength(0);
    expect(r.issues[0]?.messageVi).toMatch(/Thiếu cột bắt buộc/);
  });

  it('báo trùng nội dung theo dòng', () => {
    const tsv = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn\n1\t你\tnǐ\tbạn nhé\n';
    const r = parseImport('vocab', tsv, CTX);
    expect(r.items).toHaveLength(1);
    expect(r.issues.some((i) => i.severity === 'error' && i.line === 3)).toBe(true);
  });

  it('pinyin dùng v hoặc u: là LỖI; thiếu dấu thanh là cảnh báo', () => {
    const tsv = 'bai\thanzi\tpinyin\tnghia\n1\t女\tnv\tcon gái\n1\t好\thao\ttốt\n';
    const r = parseImport('vocab', tsv, CTX);
    expect(r.issues.some((i) => i.severity === 'error' && /ü/.test(i.messageVi))).toBe(true);
    expect(r.issues.some((i) => i.severity === 'warning' && /dấu thanh/.test(i.messageVi))).toBe(true);
  });

  it('ngữ pháp: bốn phương án trùng nhau là lỗi; chỉ 1 phương án sai vẫn nhận', () => {
    const tsv =
      'bai\tcauhoi\tgoiy\tdung\tsai1\tsai2\tsai3\tgiai\n' +
      '1\t老师___！\tChào cô\t好\t好\t再见\t你\tx\n' +
      '1\t你___什么？\tHỏi tên\t叫\t是\t\t\ty\n';
    const r = parseImport('grammar', tsv, CTX);
    expect(r.issues.some((i) => i.severity === 'error' && i.line === 2)).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.wrongs).toEqual(['是']);
  });

  it('mọi mục nhập vào đều là draft, không bao giờ published', () => {
    const tsv = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn\n';
    const r = parseImport('vocab', tsv, CTX);
    expect(r.items.every((i) => i.status === 'draft')).toBe(true);
    expect(r.items.every((i) => i.source.verificationStatus === 'needs_teacher_check')).toBe(true);
  });
});

describe('DATA-02 — batch đã kiểm tra phải còn tươi', () => {
  const text = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn\n';
  const batch = {
    kind: 'vocab' as const,
    curriculumId: 'yct' as const,
    level: 1,
    edition: 'standard-course',
    contentHash: contentHash(text),
    schemaVersion: 1,
    validatedAt: new Date().toISOString(),
    baseRevision: 3,
  };

  it('cùng loại + cùng nội dung → dùng được', () => {
    expect(isBatchFresh(batch, 'vocab', text)).toBe(true);
  });

  it('sửa một ký tự → batch hết hiệu lực', () => {
    expect(isBatchFresh(batch, 'vocab', text.replace('bạn', 'bạn '))).toBe(false);
  });

  it('đổi loại dữ liệu → batch hết hiệu lực', () => {
    expect(isBatchFresh(batch, 'grammar', text)).toBe(false);
  });
});

describe('diff xem trước', () => {
  const mk = (id: string, meaning: string): ContentItem =>
    ContentItemSchema.parse({
      id,
      schemaVersion: 1,
      type: 'vocab',
      curriculumId: 'yct',
      level: 1,
      edition: 'e',
      lessonId: 'yct1-l1',
      hanzi: '你',
      pinyin: 'nǐ',
      meaningVi: meaning,
      origin: 'textbook',
      meaningOrigin: 'ai_draft',
      source: { fileName: 'f', pdfPage: null, printedPage: null, section: 's', verificationStatus: 'needs_teacher_check' },
      status: 'draft',
    });

  it('merge theo ID: không xoá mục không có trong lô mới', () => {
    const d = diffItems([mk('a', 'bạn'), mk('b', 'tốt')], [mk('a', 'bạn nhé'), mk('c', 'mới')], 'merge');
    expect(d.added.map((i) => i.id)).toEqual(['c']);
    expect(d.updated.map((u) => u.after.id)).toEqual(['a']);
    expect(d.removed).toHaveLength(0);
  });

  it('replace: liệt kê rõ mục sẽ bị xoá', () => {
    const d = diffItems([mk('a', 'bạn'), mk('b', 'tốt')], [mk('a', 'bạn')], 'replace');
    expect(d.removed.map((i) => i.id)).toEqual(['b']);
    expect(d.unchanged).toBe(1);
  });
});

describe('SEC-03 — xuất bảng tính an toàn', () => {
  it('ô bắt đầu bằng = + - @ được thêm nháy đơn', () => {
    expect(csvSafeCell('=1+1')).toBe("'=1+1");
    expect(csvSafeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvSafeCell('bạn')).toBe('bạn');
    const tsv = toTsv(['a'], [['=cmd|calc']]);
    expect(tsv.split('\n')[1]).toBe("'=cmd|calc");
  });
});

describe('chuẩn hoá văn bản', () => {
  it('normalizeHeader bỏ dấu — chỉ dùng cho tên cột', () => {
    expect(normalizeHeader('Bài học')).toBe('bai hoc');
    expect(normalizeHeader('﻿Nghĩa_tiếng-Việt')).toBe('nghia tieng viet');
  });

  it('pinyin KHÔNG bị bỏ dấu thanh khi so khớp', () => {
    expect(normalizePinyinForCompare('Mā')).toBe('mā');
    expect(normalizePinyinForCompare('mā')).not.toBe(normalizePinyinForCompare('mà'));
    expect(normalizePinyinForCompare('nǚ')).toBe('nǚ');
    expect(hasToneMark('nǐ')).toBe(true);
    expect(hasToneMark('ni')).toBe(false);
  });
});
