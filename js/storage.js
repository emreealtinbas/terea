/**
 * js/storage.js
 * Yerel Kasa Anahtarı (Local Vault) Depolama + Taşınabilir Şifreli Aktarım Anahtarı (BTK1)
 * + Firebase Gerçek Zamanlı Bulut Senkronizasyonu
 */

import {
  getState,
  setState,
  registerCommitHook,
  normalizeAndMigrateState,
  createDefaultState,
} from './state.js';

// ============================================================================
// 0. GITHUB PAGES FIREBASE YAPILANDIRMASI (BURAYI DOLDURUP YÜKLEYEBİLİRSİN)
// ============================================================================
// Firebase Console -> Project Settings -> Your apps (Web) bölümünden aldığın
// bilgileri aşağıdaki tırnak içlerine yapıştırırsan tüm cihazların otomatik bağlanır.
// Dilersen boş bırakıp uygulamanın Ayarlar sekmesinden de yapıştırabilirsin.
export const GITHUB_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// ============================================================================
// 1. STORAGE & SYNC KEYS
// ============================================================================

export const LEGACY_STORAGE_KEY_V2 = 'terea_kontrol_protocol_v2';
export const LEGACY_STORAGE_KEY_V1 = 'terea_kontrol_protocol_v1';
export const ACTIVE_LOCAL_KEY_META = 'bt_active_local_key';
export const VAULT_KEY_PREFIX = 'bt_vault_v3_';
export const SYNC_ROOM_KEY = 'terea_sync_room_id';
export const CUSTOM_FB_CONFIG_KEY = 'terea_custom_firebase_config';

const APP_ID_DEFAULT = 'terea-kontrol-app';
const FIREBASE_SDK_VERSION = '11.6.1';
const BTK1_PREFIX = 'BTK1:';

// ============================================================================
// 2. RUNTIME STATE FOR STORAGE & SYNC
// ============================================================================

let fbApp = null;
let fbAuth = null;
let fbDb = null;
let fbModules = null;
let currentUser = null;
let unsubscribeSnapshot = null;

let activeConfigSource = 'none'; // 'canvas' | 'github' | 'custom' | 'none'
let syncStatus = 'local'; // 'local' | 'syncing' | 'synced' | 'error'
let syncMessage = 'Yerel Mod';
let lastSyncTime = null;
let lastSyncTimeStr = '';
let lastError = null;
let initialized = false;

const syncListeners = new Set();

// ============================================================================
// 3. SAFE LOCALSTORAGE & KEY HELPERS
// ============================================================================

function getStorageSafe() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Storage access blocked (e.g., private browsing restriction)
  }
  return null;
}

function lsGet(key) {
  const ls = getStorageSafe();
  if (!ls) return null;
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  const ls = getStorageSafe();
  if (!ls) return false;
  try {
    ls.setItem(key, value);
    return true;
  } catch (err) {
    console.error('localStorage yazma hatası (kota/izin):', err);
    return false;
  }
}

