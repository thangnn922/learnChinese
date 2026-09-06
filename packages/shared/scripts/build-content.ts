/**
 * Sinh content/yct1/*.json từ bảng nguồn đã gõ tay.
 * Chạy: npm run build:content
 *
 * Mọi mục sinh ra đều ở trạng thái "draft". Không có bước nào ở đây biến
 * nội dung thành "reviewed" hay "published" — việc đó chỉ người có quyền làm được.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EDITION,
  LESSONS,
  VOCAB,
  SENTENCES,
  GRAMMAR,
  PINYIN_NOTES,
} from '../src/content/yct1-source.js';
import {
  SCHEMA_VERSION,
  makeLessonId,
  ContentItemSchema,
  CurriculumSchema,
  type ContentItem,
  type Curriculum,
} from '../src/domain.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../content/yct1');

const pdfPage = (printed: number) => printed + EDITION.pageOffset;

const curriculum: Curriculum = CurriculumSchema.parse({
  curriculumId: EDITION.curriculumId,
  level: EDITION.level,
  edition: EDITION.edition,
  nameVi: 'YCT 1 — Giáo trình chuẩn',
  sourceVerified: false,
  noteVi:
    'Trích xuất từ bản scan "YCT 1 SGK.pdf". Nghĩa tiếng Việt do AI dịch từ gloss tiếng Anh của sách — CHƯA có giáo viên duyệt.',
  lessons: LESSONS.map((l) => ({
    lessonId: makeLessonId(EDITION.curriculumId, EDITION.level, l.n),
    curriculumId: EDITION.curriculumId,
    level: EDITION.level,
    edition: EDITION.edition,
    n: l.n,
    titleZh: l.titleZh,
    titlePinyin: l.titlePinyin,
    titleEn: l.titleEn,
    titleVi: l.titleVi,
    goalsVi: l.goalsVi,
    printedStart: l.printedStart,
    printedEnd: l.printedEnd,
  })),
});

const items: ContentItem[] = [];

function slug(s: string): string {
  return encodeURIComponent(s.replace(/\s+/g, ''));
}

for (const [n, hanzi, pinyin, glossEn, meaningVi, emoji, extended] of VOCAB) {
  items.push(
    ContentItemSchema.parse({
      id: `yct1-l${n}-v-${slug(hanzi)}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'vocab',
      curriculumId: EDITION.curriculumId,
      level: EDITION.level,
      edition: EDITION.edition,
      lessonId: makeLessonId(EDITION.curriculumId, EDITION.level, n),
      hanzi,
      pinyin,
      meaningVi,
      glossEn,
      emoji,
      pinyinNote: PINYIN_NOTES[hanzi] ?? '',
      isExtended: extended === true,
      origin: 'textbook',
      meaningOrigin: 'ai_draft',
      source: {
        fileName: EDITION.fileName,
        pdfPage: 64,
        printedPage: '56–58',
        section: '词语表 Vocabulary',
        verificationStatus: 'needs_teacher_check',
      },
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
    }),
  );
}

for (const [n, hanzi, pinyin, glossEn, meaningVi, section, printed] of SENTENCES) {
  items.push(
    ContentItemSchema.parse({
      id: `yct1-l${n}-s-${slug(hanzi)}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'sentence',
      curriculumId: EDITION.curriculumId,
      level: EDITION.level,
      edition: EDITION.edition,
      lessonId: makeLessonId(EDITION.curriculumId, EDITION.level, n),
      hanzi,
      pinyin,
      meaningVi,
      glossEn,
      emoji: '',
      pinyinNote: '',
      section,
      isExtended: false,
      origin: 'textbook',
      meaningOrigin: 'ai_draft',
      source: {
        fileName: EDITION.fileName,
        pdfPage: pdfPage(printed),
        printedPage: String(printed),
        section: section === 'key' ? 'Key sentences' : "Let's read",
        verificationStatus: 'needs_teacher_check',
      },
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
    }),
  );
}

let gi = 0;
for (const [n, promptVi, sentence, correct, wrongs, explainVi] of GRAMMAR) {
  gi++;
  items.push(
    ContentItemSchema.parse({
      id: `yct1-l${n}-g-${gi}`,
      schemaVersion: SCHEMA_VERSION,
      type: 'grammar',
      curriculumId: EDITION.curriculumId,
      level: EDITION.level,
      edition: EDITION.edition,
      lessonId: makeLessonId(EDITION.curriculumId, EDITION.level, n),
      hanzi: sentence,
      pinyin: '-',
      meaningVi: promptVi,
      glossEn: '',
      emoji: '',
      pinyinNote: '',
      promptVi,
      correct,
      wrongs,
      explainVi,
      isExtended: false,
      // Câu ngữ pháp do người soạn viết dựa trên Key sentences — KHÔNG phải nguyên văn sách.
      origin: 'teacher_authored',
      meaningOrigin: 'teacher_authored',
      source: {
        fileName: EDITION.fileName,
        pdfPage: null,
        printedPage: null,
        section: 'Soạn từ Key sentences của bài',
        verificationStatus: 'needs_teacher_check',
      },
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
    }),
  );
}

/* ── kiểm tra tính toàn vẹn trước khi ghi ─────────────────────────────── */
const lessonIds = new Set(curriculum.lessons.map((l) => l.lessonId));
const problems: string[] = [];
const ids = new Set<string>();
for (const it of items) {
  if (!lessonIds.has(it.lessonId)) problems.push(`${it.id}: lessonId ${it.lessonId} không có trong catalog`);
  if (ids.has(it.id)) problems.push(`Trùng id: ${it.id}`);
  ids.add(it.id);
  if (it.status !== 'draft') problems.push(`${it.id}: trạng thái phải là draft khi sinh tự động`);
}
if (problems.length) {
  console.error('LỖI NỘI DUNG:\n' + problems.join('\n'));
  process.exit(1);
}

