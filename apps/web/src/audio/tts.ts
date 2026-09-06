/**
 * Phát âm tiếng Trung.
 *
 * Thứ tự ưu tiên:
 *   1. Tệp audio do giáo viên tải lên và đã kiểm tra (chưa có trong MVP — sách chỉ có ký hiệu CD/QR).
 *   2. Web Speech API với giọng zh-CN / zh-Hans → luôn gắn nhãn "Giọng đọc máy".
 *   3. Không có giọng phù hợp → báo cho người dùng, KHÔNG đọc bằng tiếng Việt/tiếng Anh thay thế.
 *
 * Không bao giờ tự phát khi mở màn hình; chỉ phát sau thao tác của người dùng.
 */

export type TtsState =
  | { kind: 'unsupported' }
  | { kind: 'no-chinese-voice' }
  | { kind: 'ready'; voiceName: string };

const ZH = /^zh(-|_)?(cn|hans|sg)?/i;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const zh = voices.filter((v) => ZH.test(v.lang));
  if (!zh.length) return null;
  // ưu tiên giọng Phổ thông giản thể
  return (
    zh.find((v) => /zh[-_]?CN/i.test(v.lang)) ??
    zh.find((v) => /Hans/i.test(v.lang)) ??
    (zh[0] as SpeechSynthesisVoice)
  );
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Danh sách giọng nạp bất đồng bộ trên một số trình duyệt. */
export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener('voiceschanged', done);
  });
}

export async function probeTts(): Promise<TtsState> {
  if (!ttsSupported()) return { kind: 'unsupported' };
  const v = pickVoice(await waitForVoices());
  return v ? { kind: 'ready', voiceName: v.name } : { kind: 'no-chinese-voice' };
}

export interface SpeakOptions {
  rate?: number;
  onEnd?: () => void;
  onError?: (reason: 'unsupported' | 'no-chinese-voice' | 'failed') => void;
}

let current: SpeechSynthesisUtterance | null = null;

/** Chỉ gọi từ trình xử lý sự kiện của người dùng. */
export async function speakChinese(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!ttsSupported()) {
    opts.onError?.('unsupported');
    return;
  }
  const voice = pickVoice(await waitForVoices());
  if (!voice) {
    opts.onError?.('no-chinese-voice');
    return;
  }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  // Trẻ 6–12 tuổi: đọc chậm hơn mặc định.
  u.rate = opts.rate ?? 0.85;
  u.pitch = 1;
  u.onend = () => {
    current = null;
    opts.onEnd?.();
  };
  u.onerror = () => {
    current = null;
    opts.onError?.('failed');
  };
  current = u;
  window.speechSynthesis.speak(u);
}

/** Dừng khi đổi màn hình / đóng modal / rời câu hỏi. */
export function stopSpeaking(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* trình duyệt chặn — bỏ qua */
  }
  current = null;
}

export function isSpeaking(): boolean {
  return current !== null;
}