function lsRemove(key) {
  const ls = getStorageSafe();
  if (!ls) return false;
  try {
    ls.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function sanitizeVaultKey(rawKey) {
  if (typeof rawKey !== 'string') return 'default';
  const cleaned = rawKey
    .trim()
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'default';
}

function sanitizeRoomCode(rawCode) {
  if (typeof rawCode !== 'string') return '';
  return rawCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatTimeHHMM(ts) {
  try {
    return new Date(ts).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getVaultStorageKey(safeKey) {
  return `${VAULT_KEY_PREFIX}${safeKey}`;
}

function getAppNamespaceId() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.__app_id === 'string' && globalThis.__app_id) {
    return globalThis.__app_id;
  }
  return APP_ID_DEFAULT;
}

// ============================================================================
// 4. LOCAL VAULT PERSISTENCE & MULTI-KEY SWITCHING
// ============================================================================

export function getActiveLocalKey() {
  const saved = lsGet(ACTIVE_LOCAL_KEY_META);
  return sanitizeVaultKey(saved || 'default');
}

function saveStateToVault(safeKey, targetState) {
  const serialized = JSON.stringify(targetState);
  const ok = lsSet(getVaultStorageKey(safeKey), serialized);
  if (!ok) {
    console.warn(`Kasa (${safeKey}) localStorage'a kaydedilemedi.`);
  }
  return ok;
}

function loadRawVaultState(safeKey) {
  const vaultRaw = lsGet(getVaultStorageKey(safeKey));
  if (vaultRaw) {
    try {
      return JSON.parse(vaultRaw);
    } catch (err) {
      console.error(`Kasa (${safeKey}) JSON bozuk:`, err);
    }
  }

  // Fallback for 'default' key from legacy v2/v1 keys if bt_vault_v3_default doesn't exist yet
  if (safeKey === 'default') {
    const legacyRaw = lsGet(LEGACY_STORAGE_KEY_V2) || lsGet(LEGACY_STORAGE_KEY_V1);
    if (legacyRaw) {
      try {
        return JSON.parse(legacyRaw);
      } catch (err) {
        console.error('Eski Terea v1/v2 verisi bozuk:', err);
      }
    }
  }

  return null;
}

export function listLocalKeys() {
  const ls = getStorageSafe();
  const activeKey = getActiveLocalKey();
  const foundMap = new Map();

  if (ls) {
    try {
      for (let i = 0; i < ls.length; i++) {
        const storageKey = ls.key(i);
        if (!storageKey || !storageKey.startsWith(VAULT_KEY_PREFIX)) continue;
        const keyName = storageKey.slice(VAULT_KEY_PREFIX.length);
        if (!keyName) continue;

        let updatedAt = null;
        let txCount = 0;
        let tereaDays = 0;
        try {
          const parsed = JSON.parse(ls.getItem(storageKey) || 'null');
          if (parsed && typeof parsed === 'object') {
            updatedAt = Number(parsed.updatedAt) || null;
            txCount = Array.isArray(parsed.transactions) ? parsed.transactions.length : 0;
            tereaDays = parsed.terea && parsed.terea.dailyCounts && typeof parsed.terea.dailyCounts === 'object'
              ? Object.keys(parsed.terea.dailyCounts).length
              : 0;
          }
        } catch {
          // Corrupted preview metadata, still list key so user can see/manage
        }

        foundMap.set(keyName, {
          key: keyName,
          storageKey,
          isActive: keyName === activeKey,
          updatedAt,
          txCount,
          tereaDays,
        });
      }
    } catch (err) {
      console.error('Kasa listesi okunamadı:', err);
    }
  }

  if (!foundMap.has(activeKey)) {
    foundMap.set(activeKey, {
      key: activeKey,
      storageKey: getVaultStorageKey(activeKey),
      isActive: true,
      updatedAt: getState().updatedAt || null,
      txCount: getState().transactions.length,
      tereaDays: Object.keys(getState().terea.dailyCounts || {}).length,
    });
  }

  return Array.from(foundMap.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.key === 'default') return -1;
    if (b.key === 'default') return 1;
    return a.key.localeCompare(b.key);
  });
}

export function setActiveLocalKey(rawKey, options = {}) {
  const { copyCurrent = false } = options || {};
  const safeKey = sanitizeVaultKey(rawKey);
  const previousKey = getActiveLocalKey();

  // Persist current key before switching
  saveStateToVault(previousKey, getState());
  lsSet(ACTIVE_LOCAL_KEY_META, safeKey);

  let nextState;
  const existingRaw = loadRawVaultState(safeKey);

  if (existingRaw) {
    nextState = normalizeAndMigrateState(existingRaw);
  } else if (copyCurrent) {
    const cloned = JSON.parse(JSON.stringify(getState()));
    cloned.updatedAt = Date.now();
    nextState = normalizeAndMigrateState(cloned);
  } else {
    nextState = createDefaultState();
  }

  saveStateToVault(safeKey, nextState);
  setState(nextState, { fromRemote: true });

  emitSyncInfo();
  return {
    key: safeKey,
    existed: Boolean(existingRaw),
    copied: Boolean(!existingRaw && copyCurrent),
  };
}

export function deleteLocalKey(rawKey) {
  const safeKey = sanitizeVaultKey(rawKey);
  const activeKey = getActiveLocalKey();
  if (safeKey === activeKey) {
    return { ok: false, reason: 'Aktif kasa silinemez. Önce başka bir kasaya geç.' };
  }
  const removed = lsRemove(getVaultStorageKey(safeKey));
  return { ok: removed, key: safeKey };
}

// ============================================================================
// 5. PORTABLE ENCRYPTED TRANSFER KEY (PBKDF2 + AES-GCM, BTK1:<base64>)
// ============================================================================

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getWebCrypto() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (!c || !c.subtle) {
    throw new Error('Bu tarayıcı ortamında Web Crypto API (crypto.subtle) kullanılamıyor (HTTPS veya localhost gerekir).');
  }
  return c;
}

