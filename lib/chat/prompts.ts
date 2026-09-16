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
