/**
 * js/views/goals.js
 * Harcama Hedefleri (Genel & Kategori Bazlı Bütçe Limitleri) ve
 * Birikim / Tasarruf Hedefleri Yönetimi
 */

import {
  getState,
  getSelectedMonth,
  getCurrentMonthStr,
  setOverallBudget,
  setCategoryBudget,
  removeCategoryBudget,
  addSavingsGoal,
  updateSavingsGoal,
  contributeSavingsGoal,
  deleteSavingsGoal,
  getMonthFinanceSummary,
  getTereaMonthStats,
} from '../state.js';

import {
  escapeHtml,
  formatTL,
  formatMonthLabel,
  formatDateTR,
  icon,
  CATEGORY_COLOR_OPTIONS,
  openModal,
  showToast,
  renderEmptyState,
} from '../ui.js';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function safeColor(color, fallback = '#28B982') {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color.trim())) {
    return color.trim();
  }
  return fallback;
}

function hexToRgba(hex, alpha = 0.14) {
  const safe = safeColor(hex, '#28B982').slice(1);
  let r = 40;
  let g = 185;
  let b = 130;
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

function getProgressTone(pct) {
  if (pct >= 100) return 'is-danger';
  if (pct >= 80) return 'is-warn';
  return 'is-ok';
}

function getMonthsBetweenTodayAnd(deadlineStr) {
  if (!DATE_RE.test(deadlineStr)) return null;
  const [ty, tm, td] = deadlineStr.split('-').map(Number);
  const target = new Date(ty, tm - 1, td);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target <= today) return 0;

  let months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  if (target.getDate() > today.getDate()) {
    months += 0.5;
  }
  return Math.max(1, Math.ceil(months));
}

// ============================================================================
// MODALS FOR GOALS & BUDGETS
// ============================================================================

