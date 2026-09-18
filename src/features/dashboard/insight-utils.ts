export function boundedPercent(numerator: number, denominator: number | null | undefined) {
  if (!denominator || denominator <= 0 || numerator <= 0) return 0;
  const rounded = Math.round((numerator / denominator) * 100);
  return Math.max(0, Math.min(100, rounded));
}
