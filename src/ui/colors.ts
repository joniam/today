type Hsl = { h: number; s: number; l: number };

const TOP: Hsl = { h: 0, s: 75, l: 50 };
const BOTTOM: Hsl = { h: 50, s: 85, l: 55 };
const DONE_SCALE = 0.6;

function interpolate(index: number, total: number): Hsl {
  if (total <= 1) return { ...TOP };
  const t = index / (total - 1);
  return {
    h: TOP.h + (BOTTOM.h - TOP.h) * t,
    s: TOP.s + (BOTTOM.s - TOP.s) * t,
    l: TOP.l + (BOTTOM.l - TOP.l) * t,
  };
}

function format({ h, s, l }: Hsl): string {
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
}

export function colorForPosition(index: number, total: number): string {
  return format(interpolate(index, total));
}

export function mutedColorForPosition(index: number, total: number): string {
  const c = interpolate(index, total);
  return format({ h: c.h, s: c.s * DONE_SCALE, l: c.l * DONE_SCALE });
}
