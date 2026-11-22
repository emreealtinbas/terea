/**
 * UI Utilities, Turkish Formatters, SVG Icon Library, Animated Counter,
 * Accessible Modal Manager, Toast System & Empty State Builder
 * Zero-dependency ES Module — Bütçe & Terea
 */

const TR_MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const TR_SHORT_MONTHS = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];

const PAYMENT_METHOD_LABELS = {
  card: 'Kart',
  cash: 'Nakit',
  transfer: 'Havale / EFT',
};

const tlFormatterCache = new Map();

function getTLFormatter(decimals = 0) {
  const safeDecimals = Math.max(0, Math.min(4, Math.trunc(Number(decimals) || 0)));
  if (!tlFormatterCache.has(safeDecimals)) {
    tlFormatterCache.set(
      safeDecimals,
      new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: safeDecimals,
        maximumFractionDigits: safeDecimals,
      })
    );
  }
  return tlFormatterCache.get(safeDecimals);
}

function getLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODateParts(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
}

/* ==========================================================================
   1. XSS SAFETY
   ========================================================================== */

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes HTML special characters to prevent XSS in template literals.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/* ==========================================================================
   2. TURKISH FORMATTERS
   ========================================================================== */

/**
 * Formats a numeric amount in Turkish Lira using `Intl.NumberFormat('tr-TR')`.
 * Example: `14250` -> `'14.250 ₺'`, `{ showSign: true }` -> `'+14.250 ₺'` / `'-350 ₺'`.
 * @param {number} amount
 * @param {{ showSign?: boolean, decimals?: number }} [options]
 * @returns {string}
 */
export function formatTL(amount, { showSign = false, decimals = 0 } = {}) {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    return `${getTLFormatter(decimals).format(0)} ₺`;
  }

  const safeDecimals = Math.max(0, Math.min(4, Math.trunc(Number(decimals) || 0)));
  const factor = 10 ** safeDecimals;
  const rounded = Math.round(num * factor) / factor;
  const absVal = Math.abs(rounded);
  const formatted = getTLFormatter(safeDecimals).format(absVal);

  if (rounded < 0) {
    return `-${formatted} ₺`;
  }
  if (showSign && rounded > 0) {
    return `+${formatted} ₺`;
  }
  return `${formatted} ₺`;
}

/**
 * Formats large TL amounts compactly for tight chart axes (e.g. `12,4 B ₺`, `1,2 Mn ₺`).
 * @param {number} amount
 * @returns {string}
 */
export function formatCompactTL(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '0 ₺';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    const dec = val >= 10 ? 0 : 1;
    return `${sign}${getTLFormatter(dec).format(val)} Mn ₺`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    const dec = val >= 100 || Number.isInteger(Math.round(val * 10) / 10) ? (val >= 10 ? 0 : 1) : 1;
    const formatted = getTLFormatter(dec).format(val);
    return `${sign}${formatted} B ₺`;
  }
  return `${sign}${getTLFormatter(0).format(Math.round(abs))} ₺`;
}

/**
 * Formats `'YYYY-MM'` into `'Kasım 2026'`.
 * @param {string} ym
 * @returns {string}
 */
export function formatMonthLabel(ym) {
  if (typeof ym !== 'string') return '';
  const match = ym.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return escapeHtml(ym);
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return escapeHtml(ym);
  return `${TR_MONTH_NAMES[monthIdx]} ${year}`;
}

/**
 * Formats `'YYYY-MM-DD'` into `'22 Kasım 2026'` (or `'Bugün'` / `'Dün'` when `relative: true`).
 * @param {string} dateStr
 * @param {{ relative?: boolean }} [options]
 * @returns {string}
 */
