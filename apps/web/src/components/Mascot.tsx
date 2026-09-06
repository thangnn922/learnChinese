/**
 * Gấu trúc đồng hành. Hình vẽ SVG tự tạo — không sao chép nhân vật có sẵn.
 * Chỉ khích lệ, không bao giờ chê trách.
 */
export function Panda({ mood = 'happy', size = 44 }: { mood?: 'happy' | 'think' | 'cheer'; size?: number }) {
  const eye = mood === 'think' ? 3.2 : 4.2;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Gấu trúc Panda"
      focusable="false"
    >
      <circle cx="16" cy="16" r="9" fill="#2a2420" />
      <circle cx="48" cy="16" r="9" fill="#2a2420" />
      <circle cx="32" cy="34" r="24" fill="#faf6ec" stroke="#2a2420" strokeWidth="2" />
      <ellipse cx="22" cy="31" rx="7" ry="8.5" fill="#2a2420" />
      <ellipse cx="42" cy="31" rx="7" ry="8.5" fill="#2a2420" />
      <circle cx="22.5" cy={mood === 'cheer' ? 29 : 31} r={eye} fill="#faf6ec" />
      <circle cx="41.5" cy={mood === 'cheer' ? 29 : 31} r={eye} fill="#faf6ec" />
      <ellipse cx="32" cy="41" rx="4.4" ry="3.2" fill="#2a2420" />
      {mood === 'happy' || mood === 'cheer' ? (
        <path d="M25 46 Q32 52 39 46" stroke="#2a2420" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M26 47 Q32 45 38 47" stroke="#2a2420" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      )}
      {mood === 'cheer' ? (
        <>
          <path d="M8 8 l3 5 l-5 -1 z" fill="#b23a3a" />
          <path d="M56 8 l-3 5 l5 -1 z" fill="#4f7c6d" />
        </>
      ) : null}
    </svg>
  );
}

export function MascotLine({
  text,
  mood = 'happy',
}: {
  text: string;
  mood?: 'happy' | 'think' | 'cheer';
}) {
  return (
    <p className="mascot" role="status">
      <span className="face" aria-hidden="true">
        <Panda mood={mood} size={36} />
      </span>
      <span>{text}</span>
    </p>
  );
}
