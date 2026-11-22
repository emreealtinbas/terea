/**
 * js/views/terea.js
 * Sıfır Sürtünmeli Terea Takip Ekranı
 * Soru yok, onay penceresi yok, bekleme sayacı yok — tek dokunuş veya doğrudan sayı girişi.
 */

import {
  getState,
  getLocalDateStr,
  getTereaStickPrice,
  getTereaDayStats,
  getTereaMonthStats,
  getTereaLastNDays,
  getTereaAllTimeStats,
  setTereaDayCount,
  adjustTereaDayCount,
  updateTereaSettings,
} from '../state.js';
import {
  escapeHtml,
  formatTL,
  formatDateTR,
  formatMonthLabel,
  icon,
  animateValue,
  showToast,
} from '../ui.js';
import { renderTereaTrendChart } from '../charts.js';
import { exportTereaCSV } from '../export.js';

const REDUCTION_PRESETS = [
  { limit: 12, label: '12 dal', desc: 'Kontrol Başlangıcı' },
  { limit: 9, label: '9 dal', desc: 'Dengeli Azaltma' },
  { limit: 6, label: '6 dal', desc: 'Yarı Yarıya İniş' },
  { limit: 3, label: '3 dal', desc: 'Minimum Tüketim' },
  { limit: 0, label: '0 dal', desc: 'Tam Özgürlük' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let selectedDate = getLocalDateStr();
let lastObservedToday = getLocalDateStr();

function shiftDateStr(dateStr, deltaDays) {
  const safe = DATE_RE.test(dateStr) ? dateStr : getLocalDateStr();
  const [y, m, d] = safe.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return getLocalDateStr(dt);
}

function getQuotaStatus(count, limit) {
  if (count === 0) {
    return { label: 'Temiz Gün', cls: 'badge-income' };
  }
  if (limit === 0 || count > limit) {
    return { label: 'Limit Aşıldı', cls: 'badge-expense' };
  }
  if (count >= Math.ceil(limit * 0.8)) {
    return { label: 'Limite Yakın', cls: 'badge-warn' };
  }
  return { label: 'Kontrol Altında', cls: 'badge-income' };
}

function buildQuotaSegmentsHtml(count, limit) {
  const maxVisual = 40;
  const rawTotal = limit > 0 ? Math.max(limit, count) : Math.max(count, 5);
  const totalSegments = Math.min(maxVisual, Math.max(1, rawTotal));
  const scale = rawTotal > maxVisual ? maxVisual / rawTotal : 1;

  const filledUnits = Math.min(totalSegments, Math.round(count * scale));
  const limitUnits = limit > 0 ? Math.min(totalSegments, Math.round(limit * scale)) : 0;
  const nearLimit = limit > 0 && count > 0 && count <= limit && count >= Math.ceil(limit * 0.8);

  const parts = [];
  for (let i = 1; i <= totalSegments; i++) {
    let segClass = 'quota-segment';
    if (i <= filledUnits) {
      if (i > limitUnits) {
        segClass += ' is-over';
      } else if (nearLimit) {
        segClass += ' is-warn';
      } else {
        segClass += ' is-filled';
      }
    }
    parts.push(`<span class="${segClass}" aria-hidden="true"></span>`);
  }
  return parts.join('');
}

function triggerStepperBump(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('anim-bump');
  // Force reflow so rapid taps replay the tactile spring bump cleanly
  void inputEl.offsetWidth;
  inputEl.classList.add('anim-bump');
}

function renderTemplate() {
  return `
    <div class="stack-lg anim-enter" data-view="terea-root">
      <!-- ==================== HERO TACTILE COUNTER CARD ==================== -->
      <section class="terea-hero" aria-label="Hızlı Terea Sayacı">
        <div class="row-between wrap" style="gap:12px;">
          <div class="row-gap wrap" style="gap:10px;">
            <span class="badge badge-primary">
              ${icon('flame', 13)}
              <span>Terea Hızlı Sayaç</span>
            </span>
            <span id="tereaStatusPill" class="badge badge-income">Temiz Gün</span>
            <span id="tereaSelectedDateText" class="mono" style="font-size:12px;color:var(--text-secondary);font-weight:600;"></span>
          </div>

          <div class="row-gap wrap" style="gap:8px;">
            <button type="button" id="tereaPrevDayBtn" class="btn btn-secondary btn-sm">
              ${icon('chevronLeft', 14)}
              <span>Önceki Gün</span>
            </button>
            <input
              type="date"
              id="tereaDateInput"
              class="input mono"
              style="width:auto;height:32px;padding:0 10px;font-size:12px;"
              aria-label="Kayıt tarihi seç"
            />
            <button type="button" id="tereaTodayBtn" class="btn btn-secondary btn-sm">Bugün</button>
          </div>
        </div>

        <div class="stack-sm" style="align-items:center;">
          <div class="terea-stepper" role="group" aria-label="Günlük dal sayacı">
            <button type="button" id="tereaDecBtn" class="stepper-btn" aria-label="1 dal azalt">-1</button>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              max="999"
              step="1"
              id="tereaCountInput"
              class="stepper-input"
              value="0"
              aria-label="Seçili gün Terea dal sayısı"
            />
            <button type="button" id="tereaIncBtn" class="stepper-btn is-add is-primary" aria-label="1 dal artır">+1</button>
          </div>

          <div class="row-gap wrap" style="justify-content:center;gap:8px;">
            <button type="button" class="pill-btn mono" data-terea-delta="2">+2</button>
            <button type="button" class="pill-btn mono" data-terea-delta="5">+5</button>
            <button type="button" id="tereaResetDayBtn" class="pill-btn">Sıfırla (0)</button>
          </div>
        </div>

        <div class="stack-sm">
          <div class="row-between wrap" style="gap:8px;font-size:12px;">
            <span id="tereaQuotaLabel" class="mono" style="font-weight:700;color:var(--text-primary);"></span>
            <span id="tereaQuotaHint" style="font-weight:600;color:var(--text-secondary);"></span>
          </div>
          <div id="tereaQuotaSegments" class="quota-segments" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
        </div>

        <div
          id="tereaDaySummaryBar"
          class="row-gap wrap"
          style="justify-content:center;padding:10px 14px;border-radius:var(--radius-md);background-color:var(--bg-surface-2);border:1px solid var(--border-subtle);font-size:13px;gap:8px 14px;"
        ></div>
      </section>

      <!-- ==================== KAR & ZARAR KPI GRID ==================== -->
      <section class="grid-kpi stagger" aria-label="Terea kâr ve zarar özeti">
        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Bugün Yakılan (Zarar)</span>
            ${icon('flame', 15)}
          </div>
          <div id="tereaKpiTodayBurned" class="kpi-value is-expense" data-num-val="0">0 ₺</div>
          <div id="tereaKpiTodayBurnedMeta" class="kpi-meta"></div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Bugün Kâr / Tasarruf</span>
            ${icon('trending', 15)}
          </div>
          <div id="tereaKpiTodayDelta" class="kpi-value is-income" data-num-val="0">0 ₺</div>
          <div id="tereaKpiTodayDeltaMeta" class="kpi-meta"></div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span id="tereaKpiMonthLabel">Bu Ay Toplam Kâr / Zarar</span>
            ${icon('calendar', 15)}
          </div>
          <div id="tereaKpiMonthNet" class="kpi-value is-income" data-num-val="0">0 ₺</div>
          <div id="tereaKpiMonthMeta" class="kpi-meta"></div>
        </article>

        <article class="card card-interactive kpi-card">
          <div class="kpi-label">
            <span>Yıllık Projeksiyon</span>
            ${icon('target', 15)}
          </div>
          <div id="tereaKpiYearlyProfit" class="kpi-value is-income" data-num-val="0">0 ₺</div>
          <div id="tereaKpiYearlyMeta" class="kpi-meta"></div>
        </article>
      </section>

      <!-- ==================== 14 GÜNLÜK TÜKETİM & KOTA GRAFİĞİ ==================== -->
      <section class="card" aria-label="14 günlük tüketim grafiği">
        <div class="card-header">
          <div>
            <h2 class="card-title">14 Günlük Tüketim &amp; Kota Grafiği</h2>
            <p id="tereaTrendSubtitle" class="card-subtitle"></p>
          </div>
          <div id="tereaTrendBadges" class="row-gap wrap" style="gap:6px;"></div>
        </div>
        <div id="tereaTrendChart"></div>
      </section>

      <!-- ==================== AYARLAR & KADEMELİ AZALTMA PLANI ==================== -->
      <section class="grid-2" aria-label="Terea ayarları ve kademeli azaltma planı">
        <!-- Left Card: Paket & Limit Ayarları -->
        <article class="card stack-md">
          <div class="card-header" style="margin-bottom:0;">
            <div>
              <h2 class="card-title">Paket &amp; Limit Ayarları</h2>
              <p id="tereaStickPriceSubtitle" class="card-subtitle"></p>
            </div>
            <button type="button" id="tereaExportCsvBtn" class="btn btn-secondary btn-sm">
              ${icon('download', 14)}
              <span>Terea CSV İndir</span>
            </button>
          </div>

          <form id="tereaSettingsForm" class="stack-md" novalidate>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">Paket Fiyatı (₺)</span>
                <div class="input-group">
                  <input type="number" id="tereaPackPrice" class="input mono" min="1" step="1" required />
                  <span class="input-group-addon">₺</span>
                </div>
              </label>

              <label class="field">
                <span class="field-label">Paket İçi Dal</span>
                <div class="input-group">
                  <input type="number" id="tereaSticksPerPack" class="input mono" min="1" max="100" step="1" required />
                  <span class="input-group-addon">dal</span>
                </div>
              </label>

              <label class="field">
                <span class="field-label">Günlük Hedef Limit</span>
                <div class="input-group">
                  <input type="number" id="tereaDailyLimit" class="input mono" min="0" max="100" step="1" required />
                  <span class="input-group-addon">dal</span>
                </div>
              </label>

              <label class="field">
                <span class="field-label">Eski Günlük Ortalama</span>
                <div class="input-group">
                  <input type="number" id="tereaBaselineDaily" class="input mono" min="1" max="100" step="1" required />
                  <span class="input-group-addon">dal</span>
                </div>
              </label>
            </div>

            <div class="toggle-row">
              <div class="stack-sm" style="gap:2px;">
                <label for="tereaIncludeFinance" style="font-size:13px;font-weight:600;color:var(--text-primary);cursor:pointer;">
                  Terea harcamalarını genel finans özetine dahil et
                </label>
                <span style="font-size:12px;color:var(--text-secondary);">
                  Açıkken Terea maliyetleri Özet ve Nakit Akışı giderlerine otomatik eklenir.
                </span>
              </div>
              <label id="tereaIncludeFinanceSwitch" class="switch">
                <input type="checkbox" id="tereaIncludeFinance" />
              </label>
            </div>

            <div class="row-between wrap" style="gap:10px;">
              <span style="font-size:12px;color:var(--text-muted);">
                Kâr/zarar hesabı eski günlük ortalaman baz alınarak anında hesaplanır.
              </span>
              <button type="submit" class="btn btn-primary btn-sm">
                ${icon('check', 14)}
                <span>Ayarları Kaydet</span>
              </button>
            </div>
          </form>
        </article>

        <!-- Right Card: Kademeli Azaltma Presetleri & Son Günler -->
        <article class="card stack-md">
          <div class="card-header" style="margin-bottom:0;">
            <div>
              <h2 class="card-title">Kademeli Azaltma Presetleri</h2>
              <p class="card-subtitle">Tek dokunuşla günlük hedef limitini güncelle</p>
            </div>
          </div>

          <div id="tereaPresetGrid" class="preset-grid"></div>

          <div class="stack-sm" style="padding-top:4px;border-top:1px solid var(--border-subtle);">
            <div class="row-between">
              <span class="field-label" style="text-transform:uppercase;letter-spacing:0.04em;">Son Günler Geçmişi</span>
              <span style="font-size:11px;color:var(--text-muted);">Düzenlemek için güne tıkla</span>
            </div>
            <div id="tereaRecentList" class="stack-sm"></div>
          </div>
        </article>
      </section>
    </div>
  `;
}

function syncTereaDom(rootEl, ctx) {
  const state = getState();
  const todayStr = getLocalDateStr();

  // Keep today advancing automatically if calendar rolled over while untouched
  if (lastObservedToday !== todayStr) {
    if (selectedDate === lastObservedToday) {
      selectedDate = todayStr;
    }
    lastObservedToday = todayStr;
  }

  const settings = state.terea?.settings || {};
  const packPrice = Number(settings.packPrice) || 280;
  const sticksPerPack = Math.max(1, Number(settings.sticksPerPack) || 20);
  const dailyLimit = Math.max(0, Number(settings.dailyLimit) ?? 12);
  const baselineDaily = Math.max(1, Number(settings.baselineDaily) || 25);
  const includeInFinance = settings.includeInFinance !== false;
  const stickPrice = getTereaStickPrice(state);

  const dayStats = getTereaDayStats(selectedDate, state);
  const todayStats = getTereaDayStats(todayStr, state);
  const activeYm = ctx?.ym || todayStr.slice(0, 7);
  const monthStats = getTereaMonthStats(activeYm, state);
  const last14 = getTereaLastNDays(14, state);
  const last7 = getTereaLastNDays(7, state);
  const allTime = getTereaAllTimeStats(state);

  // 1. Hero Top Row
  const statusInfo = getQuotaStatus(dayStats.count, dailyLimit);
  const statusPill = rootEl.querySelector('#tereaStatusPill');
  if (statusPill) {
    statusPill.className = `badge ${statusInfo.cls}`;
    statusPill.textContent = statusInfo.label;
  }

  const dateTextEl = rootEl.querySelector('#tereaSelectedDateText');
  if (dateTextEl) {
    const rel = formatDateTR(selectedDate, { relative: true });
    const full = formatDateTR(selectedDate, { relative: false });
    dateTextEl.textContent = rel === full ? full : `${rel} • ${full}`;
  }

  const dateInput = rootEl.querySelector('#tereaDateInput');
  if (dateInput) {
    dateInput.max = todayStr;
    if (document.activeElement !== dateInput && dateInput.value !== selectedDate) {
      dateInput.value = selectedDate;
    }
  }

  const todayBtn = rootEl.querySelector('#tereaTodayBtn');
  if (todayBtn) {
    const isToday = selectedDate === todayStr;
    todayBtn.disabled = isToday;
    todayBtn.classList.toggle('btn-primary', isToday);
    todayBtn.classList.toggle('btn-secondary', !isToday);
  }

  // 2. Stepper Input & Controls
  const countInput = rootEl.querySelector('#tereaCountInput');
  if (countInput && document.activeElement !== countInput) {
    countInput.value = String(dayStats.count);
  }
  const decBtn = rootEl.querySelector('#tereaDecBtn');
  if (decBtn) {
    decBtn.disabled = dayStats.count <= 0;
  }
  const resetDayBtn = rootEl.querySelector('#tereaResetDayBtn');
  if (resetDayBtn) {
    resetDayBtn.disabled = dayStats.count === 0 && dayStats.isTracked;
  }

  // 3. Quota Segmented Bar
  const quotaLabel = rootEl.querySelector('#tereaQuotaLabel');
  if (quotaLabel) {
    quotaLabel.textContent = `Günlük Kota: ${dayStats.count} / ${dailyLimit} dal`;
  }

  const quotaHint = rootEl.querySelector('#tereaQuotaHint');
  if (quotaHint) {
    if (dailyLimit === 0) {
      quotaHint.textContent = dayStats.count === 0
        ? 'Tam özgürlük hedefine tam uyum'
        : `Hedefin ${dayStats.count} dal üzerinde`;
      quotaHint.style.color = dayStats.count === 0 ? 'var(--accent-income)' : 'var(--accent-expense)';
    } else if (dayStats.count > dailyLimit) {
      quotaHint.textContent = `${dayStats.count - dailyLimit} dal limit aşımı`;
      quotaHint.style.color = 'var(--accent-expense)';
    } else {
      const remaining = dailyLimit - dayStats.count;
      quotaHint.textContent = remaining === 0 ? 'Günlük sınırda' : `Kalan hak: ${remaining} dal`;
      quotaHint.style.color = remaining <= Math.ceil(dailyLimit * 0.2)
        ? 'var(--accent-warn)'
        : 'var(--accent-income)';
    }
  }

  const segmentsEl = rootEl.querySelector('#tereaQuotaSegments');
  if (segmentsEl) {
    segmentsEl.innerHTML = buildQuotaSegmentsHtml(dayStats.count, dailyLimit);
    const pct = dailyLimit > 0
      ? Math.min(100, Math.round((dayStats.count / dailyLimit) * 100))
      : (dayStats.count > 0 ? 100 : 0);
    segmentsEl.setAttribute('aria-valuenow', String(pct));
  }

  // 4. Inline Selected Day Summary
  const summaryBar = rootEl.querySelector('#tereaDaySummaryBar');
  if (summaryBar) {
    const delta = dayStats.vsBaselineDelta;
    const isProfit = delta >= 0;
    const deltaLabel = delta > 0
      ? `${escapeHtml(formatTL(delta, { showSign: true }))} Kâr`
      : delta < 0
        ? `${escapeHtml(formatTL(delta))} Ekstra Zarar`
        : '0 ₺ (Baz ile eşit)';
    const deltaColor = isProfit ? 'var(--accent-income)' : 'var(--accent-expense)';
    const burnedText = dayStats.burned > 0 ? formatTL(-dayStats.burned) : formatTL(0);
    const packFrac = (dayStats.count / sticksPerPack).toLocaleString('tr-TR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });

    summaryBar.innerHTML = `
      <span class="mono" style="font-weight:700;color:var(--text-primary);">${dayStats.count} dal <span style="color:var(--text-muted);font-weight:500;">(${escapeHtml(packFrac)} pkt)</span></span>
      <span style="color:var(--text-muted);">•</span>
      <span>Yakılan: <strong class="mono" style="color:var(--accent-expense);">${escapeHtml(burnedText)}</strong></span>
      <span style="color:var(--text-muted);">•</span>
      <span>Eski alışkanlığa göre (${baselineDaily} dal): <strong class="mono" style="color:${deltaColor};">${deltaLabel}</strong></span>
      <span style="color:var(--text-muted);">•</span>
      <span class="mono" style="color:var(--text-secondary);">~${escapeHtml(dayStats.nicotineMg.toLocaleString('tr-TR'))} mg nikotin</span>
    `;
  }

  // 5. Kar & Zarar KPI Grid (animateValue)
  const kpiTodayBurned = rootEl.querySelector('#tereaKpiTodayBurned');
  const kpiTodayBurnedMeta = rootEl.querySelector('#tereaKpiTodayBurnedMeta');
  if (kpiTodayBurned) {
    kpiTodayBurned.className = `kpi-value ${todayStats.burned > 0 ? 'is-expense' : 'is-income'}`;
    animateValue(kpiTodayBurned, todayStats.burned, {
      formatter: (v) => (v > 0.4 ? formatTL(-v) : formatTL(0)),
    });
  }
  if (kpiTodayBurnedMeta) {
    const todayPacks = (todayStats.count / sticksPerPack).toLocaleString('tr-TR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
    kpiTodayBurnedMeta.innerHTML = `
      <span>${todayStats.count} dal • ${escapeHtml(todayPacks)} paket</span>
      <span class="kpi-trend ${todayStats.overLimit ? 'is-down' : 'is-up'}">${todayStats.count}/${dailyLimit} limit</span>
    `;
  }

  const kpiTodayDelta = rootEl.querySelector('#tereaKpiTodayDelta');
  const kpiTodayDeltaMeta = rootEl.querySelector('#tereaKpiTodayDeltaMeta');
  const todayDelta = todayStats.vsBaselineDelta;
  if (kpiTodayDelta) {
    kpiTodayDelta.className = `kpi-value ${todayDelta >= 0 ? 'is-income' : 'is-expense'}`;
    animateValue(kpiTodayDelta, todayDelta, {
      formatter: (v) => formatTL(v, { showSign: true }),
    });
  }
  if (kpiTodayDeltaMeta) {
    const diffSticks = baselineDaily - todayStats.count;
    const diffBadge = diffSticks >= 0
      ? `<span class="kpi-trend is-up">${diffSticks} dal az</span>`
      : `<span class="kpi-trend is-down">${Math.abs(diffSticks)} dal fazla</span>`;
    kpiTodayDeltaMeta.innerHTML = `
      <span>Baz: ${baselineDaily} dal (${escapeHtml(formatTL(todayStats.baselineCost))})</span>
      ${diffBadge}
    `;
  }

  const kpiMonthLabel = rootEl.querySelector('#tereaKpiMonthLabel');
  if (kpiMonthLabel) {
    kpiMonthLabel.textContent = `${formatMonthLabel(activeYm)} Kâr / Zarar`;
  }
  const monthBaselineCost = monthStats.trackedDays * baselineDaily * stickPrice;
  const monthNetDelta = monthBaselineCost - monthStats.totalBurned;
  const kpiMonthNet = rootEl.querySelector('#tereaKpiMonthNet');
  const kpiMonthMeta = rootEl.querySelector('#tereaKpiMonthMeta');
  if (kpiMonthNet) {
    kpiMonthNet.className = `kpi-value ${monthNetDelta >= 0 ? 'is-income' : 'is-expense'}`;
    animateValue(kpiMonthNet, monthNetDelta, {
      formatter: (v) => formatTL(v, { showSign: true }),
    });
  }
  if (kpiMonthMeta) {
    const packsMonth = monthStats.packsUsed.toLocaleString('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    kpiMonthMeta.innerHTML = `
      <span>Yakılan: <strong class="mono">${escapeHtml(formatTL(monthStats.totalBurned))}</strong></span>
      <span class="kpi-trend is-neutral">${monthStats.totalSticks} dal (${escapeHtml(packsMonth)} pkt)</span>
    `;
  }

  // Yearly projection (uses selected month tracked avg if available, else all-time tracked avg; never fake-projects 0 on empty)
  const hasMonthAvg = monthStats.trackedDays > 0;
  const hasAllTimeAvg = allTime.activeDays > 0;
  const projectedAvgDaily = hasMonthAvg
    ? monthStats.avgDaily
    : (hasAllTimeAvg ? allTime.totalSticks / allTime.activeDays : dailyLimit);
  const isTargetPreview = !hasMonthAvg && !hasAllTimeAvg;

  const yearlyCurrentCost = projectedAvgDaily * stickPrice * 365;
  const yearlyOldHabitCost = baselineDaily * stickPrice * 365;
  const yearlyPotentialProfit = yearlyOldHabitCost - yearlyCurrentCost;

  const kpiYearlyProfit = rootEl.querySelector('#tereaKpiYearlyProfit');
  const kpiYearlyMeta = rootEl.querySelector('#tereaKpiYearlyMeta');
  if (kpiYearlyProfit) {
    kpiYearlyProfit.className = `kpi-value ${yearlyPotentialProfit >= 0 ? 'is-income' : 'is-expense'}`;
    animateValue(kpiYearlyProfit, yearlyPotentialProfit, {
      formatter: (v) => formatTL(v, { showSign: true }),
    });
  }
  if (kpiYearlyMeta) {
    const avgLabel = projectedAvgDaily.toLocaleString('tr-TR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const sourceTag = isTargetPreview
      ? `Hedef (${dailyLimit} dal)`
      : `Ort. ${avgLabel} dal/gün`;
    kpiYearlyMeta.innerHTML = `
      <span>${escapeHtml(sourceTag)}: ${escapeHtml(formatTL(yearlyCurrentCost))}/yıl</span>
      <span class="kpi-trend is-neutral">Eski: ${escapeHtml(formatTL(yearlyOldHabitCost))}</span>
    `;
  }

  // 6. 14-Day Trend Chart
  const trendSubtitle = rootEl.querySelector('#tereaTrendSubtitle');
  if (trendSubtitle) {
    trendSubtitle.textContent = `Günlük limit: ${dailyLimit} dal • Eski alışkanlık: ${baselineDaily} dal`;
  }
  const trendBadges = rootEl.querySelector('#tereaTrendBadges');
  if (trendBadges) {
    const tracked14 = last14.filter((d) => d.isTracked);
    const avg14 = tracked14.length > 0
      ? tracked14.reduce((s, d) => s + d.count, 0) / tracked14.length
      : 0;
    const streakHtml = allTime.currentStreakUnderLimit > 0
      ? `<span class="badge badge-income mono">${allTime.currentStreakUnderLimit} gün limit içi seri</span>`
      : '';
    trendBadges.innerHTML = `
      ${streakHtml}
      <span class="badge badge-neutral mono">14G Ort: ${escapeHtml(avg14.toFixed(1).replace('.', ','))} dal</span>
    `;
  }
  const trendChartEl = rootEl.querySelector('#tereaTrendChart');
  if (trendChartEl) {
    renderTereaTrendChart(trendChartEl, last14, {
      dailyLimit,
      baselineDaily,
      stickPrice,
    });
  }

  // 7. Settings Card
  const stickSubtitle = rootEl.querySelector('#tereaStickPriceSubtitle');
  if (stickSubtitle) {
    stickSubtitle.textContent = `1 dal maliyeti: ${formatTL(stickPrice, { decimals: 2 })} • Aylık baz maliyet: ${formatTL(baselineDaily * stickPrice * 30)}`;
  }

  const packInput = rootEl.querySelector('#tereaPackPrice');
  if (packInput && document.activeElement !== packInput) {
    packInput.value = String(packPrice);
  }
  const perPackInput = rootEl.querySelector('#tereaSticksPerPack');
  if (perPackInput && document.activeElement !== perPackInput) {
    perPackInput.value = String(sticksPerPack);
  }
  const limitInput = rootEl.querySelector('#tereaDailyLimit');
  if (limitInput && document.activeElement !== limitInput) {
    limitInput.value = String(dailyLimit);
  }
  const baselineInput = rootEl.querySelector('#tereaBaselineDaily');
  if (baselineInput && document.activeElement !== baselineInput) {
    baselineInput.value = String(baselineDaily);
  }

  const includeCheck = rootEl.querySelector('#tereaIncludeFinance');
  const includeSwitch = rootEl.querySelector('#tereaIncludeFinanceSwitch');
  if (includeCheck) {
    includeCheck.checked = includeInFinance;
  }
  if (includeSwitch) {
    includeSwitch.classList.toggle('is-checked', includeInFinance);
  }

  // 8. Gradual Reduction Presets
  const presetGrid = rootEl.querySelector('#tereaPresetGrid');
  if (presetGrid) {
    presetGrid.innerHTML = REDUCTION_PRESETS.map((preset) => {
      const isActive = dailyLimit === preset.limit;
      const monthlySavings = (baselineDaily - preset.limit) * stickPrice * 30;
      const monthlyText = monthlySavings >= 0
        ? `+${formatTL(monthlySavings)}/ay`
        : `${formatTL(monthlySavings)}/ay`;
      return `
        <button
          type="button"
          class="preset-card ${isActive ? 'is-active' : ''}"
          data-preset-limit="${preset.limit}"
          aria-pressed="${isActive ? 'true' : 'false'}"
        >
          <span class="row-between" style="width:100%;">
            <strong class="mono" style="font-size:15px;color:var(--text-primary);">${escapeHtml(preset.label)}</strong>
            ${isActive ? `<span class="badge badge-primary">Aktif</span>` : ''}
          </span>
          <span style="font-size:12px;font-weight:600;color:var(--text-secondary);">${escapeHtml(preset.desc)}</span>
          <span class="mono" style="font-size:11px;color:${monthlySavings >= 0 ? 'var(--accent-income)' : 'var(--accent-expense)'};font-weight:700;">
            ${escapeHtml(monthlyText)} kâr
          </span>
        </button>
      `;
    }).join('');
  }

  // 9. Recent Days History (click any date to load into hero stepper)
  const recentList = rootEl.querySelector('#tereaRecentList');
  if (recentList) {
    const recentItems = [...last7].reverse();
    recentList.innerHTML = recentItems.map((d) => {
      const isSelected = d.dateStr === selectedDate;
      const rel = formatDateTR(d.dateStr, { relative: true });
      const label = rel === d.dateStr || rel.includes(' ') ? `${d.shortDate} • ${d.dayLabel}` : `${rel} (${d.shortDate})`;
      const delta = (baselineDaily - d.count) * stickPrice;
      const deltaBadge = !d.isTracked && d.count === 0
        ? '<span class="badge badge-neutral">Kayıt yok</span>'
        : delta >= 0
          ? `<span class="badge badge-income mono">${escapeHtml(formatTL(delta, { showSign: true }))}</span>`
          : `<span class="badge badge-expense mono">${escapeHtml(formatTL(delta))}</span>`;

      return `
        <button
          type="button"
          class="row-between"
          data-pick-date="${escapeHtml(d.dateStr)}"
          style="
            width:100%;
            padding:8px 12px;
            border-radius:var(--radius-md);
            background-color:${isSelected ? 'var(--accent-primary-soft)' : 'var(--bg-surface-2)'};
            border:1px solid ${isSelected ? 'var(--accent-primary-border)' : 'var(--border-subtle)'};
            text-align:left;
            transition:background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
          "
        >
          <span class="row-gap" style="gap:8px;min-width:0;">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${escapeHtml(label)}</span>
          </span>
          <span class="row-gap" style="gap:8px;flex-shrink:0;">
            <span class="mono" style="font-size:12px;font-weight:700;color:${d.count > dailyLimit ? 'var(--accent-expense)' : 'var(--text-primary)'};">
              ${d.count} dal
            </span>
            ${deltaBadge}
          </span>
        </button>
      `;
    }).join('');
  }
}

function bindEvents(rootEl, ctx) {
  const countInput = rootEl.querySelector('#tereaCountInput');
  const dateInput = rootEl.querySelector('#tereaDateInput');

  const commitTypedCount = () => {
    if (!countInput) return;
    const raw = countInput.value.trim();
    if (raw === '') {
      const current = getTereaDayStats(selectedDate).count;
      countInput.value = String(current);
      return;
    }
    const parsed = Math.max(0, Math.min(999, Math.floor(Number(raw))));
    if (!Number.isFinite(parsed)) {
      countInput.value = String(getTereaDayStats(selectedDate).count);
      return;
    }
    const prev = getTereaDayStats(selectedDate).count;
    countInput.value = String(parsed);
    if (parsed !== prev || !getTereaDayStats(selectedDate).isTracked) {
      setTereaDayCount(selectedDate, parsed);
      triggerStepperBump(countInput);
    }
  };

  rootEl.querySelector('#tereaPrevDayBtn')?.addEventListener('click', () => {
    selectedDate = shiftDateStr(selectedDate, -1);
    syncTereaDom(rootEl, ctx);
  });

  rootEl.querySelector('#tereaTodayBtn')?.addEventListener('click', () => {
    selectedDate = getLocalDateStr();
    syncTereaDom(rootEl, ctx);
  });

  dateInput?.addEventListener('change', () => {
    const val = dateInput.value;
    selectedDate = DATE_RE.test(val) ? val : getLocalDateStr();
    syncTereaDom(rootEl, ctx);
  });

  rootEl.querySelector('#tereaDecBtn')?.addEventListener('click', () => {
    adjustTereaDayCount(selectedDate, -1);
    triggerStepperBump(countInput);
  });

  rootEl.querySelector('#tereaIncBtn')?.addEventListener('click', () => {
    adjustTereaDayCount(selectedDate, 1);
    triggerStepperBump(countInput);
  });

  rootEl.querySelector('#tereaResetDayBtn')?.addEventListener('click', () => {
    setTereaDayCount(selectedDate, 0);
    triggerStepperBump(countInput);
  });

  rootEl.querySelectorAll('[data-terea-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.tereaDelta) || 0;
      if (delta !== 0) {
        adjustTereaDayCount(selectedDate, delta);
        triggerStepperBump(countInput);
      }
    });
  });

  countInput?.addEventListener('focus', () => {
    countInput.select();
  });

  countInput?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      commitTypedCount();
      countInput.blur();
    } else if (evt.key === 'Escape') {
      countInput.value = String(getTereaDayStats(selectedDate).count);
      countInput.blur();
    }
  });

  countInput?.addEventListener('blur', () => {
    commitTypedCount();
  });

  // Settings form save (both auto-save on change & explicit submit)
  const settingsForm = rootEl.querySelector('#tereaSettingsForm');
  const saveNumericSettings = ({ notify = false } = {}) => {
    const packPrice = Number(rootEl.querySelector('#tereaPackPrice')?.value);
    const sticksPerPack = Number(rootEl.querySelector('#tereaSticksPerPack')?.value);
    const dailyLimit = Number(rootEl.querySelector('#tereaDailyLimit')?.value);
    const baselineDaily = Number(rootEl.querySelector('#tereaBaselineDaily')?.value);

    const patch = {};
    if (Number.isFinite(packPrice) && packPrice > 0) patch.packPrice = packPrice;
    if (Number.isFinite(sticksPerPack) && sticksPerPack >= 1) patch.sticksPerPack = Math.floor(sticksPerPack);
    if (Number.isFinite(dailyLimit) && dailyLimit >= 0) patch.dailyLimit = Math.floor(dailyLimit);
    if (Number.isFinite(baselineDaily) && baselineDaily >= 1) patch.baselineDaily = Math.floor(baselineDaily);

    if (Object.keys(patch).length > 0) {
      updateTereaSettings(patch);
      if (notify) {
        showToast('Terea ayarları kaydedildi.', { type: 'success' });
      }
    }
  };

  settingsForm?.addEventListener('submit', (evt) => {
    evt.preventDefault();
    saveNumericSettings({ notify: true });
  });

  ['#tereaPackPrice', '#tereaSticksPerPack', '#tereaDailyLimit', '#tereaBaselineDaily'].forEach((sel) => {
    rootEl.querySelector(sel)?.addEventListener('change', () => {
      saveNumericSettings({ notify: false });
    });
  });

  const includeCheck = rootEl.querySelector('#tereaIncludeFinance');
  includeCheck?.addEventListener('change', () => {
    const enabled = Boolean(includeCheck.checked);
    updateTereaSettings({ includeInFinance: enabled });
    showToast(
      enabled
        ? 'Terea harcamaları genel finans özetine dahil edildi.'
        : 'Terea harcamaları genel finans özetinden gizlendi.',
      { type: 'info' }
    );
  });

  rootEl.querySelector('#tereaExportCsvBtn')?.addEventListener('click', () => {
    const res = exportTereaCSV();
    showToast(`Terea kayıtları indirildi (${res.rowCount} gün).`, { type: 'success' });
  });

  // Delegated click handlers for presets & recent days list
  rootEl.querySelector('#tereaPresetGrid')?.addEventListener('click', (evt) => {
    const btn = evt.target.closest('[data-preset-limit]');
    if (!btn) return;
    const limit = Math.max(0, Math.floor(Number(btn.dataset.presetLimit) || 0));
    updateTereaSettings({ dailyLimit: limit });
    showToast(
      limit === 0
        ? 'Hedef "0 dal / Tam Özgürlük" olarak güncellendi!'
        : `Günlük hedef limit ${limit} dal olarak güncellendi.`,
      { type: 'success' }
    );
  });

  rootEl.querySelector('#tereaRecentList')?.addEventListener('click', (evt) => {
    const btn = evt.target.closest('[data-pick-date]');
    if (!btn) return;
    const picked = btn.dataset.pickDate;
    if (DATE_RE.test(picked)) {
      selectedDate = picked;
      syncTereaDom(rootEl, ctx);
    }
  });
}

export function renderTerea(rootEl, ctx = {}) {
  if (!rootEl) return;

  if (ctx?.routeParams?.date && DATE_RE.test(ctx.routeParams.date)) {
    selectedDate = ctx.routeParams.date;
  }

  const alreadyMounted = Boolean(rootEl.querySelector('[data-view="terea-root"]'));
  if (!alreadyMounted) {
    rootEl.innerHTML = renderTemplate();
    bindEvents(rootEl, ctx);
  }

  syncTereaDom(rootEl, ctx);
}
