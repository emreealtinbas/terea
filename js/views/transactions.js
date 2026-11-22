/**
 * js/views/transactions.js
 * Harcama & Gelir İşlemleri, Gelişmiş Filtreleme, İşlem Ekleme/Düzenleme Modalı
 * ve Sabit Giderler / Abonelikler Yönetimi
 */

import {
  getState,
  getSelectedMonth,
  getLocalDateStr,
  getCurrentMonthStr,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  addCategory,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  applyRecurringToMonth,
  getTereaMonthStats,
} from '../state.js';

import {
  escapeHtml,
  formatTL,
  formatMonthLabel,
  formatDateTR,
  getPaymentMethodLabel,
  icon,
  CATEGORY_ICON_OPTIONS,
  CATEGORY_COLOR_OPTIONS,
  openModal,
  showToast,
  renderEmptyState,
} from '../ui.js';

import { exportTransactionsCSV } from '../export.js';

const PAYMENT_OPTIONS = [
  { id: 'card', label: 'Kart' },
  { id: 'cash', label: 'Nakit' },
  { id: 'transfer', label: 'Havale' },
];

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const filterState = {
  search: '',
  type: 'all', // 'all' | 'expense' | 'income'
  categoryId: 'all', // 'all' | categoryId
  paymentMethod: 'all', // 'all' | 'card' | 'cash' | 'transfer'
  sort: 'date_desc', // 'date_desc' | 'amount_desc' | 'amount_asc'
};

let lastAppliedRouteParams = null;

function safeColor(color, fallback = '#64748B') {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color.trim())) {
    return color.trim();
  }
  return fallback;
}