function openOverallBudgetModal(currentLimit = 0) {
  const bodyHtml = `
    <form id="overallBudgetForm" class="stack-md" novalidate>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">
        Aylık toplam harcama üst sınırını belirle. Terea dahil toplam giderlerin bu limite göre izlenir. Limiti kaldırmak için <strong class="mono">0</strong> girebilirsin.
      </p>

      <div class="field">
        <label class="field-label" for="overallLimitInput">Aylık Genel Harcama Limiti</label>
        <div class="input-group">
          <input
            id="overallLimitInput"
            type="text"
            inputmode="decimal"
            class="input mono"
            value="${escapeHtml(formatEditableAmount(currentLimit))}"
            placeholder="Örn: 25000"
            style="height:48px;font-size:1.125rem;font-weight:700;"
          />
          <span class="input-group-addon">₺</span>
        </div>
      </div>

      <p id="overallBudgetError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-between" style="padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <div>
          ${currentLimit > 0 ? `<button type="button" id="overallClearBtn" class="btn btn-danger btn-sm">Limiti Kaldır</button>` : ''}
        </div>
        <div class="row-gap" style="gap:var(--space-2);">
          <button type="button" id="overallCancelBtn" class="btn btn-secondary">İptal</button>
          <button type="submit" class="btn btn-primary">
            ${icon('check', 16)}
            <span>Kaydet</span>
          </button>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: 'Genel Aylık Harcama Hedefi',
    bodyHtml,
    width: '460px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#overallBudgetForm');
      const input = bodyEl.querySelector('#overallLimitInput');
      const errorEl = bodyEl.querySelector('#overallBudgetError');

      bodyEl.querySelector('#overallCancelBtn')?.addEventListener('click', closeFn);
      bodyEl.querySelector('#overallClearBtn')?.addEventListener('click', () => {
        setOverallBudget(0);
        closeFn();
        showToast('Genel harcama limiti kaldırıldı', { type: 'info' });
      });

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const raw = (input?.value || '').trim();
        const val = raw === '' ? 0 : parseAmountInput(raw);
        if (!Number.isFinite(val) || val < 0) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen 0 veya daha büyük geçerli bir tutar girin.';
            errorEl.classList.remove('hidden');
          }
          input?.focus();
          return;
        }
        setOverallBudget(Math.round(val * 100) / 100);
        closeFn();
        showToast(val > 0 ? 'Genel aylık hedef güncellendi' : 'Genel harcama limiti kaldırıldı', { type: 'success' });
      });

      requestAnimationFrame(() => input?.focus());
    },
  });
}

function openCategoryBudgetModal({ categoryId = null, currentLimit = 0 } = {}) {
  const state = getState();
  const expenseCategories = (Array.isArray(state.categories) ? state.categories : [])
    .filter((c) => c.type === 'expense');

  // Include Terea as selectable budget category if includeInFinance is enabled
  const includeTerea = Boolean(state.terea?.settings?.includeInFinance);
  const options = [...expenseCategories];
  if (includeTerea || categoryId === 'terea') {
    options.push({
      id: 'terea',
      name: 'Terea Silver',
      type: 'expense',
      icon: 'flame',
      color: '#E11D48',
    });
  }

  const existingLimits = state.budgets?.categoryLimits || {};
  const isEdit = Boolean(categoryId);
  const selectedCatId = categoryId || (
    options.find((c) => !(Number(existingLimits[c.id]) > 0))?.id || options[0]?.id || 'market'
  );

  const bodyHtml = `
    <form id="catBudgetForm" class="stack-md" novalidate>
      <div class="field">
        <label class="field-label" for="catBudgetSelect">Kategori</label>
        <select id="catBudgetSelect" class="select" ${isEdit ? 'disabled' : ''}>
          ${options.map((c) => {
            const existing = Number(existingLimits[c.id]) || 0;
            const suffix = !isEdit && existing > 0 ? ` (Mevcut: ${formatTL(existing)})` : '';
            return `<option value="${escapeHtml(c.id)}" ${c.id === selectedCatId ? 'selected' : ''}>${escapeHtml(c.name + suffix)}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="catBudgetLimitInput">Aylık Kategori Limiti</label>
        <div class="input-group">
          <input
            id="catBudgetLimitInput"
            type="text"
            inputmode="decimal"
            class="input mono"
            value="${escapeHtml(formatEditableAmount(currentLimit || existingLimits[selectedCatId] || ''))}"
            placeholder="Örn: 5000"
            style="height:48px;font-size:1.125rem;font-weight:700;"
            required
          />
          <span class="input-group-addon">₺</span>
        </div>
      </div>

      <p id="catBudgetError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-gap" style="justify-content:flex-end;padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <button type="button" id="catBudgetCancelBtn" class="btn btn-secondary">İptal</button>
        <button type="submit" class="btn btn-primary">
          ${icon('check', 16)}
          <span>Kaydet</span>
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Kategori Hedefini Düzenle' : 'Kategori Harcama Hedefi Ekle',
    bodyHtml,
    width: '460px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#catBudgetForm');
      const selectEl = bodyEl.querySelector('#catBudgetSelect');
      const inputEl = bodyEl.querySelector('#catBudgetLimitInput');
      const errorEl = bodyEl.querySelector('#catBudgetError');

      if (!isEdit && selectEl && inputEl) {
        selectEl.addEventListener('change', () => {
          const cur = Number(existingLimits[selectEl.value]) || 0;
          inputEl.value = cur > 0 ? formatEditableAmount(cur) : '';
        });
      }

      bodyEl.querySelector('#catBudgetCancelBtn')?.addEventListener('click', closeFn);

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const targetCatId = isEdit ? selectedCatId : (selectEl?.value || selectedCatId);
        const amount = parseAmountInput(inputEl?.value || '');
        if (!Number.isFinite(amount) || amount <= 0) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen 0\'dan büyük geçerli bir limit girin.';
            errorEl.classList.remove('hidden');
          }
          inputEl?.focus();
          return;
        }
        setCategoryBudget(targetCatId, Math.round(amount * 100) / 100);
        closeFn();
        showToast('Kategori bütçe hedefi kaydedildi', { type: 'success' });
      });

      requestAnimationFrame(() => inputEl?.focus());
    },
  });
}

function openSavingsGoalModal(goal = null) {
  const isEdit = Boolean(goal && goal.id);
  let selectedColor = safeColor(goal?.color, CATEGORY_COLOR_OPTIONS[0]);

  const bodyHtml = `
    <form id="goalModalForm" class="stack-md" novalidate>
      <div class="field">
        <label class="field-label" for="goalTitleInput">Hedef Başlığı</label>
        <input
          id="goalTitleInput"
          type="text"
          class="input"
          maxlength="60"
          value="${escapeHtml(goal?.title || '')}"
          placeholder="Örn: Acil Durum Fonu, Tatil, MacBook"
          required
        />
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="goalTargetInput">Hedef Tutar</label>
          <div class="input-group">
            <input
              id="goalTargetInput"
              type="text"
              inputmode="decimal"
              class="input mono"
              value="${escapeHtml(goal ? formatEditableAmount(goal.targetAmount) : '')}"
              placeholder="50000"
              required
            />
            <span class="input-group-addon">₺</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="goalCurrentInput">Mevcut Birikim</label>
          <div class="input-group">
            <input
              id="goalCurrentInput"
              type="text"
              inputmode="decimal"
              class="input mono"
              value="${escapeHtml(goal && goal.currentAmount > 0 ? formatEditableAmount(goal.currentAmount) : '0')}"
              placeholder="0"
            />
            <span class="input-group-addon">₺</span>
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="goalDeadlineInput">Hedef Tarih (İsteğe bağlı)</label>
          <input
            id="goalDeadlineInput"
            type="date"
            class="input mono"
            value="${escapeHtml(goal?.deadline || '')}"
          />
        </div>

        <div class="field">
          <span class="field-label">Hedef Rengi</span>
          <div class="row-gap wrap" style="gap:8px;padding-top:6px;">
            ${CATEGORY_COLOR_OPTIONS.slice(0, 8).map((hex) => `
              <button
                type="button"
                class="color-swatch ${hex.toLowerCase() === selectedColor.toLowerCase() ? 'is-selected' : ''}"
                data-goal-color="${hex}"
                style="background-color:${hex};"
                aria-label="Renk ${hex}"
              ></button>
            `).join('')}
          </div>
        </div>
      </div>

      <p id="goalModalError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-gap" style="justify-content:flex-end;padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <button type="button" id="goalCancelBtn" class="btn btn-secondary">İptal</button>
        <button type="submit" class="btn btn-primary">
          ${icon('check', 16)}
          <span>${isEdit ? 'Güncelle' : 'Hedefi Oluştur'}</span>
        </button>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Birikim Hedefini Düzenle' : 'Yeni Birikim Hedefi Ekle',
    bodyHtml,
    width: '500px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#goalModalForm');
      const titleInput = bodyEl.querySelector('#goalTitleInput');
      const targetInput = bodyEl.querySelector('#goalTargetInput');
      const currentInput = bodyEl.querySelector('#goalCurrentInput');
      const deadlineInput = bodyEl.querySelector('#goalDeadlineInput');
      const errorEl = bodyEl.querySelector('#goalModalError');

      bodyEl.querySelectorAll('[data-goal-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedColor = btn.dataset.goalColor || CATEGORY_COLOR_OPTIONS[0];
          bodyEl.querySelectorAll('[data-goal-color]').forEach((b) => {
            b.classList.toggle('is-selected', b === btn);
          });
        });
      });

      bodyEl.querySelector('#goalCancelBtn')?.addEventListener('click', closeFn);

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const title = (titleInput?.value || '').trim();
        const targetAmount = parseAmountInput(targetInput?.value || '');
        const rawCur = (currentInput?.value || '').trim();
        const currentAmount = rawCur === '' ? 0 : parseAmountInput(rawCur);
        const deadline = (deadlineInput?.value || '').trim();

        if (!title) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen hedef için bir başlık girin.';
            errorEl.classList.remove('hidden');
          }
          titleInput?.focus();
          return;
        }
        if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
          if (errorEl) {
            errorEl.textContent = 'Hedef tutarı 0\'dan büyük olmalıdır.';
            errorEl.classList.remove('hidden');
          }
          targetInput?.focus();
          return;
        }
        if (!Number.isFinite(currentAmount) || currentAmount < 0) {
          if (errorEl) {
            errorEl.textContent = 'Mevcut birikim tutarı geçersiz.';
            errorEl.classList.remove('hidden');
          }
          currentInput?.focus();
          return;
        }
        if (deadline && !DATE_RE.test(deadline)) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen geçerli bir tarih girin.';
            errorEl.classList.remove('hidden');
          }
          deadlineInput?.focus();
          return;
        }

        const payload = {
          title,
          targetAmount: Math.round(targetAmount * 100) / 100,
          currentAmount: Math.round(currentAmount * 100) / 100,
          deadline,
          color: selectedColor,
        };

        if (isEdit) {
          updateSavingsGoal(goal.id, payload);
          closeFn();
          showToast('Birikim hedefi güncellendi', { type: 'success' });
        } else {
          addSavingsGoal(payload);
          closeFn();
          showToast('Yeni birikim hedefi oluşturuldu', { type: 'success' });
        }
      });

      requestAnimationFrame(() => titleInput?.focus());
    },
  });
}

