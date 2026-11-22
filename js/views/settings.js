/**
 * js/views/settings.js
 * Ayarlar, Sabit Gelir, Anahtarlı Yerel Kasa, Şifreli Taşıma (BTK1),
 * Firebase Gerçek Zamanlı Bulut Senkronizasyonu, Kategori Yönetimi & Dışa/İçe Aktarım
 */

import {
  getState,
  updateProfile,
  addCategory,
  updateCategory,
  deleteCategory,
  resetAllData,
} from '../state.js';
import {
  getActiveLocalKey,
  listLocalKeys,
  setActiveLocalKey,
  deleteLocalKey,
  createEncryptedSyncToken,
  importEncryptedSyncToken,
  getSyncInfo,
  getSyncRoomCode,
  saveSyncRoomCode,
  getCustomFirebaseConfig,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig,
  forceSyncNow,
} from '../storage.js';
import {
  escapeHtml,
  formatTL,
  formatMonthLabel,
  icon,
  openModal,
  showToast,
  CATEGORY_ICON_OPTIONS,
  CATEGORY_COLOR_OPTIONS,
} from '../ui.js';
import {
  exportTransactionsCSV,
  exportTereaCSV,
  exportFullJSON,
  importBackupJSON,
  openPrintableReport,
} from '../export.js';

let categoryModalType = 'expense';
let categoryModalIcon = 'tag';
let categoryModalColor = CATEGORY_COLOR_OPTIONS[0];

function getSyncBadgeMeta(info) {
  switch (info?.status) {
    case 'synced':
      return { pillCls: 'is-synced', dotCls: 'is-ok', badgeCls: 'badge-income' };
    case 'syncing':
      return { pillCls: 'is-syncing', dotCls: 'is-syncing', badgeCls: 'badge-warn' };
    case 'error':
      return { pillCls: 'is-error', dotCls: 'is-error', badgeCls: 'badge-expense' };
    default:
      return { pillCls: '', dotCls: '', badgeCls: 'badge-neutral' };
  }
}

async function copyTextToClipboard(text, successMsg) {
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(successMsg || 'Panoya kopyalandı.', { type: 'success' });
    return true;
  } catch {
    showToast('Otomatik kopyalanamadı. Metni seçip kopyalayabilirsin.', { type: 'warn' });
    return false;
  }
}

