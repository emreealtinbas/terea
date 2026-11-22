/**
 * js/app.js
 * Bütçe & Terea Ana Uygulama Kontrolcüsü, Hash Yönlendirici & Reaktif Durum Köprüsü
 */

import { initStorageAndSync, subscribeSyncStatus, getSyncInfo } from './storage.js';
import {
  getState,
  subscribe,
  updateProfile,
  getSelectedMonth,
  shiftSelectedMonth,
  resetSelectedMonthToCurrent,
} from './state.js';
import { formatMonthLabel, icon, showToast } from './ui.js';
import { renderOverview } from './views/overview.js';
import { renderTransactions, openTransactionModal } from './views/transactions.js';
import { renderGoals } from './views/goals.js';
import { renderTerea } from './views/terea.js';
import { renderSettings, updateSettingsSyncIndicator } from './views/settings.js';

const ROUTE_META = {
  overview: {
    title: 'Finans Özeti',
    subtitle: 'Gelir, gider ve nakit akışın',
    renderer: renderOverview,
  },
  transactions: {
    title: 'Harcamalar & Gelirler',
    subtitle: 'Kategorize edilmiş işlemler ve sabit giderler',
    renderer: renderTransactions,
  },
  goals: {
    title: 'Harcama & Birikim Hedefleri',
    subtitle: 'Aylık bütçe limitleri ve tasarruf planı',
    renderer: renderGoals,
  },
  terea: {
    title: 'Terea Takip',
    subtitle: 'Hızlı sayaç, günlük kota ve kâr-zarar analizi',
    renderer: renderTerea,
  },
  settings: {
    title: 'Ayarlar & Senkronizasyon',
    subtitle: 'Sabit gelir, anahtarlı kasa, bulut sync ve dışa aktarım',
    renderer: renderSettings,
  },
};

const ROUTE_ORDER = ['overview', 'transactions', 'goals', 'terea', 'settings'];

let currentRoute = 'overview';
let currentParams = {};
let renderQueued = false;

function parseRouteFromHash() {
  const rawHash = (window.location.hash || '').replace(/^#/, '').trim();
  if (!rawHash) {
    return { route: 'overview', params: {} };
  }

  const [routePart, queryPart] = rawHash.split('?');
  const cleanRoute = routePart.replace(/^\/+/, '');
  const route = Object.prototype.hasOwnProperty.call(ROUTE_META, cleanRoute) ? cleanRoute : 'overview';
  const params = {};

  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    for (const [key, val] of searchParams.entries()) {
      params[key] = val;
    }
  }

  return { route, params };
}

function applyTheme(theme) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = resolved;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'light' ? '#F3F5F8' : '#0C0E13');
  }

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = icon(resolved === 'dark' ? 'sun' : 'moon', 18);
    const label = resolved === 'dark' ? 'Aydınlık temaya geç' : 'Koyu temaya geç';
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.setAttribute('title', label);
  }
}

function updateTopbarMeta() {
  const meta = ROUTE_META[currentRoute] || ROUTE_META.overview;
  const titleEl = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');
  const monthLabelEl = document.getElementById('monthLabel');

  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;
  if (monthLabelEl) {
    monthLabelEl.textContent = formatMonthLabel(getSelectedMonth());
  }

  document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
    const isActive = btn.dataset.route === currentRoute;
    btn.classList.toggle('is-active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });
}

function updateSyncBadges(info = getSyncInfo()) {
  const status = info?.status || 'local';
  const msg = info?.message || 'Yerel Mod';

  const dotStatusClass =
    status === 'synced'
      ? 'is-ok'
      : status === 'syncing'
        ? 'is-syncing'
        : status === 'error'
          ? 'is-error'
          : '';

  const pillStatusClass =
    status === 'synced'
      ? 'is-synced'
      : status === 'syncing'
        ? 'is-syncing'
        : status === 'error'
          ? 'is-error'
          : '';

  const desktopBadge = document.getElementById('syncBadgeBtn');
  const desktopDot = document.getElementById('syncBadgeDot');
  const desktopText = document.getElementById('syncBadgeText');

  if (desktopBadge) {
    desktopBadge.className = `sync-pill ${pillStatusClass}`.trim();
  }
  if (desktopDot) {
    desktopDot.className = `sync-dot ${dotStatusClass}`.trim();
  }
  if (desktopText) {
    desktopText.textContent = msg;
  }

  document.querySelectorAll('.sync-pill.mobile-only').forEach((pill) => {
    pill.className = `sync-pill mobile-only ${pillStatusClass}`.trim();
    const dot = pill.querySelector('.sync-dot');
    const txt = pill.querySelector('.sync-text');
    if (dot) dot.className = `sync-dot ${dotStatusClass}`.trim();
    if (txt) {
      txt.textContent = status === 'synced'
        ? 'Bulut'
        : status === 'syncing'
          ? 'Sync'
          : status === 'error'
            ? 'Hata'
            : 'Yerel';
    }
  });

  const viewRoot = document.getElementById('viewRoot');
  if (currentRoute === 'settings' && viewRoot) {
    updateSettingsSyncIndicator(viewRoot);
  }
}

function hideChartTooltipIfVisible() {
  const tip = document.getElementById('chartTooltip');
  if (tip && !tip.classList.contains('hidden')) {
    tip.classList.add('hidden');
    tip.innerHTML = '';
  }
}

function createViewContext() {
  return {
    ym: getSelectedMonth(),
    navigate,
    openQuickAdd: (opts = {}) => openTransactionModal(opts),
    routeParams: currentParams,
  };
}

function renderActiveView({ resetRoot = false } = {}) {
  const viewRoot = document.getElementById('viewRoot');
  if (!viewRoot) return;

  const meta = ROUTE_META[currentRoute] || ROUTE_META.overview;
  if (resetRoot) {
    hideChartTooltipIfVisible();
    viewRoot.innerHTML = '';
  }

  updateTopbarMeta();
  meta.renderer(viewRoot, createViewContext());
}

function scheduleViewRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderActiveView({ resetRoot: false });
  });
}

