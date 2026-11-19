export const AXES = ['x', 'y', 'z'];
export function constrainAngles(values, limits, coupled = false) {
  const result = values.map((v, i) => Math.max(limits[i][0], Math.min(limits[i][1], Number.isFinite(v) ? v : 0)));
  // Multi-axis ball joints: prevent simultaneous extremes, while keeping single-axis reach.
  if (coupled) {
    const norm = Math.sqrt(result.reduce((sum, value, i) => {
      const bound = value < 0 ? -limits[i][0] : limits[i][1];
      return sum + (bound ? (value / bound) ** 2 : 0);
    }, 0));
    if (norm > 1) return result.map(v => v / norm);
  }
  return result;
}