async function deriveAesKey(passphrase, salt, usage) {
  const webCrypto = getWebCrypto();
  const encoder = new TextEncoder();
  const baseKey = await webCrypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function createEncryptedSyncToken(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.trim().length < 4) {
    throw new Error('Şifreleme anahtarı en az 4 karakter olmalıdır.');
  }
  const webCrypto = getWebCrypto();
  const cleanPass = passphrase.trim();
  const salt = webCrypto.getRandomValues(new Uint8Array(16));
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(cleanPass, salt, 'encrypt');

  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(JSON.stringify(getState()));
  const cipherBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    payloadBytes
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  // Format: [1 byte version=1][16 bytes salt][12 bytes iv][ciphertext]
  const combined = new Uint8Array(1 + salt.length + iv.length + cipherBytes.length);
  combined[0] = 1;
  combined.set(salt, 1);
  combined.set(iv, 1 + salt.length);
  combined.set(cipherBytes, 1 + salt.length + iv.length);

  return `${BTK1_PREFIX}${bytesToBase64(combined)}`;
}

export async function importEncryptedSyncToken(token, passphrase) {
  if (typeof token !== 'string' || !token.trim().startsWith(BTK1_PREFIX)) {
    throw new Error('Geçersiz aktarım anahtarı formatı (BTK1: ile başlamalı).');
  }
  if (typeof passphrase !== 'string' || passphrase.trim().length < 4) {
    throw new Error('Şifre çözme anahtarı en az 4 karakter olmalıdır.');
  }

  const webCrypto = getWebCrypto();
  const b64 = token.trim().slice(BTK1_PREFIX.length).replace(/\s+/g, '');

  let combined;
  try {
    combined = base64ToBytes(b64);
  } catch {
    throw new Error('Aktarım anahtarı Base64 verisi bozuk.');
  }

  if (combined.length < 30 || combined[0] !== 1) {
    throw new Error('Desteklenmeyen veya bozuk aktarım paketi.');
  }

  const salt = combined.slice(1, 17);
  const iv = combined.slice(17, 29);
  const cipherBytes = combined.slice(29);
  const aesKey = await deriveAesKey(passphrase.trim(), salt, 'decrypt');

  let plainBuffer;
  try {
    plainBuffer = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      cipherBytes
    );
  } catch {
    throw new Error('Şifre hatalı veya aktarım verisi bozulmuş.');
  }

  let parsed;
  try {
    const decoder = new TextDecoder();
    parsed = JSON.parse(decoder.decode(plainBuffer));
  } catch {
    throw new Error('Çözülen veri geçerli JSON değil.');
  }

  const migrated = normalizeAndMigrateState(parsed);
  migrated.updatedAt = Date.now();
  setState(migrated);
  return migrated;
}