function renderTemplate() {
  return `
    <div class="stack-lg anim-enter" data-view="settings-root">
      <!-- ==================== 1. AYLIK SABİT GELİR & PROFİL ==================== -->
      <section id="settingsIncomeCard" class="card stack-md" aria-label="Aylık Sabit Gelir ve Profil">
        <div class="card-header" style="margin-bottom:0;">
          <div>
            <h2 class="card-title">Aylık Sabit Gelir &amp; Profil</h2>
            <p class="card-subtitle">Sabit maaş/gelir tutarın, ödeme günün ve arayüz görünümün</p>
          </div>
          <span class="badge badge-primary">
            ${icon('wallet', 13)}
            <span id="settingsIncomeBadge">0 ₺ / ay</span>
          </span>
        </div>

        <form id="settingsIncomeForm" class="stack-md" novalidate>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Aylık Sabit Gelir (₺)</span>
              <div class="input-group">
                <input
                  type="number"
                  id="settingsMonthlyIncome"
                  class="input mono"
                  min="0"
                  step="50"
                  placeholder="Örn: 45000"
                />
                <span class="input-group-addon">₺</span>
              </div>
            </label>

            <label class="field">
              <span class="field-label">Maaş / Gelir Günü (1-31)</span>
              <div class="input-group">
                <input
                  type="number"
                  id="settingsIncomePayday"
                  class="input mono"
                  min="1"
                  max="31"
                  step="1"
                  placeholder="1"
                />
                <span class="input-group-addon">. Gün</span>
              </div>
            </label>
          </div>

          <div class="row-between wrap" style="gap:12px;">
            <div class="stack-sm" style="gap:4px;">
              <span class="field-label">Arayüz Teması</span>
              <div class="segmented" role="group" aria-label="Tema seçimi">
                <button type="button" id="settingsThemeDarkBtn" class="segmented-btn" data-theme-choice="dark">
                  ${icon('moon', 14)}
                  <span>Koyu Tema</span>
                </button>
                <button type="button" id="settingsThemeLightBtn" class="segmented-btn" data-theme-choice="light">
                  ${icon('sun', 14)}
                  <span>Aydınlık Tema</span>
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary">
              ${icon('check', 15)}
              <span>Gelir &amp; Profili Kaydet</span>
            </button>
          </div>
        </form>
      </section>

      <!-- ==================== 2. SENKRONİZASYON & ANAHTARLI KASA ==================== -->
      <section id="settingsSyncCard" class="card stack-lg" aria-label="Senkronizasyon ve Anahtarlı Kasa">
        <div class="card-header" style="margin-bottom:0;">
          <div>
            <h2 class="card-title">Senkronizasyon &amp; Anahtar ile Yerel Kayıt</h2>
            <p class="card-subtitle">
              Anahtar ile farklı yerel kasalar aç, şifreli kod ile cihazlar arası aktar veya Firebase buluta bağla
            </p>
          </div>
          <div id="settingsCloudPill" class="sync-pill">
            <span id="settingsCloudDot" class="sync-dot"></span>
            <span id="settingsCloudStatusText">Yerel Mod</span>
          </div>
        </div>

        <!-- 2A. Anahtar ile Yerel Kasa -->
        <div class="stack-md" style="padding:var(--space-4);border-radius:var(--radius-md);background-color:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <div class="row-between wrap" style="gap:8px;">
            <div class="row-gap" style="gap:8px;">
              ${icon('key', 16)}
              <strong style="font-size:14px;color:var(--text-primary);">2A. Anahtar ile Yerel Kasa (Local Vault Key)</strong>
            </div>
            <span id="settingsActiveVaultBadge" class="badge badge-primary mono">Aktif: default</span>
          </div>

          <p style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Kişisel bir anahtar (ör. <code class="mono">emre-2026</code>) girerek izole edilmiş yerel kasa oluşturabilir veya mevcut kasalar arasında geçiş yapabilirsin.
          </p>

          <form id="settingsVaultForm" class="stack-sm" novalidate>
            <div class="row-gap wrap" style="gap:10px;">
              <input
                type="text"
                id="settingsVaultKeyInput"
                class="input mono"
                style="flex:1;min-width:200px;"
                placeholder="Örn: emre-2026 veya is-butcesi"
                aria-label="Yerel kasa anahtarı"
              />
              <button type="submit" class="btn btn-primary">
                ${icon('key', 15)}
                <span>Kasaya Geç / Oluştur</span>
              </button>
            </div>

            <label class="row-gap" style="gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer;user-select:none;">
              <input type="checkbox" id="settingsVaultCopyCurrent" style="width:16px;height:16px;accent-color:var(--accent-primary);" />
              <span>Yeni anahtar oluşturulursa mevcut verileri yeni anahtara kopyala</span>
            </label>
          </form>

          <div class="stack-sm">
            <span class="field-label">Kayıtlı Yerel Kasalar</span>
            <div id="settingsVaultChips" class="chip-grid"></div>
          </div>
        </div>

        <!-- 2B. Şifreli Taşıma Anahtarı (BTK1) -->
        <div class="stack-md" style="padding:var(--space-4);border-radius:var(--radius-md);background-color:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <div class="row-between wrap" style="gap:8px;">
            <div class="row-gap" style="gap:8px;">
              ${icon('sliders', 16)}
              <strong style="font-size:14px;color:var(--text-primary);">2B. Şifreli Taşıma Anahtarı (Cihazlar Arası Bulutsuz Aktarım)</strong>
            </div>
            <span class="badge badge-neutral mono">AES-GCM • BTK1</span>
          </div>

          <p style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Hiçbir sunucuya ihtiyaç duymadan tüm finans ve Terea verilerini belirlediğin parola ile şifreleyip telefon, tablet veya başka tarayıcıya aktar.
          </p>

          <div class="grid-2">
            <!-- Create encrypted token -->
            <div class="stack-sm">
              <label class="field">
                <span class="field-label">Şifreleme Parolası (en az 4 karakter)</span>
                <input
                  type="password"
                  id="settingsTokenCreatePass"
                  class="input"
                  placeholder="Gizli parolanı yaz"
                  autocomplete="new-password"
                />
              </label>
              <div class="row-gap wrap" style="gap:8px;">
                <button type="button" id="settingsCreateTokenBtn" class="btn btn-primary btn-sm">
                  ${icon('key', 14)}
                  <span>Şifreli Kod Oluştur</span>
                </button>
                <button type="button" id="settingsCopyTokenBtn" class="btn btn-secondary btn-sm hidden">
                  ${icon('copy', 14)}
                  <span>Kodu Kopyala</span>
                </button>
              </div>
              <textarea
                id="settingsTokenOutput"
                class="textarea mono hidden"
                rows="3"
                readonly
                style="font-size:11px;"
                aria-label="Oluşturulan şifreli aktarım kodu"
              ></textarea>
            </div>

            <!-- Import encrypted token -->
            <div class="stack-sm">
              <label class="field">
                <span class="field-label">Aktarım Kodu (BTK1:...)</span>
                <textarea
                  id="settingsTokenImportInput"
                  class="textarea mono"
                  rows="3"
                  style="font-size:11px;"
                  placeholder="Diğer cihazdan kopyaladığın BTK1:... kodunu buraya yapıştır"
                ></textarea>
              </label>
              <label class="field">
                <span class="field-label">Çözme Parolası</span>
                <input
                  type="password"
                  id="settingsTokenImportPass"
                  class="input"
                  placeholder="Oluştururken kullandığın parola"
                  autocomplete="off"
                />
              </label>
              <div>
                <button type="button" id="settingsImportTokenBtn" class="btn btn-success btn-sm">
                  ${icon('upload', 14)}
                  <span>Kodu Çöz &amp; İçe Aktar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2C. Firebase Gerçek Zamanlı Bulut Senkronizasyonu -->
        <div class="stack-md" style="padding:var(--space-4);border-radius:var(--radius-md);background-color:var(--bg-surface-2);border:1px solid var(--border-subtle);">
          <div class="row-between wrap" style="gap:8px;">
            <div class="row-gap" style="gap:8px;">
              ${icon('cloud', 16)}
              <strong style="font-size:14px;color:var(--text-primary);">2C. Firebase Gerçek Zamanlı Bulut Senkronizasyonu</strong>
            </div>
            <span id="settingsCloudSourceBadge" class="badge badge-neutral">Kaynak: Yok</span>
          </div>

          <div id="settingsCloudMetaBox" style="font-size:12px;color:var(--text-secondary);line-height:1.5;"></div>

          <div class="form-grid">
            <div class="field">
              <span class="field-label">Kişisel Senkronizasyon Oda Kodu</span>
              <div class="row-gap" style="gap:8px;">
                <input
                  type="text"
                  id="settingsSyncRoomInput"
                  class="input mono"
                  placeholder="Örn: emre-gizli-oda-2026"
                />
                <button type="button" id="settingsSaveRoomBtn" class="btn btn-primary btn-sm">Kaydet</button>
                <button type="button" id="settingsCopyRoomBtn" class="btn btn-secondary btn-sm" aria-label="Oda kodunu kopyala" title="Oda kodunu kopyala">
                  ${icon('copy', 14)}
                </button>
              </div>
            </div>

            <div class="field" style="justify-content:flex-end;">
              <span class="field-label">Anlık Eşitleme</span>
              <div class="row-gap wrap" style="gap:8px;">
                <button type="button" id="settingsForceSyncBtn" class="btn btn-secondary">
                  ${icon('refresh', 15)}
                  <span>Şimdi Eşitle</span>
                </button>
                <button type="button" id="settingsClearFirebaseBtn" class="btn btn-ghost btn-sm">
                  Özel Yapılandırmayı Temizle
                </button>
              </div>
            </div>

            <label class="field field-full">
              <span class="field-label">Firebase Web Config (JSON veya Firebase Console snippet)</span>
              <textarea
                id="settingsFirebaseConfigInput"
                class="textarea mono"
                rows="4"
                style="font-size:12px;"
                placeholder='{"apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..."}'
              ></textarea>
            </label>
          </div>

          <div class="row-between wrap" style="gap:10px;">
            <span style="font-size:12px;color:var(--text-muted);line-height:1.45;">
              GitHub Pages için: Firebase Console &rarr; Project Settings &rarr; Your apps (Web) nesnesini yapıştırıp kaydet; ardından diğer cihazlarda aynı Oda Kodunu gir. Firestore Anonymous Auth ve kuralların açık olduğundan emin ol.
            </span>
            <button type="button" id="settingsSaveFirebaseBtn" class="btn btn-primary btn-sm">
              ${icon('cloud', 14)}
              <span>Firebase Yapılandırmasını Kaydet</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ==================== 3. KATEGORİ YÖNETİMİ ==================== -->
      <section id="settingsCategoriesCard" class="card stack-md" aria-label="Kategori Yönetimi">
        <div class="card-header" style="margin-bottom:0;">
          <div>
            <h2 class="card-title">Kategori Yönetimi</h2>
            <p class="card-subtitle">Harcama ve gelir kategorilerini özelleştir, yeni kategori ekle</p>
          </div>
          <button type="button" id="settingsAddCategoryBtn" class="btn btn-primary btn-sm">
            ${icon('plus', 14)}
            <span>Yeni Kategori</span>
          </button>
        </div>

        <div class="grid-2">
          <div class="stack-sm">
            <div class="row-between">
              <span class="field-label" style="text-transform:uppercase;letter-spacing:0.04em;">Gider Kategorileri</span>
              <span id="settingsExpenseCatCount" class="badge badge-expense mono">0</span>
            </div>
            <div id="settingsExpenseCategories" class="stack-sm"></div>
          </div>

          <div class="stack-sm">
            <div class="row-between">
              <span class="field-label" style="text-transform:uppercase;letter-spacing:0.04em;">Gelir Kategorileri</span>
              <span id="settingsIncomeCatCount" class="badge badge-income mono">0</span>
            </div>
            <div id="settingsIncomeCategories" class="stack-sm"></div>
          </div>
        </div>
      </section>

      <!-- ==================== 4. VERİ DIŞA / İÇE AKTARMA & YEDEKLEME ==================== -->
      <section id="settingsExportCard" class="card stack-md" aria-label="Veri Dışa ve İçe Aktarma">
        <div class="card-header" style="margin-bottom:0;">
          <div>
            <h2 class="card-title">Veri Dışa / İçe Aktarma &amp; Yedekleme</h2>
            <p class="card-subtitle">Türkçe Excel uyumlu CSV dosyaları, yazdırılabilir PDF özet ve JSON tam yedekleme</p>
          </div>
        </div>

        <div class="grid-3">
          <button type="button" id="expMonthCsvBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('download', 16)}
            <span id="expMonthCsvLabel" class="truncate">Harcamalar CSV (Seçili Ay)</span>
          </button>

          <button type="button" id="expAllCsvBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('download', 16)}
            <span class="truncate">Tüm Harcamalar CSV</span>
          </button>

          <button type="button" id="expTereaCsvBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('flame', 16)}
            <span class="truncate">Terea Kayıtları CSV</span>
          </button>

          <button type="button" id="expPrintReportBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('print', 16)}
            <span class="truncate">Aylık Rapor Yazdır / PDF</span>
          </button>

          <button type="button" id="expFullJsonBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('download', 16)}
            <span class="truncate">Tam Yedek İndir (JSON)</span>
          </button>

          <button type="button" id="impJsonBtn" class="btn btn-secondary" style="justify-content:flex-start;">
            ${icon('upload', 16)}
            <span class="truncate">Yedek Yükle (JSON)</span>
          </button>
          <input type="file" id="impJsonFileInput" accept=".json,application/json" class="hidden" />
        </div>

        <!-- Tehlikeli Bölge -->
        <div
          class="row-between wrap"
          style="
            margin-top:var(--space-2);
            padding:var(--space-4);
            border-radius:var(--radius-md);
            background-color:var(--accent-expense-soft);
            border:1px solid var(--accent-expense-border);
            gap:12px;
          "
        >
          <div class="stack-sm" style="gap:2px;">
            <strong style="font-size:14px;color:var(--accent-expense);">Tehlikeli Bölge</strong>
            <span style="font-size:12px;color:var(--text-secondary);">
              Aktif yerel kasadaki tüm işlemler, hedefler, sabit gelir ve Terea geçmişi sıfırlanır.
            </span>
          </div>
          <button type="button" id="settingsResetAllBtn" class="btn btn-danger btn-sm">
            ${icon('trash', 14)}
            <span>Tüm Verileri Sıfırla</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function openCategoryModal(existingCategory = null) {
  const isEdit = Boolean(existingCategory);
  categoryModalType = existingCategory?.type === 'income' ? 'income' : 'expense';
  categoryModalIcon = existingCategory?.icon || 'tag';
  categoryModalColor = existingCategory?.color || CATEGORY_COLOR_OPTIONS[0];

  const iconButtonsHtml = CATEGORY_ICON_OPTIONS.map((opt) => `
    <button
      type="button"
      class="category-chip ${opt.id === categoryModalIcon ? 'is-selected' : ''}"
      data-pick-icon="${escapeHtml(opt.id)}"
      title="${escapeHtml(opt.label)}"
    >
      ${icon(opt.id, 15)}
      <span>${escapeHtml(opt.label)}</span>
    </button>
  `).join('');

  const colorButtonsHtml = CATEGORY_COLOR_OPTIONS.map((hex) => `
    <button
      type="button"
      class="color-swatch ${hex.toLowerCase() === categoryModalColor.toLowerCase() ? 'is-selected' : ''}"
      data-pick-color="${escapeHtml(hex)}"
      style="background-color:${escapeHtml(hex)};"
      aria-label="Renk ${escapeHtml(hex)}"
    ></button>
  `).join('');

  openModal({
    title: isEdit ? 'Kategoriyi Düzenle' : 'Yeni Kategori Oluştur',
    width: '540px',
    bodyHtml: `
      <form id="catModalForm" class="stack-md" novalidate>
        <label class="field">
          <span class="field-label">Kategori Adı</span>
          <input
            type="text"
            id="catModalName"
            class="input"
            maxlength="40"
            value="${escapeHtml(existingCategory?.name || '')}"
            placeholder="Örn: Kahve, Spor, Prim"
            required
          />
        </label>

        <div class="field">
          <span class="field-label">Kategori Türü</span>
          <div class="segmented" role="group" aria-label="Kategori türü">
            <button type="button" class="segmented-btn ${categoryModalType === 'expense' ? 'is-active' : ''}" data-pick-type="expense">Gider</button>
            <button type="button" class="segmented-btn ${categoryModalType === 'income' ? 'is-active' : ''}" data-pick-type="income">Gelir</button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">Simge Seç</span>
          <div id="catModalIcons" class="chip-grid" style="max-height:160px;overflow-y:auto;padding:2px;">
            ${iconButtonsHtml}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Renk Seç</span>
          <div id="catModalColors" class="chip-grid">
            ${colorButtonsHtml}
          </div>
        </div>

        <div class="modal-footer" style="margin:0 calc(var(--space-5) * -1) calc(var(--space-5) * -1);">
          <button type="button" id="catModalCancelBtn" class="btn btn-ghost">Vazgeç</button>
          <button type="submit" class="btn btn-primary">
            ${icon('check', 15)}
            <span>${isEdit ? 'Değişiklikleri Kaydet' : 'Kategori Ekle'}</span>
          </button>
        </div>
      </form>
    `,
    onMount: (bodyEl, closeFn) => {
      bodyEl.querySelectorAll('[data-pick-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          categoryModalType = btn.dataset.pickType === 'income' ? 'income' : 'expense';
          bodyEl.querySelectorAll('[data-pick-type]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.pickType === categoryModalType);
          });
        });
      });

      bodyEl.querySelector('#catModalIcons')?.addEventListener('click', (evt) => {
        const chip = evt.target.closest('[data-pick-icon]');
        if (!chip) return;
        categoryModalIcon = chip.dataset.pickIcon;
        bodyEl.querySelectorAll('[data-pick-icon]').forEach((el) => {
          el.classList.toggle('is-selected', el.dataset.pickIcon === categoryModalIcon);
        });
      });

      bodyEl.querySelector('#catModalColors')?.addEventListener('click', (evt) => {
        const swatch = evt.target.closest('[data-pick-color]');
        if (!swatch) return;
        categoryModalColor = swatch.dataset.pickColor;
        bodyEl.querySelectorAll('[data-pick-color]').forEach((el) => {
          el.classList.toggle('is-selected', el.dataset.pickColor === categoryModalColor);
        });
      });

      bodyEl.querySelector('#catModalCancelBtn')?.addEventListener('click', closeFn);

      bodyEl.querySelector('#catModalForm')?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const name = bodyEl.querySelector('#catModalName')?.value.trim() || '';
        if (!name) {
          showToast('Lütfen bir kategori adı gir.', { type: 'warn' });
          bodyEl.querySelector('#catModalName')?.focus();
          return;
        }
        if (isEdit) {
          updateCategory(existingCategory.id, {
            name,
            type: categoryModalType,
            icon: categoryModalIcon,
            color: categoryModalColor,
          });
          showToast(`"${name}" kategorisi güncellendi.`, { type: 'success' });
        } else {
          addCategory({
            name,
            type: categoryModalType,
            icon: categoryModalIcon,
            color: categoryModalColor,
          });
          showToast(`"${name}" kategorisi eklendi.`, { type: 'success' });
        }
        closeFn();
      });
    },
  });
}

function openDeleteCategoryConfirmModal(cat) {
  openModal({
    title: 'Kategoriyi Sil',
    width: '440px',
    bodyHtml: `
      <div class="stack-md">
        <p style="font-size:14px;color:var(--text-secondary);line-height:1.55;">
          <strong style="color:var(--text-primary);">${escapeHtml(cat.name)}</strong> kategorisini silmek istediğine emin misin?
          Bu kategoriye ait eski işlemler korunmaya devam eder.
        </p>
        <div class="modal-footer" style="margin:0 calc(var(--space-5) * -1) calc(var(--space-5) * -1);">
          <button type="button" id="delCatCancelBtn" class="btn btn-secondary">Vazgeç</button>
          <button type="button" id="delCatConfirmBtn" class="btn btn-danger">
            ${icon('trash', 14)}
            <span>Kategoriyi Sil</span>
          </button>
        </div>
      </div>
    `,
    onMount: (bodyEl, closeFn) => {
      bodyEl.querySelector('#delCatCancelBtn')?.addEventListener('click', closeFn);
      bodyEl.querySelector('#delCatConfirmBtn')?.addEventListener('click', () => {
        deleteCategory(cat.id);
        showToast(`"${cat.name}" kategorisi silindi.`, { type: 'info' });
        closeFn();
      });
    },
  });
}

function openResetAllModal() {
  openModal({
    title: 'Tüm Verileri Sıfırla',
    width: '460px',
    bodyHtml: `
      <div class="stack-md">
        <div class="insight-item" style="border-color:var(--accent-expense-border);background-color:var(--accent-expense-soft);">
          <span class="insight-dot is-danger"></span>
          <div style="color:var(--text-primary);font-size:13px;">
            Bu işlem aktif yerel kasadaki (<strong>${escapeHtml(getActiveLocalKey())}</strong>) tüm harcamaları, gelirleri, hedefleri ve Terea kayıtlarını kalıcı olarak temizler.
          </div>
        </div>

        <label class="field">
          <span class="field-label">Onaylamak için kutuya <strong class="mono">SIFIRLA</strong> yaz</span>
          <input type="text" id="resetConfirmInput" class="input mono" placeholder="SIFIRLA" autocomplete="off" />
        </label>

        <div class="modal-footer" style="margin:0 calc(var(--space-5) * -1) calc(var(--space-5) * -1);">
          <button type="button" id="resetCancelBtn" class="btn btn-secondary">Vazgeç</button>
          <button type="button" id="resetConfirmBtn" class="btn btn-danger" disabled>
            ${icon('trash', 14)}
            <span>Kalıcı Olarak Sıfırla</span>
          </button>
        </div>
      </div>
    `,
    onMount: (bodyEl, closeFn) => {
      const input = bodyEl.querySelector('#resetConfirmInput');
      const confirmBtn = bodyEl.querySelector('#resetConfirmBtn');
      bodyEl.querySelector('#resetCancelBtn')?.addEventListener('click', closeFn);

      input?.addEventListener('input', () => {
        if (confirmBtn) {
          confirmBtn.disabled = input.value.trim().toUpperCase() !== 'SIFIRLA';
        }
      });

      confirmBtn?.addEventListener('click', () => {
        resetAllData();
        document.documentElement.dataset.theme = 'dark';
        showToast('Aktif kasadaki tüm veriler sıfırlandı.', { type: 'info' });
        closeFn();
      });
    },
  });
}

function renderCategoryListHtml(items) {
  if (!items || items.length === 0) {
    return `<div style="padding:12px;border-radius:var(--radius-md);border:1px dashed var(--border-strong);font-size:12px;color:var(--text-muted);text-align:center;">Bu türde kategori bulunmuyor.</div>`;
  }
  return items.map((cat) => `
    <div
      class="row-between"
      style="padding:8px 12px;border-radius:var(--radius-md);background-color:var(--bg-surface-2);border:1px solid var(--border-subtle);"
    >
      <div class="row-gap" style="gap:10px;min-width:0;">
        <span
          class="tx-icon"
          style="width:32px;height:32px;color:${escapeHtml(cat.color)};border-color:${escapeHtml(cat.color)}33;background-color:${escapeHtml(cat.color)}18;"
        >
          ${icon(cat.icon, 15)}
        </span>
        <span class="truncate" style="font-size:13px;font-weight:600;color:var(--text-primary);">${escapeHtml(cat.name)}</span>
      </div>
      <div class="row-gap" style="gap:4px;flex-shrink:0;">
        <button
          type="button"
          class="icon-btn"
          style="width:30px;height:30px;"
          data-cat-edit="${escapeHtml(cat.id)}"
          aria-label="${escapeHtml(cat.name)} kategorisini düzenle"
          title="Düzenle"
        >
          ${icon('edit', 14)}
        </button>
        <button
          type="button"
          class="icon-btn"
          style="width:30px;height:30px;color:var(--accent-expense);"
          data-cat-delete="${escapeHtml(cat.id)}"
          aria-label="${escapeHtml(cat.name)} kategorisini sil"
          title="Sil"
        >
          ${icon('trash', 14)}
        </button>
      </div>
    </div>
  `).join('');
}

function syncSettingsDom(rootEl, ctx) {
  const state = getState();
  const profile = state.profile || {};
  const syncInfo = getSyncInfo();
  const activeKey = getActiveLocalKey();
  const localKeys = listLocalKeys();

  // 1. Income & Profile
  const incomeBadge = rootEl.querySelector('#settingsIncomeBadge');
  if (incomeBadge) {
    incomeBadge.textContent = `${formatTL(profile.monthlyFixedIncome || 0)} / ay`;
  }

  const incomeInput = rootEl.querySelector('#settingsMonthlyIncome');
  if (incomeInput && document.activeElement !== incomeInput) {
    incomeInput.value = String(profile.monthlyFixedIncome || 0);
  }
  const paydayInput = rootEl.querySelector('#settingsIncomePayday');
  if (paydayInput && document.activeElement !== paydayInput) {
    paydayInput.value = String(profile.incomePayday || 1);
  }

  const activeTheme = profile.theme === 'light' ? 'light' : 'dark';
  rootEl.querySelector('#settingsThemeDarkBtn')?.classList.toggle('is-active', activeTheme === 'dark');
  rootEl.querySelector('#settingsThemeLightBtn')?.classList.toggle('is-active', activeTheme === 'light');

  // 2. Sync Status Header Pill
  const badgeMeta = getSyncBadgeMeta(syncInfo);
  const cloudPill = rootEl.querySelector('#settingsCloudPill');
  const cloudDot = rootEl.querySelector('#settingsCloudDot');
  const cloudStatusText = rootEl.querySelector('#settingsCloudStatusText');
  if (cloudPill) cloudPill.className = `sync-pill ${badgeMeta.pillCls}`;
  if (cloudDot) cloudDot.className = `sync-dot ${badgeMeta.dotCls}`;
  if (cloudStatusText) cloudStatusText.textContent = syncInfo.message || 'Yerel Mod';

  // 2A. Local Vault Keys
  const activeVaultBadge = rootEl.querySelector('#settingsActiveVaultBadge');
  if (activeVaultBadge) {
    activeVaultBadge.textContent = `Aktif: ${activeKey}`;
  }
  const vaultChips = rootEl.querySelector('#settingsVaultChips');
  if (vaultChips) {
    vaultChips.innerHTML = localKeys.map((item) => {
      const canDelete = !item.isActive && localKeys.length > 1;
      return `
        <div class="row-gap" style="gap:4px;">
          <button
            type="button"
            class="category-chip mono ${item.isActive ? 'is-selected' : ''}"
            data-switch-vault="${escapeHtml(item.key)}"
          >
            ${icon('key', 13)}
            <span>${escapeHtml(item.key)}</span>
            <span style="opacity:0.75;font-weight:500;">(${item.txCount} işl • ${item.tereaDays}g)</span>
          </button>
          ${canDelete ? `
            <button
              type="button"
              class="icon-btn"
              style="width:28px;height:28px;border-radius:var(--radius-full);color:var(--accent-expense);"
              data-delete-vault="${escapeHtml(item.key)}"
              aria-label="${escapeHtml(item.key)} kasasını sil"
              title="Kasayı Sil"
            >
              ${icon('x', 12)}
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // 2C. Firebase Cloud Sync
  const sourceLabels = {
    canvas: 'Kaynak: Ortam (Canvas)',
    github: 'Kaynak: GitHub Config',
    custom: 'Kaynak: Özel Yapılandırma',
    none: 'Kaynak: Kurulmadı',
  };
  const sourceBadge = rootEl.querySelector('#settingsCloudSourceBadge');
  if (sourceBadge) {
    sourceBadge.textContent = sourceLabels[syncInfo.source] || 'Kaynak: Yerel';
    sourceBadge.className = `badge ${syncInfo.isCloudConnected ? 'badge-income' : 'badge-neutral'}`;
  }

  const cloudMetaBox = rootEl.querySelector('#settingsCloudMetaBox');
  if (cloudMetaBox) {
    const parts = [];
    if (syncInfo.roomId) parts.push(`Oda: <strong class="mono">${escapeHtml(syncInfo.roomId)}</strong>`);
    if (syncInfo.lastSyncTimeStr) parts.push(`Son eşitleme: <strong class="mono">${escapeHtml(syncInfo.lastSyncTimeStr)}</strong>`);
    if (syncInfo.lastError) {
      parts.push(`<span style="color:var(--accent-expense);">Hata: ${escapeHtml(syncInfo.lastError)}</span>`);
    }
    cloudMetaBox.innerHTML = parts.length > 0
      ? parts.join(' • ')
      : 'Bulut eşitlemeyi etkinleştirmek için aşağıya Firebase Web Config ve ortak bir Oda Kodu gir.';
  }

  const roomInput = rootEl.querySelector('#settingsSyncRoomInput');
  if (roomInput && document.activeElement !== roomInput) {
    roomInput.value = getSyncRoomCode() || '';
  }

  const fbInput = rootEl.querySelector('#settingsFirebaseConfigInput');
  const existingCustomFb = getCustomFirebaseConfig();
  if (fbInput && document.activeElement !== fbInput && !fbInput.value.trim() && existingCustomFb) {
    fbInput.value = JSON.stringify(existingCustomFb, null, 2);
  }
  const clearFbBtn = rootEl.querySelector('#settingsClearFirebaseBtn');
  if (clearFbBtn) {
    clearFbBtn.disabled = !existingCustomFb;
  }

  // 3. Categories
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const expenseCats = categories.filter((c) => c.type !== 'income');
  const incomeCats = categories.filter((c) => c.type === 'income');

  const expCountEl = rootEl.querySelector('#settingsExpenseCatCount');
  const incCountEl = rootEl.querySelector('#settingsIncomeCatCount');
  if (expCountEl) expCountEl.textContent = String(expenseCats.length);
  if (incCountEl) incCountEl.textContent = String(incomeCats.length);

  const expListEl = rootEl.querySelector('#settingsExpenseCategories');
  const incListEl = rootEl.querySelector('#settingsIncomeCategories');
  if (expListEl) expListEl.innerHTML = renderCategoryListHtml(expenseCats);
  if (incListEl) incListEl.innerHTML = renderCategoryListHtml(incomeCats);

  // 4. Export month label
  const monthCsvLabel = rootEl.querySelector('#expMonthCsvLabel');
  if (monthCsvLabel && ctx?.ym) {
    monthCsvLabel.textContent = `Harcamalar CSV (${formatMonthLabel(ctx.ym)})`;
  }
}

function bindEvents(rootEl, ctx) {
  // 1. Income & Profile
  rootEl.querySelector('#settingsIncomeForm')?.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const rawIncome = Number(rootEl.querySelector('#settingsMonthlyIncome')?.value);
    const rawPayday = Number(rootEl.querySelector('#settingsIncomePayday')?.value);
    const monthlyFixedIncome = Number.isFinite(rawIncome) && rawIncome >= 0 ? rawIncome : 0;
    const incomePayday = Number.isFinite(rawPayday) ? Math.min(31, Math.max(1, Math.floor(rawPayday))) : 1;

    updateProfile({ monthlyFixedIncome, incomePayday });
    showToast(`Sabit gelir (${formatTL(monthlyFixedIncome)}) ve profil kaydedildi.`, { type: 'success' });
  });

  rootEl.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTheme = btn.dataset.themeChoice === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      updateProfile({ theme: nextTheme });
      showToast(nextTheme === 'light' ? 'Aydınlık tema etkin.' : 'Koyu tema etkin.', { type: 'info' });
    });
  });

  // 2A. Local Vault Switching
  rootEl.querySelector('#settingsVaultForm')?.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const inputEl = rootEl.querySelector('#settingsVaultKeyInput');
    const copyCheck = rootEl.querySelector('#settingsVaultCopyCurrent');
    const rawKey = inputEl?.value.trim() || '';
    if (!rawKey) {
      showToast('Lütfen bir yerel kasa anahtarı yaz.', { type: 'warn' });
      inputEl?.focus();
      return;
    }
    const res = setActiveLocalKey(rawKey, { copyCurrent: Boolean(copyCheck?.checked) });
    if (inputEl) inputEl.value = '';
    if (res.copied) {
      showToast(`"${res.key}" kasası oluşturuldu ve mevcut veriler kopyalandı.`, { type: 'success' });
    } else if (res.existed) {
      showToast(`"${res.key}" yerel kasasına geçildi.`, { type: 'success' });
    } else {
      showToast(`Yeni boş yerel kasa "${res.key}" açıldı.`, { type: 'info' });
    }
    syncSettingsDom(rootEl, ctx);
  });

  rootEl.querySelector('#settingsVaultChips')?.addEventListener('click', (evt) => {
    const delBtn = evt.target.closest('[data-delete-vault]');
    if (delBtn) {
      const targetKey = delBtn.dataset.deleteVault;
      const res = deleteLocalKey(targetKey);
      if (res.ok) {
        showToast(`"${res.key}" yerel kasası silindi.`, { type: 'info' });
        syncSettingsDom(rootEl, ctx);
      } else {
        showToast(res.reason || 'Kasa silinemedi.', { type: 'error' });
      }
      return;
    }

    const switchBtn = evt.target.closest('[data-switch-vault]');
    if (switchBtn) {
      const targetKey = switchBtn.dataset.switchVault;
      if (targetKey === getActiveLocalKey()) return;
      const res = setActiveLocalKey(targetKey, { copyCurrent: false });
      showToast(`"${res.key}" yerel kasasına geçildi.`, { type: 'success' });
      syncSettingsDom(rootEl, ctx);
    }
  });

  // 2B. Portable Encrypted Sync Token (BTK1)
  rootEl.querySelector('#settingsCreateTokenBtn')?.addEventListener('click', async () => {
    const passEl = rootEl.querySelector('#settingsTokenCreatePass');
    const outEl = rootEl.querySelector('#settingsTokenOutput');
    const copyBtn = rootEl.querySelector('#settingsCopyTokenBtn');
    const pass = passEl?.value || '';

    try {
      const token = await createEncryptedSyncToken(pass);
      if (outEl) {
        outEl.value = token;
        outEl.classList.remove('hidden');
      }
      if (copyBtn) {
        copyBtn.classList.remove('hidden');
      }
      showToast('Şifreli taşıma kodu (BTK1) oluşturuldu.', { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'Şifreli kod oluşturulamadı.', { type: 'error' });
    }
  });

  rootEl.querySelector('#settingsCopyTokenBtn')?.addEventListener('click', () => {
    const outEl = rootEl.querySelector('#settingsTokenOutput');
    if (outEl?.value) {
      copyTextToClipboard(outEl.value, 'Şifreli aktarım kodu panoya kopyalandı.');
    }
  });

  rootEl.querySelector('#settingsImportTokenBtn')?.addEventListener('click', async () => {
    const tokenEl = rootEl.querySelector('#settingsTokenImportInput');
    const passEl = rootEl.querySelector('#settingsTokenImportPass');
    const token = tokenEl?.value.trim() || '';
    const pass = passEl?.value || '';

    try {
      const imported = await importEncryptedSyncToken(token, pass);
      if (tokenEl) tokenEl.value = '';
      if (passEl) passEl.value = '';
      document.documentElement.dataset.theme = imported.profile?.theme === 'light' ? 'light' : 'dark';
      showToast(`Veriler çözüldü ve aktarıldı (${imported.transactions.length} işlem).`, { type: 'success' });
    } catch (err) {
      showToast(err?.message || 'Kod çözülemedi.', { type: 'error' });
    }
  });

  // 2C. Firebase Sync
  rootEl.querySelector('#settingsSaveRoomBtn')?.addEventListener('click', () => {
    const code = rootEl.querySelector('#settingsSyncRoomInput')?.value || '';
    const res = saveSyncRoomCode(code);
    if (!res.ok) {
      showToast(res.error || 'Geçersiz oda kodu.', { type: 'warn' });
      return;
    }
    showToast(`Oda kodu "${res.roomId}" kaydedildi, bağlantı deneniyor...`, { type: 'success' });
  });

  rootEl.querySelector('#settingsCopyRoomBtn')?.addEventListener('click', () => {
    const val = rootEl.querySelector('#settingsSyncRoomInput')?.value.trim() || getSyncRoomCode();
    if (!val) {
      showToast('Kopyalanacak oda kodu yok.', { type: 'warn' });
      return;
    }
    copyTextToClipboard(val, `Oda kodu (${val}) kopyalandı.`);
  });

  rootEl.querySelector('#settingsSaveFirebaseBtn')?.addEventListener('click', () => {
    const rawJson = rootEl.querySelector('#settingsFirebaseConfigInput')?.value || '';
    const res = saveCustomFirebaseConfig(rawJson);
    if (!res.ok) {
      showToast(res.error || 'Geçersiz Firebase yapılandırması.', { type: 'error' });
      return;
    }
    showToast('Firebase yapılandırması kaydedildi, bulut eşitleme başlatılıyor.', { type: 'success' });
  });

  rootEl.querySelector('#settingsClearFirebaseBtn')?.addEventListener('click', () => {
    clearCustomFirebaseConfig();
    const fbInput = rootEl.querySelector('#settingsFirebaseConfigInput');
    if (fbInput) fbInput.value = '';
    showToast('Özel Firebase yapılandırması temizlendi.', { type: 'info' });
    syncSettingsDom(rootEl, ctx);
  });

  rootEl.querySelector('#settingsForceSyncBtn')?.addEventListener('click', async () => {
    const ok = await forceSyncNow();
    if (ok) {
      showToast('Bulut ile senkronizasyon tamamlandı.', { type: 'success' });
    } else {
      showToast('Bulut bağlantısı hazır değil. Oda kodu ve Firebase yapılandırmasını kontrol et.', { type: 'warn' });
    }
  });

  // 3. Category Management
  rootEl.querySelector('#settingsAddCategoryBtn')?.addEventListener('click', () => {
    openCategoryModal(null);
  });

  const handleCatListClick = (evt) => {
    const editBtn = evt.target.closest('[data-cat-edit]');
    if (editBtn) {
      const cat = getState().categories.find((c) => c.id === editBtn.dataset.catEdit);
      if (cat) openCategoryModal(cat);
      return;
    }
    const delBtn = evt.target.closest('[data-cat-delete]');
    if (delBtn) {
      const cat = getState().categories.find((c) => c.id === delBtn.dataset.catDelete);
      if (cat) openDeleteCategoryConfirmModal(cat);
    }
  };
  rootEl.querySelector('#settingsExpenseCategories')?.addEventListener('click', handleCatListClick);
  rootEl.querySelector('#settingsIncomeCategories')?.addEventListener('click', handleCatListClick);

  // 4. Exports & Imports
  rootEl.querySelector('#expMonthCsvBtn')?.addEventListener('click', () => {
    const res = exportTransactionsCSV({ scope: 'month', ym: ctx?.ym });
    showToast(`${res.rowCount} satırlık aylık CSV indirildi.`, { type: 'success' });
  });

  rootEl.querySelector('#expAllCsvBtn')?.addEventListener('click', () => {
    const res = exportTransactionsCSV({ scope: 'all' });
    showToast(`${res.rowCount} satırlık tüm işlemler CSV indirildi.`, { type: 'success' });
  });

  rootEl.querySelector('#expTereaCsvBtn')?.addEventListener('click', () => {
    const res = exportTereaCSV();
    showToast(`${res.rowCount} günlük Terea CSV indirildi.`, { type: 'success' });
  });

  rootEl.querySelector('#expPrintReportBtn')?.addEventListener('click', () => {
    const res = openPrintableReport(ctx?.ym);
    if (res.mode === 'download_fallback') {
      showToast('Yazdırma penceresi engellendi; HTML rapor indirildi.', { type: 'info' });
    }
  });

  rootEl.querySelector('#expFullJsonBtn')?.addEventListener('click', () => {
    exportFullJSON();
    showToast('Tam JSON yedeği indirildi.', { type: 'success' });
  });

  const fileInput = rootEl.querySelector('#impJsonFileInput');
  rootEl.querySelector('#impJsonBtn')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = importBackupJSON(text);
      if (!res.ok) {
        showToast(res.error || 'Yedek yüklenemedi.', { type: 'error' });
        return;
      }
      const nextTheme = getState().profile?.theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      const sum = res.summary;
      showToast(
        `Yedek yüklendi: ${sum.transactionsCount} işlem, ${sum.tereaDays} Terea günü (${sum.totalTereaSticks} dal).`,
        { type: 'success', duration: 4500 }
      );
    } catch {
      showToast('Dosya okunamadı.', { type: 'error' });
    }
  });

  // Danger zone
  rootEl.querySelector('#settingsResetAllBtn')?.addEventListener('click', () => {
    openResetAllModal();
  });
}

function focusRequestedSection(rootEl, focusTarget) {
  if (!focusTarget) return;
  const targetMap = {
    income: '#settingsIncomeCard',
    sync: '#settingsSyncCard',
    categories: '#settingsCategoriesCard',
    export: '#settingsExportCard',
  };
  const sel = targetMap[focusTarget];
  if (!sel) return;
  const el = rootEl.querySelector(sel);
  if (!el) return;

  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusTarget === 'income') {
      rootEl.querySelector('#settingsMonthlyIncome')?.focus();
    } else if (focusTarget === 'sync') {
      rootEl.querySelector('#settingsVaultKeyInput')?.focus();
    }
  });
}

export function updateSettingsSyncIndicator(rootEl) {
  if (!rootEl || !rootEl.querySelector('[data-view="settings-root"]')) return;
  syncSettingsDom(rootEl, {});
}

export function renderSettings(rootEl, ctx = {}) {
  if (!rootEl) return;

  const alreadyMounted = Boolean(rootEl.querySelector('[data-view="settings-root"]'));
  if (!alreadyMounted) {
    rootEl.innerHTML = renderTemplate();
    bindEvents(rootEl, ctx);
  }

  syncSettingsDom(rootEl, ctx);

  if (ctx?.routeParams?.focus) {
    focusRequestedSection(rootEl, ctx.routeParams.focus);
  }
}