function openContributeGoalModal(goal) {
  if (!goal) return;
  const remaining = Math.max(0, (Number(goal.targetAmount) || 0) - (Number(goal.currentAmount) || 0));

  const bodyHtml = `
    <form id="contributeGoalForm" class="stack-md" novalidate>
      <div style="padding:12px 14px;border-radius:var(--radius-md);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">${escapeHtml(goal.title)}</div>
        <div class="row-between" style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">
          <span>Mevcut: <strong class="mono">${escapeHtml(formatTL(goal.currentAmount))}</strong> / ${escapeHtml(formatTL(goal.targetAmount))}</span>
          <span>Kalan: <strong class="mono">${escapeHtml(formatTL(remaining))}</strong></span>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Hızlı Ekle</span>
        <div class="row-gap wrap" style="gap:var(--space-2);">
          ${[250, 500, 1000, 2500].map((amt) => `
            <button type="button" class="pill-btn mono" data-quick-contrib="${amt}">+${formatTL(amt)}</button>
          `).join('')}
          ${remaining > 0 ? `<button type="button" class="pill-btn mono" data-quick-contrib="${remaining}">Tamamla (${formatTL(remaining)})</button>` : ''}
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="contribAmountInput">Eklenecek Tutar</label>
        <div class="input-group">
          <input
            id="contribAmountInput"
            type="text"
            inputmode="decimal"
            class="input mono"
            placeholder="Örn: 500"
            style="height:48px;font-size:1.125rem;font-weight:700;"
            required
          />
          <span class="input-group-addon">₺</span>
        </div>
      </div>

      <p id="contribError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-gap" style="justify-content:flex-end;padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <button type="button" id="contribCancelBtn" class="btn btn-secondary">İptal</button>
        <button type="submit" class="btn btn-primary">
          ${icon('plus', 16)}
          <span>Birikime Ekle</span>
        </button>
      </div>
    </form>
  `;

  openModal({
    title: 'Hedefe Para Ekle',
    bodyHtml,
    width: '450px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#contributeGoalForm');
      const input = bodyEl.querySelector('#contribAmountInput');
      const errorEl = bodyEl.querySelector('#contribError');

      bodyEl.querySelectorAll('[data-quick-contrib]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = Number(btn.dataset.quickContrib);
          if (Number.isFinite(val) && val > 0 && input) {
            input.value = formatEditableAmount(val);
            errorEl?.classList.add('hidden');
          }
        });
      });

      bodyEl.querySelector('#contribCancelBtn')?.addEventListener('click', closeFn);

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const delta = parseAmountInput(input?.value || '');
        if (!Number.isFinite(delta) || delta <= 0) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen 0\'dan büyük geçerli bir tutar girin.';
            errorEl.classList.remove('hidden');
          }
          input?.focus();
          return;
        }
        contributeSavingsGoal(goal.id, Math.round(delta * 100) / 100);
        closeFn();
        showToast(`"${goal.title}" hedefine ${formatTL(delta)} eklendi`, { type: 'success' });
      });

      requestAnimationFrame(() => input?.focus());
    },
  });
}

