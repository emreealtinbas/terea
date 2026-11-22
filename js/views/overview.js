/**
 * js/views/overview.js
 * Aylık Finans Özeti — 4 KPI Kartı, Günlük Akış & Nakit Dengesi Grafikleri,
 * Tıklanabilir Kategori Donut Grafiği, Akıllı Öngörüler, Terea Özeti,
 * Son İşlemler ve Hızlı Dışa Aktarma
 */

import {
  getState,
  getSelectedMonth,
  getLocalDateStr,
  getCurrentMonthStr,
  getMonthDays,
  updateProfile,
  getMonthFinanceSummary,
  getTereaDayStats,
  getTereaMonthStats,
} from '../state.js';

import {
  escapeHtml,
  formatTL,
  formatMonthLabel,
  formatDateTR,
  getPaymentMethodLabel,
  icon,
  animateValue,
  openModal,
  showToast,
  renderEmptyState,
} from '../ui.js';

import {
  renderMonthlyDailyChart,
  renderIncomeVsExpenseChart,
  renderCategoryDonutChart,
} from '../charts.js';

import {
  exportTransactionsCSV,
  openPrintableReport,
} from '../export.js';

import { openTransactionModal } from './transactions.js';

let analyticsSubTab = 'daily'; // 'daily' | 'cashflow'

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

function openQuickIncomeModal(currentIncome = 0, currentPayday = 1) {
  const formattedVal = currentIncome > 0
    ? (Number.isInteger(currentIncome) ? String(currentIncome) : String(currentIncome).replace('.', ','))
    : '';

  const bodyHtml = `
    <form id="quickIncomeForm" class="stack-md" novalidate>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">
        Aylık net sabit gelirini girdiğinde, kalan bakiye ve günlük güvenli harcama tutarın her ay otomatik hesaplanır.
      </p>

      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="quickIncomeInput">Aylık Sabit Gelir</label>
          <div class="input-group">
            <input
              id="quickIncomeInput"
              type="text"
              inputmode="decimal"
              class="input mono"
              value="${escapeHtml(formattedVal)}"
              placeholder="Örn: 45000"
              style="height:48px;font-size:1.125rem;font-weight:700;"
              required
            />
            <span class="input-group-addon">₺</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="quickPaydayInput">Maaş Günü (1-31)</label>
          <input
            id="quickPaydayInput"
            type="number"
            min="1"
            max="31"
            class="input mono"
            value="${escapeHtml(String(currentPayday || 1))}"
            style="height:48px;"
          />
        </div>
      </div>

      <p id="quickIncomeError" class="hidden" style="font-size:var(--text-xs);color:var(--accent-expense);font-weight:600;"></p>

      <div class="row-gap" style="justify-content:flex-end;padding-top:var(--space-3);border-top:1px solid var(--border-subtle);">
        <button type="button" id="quickIncomeCancelBtn" class="btn btn-secondary">İptal</button>
        <button type="submit" class="btn btn-primary">
          ${icon('check', 16)}
          <span>Geliri Kaydet</span>
        </button>
      </div>
    </form>
  `;

  openModal({
    title: 'Aylık Sabit Geliri Tanımla',
    bodyHtml,
    width: '460px',
    onMount: (bodyEl, closeFn) => {
      const form = bodyEl.querySelector('#quickIncomeForm');
      const incomeInput = bodyEl.querySelector('#quickIncomeInput');
      const paydayInput = bodyEl.querySelector('#quickPaydayInput');
      const errorEl = bodyEl.querySelector('#quickIncomeError');

      bodyEl.querySelector('#quickIncomeCancelBtn')?.addEventListener('click', closeFn);

      form?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const val = parseAmountInput(incomeInput?.value || '');
        if (!Number.isFinite(val) || val <= 0) {
          if (errorEl) {
            errorEl.textContent = 'Lütfen 0\'dan büyük geçerli bir gelir tutarı girin.';
            errorEl.classList.remove('hidden');
          }
          incomeInput?.focus();
          return;
        }
        const payday = Math.min(31, Math.max(1, Math.floor(Number(paydayInput?.value) || 1)));
        updateProfile({
          monthlyFixedIncome: Math.round(val * 100) / 100,
          incomePayday: payday,
        });
        closeFn();
        showToast('Aylık sabit gelir güncellendi', { type: 'success' });
      });

      requestAnimationFrame(() => incomeInput?.focus());
    },
  });
}