function hexToRgba(hex, alpha = 0.14) {
  const safe = safeColor(hex, '#64748B').slice(1);
  let r = 100;
  let g = 116;
  let b = 139;
  if (safe.length === 3) {
    r = parseInt(safe[0] + safe[0], 16);
    g = parseInt(safe[1] + safe[1], 16);
    b = parseInt(safe[2] + safe[2], 16);
  } else if (safe.length >= 6) {
    r = parseInt(safe.slice(0, 2), 16);
    g = parseInt(safe.slice(2, 4), 16);
    b = parseInt(safe.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseAmountInput(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== 'string') return NaN;
  let s = raw.trim().replace(/\s+/g, '').replace(/[₺tTlL]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    s = parts.length === 2 ? `${parts[0]}.${parts[1]}` : s.replace(/,/g, '');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : NaN;
}

function formatEditableAmount(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return '';
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

function getDefaultDateForMonth(ym) {
  const today = getLocalDateStr();
  const currentYm = getCurrentMonthStr();
  if (!ym || ym === currentYm) return today;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    return `${ym}-01`;
  }
  return today;
}

function getCategoryMeta(categoryId, type, categoryMap) {
  const found = categoryMap.get(categoryId);
  if (found) return found;
  if (categoryId === 'terea') {
    return { id: 'terea', name: 'Terea Silver', type: 'expense', icon: 'flame', color: '#E11D48' };
  }
  return {
    id: categoryId || (type === 'income' ? 'ek_gelir' : 'diger_gider'),
    name: type === 'income' ? 'Diğer Gelir' : 'Diğer Gider',
    type: type === 'income' ? 'income' : 'expense',
    icon: 'tag',
    color: '#64748B',
  };
}

// ============================================================================
// TRANSACTION ADD / EDIT MODAL
// ============================================================================

export function openTransactionModal({
  tx = null,
  defaultType = 'expense',
  defaultCategoryId = null,
  defaultDate = null,
} = {}) {
  const state = getState();
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const isEdit = Boolean(tx && tx.id);
  const ym = getSelectedMonth() || getCurrentMonthStr();

  let activeType = tx?.type === 'income'
    ? 'income'
    : tx?.type === 'expense'
      ? 'expense'
      : (defaultType === 'income' ? 'income' : 'expense');

  const getCatsForType = (t) => categories.filter((c) => c.type === t);

  const pickDefaultCat = (t, preferredId = null) => {
    const list = getCatsForType(t);
    if (preferredId && list.some((c) => c.id === preferredId)) {
      return preferredId;
    }
    return list[0]?.id || (t === 'income' ? 'ek_gelir' : 'diger_gider');
  };

  const selectedCatByType = {
    expense: pickDefaultCat('expense', activeType === 'expense' ? (tx?.categoryId || defaultCategoryId) : null),
    income: pickDefaultCat('income', activeType === 'income' ? (tx?.categoryId || defaultCategoryId) : null),
  };

  let activePayment = PAYMENT_OPTIONS.some((p) => p.id === tx?.paymentMethod)
    ? tx.paymentMethod
    : 'card';

  const initialDate = (tx?.dateStr && DATE_RE.test(tx.dateStr))
    ? tx.dateStr
    : (defaultDate && DATE_RE.test(defaultDate))
      ? defaultDate
      : getDefaultDateForMonth(ym);

  const initialAmount = isEdit ? formatEditableAmount(tx.amount) : '';
  const initialNote = tx?.note || '';

  const renderCategoryChipsHtml = (t) => {
    const list = getCatsForType(t);
    const currentId = selectedCatByType[t];
    if (list.length === 0) {
      return '<span style="font-size:var(--text-xs);color:var(--text-muted);">Bu tür için kategori yok.</span>';
    }
    return list
      .map((cat) => {
        const selected = cat.id === currentId;
        const c = safeColor(cat.color);
        const selectedStyle = selected
          ? `border-color:${c};background-color:${hexToRgba(c, 0.16)};color:var(--text-primary);`
          : '';
        return `
          <button
            type="button"
            class="category-chip ${selected ? 'is-selected' : ''}"
            data-cat-chip="${escapeHtml(cat.id)}"
            style="${selectedStyle}"
            aria-pressed="${selected ? 'true' : 'false'}"
          >
            <span style="display:inline-flex;color:${c};">${icon(cat.icon, 14)}</span>
            <span>${escapeHtml(cat.name)}</span>
          </button>
        `;
      })
      .join('');
  };

  const bodyHtml = `
    <form id="txModalForm" class="stack-md" novalidate>
      <div class="segmented" role="tablist" aria-label="İşlem türü" style="width:100%;">
        <button
          type="button"
          class="segmented-btn ${activeType === 'expense' ? 'is-active' : ''}"
          data-tx-type="expense"
          role="tab"
          aria-selected="${activeType === 'expense' ? 'true' : 'false'}"
        >Gider</button>
        <button
          type="button"
          class="segmented-btn ${activeType === 'income' ? 'is-active' : ''}"
          data-tx-type="income"
          role="tab"
          aria-selected="${activeType === 'income' ? 'true' : 'false'}"
        >Gelir</button>
      </div>

      <div class="field">
        <label class="field-label" for="txModalAmount">Tutar</label>
        <div class="input-group">
          <input
            id="txModalAmount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            class="input mono"
            value="${escapeHtml(initialAmount)}"
            placeholder="0,00"
            style="height:54px;font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;"
            required
          />
          <span class="input-group-addon" style="font-size:1rem;padding:0 16px;">₺</span>
        </div>
      </div>

      <div class="field">
        <div class="row-between">
          <span class="field-label">Kategori</span>
          <button type="button" id="txToggleNewCatBtn" class="btn btn-ghost btn-sm" style="height:26px;padding:0 8px;">
            ${icon('plus', 13)}
            <span>Yeni Kategori</span>
          </button>
        </div>
        <div id="txModalCatGrid" class="chip-grid">
          ${renderCategoryChipsHtml(activeType)}
        </div>

        <div id="txNewCatBox" class="hidden" style="margin-top:8px;padding:12px;border-radius:var(--radius-md);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <div class="stack-sm">
            <div class="row-between">
              <span class="field-label" id="txNewCatLabel">Yeni ${activeType === 'income' ? 'Gelir' : 'Gider'} Kategorisi</span>
              <button type="button" id="txCloseNewCatBtn" class="btn btn-ghost btn-sm" style="height:24px;padding:0 6px;">Vazgeç</button>
            </div>
            <div class="row-gap">
              <input id="txNewCatName" type="text" class="input" maxlength="28" placeholder="Kategori adı..." style="height:36px;" />
              <button type="button" id="txSaveNewCatBtn" class="btn btn-primary btn-sm" style="height:36px;flex-shrink:0;">Ekle</button>
            </div>
            <div class="row-gap wrap" style="gap:6px;" id="txNewCatColors" aria-label="Renk seçimi">
              ${CATEGORY_COLOR_OPTIONS.map((hex, i) => `
                <button
                  type="button"
                  class="color-swatch ${i === 0 ? 'is-selected' : ''}"
                  data-new-cat-color="${hex}"
                  style="background-color:${hex};width:22px;height:22px;"
                  aria-label="Renk ${hex}"
                ></button>
              `).join('')}
            </div>
            <div class="row-gap wrap" style="gap:5px;" id="txNewCatIcons" aria-label="İkon seçimi">
              ${CATEGORY_ICON_OPTIONS.slice(0, 10).map((opt, i) => `
                <button
                  type="button"
                  class="icon-btn ${i === 0 ? 'is-selected' : ''}"
                  data-new-cat-icon="${opt.id}"
                  title="${escapeHtml(opt.label)}"
                  style="width:30px;height:30px;${i === 0 ? 'border-color:var(--accent-primary);background:var(--accent-primary-soft);color:var(--accent-primary);' : ''}"
                >${icon(opt.id, 14)}</button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="txModalDate">Tarih</label>
          <input id="txModalDate" type="date" class="input mono" value="${escapeHtml(initialDate)}" required />
        </div>

        <div class="field">
          <span class="field-label">Ödeme Yöntemi</span>
          <div class="segmented" style="height:42px;">
            ${PAYMENT_OPTIONS.map((p) => `
              <button
                type="button"
                class="segmented-btn ${activePayment === p.id ? 'is-active' : ''}"
                data-tx-pay="${p.id}"
                style="height:32px;padding:0 8px;"
              >${escapeHtml(p.label)}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="txModalNote">Not (İsteğe bağlı)</label>
        <input
          id="txModalNote"
          type="text"
          class="input"
          maxlength="120"
          value="${escapeHtml(initialNote)}"
          placeholder="Örn: Migros haftalık alışveriş"
        />
      </div>

      <p id="txModalError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-between" style="padding-top:var(--space-3);border-top:1px solid var(--border-subtle);gap:var(--space-2);">
        <div>
          ${isEdit ? `
            <button type="button" id="txModalDeleteBtn" class="btn btn-danger btn-sm">
              ${icon('trash', 14)}
              <span>Sil</span>
            </button>
          ` : ''}
        </div>
        <div class="row-gap" style="gap:var(--space-2);">
          <button type="button" id="txModalCancelBtn" class="btn btn-secondary">İptal</button>
          <button type="submit" class="btn btn-primary">
            ${icon('check', 16)}
            <span>${isEdit ? 'Güncelle' : 'Kaydet'}</span>
          </button>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'İşlemi Düzenle' : 'Yeni İşlem Ekle',
    bodyHtml,
    width: '540px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#txModalForm');
      const amountInput = bodyEl.querySelector('#txModalAmount');
      const dateInput = bodyEl.querySelector('#txModalDate');
      const noteInput = bodyEl.querySelector('#txModalNote');
      const catGrid = bodyEl.querySelector('#txModalCatGrid');
      const errorEl = bodyEl.querySelector('#txModalError');
      const typeBtns = Array.from(bodyEl.querySelectorAll('[data-tx-type]'));
      const payBtns = Array.from(bodyEl.querySelectorAll('[data-tx-pay]'));

      // Quick new-category state
      const toggleNewCatBtn = bodyEl.querySelector('#txToggleNewCatBtn');
      const closeNewCatBtn = bodyEl.querySelector('#txCloseNewCatBtn');
      const newCatBox = bodyEl.querySelector('#txNewCatBox');
      const newCatLabel = bodyEl.querySelector('#txNewCatLabel');
      const newCatNameInput = bodyEl.querySelector('#txNewCatName');
      const saveNewCatBtn = bodyEl.querySelector('#txSaveNewCatBtn');
      let newCatColor = CATEGORY_COLOR_OPTIONS[0];
      let newCatIcon = CATEGORY_ICON_OPTIONS[0].id;

      const showError = (msg) => {
        if (!errorEl) return;
        if (msg) {
          errorEl.textContent = msg;
          errorEl.classList.remove('hidden');
        } else {
          errorEl.textContent = '';
          errorEl.classList.add('hidden');
        }
      };

      const bindCategoryChipClicks = () => {
        catGrid?.querySelectorAll('[data-cat-chip]').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedCatByType[activeType] = btn.dataset.catChip;
            catGrid.innerHTML = renderCategoryChipsHtml(activeType);
            bindCategoryChipClicks();
          });
        });
      };
      bindCategoryChipClicks();

      typeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const nextType = btn.dataset.txType === 'income' ? 'income' : 'expense';
          if (nextType === activeType) return;
          activeType = nextType;
          typeBtns.forEach((b) => {
            const on = b.dataset.txType === activeType;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          if (!selectedCatByType[activeType]) {
            selectedCatByType[activeType] = pickDefaultCat(activeType);
          }
          if (catGrid) {
            catGrid.innerHTML = renderCategoryChipsHtml(activeType);
            bindCategoryChipClicks();
          }
          if (newCatLabel) {
            newCatLabel.textContent = `Yeni ${activeType === 'income' ? 'Gelir' : 'Gider'} Kategorisi`;
          }
        });
      });

      payBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          activePayment = btn.dataset.txPay || 'card';
          payBtns.forEach((b) => {
            b.classList.toggle('is-active', b.dataset.txPay === activePayment);
          });
        });
      });

      toggleNewCatBtn?.addEventListener('click', () => {
        newCatBox?.classList.toggle('hidden');
        if (newCatBox && !newCatBox.classList.contains('hidden')) {
          newCatNameInput?.focus();
        }
      });

      closeNewCatBtn?.addEventListener('click', () => {
        newCatBox?.classList.add('hidden');
      });

      bodyEl.querySelectorAll('[data-new-cat-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          newCatColor = btn.dataset.newCatColor || CATEGORY_COLOR_OPTIONS[0];
          bodyEl.querySelectorAll('[data-new-cat-color]').forEach((b) => {
            b.classList.toggle('is-selected', b === btn);
          });
        });
      });

      bodyEl.querySelectorAll('[data-new-cat-icon]').forEach((btn) => {
        btn.addEventListener('click', () => {
          newCatIcon = btn.dataset.newCatIcon || 'tag';
          bodyEl.querySelectorAll('[data-new-cat-icon]').forEach((b) => {
            const on = b === btn;
            b.style.borderColor = on ? 'var(--accent-primary)' : '';
            b.style.background = on ? 'var(--accent-primary-soft)' : '';
            b.style.color = on ? 'var(--accent-primary)' : '';
          });
        });
      });

      saveNewCatBtn?.addEventListener('click', () => {
        const catName = newCatNameInput?.value?.trim() || '';
        if (!catName) {
          showError('Yeni kategori için bir ad girin.');
          newCatNameInput?.focus();
          return;
        }
        const created = addCategory({
          name: catName,
          type: activeType,
          icon: newCatIcon,
          color: newCatColor,
        });
        if (created) {
          categories.push(created);
          selectedCatByType[activeType] = created.id;
          if (catGrid) {
            catGrid.innerHTML = renderCategoryChipsHtml(activeType);
            bindCategoryChipClicks();
          }
          if (newCatNameInput) newCatNameInput.value = '';
          newCatBox?.classList.add('hidden');
          showError('');
          showToast(`"${created.name}" kategorisi eklendi`, { type: 'success' });
        }
      });

      bodyEl.querySelector('#txModalCancelBtn')?.addEventListener('click', closeFn);

      bodyEl.querySelector('#txModalDeleteBtn')?.addEventListener('click', () => {
        if (!isEdit) return;
        const removed = deleteTransaction(tx.id);
        closeFn();
        if (removed) {
          showToast('İşlem silindi', {
            type: 'warn',
            undoLabel: 'Geri Al',
            onUndo: () => restoreTransaction(removed),
          });
        }
      });

      amountInput?.addEventListener('input', () => showError(''));

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const amount = parseAmountInput(amountInput?.value || '');
        if (!Number.isFinite(amount) || amount <= 0) {
          showError('Lütfen 0\'dan büyük geçerli bir tutar girin.');
          amountInput?.focus();
          return;
        }
        const dateVal = dateInput?.value || '';
        if (!DATE_RE.test(dateVal)) {
          showError('Lütfen geçerli bir tarih seçin.');
          dateInput?.focus();
          return;
        }

        const payload = {
          type: activeType,
          amount: Math.round(amount * 100) / 100,
          categoryId: selectedCatByType[activeType] || pickDefaultCat(activeType),
          dateStr: dateVal,
          paymentMethod: activePayment,
          note: (noteInput?.value || '').trim(),
        };

        if (isEdit) {
          updateTransaction(tx.id, payload);
          closeFn();
          showToast('İşlem güncellendi', { type: 'success' });
        } else {
          addTransaction(payload);
          closeFn();
          showToast(activeType === 'income' ? 'Gelir eklendi' : 'Gider eklendi', { type: 'success' });
        }
      });

      // Ensure amount input gets priority auto-focus after openModal's rAF
      requestAnimationFrame(() => {
        if (amountInput) {
          amountInput.focus();
          if (isEdit) amountInput.select();
        }
      });
    },
  });
}

// ============================================================================
// RECURRING BILL MODAL
// ============================================================================

function openRecurringModal(item = null) {
  const state = getState();
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const isEdit = Boolean(item && item.id);

  let activeType = item?.type === 'income' ? 'income' : 'expense';
  const getCatsForType = (t) => categories.filter((c) => c.type === t);

  const pickCat = (t, pref) => {
    const list = getCatsForType(t);
    if (pref && list.some((c) => c.id === pref)) return pref;
    const subDefault = list.find((c) => c.id === 'abonelik' || c.id === 'faturalar');
    return subDefault?.id || list[0]?.id || (t === 'income' ? 'ek_gelir' : 'abonelik');
  };

  let activeCatId = pickCat(activeType, item?.categoryId);
  const initialActive = item ? Boolean(item.active) : true;

  const renderCatOptions = (t, selectedId) => {
    return getCatsForType(t)
      .map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
  };

  const bodyHtml = `
    <form id="recModalForm" class="stack-md" novalidate>
      <div class="segmented" style="width:100%;">
        <button type="button" class="segmented-btn ${activeType === 'expense' ? 'is-active' : ''}" data-rec-type="expense">Sabit Gider</button>
        <button type="button" class="segmented-btn ${activeType === 'income' ? 'is-active' : ''}" data-rec-type="income">Sabit Gelir</button>
      </div>

      <div class="field">
        <label class="field-label" for="recTitle">Başlık</label>
        <input id="recTitle" type="text" class="input" maxlength="60" value="${escapeHtml(item?.title || '')}" placeholder="Örn: Kira, İnternet, Spotify, Netflix" required />
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="recAmount">Aylık Tutar</label>
          <div class="input-group">
            <input id="recAmount" type="text" inputmode="decimal" class="input mono" value="${escapeHtml(item ? formatEditableAmount(item.amount) : '')}" placeholder="0,00" required />
            <span class="input-group-addon">₺</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="recDay">Ayın Günü (1-31)</label>
          <input id="recDay" type="number" min="1" max="31" class="input mono" value="${escapeHtml(String(item?.dayOfMonth || 1))}" required />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="recCategory">Kategori</label>
        <select id="recCategory" class="select">
          ${renderCatOptions(activeType, activeCatId)}
        </select>
      </div>

      <label class="toggle-row">
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">Aktif Kalem</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">Aylık sabit gider yükü özetine dahil edilir.</div>
        </div>
        <span class="switch">
          <input id="recActive" type="checkbox" ${initialActive ? 'checked' : ''} />
        </span>
      </label>

      <p id="recModalError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-gap" style="justify-content:flex-end;padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <button type="button" id="recCancelBtn" class="btn btn-secondary">İptal</button>
        <button type="submit" class="btn btn-primary">
          ${icon('check', 16)}
          <span>${isEdit ? 'Güncelle' : 'Kaydet'}</span>
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Sabit Kalemi Düzenle' : 'Yeni Sabit Gider / Abonelik',
    bodyHtml,
    width: '480px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#recModalForm');
      const titleInput = bodyEl.querySelector('#recTitle');
      const amountInput = bodyEl.querySelector('#recAmount');
      const dayInput = bodyEl.querySelector('#recDay');
      const catSelect = bodyEl.querySelector('#recCategory');
      const activeInput = bodyEl.querySelector('#recActive');
      const errorEl = bodyEl.querySelector('#recModalError');
      const typeBtns = Array.from(bodyEl.querySelectorAll('[data-rec-type]'));

      typeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.recType === 'income' ? 'income' : 'expense';
          if (next === activeType) return;
          activeType = next;
          typeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.recType === activeType));
          activeCatId = pickCat(activeType, null);
          if (catSelect) {
            catSelect.innerHTML = renderCatOptions(activeType, activeCatId);
          }
        });
      });

      bodyEl.querySelector('#recCancelBtn')?.addEventListener('click', closeFn);

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const title = (titleInput?.value || '').trim();
        const amount = parseAmountInput(amountInput?.value || '');
        const dayOfMonth = Math.min(31, Math.max(1, Math.floor(Number(dayInput?.value) || 1)));

        if (!title) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen bir başlık girin.';
            errorEl.classList.remove('hidden');
          }
          titleInput?.focus();
          return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen geçerli bir tutar girin.';
            errorEl.classList.remove('hidden');
          }
          amountInput?.focus();
          return;
        }

        const payload = {
          title,
          amount: Math.round(amount * 100) / 100,
          dayOfMonth,
          categoryId: catSelect?.value || pickCat(activeType, null),
          type: activeType,
          active: Boolean(activeInput?.checked),
        };

        if (isEdit) {
          updateRecurring(item.id, payload);
          closeFn();
          showToast('Sabit kalem güncellendi', { type: 'success' });
        } else {
          addRecurring(payload);
          closeFn();
          showToast('Sabit kalem eklendi', { type: 'success' });
        }
      });
    },
  });
}