// ============================================================================
// 6. FIREBASE REAL-TIME SYNC ENGINE (DYNAMIC GSTATIC IMPORT)
// ============================================================================

function parseFirebaseConfigInput(rawInput) {
  if (!rawInput) return null;
  if (typeof rawInput === 'object') {
    return rawInput.apiKey && rawInput.projectId ? rawInput : null;
  }
  if (typeof rawInput !== 'string') return null;

  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  try {
    const direct = JSON.parse(trimmed);
    if (direct && direct.apiKey && direct.projectId) return direct;
  } catch {
    // Try relaxed JS object literal cleanup (copied directly from Firebase Console)
    try {
      const cleaned = trimmed
        .replace(/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*/, '')
        .replace(/;+\s*$/, '')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"');
      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.apiKey && parsed.projectId) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function detectFirebaseConfig() {
  // 1. Canvas runtime environment
  if (typeof globalThis !== 'undefined' && globalThis.__firebase_config) {
    const parsed = parseFirebaseConfigInput(globalThis.__firebase_config);
    if (parsed) {
      return { config: parsed, source: 'canvas' };
    }
  }

  // 2. Hardcoded GITHUB_FIREBASE_CONFIG
  if (GITHUB_FIREBASE_CONFIG && GITHUB_FIREBASE_CONFIG.apiKey && GITHUB_FIREBASE_CONFIG.projectId) {
    return { config: GITHUB_FIREBASE_CONFIG, source: 'github' };
  }

  // 3. Custom Firebase config saved via UI
  const stored = lsGet(CUSTOM_FB_CONFIG_KEY);
  if (stored) {
    const parsed = parseFirebaseConfigInput(stored);
    if (parsed) {
      return { config: parsed, source: 'custom' };
    }
  }

  return { config: null, source: 'none' };
}

async function loadFirebaseModules() {
  if (fbModules) return fbModules;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  fbModules = {
    initializeApp: appMod.initializeApp,
    getApps: appMod.getApps,
    deleteApp: appMod.deleteApp,
    getAuth: authMod.getAuth,
    signInAnonymously: authMod.signInAnonymously,
    signInWithCustomToken: authMod.signInWithCustomToken,
    getFirestore: fsMod.getFirestore,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    onSnapshot: fsMod.onSnapshot,
  };
  return fbModules;
}

function setSyncState(status, message, err = null) {
  syncStatus = status;
  syncMessage = message;
  lastError = err ? (err.message || String(err)) : null;
  emitSyncInfo();
}

export function getSyncInfo() {
  return {
    status: syncStatus,
    message: syncMessage,
    source: activeConfigSource,
    roomId: getSyncRoomCode(),
    localKey: getActiveLocalKey(),
    lastSyncTime,
    lastSyncTimeStr,
    lastError,
    isCloudConnected: Boolean(fbDb && currentUser && getSyncRoomCode()),
  };
}

function emitSyncInfo() {
  const info = getSyncInfo();
  for (const fn of syncListeners) {
    try {
      fn(info);
    } catch (err) {
      console.error('Sync status listener hatası:', err);
    }
  }
}

export function subscribeSyncStatus(fn) {
  if (typeof fn !== 'function') return () => {};
  syncListeners.add(fn);
  try {
    fn(getSyncInfo());
  } catch (err) {
    console.error('Sync status initial callback hatası:', err);
  }
  return () => {
    syncListeners.delete(fn);
  };
}

export function getSyncRoomCode() {
  return sanitizeRoomCode(lsGet(SYNC_ROOM_KEY) || '');
}

export function saveSyncRoomCode(code) {
  const safe = sanitizeRoomCode(code || '');
  if (safe.length < 4) {
    return { ok: false, error: 'En az 4 karakterli bir senkronizasyon kodu gir.' };
  }
  lsSet(SYNC_ROOM_KEY, safe);
  emitSyncInfo();
  initCloudSync();
  return { ok: true, roomId: safe };
}

export function getCustomFirebaseConfig() {
  const raw = lsGet(CUSTOM_FB_CONFIG_KEY);
  if (!raw) return null;
  return parseFirebaseConfigInput(raw);
}

export function saveCustomFirebaseConfig(rawJson) {
  const parsed = parseFirebaseConfigInput(rawJson);
  if (!parsed) {
    return {
      ok: false,
      error: 'Geçersiz Firebase JSON formatı. apiKey ve projectId zorunludur.',
    };
  }
  lsSet(CUSTOM_FB_CONFIG_KEY, JSON.stringify(parsed));
  initCloudSync();
  return { ok: true, config: parsed };
}

export function clearCustomFirebaseConfig() {
  lsRemove(CUSTOM_FB_CONFIG_KEY);
  initCloudSync();
  return { ok: true };
}

function hasMeaningfulLocalData(targetState) {
  if (!targetState) return false;
  if (Array.isArray(targetState.transactions) && targetState.transactions.length > 0) return true;
  if (Array.isArray(targetState.recurring) && targetState.recurring.length > 0) return true;
  if (Array.isArray(targetState.savingsGoals) && targetState.savingsGoals.length > 0) return true;
  if (targetState.profile && targetState.profile.monthlyFixedIncome > 0) return true;
  if (targetState.terea && targetState.terea.dailyCounts && Object.keys(targetState.terea.dailyCounts).length > 0) return true;
  return false;
}

async function pushStateToCloud(targetState = getState()) {
  if (!fbDb || !currentUser || !fbModules) return false;
  const roomId = getSyncRoomCode();
  if (!roomId) return false;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncState('local', 'Çevrimdışı (Yerel Kaydedildi)');
    return false;
  }

  setSyncState('syncing', 'Eşitleniyor...');
  try {
    const appId = getAppNamespaceId();
    const docRef = fbModules.doc(fbDb, 'artifacts', appId, 'public', 'data', 'terea_sync_rooms', roomId);
    const payload = {
      ...targetState,
      updatedAt: targetState.updatedAt || Date.now(),
    };
    await fbModules.setDoc(docRef, payload);
    lastSyncTime = Date.now();
    lastSyncTimeStr = formatTimeHHMM(lastSyncTime);
    setSyncState('synced', `Bulut Senkronize • ${lastSyncTimeStr}`);
    return true;
  } catch (err) {
    console.error('Buluta yazma hatası:', err);
    setSyncState('error', 'Eşitleme Hatası', err);
    return false;
  }
}

async function teardownFirebase() {
  if (unsubscribeSnapshot) {
    try {
      unsubscribeSnapshot();
    } catch {
      // ignore
    }
    unsubscribeSnapshot = null;
  }
  fbDb = null;
  fbAuth = null;
  currentUser = null;
  if (fbApp && fbModules) {
    try {
      await fbModules.deleteApp(fbApp);
    } catch {
      // ignore
    }
    fbApp = null;
  }
}

async function initCloudSync() {
  await teardownFirebase();

  const detected = detectFirebaseConfig();
  activeConfigSource = detected.source;

  if (!detected.config) {
    setSyncState('local', 'Yerel Mod (Kurulum Bekliyor)');
    return;
  }

  let roomId = getSyncRoomCode();
  if (!roomId && detected.source === 'canvas') {
    roomId = 'terea-oda-' + Math.random().toString(36).slice(2, 8);
    lsSet(SYNC_ROOM_KEY, roomId);
  }

  if (!roomId) {
    setSyncState('local', 'Senkronizasyon Kodu Gir');
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncState('local', 'Çevrimdışı (Yerel Mod)');
    return;
  }

  setSyncState('syncing', 'Bağlanıyor...');

  try {
    const mods = await loadFirebaseModules();
    const existingApps = mods.getApps();
    if (existingApps.length > 0) {
      for (const appInstance of existingApps) {
        await mods.deleteApp(appInstance);
      }
    }

    fbApp = mods.initializeApp(detected.config);
    fbAuth = mods.getAuth(fbApp);
    fbDb = mods.getFirestore(fbApp);

    const customToken = typeof globalThis !== 'undefined' ? globalThis.__initial_auth_token : null;
    if (customToken) {
      const cred = await mods.signInWithCustomToken(fbAuth, customToken);
      currentUser = cred.user;
    } else {
      const cred = await mods.signInAnonymously(fbAuth);
      currentUser = cred.user;
    }

    if (!currentUser) {
      setSyncState('error', 'Kimlik Doğrulama Hatası');
      return;
    }

    const appId = getAppNamespaceId();
    const docRef = mods.doc(fbDb, 'artifacts', appId, 'public', 'data', 'terea_sync_rooms', roomId);

    unsubscribeSnapshot = mods.onSnapshot(
      docRef,
      (snapshot) => {
        lastSyncTime = Date.now();
        lastSyncTimeStr = formatTimeHHMM(lastSyncTime);

        if (snapshot.exists()) {
          const remote = snapshot.data();
          const remoteUpdated = Number(remote?.updatedAt) || 0;
          const localState = getState();
          const localUpdated = Number(localState.updatedAt) || 0;

          if (remoteUpdated > localUpdated) {
            const migrated = normalizeAndMigrateState(remote);
            migrated.updatedAt = remoteUpdated;
            saveStateToVault(getActiveLocalKey(), migrated);
            setState(migrated, { fromRemote: true });
            setSyncState('synced', `Bulut Senkronize • ${lastSyncTimeStr}`);
          } else if (localUpdated > remoteUpdated && hasMeaningfulLocalData(localState)) {
            pushStateToCloud(localState);
          } else {
            setSyncState('synced', `Bulut Senkronize • ${lastSyncTimeStr}`);
          }
        } else {
          pushStateToCloud(getState());
        }
      },
      (error) => {
        console.error('Firestore dinleme hatası:', error);
        setSyncState('error', 'Bulut İzni / Bağlantı Hatası', error);
      }
    );
  } catch (err) {
    console.error('Firebase başlatma hatası:', err);
    setSyncState('error', 'Firebase Bağlantı Hatası', err);
  }
}

export async function forceSyncNow() {
  const detected = detectFirebaseConfig();
  if (!detected.config || !getSyncRoomCode()) {
    await initCloudSync();
    return false;
  }
  if (!fbDb || !currentUser) {
    await initCloudSync();
    return Boolean(fbDb && currentUser);
  }
  const current = getState();
  current.updatedAt = Date.now();
  saveStateToVault(getActiveLocalKey(), current);
  return pushStateToCloud(current);
}

// ============================================================================
// 7. INITIALIZATION ENTRYPOINT
// ============================================================================

export function initStorageAndSync() {
  const activeKey = getActiveLocalKey();
  const raw = loadRawVaultState(activeKey);
  const initialState = raw ? normalizeAndMigrateState(raw) : createDefaultState();

  // Ensure active vault exists cleanly in v3 format
  saveStateToVault(activeKey, initialState);
  setState(initialState, { fromRemote: true, silent: true });

  // Register reactive commit hook so every mutation persists locally + syncs to cloud
  registerCommitHook((nextState) => {
    const key = getActiveLocalKey();
    saveStateToVault(key, nextState);
    if (fbDb && currentUser) {
      pushStateToCloud(nextState);
    }
  });

  if (!initialized && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (detectFirebaseConfig().config && getSyncRoomCode()) {
        initCloudSync();
      }
    });
    window.addEventListener('offline', () => {
      if (detectFirebaseConfig().config) {
        setSyncState('local', 'Çevrimdışı (Yerel Kaydediliyor)');
      }
    });
    initialized = true;
  }

  // Trigger non-blocking Firebase initialization (only loads SDK if config exists)
  initCloudSync();

  return initialState;
}
