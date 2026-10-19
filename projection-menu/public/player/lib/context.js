// Shared render context.
//   PlayerContext: data of the whole player (settings, menu, table, orders...)
//   FrameContext:  geometry of the copy being rendered (shape, cards per page)

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const DEFAULT_GENERAL = {
  restaurantName: 'مطعم الشمس',
  restaurantNameEn: '',
  logoAssetId: null,
  currency: 'د.ع',
  welcomeTitle: 'أهلاً وسهلاً',
  welcomeText: 'تفضّلوا، المنيو أمامكم على الطاولة',
  footerText: '',
};

export const DEFAULT_THEME = {
  preset: 'noir',
  accent: '#d4a056',
  background: { type: 'preset', assetId: null },
  font: 'Cairo',
  cardStyle: 'glass',
  showPrices: true,
  showCalories: false,
  showDescriptions: true,
  pageSeconds: 12,
  idleSeconds: 90,
};

export const PlayerContext = createContext(null);
export const FrameContext = createContext({ shape: 'landscape', perPage: 4 });

export const usePlayer = () => useContext(PlayerContext);
export const useFrame = () => useContext(FrameContext);

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Settings straight from the server may be partial or hand-edited.
export function normalizeTheme(theme) {
  const t = { ...DEFAULT_THEME, ...(theme && typeof theme === 'object' ? theme : {}) };
  if (!['noir', 'marble', 'garden', 'royal'].includes(t.preset)) t.preset = 'noir';
  if (!/^#[0-9a-f]{6}$/i.test(String(t.accent))) t.accent = DEFAULT_THEME.accent;
  if (!['Cairo', 'Tajawal'].includes(t.font)) t.font = 'Cairo';
  if (!['glass', 'solid'].includes(t.cardStyle)) t.cardStyle = 'glass';
  t.background = { type: 'preset', assetId: null, ...(t.background ?? {}) };
  t.pageSeconds = clamp(t.pageSeconds, 4, 600, 12);
  t.idleSeconds = clamp(t.idleSeconds, 10, 3600, 90);
  return t;
}

export function normalizeGeneral(general) {
  const g = { ...DEFAULT_GENERAL, ...(general && typeof general === 'object' ? general : {}) };
  for (const key of Object.keys(DEFAULT_GENERAL)) if (g[key] == null && key !== 'logoAssetId') g[key] = '';
  return g;
}

const channels = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// '#d4a056' -> '212, 160, 86' for rgba() in CSS.
export const hexToRgb = (hex) => channels(hex).join(', ');

// Mix two colours like color-mix(in srgb, a (1-t), b t); returns 'rgb(...)'.
export function mixColor(a, b, t) {
  const [ca, cb] = [channels(a), channels(b)];
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(', ')})`;
}
