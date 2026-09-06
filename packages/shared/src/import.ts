/**
 * Nhập nội dung: parse → validate → batch đã kiểm tra (gắn với loại + nội dung + phiên bản).
 *
 * Nguyên tắc:
 *  - error CHẶN xuất bản; warning không chặn nhưng phải hiển thị.
 *  - Không "sửa hộ" dữ liệu: "-1" hay "1abc2" là LỖI, không phải 1 và 12.
 *  - Batch đã kiểm tra chỉ dùng được cho đúng loại + đúng nội dung đã kiểm tra.
 */
import { z } from 'zod';
import { parseDelimited, DEFAULT_CSV_LIMITS, type CsvLimits } from './csv.js';
import {
  normalizeHeader,
  sanitizeCell,
  containsHanzi,
  hasToneMark,
  hasBadUmlaut,
  meaningKey,
} from './text.js';
import {
  SCHEMA_VERSION,
  makeLessonId,
  type ContentItem,
  type ContentType,
  type CurriculumId,
} from './domain.js';

export type IssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  severity: IssueSeverity;
  /** 1-based, tính cả dòng tiêu đề như người dùng nhìn thấy */
  line: number | null;
  column: string | null;
  messageVi: string;
}

export interface ColumnSpec {
  key: string;
  required: boolean;
  aliases: string[];
  labelVi: string;
}

export interface KindSpec {
  kind: ContentType;
  titleVi: string;
  columns: ColumnSpec[];
  templateHeader: string[];
}

export const KIND_SPECS: Record<ContentType, KindSpec> = {
  vocab: {
    kind: 'vocab',
    titleVi: 'Từ vựng',
    templateHeader: ['bai', 'hanzi', 'pinyin', 'nghia', 'emoji'],
    columns: [
      { key: 'bai', required: true, labelVi: 'Bài', aliases: ['bai', 'bai hoc', 'lesson', 'unit'] },
      { key: 'hanzi', required: true, labelVi: 'Hán tự', aliases: ['hanzi', 'chu han', 'han tu', 'tu', 'tu vung', 'word'] },
      { key: 'pinyin', required: true, labelVi: 'Pinyin', aliases: ['pinyin', 'phien am'] },
      { key: 'nghia', required: true, labelVi: 'Nghĩa tiếng Việt', aliases: ['nghia', 'nghia tieng viet', 'tieng viet', 'meaning', 'vi'] },
      { key: 'emoji', required: false, labelVi: 'Emoji', aliases: ['emoji', 'icon', 'hinh'] },
      { key: 'id', required: false, labelVi: 'ID ổn định', aliases: ['id', 'ma', 'stable id'] },
      { key: 'nguon', required: false, labelVi: 'Nguồn', aliases: ['nguon', 'source', 'trang'] },
    ],
  },
  sentence: {
    kind: 'sentence',
    titleVi: 'Câu dịch',
    templateHeader: ['bai', 'cau', 'pinyin', 'nghia'],
    columns: [
      { key: 'bai', required: true, labelVi: 'Bài', aliases: ['bai', 'bai hoc', 'lesson'] },
      { key: 'cau', required: true, labelVi: 'Câu tiếng Trung', aliases: ['cau', 'cau trung', 'cau tieng trung', 'hanzi', 'chinese'] },
      { key: 'pinyin', required: true, labelVi: 'Pinyin', aliases: ['pinyin', 'phien am'] },
      { key: 'nghia', required: true, labelVi: 'Nghĩa tiếng Việt', aliases: ['nghia', 'nghia tieng viet', 'tieng viet', 'dich', 'meaning'] },
      { key: 'id', required: false, labelVi: 'ID ổn định', aliases: ['id', 'ma', 'stable id'] },
      { key: 'nguon', required: false, labelVi: 'Nguồn', aliases: ['nguon', 'source', 'trang'] },
    ],
  },
  grammar: {
    kind: 'grammar',
    titleVi: 'Ngữ pháp',
    templateHeader: ['bai', 'cauhoi', 'goiy', 'dung', 'sai1', 'sai2', 'sai3', 'giai'],
    columns: [
      { key: 'bai', required: true, labelVi: 'Bài', aliases: ['bai', 'bai hoc', 'lesson'] },
      { key: 'cauhoi', required: true, labelVi: 'Câu hỏi', aliases: ['cauhoi', 'cau hoi', 'question'] },
      { key: 'goiy', required: false, labelVi: 'Gợi ý', aliases: ['goiy', 'goi y', 'hint', 'sub'] },
      { key: 'dung', required: true, labelVi: 'Đáp án đúng', aliases: ['dung', 'dap an', 'dap an dung', 'correct'] },
      { key: 'sai1', required: true, labelVi: 'Phương án sai 1', aliases: ['sai1', 'sai 1', 'wrong1'] },
      { key: 'sai2', required: false, labelVi: 'Phương án sai 2', aliases: ['sai2', 'sai 2', 'wrong2'] },
      { key: 'sai3', required: false, labelVi: 'Phương án sai 3', aliases: ['sai3', 'sai 3', 'wrong3'] },
      { key: 'giai', required: false, labelVi: 'Giải thích', aliases: ['giai', 'giai thich', 'explain'] },
      { key: 'id', required: false, labelVi: 'ID ổn định', aliases: ['id', 'ma', 'stable id'] },
      { key: 'nguon', required: false, labelVi: 'Nguồn', aliases: ['nguon', 'source', 'trang'] },
    ],
  },
};