export function navigate(route, params = {}) {
  const safeRoute = Object.prototype.hasOwnProperty.call(ROUTE_META, route) ? route : 'overview';
  const nextParams = params && typeof params === 'object' ? { ...params } : {};
  const routeChanged = safeRoute !== currentRoute;

  currentRoute = safeRoute;
  currentParams = nextParams;

  const targetHash = `#${safeRoute}`;
  if (window.location.hash.split('?')[0] !== targetHash) {
    try {
      window.history.replaceState(null, '', targetHash);
    } catch {
      window.location.hash = targetHash;
    }
  }

  renderActiveView({ resetRoot: routeChanged });

  if (routeChanged) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isModalOpen() {
  const backdrop = document.getElementById('modalBackdrop');
  return Boolean(backdrop && !backdrop.classList.contains('hidden'));
}

function bindGlobalControls() {
  // Navigation items (sidebar & mobile bottom bar)
  document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetRoute = btn.dataset.route;
      if (targetRoute) {
        navigate(targetRoute);
      }
    });
  });

  // Month switcher
  document.getElementById('monthPrevBtn')?.addEventListener('click', () => {
    shiftSelectedMonth(-1);
  });

  document.getElementById('monthNextBtn')?.addEventListener('click', () => {
    shiftSelectedMonth(1);
  });

  document.getElementById('monthLabel')?.addEventListener('click', () => {
    resetSelectedMonthToCurrent();
    showToast(`Aktif dönem: ${formatMonthLabel(getSelectedMonth())}`, { type: 'info', duration: 2000 });
  });

  // Quick Add buttons
  const handleQuickAdd = () => openTransactionModal();
  document.getElementById('quickAddBtn')?.addEventListener('click', handleQuickAdd);
  document.getElementById('fabQuickAdd')?.addEventListener('click', handleQuickAdd);

  // Sync status badges -> Settings/Sync section
  document.querySelectorAll('[data-action="open-sync"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('settings', { focus: 'sync' });
    });
  });

  // Theme toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const currentTheme = getState().profile?.theme === 'light' ? 'light' : 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    updateProfile({ theme: nextTheme });
    showToast(nextTheme === 'light' ? 'Aydınlık tema etkinleştirildi.' : 'Koyu tema etkinleştirildi.', {
      type: 'info',
      duration: 2000,
    });
  });

  // Hash navigation support
  window.addEventListener('hashchange', () => {
    const { route, params } = parseRouteFromHash();
    const changed = route !== currentRoute;
    currentRoute = route;
    currentParams = params;
    renderActiveView({ resetRoot: changed });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (evt) => {
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (isModalOpen() || isTypingTarget(evt.target)) return;

    if (evt.key === 'n' || evt.key === 'N') {
      evt.preventDefault();
      openTransactionModal();
      return;
    }

    if (evt.key >= '1' && evt.key <= '5') {
      const idx = Number(evt.key) - 1;
      const route = ROUTE_ORDER[idx];
      if (route) {
        evt.preventDefault();
        navigate(route);
      }
      return;
    }

    if (evt.key === '[') {
      evt.preventDefault();
      shiftSelectedMonth(-1);
      return;
    }

    if (evt.key === ']') {
      evt.preventDefault();
      shiftSelectedMonth(1);
    }
  });
}

function bootstrapApp() {
  // 1. Load local vault / legacy v1-v2 migration BEFORE first render
  const initialState = initStorageAndSync();

  // 2. Apply persisted theme immediately
  applyTheme(initialState?.profile?.theme || 'dark');

  // 3. Determine initial route from URL hash
  const initialLocation = parseRouteFromHash();
  currentRoute = initialLocation.route;
  currentParams = initialLocation.params;

  // 4. Bind UI navigation, month controls, shortcuts, theme & sync actions
  bindGlobalControls();

  // 5. Subscribe to reactive state updates (local mutations, month shifts, remote sync)
  subscribe((nextState) => {
    applyTheme(nextState?.profile?.theme || 'dark');
    scheduleViewRender();
  });

  // 6. Subscribe to cloud/local sync status updates
  subscribeSyncStatus((info) => {
    updateSyncBadges(info);
  });

  // 7. Initial render
  renderActiveView({ resetRoot: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