export function formatDateTR(dateStr, { relative = false } = {}) {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr ? String(dateStr) : '';

  if (relative) {
    const now = new Date();
    const todayIso = getLocalISODate(now);
    if (parts.iso === todayIso) return 'Bugün';

    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (parts.iso === getLocalISODate(yesterday)) return 'Dün';
  }

  return `${parts.day} ${TR_MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}

/**
 * Formats `'YYYY-MM-DD'` into `'22 Kas'`.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatShortDateTR(dateStr) {
  const parts = parseISODateParts(dateStr);
  if (!parts) return dateStr ? String(dateStr) : '';
  return `${parts.day} ${TR_SHORT_MONTHS[parts.month - 1]}`;
}

/**
 * Maps payment method keys to Turkish display labels.
 * @param {string} method
 * @returns {string}
 */
export function getPaymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || (method ? String(method) : 'Belirtilmedi');
}

/* ==========================================================================
   3. CRISP INLINE SVG ICON LIBRARY (2px Lucide-style)
   ========================================================================== */

const ICON_PATHS = {
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
};

/**
 * Renders a crisp 2px stroke Lucide-style inline SVG icon.
 * @param {string} name
 * @param {number} [size=18]
 * @returns {string}
 */
export function icon(name, size = 18) {
  const safeSize = Math.max(8, Math.min(128, Number(size) || 18));
  const paths = ICON_PATHS[name] || ICON_PATHS.tag;
  return `<svg width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/**
 * Curated category icon options for budget & expense categories.
 */
export const CATEGORY_ICON_OPTIONS = [
  { id: 'cart', label: 'Market' },
  { id: 'utensils', label: 'Yeme & İçme' },
  { id: 'home', label: 'Ev & Kira' },
  { id: 'car', label: 'Ulaşım' },
  { id: 'heart', label: 'Sağlık' },
  { id: 'bag', label: 'Alışveriş' },
  { id: 'sparkles', label: 'Kişisel' },
  { id: 'repeat', label: 'Abonelik' },
  { id: 'laptop', label: 'Teknoloji' },
  { id: 'briefcase', label: 'İş & Maaş' },
  { id: 'trending', label: 'Yatırım' },
  { id: 'gift', label: 'Hediye' },
  { id: 'flame', label: 'Terea' },
  { id: 'wallet', label: 'Cüzdan' },
  { id: 'target', label: 'Hedef' },
  { id: 'tag', label: 'Diğer' },
];

/**
 * Curated high-contrast hex palette (no purple-on-dark clashes).
 */
export const CATEGORY_COLOR_OPTIONS = [
  '#28B982', // Mint Emerald
  '#14B8A6', // Teal
  '#18A4DB', // Sky Cyan
  '#3B82F6', // Clear Blue
  '#F59E0B', // Amber
  '#F97316', // Warm Orange
  '#E14D67', // Coral Rose
  '#F43F5E', // Vivid Rose
  '#EC4899', // Crisp Pink
  '#64748B', // Cool Slate
];

/* ==========================================================================
   4. ANIMATED COUNTER
   ========================================================================== */

const activeValueAnimations = new WeakMap();

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Smoothly animates a numeric element from its previous `dataset.numVal` to `toValue`
 * using easeOutCubic and `requestAnimationFrame`.
 * @param {HTMLElement | null} el
 * @param {number} toValue
 * @param {{ formatter?: (v: number) => string, duration?: number }} [options]
 */
export function animateValue(el, toValue, { formatter = (v) => formatTL(v), duration = 420 } = {}) {
  if (!el) return;

  const target = Number(toValue);
  const safeTarget = Number.isFinite(target) ? target : 0;

  const prevRaf = activeValueAnimations.get(el);
  if (prevRaf) {
    cancelAnimationFrame(prevRaf);
    activeValueAnimations.delete(el);
  }

  const hasPrev = el.dataset.numVal !== undefined && el.dataset.numVal !== '';
  const fromValue = hasPrev ? Number(el.dataset.numVal) : safeTarget;

  if (
    !hasPrev ||
    !Number.isFinite(fromValue) ||
    fromValue === safeTarget ||
    duration <= 0 ||
    prefersReducedMotion() ||
    typeof requestAnimationFrame !== 'function'
  ) {
    el.dataset.numVal = String(safeTarget);
    el.textContent = formatter(safeTarget);
    return;
  }

  const startTime = performance.now();
  const delta = safeTarget - fromValue;

  const tick = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = fromValue + delta * eased;

    el.textContent = formatter(progress < 1 ? current : safeTarget);

    if (progress < 1) {
      const rafId = requestAnimationFrame(tick);
      activeValueAnimations.set(el, rafId);
    } else {
      activeValueAnimations.delete(el);
      el.dataset.numVal = String(safeTarget);
      el.textContent = formatter(safeTarget);
    }
  };

  const rafId = requestAnimationFrame(tick);
  activeValueAnimations.set(el, rafId);
}

/* ==========================================================================
   5. ACCESSIBLE MODAL MANAGER
   ========================================================================== */

let activeModalCleanup = null;
let previousFocusedElement = null;

/**
 * Opens the global `#modalBackdrop` dialog with title, HTML content, and lifecycle hook.
 * @param {{
 *   title: string,
 *   bodyHtml: string,
 *   onMount?: (bodyEl: HTMLElement, closeFn: () => void) => (void | (() => void)),
 *   width?: string
 * }} config
 */