export interface ImportContext {
  curriculumId: CurriculumId;
  level: number;
  edition: string;
  /** danh sách bài hợp lệ của chương trình đang chọn */
  validLessonNumbers: number[];
  importedBy: string;
}

export interface ImportResult {
  kind: ContentType;
  items: ContentItem[];
  issues: ImportIssue[];
  /** số dòng đọc được (không tính tiêu đề) */
  rowsRead: number;
  /** số dòng bị bỏ vì lỗi */
  rowsRejected: number;
  truncated: boolean;
  hasHeader: boolean;
}

const LESSON_NUM = /^\d{1,2}$/;

function stableId(ctx: ImportContext, kind: ContentType, lessonN: number, key: string): string {
  // ID ổn định, không phụ thuộc thứ tự dòng
  const slug = key
    .normalize('NFC')
    .replace(/\s+/g, '')
    .slice(0, 24);
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return `${ctx.curriculumId}${ctx.level}-l${lessonN}-${kind[0]}-${slug ? encodeURIComponent(slug) : 'x'}-${h.toString(36)}`;
}

export function parseImport(
  kind: ContentType,
  raw: string,
  ctx: ImportContext,
  limits: CsvLimits = DEFAULT_CSV_LIMITS,
): ImportResult {
  const spec = KIND_SPECS[kind];
  const issues: ImportIssue[] = [];
  const items: ContentItem[] = [];

  const parsed = parseDelimited(raw, limits);
  if (parsed.truncated) {
    issues.push({
      severity: 'error',
      line: null,
      column: null,
      messageVi: `Dữ liệu vượt ${limits.maxRows} dòng. Hãy chia nhỏ rồi nhập lại.`,
    });
  }
  if (parsed.rows.length === 0) {
    issues.push({ severity: 'error', line: null, column: null, messageVi: 'Chưa dán dữ liệu.' });
    return { kind, items, issues, rowsRead: 0, rowsRejected: 0, truncated: parsed.truncated, hasHeader: false };
  }

  // ── tiêu đề ─────────────────────────────────────────────────────────────
  const headerCells = (parsed.rows[0] as string[]).map((c) => normalizeHeader(sanitizeCell(c)));
  const idx: Record<string, number> = {};
  let matched = 0;
  for (const col of spec.columns) {
    const at = headerCells.findIndex((h) => col.aliases.includes(h));
    idx[col.key] = at;
    if (at !== -1) matched++;
  }
  const hasHeader = matched >= 2;
  if (!hasHeader) {
    spec.columns.forEach((c, i) => {
      idx[c.key] = i < spec.templateHeader.length ? i : -1;
    });
    issues.push({
      severity: 'warning',
      line: 1,
      column: null,
      messageVi:
        'Không thấy dòng tiêu đề — đang đọc theo đúng thứ tự cột trong mẫu: ' +
        spec.templateHeader.join(', ') +
        '.',
    });
  } else {
    const missing = spec.columns.filter((c) => c.required && idx[c.key] === -1);
    if (missing.length) {
      issues.push({
        severity: 'error',
        line: 1,
        column: null,
        messageVi: 'Thiếu cột bắt buộc: ' + missing.map((c) => c.labelVi).join(', ') + '.',
      });
      return { kind, items, issues, rowsRead: 0, rowsRejected: 0, truncated: parsed.truncated, hasHeader };
    }
  }

  const start = hasHeader ? 1 : 0;
  const seenKeys = new Map<string, number>();
  const seenIds = new Map<string, number>();
  let rowsRead = 0;
  let rowsRejected = 0;

  for (let r = start; r < parsed.rows.length; r++) {
    const line = r + 1;
    const cells = (parsed.rows[r] as string[]).map(sanitizeCell);
    const get = (k: string): string => {
      const at = idx[k];
      return at === undefined || at < 0 ? '' : (cells[at] ?? '');
    };
    if (spec.columns.every((c) => !get(c.key))) continue;
    rowsRead++;

    let bad = false;
    const push = (severity: IssueSeverity, column: string | null, messageVi: string) => {
      issues.push({ severity, line, column, messageVi });
      if (severity === 'error') bad = true;
    };

    // ── số bài: nghiêm ngặt ────────────────────────────────────────────────
    const baiRaw = get('bai');
    if (!LESSON_NUM.test(baiRaw)) {
      push('error', 'Bài', `Cột Bài phải là một số nguyên 1–99, đang là “${baiRaw}”.`);
    }
    const lessonN = Number(baiRaw);
    if (LESSON_NUM.test(baiRaw) && !ctx.validLessonNumbers.includes(lessonN)) {
      push(
        'error',
        'Bài',
        `Bài ${lessonN} không có trong chương trình đang chọn (hợp lệ: ${ctx.validLessonNumbers.join(', ')}).`,
      );
    }

    for (const col of spec.columns) {
      if (col.required && col.key !== 'bai' && !get(col.key)) {
        push('error', col.labelVi, `Thiếu ${col.labelVi}.`);
      }
    }

    const pinyin = get('pinyin');
    if (pinyin) {
      if (hasBadUmlaut(pinyin)) {
        push('error', 'Pinyin', `Pinyin “${pinyin}” dùng "v" hoặc "u:" thay cho ü.`);
      }
      if (!hasToneMark(pinyin) && !/^[a-zü\s'·]+$/i.test(pinyin)) {
        push('warning', 'Pinyin', `Pinyin “${pinyin}” có ký tự lạ — kiểm tra lại.`);
      } else if (!hasToneMark(pinyin)) {
        push('warning', 'Pinyin', `Pinyin “${pinyin}” chưa có dấu thanh.`);
      }
    }

    if (kind === 'grammar') {
      const q = get('cauhoi');
      const correct = get('dung');
      const wrongs = ['sai1', 'sai2', 'sai3'].map(get).filter(Boolean);
      const all = [correct, ...wrongs].filter(Boolean);
      if (new Set(all).size !== all.length) {
        push('error', 'Phương án', 'Các phương án bị trùng nhau.');
      }
      if (wrongs.length < 1) {
        push('error', 'Phương án', 'Cần ít nhất một phương án sai.');
      }
      if (containsHanzi(q) && !/_{2,}|＿|\.{3,}/.test(q)) {
        push('warning', 'Câu hỏi', 'Câu hỏi tiếng Trung nhưng chưa có chỗ trống (dùng ___).');
      }
    }

    if (bad) {
      rowsRejected++;
      continue;
    }

    // ── khoá trùng lặp ────────────────────────────────────────────────────
    const dupKey =
      kind === 'vocab'
        ? `${lessonN}|${get('hanzi')}`
        : kind === 'sentence'
          ? `${lessonN}|${get('cau')}`
          : `${lessonN}|${get('cauhoi')}|${get('dung')}`;
    const prev = seenKeys.get(dupKey);
    if (prev !== undefined) {
      issues.push({
        severity: 'error',
        line,
        column: null,
        messageVi: `Trùng nội dung với dòng ${prev}.`,
      });
      rowsRejected++;
      continue;
    }
    seenKeys.set(dupKey, line);

    const givenId = get('id');
    const id = givenId || stableId(ctx, kind, lessonN, dupKey);
    const prevId = seenIds.get(id);
    if (prevId !== undefined) {
      issues.push({ severity: 'error', line, column: 'ID', messageVi: `Trùng ID với dòng ${prevId}.` });
      rowsRejected++;
      continue;
    }
    seenIds.set(id, line);

    const base = {
      id,
      schemaVersion: SCHEMA_VERSION,
      type: kind,
      curriculumId: ctx.curriculumId,
      level: ctx.level,
      edition: ctx.edition,
      lessonId: makeLessonId(ctx.curriculumId, ctx.level, lessonN),
      glossEn: '',
      pinyinNote: '',
      promptVi: '',
      correct: '',
      wrongs: [] as string[],
      explainVi: '',
      section: '',
      emoji: '',
      isExtended: false,
      origin: 'teacher_authored' as const,
      meaningOrigin: 'teacher_authored' as const,
      source: {
        fileName: get('nguon') || 'Giáo viên nhập',
        pdfPage: null,
        printedPage: null,
        section: 'teacher-import',
        verificationStatus: 'needs_teacher_check' as const,
      },
      status: 'draft' as const,
      reviewedBy: null,
      reviewedAt: null,
    };

    if (kind === 'vocab') {
      items.push({
        ...base,
        hanzi: get('hanzi'),
        pinyin,
        meaningVi: get('nghia'),
        emoji: get('emoji') || '📘',
      });
    } else if (kind === 'sentence') {
      items.push({
        ...base,
        hanzi: get('cau'),
        pinyin,
        meaningVi: get('nghia'),
        section: 'teacher',
      });
    } else {
      items.push({
        ...base,
        hanzi: get('cauhoi'),
        pinyin: pinyin || '-',
        meaningVi: get('goiy') || get('dung'),
        promptVi: get('goiy'),
        correct: get('dung'),
        wrongs: ['sai1', 'sai2', 'sai3'].map(get).filter(Boolean),
        explainVi: get('giai'),
      });
    }
  }

  // cảnh báo nghĩa trùng nhau trong cùng một bài (dễ tạo câu mơ hồ)
  if (kind === 'vocab') {
    const byLesson = new Map<string, Map<string, string>>();
    for (const it of items) {
      const m = byLesson.get(it.lessonId) ?? new Map<string, string>();
      const k = meaningKey(it.meaningVi);
      const other = m.get(k);
      if (other) {
        issues.push({
          severity: 'warning',
          line: null,
          column: 'Nghĩa',
          messageVi: `“${it.hanzi}” và “${other}” có nghĩa giống nhau trong cùng bài — hệ thống sẽ không dùng chúng làm phương án của nhau.`,
        });
      } else {
        m.set(k, it.hanzi);
      }
      byLesson.set(it.lessonId, m);
    }
  }

  if (items.length === 0 && !issues.some((i) => i.severity === 'error')) {
    issues.push({ severity: 'error', line: null, column: null, messageVi: 'Không đọc được dòng hợp lệ nào.' });
  }

  return { kind, items, issues, rowsRead, rowsRejected, truncated: parsed.truncated, hasHeader };
}

/* ─────────────────── batch đã kiểm tra, ràng buộc chặt ─────────────────── */

export const ValidatedBatchSchema = z.object({
  kind: z.enum(['vocab', 'sentence', 'grammar']),
  curriculumId: z.enum(['yct', 'hsk']),
  level: z.number().int().positive(),
  edition: z.string(),
  /** hash của CHÍNH văn bản đã kiểm tra */
  contentHash: z.string().min(8),
  schemaVersion: z.number().int(),
  validatedAt: z.string(),
  /** revision của nội dung tại thời điểm kiểm tra (optimistic concurrency) */
  baseRevision: z.number().int().min(0),
});
export type ValidatedBatch = z.infer<typeof ValidatedBatchSchema>;

/** Hash ổn định (FNV-1a 64-bit rút gọn) — đủ để phát hiện sửa nội dung. */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 3)), 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function isBatchFresh(batch: ValidatedBatch, kind: ContentType, currentText: string): boolean {
  return batch.kind === kind && batch.contentHash === contentHash(currentText);
}

