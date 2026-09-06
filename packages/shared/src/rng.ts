/**
 * RNG tất định (mulberry32) — mọi việc sinh câu hỏi đều đi qua đây,
 * để một lỗi báo cáo kèm seed có thể tái hiện chính xác.
 */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T | undefined;
  shuffle<T>(arr: readonly T[]): T[];
}

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: string | number): Rng {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number =>
    maxExclusive <= 0 ? 0 : Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick<T>(arr: readonly T[]): T | undefined {
      return arr.length ? arr[int(arr.length)] : undefined;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = a2[i] as T;
        a2[i] = a2[j] as T;
        a2[j] = tmp;
      }
      return a2;
    },
  };
}

/** Seed ổn định cho một lượt học: cùng attempt → cùng đề. */
export function attemptSeed(attemptId: string, revision: number): string {
  return `${attemptId}:${revision}`;
}
