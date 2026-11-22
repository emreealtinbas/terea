/**
 * Zero-dependency Interactive SVG Charting Library — Bütçe & Terea
 * Responsive viewBoxes, tabular numerals, animated entrances, keyboard focus,
 * and floating viewport-clamped hover tooltips (#chartTooltip).
 */

import {
  escapeHtml,
  formatTL,
  formatCompactTL,
  formatShortDateTR,
  renderEmptyState,
  CATEGORY_COLOR_OPTIONS,
} from './ui.js';

const COLOR_MINT = '#28B982';
const COLOR_TEAL = '#14B8A6';
const COLOR_AMBER = '#F59E0B';
const COLOR_CORAL = '#E14D67';

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

const TR_FULL_MONTHS = [
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

/* ==========================================================================
   INTERNAL TOOLTIP HELPERS (#chartTooltip)
   ========================================================================== */

function getTooltipEl() {
  return document.getElementById('chartTooltip');
}

function clampTooltipPosition(clientX, clientY, tooltipEl) {
  const pad = 12;
  const offset = 14;
  const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
  const vh = window.innerHeight || document.documentElement.clientHeight || 768;

  const rect = tooltipEl.getBoundingClientRect();
  const width = rect.width || 180;
  const height = rect.height || 64;

  let left = clientX + offset;
  let top = clientY - height - offset;

  if (left + width + pad > vw) {
    left = clientX - width - offset;
  }
  if (left < pad) {
    left = pad;
  }
  if (left + width + pad > vw) {
    left = Math.max(pad, vw - width - pad);
  }

  if (top < pad) {
    top = clientY + offset + 4;
  }
  if (top + height + pad > vh) {
    top = Math.max(pad, vh - height - pad);
  }

  tooltipEl.style.left = `${Math.round(left)}px`;
  tooltipEl.style.top = `${Math.round(top)}px`;
}

function getEventCoords(evt, fallbackEl) {
  if (evt && typeof evt.clientX === 'number' && typeof evt.clientY === 'number' && (evt.clientX !== 0 || evt.clientY !== 0)) {
    return { x: evt.clientX, y: evt.clientY };
  }
  if (evt && evt.touches && evt.touches[0]) {
    return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
  }
  if (fallbackEl && typeof fallbackEl.getBoundingClientRect === 'function') {
    const r = fallbackEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: 0, y: 0 };
}

function showChartTooltip(evt, html) {
  const tip = getTooltipEl();
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  tip.style.visibility = 'hidden';
  const target = evt && evt.currentTarget ? evt.currentTarget : null;
  const { x, y } = getEventCoords(evt, target);
  clampTooltipPosition(x, y, tip);
  tip.style.visibility = 'visible';
}

function moveChartTooltip(evt) {
  const tip = getTooltipEl();
  if (!tip || tip.classList.contains('hidden')) return;
  const target = evt && evt.currentTarget ? evt.currentTarget : null;
  const { x, y } = getEventCoords(evt, target);
  clampTooltipPosition(x, y, tip);
}

function hideChartTooltip() {
  const tip = getTooltipEl();
  if (!tip) return;
  tip.classList.add('hidden');
  tip.innerHTML = '';
}

function sanitizeColor(color, fallbackIdx = 0) {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$|^rgba?\([^)]+\)$|^hsla?\([^)]+\)$|^var\(--[a-zA-Z0-9_-]+\)$/.test(color.trim())) {
    return color.trim();
  }
  return CATEGORY_COLOR_OPTIONS[fallbackIdx % CATEGORY_COLOR_OPTIONS.length];
}

function formatAxisTick(value) {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1000) return formatCompactTL(value).replace(' ₺', '');
  return new Intl.NumberFormat('tr-TR').format(Math.round(value));
}

function formatDayMonthFull(dayNum, dateStr) {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    if (m >= 1 && m <= 12) {
      return `${d} ${TR_FULL_MONTHS[m - 1]}`;
    }
  }
  return `${dayNum}. Gün`;
}

function formatShortDayTick(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return escapeHtml(dateStr || '');
  }
  const d = Number(dateStr.slice(8, 10));
  const m = Number(dateStr.slice(5, 7));
  if (m >= 1 && m <= 12) {
    return `${d} ${TR_SHORT_MONTHS[m - 1]}`;
  }
  return `${d}`;
}

/* ==========================================================================
   1. CATEGORY DONUT CHART
   ========================================================================== */

/**
 * Renders an interactive SVG donut chart with hover/focus slice highlight,
 * animated stroke-dashoffset entrance, center readout, and clickable legend.
 *
 * @param {HTMLElement | null} containerEl
 * @param {Array<{ id?: string, categoryId?: string, name?: string, label?: string, color?: string, amount?: number, total?: number, value?: number, percentage?: number, count?: number }>} breakdown
 * @param {{ totalExpense?: number, onSelectCategory?: (categoryId: string) => void }} [options]
 */
