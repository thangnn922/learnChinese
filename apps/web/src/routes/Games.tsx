import { useCallback, useEffect, useState } from 'react';
import type { MatchGame, OrderGame } from '@yct/shared';
import { MASCOT_LINES_VI } from '@yct/shared';
import { api } from '../api/index';
import { useSession } from '../session';
import { EmptyState, Loading } from '../components/States';
import { MascotLine, Panda } from '../components/Mascot';

type Which = 'match' | 'order';

export function Games() {
  const { lessonIds } = useSession();
  const [which, setWhich] = useState<Which>('match');
  const [game, setGame] = useState<MatchGame | OrderGame | null | 'loading'>('loading');

  const load = useCallback(
    async (kind: Which) => {
      setGame('loading');
      const g = (await api().getGameData(kind, lessonIds)) as MatchGame | OrderGame | null;
      setGame(g);
    },
    [lessonIds],
  );

  useEffect(() => {
    void load(which);
  }, [which, load]);

  return (
    <div className="page">
      <h1>Trò chơi ngắn</h1>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button type="button" className="chip" aria-pressed={which === 'match'} onClick={() => setWhich('match')}>
          Ghép hình – từ
        </button>
        <button type="button" className="chip" aria-pressed={which === 'order'} onClick={() => setWhich('order')}>
          Xếp câu
        </button>
      </div>

      {lessonIds.length === 0 ? (
        <EmptyState icon="🎯" title="Con chọn bài trước nhé">
          Vào mục “Học” chọn bài, rồi quay lại đây chơi với đúng những từ con vừa học.
        </EmptyState>
      ) : game === 'loading' ? (
        <Loading label="Đang chuẩn bị trò chơi…" />
      ) : game === null ? (
        <EmptyState icon="🧩" title="Chưa đủ nội dung để chơi">
          Bài con chọn chưa có đủ mục đã duyệt cho trò chơi này. Con chọn thêm bài khác nhé.
        </EmptyState>
      ) : game.kind === 'match_pairs' ? (
        <MatchBoard game={game} onReload={() => void load('match')} />
      ) : (
        <OrderBoard game={game} onReload={() => void load('order')} />
      )}
    </div>
  );
}

/* ── Ghép hình – từ ─────────────────────────────────────────────────────── */

function MatchBoard({ game, onReload }: { game: MatchGame; onReload: () => void }) {
  const [pickedLeft, setPickedLeft] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [msg, setMsg] = useState(MASCOT_LINES_VI.start[0] as string);

  const finished = done.length === game.pairs.length;

  const choose = (side: 'left' | 'right', pairId: string) => {
    if (done.includes(pairId)) return;
    if (side === 'left') {
      setPickedLeft(pairId);
      return;
    }
    if (!pickedLeft) {
      setMsg('Con chọn hình bên trái trước nhé.');
      return;
    }
    if (pickedLeft === pairId) {
      setDone((d) => [...d, pairId]);
      setMsg(MASCOT_LINES_VI.correct[done.length % MASCOT_LINES_VI.correct.length] as string);
    } else {
      setMsg(MASCOT_LINES_VI.wrong[0] as string);
    }
    setPickedLeft(null);
  };

  const byId = (id: string) => game.pairs.find((p) => p.pairId === id)!;

  return (
    <div className="card">
      <h2 className="section">Ghép hình với từ</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Chạm vào hình, rồi chạm vào từ đúng. Dùng bàn phím cũng được: Tab để chuyển, Enter để chọn.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {game.leftOrder.map((id) => {
            const p = byId(id);
            const isDone = done.includes(id);
            return (
              <button
                key={id}
                type="button"
                className="opt"
                data-state={isDone ? 'correct' : undefined}
                aria-pressed={pickedLeft === id}
                disabled={isDone}
                onClick={() => choose('left', id)}
              >
                <span style={{ fontSize: 30 }} aria-hidden="true">
                  {p.emoji}
                </span>
                <span className="sr-only">Hình {p.meaningVi}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {game.rightOrder.map((id) => {
            const p = byId(id);
            const isDone = done.includes(id);
            return (
              <button
                key={id}
                type="button"
                className="opt"
                data-state={isDone ? 'correct' : undefined}
                disabled={isDone}
                onClick={() => choose('right', id)}
              >
                <span lang="zh-Hans" style={{ fontFamily: 'var(--font-zh)', fontSize: 22 }}>
                  {p.hanzi}
                </span>
                <span className="opt-sub">{p.pinyin}</span>
              </button>
            );
          })}
        </div>
      </div>

      <MascotLine text={finished ? (MASCOT_LINES_VI.done[0] as string) : msg} mood={finished ? 'cheer' : 'happy'} />
      {finished ? (
        <button type="button" className="btn btn--secondary btn--block" style={{ marginTop: 12 }} onClick={onReload}>
          Chơi vòng nữa
        </button>
      ) : null}
    </div>
  );
}

/* ── Xếp câu ───────────────────────────────────────────────────────────── */

function OrderBoard({ game, onReload }: { game: OrderGame; onReload: () => void }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<'none' | 'ok' | 'bad'>('none');

  const r = game.rounds[round];
  if (!r)
    return (
      <div className="card">
        <div style={{ textAlign: 'center' }}>
          <Panda mood="cheer" size={64} />
          <h2 className="section" style={{ marginTop: 10 }}>Xong rồi!</h2>
          <button type="button" className="btn btn--secondary btn--block" onClick={onReload}>
            Chơi vòng nữa
          </button>
        </div>
      </div>
    );

  const answer = picked.map((id) => r.tokens.find((t) => t.id === id)?.text ?? '').join('');

  return (
    <div className="card">
      <h2 className="section">
        Xếp câu ({round + 1}/{game.rounds.length})
      </h2>
      <p style={{ marginTop: 0 }}>
        Câu tiếng Việt: <b>{r.meaningVi}</b>
      </p>
      <div className="qsentence" lang="zh-Hans" style={{ minHeight: 48, textAlign: 'center' }}>
        {answer || '…'}
      </div>
      <div className="chips" style={{ justifyContent: 'center', marginTop: 12 }}>
        {r.tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            lang="zh-Hans"
            aria-pressed={picked.includes(t.id)}
            onClick={() =>
              setPicked((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))
            }
          >
            {t.text}
          </button>
        ))}
      </div>
      <div className="modal-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--ghost" onClick={() => setPicked([])}>
          Xoá hết
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={picked.length !== r.tokens.length}
          onClick={() => setVerdict(answer === r.answer ? 'ok' : 'bad')}
        >
          Kiểm tra
        </button>
      </div>

      {verdict !== 'none' ? (
        <>
          <p className="verdict" data-kind={verdict === 'ok' ? 'ok' : 'bad'}>
            <span className="mark" aria-hidden="true">
              {verdict === 'ok' ? '✓' : '✕'}
            </span>
            <span>
              {verdict === 'ok'
                ? (MASCOT_LINES_VI.correct[0] as string)
                : `${MASCOT_LINES_VI.wrong[0]} Câu đúng là: ${r.answer}`}
            </span>
          </p>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => {
              setRound((n) => n + 1);
              setPicked([]);
              setVerdict('none');
            }}
          >
            Câu tiếp theo
          </button>
        </>
      ) : null}
    </div>
  );
}
