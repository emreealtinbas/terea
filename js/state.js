/**
 * js/state.js
 * Merkezi Reaktif Durum Yönetimi, Migrasyon (v1/v2 -> v3) ve Finans/Terea Seçicileri
 */

export const STATE_VERSION = 3;

export const DEFAULT_CATEGORIES = [
  // Expenses
  { id: 'market', name: 'Market', type: 'expense', icon: 'cart', color: '#10B981' },
  { id: 'yeme_icme', name: 'Yeme-İçme', type: 'expense', icon: 'utensils', color: '#F59E0B' },
  { id: 'faturalar', name: 'Faturalar & Kira', type: 'expense', icon: 'home', color: '#0EA5E9' },
  { id: 'ulasim', name: 'Ulaşım', type: 'expense', icon: 'car', color: '#14B8A6' },
  { id: 'saglik', name: 'Sağlık', type: 'expense', icon: 'heart', color: '#F43F5E' },
  { id: 'giyim', name: 'Giyim & Kişisel', type: 'expense', icon: 'bag', color: '#EC4899' },
  { id: 'eglence', name: 'Eğlence & Sosyal', type: 'expense', icon: 'sparkles', color: '#F97316' },
  { id: 'abonelik', name: 'Abonelikler', type: 'expense', icon: 'repeat', color: '#06B6D4' },
  { id: 'egitim', name: 'Eğitim & Teknoloji', type: 'expense', icon: 'laptop', color: '#3B82F6' },
  { id: 'diger_gider', name: 'Diğer Gider', type: 'expense', icon: 'tag', color: '#64748B' },
  // Incomes
  { id: 'ek_gelir', name: 'Ek Gelir / Freelance', type: 'income', icon: 'briefcase', color: '#10B981' },
  { id: 'yatirim', name: 'Yatırım / Faiz', type: 'income', icon: 'trending', color: '#0EA5E9' },
  { id: 'iade', name: 'İade / Hediye', type: 'income', icon: 'gift', color: '#14B8A6' },
];

const TURKISH_SHORT_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const VALID_PAYMENT_METHODS = new Set(['card', 'cash', 'transfer']);
const DATE_STR_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_STR_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function toFiniteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  const num = toFiniteNumber(value, fallback);
  return num >= 0 ? num : fallback;
}

function toPositiveNumber(value, fallback = 1) {
  const num = toFiniteNumber(value, fallback);
  return num > 0 ? num : fallback;
}

function toNonNegInt(value, fallback = 0) {
  const num = toFiniteNumber(value, fallback);
  return num >= 0 ? Math.floor(num) : fallback;
}