export function renderCategoryDonutChart(
  containerEl,
  breakdown = [],
  { totalExpense, onSelectCategory } = {}
) {
  if (!containerEl) return;
  hideChartTooltip();

  const items = Array.isArray(breakdown)
    ? breakdown
        .map((item, idx) => {
          const amount = Number(item.amount ?? item.total ?? item.value ?? 0);
          return {
            id: String(item.id ?? item.categoryId ?? item.name ?? `cat_${idx}`),
            name: String(item.name ?? item.label ?? 'Diğer'),
            color: sanitizeColor(item.color, idx),
            amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
            count: Number.isFinite(Number(item.count)) ? Number(item.count) : null,
            explicitPct: Number.isFinite(Number(item.percentage ?? item.pct))
              ? Number(item.percentage ?? item.pct)
              : null,
          };
        })
        .filter((item) => item.amount > 0)
    : [];

  if (items.length === 0) {
    containerEl.innerHTML = renderEmptyState({
      iconName: 'chart',
      title: 'Henüz harcama dağılımı yok',
      description: 'Bu ay için gider kaydı eklediğinde kategori dağılım grafiği burada görünür.',
    });
    return;
  }

  const computedTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const grandTotal = Number.isFinite(Number(totalExpense)) && Number(totalExpense) > 0
    ? Number(totalExpense)
    : computedTotal;

  const cx = 110;
  const cy = 110;
  const radius = 78;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  const gapPx = items.length > 1 ? 4.5 : 0;

  let cumulativeLength = 0;

  const segments = items.map((item, idx) => {
    const share = grandTotal > 0 ? item.amount / grandTotal : 0;
    const pct = item.explicitPct !== null ? item.explicitPct : share * 100;
    const rawArc = share * circumference;
    const visibleArc = items.length > 1 ? Math.max(2, rawArc - gapPx) : rawArc;
    const dashOffset = -(cumulativeLength + (items.length > 1 ? gapPx / 2 : 0));
    cumulativeLength += rawArc;

    return {
      ...item,
      idx,
      pct,
      pctText: `%${pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1).replace('.', ',')}`,
      visibleArc,
      dashOffset,
    };
  });

  const interactiveClass = typeof onSelectCategory === 'function' ? 'cursor:pointer;' : '';

  const slicesSvg = segments
    .map(
      (seg) => `
      <circle
        class="donut-slice anim-ring-draw"
        data-slice-idx="${seg.idx}"
        data-cat-id="${escapeHtml(seg.id)}"
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${escapeHtml(seg.color)}"
        stroke-width="${strokeWidth}"
        stroke-linecap="butt"
        stroke-dasharray="${seg.visibleArc.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${seg.dashOffset.toFixed(2)}"
        style="--ring-circumference:${circumference.toFixed(2)};--ring-offset:${seg.dashOffset.toFixed(2)};animation-delay:${seg.idx * 55}ms;transition:opacity 160ms ease, stroke-width 160ms ease;${interactiveClass}"
        tabindex="0"
        role="button"
        aria-label="${escapeHtml(seg.name)}: ${escapeHtml(formatTL(seg.amount))} (${escapeHtml(seg.pctText)})"
      />`
    )
    .join('');

  const legendHtml = segments
    .map(
      (seg) => `
      <button
        type="button"
        class="legend-item"
        data-legend-idx="${seg.idx}"
        data-cat-id="${escapeHtml(seg.id)}"
        style="width:100%;text-align:left;${interactiveClass}"
      >
        <span class="row-gap" style="min-width:0;gap:8px;flex:1;">
          <span class="legend-dot" style="background-color:${escapeHtml(seg.color)};"></span>
          <span class="truncate" style="font-weight:600;color:var(--text-primary);">${escapeHtml(seg.name)}</span>
        </span>
        <span class="row-gap" style="gap:10px;flex-shrink:0;">
          <span class="mono" style="color:var(--text-muted);font-size:11px;">${escapeHtml(seg.pctText)}</span>
          <span class="mono" style="font-weight:700;color:var(--text-primary);">${escapeHtml(formatTL(seg.amount))}</span>
        </span>
      </button>`
    )
    .join('');

  containerEl.innerHTML = `
    <div class="donut-layout">
      <div class="chart-wrap" style="width:210px;max-width:100%;flex-shrink:0;margin:0 auto;">
        <svg viewBox="0 0 220 220" role="img" aria-label="Kategori bazlı harcama dağılımı">
          <circle
            cx="${cx}"
            cy="${cy}"
            r="${radius}"
            fill="none"
            stroke="var(--chart-track)"
            stroke-width="${strokeWidth}"
          />
          <g transform="rotate(-90 ${cx} ${cy})">
            ${slicesSvg}
          </g>
          <text
            class="donut-center-label"
            x="${cx}"
            y="${cy - 8}"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="11"
            font-weight="600"
          >Toplam Gider</text>
          <text
            class="donut-center-value mono"
            x="${cx}"
            y="${cy + 14}"
            text-anchor="middle"
            fill="var(--text-primary)"
            font-size="16"
            font-weight="700"
          >${escapeHtml(formatTL(grandTotal))}</text>
          <text
            class="donut-center-sub mono"
            x="${cx}"
            y="${cy + 31}"
            text-anchor="middle"
            fill="var(--text-secondary)"
            font-size="10.5"
            font-weight="600"
          >${segments.length} kategori</text>
        </svg>
      </div>
      <div class="donut-legend">${legendHtml}</div>
    </div>
  `;

  const sliceEls = Array.from(containerEl.querySelectorAll('.donut-slice'));
  const legendEls = Array.from(containerEl.querySelectorAll('.legend-item'));
  const centerLabelEl = containerEl.querySelector('.donut-center-label');
  const centerValueEl = containerEl.querySelector('.donut-center-value');
  const centerSubEl = containerEl.querySelector('.donut-center-sub');

  const defaultLabel = 'Toplam Gider';
  const defaultValue = formatTL(grandTotal);
  const defaultSub = `${segments.length} kategori`;

  const setActiveIndex = (idx, evt = null) => {
    const seg = segments[idx];
    if (!seg) return;

    sliceEls.forEach((el, i) => {
      el.style.opacity = i === idx ? '1' : '0.38';
      el.setAttribute('stroke-width', i === idx ? String(strokeWidth + 4) : String(strokeWidth));
    });

    legendEls.forEach((el, i) => {
      el.style.backgroundColor = i === idx ? 'var(--bg-surface-2)' : '';
    });

    if (centerLabelEl) {
      centerLabelEl.textContent = seg.name.length > 16 ? `${seg.name.slice(0, 15)}…` : seg.name;
    }
    if (centerValueEl) {
      centerValueEl.textContent = formatTL(seg.amount);
    }
    if (centerSubEl) {
      centerSubEl.textContent = `${seg.pctText} pay`;
    }

    if (evt) {
      const tipHtml = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <span style="width:8px;height:8px;border-radius:9999px;background:${escapeHtml(seg.color)};display:inline-block;"></span>
          <strong style="color:var(--text-primary);">${escapeHtml(seg.name)}</strong>
        </div>
        <div class="mono" style="font-weight:700;color:var(--text-primary);">${escapeHtml(formatTL(seg.amount))}</div>
        <div style="color:var(--text-secondary);font-size:11px;">Pay: <strong class="mono">${escapeHtml(seg.pctText)}</strong>${seg.count !== null ? ` • ${seg.count} işlem` : ''}</div>
      `;
      showChartTooltip(evt, tipHtml);
    }
  };

  const resetActive = () => {
    sliceEls.forEach((el) => {
      el.style.opacity = '1';
      el.setAttribute('stroke-width', String(strokeWidth));
    });
    legendEls.forEach((el) => {
      el.style.backgroundColor = '';
    });
    if (centerLabelEl) centerLabelEl.textContent = defaultLabel;
    if (centerValueEl) centerValueEl.textContent = defaultValue;
    if (centerSubEl) centerSubEl.textContent = defaultSub;
    hideChartTooltip();
  };

  sliceEls.forEach((el) => {
    const idx = Number(el.dataset.sliceIdx);
    const seg = segments[idx];
    el.addEventListener('mouseenter', (evt) => {
      setActiveIndex(idx, evt);
    });
    el.addEventListener('mousemove', moveChartTooltip);
    el.addEventListener('mouseleave', resetActive);
    el.addEventListener('focus', (evt) => setActiveIndex(idx, evt));
    el.addEventListener('blur', resetActive);
    el.addEventListener('click', () => {
      if (typeof onSelectCategory === 'function' && seg) {
        onSelectCategory(seg.id);
      }
    });
    el.addEventListener('keydown', (evt) => {
      if ((evt.key === 'Enter' || evt.key === ' ') && typeof onSelectCategory === 'function' && seg) {
        evt.preventDefault();
        onSelectCategory(seg.id);
      }
    });
  });

  legendEls.forEach((el) => {
    const idx = Number(el.dataset.legendIdx);
    const seg = segments[idx];
    el.addEventListener('mouseenter', () => setActiveIndex(idx, null));
    el.addEventListener('mouseleave', resetActive);
    el.addEventListener('focus', () => setActiveIndex(idx, null));
    el.addEventListener('blur', resetActive);
    el.addEventListener('click', () => {
      if (typeof onSelectCategory === 'function' && seg) {
        onSelectCategory(seg.id);
      }
    });
  });
}

/* ==========================================================================
   2. MONTHLY DAILY EXPENSE BAR CHART
   ========================================================================== */

/**
 * Renders an interactive daily column chart for the selected month (`1..31`).
 * Supports numeric arrays `[0, 480, ...]` or object arrays `[{ day, dateStr, expense, income }]`.
 *
 * @param {HTMLElement | null} containerEl
 * @param {Array<number | { day?: number, dateStr?: string, date?: string, expense?: number, amount?: number, income?: number }>} dailyExpenses
 * @param {{ dailyBudgetLine?: number }} [options]
 */
export function renderMonthlyDailyChart(
  containerEl,
  dailyExpenses = [],
  { dailyBudgetLine = 0 } = {}
) {
  if (!containerEl) return;
  hideChartTooltip();

  const rawList = Array.isArray(dailyExpenses) ? dailyExpenses : [];
  const days = rawList.map((entry, idx) => {
    if (typeof entry === 'number') {
      const val = Number.isFinite(entry) ? Math.max(0, entry) : 0;
      return {
        day: idx + 1,
        dateStr: '',
        expense: val,
        income: 0,
      };
    }
    const day = Number(entry?.day ?? (entry?.dateStr ? Number(entry.dateStr.slice(8, 10)) : idx + 1));
    const expense = Number(entry?.expense ?? entry?.amount ?? entry?.total ?? 0);
    const income = Number(entry?.income ?? 0);
    return {
      day: Number.isFinite(day) && day > 0 ? day : idx + 1,
      dateStr: String(entry?.dateStr ?? entry?.date ?? ''),
      expense: Number.isFinite(expense) && expense > 0 ? expense : 0,
      income: Number.isFinite(income) && income > 0 ? income : 0,
    };
  });

  if (days.length === 0) {
    containerEl.innerHTML = renderEmptyState({
      iconName: 'calendar',
      title: 'Günlük veri bulunamadı',
      description: 'Seçili ay için günlük harcama verisi oluştuğunda grafik burada çizilir.',
    });
    return;
  }

  const hasAnyExpense = days.some((d) => d.expense > 0 || d.income > 0);
  const budgetLine = Number.isFinite(Number(dailyBudgetLine)) && Number(dailyBudgetLine) > 0
    ? Number(dailyBudgetLine)
    : 0;

  if (!hasAnyExpense && budgetLine === 0) {
    containerEl.innerHTML = renderEmptyState({
      iconName: 'chart',
      title: 'Bu ay henüz harcama yok',
      description: 'Günlük harcama veya gelir kaydı eklendikçe sütunlar otomatik güncellenir.',
    });
    return;
  }

  const width = 680;
  const height = 220;
  const padTop = 20;
  const padRight = 14;
  const padBottom = 30;
  const padLeft = 52;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const peakVal = Math.max(
    ...days.map((d) => d.expense),
    budgetLine * 1.15,
    100
  );
  const maxVal = peakVal * 1.12;
  const yScale = (val) => padTop + chartH - (val / maxVal) * chartH;

  const gridTicks = [0, 0.5, 1].map((ratio) => {
    const val = maxVal * ratio;
    const y = yScale(val);
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1" />
      <text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="10" class="mono">${escapeHtml(formatAxisTick(val))}</text>
    `;
  }).join('');

  const slotW = chartW / days.length;
  const barW = Math.max(5, Math.min(18, slotW * 0.62));

  const barsSvg = days
    .map((d, idx) => {
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const centerX = x + barW / 2;
      const barH = d.expense > 0 ? Math.max(3, (d.expense / maxVal) * chartH) : 2;
      const y = padTop + chartH - barH;
      const isOverBudget = budgetLine > 0 && d.expense > budgetLine;
      const fill = d.expense === 0
        ? 'var(--chart-track)'
        : isOverBudget
          ? COLOR_CORAL
          : 'var(--accent-expense)';
      const showTickLabel =
        d.day === 1 || d.day % 5 === 0 || d.day === days.length;

      const incomeDot = d.income > 0
        ? `<circle cx="${centerX.toFixed(1)}" cy="${Math.max(padTop + 4, yScale(Math.min(d.income, maxVal))).toFixed(1)}" r="3" fill="${COLOR_MINT}" stroke="var(--bg-surface)" stroke-width="1.2" />`
        : '';

      const dayTitle = formatDayMonthFull(d.day, d.dateStr);

      return `
        <g class="daily-bar-group" data-day-idx="${idx}" tabindex="0" role="button" aria-label="${escapeHtml(dayTitle)}: Gider ${escapeHtml(formatTL(d.expense))}">
          <rect
            x="${(padLeft + idx * slotW).toFixed(1)}"
            y="${padTop}"
            width="${slotW.toFixed(1)}"
            height="${chartH}"
            fill="transparent"
          />
          <rect
            class="daily-bar-rect anim-bar-grow"
            x="${x.toFixed(1)}"
            y="${y.toFixed(1)}"
            width="${barW.toFixed(1)}"
            height="${barH.toFixed(1)}"
            rx="${Math.min(4, barW / 2).toFixed(1)}"
            fill="${fill}"
            opacity="${d.expense === 0 ? '0.55' : '0.92'}"
            style="animation-delay:${Math.min(idx * 10, 260)}ms;transition:opacity 140ms ease, filter 140ms ease;"
          />
          ${incomeDot}
          ${
            showTickLabel
              ? `<text x="${centerX.toFixed(1)}" y="${height - 9}" text-anchor="middle" fill="var(--text-muted)" font-size="10" class="mono">${d.day}</text>`
              : ''
          }
        </g>
      `;
    })
    .join('');

  let budgetSvg = '';
  if (budgetLine > 0) {
    const budgetY = yScale(budgetLine);
    budgetSvg = `
      <line
        x1="${padLeft}"
        y1="${budgetY.toFixed(1)}"
        x2="${width - padRight}"
        y2="${budgetY.toFixed(1)}"
        stroke="${COLOR_AMBER}"
        stroke-width="1.5"
        stroke-dasharray="5 4"
        opacity="0.9"
      />
      <rect
        x="${width - padRight - 84}"
        y="${Math.max(2, budgetY - 17).toFixed(1)}"
        width="84"
        height="15"
        rx="4"
        fill="var(--bg-surface-2)"
        stroke="${COLOR_AMBER}"
        stroke-opacity="0.45"
      />
      <text
        x="${width - padRight - 42}"
        y="${Math.max(12, budgetY - 6.5).toFixed(1)}"
        text-anchor="middle"
        fill="${COLOR_AMBER}"
        font-size="9.5"
        font-weight="600"
        class="mono"
      >Hedef ${escapeHtml(formatAxisTick(budgetLine))} ₺</text>
    `;
  }

  containerEl.innerHTML = `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aylık günlük harcama grafiği">
        ${gridTicks}
        <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="var(--border-subtle)" stroke-width="1" />
        ${barsSvg}
        ${budgetSvg}
      </svg>
    </div>
  `;

  const groups = Array.from(containerEl.querySelectorAll('.daily-bar-group'));
  const activateDay = (idx, evt) => {
    const d = days[idx];
    if (!d) return;
    groups.forEach((g, i) => {
      const rect = g.querySelector('.daily-bar-rect');
      if (rect) {
        rect.style.opacity = i === idx ? '1' : '0.45';
      }
    });
    const title = formatDayMonthFull(d.day, d.dateStr);
    const incomeLine = d.income > 0
      ? `<div style="color:${COLOR_MINT};font-size:11px;margin-top:2px;">Gelir: <strong class="mono">${escapeHtml(formatTL(d.income))}</strong></div>`
      : '';
    const budgetDiffLine = budgetLine > 0 && d.expense > budgetLine
      ? `<div style="color:${COLOR_AMBER};font-size:11px;margin-top:2px;">Günlük hedefin ${escapeHtml(formatTL(d.expense - budgetLine))} üzerinde</div>`
      : '';
    showChartTooltip(
      evt,
      `
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:2px;">${escapeHtml(title)}</div>
        <div style="color:var(--text-secondary);">Gider: <strong class="mono" style="color:${COLOR_CORAL};">${escapeHtml(formatTL(d.expense))}</strong></div>
        ${incomeLine}
        ${budgetDiffLine}
      `
    );
  };

  const resetDays = () => {
    groups.forEach((g, i) => {
      const d = days[i];
      const rect = g.querySelector('.daily-bar-rect');
      if (rect && d) {
        rect.style.opacity = d.expense === 0 ? '0.55' : '0.92';
      }
    });
    hideChartTooltip();
  };

  groups.forEach((g) => {
    const idx = Number(g.dataset.dayIdx);
    g.addEventListener('mouseenter', (evt) => activateDay(idx, evt));
    g.addEventListener('mousemove', moveChartTooltip);
    g.addEventListener('mouseleave', resetDays);
    g.addEventListener('focus', (evt) => activateDay(idx, evt));
    g.addEventListener('blur', resetDays);
  });
}