/* ─────────────────────────── preview diff ─────────────────────────────── */

export interface DiffSummary {
  added: ContentItem[];
  updated: { before: ContentItem; after: ContentItem }[];
  unchanged: number;
  /** chỉ có khi chọn chế độ thay thế toàn bộ */
  removed: ContentItem[];
}

export function diffItems(
  current: ContentItem[],
  incoming: ContentItem[],
  mode: 'merge' | 'replace',
): DiffSummary {
  const byId = new Map(current.map((i) => [i.id, i]));
  const added: ContentItem[] = [];
  const updated: { before: ContentItem; after: ContentItem }[] = [];
  let unchanged = 0;
  const incomingIds = new Set<string>();

  for (const it of incoming) {
    incomingIds.add(it.id);
    const before = byId.get(it.id);
    if (!before) {
      added.push(it);
    } else if (
      before.hanzi !== it.hanzi ||
      before.pinyin !== it.pinyin ||
      before.meaningVi !== it.meaningVi ||
      before.emoji !== it.emoji ||
      before.correct !== it.correct ||
      before.explainVi !== it.explainVi ||
      JSON.stringify(before.wrongs) !== JSON.stringify(it.wrongs) ||
      before.lessonId !== it.lessonId
    ) {
      updated.push({ before, after: it });
    } else {
      unchanged++;
    }
  }
  const removed = mode === 'replace' ? current.filter((i) => !incomingIds.has(i.id)) : [];
  return { added, updated, unchanged, removed };
}
