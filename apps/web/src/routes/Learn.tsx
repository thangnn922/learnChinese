import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/index';
import type { AnswerResult, AttemptView } from '../api/types';
import { idemKey, useActiveTimer, useAsync, useOnline } from '../hooks';
import { Banner, ErrorState, Loading } from '../components/States';
import { QuestionView } from '../components/QuestionView';
import { Modal } from '../components/Modal';
import { stopSpeaking } from '../audio/tts';

export function Learn() {
  const { attemptId = '' } = useParams();
  const nav = useNavigate();
  const online = useOnline();
  const [state, reload] = useAsync<AttemptView>(() => api().resumeAttempt(attemptId), [attemptId]);

  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [tryIndex, setTryIndex] = useState(1);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [busy, setBusy] = useState(false);

  const attempt = state.status === 'ok' ? state.data : null;
  const question = attempt?.questions[index] ?? null;
  const readActiveMs = useActiveTimer(question?.questionId ?? '');

  useEffect(() => {
    if (attempt) setIndex(Math.min(attempt.cursor, Math.max(0, attempt.questions.length - 1)));
  }, [attempt]);

  useEffect(() => () => stopSpeaking(), []);

  const onAnswer = useCallback(
    async (response: string) => {
      if (!attempt || !question || busy) return;
      setBusy(true);
      setSendError(null);
      try {
        const r = await api().submitAnswer({
          attemptId: attempt.attemptId,
          questionId: question.questionId,
          response,
          tryIndex,
          assistanceUsed: [
            question.assistance.showPinyin ? 'pinyin' : '',
            question.assistance.showEmoji ? 'emoji' : '',
          ].filter(Boolean),
          activeMs: readActiveMs(),
          // khoá idempotency: cùng câu + cùng lần thử → chỉ ghi một lần dù bấm/gửi lại
          idempotencyKey: idemKey([attempt.attemptId, question.questionId, tryIndex]),
        });
        setResult(r);
      } catch (e) {
        setSendError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [attempt, question, tryIndex, busy, readActiveMs],
  );

  const onSelfReport = useCallback(
    async (remembered: boolean) => {
      if (!attempt || !question) return;
      const contentId = question.refContentIds[0];
      if (contentId) {
        try {
          await api().submitSelfReport({
            attemptId: attempt.attemptId,
            contentId,
            remembered,
            idempotencyKey: idemKey([attempt.attemptId, question.questionId, 'self']),
          });
        } catch (e) {
          setSendError((e as Error).message);
          return;
        }
      }
      goNext();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempt, question],
  );

  const goNext = useCallback(() => {
    stopSpeaking();
    setResult(null);
    setTryIndex(1);
    if (!attempt) return;
    if (index + 1 >= attempt.questions.length) {
      void api()
        .finishAttempt(attempt.attemptId)
        .then(() => nav(`/ket-qua/${attempt.attemptId}`))
        .catch((e: Error) => setSendError(e.message));
    } else {
      setIndex((i) => i + 1);
    }
  }, [attempt, index, nav]);

  if (state.status === 'loading' || state.status === 'idle') return <Loading label="Đang mở bài học…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  if (!attempt || !question)
    return <ErrorState message="Lượt học này không có câu hỏi nào." onRetry={() => nav('/')} />;

  const ttsText =
    question.audioContentId && (question.promptHanzi || result?.reveal.hanzi)
      ? question.promptHanzi || result?.reveal.hanzi || ''
      : question.audioContentId
        ? // dạng nghe: chưa lộ chữ, nhưng vẫn phải phát được → dùng nội dung ẩn của câu
          (question.promptHanzi ?? '')
        : '';

  return (
    <div className="page page--learn">
      {!online ? <Banner kind="warn" icon="📴">Máy đang mất mạng. Câu trả lời sẽ được gửi lại khi có mạng.</Banner> : null}
      {attempt.reducedNotice ? <Banner kind="info">{attempt.reducedNotice}</Banner> : null}
      {sendError ? <Banner kind="bad">{sendError}</Banner> : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ minHeight: 40, padding: '6px 14px', fontSize: 14 }}
          onClick={() => setConfirmExit(true)}
        >
          ← Thoát
        </button>
        <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>
          {attempt.mode === 'assessment' ? 'Bài kiểm tra' : 'Luyện tập'}
        </span>
      </div>

      <QuestionView
        question={question}
        index={index}
        total={attempt.questions.length}
        result={result}
        onAnswer={(r) => void onAnswer(r)}
        onSelfReport={(r) => void onSelfReport(r)}
        onNext={goNext}
        ttsText={ttsText || null}
      />

      <Modal
        open={confirmExit}
        titleId="exit-title"
        title="Con đang làm dở một bài"
        description="Con muốn học tiếp hay để dành lần sau? Bài đang làm sẽ được lưu lại."
        onClose={() => setConfirmExit(false)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmExit(false)}>
              Học tiếp
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                stopSpeaking();
                nav('/');
              }}
            >
              Để dành lần sau
            </button>
          </>
        }
      />
    </div>
  );
}
