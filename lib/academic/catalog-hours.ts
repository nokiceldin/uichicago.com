export function parseFixedCatalogHours(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function catalogHoursCountTowardGraduation(description: string | null | undefined) {
  return !/\bno graduation credit\b/i.test(description ?? "");
}