const byLesson = new Map<string, { vocab: number; sentence: number; grammar: number }>();
for (const it of items) {
  const e = byLesson.get(it.lessonId) ?? { vocab: 0, sentence: 0, grammar: 0 };
  e[it.type]++;
  byLesson.set(it.lessonId, e);
}

const coverage = curriculum.lessons.map((l) => ({
  lessonId: l.lessonId,
  n: l.n,
  titleVi: l.titleVi,
  extracted: byLesson.get(l.lessonId) ?? { vocab: 0, sentence: 0, grammar: 0 },
  draft: (byLesson.get(l.lessonId)?.vocab ?? 0) + (byLesson.get(l.lessonId)?.sentence ?? 0) + (byLesson.get(l.lessonId)?.grammar ?? 0),
  reviewed: 0,
  published: 0,
  unresolved: l.n === 12 ? 1 : 0,
}));

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'curriculum.json'), JSON.stringify(curriculum, null, 2) + '\n');
writeFileSync(resolve(outDir, 'items.json'), JSON.stringify(items, null, 2) + '\n');
writeFileSync(
  resolve(outDir, 'coverage.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Tất cả mục ở trạng thái draft. reviewed/published = 0 cho tới khi giáo viên duyệt trong app.',
      totals: {
        vocab: items.filter((i) => i.type === 'vocab').length,
        extendedVocab: items.filter((i) => i.type === 'vocab' && i.isExtended).length,
        sentence: items.filter((i) => i.type === 'sentence').length,
        grammar: items.filter((i) => i.type === 'grammar').length,
      },
      byLesson: coverage,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `Đã sinh ${items.length} mục cho ${curriculum.lessons.length} bài ` +
    `(${items.filter((i) => i.type === 'vocab').length} từ vựng, ` +
    `${items.filter((i) => i.type === 'sentence').length} câu, ` +
    `${items.filter((i) => i.type === 'grammar').length} ngữ pháp).`,
);
