import type { FaceLetter } from './moveEngine';
import type { RGB } from './scanTypes';

interface HueAnchor {
  letter: FaceLetter;
  hue: number;
}

// Real-world color -> facelet letter, matching STICKER_COLORS' existing
// letter -> hex mapping (U=white, R=red, F=green, D=yellow, L=orange, B=blue).
const HUE_ANCHORS: HueAnchor[] = [
  { letter: 'R', hue: 0 },
  { letter: 'L', hue: 30 },
  { letter: 'D', hue: 55 },
  { letter: 'F', hue: 130 },
  { letter: 'B', hue: 220 },
];

const WHITE_SATURATION_THRESHOLD = 0.25;

function rgbToHsv(rgb: RGB): { h: number; s: number; v: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function classifyColor(rgb: RGB): FaceLetter {
  const { h, s } = rgbToHsv(rgb);
  if (s < WHITE_SATURATION_THRESHOLD) return 'U';

  let best = HUE_ANCHORS[0];
  let bestDist = Infinity;
  for (const anchor of HUE_ANCHORS) {
    const dist = hueDistance(h, anchor.hue);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.letter;
}
