/**
 * Chuẩn hoá văn bản.
 *
 * CẢNH BÁO QUAN TRỌNG
 * ───────────────────
 * `normalizeHeader` bỏ dấu — nó CHỈ dùng cho tên cột khi nhập dữ liệu.
 * TUYỆT ĐỐI không dùng cho pinyin: bỏ dấu thanh và ü sẽ phá luyện thanh điệu
 * (mā/má/mǎ/mà thành “ma”, nǚ thành “nu”).
 * Với pinyin dùng `normalizePinyinForCompare` (giữ nguyên dấu, chỉ gộp khoảng trắng).
 */

/** Chỉ dùng cho tên cột khi import. Bỏ dấu tiếng Việt + đ → d. */
export function normalizeHeader(s: string): string {
  return (s ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** So khớp pinyin: giữ nguyên dấu thanh và ü, chỉ gộp khoảng trắng và hạ chữ hoa. */
export function normalizePinyinForCompare(s: string): string {
  return (s ?? '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/['\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const TONE_MARKS = /[\u0304\u0301\u030C\u0300]/; // ˉ ˊ ˇ ˋ

/** true nếu chuỗi pinyin có ít nhất một dấu thanh (dùng để cảnh báo khi import). */
export function hasToneMark(s: string): boolean {
  return TONE_MARKS.test((s ?? '').normalize('NFD'));
}

/** true nếu pinyin dùng ü / ǖǘǚǜ đúng cách (không phải "v" hay "u:"). */
export function hasBadUmlaut(s: string): boolean {
  // Pinyin chuẩn không bao giờ có chữ "v"; "v" và "u:" là cách gõ tắt cho ü.
  return /u:|v/i.test(s ?? '');
}

/**
 * Chuẩn hoá nghĩa tiếng Việt để phát hiện hai phương án CÙNG NGHĨA.
 * Giữ dấu tiếng Việt (không bỏ dấu!), bỏ dấu câu, gộp khoảng trắng,
 * bỏ các từ đệm hay gặp trong gloss.
 */
const FILLER = /\b(la|một|mot|cái|cai|con|sự|su|việc|viec)\b/g;
export function meaningKey(s: string): string {
  const base = (s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // bỏ phần giải thích trong ngoặc
    .replace(/[.,;:!?…"'“”‘’()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(/\s*[,/;]\s*|\s+hoặc\s+/)
    .map((part) => part.replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort()
    .join('|');
}

/** Nội dung trong ngoặc, đã chuẩn hoá — phần này phân biệt “bạn ấy (con trai)” với “bạn ấy (con gái)”. */
export function parentheticalKey(s: string): string {
  const found = (s ?? '').match(/\(([^)]*)\)/g);
  if (!found) return '';
  return found
    .map((p) => p.slice(1, -1).toLowerCase().replace(/\s+/g, ' ').trim())
    .sort()
    .join('|');
}

/**
 * Hai nghĩa bị coi là TRÙNG (không được làm phương án của nhau) khi:
 *   phần nghĩa chính (đã bỏ ngoặc) chồng nhau,
 *   VÀ không có cặp chú thích trong ngoặc khác nhau để học sinh phân biệt.
 *
 * Ví dụ:
 *   “bạn ấy (con trai)” vs “bạn ấy (con gái)” → phân biệt được → KHÔNG trùng.
 *   “học” vs “học (dạng rút gọn)”            → không phân biệt được → TRÙNG.
 */
export function meaningsOverlap(a: string, b: string): boolean {
  const A = new Set(meaningKey(a).split('|').filter(Boolean));
  const B = meaningKey(b).split('|').filter(Boolean);
  if (!B.some((x) => A.has(x))) return false;
  const pa = parentheticalKey(a);
  const pb = parentheticalKey(b);
  if (pa && pb && pa !== pb) return false;
  return true;
}

/** Loại bỏ ký tự điều khiển và BOM khỏi dữ liệu người dùng nhập. */
export function sanitizeCell(s: string): string {
  return (s ?? '')
    .replace(/^\uFEFF/, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Chặn formula injection khi xuất CSV/TSV cho Excel/Google Sheets.
 * Ô bắt đầu bằng = + - @ TAB CR sẽ được thêm dấu nháy đơn.
 */
export function csvSafeCell(s: string): string {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Bao ô cho CSV. */
export function csvQuote(s: string): string {
  const v = csvSafeCell(s);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function containsHanzi(s: string): boolean {
  return /[㐀-䶿一-鿿]/.test(s ?? '');
}