export function renderOverview(rootEl, ctx = {}) {
  if (!rootEl) return;

  const state = getState();
  const ym = ctx?.ym || getSelectedMonth() || getCurrentMonthStr();
  const currentYm = getCurrentMonthStr();
  const navigate = typeof ctx?.navigate === 'function' ? ctx.navigate : () => {};
  const openQuickAdd = typeof ctx?.openQuickAdd === 'function'
    ? ctx.openQuickAdd
    : (opts) => openTransactionModal(opts);

  const summary = getMonthFinanceSummary(ym, state);
  const todayStr = getLocalDateStr();
  const tereaToday = getTereaDayStats(todayStr, state);
  const tereaMonth = getTereaMonthStats(ym, state);
  const includeTerea = Boolean(state.terea?.settings?.includeInFinance);

  const monthDays = getMonthDays(ym);
  const todayDayNum = new Date().getDate();
  const isCurrentMonth = ym === currentYm;
  const remainingDays = isCurrentMonth
    ? Math.max(1, monthDays.length - todayDayNum + 1)
    : monthDays.length;

  // Determine 4th KPI mode: Overall monthly limit if set, otherwise Günlük Güvenli Harcama
  const hasOverallLimit = summary.overallBudgetLimit > 0;
  const overallRemaining = summary.overallBudgetLimit - summary.totalExpense;
  const dailySafeBudgetCap = hasOverallLimit
    ? Math.max(0, overallRemaining) / remainingDays
    : summary.dailySafeSpend;

  // MoM trend badge for Toplam Harcama
  let momTrendHtml = '<span class="kpi-trend is-neutral">Önceki ay yok</span>';
  if (summary.momChangePct !== null) {
    if (summary.momChangePct > 0) {
      momTrendHtml = `<span class="kpi-trend is-down">+%${summary.momChangePct} geçen aya göre</span>`;
    } else if (summary.momChangePct < 0) {
      momTrendHtml = `<span class="kpi-trend is-up">-%${Math.abs(summary.momChangePct)} tasarruf</span>`;
    } else {
      momTrendHtml = '<span class="kpi-trend is-neutral">%0 değişim</span>';
    }
  }

  // Recent 6 transactions for selected month
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const monthPrefix = `${ym}-`;
  const monthTransactions = (Array.isArray(state.transactions) ? state.transactions : [])
    .filter((tx) => tx && typeof tx.dateStr === 'string' && tx.dateStr.startsWith(monthPrefix))
    .sort((a, b) => {
      const dCmp = String(b.dateStr).localeCompare(String(a.dateStr));
      if (dCmp !== 0) return dCmp;
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    });
  const recentTxs = monthTransactions.slice(0, 6);

  const renderRecentTxHtml = () => {
    if (recentTxs.length === 0) {
      return renderEmptyState({
        iconName: 'wallet',
        title: `${formatMonthLabel(ym)} için işlem yok`,
        description: 'İlk gelir veya giderini ekleyerek nakit akışını canlı takip et.',
        actionHtml: '<button type="button" id="ovEmptyAddTxBtn" class="btn btn-primary btn-sm">+ İşlem Ekle</button>',
      });
    }

    return `
      <div class="tx-list">
        ${recentTxs.map((tx) => {
          const cat = categoryMap.get(tx.categoryId) || {
            name: tx.type === 'income' ? 'Diğer Gelir' : 'Diğer Gider',
            icon: 'tag',
            color: '#64748B',
          };
          const col = safeColor(cat.color);
          const isIncome = tx.type === 'income';
          const amountText = isIncome
            ? formatTL(tx.amount, { showSign: true })
            : formatTL(-Math.abs(tx.amount));
          return `
            <button
              type="button"
              class="tx-row"
              data-ov-edit-tx="${escapeHtml(tx.id)}"
              style="width:100%;text-align:left;"
            >
              <div
                class="tx-icon"
                style="color:${col};background-color:${hexToRgba(col, 0.14)};border-color:${hexToRgba(col, 0.28)};"
              >
                ${icon(cat.icon, 17)}
              </div>
              <div class="tx-info">
                <div class="tx-title">${escapeHtml(tx.note || cat.name)}</div>
                <div class="tx-meta">
                  <span>${escapeHtml(cat.name)}</span>
                  <span>•</span>
                  <span>${escapeHtml(formatDateTR(tx.dateStr, { relative: true }))}</span>
                  <span>•</span>
                  <span>${escapeHtml(getPaymentMethodLabel(tx.paymentMethod))}</span>
                </div>
              </div>
              <div class="tx-right">
                <span class="tx-amount ${isIncome ? 'is-income' : 'is-expense'}">${escapeHtml(amountText)}</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  };

  const insightsHtml = summary.insights.length > 0
    ? `
      <ul class="insight-list">
        ${summary.insights.map((ins) => {
          const tone = ['good', 'warn', 'danger', 'info'].includes(ins.tone) ? ins.tone : 'info';
          return `
            <li class="insight-item">
              <span class="insight-dot is-${tone}" aria-hidden="true"></span>
              <div>
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:2px;">${escapeHtml(ins.title)}</div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);">${escapeHtml(ins.detail)}</div>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `
    : renderEmptyState({
        iconName: 'sparkles',
        title: 'Öngörü hazırlanıyor',
        description: 'Harcama ve gelir verilerin biriktikçe kişisel öneriler burada görünür.',
      });

  const fixedIncomeVal = Number(state.profile?.monthlyFixedIncome) || 0;
  const needsIncomeBanner = fixedIncomeVal <= 0;

  // Baseline vs burned calculation for Terea strip
  const tereaSaved = tereaMonth.totalSavedVsBaseline;
  const tereaBurned = tereaMonth.totalBurned;

  const fourthKpiTitle = hasOverallLimit
    ? 'Aylık Bütçe Kalanı'
    : 'Günlük Güvenli Harcama';
  const fourthKpiTargetValue = hasOverallLimit ? overallRemaining : summary.dailySafeSpend;
  const fourthKpiColorClass = hasOverallLimit
    ? (overallRemaining < 0 ? 'is-expense' : overallRemaining < summary.overallBudgetLimit * 0.2 ? '' : 'is-primary')
    : 'is-primary';
  const fourthKpiMeta = hasOverallLimit
    ? `<span>Limit: <strong class="mono">${escapeHtml(formatTL(summary.overallBudgetLimit))}</strong> (%${summary.overallBudgetPct})</span><span>${isCurrentMonth ? `${remainingDays} gün kaldı` : `${monthDays.length} gün`}</span>`
    : `<span>${isCurrentMonth ? `Kalan ${remainingDays} gün için` : `${monthDays.length} günlük ortalama`}</span><span>Net bakiye bazlı</span>`;

  rootEl.innerHTML = `
    <div class="stack-lg anim-enter" data-overview-view="1">
      ${needsIncomeBanner ? `
        <div class="banner-cta">
          <div class="row-gap" style="gap:var(--space-3);">
            <div class="tx-icon" style="color:var(--accent-income);background:var(--accent-income-soft);border-color:var(--accent-income-border);">
              ${icon('wallet', 20)}
            </div>
            <div>
              <div style="font-size:var(--text-md);font-weight:700;color:var(--text-primary);">Aylık sabit gelirini ekle</div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">
                Maaş veya düzenli gelirini girdiğinde net bakiye ve günlük güvenli harcama limiti otomatik hesaplanır.
              </div>
            </div>
          </div>
          <div class="row-gap wrap" style="gap:var(--space-2);">
            <button type="button" id="ovQuickIncomeBtn" class="btn btn-primary btn-sm">
              ${icon('plus', 15)}
              <span>Hızlı Gelir Gir</span>
            </button>
            <button type="button" id="ovGoSettingsIncomeBtn" class="btn btn-secondary btn-sm">
              ${icon('settings', 15)}
              <span>Ayarlar</span>
            </button>
          </div>
        </div>
      ` : ''}

      <!-- 4 KPI Cards -->
      <section class="grid-kpi stagger" aria-label="Aylık temel finans göstergeleri">
        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Toplam Gelir</span>
            <span style="color:var(--accent-income);display:inline-flex;">${icon('trending', 15)}</span>
          </div>
          <div id="kpiTotalIncome" class="kpi-value is-income">${escapeHtml(formatTL(summary.totalIncome))}</div>
          <div class="kpi-meta">
            <span>Sabit: <strong class="mono">${escapeHtml(formatTL(summary.fixedIncome))}</strong></span>
            <span>Ek: <strong class="mono">${escapeHtml(formatTL(summary.extraIncome))}</strong></span>
          </div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Toplam Harcama</span>
            <span style="color:var(--accent-expense);display:inline-flex;">${icon('arrowDown', 15)}</span>
          </div>
          <div id="kpiTotalExpense" class="kpi-value is-expense">${escapeHtml(formatTL(summary.totalExpense))}</div>
          <div class="kpi-meta">
            ${momTrendHtml}
            ${includeTerea && summary.tereaExpense > 0
              ? `<span title="Terea gideri toplam harcamaya dahildir">Terea dahil (${escapeHtml(formatTL(summary.tereaExpense))})</span>`
              : `<span>${monthTransactions.filter((t) => t.type !== 'income').length} gider işlemi</span>`
            }
          </div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Net Kalan Bakiye</span>
            <span style="color:${summary.netBalance >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'};display:inline-flex;">
              ${icon('wallet', 15)}
            </span>
          </div>
          <div id="kpiNetBalance" class="kpi-value ${summary.netBalance >= 0 ? 'is-income' : 'is-expense'}">
            ${escapeHtml(formatTL(summary.netBalance, { showSign: summary.netBalance > 0 }))}
          </div>
          <div class="kpi-meta">
            <span class="badge ${summary.savingsRate >= 20 ? 'badge-income' : summary.savingsRate > 0 ? 'badge-primary' : 'badge-warn'} mono">
              Tasarruf Oranı: %${summary.savingsRate}
            </span>
          </div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>${escapeHtml(fourthKpiTitle)}</span>
            <span style="color:var(--accent-primary);display:inline-flex;">${icon('target', 15)}</span>
          </div>
          <div id="kpiDailySafe" class="kpi-value ${fourthKpiColorClass}">
            ${escapeHtml(formatTL(fourthKpiTargetValue))}
          </div>
          <div class="kpi-meta">
            ${fourthKpiMeta}
          </div>
        </article>
      </section>

      <!-- Visual Analytics Row -->
      <section class="grid-asymmetric">
        <article class="card stack-md">
          <div class="row-between wrap">
            <div>
              <h2 class="card-title" id="ovAnalyticsTitle">
                ${analyticsSubTab === 'daily' ? 'Günlük Harcama Akışı' : 'Gelir / Gider Dengesi'}
              </h2>
              <p class="card-subtitle" id="ovAnalyticsSub">
                ${analyticsSubTab === 'daily'
                  ? `${escapeHtml(formatMonthLabel(ym))} günlük harcama sütunları`
                  : `${escapeHtml(formatMonthLabel(ym))} sabit/ek gelir ve Terea dahil gider kırılımı`
                }
              </p>
            </div>
            <div class="segmented" role="tablist" aria-label="Analiz grafiği seçimi">
              <button
                type="button"
                class="segmented-btn ${analyticsSubTab === 'daily' ? 'is-active' : ''}"
                data-ov-chart-tab="daily"
                role="tab"
                aria-selected="${analyticsSubTab === 'daily' ? 'true' : 'false'}"
              >Günlük Akış</button>
              <button
                type="button"
                class="segmented-btn ${analyticsSubTab === 'cashflow' ? 'is-active' : ''}"
                data-ov-chart-tab="cashflow"
                role="tab"
                aria-selected="${analyticsSubTab === 'cashflow' ? 'true' : 'false'}"
              >Gelir / Gider</button>
            </div>
          </div>

          <div id="ovMainChartContainer"></div>
        </article>

        <article class="card stack-md">
          <div class="card-header" style="margin-bottom:0;">
            <div>
              <h2 class="card-title">Kategori Dağılımı</h2>
              <p class="card-subtitle">Detayları görmek için bir kategoriye tıkla</p>
            </div>
            <button type="button" id="ovGoGoalsBtn" class="btn btn-ghost btn-sm">
              <span>Limitler</span>
              ${icon('chevronRight', 14)}
            </button>
          </div>
          <div id="ovDonutContainer"></div>
        </article>
      </section>

      <!-- Secondary Row: Insights + Recent Transactions -->
      <section class="grid-2">
        <article class="card stack-md">
          <div class="card-header" style="margin-bottom:0;">
            <div>
              <h2 class="card-title">Akıllı Finansal Öngörüler</h2>
              <p class="card-subtitle">${escapeHtml(formatMonthLabel(ym))} bütçe ve tüketim analizi</p>
            </div>
            <span class="badge badge-primary">${summary.insights.length} öngörü</span>
          </div>

          ${insightsHtml}

          <!-- Compact Terea Financial Impact Strip -->
          <div
            class="row-between wrap"
            style="padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);background:var(--bg-surface-2);border:1px solid var(--border-subtle);gap:var(--space-3);margin-top:auto;"
          >
            <div class="row-gap" style="gap:var(--space-3);min-width:0;">
              <div class="tx-icon" style="width:36px;height:36px;color:#E11D48;background:rgba(225,29,72,0.14);border-color:rgba(225,29,72,0.28);">
                ${icon('flame', 17)}
              </div>
              <div style="min-width:0;">
                <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-primary);">
                  Terea Finansal Etkisi • Bugün <span class="mono">${tereaToday.count} dal</span>
                </div>
                <div style="font-size:var(--text-xs);color:var(--text-secondary);">
                  Bu ay yakılan: <strong class="mono" style="color:var(--accent-expense);">${escapeHtml(formatTL(tereaBurned))}</strong>
                  • Kurtarılan: <strong class="mono" style="color:var(--accent-income);">${escapeHtml(formatTL(tereaSaved))}</strong>
                </div>
              </div>
            </div>
            <button type="button" id="ovGoTereaBtn" class="btn btn-secondary btn-sm">
              <span>Terea Takip'e Git</span>
            </button>
          </div>
        </article>

        <article class="card stack-md">
          <div class="row-between wrap">
            <div>
              <h2 class="card-title">Son İşlemler</h2>
              <p class="card-subtitle">${escapeHtml(formatMonthLabel(ym))} dönemindeki en son kayıtlar</p>
            </div>
            <div class="row-gap" style="gap:var(--space-2);">
              <button type="button" id="ovAddTxBtn" class="btn btn-primary btn-sm">
                ${icon('plus', 14)}
                <span>Yeni İşlem</span>
              </button>
              <button type="button" id="ovViewAllTxBtn" class="btn btn-ghost btn-sm">
                <span>Tümünü Gör</span>
                ${icon('chevronRight', 14)}
              </button>
            </div>
          </div>

          ${renderRecentTxHtml()}
        </article>
      </section>

      <!-- Quick Export Strip -->
      <section class="banner-cta" style="padding:var(--space-3) var(--space-5);">
        <div class="row-gap" style="gap:var(--space-3);">
          <div class="tx-icon" style="width:36px;height:36px;color:var(--accent-primary);background:var(--accent-primary-soft);border-color:var(--accent-primary-border);">
            ${icon('download', 17)}
          </div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);">Hızlı Dışa Aktarma</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">
              ${escapeHtml(formatMonthLabel(ym))} dönemini Türkçe Excel uyumlu CSV veya yazdırılabilir PDF raporu olarak al.
            </div>
          </div>
        </div>
        <div class="row-gap wrap" style="gap:var(--space-2);">
          <button type="button" id="ovExportCsvBtn" class="btn btn-secondary btn-sm">
            ${icon('download', 15)}
            <span>Bu Ayı CSV İndir</span>
          </button>
          <button type="button" id="ovPrintReportBtn" class="btn btn-secondary btn-sm">
            ${icon('print', 15)}
            <span>Aylık Rapor Yazdır / PDF</span>
          </button>
        </div>
      </section>
    </div>
  `;

  // Animate KPI values smoothly
  animateValue(rootEl.querySelector('#kpiTotalIncome'), summary.totalIncome, {
    formatter: (v) => formatTL(v),
  });
  animateValue(rootEl.querySelector('#kpiTotalExpense'), summary.totalExpense, {
    formatter: (v) => formatTL(v),
  });
  animateValue(rootEl.querySelector('#kpiNetBalance'), summary.netBalance, {
    formatter: (v) => formatTL(v, { showSign: v > 0 }),
  });
  animateValue(rootEl.querySelector('#kpiDailySafe'), fourthKpiTargetValue, {
    formatter: (v) => formatTL(v),
  });

  // Render Analytics Left Chart (Günlük Akış / Gelir-Gider)
  const mainChartEl = rootEl.querySelector('#ovMainChartContainer');
  const chartTitleEl = rootEl.querySelector('#ovAnalyticsTitle');
  const chartSubEl = rootEl.querySelector('#ovAnalyticsSub');

  const drawLeftAnalyticsChart = () => {
    if (!mainChartEl) return;
    if (analyticsSubTab === 'cashflow') {
      if (chartTitleEl) chartTitleEl.textContent = 'Gelir / Gider Dengesi';
      if (chartSubEl) {
        chartSubEl.textContent = `${formatMonthLabel(ym)} sabit/ek gelir ve Terea dahil gider kırılımı`;
      }
      renderIncomeVsExpenseChart(mainChartEl, {
        fixedIncome: summary.fixedIncome,
        extraIncome: summary.extraIncome,
        regularExpense: summary.expenseTransactionsTotal,
        tereaExpense: summary.tereaExpense,
      });
    } else {
      if (chartTitleEl) chartTitleEl.textContent = 'Günlük Harcama Akışı';
      if (chartSubEl) {
        chartSubEl.textContent = `${formatMonthLabel(ym)} günlük harcama sütunları`;
      }
      renderMonthlyDailyChart(mainChartEl, summary.dailyExpenses, {
        dailyBudgetLine: dailySafeBudgetCap > 0 ? Math.round(dailySafeBudgetCap) : 0,
      });
    }
  };

  drawLeftAnalyticsChart();

  rootEl.querySelectorAll('[data-ov-chart-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.ovChartTab === 'cashflow' ? 'cashflow' : 'daily';
      if (nextTab === analyticsSubTab) return;
      analyticsSubTab = nextTab;
      rootEl.querySelectorAll('[data-ov-chart-tab]').forEach((b) => {
        const active = b.dataset.ovChartTab === analyticsSubTab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      drawLeftAnalyticsChart();
    });
  });

  // Render Category Donut Chart with drill-down navigation
  const donutEl = rootEl.querySelector('#ovDonutContainer');
  renderCategoryDonutChart(donutEl, summary.categoryBreakdown, {
    totalExpense: summary.totalExpense,
    onSelectCategory: (categoryId) => {
      navigate('transactions', { categoryId });
    },
  });

  // Bind banner & action events
  rootEl.querySelector('#ovQuickIncomeBtn')?.addEventListener('click', () => {
    openQuickIncomeModal(
      Number(state.profile?.monthlyFixedIncome) || 0,
      Number(state.profile?.incomePayday) || 1
    );
  });
  rootEl.querySelector('#ovGoSettingsIncomeBtn')?.addEventListener('click', () => navigate('settings'));
  rootEl.querySelector('#ovGoGoalsBtn')?.addEventListener('click', () => navigate('goals'));
  rootEl.querySelector('#ovGoTereaBtn')?.addEventListener('click', () => navigate('terea'));
  rootEl.querySelector('#ovAddTxBtn')?.addEventListener('click', () => openQuickAdd({}));
  rootEl.querySelector('#ovEmptyAddTxBtn')?.addEventListener('click', () => openQuickAdd({}));
  rootEl.querySelector('#ovViewAllTxBtn')?.addEventListener('click', () => navigate('transactions'));

  const txMap = new Map(recentTxs.map((t) => [t.id, t]));
  rootEl.querySelectorAll('[data-ov-edit-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = txMap.get(btn.dataset.ovEditTx);
      if (found) openTransactionModal({ tx: found });
    });
  });

  rootEl.querySelector('#ovExportCsvBtn')?.addEventListener('click', () => {
    const res = exportTransactionsCSV({ scope: 'month', ym });
    if (res?.ok) {
      showToast(`${res.filename} indirildi (${res.rowCount} kayıt)`, { type: 'success' });
    }
  });

  rootEl.querySelector('#ovPrintReportBtn')?.addEventListener('click', () => {
    openPrintableReport(ym);
  });
}