/* ==========================================================================
   3. INCOME VS EXPENSE COMPARATIVE CHART
   ========================================================================== */

/**
 * Renders a comparative horizontal stacked SVG bar chart for Income (Fixed + Extra)
 * vs Expense (Regular + Terea) with clear percentage labels and Net Balance callout.
 *
 * @param {HTMLElement | null} containerEl
 * @param {{ fixedIncome?: number, extraIncome?: number, regularExpense?: number, tereaExpense?: number }} data
 */
export function renderIncomeVsExpenseChart(
  containerEl,
  { fixedIncome = 0, extraIncome = 0, regularExpense = 0, tereaExpense = 0 } = {}
) {
  if (!containerEl) return;
  hideChartTooltip();

  const fixed = Math.max(0, Number(fixedIncome) || 0);
  const extra = Math.max(0, Number(extraIncome) || 0);
  const regular = Math.max(0, Number(regularExpense) || 0);
  const terea = Math.max(0, Number(tereaExpense) || 0);

  const totalIncome = fixed + extra;
  const totalExpense = regular + terea;
  const netBalance = totalIncome - totalExpense;

  if (totalIncome === 0 && totalExpense === 0) {
    containerEl.innerHTML = renderEmptyState({
      iconName: 'sliders',
      title: 'Nakit akışı verisi bekleniyor',
      description: 'Gelir veya gider girişi yaptığında karşılaştırmalı nakit akışı burada görünür.',
    });
    return;
  }

  const maxTotal = Math.max(totalIncome, totalExpense, 1);
  const barX = 16;
  const barMaxW = 528;
  const barH = 26;

  const incomeW = (totalIncome / maxTotal) * barMaxW;
  const fixedW = totalIncome > 0 ? (fixed / totalIncome) * incomeW : 0;
  const extraW = Math.max(0, incomeW - fixedW);

  const expenseW = (totalExpense / maxTotal) * barMaxW;
  const regularW = totalExpense > 0 ? (regular / totalExpense) * expenseW : 0;
  const tereaW = Math.max(0, expenseW - regularW);

  const expenseRatioPct = totalIncome > 0
    ? Math.round((totalExpense / totalIncome) * 100)
    : totalExpense > 0
      ? 100
      : 0;
  const savingsRatePct = totalIncome > 0
    ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100))
    : 0;

  const netBadgeColor = netBalance >= 0 ? COLOR_MINT : COLOR_CORAL;
  const netBadgeBg = netBalance >= 0 ? 'var(--accent-income-soft)' : 'var(--accent-expense-soft)';
  const netBadgeBorder = netBalance >= 0 ? 'var(--accent-income-border)' : 'var(--accent-expense-border)';
  const uid = Math.random().toString(36).slice(2, 8);
  const incomeClipId = `incomeBarClip_${uid}`;
  const expenseClipId = `expenseBarClip_${uid}`;

  containerEl.innerHTML = `
    <div class="stack-md">
      <div class="row-between wrap" style="gap:10px;">
        <div class="row-gap wrap" style="gap:12px;">
          <span class="badge badge-neutral mono">Gider / Gelir: %${expenseRatioPct}</span>
          ${totalIncome > 0 ? `<span class="badge badge-income mono">Tasarruf Oranı: %${savingsRatePct}</span>` : ''}
        </div>
        <div
          class="mono"
          style="padding:6px 12px;border-radius:var(--radius-md);background:${netBadgeBg};border:1px solid ${netBadgeBorder};color:${netBadgeColor};font-size:13px;font-weight:700;"
        >
          Net Denge: ${escapeHtml(formatTL(netBalance, { showSign: true }))}
        </div>
      </div>

      <div class="chart-wrap">
        <svg viewBox="0 0 560 154" role="img" aria-label="Gelir ve gider karşılaştırması">
          <!-- Income Row -->
          <text x="${barX}" y="22" fill="var(--text-secondary)" font-size="12" font-weight="700">Gelir</text>
          <text x="${barX + barMaxW}" y="22" text-anchor="end" fill="${COLOR_MINT}" font-size="13" font-weight="700" class="mono">${escapeHtml(formatTL(totalIncome))}</text>
          <rect x="${barX}" y="31" width="${barMaxW}" height="${barH}" rx="8" fill="var(--chart-track)" />
          <g class="cashflow-row" data-cf-type="income" tabindex="0" role="button" aria-label="Gelir detayı: ${escapeHtml(formatTL(totalIncome))}">
            <clipPath id="${incomeClipId}">
              <rect x="${barX}" y="31" width="${Math.max(0, incomeW).toFixed(1)}" height="${barH}" rx="8" />
            </clipPath>
            <g clip-path="url(#${incomeClipId})">
              <rect x="${barX}" y="31" width="${fixedW.toFixed(1)}" height="${barH}" fill="${COLOR_MINT}" />
              <rect x="${(barX + fixedW).toFixed(1)}" y="31" width="${extraW.toFixed(1)}" height="${barH}" fill="${COLOR_TEAL}" />
            </g>
            <rect x="${barX}" y="31" width="${barMaxW}" height="${barH}" rx="8" fill="transparent" />
          </g>
          <text x="${barX}" y="72" fill="var(--text-muted)" font-size="10.5" class="mono">
            Sabit: ${escapeHtml(formatTL(fixed))} • Ek: ${escapeHtml(formatTL(extra))}
          </text>

          <!-- Expense Row -->
          <text x="${barX}" y="98" fill="var(--text-secondary)" font-size="12" font-weight="700">Gider</text>
          <text x="${barX + barMaxW}" y="98" text-anchor="end" fill="${COLOR_CORAL}" font-size="13" font-weight="700" class="mono">${escapeHtml(formatTL(totalExpense))}</text>
          <rect x="${barX}" y="107" width="${barMaxW}" height="${barH}" rx="8" fill="var(--chart-track)" />
          <g class="cashflow-row" data-cf-type="expense" tabindex="0" role="button" aria-label="Gider detayı: ${escapeHtml(formatTL(totalExpense))}">
            <clipPath id="${expenseClipId}">
              <rect x="${barX}" y="107" width="${Math.max(0, expenseW).toFixed(1)}" height="${barH}" rx="8" />
            </clipPath>
            <g clip-path="url(#expenseClipId)">
              <rect x="${barX}" y="107" width="${regularW.toFixed(1)}" height="${barH}" fill="${COLOR_CORAL}" />
              <rect x="${(barX + regularW).toFixed(1)}" y="107" width="${tereaW.toFixed(1)}" height="${barH}" fill="${COLOR_AMBER}" />
            </g>
            <rect x="${barX}" y="107" width="${barMaxW}" height="${barH}" rx="8" fill="transparent" />
          </g>
          <text x="${barX}" y="148" fill="var(--text-muted)" font-size="10.5" class="mono">
            Harcamalar: ${escapeHtml(formatTL(regular))} • Terea: ${escapeHtml(formatTL(terea))}
          </text>
        </svg>
      </div>
    </div>
  `;

  const rows = Array.from(containerEl.querySelectorAll('.cashflow-row'));
  rows.forEach((row) => {
    const type = row.dataset.cfType;
    const buildTip = () => {
      if (type === 'income') {
        const fixedPct = totalIncome > 0 ? Math.round((fixed / totalIncome) * 100) : 0;
        const extraPct = totalIncome > 0 ? Math.round((extra / totalIncome) * 100) : 0;
        return `
          <div style="font-weight:700;color:${COLOR_MINT};margin-bottom:4px;">Toplam Gelir: ${escapeHtml(formatTL(totalIncome))}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Sabit Gelir: <strong class="mono" style="color:var(--text-primary);">${escapeHtml(formatTL(fixed))}</strong> (%${fixedPct})</div>
          <div style="font-size:11px;color:var(--text-secondary);">Ek Gelir: <strong class="mono" style="color:var(--text-primary);">${escapeHtml(formatTL(extra))}</strong> (%${extraPct})</div>
        `;
      }
      const regPct = totalExpense > 0 ? Math.round((regular / totalExpense) * 100) : 0;
      const tereaPct = totalExpense > 0 ? Math.round((terea / totalExpense) * 100) : 0;
      return `
        <div style="font-weight:700;color:${COLOR_CORAL};margin-bottom:4px;">Toplam Gider: ${escapeHtml(formatTL(totalExpense))}</div>
        <div style="font-size:11px;color:var(--text-secondary);">Harcamalar: <strong class="mono" style="color:var(--text-primary);">${escapeHtml(formatTL(regular))}</strong> (%${regPct})</div>
        <div style="font-size:11px;color:var(--text-secondary);">Terea Tüketimi: <strong class="mono" style="color:${COLOR_AMBER};">${escapeHtml(formatTL(terea))}</strong> (%${tereaPct})</div>
      `;
    };

    row.addEventListener('mouseenter', (evt) => showChartTooltip(evt, buildTip()));
    row.addEventListener('mousemove', moveChartTooltip);
    row.addEventListener('mouseleave', hideChartTooltip);
    row.addEventListener('focus', (evt) => showChartTooltip(evt, buildTip()));
    row.addEventListener('blur', hideChartTooltip);
  });
}

