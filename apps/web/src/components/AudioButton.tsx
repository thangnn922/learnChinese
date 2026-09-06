import { useEffect, useState } from 'react';
import { probeTts, speakChinese, stopSpeaking, type TtsState } from '../audio/tts';

/**
 * Cụm nút nghe (tốc độ thường + chậm) và MỘT dòng trạng thái duy nhất.
 * Không bao giờ tự phát — chỉ phát khi người dùng bấm.
 * Máy không có giọng tiếng Trung → báo bằng tiếng Việt và vô hiệu hoá nút;
 * KHÔNG bao giờ đọc thay bằng tiếng Việt hay tiếng Anh.
 */
export function AudioControls({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const [state, setState] = useState<TtsState | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'none' | 'normal' | 'slow'>('none');

  useEffect(() => {
    let alive = true;
    void probeTts().then((s) => alive && setState(s));
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, []);

  const unavailable = state !== null && state.kind !== 'ready';

  const play = (slow: boolean) => {
    setMsg('');
    setBusy(slow ? 'slow' : 'normal');
    void speakChinese(text, {
      rate: slow ? 0.6 : 0.85,
      onEnd: () => setBusy('none'),
      onError: (reason) => {
        setBusy('none');
        setMsg(
          reason === 'unsupported'
            ? 'Trình duyệt này chưa đọc được tiếng Trung. Con nhờ cô đọc mẫu nhé!'
            : reason === 'no-chinese-voice'
              ? 'Máy chưa cài giọng đọc tiếng Trung. Con nhờ cô đọc mẫu nhé!'
              : 'Chưa phát được. Con thử lại nhé!',
        );
      },
    });
  };

  const note = unavailable
    ? 'Máy này chưa có giọng đọc tiếng Trung — con nhờ cô đọc mẫu nhé.'
    : state?.kind === 'ready'
      ? 'Giọng đọc máy'
      : '';

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => play(false)}
          disabled={disabled || unavailable}
          aria-describedby="tts-note"
        >
          <span aria-hidden="true">{busy === 'normal' ? '🔈' : '🔊'}</span> Nghe
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => play(true)}
          disabled={disabled || unavailable}
          aria-describedby="tts-note"
        >
          <span aria-hidden="true">{busy === 'slow' ? '🔈' : '🐢'}</span> Nghe chậm
        </button>
      </div>
      <p id="tts-note" className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>
        {msg || note}
      </p>
    </div>
  );
}