// ============================================================================
// MAIN TRANSACTIONS VIEW
// ============================================================================

export function renderTransactions(rootEl, ctx = {}) {
  if (!rootEl) return;

  const state = getState();
  const ym = ctx?.ym || getSelectedMonth() || getCurrentMonthStr();
  const navigate = typeof ctx?.navigate === 'function' ? ctx.navigate : () => {};
  const openQuickAdd = typeof ctx?.openQuickAdd === 'function'
    ? ctx.openQuickAdd
    : (opts) => openTransactionModal(opts);

  const wasAlreadyMounted = Boolean(rootEl.querySelector('[data-tx-view="1"]'));
  const routeCategoryId = ctx?.routeParams?.categoryId;
  if (routeCategoryId && (!wasAlreadyMounted || ctx.routeParams !== lastAppliedRouteParams)) {
    filterState.categoryId = routeCategoryId;
    filterState.type = 'all';
    lastAppliedRouteParams = ctx.routeParams;
  } else if (!wasAlreadyMounted && ctx?.routeParams && ctx.routeParams !== lastAppliedRouteParams) {
    lastAppliedRouteParams = ctx.routeParams;
  }

  const categories = Array.isArray(state.categories) ? state.categories : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Ensure selected category filter still exists (or is 'all' / 'terea')
  if (
    filterState.categoryId !== 'all' &&
    filterState.categoryId !== 'terea' &&
    !categoryMap.has(filterState.categoryId)
  ) {
    filterState.categoryId = 'all';
  }

  const monthPrefix = `${ym}-`;
  const monthTransactions = (Array.isArray(state.transactions) ? state.transactions : [])
    .filter((tx) => tx && typeof tx.dateStr === 'string' && tx.dateStr.startsWith(monthPrefix));

  const tereaMonth = getTereaMonthStats(ym, state);
  const includeTerea = Boolean(state.terea?.settings?.includeInFinance);

  const recurringList = Array.isArray(state.recurring) ? state.recurring : [];
  const activeRecurringExpenseTotal = recurringList
    .filter((r) => r && r.active && r.type !== 'income')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const activeRecurringIncomeTotal = recurringList
    .filter((r) => r && r.active && r.type === 'income')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const appliedRecurringIds = new Set(
    monthTransactions.map((t) => t.recurringId).filter(Boolean)
  );

  // Filter computation helper
  const getFilteredTransactions = () => {
    const query = filterState.search.trim().toLocaleLowerCase('tr-TR');
    return monthTransactions.filter((tx) => {
      if (filterState.type !== 'all' && tx.type !== filterState.type) return false;
      if (filterState.categoryId !== 'all' && tx.categoryId !== filterState.categoryId) return false;
      if (filterState.paymentMethod !== 'all' && tx.paymentMethod !== filterState.paymentMethod) return false;
      if (query) {
        const cat = getCategoryMeta(tx.categoryId, tx.type, categoryMap);
        const hay = `${tx.note || ''} ${cat.name} ${getPaymentMethodLabel(tx.paymentMethod)}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  };

  const renderTxRowHtml = (tx, showDateInMeta = false) => {
    const cat = getCategoryMeta(tx.categoryId, tx.type, categoryMap);
    const col = safeColor(cat.color);
    const isIncome = tx.type === 'income';
    const titleText = tx.note ? tx.note : cat.name;
    const amountText = isIncome
      ? formatTL(tx.amount, { showSign: true })
      : formatTL(-Math.abs(tx.amount));

    return `
      <div class="tx-row" data-tx-id="${escapeHtml(tx.id)}">
        <div
          class="tx-icon"
          style="color:${col};background-color:${hexToRgba(col, 0.14)};border-color:${hexToRgba(col, 0.28)};"
        >
          ${icon(cat.icon, 18)}
        </div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(titleText)}</div>
          <div class="tx-meta">
            <span>${escapeHtml(cat.name)}</span>
            <span class="badge badge-neutral" style="padding:1px 7px;font-size:10px;">${escapeHtml(getPaymentMethodLabel(tx.paymentMethod))}</span>
            ${tx.recurringId ? '<span class="badge badge-primary" style="padding:1px 7px;font-size:10px;">Düzenli</span>' : ''}
            ${showDateInMeta ? `<span>• ${escapeHtml(formatDateTR(tx.dateStr, { relative: true }))}</span>` : ''}
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${isIncome ? 'is-income' : 'is-expense'}">${escapeHtml(amountText)}</span>
          <div class="tx-actions">
            <button
              type="button"
              class="icon-btn"
              data-edit-tx="${escapeHtml(tx.id)}"
              aria-label="İşlemi düzenle"
              title="Düzenle"
              style="width:32px;height:32px;"
            >${icon('edit', 14)}</button>
            <button
              type="button"
              class="icon-btn"
              data-delete-tx="${escapeHtml(tx.id)}"
              aria-label="İşlemi sil"
              title="Sil"
              style="width:32px;height:32px;color:var(--accent-expense);"
            >${icon('trash', 14)}</button>
          </div>
        </div>
      </div>
    `;
  };

  const hasActiveFilters = () =>
    Boolean(filterState.search.trim()) ||
    filterState.type !== 'all' ||
    filterState.categoryId !== 'all' ||
    filterState.paymentMethod !== 'all';

  const updateFilteredSection = () => {
    const listContainer = rootEl.querySelector('#txListContainer');
    const summaryContainer = rootEl.querySelector('#txMiniSummary');
    const clearFiltersBtn = rootEl.querySelector('#txClearFiltersBtn');
    if (!listContainer) return;

    const filtered = getFilteredTransactions();

    let totalExp = 0;
    let totalInc = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') totalInc += Number(tx.amount) || 0;
      else totalExp += Number(tx.amount) || 0;
    }

    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="row-between wrap" style="gap:var(--space-2);padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
          <div class="row-gap wrap" style="gap:var(--space-2);">
            <span class="badge badge-neutral mono">${filtered.length} işlem</span>
            <span class="badge badge-expense mono">Gider: ${escapeHtml(formatTL(totalExp))}</span>
            <span class="badge badge-income mono">Gelir: ${escapeHtml(formatTL(totalInc))}</span>
          </div>
          <span class="mono" style="font-size:var(--text-xs);font-weight:700;color:${totalInc - totalExp >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'};">
            Net: ${escapeHtml(formatTL(totalInc - totalExp, { showSign: true }))}
          </span>
        </div>
      `;
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.classList.toggle('hidden', !hasActiveFilters());
    }

    // Special case: user clicked "Terea Silver" slice on Overview Donut chart
    if (filterState.categoryId === 'terea' && filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="card stack-md">
          <div class="row-between wrap">
            <div class="row-gap">
              <div class="tx-icon" style="color:#E11D48;background:rgba(225,29,72,0.14);border-color:rgba(225,29,72,0.28);">
                ${icon('flame', 20)}
              </div>
              <div>
                <div class="card-title">Terea Silver (Otomatik Takip)</div>
                <div class="card-subtitle">${escapeHtml(formatMonthLabel(ym))} • ${tereaMonth.totalSticks} dal (${tereaMonth.trackedDays} gün)</div>
              </div>
            </div>
            <div class="mono" style="font-size:var(--text-lg);font-weight:700;color:var(--accent-expense);">
              -${escapeHtml(formatTL(tereaMonth.totalBurned))}
            </div>
          </div>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">
            Terea tüketimin günlük sayaç üzerinden otomatik hesaplanır ve doğrudan "Terea Takip" ekranından düzenlenir.
          </p>
          <div class="row-gap wrap">
            <button type="button" class="btn btn-primary btn-sm" id="txGoTereaFromCat">
              ${icon('flame', 15)}
              <span>Terea Takip'e Git</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="txResetCatFilterBtn">
              <span>Tüm İşlemleri Göster</span>
            </button>
          </div>
        </div>
      `;
      listContainer.querySelector('#txGoTereaFromCat')?.addEventListener('click', () => navigate('terea'));
      listContainer.querySelector('#txResetCatFilterBtn')?.addEventListener('click', () => {
        filterState.categoryId = 'all';
        const sel = rootEl.querySelector('#txCategoryFilter');
        if (sel) sel.value = 'all';
        updateFilteredSection();
      });
      return;
    }

    if (filtered.length === 0) {
      const filteredEmpty = monthTransactions.length > 0;
      listContainer.innerHTML = renderEmptyState({
        iconName: filteredEmpty ? 'search' : 'wallet',
        title: filteredEmpty ? 'Filtreyle eşleşen işlem yok' : `${formatMonthLabel(ym)} için kayıtlı işlem yok`,
        description: filteredEmpty
          ? 'Arama terimini veya seçili filtreleri temizleyerek diğer işlemleri görebilirsin.'
          : 'Gelir veya gider ekleyerek bu ayki hareketlerini listelemeye başla.',
        actionHtml: filteredEmpty
          ? '<button type="button" class="btn btn-secondary btn-sm" id="txEmptyClearBtn">Filtreleri Temizle</button>'
          : '<button type="button" class="btn btn-primary btn-sm" id="txEmptyAddBtn">+ İlk İşlemi Ekle</button>',
      });
      listContainer.querySelector('#txEmptyClearBtn')?.addEventListener('click', () => {
        resetFiltersInPlace();
      });
      listContainer.querySelector('#txEmptyAddBtn')?.addEventListener('click', () => {
        openQuickAdd({ defaultDate: getDefaultDateForMonth(ym) });
      });
      return;
    }

    if (filterState.sort === 'amount_desc' || filterState.sort === 'amount_asc') {
      const sorted = [...filtered].sort((a, b) => {
        const diff = filterState.sort === 'amount_desc'
          ? (Number(b.amount) || 0) - (Number(a.amount) || 0)
          : (Number(a.amount) || 0) - (Number(b.amount) || 0);
        if (diff !== 0) return diff;
        return String(b.dateStr).localeCompare(String(a.dateStr));
      });
      listContainer.innerHTML = `
        <div class="tx-list">
          ${sorted.map((tx) => renderTxRowHtml(tx, true)).join('')}
        </div>
      `;
    } else {
      // Grouped by dateStr descending, newest createdAt first within same day
      const groupsMap = new Map();
      const sorted = [...filtered].sort((a, b) => {
        const dCmp = String(b.dateStr).localeCompare(String(a.dateStr));
        if (dCmp !== 0) return dCmp;
        return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      });

      for (const tx of sorted) {
        const bucket = groupsMap.get(tx.dateStr) || { items: [], net: 0, expense: 0, income: 0 };
        bucket.items.push(tx);
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'income') {
          bucket.income += amt;
          bucket.net += amt;
        } else {
          bucket.expense += amt;
          bucket.net -= amt;
        }
        groupsMap.set(tx.dateStr, bucket);
      }

      const groupsHtml = Array.from(groupsMap.entries())
        .map(([dateStr, grp]) => {
          const subtotalLabel = grp.income > 0 && grp.expense === 0
            ? formatTL(grp.income, { showSign: true })
            : grp.expense > 0 && grp.income === 0
              ? formatTL(-grp.expense)
              : formatTL(grp.net, { showSign: true });

          return `
            <div class="tx-group">
              <div class="tx-date-header">
                <span>${escapeHtml(formatDateTR(dateStr, { relative: true }))}</span>
                <span class="mono" style="color:${grp.net >= 0 ? 'var(--accent-income)' : 'var(--text-secondary)'};">
                  ${escapeHtml(subtotalLabel)}
                </span>
              </div>
              <div class="tx-list">
                ${grp.items.map((tx) => renderTxRowHtml(tx, false)).join('')}
              </div>
            </div>
          `;
        })
        .join('');

      listContainer.innerHTML = `<div class="stack-md">${groupsHtml}</div>`;
    }

    // Bind row edit & delete actions
    const txById = new Map(filtered.map((t) => [t.id, t]));
    listContainer.querySelectorAll('[data-edit-tx]').forEach((btn) => {
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const found = txById.get(btn.dataset.editTx);
        if (found) openTransactionModal({ tx: found });
      });
    });

    listContainer.querySelectorAll('[data-delete-tx]').forEach((btn) => {
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const removed = deleteTransaction(btn.dataset.deleteTx);
        if (removed) {
          showToast('İşlem silindi', {
            type: 'warn',
            undoLabel: 'Geri Al',
            onUndo: () => restoreTransaction(removed),
          });
        }
      });
    });
  };

  const resetFiltersInPlace = () => {
    filterState.search = '';
    filterState.type = 'all';
    filterState.categoryId = 'all';
    filterState.paymentMethod = 'all';

    const searchInput = rootEl.querySelector('#txSearchInput');
    const clearSearchBtn = rootEl.querySelector('#txClearSearchBtn');
    const catSelect = rootEl.querySelector('#txCategoryFilter');
    const paySelect = rootEl.querySelector('#txPaymentFilter');
    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
    if (catSelect) catSelect.value = 'all';
    if (paySelect) paySelect.value = 'all';
    rootEl.querySelectorAll('[data-filter-type]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.filterType === 'all');
    });
    updateFilteredSection();
  };

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');

  const recurringRowsHtml = recurringList.length > 0
    ? `
      <div class="tx-list">
        ${recurringList
          .slice()
          .sort((a, b) => (a.dayOfMonth || 1) - (b.dayOfMonth || 1))
          .map((item) => {
            const cat = getCategoryMeta(item.categoryId, item.type, categoryMap);
            const col = safeColor(cat.color);
            const isApplied = appliedRecurringIds.has(item.id);
            const isIncome = item.type === 'income';
            return `
              <div class="tx-row" style="${!item.active ? 'opacity:0.6;' : ''}">
                <div
                  class="tx-icon"
                  style="color:${col};background-color:${hexToRgba(col, 0.14)};border-color:${hexToRgba(col, 0.28)};"
                >
                  ${icon(cat.icon, 18)}
                </div>
                <div class="tx-info">
                  <div class="tx-title">${escapeHtml(item.title)}</div>
                  <div class="tx-meta">
                    <span class="badge badge-neutral mono" style="padding:1px 7px;font-size:10px;">Her ayın ${item.dayOfMonth}. günü</span>
                    <span>${escapeHtml(cat.name)}</span>
                    ${!item.active ? '<span class="badge badge-warn" style="padding:1px 7px;font-size:10px;">Pasif</span>' : ''}
                  </div>
                </div>
                <div class="tx-right wrap" style="justify-content:flex-end;gap:var(--space-2);">
                  <span class="tx-amount ${isIncome ? 'is-income' : 'is-expense'}">
                    ${escapeHtml(isIncome ? formatTL(item.amount, { showSign: true }) : formatTL(-Math.abs(item.amount)))}
                  </span>
                  <button
                    type="button"
                    class="btn btn-sm ${isApplied ? 'btn-success' : 'btn-secondary'}"
                    data-apply-rec="${escapeHtml(item.id)}"
                    ${isApplied ? 'disabled' : ''}
                  >
                    ${isApplied ? `${icon('check', 13)}<span>İşlendi</span>` : '<span>Bu Aya İşle</span>'}
                  </button>
                  <div class="tx-actions" style="opacity:1;">
                    <button type="button" class="icon-btn" data-edit-rec="${escapeHtml(item.id)}" aria-label="Sabit kalemi düzenle" title="Düzenle" style="width:32px;height:32px;">
                      ${icon('edit', 14)}
                    </button>
                    <button type="button" class="icon-btn" data-delete-rec="${escapeHtml(item.id)}" aria-label="Sabit kalemi sil" title="Sil" style="width:32px;height:32px;color:var(--accent-expense);">
                      ${icon('trash', 14)}
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `
    : renderEmptyState({
        iconName: 'repeat',
        title: 'Henüz sabit gider veya abonelik yok',
        description: 'Kira, İnternet, Spotify veya Netflix gibi düzenli ödemelerini ekle; her ay tek tıkla işle.',
        actionHtml: '<button type="button" class="btn btn-secondary btn-sm" id="recEmptyAddBtn">+ Sabit Kalem Ekle</button>',
      });

  rootEl.innerHTML = `
    <div class="stack-lg anim-enter" data-tx-view="1">
      <!-- Top Action & Filter Bar Card -->
      <section class="card stack-md">
        <div class="row-between wrap">
          <div>
            <h2 class="card-title">${escapeHtml(formatMonthLabel(ym))} İşlemleri</h2>
            <p class="card-subtitle">Tüm gelir ve gider hareketlerini filtrele, düzenle veya dışa aktar</p>
          </div>
          <div class="row-gap wrap" style="gap:var(--space-2);">
            <button type="button" id="txClearFiltersBtn" class="btn btn-ghost btn-sm ${hasActiveFilters() ? '' : 'hidden'}">
              ${icon('x', 14)}
              <span>Temizle</span>
            </button>
            <button type="button" id="txCsvExportBtn" class="btn btn-secondary btn-sm">
              ${icon('download', 15)}
              <span>CSV İndir</span>
            </button>
            <button type="button" id="txAddMainBtn" class="btn btn-primary btn-sm">
              ${icon('plus', 15)}
              <span>İşlem Ekle</span>
            </button>
          </div>
        </div>

        <div class="row-gap wrap" style="gap:var(--space-3);">
          <div style="position:relative;flex:1 1 230px;min-width:200px;">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;display:inline-flex;">
              ${icon('search', 15)}
            </span>
            <input
              id="txSearchInput"
              type="search"
              class="input"
              value="${escapeHtml(filterState.search)}"
              placeholder="Not, kategori veya yöntem ara..."
              aria-label="İşlemlerde ara"
              style="padding-left:36px;padding-right:32px;"
            />
            <button
              type="button"
              id="txClearSearchBtn"
              class="icon-btn ${filterState.search ? '' : 'hidden'}"
              aria-label="Aramayı temizle"
              style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:none;box-shadow:none;background:transparent;"
            >${icon('x', 14)}</button>
          </div>

          <div class="segmented" role="group" aria-label="İşlem türü filtresi" style="flex:0 0 auto;">
            <button type="button" class="segmented-btn ${filterState.type === 'all' ? 'is-active' : ''}" data-filter-type="all">Tümü</button>
            <button type="button" class="segmented-btn ${filterState.type === 'expense' ? 'is-active' : ''}" data-filter-type="expense">Gider</button>
            <button type="button" class="segmented-btn ${filterState.type === 'income' ? 'is-active' : ''}" data-filter-type="income">Gelir</button>
          </div>

          <select id="txCategoryFilter" class="select" aria-label="Kategori filtresi" style="flex:0 1 190px;min-width:155px;">
            <option value="all" ${filterState.categoryId === 'all' ? 'selected' : ''}>Tüm Kategoriler</option>
            ${(includeTerea || filterState.categoryId === 'terea')
              ? `<option value="terea" ${filterState.categoryId === 'terea' ? 'selected' : ''}>Terea Silver (Otomatik)</option>`
              : ''}
            <optgroup label="Gider Kategorileri">
              ${expenseCats.map((c) => `
                <option value="${escapeHtml(c.id)}" ${filterState.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </optgroup>
            <optgroup label="Gelir Kategorileri">
              ${incomeCats.map((c) => `
                <option value="${escapeHtml(c.id)}" ${filterState.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </optgroup>
          </select>

          <select id="txPaymentFilter" class="select" aria-label="Ödeme yöntemi filtresi" style="flex:0 1 150px;min-width:130px;">
            <option value="all" ${filterState.paymentMethod === 'all' ? 'selected' : ''}>Tüm Yöntemler</option>
            <option value="card" ${filterState.paymentMethod === 'card' ? 'selected' : ''}>Kart</option>
            <option value="cash" ${filterState.paymentMethod === 'cash' ? 'selected' : ''}>Nakit</option>
            <option value="transfer" ${filterState.paymentMethod === 'transfer' ? 'selected' : ''}>Havale / EFT</option>
          </select>

          <select id="txSortSelect" class="select" aria-label="Sıralama" style="flex:0 1 180px;min-width:150px;">
            <option value="date_desc" ${filterState.sort === 'date_desc' ? 'selected' : ''}>Tarih (Yeni → Eski)</option>
            <option value="amount_desc" ${filterState.sort === 'amount_desc' ? 'selected' : ''}>Tutar (Yüksek → Düşük)</option>
            <option value="amount_asc" ${filterState.sort === 'amount_asc' ? 'selected' : ''}>Tutar (Düşük → Yüksek)</option>
          </select>
        </div>

        <div id="txMiniSummary"></div>
      </section>

      ${includeTerea && tereaMonth.totalBurned > 0 && filterState.categoryId !== 'terea' ? `
        <div class="banner-cta" style="padding:var(--space-3) var(--space-4);">
          <div class="row-gap" style="gap:var(--space-3);">
            <div class="tx-icon" style="width:34px;height:34px;color:#E11D48;background:rgba(225,29,72,0.14);border-color:rgba(225,29,72,0.28);">
              ${icon('flame', 16)}
            </div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">
              <strong style="color:var(--text-primary);">Terea Gideri Dahil:</strong>
              ${escapeHtml(formatMonthLabel(ym))} içinde <strong class="mono">${tereaMonth.totalSticks} dal</strong>
              (<strong class="mono" style="color:var(--accent-expense);">${escapeHtml(formatTL(tereaMonth.totalBurned))}</strong>)
              Terea Takip üzerinden bütçeye yansıtılıyor.
            </div>
          </div>
          <button type="button" id="txTereaBannerBtn" class="btn btn-secondary btn-sm">
            <span>Terea Takip'e Git</span>
          </button>
        </div>
      ` : ''}

      <!-- Grouped Transaction List -->
      <section id="txListContainer" aria-live="polite"></section>

      <!-- Recurring Bills & Subscriptions -->
      <section class="stack-md">
        <div class="row-between wrap">
          <div>
            <h2 class="card-title">Sabit Giderler &amp; Abonelikler</h2>
            <p class="card-subtitle">
              Aktif aylık gider yükü: <strong class="mono">${escapeHtml(formatTL(activeRecurringExpenseTotal))}</strong>
              ${activeRecurringIncomeTotal > 0 ? ` • Sabit gelir: <strong class="mono">${escapeHtml(formatTL(activeRecurringIncomeTotal))}</strong>` : ''}
            </p>
          </div>
          <button type="button" id="recAddBtn" class="btn btn-secondary btn-sm">
            ${icon('plus', 15)}
            <span>Yeni Sabit Kalem</span>
          </button>
        </div>
        ${recurringRowsHtml}
      </section>
    </div>
  `;

  // Populate initial list & summary
  updateFilteredSection();

  // Bind top bar events
  rootEl.querySelector('#txAddMainBtn')?.addEventListener('click', () => {
    openQuickAdd({ defaultDate: getDefaultDateForMonth(ym) });
  });

  rootEl.querySelector('#txCsvExportBtn')?.addEventListener('click', () => {
    const res = exportTransactionsCSV({ scope: 'month', ym });
    if (res?.ok) {
      showToast(`${res.filename} indirildi (${res.rowCount} kayıt)`, { type: 'success' });
    }
  });

  rootEl.querySelector('#txClearFiltersBtn')?.addEventListener('click', resetFiltersInPlace);
  rootEl.querySelector('#txTereaBannerBtn')?.addEventListener('click', () => navigate('terea'));

  const searchInput = rootEl.querySelector('#txSearchInput');
  const clearSearchBtn = rootEl.querySelector('#txClearSearchBtn');

  searchInput?.addEventListener('input', (evt) => {
    filterState.search = evt.target.value || '';
    clearSearchBtn?.classList.toggle('hidden', !filterState.search);
    updateFilteredSection();
  });

  clearSearchBtn?.addEventListener('click', () => {
    filterState.search = '';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    clearSearchBtn.classList.add('hidden');
    updateFilteredSection();
  });

  rootEl.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.type = btn.dataset.filterType || 'all';
      rootEl.querySelectorAll('[data-filter-type]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.filterType === filterState.type);
      });
      updateFilteredSection();
    });
  });

  rootEl.querySelector('#txCategoryFilter')?.addEventListener('change', (evt) => {
    filterState.categoryId = evt.target.value || 'all';
    updateFilteredSection();
  });

  rootEl.querySelector('#txPaymentFilter')?.addEventListener('change', (evt) => {
    filterState.paymentMethod = evt.target.value || 'all';
    updateFilteredSection();
  });

  rootEl.querySelector('#txSortSelect')?.addEventListener('change', (evt) => {
    filterState.sort = evt.target.value || 'date_desc';
    updateFilteredSection();
  });

  // Bind recurring actions
  rootEl.querySelector('#recAddBtn')?.addEventListener('click', () => openRecurringModal(null));
  rootEl.querySelector('#recEmptyAddBtn')?.addEventListener('click', () => openRecurringModal(null));

  const recById = new Map(recurringList.map((r) => [r.id, r]));

  rootEl.querySelectorAll('[data-apply-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const recId = btn.dataset.applyRec;
      const created = applyRecurringToMonth(recId, ym);
      if (created) {
        showToast(`"${created.note}" ${formatMonthLabel(ym)} dönemine işlendi`, { type: 'success' });
      } else {
        showToast('Bu sabit işlem bu ay için zaten işlenmiş', { type: 'info' });
      }
    });
  });

  rootEl.querySelectorAll('[data-edit-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = recById.get(btn.dataset.editRec);
      if (found) openRecurringModal(found);
    });
  });

  rootEl.querySelectorAll('[data-delete-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ok = deleteRecurring(btn.dataset.deleteRec);
      if (ok) {
        showToast('Sabit kalem silindi', { type: 'warn' });
      }
    });
  });
}
