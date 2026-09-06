import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '@yct/shared';
import type { AnswerResult } from '../api/types';
import { AudioControls } from './AudioButton';
import { stopSpeaking } from '../audio/tts';

/**
 * Hiển thị một câu hỏi. Mọi nội dung do người dùng/giáo viên nhập đều đi qua
 * text node của React — không có innerHTML ở bất kỳ đâu.
 */
export function QuestionView({
  question,
  index,
  total,
  result,
  onAnswer,
  onSelfReport,
  onNext,
  ttsText,
}: {
  question: Question;
  index: number;
  total: number;
  result: AnswerResult | null;
  onAnswer: (response: string) => void;
  onSelfReport: (remembered: boolean) => void;
  onNext: () => void;
  ttsText: string | null;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChosen(null);
    setRevealed(false);
    setOrder([]);
    stopSpeaking(); // dừng âm khi đổi câu
  }, [question.questionId]);

  const answered = result !== null;
  const isFlashcard = question.kind === 'flashcard';
  const isOrder = question.kind === 'order_words';

  const twoCol = useMemo(
    () => question.options.length >= 3 && question.options.every((o) => o.text.length <= 12),
    [question.options],
  );

  return (
    <section aria-labelledby="q-instruction">
      <div className="stats">
        <span>
          Câu <b>{index + 1}</b>/<b>{total}</b>
        </span>
        <span aria-hidden="true">{question.assistance.showPinyin ? 'Có gợi ý pinyin' : ''}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
        <i style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <div className="qcard">
        <h2 id="q-instruction" style={{ fontSize: 14, color: 'var(--ink-soft)', letterSpacing: '.04em' }}>
          {question.instructionVi}
        </h2>

        {question.promptEmoji ? (
          <div className="qemoji" aria-hidden="true">
            {question.promptEmoji}
          </div>
        ) : null}

        {question.promptHanzi ? (
          <div
            className={question.promptHanzi.length > 4 ? 'qsentence' : 'qhanzi'}
            lang="zh-Hans"
          >
            {question.promptHanzi}
          </div>
        ) : null}

        {question.promptPinyin ? <div className="qpinyin">{question.promptPinyin}</div> : null}

        {question.promptText ? <div className="qmeaning">{question.promptText}</div> : null}

        {ttsText && question.assistance.allowReplayAudio ? <AudioControls text={ttsText} /> : null}

        {/* ── thẻ nhớ ─────────────────────────────────────────────────── */}
        {isFlashcard ? (
          <>
            {revealed ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px dashed var(--line-strong)',
                }}
              >
                <div className="qpinyin">{result?.reveal.pinyin}</div>
                <div className="qmeaning" style={{ marginTop: 6 }}>
                  {result?.reveal.meaningVi}
                </div>
              </div>
            ) : null}
            {!revealed ? (
              <button
                type="button"
                className="btn btn--gold btn--block"
                style={{ marginTop: 18 }}
                onClick={() => {
                  setRevealed(true);
                  // 'reveal' chứ không phải chuỗi rỗng: thẻ nhớ KHÔNG phải câu bỏ qua,
                  // và cũng không được chấm khách quan (xem OBJECTIVE_KINDS).
                  onAnswer('reveal');
                }}
              >
                🔎 Lật thẻ xem đáp án
              </button>
            ) : (
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button type="button" className="btn btn--ghost" onClick={() => onSelfReport(false)}>
                  Con muốn ôn thêm
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => onSelfReport(true)}>
                  Con nhớ rồi
                </button>
              </div>
            )}
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Thẻ nhớ do con tự đánh giá — phần này ghi riêng, không tính vào điểm bài làm.
            </p>
          </>
        ) : null}

        {/* ── sắp xếp câu ─────────────────────────────────────────────── */}
        {isOrder ? (
          <div style={{ marginTop: 16 }}>
            <div className="qsentence" lang="zh-Hans" style={{ minHeight: 44 }}>
              {order.map((id) => question.options.find((o) => o.id === id)?.text).join('')}
            </div>
            <div className="chips" style={{ justifyContent: 'center', marginTop: 12 }}>
              {question.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="chip"
                  lang="zh-Hans"
                  aria-pressed={order.includes(o.id)}
                  disabled={answered}
                  onClick={() =>
                    setOrder((cur) => (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]))
                  }
                >
                  {o.text}
                </button>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setOrder([])} disabled={answered}>
                Xoá hết
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={answered || order.length !== question.options.length}
                onClick={() =>
                  onAnswer(order.map((id) => question.options.find((o) => o.id === id)?.text ?? '').join(''))
                }
              >
                Kiểm tra
              </button>
            </div>
          </div>
        ) : null}

        {/* ── câu trắc nghiệm ─────────────────────────────────────────── */}
        {!isFlashcard && !isOrder ? (
          <>
            <div
              className={twoCol ? 'options options--2col' : 'options'}
              role="group"
              aria-labelledby="q-instruction"
            >
              {question.options.map((o) => {
                const state =
                  !answered || !result
                    ? undefined
                    : o.id === result.correctOptionId
                      ? 'correct'
                      : o.id === chosen
                        ? 'wrong'
                        : undefined;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="opt"
                    data-state={state}
                    disabled={answered}
                    lang={/[一-鿿]/.test(o.text) ? 'zh-Hans' : undefined}
                    onClick={() => {
                      setChosen(o.id);
                      onAnswer(o.id);
                    }}
                  >
                    <span>{o.text}</span>
                    {o.sub ? <span className="opt-sub">{o.sub}</span> : null}
                    {state === 'correct' ? <span className="sr-only">(đáp án đúng)</span> : null}
                    {state === 'wrong' ? <span className="sr-only">(con chọn — chưa đúng)</span> : null}
                  </button>
                );
              })}
            </div>
            {question.options.length < 4 ? (
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Câu này có {question.options.length} lựa chọn.
              </p>
            ) : null}
          </>
        ) : null}

        {/* ── phản hồi ────────────────────────────────────────────────── */}
        <div ref={liveRef} aria-live="polite">
          {answered && result && !isFlashcard ? (
            <>
              <p className="verdict" data-kind={result.correct ? 'ok' : 'bad'}>
                <span className="mark" aria-hidden="true">
                  {result.correct ? '✓' : '✕'}
                </span>
                <span>{result.correct ? 'Đúng rồi!' : 'Chưa đúng.'}</span>
              </p>
              <div className="explain">
                <div>
                  <b lang="zh-Hans">{result.reveal.hanzi}</b>{' '}
                  <span style={{ color: 'var(--seal-text)' }}>{result.reveal.pinyin}</span> —{' '}
                  {result.reveal.meaningVi}
                </div>
                {result.explainVi ? <div style={{ marginTop: 4 }}>💡 {result.explainVi}</div> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {answered && !isFlashcard ? (
        <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={onNext}>
          {index + 1 >= total ? 'Xem kết quả ▶' : 'Câu tiếp theo ▶'}
        </button>
      ) : null}
    </section>
  );
}
