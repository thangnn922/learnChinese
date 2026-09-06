/**
 * Chuyển bộ dữ liệu HSK 1 nằm trong tệp HTML tham chiếu thành content/hsk1/*.json.
 *
 * QUAN TRỌNG: HTML khai nguồn là "Giáo trình chuẩn HSK 1 (bản dịch Nhân Trí Việt)"
 * nhưng KHÔNG có giáo trình gốc đính kèm để đối chiếu.
 * → toàn bộ mục được gắn verificationStatus = "unverified_no_source", status = "draft".
 * → bộ này chỉ dùng để kiểm thử migration và kiểm thử màn "chương trình chưa có nội dung duyệt".
 * → KHÔNG được đưa vào bài giao, KHÔNG quy đổi sang YCT.
 *
 * Chạy: tsx scripts/build-hsk-sample.ts <đường-dẫn-tệp-html>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA_VERSION,
  makeLessonId,
  ContentItemSchema,
  CurriculumSchema,
  type ContentItem,
} from '../src/domain.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../content/hsk1');
const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('Thiếu đường dẫn tệp HTML tham chiếu.');
  process.exit(2);
}
const html = readFileSync(htmlPath, 'utf8');

function block(name: string): string {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(html);
  if (!m) throw new Error(`Không tìm thấy mảng ${name} trong HTML`);
  return m[1] as string;
}

function rows(src: string): unknown[][] {
  // eslint-disable-next-line no-new-func
  return new Function(`return [${src}];`)() as unknown[][];
}

const VOCAB = rows(block('VOCAB'));
const SENTENCES = rows(block('SENTENCES'));
const GRAMMAR = rows(block('GRAMMAR'));

const lessonNumbers = [
  ...new Set([...VOCAB, ...SENTENCES, ...GRAMMAR].map((r) => Number(r[0]))),
].sort((a, b) => a - b);

const curriculum = CurriculumSchema.parse({
  curriculumId: 'hsk',
  level: 1,
  edition: 'imported-html-sample',
  nameVi: 'HSK 1 — bộ mẫu nhập từ trang cũ',
  sourceVerified: false,
  noteVi:
    'CHƯA ĐỐI CHIẾU GIÁO TRÌNH GỐC. Bộ này nhập từ tệp HTML tham chiếu, không có sách nguồn kèm theo. ' +
    'Chỉ dùng để kiểm thử; không được giao bài cho lớp.',
  lessons: lessonNumbers.map((n) => ({
    lessonId: makeLessonId('hsk', 1, n),
    curriculumId: 'hsk',
    level: 1,
    edition: 'imported-html-sample',
    n,
    titleZh: `第${n}课`,
    titlePinyin: `Dì ${n} kè`,
    titleEn: `Lesson ${n}`,
    titleVi: `Bài ${n}`,
    goalsVi: [],
    printedStart: null,
    printedEnd: null,
  })),
});

const source = {
  fileName: '9cb508c7-1128-483f-a812-d735e24f9d38.html',
  pdfPage: null,
  printedPage: null,
  section: 'Mảng dữ liệu trong tệp HTML — chưa đối chiếu giáo trình gốc',
  verificationStatus: 'unverified_no_source' as const,
};

const items: ContentItem[] = [];
const slug = (s: string) => encodeURIComponent(String(s).replace(/\s+/g, ''));

VOCAB.forEach((r) => {
  const [n, hanzi, pinyin, meaning, emoji] = r as [number, string, string, string, string];
  items.push(
    ContentItemSchema.parse({
      id: `hsk1-l${n}-v-${slug(hanzi)}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'vocab',
      curriculumId: 'hsk',
      level: 1,
      edition: 'imported-html-sample',
      lessonId: makeLessonId('hsk', 1, n),
      hanzi,
      pinyin,
      meaningVi: meaning,
      emoji: emoji || '📘',
      origin: 'teacher_authored',
      meaningOrigin: 'teacher_authored',
      source,
      status: 'draft',
    }),
  );
});

SENTENCES.forEach((r, i) => {
  const [n, hanzi, pinyin, meaning] = r as [number, string, string, string];
  items.push(
    ContentItemSchema.parse({
      id: `hsk1-l${n}-s-${i}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'sentence',
      curriculumId: 'hsk',
      level: 1,
      edition: 'imported-html-sample',
      lessonId: makeLessonId('hsk', 1, n),
      hanzi,
      pinyin,
      meaningVi: meaning,
      section: 'imported',
      origin: 'teacher_authored',
      meaningOrigin: 'teacher_authored',
      source,
      status: 'draft',
    }),
  );
});

GRAMMAR.forEach((r, i) => {
  const [n, q, sub, correct, wrongs, explain] = r as [number, string, string, string, string[], string];
  items.push(
    ContentItemSchema.parse({
      id: `hsk1-l${n}-g-${i}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'grammar',
      curriculumId: 'hsk',
      level: 1,
      edition: 'imported-html-sample',
      lessonId: makeLessonId('hsk', 1, n),
      hanzi: q,
      pinyin: '-',
      meaningVi: sub || q,
      promptVi: sub,
      correct,
      wrongs,
      explainVi: explain,
      origin: 'teacher_authored',
      meaningOrigin: 'teacher_authored',
      source,
      status: 'draft',
    }),
  );
});

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'curriculum.json'), JSON.stringify(curriculum, null, 2) + '\n');
writeFileSync(resolve(outDir, 'items.json'), JSON.stringify(items, null, 2) + '\n');
console.log(
  `HSK 1 (chưa đối chiếu): ${items.length} mục / ${curriculum.lessons.length} bài — tất cả draft, unverified_no_source.`,
);
