/**
 * Parser CSV / TSV cho dữ liệu dán từ Google Sheets.
 *
 * Xử lý được: BOM, dấu nháy kép, dấu phân cách nằm trong ô đã bao nháy,
 * xuống dòng nằm trong ô, nháy kép lồng ("" → "), CRLF / CR / LF.
 * Không dùng `String.split` cho toàn văn bản — tách theo trạng thái.
 */

export interface CsvLimits {
  maxBytes: number;
  maxRows: number;
}

export const DEFAULT_CSV_LIMITS: CsvLimits = {
  maxBytes: 2 * 1024 * 1024, // 2 MB
  maxRows: 5000,
};

export interface CsvParseResult {
  rows: string[][];
  /** true khi đã cắt bớt vì chạm giới hạn */
  truncated: boolean;
  delimiter: '\t' | ',';
}

export class CsvLimitError extends Error {
  constructor(
    message: string,
    readonly kind: 'bytes' | 'rows',
  ) {
    super(message);
    this.name = 'CsvLimitError';
  }
}

/** Đoán dấu phân cách bằng dòng logic đầu tiên (bỏ qua nội dung trong nháy). */
export function detectDelimiter(text: string): '\t' | ',' {
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === '\t') tabs++;
    else if (c === ',') commas++;
    else if (c === '\n' || c === '\r') break;
  }
  return tabs >= commas && tabs > 0 ? '\t' : ',';
}

export function parseDelimited(
  raw: string,
  limits: CsvLimits = DEFAULT_CSV_LIMITS,
  forceDelimiter?: '\t' | ',',
): CsvParseResult {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > limits.maxBytes) {
    throw new CsvLimitError(
      `Dữ liệu ${(bytes / 1024 / 1024).toFixed(1)} MB, vượt giới hạn ${(limits.maxBytes / 1024 / 1024).toFixed(1)} MB.`,
      'bytes',
    );
  }
  const text = raw.replace(/^\uFEFF/, '');
  const delimiter = forceDelimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let truncated = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // bỏ hàng hoàn toàn rỗng
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > limits.maxRows) {
      truncated = true;
    }
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      endField();
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
      if (truncated) break;
    } else if (c === '\n') {
      endRow();
      if (truncated) break;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  if (rows.length > limits.maxRows) {
    rows.length = limits.maxRows;
    truncated = true;
  }
  return { rows, truncated, delimiter };
}

/** Xuất TSV an toàn cho spreadsheet (chặn formula injection). */
export function toTsv(header: string[], rows: string[][]): string {
  const esc = (s: string) => {
    const v = /^[=+\-@\t\r]/.test(s ?? '') ? `'${s}` : (s ?? '');
    return v.replace(/[\t\r\n]/g, ' ');
  };
  return [header.map(esc).join('\t'), ...rows.map((r) => r.map(esc).join('\t'))].join('\n');
}