export function openModal({ title, bodyHtml, onMount, width = '520px' }) {
  const backdrop = document.getElementById('modalBackdrop');
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const closeBtn = document.getElementById('modalCloseBtn');

  if (!backdrop || !titleEl || !bodyEl) return;

  if (activeModalCleanup) {
    activeModalCleanup();
    activeModalCleanup = null;
  }

  previousFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const card = backdrop.querySelector('.modal-card');
  if (card) {
    card.style.maxWidth = width || '520px';
  }

  titleEl.textContent = title ? String(title) : '';
  bodyEl.innerHTML = bodyHtml || '';

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');

  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  let mountDisposer = null;

  const handleClose = () => {
    closeModal();
  };

  const handleKeyDown = (evt) => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      handleClose();
    }
  };

  const handleBackdropClick = (evt) => {
    if (evt.target === backdrop) {
      handleClose();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  backdrop.addEventListener('click', handleBackdropClick);
  if (closeBtn) {
    closeBtn.addEventListener('click', handleClose);
  }

  activeModalCleanup = () => {
    document.removeEventListener('keydown', handleKeyDown);
    backdrop.removeEventListener('click', handleBackdropClick);
    if (closeBtn) {
      closeBtn.removeEventListener('click', handleClose);
    }
    document.body.style.overflow = prevBodyOverflow;
    if (typeof mountDisposer === 'function') {
      try {
        mountDisposer();
      } catch {
        // Ignore cleanup errors from unmounted callbacks
      }
    }
  };

  if (typeof onMount === 'function') {
    const maybeCleanup = onMount(bodyEl, handleClose);
    if (typeof maybeCleanup === 'function') {
      mountDisposer = maybeCleanup;
    }
  }

  requestAnimationFrame(() => {
    const focusTarget =
      bodyEl.querySelector('input:not([type="hidden"]), select, textarea, button:not([disabled])') ||
      closeBtn;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  });
}

/**
 * Closes the currently open modal, restores scroll lock, and returns focus.
 */
export function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const bodyEl = document.getElementById('modalBody');

  if (activeModalCleanup) {
    activeModalCleanup();
    activeModalCleanup = null;
  }

  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  if (bodyEl) {
    bodyEl.innerHTML = '';
  }

  if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
    try {
      previousFocusedElement.focus();
    } catch {
      // Element may no longer be in DOM
    }
  }
  previousFocusedElement = null;
}

/* ==========================================================================
   6. TOAST SYSTEM WITH OPTIONAL UNDO
   ========================================================================== */

const TOAST_TYPES = new Set(['info', 'success', 'warn', 'error']);

/**
 * Displays a dismissible toast notification inside `#toastRoot` with optional Undo callback.
 * @param {string} message
 * @param {{ type?: 'info' | 'success' | 'warn' | 'error', duration?: number, undoLabel?: string, onUndo?: () => void }} [options]
 * @returns {() => void} Dismiss function
 */
export function showToast(
  message,
  { type = 'info', duration = 3200, undoLabel = 'Geri Al', onUndo } = {}
) {
  const root = document.getElementById('toastRoot');
  if (!root) return () => {};

  const safeType = TOAST_TYPES.has(type) ? type : 'info';
  const toast = document.createElement('div');
  toast.className = `toast is-${safeType}`;
  toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message ? String(message) : '';
  toast.appendChild(msgSpan);

  let dismissed = false;
  let timerId = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px) scale(0.97)';
    setTimeout(() => {
      toast.remove();
    }, 190);
  };

  if (typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'toast-undo';
    undoBtn.textContent = undoLabel ? String(undoLabel) : 'Geri Al';
    undoBtn.addEventListener('click', () => {
      dismiss();
      onUndo();
    });
    toast.appendChild(undoBtn);
  }

  root.appendChild(toast);

  if (duration > 0) {
    timerId = setTimeout(dismiss, duration);
  }

  return dismiss;
}

/* ==========================================================================
   7. EMPTY STATE BUILDER
   ========================================================================== */

/**
 * Builds a structured empty state card with escaped title/description and optional action HTML.
 * @param {{ iconName?: string, title: string, description?: string, actionHtml?: string }} config
 * @returns {string}
 */
export function renderEmptyState({ iconName = 'chart', title, description = '', actionHtml = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName, 22)}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      ${description ? `<p class="empty-desc">${escapeHtml(description)}</p>` : ''}
      ${actionHtml ? `<div class="empty-actions">${actionHtml}</div>` : ''}
    </div>
  `;
}