function toClampedInt(value, min, max, fallback) {
  const num = toFiniteNumber(value, fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isValidDateStr(str) {
  if (typeof str !== 'string' || !DATE_STR_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isValidMonthStr(str) {
  return typeof str === 'string' && MONTH_STR_RE.test(str);
}

function getDaysCountInMonth(ym) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const [y, m] = safeYm.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function formatCurrencyInline(amount) {
  return `${new Intl.NumberFormat('tr-TR').format(Math.round(amount))} TL`;
}

// ============================================================================
// DATE HELPERS (EXPORTED)
// ============================================================================

export function getLocalDateStr(dateObj = new Date()) {
  const d = dateObj instanceof Date && !Number.isNaN(dateObj.getTime())
    ? dateObj
    : new Date(typeof dateObj === 'number' || typeof dateObj === 'string' ? dateObj : Date.now());
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = safeDate.getFullYear();
  const m = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentMonthStr(dateObj = new Date()) {
  return getLocalDateStr(dateObj).slice(0, 7);
}

export function getMonthDays(ym) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const daysCount = getDaysCountInMonth(safeYm);
  const list = [];
  for (let day = 1; day <= daysCount; day++) {
    list.push(`${safeYm}-${String(day).padStart(2, '0')}`);
  }
  return list;
}

export function getPrevMonthStr(ym) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const [y, m] = safeYm.split('-').map(Number);
  if (m === 1) {
    return `${y - 1}-12`;
  }
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function shiftMonthStr(ym, delta) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const safeDelta = Math.trunc(toFiniteNumber(delta, 0));
  const [y, m] = safeYm.split('-').map(Number);
  const dt = new Date(y, m - 1 + safeDelta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================================================
// DEFAULT STATE & NORMALIZATION / MIGRATION
// ============================================================================

export function createDefaultState() {
  const now = Date.now();
  return {
    version: STATE_VERSION,
    profile: {
      monthlyFixedIncome: 0,
      incomePayday: 1,
      currency: 'TRY',
      theme: 'dark',
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    recurring: [],
    budgets: {
      monthlyOverallLimit: 0,
      categoryLimits: {},
    },
    savingsGoals: [],
    terea: {
      settings: {
        packPrice: 280,
        sticksPerPack: 20,
        dailyLimit: 12,
        baselineDaily: 25,
        includeInFinance: true,
      },
      dailyCounts: {},
    },
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCategory(rawCat) {
  if (!rawCat || typeof rawCat !== 'object') return null;
  const name = typeof rawCat.name === 'string' ? rawCat.name.trim() : '';
  const id = typeof rawCat.id === 'string' ? rawCat.id.trim() : '';
  if (!name || !id) return null;
  return {
    id,
    name,
    type: rawCat.type === 'income' ? 'income' : 'expense',
    icon: typeof rawCat.icon === 'string' && rawCat.icon.trim() ? rawCat.icon.trim() : 'tag',
    color: typeof rawCat.color === 'string' && rawCat.color.trim() ? rawCat.color.trim() : '#64748B',
  };
}

function normalizeTransaction(rawTx) {
  if (!rawTx || typeof rawTx !== 'object') return null;
  const type = rawTx.type === 'income' ? 'income' : 'expense';
  const amount = toNonNegativeNumber(rawTx.amount, NaN);
  if (!Number.isFinite(amount)) return null;

  let dateStr = isValidDateStr(rawTx.dateStr) ? rawTx.dateStr : '';
  if (!dateStr && Number.isFinite(Number(rawTx.createdAt))) {
    dateStr = getLocalDateStr(new Date(Number(rawTx.createdAt)));
  }
  if (!dateStr) {
    dateStr = getLocalDateStr();
  }

  const defaultCat = type === 'income' ? 'ek_gelir' : 'diger_gider';
  const categoryId = typeof rawTx.categoryId === 'string' && rawTx.categoryId.trim()
    ? rawTx.categoryId.trim()
    : defaultCat;

  const normalized = {
    id: typeof rawTx.id === 'string' && rawTx.id.trim() ? rawTx.id.trim() : generateId('tx'),
    type,
    amount,
    categoryId,
    dateStr,
    note: typeof rawTx.note === 'string' ? rawTx.note.trim() : '',
    paymentMethod: VALID_PAYMENT_METHODS.has(rawTx.paymentMethod) ? rawTx.paymentMethod : 'card',
    createdAt: toPositiveNumber(rawTx.createdAt, Date.now()),
  };

  if (typeof rawTx.recurringId === 'string' && rawTx.recurringId.trim()) {
    normalized.recurringId = rawTx.recurringId.trim();
  }

  return normalized;
}

function normalizeRecurring(rawRec) {
  if (!rawRec || typeof rawRec !== 'object') return null;
  const type = rawRec.type === 'income' ? 'income' : 'expense';
  const amount = toNonNegativeNumber(rawRec.amount, NaN);
  if (!Number.isFinite(amount)) return null;

  const defaultCat = type === 'income' ? 'ek_gelir' : 'abonelik';
  return {
    id: typeof rawRec.id === 'string' && rawRec.id.trim() ? rawRec.id.trim() : generateId('rec'),
    title: typeof rawRec.title === 'string' && rawRec.title.trim() ? rawRec.title.trim() : 'Düzenli İşlem',
    amount,
    categoryId: typeof rawRec.categoryId === 'string' && rawRec.categoryId.trim()
      ? rawRec.categoryId.trim()
      : defaultCat,
    dayOfMonth: toClampedInt(rawRec.dayOfMonth, 1, 31, 1),
    type,
    active: typeof rawRec.active === 'boolean' ? rawRec.active : true,
  };
}

function normalizeSavingsGoal(rawGoal) {
  if (!rawGoal || typeof rawGoal !== 'object') return null;
  const title = typeof rawGoal.title === 'string' ? rawGoal.title.trim() : '';
  const targetAmount = toNonNegativeNumber(rawGoal.targetAmount, 0);
  const currentAmount = toNonNegativeNumber(rawGoal.currentAmount, 0);
  return {
    id: typeof rawGoal.id === 'string' && rawGoal.id.trim() ? rawGoal.id.trim() : generateId('goal'),
    title: title || 'Birikim Hedefi',
    targetAmount,
    currentAmount,
    deadline: isValidDateStr(rawGoal.deadline) ? rawGoal.deadline : '',
    color: typeof rawGoal.color === 'string' && rawGoal.color.trim() ? rawGoal.color.trim() : '#10B981',
    createdAt: toPositiveNumber(rawGoal.createdAt, Date.now()),
  };
}

export function normalizeAndMigrateState(raw) {
  const def = createDefaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return def;
  }

  // Profile
  const rawProfile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const profile = {
    monthlyFixedIncome: toNonNegativeNumber(rawProfile.monthlyFixedIncome, 0),
    incomePayday: toClampedInt(rawProfile.incomePayday, 1, 31, 1),
    currency: typeof rawProfile.currency === 'string' && rawProfile.currency.trim()
      ? rawProfile.currency.trim().toUpperCase()
      : 'TRY',
    theme: rawProfile.theme === 'light' ? 'light' : 'dark',
  };

  // Categories
  let categories = def.categories;
  if (Array.isArray(raw.categories) && raw.categories.length > 0) {
    const seenIds = new Set();
    const validCats = [];
    for (const c of raw.categories) {
      const norm = normalizeCategory(c);
      if (norm && !seenIds.has(norm.id)) {
        seenIds.add(norm.id);
        validCats.push(norm);
      }
    }
    if (validCats.length > 0) {
      categories = validCats;
    }
  }

  // Transactions
  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions.map(normalizeTransaction).filter(Boolean)
    : [];

  // Recurring
  const recurring = Array.isArray(raw.recurring)
    ? raw.recurring.map(normalizeRecurring).filter(Boolean)
    : [];

  // Budgets
  const rawBudgets = raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : {};
  const categoryLimits = {};
  if (rawBudgets.categoryLimits && typeof rawBudgets.categoryLimits === 'object' && !Array.isArray(rawBudgets.categoryLimits)) {
    for (const [catId, val] of Object.entries(rawBudgets.categoryLimits)) {
      const limitNum = toFiniteNumber(val, 0);
      if (catId && limitNum > 0) {
        categoryLimits[catId] = limitNum;
      }
    }
  }
  const budgets = {
    monthlyOverallLimit: toNonNegativeNumber(rawBudgets.monthlyOverallLimit, 0),
    categoryLimits,
  };

  // Savings Goals
  const savingsGoals = Array.isArray(raw.savingsGoals)
    ? raw.savingsGoals.map(normalizeSavingsGoal).filter(Boolean)
    : [];

  // Terea section (supports both v3 `raw.terea` and legacy v1/v2 `{ settings, logs, resisted }`)
  const rawTerea = raw.terea && typeof raw.terea === 'object' ? raw.terea : {};
  const rawTereaSettings =
    rawTerea.settings && typeof rawTerea.settings === 'object'
      ? rawTerea.settings
      : (raw.settings && typeof raw.settings === 'object' ? raw.settings : {});

  const tereaSettings = {
    packPrice: toPositiveNumber(rawTereaSettings.packPrice, 280),
    sticksPerPack: Math.max(1, toNonNegInt(rawTereaSettings.sticksPerPack, 20) || 20),
    dailyLimit: toNonNegInt(rawTereaSettings.dailyLimit, 12),
    baselineDaily: Math.max(1, toNonNegInt(rawTereaSettings.baselineDaily, 25) || 25),
    includeInFinance: typeof rawTereaSettings.includeInFinance === 'boolean'
      ? rawTereaSettings.includeInFinance
      : true,
  };

  if (Number.isFinite(Number(rawTereaSettings.minWaitMinutes)) && Number(rawTereaSettings.minWaitMinutes) > 0) {
    tereaSettings.minWaitMinutes = Math.floor(Number(rawTereaSettings.minWaitMinutes));
  }

  const dailyCounts = {};
  if (rawTerea.dailyCounts && typeof rawTerea.dailyCounts === 'object' && !Array.isArray(rawTerea.dailyCounts)) {
    for (const [dateKey, countVal] of Object.entries(rawTerea.dailyCounts)) {
      if (isValidDateStr(dateKey)) {
        const countNum = toFiniteNumber(countVal, NaN);
        if (Number.isFinite(countNum) && countNum >= 0) {
          dailyCounts[dateKey] = Math.floor(countNum);
        }
      }
    }
  } else if (Array.isArray(raw.logs)) {
    // Legacy v1 / v2 migration: group logs by dateStr and sum counts
    for (const log of raw.logs) {
      if (!log || typeof log !== 'object') continue;
      let dateKey = isValidDateStr(log.dateStr) ? log.dateStr : '';
      if (!dateKey && Number.isFinite(Number(log.timestamp))) {
        dateKey = getLocalDateStr(new Date(Number(log.timestamp)));
      }
      if (!dateKey) continue;

      const entryCount =
        log.count !== undefined && log.count !== null
          ? toNonNegInt(log.count, 1)
          : 1;

      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + entryCount;
    }
  }

  const terea = {
    settings: tereaSettings,
    dailyCounts,
  };

  // Preserve optional legacy fields if present during migration
  const legacyResisted = Array.isArray(rawTerea.resisted)
    ? rawTerea.resisted
    : (Array.isArray(raw.resisted) ? raw.resisted : null);
  if (legacyResisted && legacyResisted.length > 0) {
    terea.resisted = legacyResisted.filter((r) => r && typeof r === 'object');
  }

  return {
    version: STATE_VERSION,
    profile,
    categories,
    transactions,
    recurring,
    budgets,
    savingsGoals,
    terea,
    createdAt: toPositiveNumber(raw.createdAt, def.createdAt),
    updatedAt: toPositiveNumber(raw.updatedAt, def.updatedAt),
  };
}

// ============================================================================
// REACTIVE STORE CORE
// ============================================================================

let state = createDefaultState();
let selectedMonth = getCurrentMonthStr();
const listeners = new Set();
let onStateCommitHook = null;

function notifyListeners(meta = {}) {
  const payload = { selectedMonth, ...meta };
  for (const fn of listeners) {
    try {
      fn(state, payload);
    } catch (err) {
      console.error('State listener hatası:', err);
    }
  }
}

function commit({ silent = false, fromRemote = false } = {}) {
  if (!fromRemote) {
    state.updatedAt = Date.now();
  }
  if (!silent) {
    notifyListeners({ fromRemote });
  }
  if (!fromRemote && typeof onStateCommitHook === 'function') {
    try {
      onStateCommitHook(state, { fromRemote, silent });
    } catch (err) {
      console.error('State commit hook hatası:', err);
    }
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  if (typeof fn !== 'function') {
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function registerCommitHook(fn) {
  onStateCommitHook = typeof fn === 'function' ? fn : null;
}

export function setState(nextState, options = {}) {
  const { silent = false, fromRemote = false } = options || {};
  const resolved = typeof nextState === 'function' ? nextState(state) : nextState;
  state = normalizeAndMigrateState(resolved);

  if (fromRemote) {
    if (!silent) {
      notifyListeners({ fromRemote: true });
    }
  } else {
    commit({ silent, fromRemote: false });
  }
  return state;
}

export function getSelectedMonth() {
  return selectedMonth;
}

export function setSelectedMonth(ym) {
  if (!isValidMonthStr(ym)) return selectedMonth;
  if (selectedMonth !== ym) {
    selectedMonth = ym;
    notifyListeners({ monthChanged: true });
  }
  return selectedMonth;
}

export function shiftSelectedMonth(delta) {
  const safeDelta = Math.trunc(toFiniteNumber(delta, 0));
  if (safeDelta === 0) return selectedMonth;
  selectedMonth = shiftMonthStr(selectedMonth, safeDelta);
  notifyListeners({ monthChanged: true });
  return selectedMonth;
}

export function resetSelectedMonthToCurrent() {
  const current = getCurrentMonthStr();
  if (selectedMonth !== current) {
    selectedMonth = current;
    notifyListeners({ monthChanged: true });
  }
  return selectedMonth;
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================

export function updateProfile(partial) {
  if (!partial || typeof partial !== 'object') return state.profile;
  const next = { ...state.profile };
  if (partial.monthlyFixedIncome !== undefined) {
    next.monthlyFixedIncome = toNonNegativeNumber(partial.monthlyFixedIncome, next.monthlyFixedIncome);
  }
  if (partial.incomePayday !== undefined) {
    next.incomePayday = toClampedInt(partial.incomePayday, 1, 31, next.incomePayday);
  }
  if (typeof partial.currency === 'string' && partial.currency.trim()) {
    next.currency = partial.currency.trim().toUpperCase();
  }
  if (partial.theme === 'dark' || partial.theme === 'light') {
    next.theme = partial.theme;
  }
  state.profile = next;
  commit();
  return state.profile;
}

export function addTransaction(tx) {
  const normalized = normalizeTransaction({
    ...(tx && typeof tx === 'object' ? tx : {}),
    id: tx && typeof tx.id === 'string' && tx.id.trim() ? tx.id.trim() : generateId('tx'),
    createdAt: tx && Number.isFinite(Number(tx.createdAt)) ? Number(tx.createdAt) : Date.now(),
  });
  if (!normalized) return null;
  state.transactions.push(normalized);
  commit();
  return normalized;
}

export function updateTransaction(id, partial) {
  if (!id || !partial || typeof partial !== 'object') return null;
  const idx = state.transactions.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const current = state.transactions[idx];
  const updated = normalizeTransaction({
    ...current,
    ...partial,
    id: current.id,
    createdAt: current.createdAt,
  });
  if (!updated) return null;
  state.transactions[idx] = updated;
  commit();
  return updated;
}

export function deleteTransaction(id) {
  const idx = state.transactions.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const [removed] = state.transactions.splice(idx, 1);
  commit();
  return removed;
}

export function restoreTransaction(tx) {
  const normalized = normalizeTransaction(tx);
  if (!normalized) return null;
  const existingIdx = state.transactions.findIndex((t) => t.id === normalized.id);
  if (existingIdx !== -1) {
    state.transactions[existingIdx] = normalized;
  } else {
    state.transactions.push(normalized);
  }
  commit();
  return normalized;
}

export function addCategory(cat) {
  if (!cat || typeof cat !== 'object') return null;
  const name = typeof cat.name === 'string' ? cat.name.trim() : '';
  if (!name) return null;

  let id = typeof cat.id === 'string' && cat.id.trim()
    ? cat.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    : name.toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || generateId('cat');

  if (state.categories.some((c) => c.id === id)) {
    id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
  }

  const normalized = normalizeCategory({
    id,
    name,
    type: cat.type === 'income' ? 'income' : 'expense',
    icon: cat.icon || 'tag',
    color: cat.color || '#64748B',
  });
  if (!normalized) return null;
  state.categories.push(normalized);
  commit();
  return normalized;
}

export function updateCategory(id, partial) {
  if (!id || !partial || typeof partial !== 'object') return null;
  const idx = state.categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const current = state.categories[idx];
  const updated = normalizeCategory({
    ...current,
    ...partial,
    id: current.id,
  });
  if (!updated) return null;
  state.categories[idx] = updated;
  commit();
  return updated;
}

export function deleteCategory(id) {
  const idx = state.categories.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  state.categories.splice(idx, 1);
  if (state.budgets.categoryLimits && Object.prototype.hasOwnProperty.call(state.budgets.categoryLimits, id)) {
    delete state.budgets.categoryLimits[id];
  }
  commit();
  return true;
}

export function addRecurring(item) {
  if (!item || typeof item !== 'object') return null;
  const normalized = normalizeRecurring({
    ...item,
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('rec'),
  });
  if (!normalized) return null;
  state.recurring.push(normalized);
  commit();
  return normalized;
}

export function updateRecurring(id, partial) {
  if (!id || !partial || typeof partial !== 'object') return null;
  const idx = state.recurring.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const current = state.recurring[idx];
  const updated = normalizeRecurring({
    ...current,
    ...partial,
    id: current.id,
  });
  if (!updated) return null;
  state.recurring[idx] = updated;
  commit();
  return updated;
}

export function deleteRecurring(id) {
  const idx = state.recurring.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  state.recurring.splice(idx, 1);
  commit();
  return true;
}

export function applyRecurringToMonth(id, ym = selectedMonth) {
  const safeYm = isValidMonthStr(ym) ? ym : selectedMonth;
  const item = state.recurring.find((r) => r.id === id);
  if (!item) return null;

  // Prevent duplicate in same month via recurringId + ym check
  const monthPrefix = `${safeYm}-`;
  const alreadyApplied = state.transactions.some(
    (t) => t.recurringId === item.id && typeof t.dateStr === 'string' && t.dateStr.startsWith(monthPrefix)
  );
  if (alreadyApplied) {
    return null;
  }

  const maxDay = getDaysCountInMonth(safeYm);
  const clampedDay = Math.min(maxDay, Math.max(1, item.dayOfMonth || 1));
  const dateStr = `${safeYm}-${String(clampedDay).padStart(2, '0')}`;

  return addTransaction({
    type: item.type,
    amount: item.amount,
    categoryId: item.categoryId,
    dateStr,
    note: item.title,
    paymentMethod: 'transfer',
    recurringId: item.id,
  });
}

export function setOverallBudget(amount) {
  state.budgets.monthlyOverallLimit = toNonNegativeNumber(amount, 0);
  commit();
  return state.budgets.monthlyOverallLimit;
}

export function setCategoryBudget(categoryId, amount) {
  if (typeof categoryId !== 'string' || !categoryId.trim()) return 0;
  const key = categoryId.trim();
  const num = toNonNegativeNumber(amount, 0);
  if (num <= 0) {
    delete state.budgets.categoryLimits[key];
  } else {
    state.budgets.categoryLimits[key] = num;
  }
  commit();
  return num;
}

export function removeCategoryBudget(categoryId) {
  if (typeof categoryId !== 'string' || !categoryId.trim()) return false;
  const key = categoryId.trim();
  if (Object.prototype.hasOwnProperty.call(state.budgets.categoryLimits, key)) {
    delete state.budgets.categoryLimits[key];
    commit();
    return true;
  }
  return false;
}

export function addSavingsGoal(goal) {
  if (!goal || typeof goal !== 'object') return null;
  const normalized = normalizeSavingsGoal({
    ...goal,
    id: typeof goal.id === 'string' && goal.id.trim() ? goal.id.trim() : generateId('goal'),
    createdAt: Date.now(),
  });
  if (!normalized) return null;
  state.savingsGoals.push(normalized);
  commit();
  return normalized;
}

export function updateSavingsGoal(id, partial) {
  if (!id || !partial || typeof partial !== 'object') return null;
  const idx = state.savingsGoals.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  const current = state.savingsGoals[idx];
  const updated = normalizeSavingsGoal({
    ...current,
    ...partial,
    id: current.id,
    createdAt: current.createdAt,
  });
  if (!updated) return null;
  state.savingsGoals[idx] = updated;
  commit();
  return updated;
}

export function contributeSavingsGoal(id, delta) {
  const idx = state.savingsGoals.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  const safeDelta = toFiniteNumber(delta, 0);
  const current = state.savingsGoals[idx];
  const nextAmount = Math.max(0, current.currentAmount + safeDelta);
  state.savingsGoals[idx] = {
    ...current,
    currentAmount: nextAmount,
  };
  commit();
  return state.savingsGoals[idx];
}

export function deleteSavingsGoal(id) {
  const idx = state.savingsGoals.findIndex((g) => g.id === id);
  if (idx === -1) return false;
  state.savingsGoals.splice(idx, 1);
  commit();
  return true;
}

export function setTereaDayCount(dateStr, count) {
  const safeDate = isValidDateStr(dateStr) ? dateStr : getLocalDateStr();
  const safeCount = toNonNegInt(count, 0);
  state.terea.dailyCounts[safeDate] = safeCount;
  commit();
  return safeCount;
}

export function adjustTereaDayCount(dateStr, delta) {
  const safeDate = isValidDateStr(dateStr) ? dateStr : getLocalDateStr();
  const current = toNonNegInt(state.terea.dailyCounts[safeDate], 0);
  const safeDelta = Math.trunc(toFiniteNumber(delta, 0));
  const next = Math.max(0, current + safeDelta);
  state.terea.dailyCounts[safeDate] = next;
  commit();
  return next;
}

export function updateTereaSettings(partial) {
  if (!partial || typeof partial !== 'object') return state.terea.settings;
  const next = { ...state.terea.settings };
  if (partial.packPrice !== undefined) {
    next.packPrice = toPositiveNumber(partial.packPrice, next.packPrice);
  }
  if (partial.sticksPerPack !== undefined) {
    next.sticksPerPack = Math.max(1, toNonNegInt(partial.sticksPerPack, next.sticksPerPack) || next.sticksPerPack);
  }
  if (partial.dailyLimit !== undefined) {
    next.dailyLimit = toNonNegInt(partial.dailyLimit, next.dailyLimit);
  }
  if (partial.baselineDaily !== undefined) {
    next.baselineDaily = Math.max(1, toNonNegInt(partial.baselineDaily, next.baselineDaily) || next.baselineDaily);
  }
  if (partial.includeInFinance !== undefined) {
    next.includeInFinance = Boolean(partial.includeInFinance);
  }
  if (partial.minWaitMinutes !== undefined) {
    const minWait = toPositiveNumber(partial.minWaitMinutes, 0);
    if (minWait > 0) next.minWaitMinutes = Math.floor(minWait);
  }
  state.terea.settings = next;
  commit();
  return state.terea.settings;
}

export function resetAllData() {
  state = createDefaultState();
  commit();
  return state;
}

// ============================================================================
// COMPUTED SELECTORS (EXPORTED)
// ============================================================================

export function getTereaStickPrice(targetState = state) {
  const s = targetState?.terea?.settings || {};
  const packPrice = toPositiveNumber(s.packPrice, 280);
  const sticksPerPack = Math.max(1, toNonNegInt(s.sticksPerPack, 20) || 20);
  return packPrice / sticksPerPack;
}

export function getTereaDayStats(dateStr, targetState = state) {
  const safeDate = isValidDateStr(dateStr) ? dateStr : getLocalDateStr();
  const s = targetState?.terea?.settings || {};
  const counts = targetState?.terea?.dailyCounts || {};
  const isTracked = Object.prototype.hasOwnProperty.call(counts, safeDate);
  const count = isTracked ? toNonNegInt(counts[safeDate], 0) : 0;
  const stickPrice = getTereaStickPrice(targetState);
  const limit = toNonNegInt(s.dailyLimit, 12);
  const baselineDaily = Math.max(1, toNonNegInt(s.baselineDaily, 25) || 25);

  const burned = count * stickPrice;
  const baselineCost = baselineDaily * stickPrice;
  const saved = Math.max(0, (baselineDaily - count) * stickPrice);
  const vsBaselineDelta = baselineCost - burned;
  const netProfitLoss = saved - burned;

  return {
    dateStr: safeDate,
    isTracked,
    count,
    burned,
    saved,
    netProfitLoss,
    baselineCost,
    vsBaselineDelta,
    limit,
    overLimit: count > limit,
    nicotineMg: Number((count * 0.5).toFixed(1)),
    nicotineIntenseMg: Number((count * 1.2).toFixed(1)),
  };
}

export function getTereaMonthStats(ym = selectedMonth, targetState = state) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const monthDays = getMonthDays(safeYm);
  const s = targetState?.terea?.settings || {};
  const counts = targetState?.terea?.dailyCounts || {};
  const stickPrice = getTereaStickPrice(targetState);
  const sticksPerPack = Math.max(1, toNonNegInt(s.sticksPerPack, 20) || 20);
  const baselineDaily = Math.max(1, toNonNegInt(s.baselineDaily, 25) || 25);

  let totalSticks = 0;
  let trackedDays = 0;

  const dailySeries = monthDays.map((dateStr) => {
    const isTracked = Object.prototype.hasOwnProperty.call(counts, dateStr);
    const count = isTracked ? toNonNegInt(counts[dateStr], 0) : 0;
    if (isTracked) trackedDays += 1;
    totalSticks += count;

    const burned = count * stickPrice;
    const saved = isTracked ? Math.max(0, (baselineDaily - count) * stickPrice) : 0;

    return {
      dateStr,
      count,
      burned,
      saved,
      isTracked,
    };
  });

  const avgDaily = trackedDays > 0 ? totalSticks / trackedDays : 0;
  const totalBurned = totalSticks * stickPrice;
  const totalSavedVsBaseline = trackedDays > 0
    ? Math.max(0, (trackedDays * baselineDaily - totalSticks) * stickPrice)
    : 0;

  const monthlyProjectedBurn = avgDaily * stickPrice * 30;
  const yearlyProjectedBurn = avgDaily * stickPrice * 365;
  const yearlyProjectedSavings = trackedDays > 0
    ? Math.max(0, (baselineDaily - avgDaily) * stickPrice * 365)
    : 0;
  const packsUsed = Number((totalSticks / sticksPerPack).toFixed(2));

  return {
    ym: safeYm,
    totalSticks,
    trackedDays,
    avgDaily,
    totalBurned,
    totalSavedVsBaseline,
    monthlyProjectedBurn,
    yearlyProjectedBurn,
    yearlyProjectedSavings,
    packsUsed,
    dailySeries,
  };
}

export function getTereaLastNDays(n = 7, targetState = state) {
  const daysNum = Math.max(1, toNonNegInt(n, 7) || 7);
  const result = [];
  const today = new Date();

  for (let i = daysNum - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dateStr = getLocalDateStr(d);
    const dayStats = getTereaDayStats(dateStr, targetState);
    result.push({
      dateStr,
      dayLabel: TURKISH_SHORT_DAYS[d.getDay()],
      shortDate: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      count: dayStats.count,
      burned: dayStats.burned,
      saved: dayStats.saved,
      limit: dayStats.limit,
      isTracked: dayStats.isTracked,
    });
  }

  return result;
}

export function getTereaAllTimeStats(targetState = state) {
  const s = targetState?.terea?.settings || {};
  const counts = targetState?.terea?.dailyCounts || {};
  const stickPrice = getTereaStickPrice(targetState);
  const limit = toNonNegInt(s.dailyLimit, 12);
  const baselineDaily = Math.max(1, toNonNegInt(s.baselineDaily, 25) || 25);

  const entries = Object.entries(counts)
    .filter(([k]) => isValidDateStr(k))
    .map(([dateStr, val]) => [dateStr, toNonNegInt(val, 0)])
    .sort(([a], [b]) => a.localeCompare(b));

  const activeDays = entries.length;
  let totalSticks = 0;
  let bestDay = null;

  for (const [dateStr, count] of entries) {
    totalSticks += count;
    if (!bestDay || count < bestDay.count || (count === bestDay.count && dateStr > bestDay.dateStr)) {
      bestDay = { dateStr, count };
    }
  }

  const totalBurned = totalSticks * stickPrice;
  const totalSavedVsBaseline = activeDays > 0
    ? Math.max(0, (activeDays * baselineDaily - totalSticks) * stickPrice)
    : 0;

  // Calculate consecutive streak under/equal limit ending today (or yesterday if today not tracked yet)
  let currentStreakUnderLimit = 0;
  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const hasToday = Object.prototype.hasOwnProperty.call(counts, todayStr);
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!hasToday) {
    cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  }

  while (true) {
    const key = getLocalDateStr(cursor);
    if (!Object.prototype.hasOwnProperty.call(counts, key)) break;
    const dayCount = toNonNegInt(counts[key], 0);
    if (dayCount <= limit) {
      currentStreakUnderLimit += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    totalSticks,
    activeDays,
    totalBurned,
    totalSavedVsBaseline,
    bestDay,
    currentStreakUnderLimit,
  };
}

export function getMonthFinanceSummary(ym = selectedMonth, targetState = state) {
  const safeYm = isValidMonthStr(ym) ? ym : getCurrentMonthStr();
  const monthPrefix = `${safeYm}-`;
  const monthDays = getMonthDays(safeYm);
  const currentYm = getCurrentMonthStr();

  const fixedIncome = toNonNegativeNumber(targetState?.profile?.monthlyFixedIncome, 0);
  const includeTerea = Boolean(targetState?.terea?.settings?.includeInFinance);

  const transactions = Array.isArray(targetState?.transactions) ? targetState.transactions : [];
  const categories = Array.isArray(targetState?.categories) ? targetState.categories : DEFAULT_CATEGORIES;
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categoryLimits = targetState?.budgets?.categoryLimits || {};
  const monthlyOverallLimit = toNonNegativeNumber(targetState?.budgets?.monthlyOverallLimit, 0);

  let extraIncome = 0;
  let expenseTransactionsTotal = 0;

  const dayTotals = new Map();
  for (let i = 0; i < monthDays.length; i++) {
    dayTotals.set(monthDays[i], { day: i + 1, dateStr: monthDays[i], expense: 0, income: 0 });
  }

  const catTotals = new Map();

  for (const tx of transactions) {
    if (!tx || typeof tx.dateStr !== 'string' || !tx.dateStr.startsWith(monthPrefix)) continue;
    const amt = toNonNegativeNumber(tx.amount, 0);
    const dayBucket = dayTotals.get(tx.dateStr);

    if (tx.type === 'income') {
      extraIncome += amt;
      if (dayBucket) dayBucket.income += amt;
    } else {
      expenseTransactionsTotal += amt;
      if (dayBucket) dayBucket.expense += amt;

      const catId = tx.categoryId || 'diger_gider';
      const existing = catTotals.get(catId) || { total: 0, count: 0 };
      existing.total += amt;
      existing.count += 1;
      catTotals.set(catId, existing);
    }
  }

  const tereaMonth = getTereaMonthStats(safeYm, targetState);
  const tereaExpense = includeTerea ? tereaMonth.totalBurned : 0;

  if (includeTerea && tereaExpense > 0) {
    for (const d of tereaMonth.dailySeries) {
      if (d.burned > 0) {
        const dayBucket = dayTotals.get(d.dateStr);
        if (dayBucket) dayBucket.expense += d.burned;
      }
    }
  }

  const totalIncome = fixedIncome + extraIncome;
  const totalExpense = expenseTransactionsTotal + tereaExpense;
  const netBalance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0
    ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100)
    : 0;

  let dailySafeSpend = 0;
  if (safeYm === currentYm) {
    const todayDay = new Date().getDate();
    const remainingDays = Math.max(1, monthDays.length - todayDay + 1);
    dailySafeSpend = Math.max(0, netBalance / remainingDays);
  } else {
    dailySafeSpend = netBalance / Math.max(1, monthDays.length);
  }

  const categoryBreakdown = [];
  for (const [catId, agg] of catTotals.entries()) {
    const meta = categoryMap.get(catId) || {
      id: catId,
      name: 'Diğer Gider',
      color: '#64748B',
      icon: 'tag',
    };
    const limit = toNonNegativeNumber(categoryLimits[catId], 0);
    categoryBreakdown.push({
      categoryId: catId,
      name: meta.name,
      color: meta.color,
      icon: meta.icon,
      total: agg.total,
      count: agg.count,
      pct: totalExpense > 0 ? Math.round((agg.total / totalExpense) * 100) : 0,
      limit,
      limitPct: limit > 0 ? Math.round((agg.total / limit) * 100) : 0,
      isTerea: false,
    });
  }

  if (includeTerea && tereaExpense > 0) {
    const tereaLimit = toNonNegativeNumber(categoryLimits.terea, 0);
    categoryBreakdown.push({
      categoryId: 'terea',
      name: 'Terea Silver',
      color: '#E11D48',
      icon: 'flame',
      total: tereaExpense,
      count: tereaMonth.totalSticks,
      pct: totalExpense > 0 ? Math.round((tereaExpense / totalExpense) * 100) : 0,
      limit: tereaLimit,
      limitPct: tereaLimit > 0 ? Math.round((tereaExpense / tereaLimit) * 100) : 0,
      isTerea: true,
    });
  }

  categoryBreakdown.sort((a, b) => b.total - a.total);

  const dailyExpenses = Array.from(dayTotals.values());

  // Previous month comparison
  const prevYm = getPrevMonthStr(safeYm);
  const prevPrefix = `${prevYm}-`;
  let prevTxExpense = 0;
  for (const tx of transactions) {
    if (tx && tx.type === 'expense' && typeof tx.dateStr === 'string' && tx.dateStr.startsWith(prevPrefix)) {
      prevTxExpense += toNonNegativeNumber(tx.amount, 0);
    }
  }
  const prevTereaMonth = getTereaMonthStats(prevYm, targetState);
  const prevMonthExpense = prevTxExpense + (includeTerea ? prevTereaMonth.totalBurned : 0);
  const momChangePct = prevMonthExpense > 0
    ? Math.round(((totalExpense - prevMonthExpense) / prevMonthExpense) * 100)
    : null;

  const recurringList = Array.isArray(targetState?.recurring) ? targetState.recurring : [];
  const recurringMonthlyTotal = recurringList
    .filter((r) => r && r.active && r.type === 'expense')
    .reduce((sum, r) => sum + toNonNegativeNumber(r.amount, 0), 0);

  // Build 2-4 actionable Turkish insights
  const insights = [];

  if (monthlyOverallLimit > 0 && totalExpense > monthlyOverallLimit) {
    const over = totalExpense - monthlyOverallLimit;
    insights.push({
      tone: 'danger',
      title: 'Aylık Bütçe Limiti Aşıldı',
      detail: `${formatCurrencyInline(monthlyOverallLimit)} hedefinin ${formatCurrencyInline(over)} üzerindesin.`,
    });
  } else if (monthlyOverallLimit > 0 && totalExpense >= monthlyOverallLimit * 0.8) {
    const pctUsed = Math.round((totalExpense / monthlyOverallLimit) * 100);
    const left = Math.max(0, monthlyOverallLimit - totalExpense);
    insights.push({
      tone: 'warn',
      title: `Bütçenin %${pctUsed}'i Kullanıldı`,
      detail: `Aylık hedefine ${formatCurrencyInline(left)} kaldı.`,
    });
  } else if (totalIncome > 0 && netBalance < 0) {
    insights.push({
      tone: 'danger',
      title: 'Aylık Bütçe Açığı',
      detail: `Giderlerin gelirini ${formatCurrencyInline(Math.abs(netBalance))} aştı.`,
    });
  } else if (totalIncome > 0 && safeYm === currentYm) {
    const todayDay = new Date().getDate();
    const remainingDays = Math.max(1, monthDays.length - todayDay + 1);
    insights.push({
      tone: 'good',
      title: `Günlük Güvenli Harcama: ${formatCurrencyInline(dailySafeSpend)}`,
      detail: `Kalan ${remainingDays} gün boyunca bu hızda kalırsan bütçen dengede kalır.`,
    });
  } else {
    insights.push({
      tone: 'info',
      title: 'Aylık Gelir & Hedef Tanımla',
      detail: 'Sabit gelirini ve aylık bütçe limitini girerek günlük harcama hakkını takip et.',
    });
  }

  const exceededCategory = categoryBreakdown.find((c) => c.limit > 0 && c.total > c.limit);
  const warningCategory = !exceededCategory
    ? categoryBreakdown.find((c) => c.limit > 0 && c.limitPct >= 80)
    : null;

  if (exceededCategory) {
    insights.push({
      tone: 'danger',
      title: `${exceededCategory.name} Limiti Aşıldı`,
      detail: `${formatCurrencyInline(exceededCategory.limit)} limitine karşı ${formatCurrencyInline(exceededCategory.total)} harcandı (%${exceededCategory.limitPct}).`,
    });
  } else if (warningCategory) {
    insights.push({
      tone: 'warn',
      title: `${warningCategory.name} Sınıra Yakın`,
      detail: `Kategori limitinin %${warningCategory.limitPct}'ine ulaştın (${formatCurrencyInline(warningCategory.total)}).`,
    });
  } else if (categoryBreakdown.length > 0) {
    const top = categoryBreakdown[0];
    insights.push({
      tone: top.isTerea ? 'warn' : 'info',
      title: `En Büyük Gider: ${top.name}`,
      detail: `Toplam harcamanın %${top.pct}'ini (${formatCurrencyInline(top.total)}) oluşturuyor.`,
    });
  }

  if (momChangePct !== null) {
    if (momChangePct > 10) {
      insights.push({
        tone: 'warn',
        title: `Geçen Aya Göre %${momChangePct} Artış`,
        detail: `Önceki ay ${formatCurrencyInline(prevMonthExpense)} olan giderin bu ay ${formatCurrencyInline(totalExpense)}.`,
      });
    } else if (momChangePct < -5) {
      insights.push({
        tone: 'good',
        title: `Geçen Aya Göre %${Math.abs(momChangePct)} Tasarruf`,
        detail: `Önceki aya kıyasla ${formatCurrencyInline(prevMonthExpense - totalExpense)} daha az harcadın.`,
      });
    }
  } else if (recurringMonthlyTotal > 0) {
    insights.push({
      tone: 'info',
      title: `Sabit Gider Yükü: ${formatCurrencyInline(recurringMonthlyTotal)}`,
      detail: 'Aktif düzenli ödemelerinin aylık toplam tutarı.',
    });
  }

  if (tereaMonth.trackedDays > 0) {
    if (tereaMonth.totalSavedVsBaseline > 0) {
      insights.push({
        tone: 'good',
        title: `Terea Tasarrufu: +${formatCurrencyInline(tereaMonth.totalSavedVsBaseline)}`,
        detail: `${tereaMonth.trackedDays} günde ${tereaMonth.totalSticks} dal (${formatCurrencyInline(tereaMonth.totalBurned)} maliyet).`,
      });
    } else if (tereaMonth.totalBurned > 0) {
      insights.push({
        tone: 'warn',
        title: `Terea Maliyeti: ${formatCurrencyInline(tereaMonth.totalBurned)}`,
        detail: `${tereaMonth.trackedDays} takip gününde ortalama ${tereaMonth.avgDaily.toFixed(1)} dal/gün.`,
      });
    }
  } else if (insights.length < 2) {
    insights.push({
      tone: 'info',
      title: 'Terea Tüketim Takibi Hazır',
      detail: 'Günlük dal sayını girerek bütçene ve yıllık projeksiyonuna etkisini gör.',
    });
  }

  return {
    ym: safeYm,
    fixedIncome,
    extraIncome,
    totalIncome,
    expenseTransactionsTotal,
    tereaExpense,
    totalExpense,
    netBalance,
    savingsRate,
    dailySafeSpend,
    categoryBreakdown,
    dailyExpenses,
    prevMonthExpense,
    momChangePct,
    recurringMonthlyTotal,
    overallBudgetLimit: monthlyOverallLimit,
    overallBudgetPct: monthlyOverallLimit > 0 ? Math.round((totalExpense / monthlyOverallLimit) * 100) : 0,
    insights: insights.slice(0, 4),
  };
}
