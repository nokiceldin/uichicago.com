export function getDeterministicItems<T>(items: readonly T[], count: number, offset = 0): T[] {
  if (items.length === 0 || count <= 0) return [];

  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  const result: T[] = [];
  const resultCount = Math.min(count, items.length);

  for (let index = 0; index < resultCount; index += 1) {
    result.push(items[(normalizedOffset + index) % items.length]);
  }

  return result;
}

/**
 * Returns a reproducibly shuffled subset. Supplying a seed lets client
 * components choose a fresh set once per visit without reshuffling on every
 * render.
 */
export function getSeededRandomItems<T>(items: readonly T[], count: number, seed: number): T[] {
  if (items.length === 0 || count <= 0) return [];

  const shuffled = [...items];
  let state = seed >>> 0;

  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}
