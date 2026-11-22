/**
 * js/export.js
 * CSV (Türkçe Excel Uyumlu UTF-8 BOM + ';'), JSON Yedekleme/Geri Yükleme ve Yazdırılabilir Özet Rapor
 */

import {
  getState,
  setState,
  getSelectedMonth,
  getLocalDateStr,
  getCurrentMonthStr,
  getTereaStickPrice,
  getTereaDayStats,
  getTereaMonthStats,
  getMonthFinanceSummary,
  normalizeAndMigrateState,
} from './state.js';

// ============================================================================
// INTERNAL FORMATTING & DOWNLOAD HELPERS
// ============================================================================

const PAYMENT_METHOD_LABELS = {
  card: 'Kart',
  cash: 'Nakit',
  transfer: 'Havale / EFT',
};

const TURKISH_MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function formatMonthLabel(ym) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
  const [year, month] = ym.split('-').map(Number);
  return `${TURKISH_MONTH_NAMES[month - 1] || month} ${year}`;
}

function formatMoneyTL(amount) {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe)} TL`;
}

function formatNumberCsv(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  // Format decimal with comma or integer cleanly for Turkish Excel
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  // Prevent CSV formula injection while preserving plain numbers/negatives
  const safeStr = /^[=+@\t\r]/.test(str) ? `'${str}` : str;
  if (/[;"\r\n]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 250);
}

// ============================================================================
// 1. TRANSACTIONS CSV EXPORT (TURKISH EXCEL READY)
// ============================================================================

export function exportTransactionsCSV(options = {}) {
  const {
    scope = 'month',
    ym = getSelectedMonth() || getCurrentMonthStr(),
    includeTerea = true,
  } = options || {};

  const state = getState();
  const safeScope = scope === 'all' ? 'all' : 'month';
  const monthPrefix = `${ym}-`;
  const categoryMap = new Map((state.categories || []).map((c) => [c.id, c]));

  const rows = [];

  for (const tx of state.transactions || []) {
    if (!tx) continue;
    if (safeScope === 'month' && (!tx.dateStr || !tx.dateStr.startsWith(monthPrefix))) {
      continue;
    }
    const cat = categoryMap.get(tx.categoryId);
    const typeLabel = tx.type === 'income' ? 'Gelir' : 'Gider';
    const catLabel = cat ? cat.name : (tx.categoryId || (tx.type === 'income' ? 'Ek Gelir' : 'Diğer Gider'));
    const payLabel = PAYMENT_METHOD_LABELS[tx.paymentMethod] || 'Kart';

    rows.push({
      dateStr: tx.dateStr || '',
      typeLabel,
      category: catLabel,
      amount: Number(tx.amount) || 0,
      paymentMethod: payLabel,
      note: tx.note || '',
    });
  }

  if (includeTerea && state.terea?.settings?.includeInFinance !== false) {
    const counts = state.terea?.dailyCounts || {};
    const stickPrice = getTereaStickPrice(state);

    for (const [dateStr, rawCount] of Object.entries(counts)) {
      if (safeScope === 'month' && !dateStr.startsWith(monthPrefix)) {
        continue;
      }
      const count = Math.max(0, Math.floor(Number(rawCount) || 0));
      if (count <= 0) continue;

      rows.push({
        dateStr,
        typeLabel: 'Gider',
        category: 'Terea Silver',
        amount: count * stickPrice,
        paymentMethod: 'Otomatik (Terea)',
        note: `${count} dal tüketim`,
      });
    }
  }

  rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const header = ['Tarih', 'Tür', 'Kategori', 'Tutar (TL)', 'Ödeme Yöntemi', 'Not'];
  const csvLines = [
    header.map(escapeCsvField).join(';'),
    ...rows.map((r) => [
      escapeCsvField(r.dateStr),
      escapeCsvField(r.typeLabel),
      escapeCsvField(r.category),
      escapeCsvField(formatNumberCsv(r.amount)),
      escapeCsvField(r.paymentMethod),
      escapeCsvField(r.note),
    ].join(';')),
  ];

  const csvBody = '\uFEFF' + csvLines.join('\r\n');
  const scopeTag = safeScope === 'month' ? ym : `tumu-${getLocalDateStr()}`;
  const filename = `butce-harcamalar-${scopeTag}.csv`;
  triggerFileDownload(csvBody, filename, 'text/csv;charset=utf-8;');

  return {
    ok: true,
    filename,
    rowCount: rows.length,
  };
}

// ============================================================================
// 2. TEREA DAILY RECORDS CSV EXPORT
// ============================================================================

export function exportTereaCSV() {
  const state = getState();
  const counts = state.terea?.dailyCounts || {};
  const dates = Object.keys(counts).sort((a, b) => b.localeCompare(a));

  const header = [
    'Tarih',
    'İçilen Dal',
    'Günlük Limit',
    'Harcanan (TL)',
    'Eski Alışkanlığa Göre Kâr/Zarar (TL)',
  ];

  const lines = [header.map(escapeCsvField).join(';')];

  for (const dateStr of dates) {
    const dayStats = getTereaDayStats(dateStr, state);
    lines.push([
      escapeCsvField(dateStr),
      escapeCsvField(dayStats.count),
      escapeCsvField(dayStats.limit),
      escapeCsvField(formatNumberCsv(dayStats.burned)),
      escapeCsvField(formatNumberCsv(dayStats.vsBaselineDelta)),
    ].join(';'));
  }

  const csvBody = '\uFEFF' + lines.join('\r\n');
  const filename = `terea-takip-${getLocalDateStr()}.csv`;
  triggerFileDownload(csvBody, filename, 'text/csv;charset=utf-8;');

  return {
    ok: true,
    filename,
    rowCount: dates.length,
  };
}

// ============================================================================
// 3. FULL JSON BACKUP EXPORT & IMPORT (SUPPORTS V3 + LEGACY V1/V2)
// ============================================================================

export function exportFullJSON() {
  const state = getState();
  const jsonText = JSON.stringify(state, null, 2);
  const filename = `butce-terea-yedek-${getLocalDateStr()}.json`;
  triggerFileDownload(jsonText, filename, 'application/json;charset=utf-8;');
  return {
    ok: true,
    filename,
  };
}

export function importBackupJSON(fileText) {
  if (typeof fileText !== 'string' || !fileText.trim()) {
    return {
      ok: false,
      error: 'Boş dosya veya geçersiz metin.',
      summary: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    return {
      ok: false,
      error: 'JSON ayrıştırma hatası. Dosya formatı bozuk olabilir.',
      summary: null,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Geçersiz yedek yapısı (nesne bekleniyor).',
      summary: null,
    };
  }

  const looksLikeV3 = Number(parsed.version) >= 3
    || Array.isArray(parsed.transactions)
    || Boolean(parsed.terea && typeof parsed.terea === 'object');
  const looksLikeLegacy = Array.isArray(parsed.logs)
    || Boolean(parsed.settings && typeof parsed.settings === 'object');

  if (!looksLikeV3 && !looksLikeLegacy) {
    return {
      ok: false,
      error: 'Tanınmayan yedek dosyası. Bütçe/Terea v3 veya v1/v2 yedeği seçin.',
      summary: null,
    };
  }

  const sourceVersion = looksLikeV3 && Number(parsed.version) >= 3 ? 'v3' : 'legacy_v1_v2';
  const migrated = normalizeAndMigrateState(parsed);
  migrated.updatedAt = Date.now();

  setState(migrated);

  const tereaDays = Object.keys(migrated.terea?.dailyCounts || {}).length;
  const totalTereaSticks = Object.values(migrated.terea?.dailyCounts || {})
    .reduce((sum, n) => sum + (Number(n) || 0), 0);

  return {
    ok: true,
    summary: {
      sourceVersion,
      transactionsCount: migrated.transactions.length,
      categoriesCount: migrated.categories.length,
      recurringCount: migrated.recurring.length,
      savingsGoalsCount: migrated.savingsGoals.length,
      tereaDays,
      totalTereaSticks,
    },
  };
}

// ============================================================================
// 4. PRINTABLE MONTHLY FINANCIAL & TEREA SUMMARY REPORT
// ============================================================================

export function openPrintableReport(ym = getSelectedMonth() || getCurrentMonthStr()) {
  const state = getState();
  const finance = getMonthFinanceSummary(ym, state);
  const tereaMonth = getTereaMonthStats(ym, state);
  const stickPrice = getTereaStickPrice(state);
  const baselineDaily = Number(state.terea?.settings?.baselineDaily) || 25;
  const monthLabel = formatMonthLabel(finance.ym);
  const generatedAt = new Date().toLocaleString('tr-TR');

  const baselineCostForTracked = tereaMonth.trackedDays * baselineDaily * stickPrice;
  const tereaNetDelta = baselineCostForTracked - tereaMonth.totalBurned;

  const monthTransactions = (state.transactions || [])
    .filter((tx) => tx && typeof tx.dateStr === 'string' && tx.dateStr.startsWith(`${finance.ym}-`))
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  const categoryMap = new Map((state.categories || []).map((c) => [c.id, c]));

  const categoryRowsHtml = finance.categoryBreakdown.length > 0
    ? finance.categoryBreakdown.map((cat) => `
      <tr>
        <td><span class="dot" style="background:${escapeHtml(cat.color)}"></span>${escapeHtml(cat.name)}</td>
        <td class="num">${escapeHtml(cat.count)}</td>
        <td class="num">%${escapeHtml(cat.pct)}</td>
        <td class="num">${cat.limit > 0 ? escapeHtml(formatMoneyTL(cat.limit)) : '—'}</td>
        <td class="num bold">${escapeHtml(formatMoneyTL(cat.total))}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="5" class="empty">Bu ay için kategori harcaması bulunmuyor.</td></tr>`;

  const goalsRowsHtml = (state.savingsGoals || []).length > 0
    ? state.savingsGoals.map((g) => {
        const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
        return `
          <tr>
            <td>${escapeHtml(g.title)}</td>
            <td class="num">${escapeHtml(formatMoneyTL(g.currentAmount))}</td>
            <td class="num">${escapeHtml(formatMoneyTL(g.targetAmount))}</td>
            <td class="num bold">%${pct}</td>
            <td>${g.deadline ? escapeHtml(g.deadline) : '—'}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="empty">Henüz birikim hedefi tanımlanmadı.</td></tr>`;

  const txRowsHtml = monthTransactions.length > 0
    ? monthTransactions.slice(0, 80).map((tx) => {
        const cat = categoryMap.get(tx.categoryId);
        const typeLabel = tx.type === 'income' ? 'Gelir' : 'Gider';
        return `
          <tr>
            <td>${escapeHtml(tx.dateStr)}</td>
            <td><span class="pill ${tx.type === 'income' ? 'pill-good' : 'pill-bad'}">${typeLabel}</span></td>
            <td>${escapeHtml(cat ? cat.name : tx.categoryId)}</td>
            <td>${escapeHtml(PAYMENT_METHOD_LABELS[tx.paymentMethod] || 'Kart')}</td>
            <td>${escapeHtml(tx.note || '—')}</td>
            <td class="num bold">${tx.type === 'income' ? '+' : '-'}${escapeHtml(formatMoneyTL(tx.amount))}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="6" class="empty">Bu ay için kayıtlı finans işlemi bulunmuyor.</td></tr>`;

  const reportHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>Aylık Bütçe &amp; Terea Raporu - ${escapeHtml(monthLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 28px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
    .header .meta { font-size: 12px; color: #475569; text-align: right; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      background: #f8fafc;
    }
    .kpi .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .kpi .val { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .kpi .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .good { color: #059669; }
    .bad { color: #dc2626; }
    h2 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #334155;
      margin: 22px 0 8px;
      border-left: 3px solid #0f172a;
      padding-left: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 12px;
    }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 8px 6px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bold { font-weight: 700; }
    .empty { text-align: center; color: #64748b; padding: 14px; }
    .dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 9999px;
      margin-right: 6px;
      vertical-align: middle;
    }
    .pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
    }
    .pill-good { background: #d1fae5; color: #065f46; }
    .pill-bad { background: #fee2e2; color: #991b1b; }
    .terea-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      border: 1px solid #fecdd3;
      background: #fff1f2;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .terea-box .label { font-size: 11px; color: #9f1239; font-weight: 600; }
    .terea-box .val { font-size: 15px; font-weight: 700; color: #881337; margin-top: 3px; }
    @media print {
      body { padding: 12px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>BÜTÇE &amp; TEREA KONTROL RAPORU</h1>
      <div style="font-size:13px;color:#475569;margin-top:2px;">Dönem: <strong>${escapeHtml(monthLabel)}</strong> (${escapeHtml(finance.ym)})</div>
    </div>
    <div class="meta">
      Oluşturulma: ${escapeHtml(generatedAt)}<br/>
      Para Birimi: ${escapeHtml(state.profile?.currency || 'TRY')}
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="label">Toplam Gelir</div>
      <div class="val good">${escapeHtml(formatMoneyTL(finance.totalIncome))}</div>
      <div class="sub">Sabit: ${escapeHtml(formatMoneyTL(finance.fixedIncome))} + Ek: ${escapeHtml(formatMoneyTL(finance.extraIncome))}</div>
    </div>
    <div class="kpi">
      <div class="label">Toplam Gider</div>
      <div class="val bad">${escapeHtml(formatMoneyTL(finance.totalExpense))}</div>
      <div class="sub">İşlemler: ${escapeHtml(formatMoneyTL(finance.expenseTransactionsTotal))} + Terea: ${escapeHtml(formatMoneyTL(finance.tereaExpense))}</div>
    </div>
    <div class="kpi">
      <div class="label">Net Bakiye</div>
      <div class="val ${finance.netBalance >= 0 ? 'good' : 'bad'}">${escapeHtml(formatMoneyTL(finance.netBalance))}</div>
      <div class="sub">Tasarruf Oranı: %${escapeHtml(finance.savingsRate)}</div>
    </div>
    <div class="kpi">
      <div class="label">Günlük Güvenli Limit</div>
      <div class="val">${escapeHtml(formatMoneyTL(finance.dailySafeSpend))}</div>
      <div class="sub">${finance.overallBudgetLimit > 0 ? `Hedef: ${escapeHtml(formatMoneyTL(finance.overallBudgetLimit))} (%${finance.overallBudgetPct})` : 'Genel hedef tanımlı değil'}</div>
    </div>
  </div>

  <h2>Terea Silver Özeti</h2>
  <div class="terea-box">
    <div>
      <div class="label">Toplam Tüketim</div>
      <div class="val">${escapeHtml(tereaMonth.totalSticks)} dal (${escapeHtml(tereaMonth.packsUsed)} pkt)</div>
    </div>
    <div>
      <div class="label">Günlük Ortalama</div>
      <div class="val">${escapeHtml(tereaMonth.avgDaily.toFixed(1))} dal / gün (${escapeHtml(tereaMonth.trackedDays)} gün)</div>
    </div>
    <div>
      <div class="label">Yakılan Tutar</div>
      <div class="val">${escapeHtml(formatMoneyTL(tereaMonth.totalBurned))}</div>
    </div>
    <div>
      <div class="label">Eski Alışkanlığa Göre (${baselineDaily} dal)</div>
      <div class="val ${tereaNetDelta >= 0 ? 'good' : 'bad'}">${tereaNetDelta >= 0 ? '+' : ''}${escapeHtml(formatMoneyTL(tereaNetDelta))}</div>
    </div>
  </div>

  <h2>Kategori Dağılımı</h2>
  <table>
    <thead>
      <tr>
        <th>Kategori</th>
        <th class="num">Adet / Dal</th>
        <th class="num">Pay</th>
        <th class="num">Limit</th>
        <th class="num">Toplam</th>
      </tr>
    </thead>
    <tbody>${categoryRowsHtml}</tbody>
  </table>

  <h2>Birikim Hedefleri</h2>
  <table>
    <thead>
      <tr>
        <th>Hedef</th>
        <th class="num">Biriken</th>
        <th class="num">Hedef Tutar</th>
        <th class="num">İlerleme</th>
        <th>Son Tarih</th>
      </tr>
    </thead>
    <tbody>${goalsRowsHtml}</tbody>
  </table>

  <h2>Dönem İşlemleri ${monthTransactions.length > 80 ? '(Son 80 İşlem)' : ''}</h2>
  <table>
    <thead>
      <tr>
        <th>Tarih</th>
        <th>Tür</th>
        <th>Kategori</th>
        <th>Ödeme</th>
        <th>Not</th>
        <th class="num">Tutar</th>
      </tr>
    </thead>
    <tbody>${txRowsHtml}</tbody>
  </table>
</body>
</html>`;

  const printWin = typeof window !== 'undefined' ? window.open('', '_blank', 'width=960,height=760') : null;
  if (printWin) {
    printWin.document.open();
    printWin.document.write(reportHtml);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      try {
        printWin.print();
      } catch {
        // Ignore print dialog failure in restricted contexts
      }
    }, 300);
    return { ok: true, mode: 'print_window', ym: finance.ym };
  }

  // Fallback if popup is blocked by browser
  const filename = `butce-terea-rapor-${finance.ym}.html`;
  triggerFileDownload(reportHtml, filename, 'text/html;charset=utf-8;');
  return { ok: true, mode: 'download_fallback', filename, ym: finance.ym };
}