/* ==========================================================================
   4. TEREA 14-DAY TREND CHART
   ========================================================================== */

/**
 * Renders the interactive 14-day Terea stick consumption bar chart with
 * dailyLimit (amber) and baselineDaily (rose) dashed guide lines.
 *
 * @param {HTMLElement | null} containerEl
 * @param {Array<{ dateStr?: string, date?: string, count?: number, sticks?: number }>} daysSeries
 * @param {{ dailyLimit?: number, baselineDaily?: number, stickPrice?: number }} [options]
 */
export function renderTereaTrendChart(
  containerEl,
  daysSeries = [],
  { dailyLimit = 12, baselineDaily = 25, stickPrice = 14 } = {}
) {
  if (!containerEl) return;
  hideChartTooltip();

  const list = Array.isArray(daysSeries) ? daysSeries : [];
  if (list.length === 0) {
    containerEl.innerHTML = renderEmptyState({
      iconName: 'flame',
      title: '14 günlük Terea verisi yok',
      description: 'Günlük Terea sayacını güncellediğinde 14 günlük trend burada görünür.',
    });
    return;
  }

  const limit = Math.max(0, Number(dailyLimit) || 0);
  const baseline = Math.max(0, Number(baselineDaily) || 0);
  const unitPrice = Math.max(0, Number(stickPrice) || 0);

  const series = list.map((item, idx) => {
    const count = Math.max(0, Number(item?.count ?? item?.sticks ?? 0) || 0);
    const dateStr = String(item?.dateStr ?? item?.date ?? '');
    return {
      idx,
      dateStr,
      shortDate: dateStr ? formatShortDateTR(dateStr) : `${idx + 1}. Gün`,
      axisTick: dateStr ? formatShortDayTick(dateStr) : String(idx + 1),
      count,
      burned: count * unitPrice,
      diffMoney: (baseline - count) * unitPrice,
    };
  });

  const maxCount = Math.max(...series.map((s) => s.count), limit, 4);
  const showBaseline = baseline > 0 && baseline <= Math.max(maxCount * 1.45, limit + 4);
  const scaleMax = Math.max(
    maxCount + 2,
    showBaseline ? baseline + 2 : 0,
    limit + 2,
    6
  );

  const width = 680;
  const height = 228;
  const padTop = 24;
  const padRight = 18;
  const padBottom = 34;
  const padLeft = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const yScale = (val) => padTop + chartH - (val / scaleMax) * chartH;

  const getBarColor = (count) => {
    if (count === 0) return COLOR_MINT;
    if (limit === 0) return COLOR_CORAL;
    if (count > limit) return COLOR_CORAL;
    if (count >= Math.ceil(limit * 0.8)) return COLOR_AMBER;
    if (count <= Math.floor(limit * 0.5)) return COLOR_MINT;
    return COLOR_TEAL;
  };

  const slotW = chartW / series.length;
  const barW = Math.max(12, Math.min(28, slotW * 0.58));

  const gridVals = [0, Math.round(scaleMax / 2), scaleMax];
  const gridSvg = gridVals
    .map((val) => {
      const y = yScale(val);
      return `
        <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1" />
        <text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="10" class="mono">${val}</text>
      `;
    })
    .join('');

  const barsSvg = series
    .map((d, idx) => {
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const centerX = x + barW / 2;
      const barH = d.count > 0 ? Math.max(4, (d.count / scaleMax) * chartH) : 4;
      const y = padTop + chartH - barH;
      const fill = getBarColor(d.count);
      const showLabel = idx === 0 || idx === series.length - 1 || idx % 2 === 1;

      return `
        <g class="terea-bar-group" data-t-idx="${idx}" tabindex="0" role="button" aria-label="${escapeHtml(d.shortDate)}: ${d.count} dal">
          <rect
            x="${(padLeft + idx * slotW).toFixed(1)}"
            y="${padTop}"
            width="${slotW.toFixed(1)}"
            height="${chartH}"
            fill="transparent"
          />
          <rect
            class="terea-bar-rect anim-bar-grow"
            x="${x.toFixed(1)}"
            y="${y.toFixed(1)}"
            width="${barW.toFixed(1)}"
            height="${barH.toFixed(1)}"
            rx="5"
            fill="${fill}"
            opacity="${d.count === 0 ? '0.45' : '0.94'}"
            style="animation-delay:${idx * 22}ms;transition:opacity 140ms ease;"
          />
          <text
            x="${centerX.toFixed(1)}"
            y="${(y - 5).toFixed(1)}"
            text-anchor="middle"
            fill="${d.count > limit && limit >= 0 ? COLOR_CORAL : 'var(--text-secondary)'}"
            font-size="10"
            font-weight="700"
            class="mono"
          >${d.count}</text>
          ${
            showLabel
              ? `<text x="${centerX.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" class="mono">${escapeHtml(d.axisTick)}</text>`
              : ''
          }
        </g>
      `;
    })
    .join('');

  const limitY = yScale(limit);
  const limitGuideSvg = `
    <line
      x1="${padLeft}"
      y1="${limitY.toFixed(1)}"
      x2="${width - padRight}"
      y2="${limitY.toFixed(1)}"
      stroke="${COLOR_AMBER}"
      stroke-width="1.6"
      stroke-dasharray="5 4"
      opacity="0.92"
    />
    <text
      x="${width - padRight}"
      y="${Math.max(12, limitY - 5).toFixed(1)}"
      text-anchor="end"
      fill="${COLOR_AMBER}"
      font-size="10"
      font-weight="700"
      class="mono"
    >Limit: ${limit} dal</text>
  `;

  let baselineGuideSvg = '';
  if (showBaseline) {
    const baseY = yScale(baseline);
    baselineGuideSvg = `
      <line
        x1="${padLeft}"
        y1="${baseY.toFixed(1)}"
        x2="${width - padRight}"
        y2="${baseY.toFixed(1)}"
        stroke="${COLOR_CORAL}"
        stroke-width="1.2"
        stroke-dasharray="3 4"
        opacity="0.6"
      />
      <text
        x="${padLeft + 4}"
        y="${Math.max(12, baseY - 5).toFixed(1)}"
        text-anchor="start"
        fill="${COLOR_CORAL}"
        font-size="9.5"
        font-weight="600"
        opacity="0.85"
        class="mono"
      >Eski: ${baseline} dal</text>
    `;
  }

  containerEl.innerHTML = `
    <div class="stack-sm">
      <div class="chart-wrap">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="14 günlük Terea tüketim trendi">
          ${gridSvg}
          <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="var(--border-subtle)" stroke-width="1" />
          ${baselineGuideSvg}
          ${limitGuideSvg}
          ${barsSvg}
        </svg>
      </div>
      <div class="row-gap wrap" style="gap:14px;font-size:11px;color:var(--text-muted);justify-content:flex-end;">
        <span class="row-gap" style="gap:5px;"><span class="legend-dot" style="background:${COLOR_MINT};width:8px;height:8px;"></span>Düşük / 0 dal</span>
        <span class="row-gap" style="gap:5px;"><span class="legend-dot" style="background:${COLOR_TEAL};width:8px;height:8px;"></span>Limit içi</span>
        <span class="row-gap" style="gap:5px;"><span class="legend-dot" style="background:${COLOR_AMBER};width:8px;height:8px;"></span>Sınıra yakın (%80+)</span>
        <span class="row-gap" style="gap:5px;"><span class="legend-dot" style="background:${COLOR_CORAL};width:8px;height:8px;"></span>Limit aşımı</span>
      </div>
    </div>
  `;

  const groups = Array.from(containerEl.querySelectorAll('.terea-bar-group'));
  const activateBar = (idx, evt) => {
    const d = series[idx];
    if (!d) return;

    groups.forEach((g, i) => {
      const rect = g.querySelector('.terea-bar-rect');
      if (rect) {
        rect.style.opacity = i === idx ? '1' : '0.42';
      }
    });

    const isProfit = d.diffMoney >= 0;
    const diffText = isProfit
      ? `${formatTL(d.diffMoney, { showSign: true })} kâr`
      : `${formatTL(d.diffMoney)}`;
    const diffColor = isProfit ? COLOR_MINT : COLOR_CORAL;

    showChartTooltip(
      evt,
      `
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:3px;">${escapeHtml(d.shortDate)}</div>
        <div class="mono" style="font-weight:700;color:var(--text-primary);">${d.count} dal</div>
        <div style="color:var(--text-secondary);font-size:11px;margin-top:2px;">
          Yakılan: <strong class="mono" style="color:${COLOR_CORAL};">${escapeHtml(formatTL(d.burned))}</strong>
        </div>
        <div style="color:var(--text-secondary);font-size:11px;margin-top:2px;">
          Eski alışkanlığa göre: <strong class="mono" style="color:${diffColor};">${escapeHtml(diffText)}</strong>
        </div>
      `
    );
  };

  const resetBars = () => {
    groups.forEach((g, i) => {
      const d = series[i];
      const rect = g.querySelector('.terea-bar-rect');
      if (rect && d) {
        rect.style.opacity = d.count === 0 ? '0.45' : '0.94';
      }
    });
    hideChartTooltip();
  };

  groups.forEach((g) => {
    const idx = Number(g.dataset.tIdx);
    g.addEventListener('mouseenter', (evt) => activateBar(idx, evt));
    g.addEventListener('mousemove', moveChartTooltip);
    g.addEventListener('mouseleave', resetBars);
    g.addEventListener('focus', (evt) => activateBar(idx, evt));
    g.addEventListener('blur', resetBars);
  });
}