// ============================================================================
// MAIN GOALS VIEW
// ============================================================================

export function renderGoals(rootEl, ctx = {}) {
  if (!rootEl) return;

  const state = getState();
  const ym = ctx?.ym || getSelectedMonth() || getCurrentMonthStr();
  const navigate = typeof ctx?.navigate === 'function' ? ctx.navigate : () => {};

  const summary = getMonthFinanceSummary(ym, state);
  const tereaMonth = getTereaMonthStats(ym, state);

  const overallLimit = summary.overallBudgetLimit;
  const totalSpent = summary.totalExpense;
  const overallPctRaw = overallLimit > 0 ? Math.round((totalSpent / overallLimit) * 100) : 0;
  const overallBarWidth = overallLimit > 0 ? Math.min(100, Math.max(0, overallPctRaw)) : 0;
  const overallTone = getProgressTone(overallPctRaw);
  const overallDiff = overallLimit - totalSpent;

  // Build category budget list (combining defined limits + spent breakdown)
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  categoryMap.set('terea', {
    id: 'terea',
    name: 'Terea Silver',
    type: 'expense',
    icon: 'flame',
    color: '#E11D48',
  });

  const spentByCat = new Map(summary.categoryBreakdown.map((b) => [b.categoryId, b.total]));
  const categoryLimits = state.budgets?.categoryLimits || {};

  const budgetedCats = Object.entries(categoryLimits)
    .filter(([, lim]) => Number(lim) > 0)
    .map(([catId, limit]) => {
      const meta = categoryMap.get(catId) || {
        id: catId,
        name: catId,
        icon: 'tag',
        color: '#64748B',
      };
      const spent = Number(spentByCat.get(catId)) || 0;
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return {
        categoryId: catId,
        name: meta.name,
        icon: meta.icon,
        color: safeColor(meta.color),
        limit: Number(limit),
        spent,
        remaining: Number(limit) - spent,
        pct,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // Smart suggestions: top categories with spending in `ym` that do not yet have a limit
  const unbudgetedTopCats = summary.categoryBreakdown
    .filter((b) => b.total > 0 && !(Number(categoryLimits[b.categoryId]) > 0))
    .slice(0, 3);

  const savingsGoals = Array.isArray(state.savingsGoals) ? state.savingsGoals : [];

  const categoryBudgetsHtml = budgetedCats.length > 0
    ? `
      <div class="grid-3 stagger">
        ${budgetedCats.map((item) => {
          const tone = getProgressTone(item.pct);
          const barW = Math.min(100, Math.max(0, item.pct));
          const badgeClass = tone === 'is-danger' ? 'badge-expense' : tone === 'is-warn' ? 'badge-warn' : 'badge-income';
          return `
            <article class="card card-interactive stack-md" style="gap:var(--space-3);">
              <div class="row-between" style="align-items:flex-start;">
                <div class="row-gap" style="min-width:0;gap:10px;">
                  <div
                    class="tx-icon"
                    style="width:38px;height:38px;color:${item.color};background-color:${hexToRgba(item.color, 0.14)};border-color:${hexToRgba(item.color, 0.28)};"
                  >
                    ${icon(item.icon, 17)}
                  </div>
                  <div style="min-width:0;">
                    <div class="card-title truncate" style="font-size:var(--text-sm);">${escapeHtml(item.name)}</div>
                    <div class="mono" style="font-size:var(--text-xs);color:var(--text-secondary);">
                      ${escapeHtml(formatTL(item.spent))} / ${escapeHtml(formatTL(item.limit))}
                    </div>
                  </div>
                </div>
                <span class="badge ${badgeClass} mono">%${item.pct}</span>
              </div>

              <div class="progress-track">
                <div class="progress-fill ${tone}" style="width:${barW}%;"></div>
              </div>

              <div class="row-between" style="gap:var(--space-2);">
                <span style="font-size:var(--text-xs);font-weight:600;color:${item.remaining >= 0 ? 'var(--text-secondary)' : 'var(--accent-expense)'};">
                  ${item.remaining >= 0
                    ? `Kalan: <strong class="mono">${escapeHtml(formatTL(item.remaining))}</strong>`
                    : `<strong class="mono">${escapeHtml(formatTL(Math.abs(item.remaining)))}</strong> aşıldı`
                  }
                </span>
                <div class="row-gap" style="gap:4px;">
                  <button
                    type="button"
                    class="icon-btn"
                    data-edit-cat-budget="${escapeHtml(item.categoryId)}"
                    aria-label="Limiti düzenle"
                    title="Düzenle"
                    style="width:30px;height:30px;"
                  >${icon('edit', 13)}</button>
                  <button
                    type="button"
                    class="icon-btn"
                    data-remove-cat-budget="${escapeHtml(item.categoryId)}"
                    aria-label="Limiti kaldır"
                    title="Kaldır"
                    style="width:30px;height:30px;color:var(--accent-expense);"
                  >${icon('trash', 13)}</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `
    : renderEmptyState({
        iconName: 'sliders',
        title: 'Kategori bütçe limiti tanımlanmadı',
        description: 'Market, Yeme-İçme veya Terea gibi kategoriler için aylık üst sınır belirleyerek harcamalarını kontrol altında tut.',
        actionHtml: '<button type="button" id="goalsEmptyAddCatBtn" class="btn btn-secondary btn-sm">+ Kategori Hedefi Ekle</button>',
      });

  const savingsGoalsHtml = savingsGoals.length > 0
    ? `
      <div class="grid-2 stagger">
        ${savingsGoals.map((goal) => {
          const target = Math.max(0, Number(goal.targetAmount) || 0);
          const current = Math.max(0, Number(goal.currentAmount) || 0);
          const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
          const remaining = Math.max(0, target - current);
          const col = safeColor(goal.color);
          const isCompleted = target > 0 && current >= target;
          const monthsLeft = goal.deadline ? getMonthsBetweenTodayAnd(goal.deadline) : null;
          const monthlyNeeded = monthsLeft && monthsLeft > 0 && remaining > 0
            ? Math.ceil(remaining / monthsLeft)
            : null;

          return `
            <article class="card card-interactive stack-md">
              <div class="row-between" style="align-items:flex-start;">
                <div class="row-gap" style="min-width:0;gap:10px;">
                  <div
                    class="tx-icon"
                    style="color:${col};background-color:${hexToRgba(col, 0.14)};border-color:${hexToRgba(col, 0.28)};"
                  >
                    ${icon(isCompleted ? 'check' : 'target', 18)}
                  </div>
                  <div style="min-width:0;">
                    <div class="card-title truncate">${escapeHtml(goal.title)}</div>
                    <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;">
                      ${goal.deadline
                        ? `Hedef Tarih: <strong class="mono">${escapeHtml(formatDateTR(goal.deadline))}</strong>`
                        : 'Süresiz birikim hedefi'
                      }
                    </div>
                  </div>
                </div>
                <span class="badge ${isCompleted ? 'badge-income' : 'badge-primary'} mono">%${pct}</span>
              </div>

              <div class="stack-sm">
                <div class="row-between" style="font-size:var(--text-xs);">
                  <span class="mono" style="font-weight:700;color:var(--text-primary);font-size:var(--text-sm);">
                    ${escapeHtml(formatTL(current))}
                  </span>
                  <span class="mono" style="color:var(--text-secondary);">
                    Hedef: ${escapeHtml(formatTL(target))}
                  </span>
                </div>
                <div class="progress-track" style="height:10px;">
                  <div
                    class="progress-fill"
                    style="width:${pct}%;background-color:${isCompleted ? 'var(--accent-income)' : col};"
                  ></div>
                </div>
                <div class="row-between wrap" style="font-size:var(--text-xs);color:var(--text-muted);">
                  <span>
                    ${isCompleted
                      ? '<strong style="color:var(--accent-income);">Hedef tamamlandı!</strong>'
                      : `Kalan: <strong class="mono" style="color:var(--text-secondary);">${escapeHtml(formatTL(remaining))}</strong>`
                    }
                  </span>
                  ${monthlyNeeded ? `<span>Aylık önerilen: <strong class="mono" style="color:var(--text-primary);">${escapeHtml(formatTL(monthlyNeeded))}</strong></span>` : ''}
                </div>
              </div>

              <div class="row-between wrap" style="padding-top:var(--space-2);border-top:1px solid var(--border-subtle);gap:var(--space-2);">
                <div class="row-gap wrap" style="gap:6px;">
                  <button type="button" class="btn btn-primary btn-sm" data-contrib-goal="${escapeHtml(goal.id)}">
                    ${icon('plus', 14)}
                    <span>Para Ekle</span>
                  </button>
                  <button type="button" class="pill-btn mono" data-fast-contrib="${escapeHtml(goal.id)}" data-fast-amt="250">+250</button>
                  <button type="button" class="pill-btn mono" data-fast-contrib="${escapeHtml(goal.id)}" data-fast-amt="500">+500</button>
                  <button type="button" class="pill-btn mono" data-fast-contrib="${escapeHtml(goal.id)}" data-fast-amt="1000">+1.000</button>
                </div>
                <div class="row-gap" style="gap:4px;">
                  <button
                    type="button"
                    class="icon-btn"
                    data-edit-goal="${escapeHtml(goal.id)}"
                    aria-label="Hedefi düzenle"
                    title="Düzenle"
                    style="width:32px;height:32px;"
                  >${icon('edit', 14)}</button>
                  <button
                    type="button"
                    class="icon-btn"
                    data-delete-goal="${escapeHtml(goal.id)}"
                    aria-label="Hedefi sil"
                    title="Sil"
                    style="width:32px;height:32px;color:var(--accent-expense);"
                  >${icon('trash', 14)}</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `
    : renderEmptyState({
        iconName: 'target',
        title: 'Henüz birikim hedefi eklenmedi',
        description: 'Acil durum fonu, tatil veya yeni bir ekipman için hedef tutar belirle; birikimlerini adım adım takip et.',
        actionHtml: '<button type="button" id="goalsEmptyAddSavingsBtn" class="btn btn-primary btn-sm">+ Tasarruf Hedefi Ekle</button>',
      });

  rootEl.innerHTML = `
    <div class="stack-lg anim-enter" data-goals-view="1">
      <!-- SECTION A: Overall Monthly Spending Cap -->
      <section class="card stack-md">
        <div class="row-between wrap">
          <div class="row-gap">
            <div class="tx-icon" style="color:var(--accent-primary);background:var(--accent-primary-soft);border-color:var(--accent-primary-border);">
              ${icon('wallet', 20)}
            </div>
            <div>
              <h2 class="card-title">Genel Aylık Harcama Hedefi</h2>
              <p class="card-subtitle">${escapeHtml(formatMonthLabel(ym))} toplam gider limiti (Terea dahil)</p>
            </div>
          </div>
          <button type="button" id="editOverallBudgetBtn" class="btn btn-secondary btn-sm">
            ${icon('edit', 14)}
            <span>${overallLimit > 0 ? 'Hedefi Düzenle' : 'Hedef Belirle'}</span>
          </button>
        </div>

        ${overallLimit > 0 ? `
          <div class="stack-sm">
            <div class="row-between wrap" style="gap:var(--space-2);">
              <div class="mono" style="font-size:var(--text-lg);font-weight:700;color:var(--text-primary);">
                ${escapeHtml(formatTL(totalSpent))}
                <span style="font-size:var(--text-sm);font-weight:500;color:var(--text-secondary);"> / ${escapeHtml(formatTL(overallLimit))}</span>
              </div>
              <span class="badge ${overallTone === 'is-danger' ? 'badge-expense' : overallTone === 'is-warn' ? 'badge-warn' : 'badge-income'} mono">
                %${overallPctRaw} kullanıldı
              </span>
            </div>

            <div class="progress-track" style="height:12px;">
              <div class="progress-fill ${overallTone}" style="width:${overallBarWidth}%;"></div>
            </div>

            <div class="row-between wrap" style="font-size:var(--text-xs);">
              <span style="color:${overallDiff >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'};font-weight:600;">
                ${overallDiff >= 0
                  ? `Aylık limitin içinde: ${escapeHtml(formatTL(overallDiff))} harcama alanın var.`
                  : `Dikkat: Aylık genel limit ${escapeHtml(formatTL(Math.abs(overallDiff)))} aşıldı!`
                }
              </span>
              <span style="color:var(--text-muted);">
                ${overallTone === 'is-danger' ? 'Aşım uyarısı' : overallTone === 'is-warn' ? 'Sınıra yaklaşıldı' : 'Sağlıklı ilerleme'}
              </span>
            </div>
          </div>
        ` : `
          <div class="row-between wrap" style="padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);background:var(--bg-surface-2);border:1px solid var(--border-subtle);">
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">
              Bu ay şu ana kadar <strong class="mono" style="color:var(--text-primary);">${escapeHtml(formatTL(totalSpent))}</strong> harcadın. Aylık genel bir tavan belirleyerek aşım uyarıları alabilirsin.
            </div>
            <button type="button" id="setOverallInlineBtn" class="btn btn-primary btn-sm">Limit Belirle</button>
          </div>
        `}
      </section>

      <!-- SECTION B: Category Budgets -->
      <section class="stack-md">
        <div class="row-between wrap">
          <div>
            <h2 class="card-title">Kategori Bazlı Harcama Hedefleri</h2>
            <p class="card-subtitle">${escapeHtml(formatMonthLabel(ym))} dönemi için kategori limitleri ve gerçekleşen harcamalar</p>
          </div>
          <button type="button" id="addCatBudgetBtn" class="btn btn-primary btn-sm">
            ${icon('plus', 15)}
            <span>Kategori Hedefi Ekle</span>
          </button>
        </div>

        ${categoryBudgetsHtml}

        ${unbudgetedTopCats.length > 0 ? `
          <div class="card" style="padding:var(--space-3) var(--space-4);background:var(--bg-surface-2);">
            <div class="row-between wrap" style="gap:var(--space-3);">
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">
                <strong style="color:var(--text-primary);">Öneri:</strong>
                Bu ay limitsiz harcama yapılan kategoriler için hızlı hedef tanımlayabilirsin:
              </div>
              <div class="row-gap wrap" style="gap:var(--space-2);">
                ${unbudgetedTopCats.map((b) => `
                  <button
                    type="button"
                    class="pill-btn"
                    data-suggest-cat="${escapeHtml(b.categoryId)}"
                    data-suggest-spent="${Math.ceil(b.total)}"
                  >
                    <span>${escapeHtml(b.name)} (${escapeHtml(formatTL(b.total))})</span>
                    <span style="color:var(--accent-primary);font-weight:700;">• Hedef Belirle</span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}
      </section>

      <!-- SECTION C: Savings Goals -->
      <section class="stack-md">
        <div class="row-between wrap">
          <div>
            <h2 class="card-title">Birikim &amp; Tasarruf Hedefleri</h2>
            <p class="card-subtitle">Orta ve uzun vadeli finansal hedeflerin için birikim ilerlemesi</p>
          </div>
          <button type="button" id="addSavingsGoalBtn" class="btn btn-primary btn-sm">
            ${icon('plus', 15)}
            <span>Tasarruf Hedefi Ekle</span>
          </button>
        </div>

        ${savingsGoalsHtml}

        <!-- Terea Savings Motivation Strip -->
        <div class="banner-cta" style="padding:var(--space-4) var(--space-5);border-color:var(--accent-income-border);">
          <div class="row-gap" style="gap:var(--space-3);">
            <div class="tx-icon" style="color:var(--accent-income);background:var(--accent-income-soft);border-color:var(--accent-income-border);">
              ${icon('flame', 19)}
            </div>
            <div>
              <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">
                ${tereaMonth.totalSavedVsBaseline > 0
                  ? `Bu ay Terea'yı azaltarak ${escapeHtml(formatTL(tereaMonth.totalSavedVsBaseline))} tasarruf ettin!`
                  : 'Terea azaltımı ile birikim hedeflerini hızlandır'
                }
              </div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">
                ${tereaMonth.trackedDays > 0
                  ? `${escapeHtml(formatMonthLabel(ym))} içinde ${tereaMonth.trackedDays} günde ${tereaMonth.totalSticks} dal tüketildi. Bu tasarrufu birikim hedeflerine aktarabilirsin.`
                  : 'Günlük Terea tüketimini takip ederek eski alışkanlığına kıyasla ne kadar tasarruf ettiğini anlık gör.'
                }
              </div>
            </div>
          </div>
          <button type="button" id="goalsGoTereaBtn" class="btn btn-success btn-sm">
            <span>Terea Takip'e Git</span>
          </button>
        </div>
      </section>
    </div>
  `;

  // Bind Section A events
  rootEl.querySelector('#editOverallBudgetBtn')?.addEventListener('click', () => openOverallBudgetModal(overallLimit));
  rootEl.querySelector('#setOverallInlineBtn')?.addEventListener('click', () => openOverallBudgetModal(overallLimit));

  // Bind Section B events
  rootEl.querySelector('#addCatBudgetBtn')?.addEventListener('click', () => openCategoryBudgetModal());
  rootEl.querySelector('#goalsEmptyAddCatBtn')?.addEventListener('click', () => openCategoryBudgetModal());

  rootEl.querySelectorAll('[data-edit-cat-budget]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.editCatBudget;
      openCategoryBudgetModal({
        categoryId: catId,
        currentLimit: Number(categoryLimits[catId]) || 0,
      });
    });
  });

  rootEl.querySelectorAll('[data-remove-cat-budget]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.removeCatBudget;
      if (removeCategoryBudget(catId)) {
        showToast('Kategori limiti kaldırıldı', { type: 'warn' });
      }
    });
  });

  rootEl.querySelectorAll('[data-suggest-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.suggestCat;
      const spentGuess = Number(btn.dataset.suggestSpent) || 0;
      const suggestedLimit = spentGuess > 0 ? Math.ceil((spentGuess * 1.15) / 100) * 100 : 0;
      openCategoryBudgetModal({ categoryId: catId, currentLimit: suggestedLimit });
    });
  });

  // Bind Section C events
  rootEl.querySelector('#addSavingsGoalBtn')?.addEventListener('click', () => openSavingsGoalModal(null));
  rootEl.querySelector('#goalsEmptyAddSavingsBtn')?.addEventListener('click', () => openSavingsGoalModal(null));
  rootEl.querySelector('#goalsGoTereaBtn')?.addEventListener('click', () => navigate('terea'));

  const goalById = new Map(savingsGoals.map((g) => [g.id, g]));

  rootEl.querySelectorAll('[data-contrib-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = goalById.get(btn.dataset.contribGoal);
      if (found) openContributeGoalModal(found);
    });
  });

  rootEl.querySelectorAll('[data-fast-contrib]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.fastContrib;
      const amt = Number(btn.dataset.fastAmt) || 0;
      const found = goalById.get(goalId);
      if (found && amt > 0) {
        contributeSavingsGoal(goalId, amt);
        showToast(`"${found.title}" hedefine +${formatTL(amt)} eklendi`, { type: 'success' });
      }
    });
  });

  rootEl.querySelectorAll('[data-edit-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = goalById.get(btn.dataset.editGoal);
      if (found) openSavingsGoalModal(found);
    });
  });

  rootEl.querySelectorAll('[data-delete-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.deleteGoal;
      if (deleteSavingsGoal(goalId)) {
        showToast('Birikim hedefi silindi', { type: 'warn' });
      }
    });
  });
}
