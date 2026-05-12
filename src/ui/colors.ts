type Hsl = { h: number; s: number; l: number };

const TOP: Hsl = { h: 0, s: 75, l: 50 };
const BOTTOM: Hsl = { h: 50, s: 85, l: 55 };
const ROW_GRADIENT_DELTA_L = 5;

function interpolate(index: number, total: number): Hsl {
  if (total <= 1) return { ...TOP };
  const t = index / (total - 1);
  return {
    h: TOP.h + (BOTTOM.h - TOP.h) * t,
    s: TOP.s + (BOTTOM.s - TOP.s) * t,
    l: TOP.l + (BOTTOM.l - TOP.l) * t,
  };
}

function fmt({ h, s, l }: Hsl): string {
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
}

export function colorForPosition(index: number, total: number): string {
  return fmt(interpolate(index, total));
}

export function rowBackgroundForPosition(index: number, total: number): string {
  const c = interpolate(index, total);
  const upper = fmt({ h: c.h, s: c.s, l: Math.min(100, c.l + ROW_GRADIENT_DELTA_L) });
  const lower = fmt({ h: c.h, s: c.s, l: Math.max(0, c.l - ROW_GRADIENT_DELTA_L) });
  return `linear-gradient(to bottom, ${upper}, ${lower})`;
}
