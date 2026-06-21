// Data layer — IndexedDB with synchronous in-memory cache
// setData() writes to cache immediately and persists to IDB async (fire-and-forget)
// initData() must be awaited at app startup before any screen renders

import { DEFAULT_CATALOG } from './catalog-defaults.js';

const DB_NAME        = 'otb-orders';
const DB_VERSION     = 1;
const STORE_NAME     = 'data';
const STATE_KEY      = 'state';
const LS_MIGRATE_KEY = 'otb_orders_v1'; // old localStorage key — migrated on first load
const DATA_VERSION   = 4;

let _cache     = null;
let _dbPromise = null;

// ── IndexedDB plumbing ─────────────────────────────────────────────────────

function _getDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
      req.onsuccess  = e => resolve(e.target.result);
      req.onerror    = e => { _dbPromise = null; reject(e.target.error); };
    });
  }
  return _dbPromise;
}

async function _idbGet(key) {
  const db = await _getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _idbPut(key, value) {
  const db = await _getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── App startup ─────────────────────────────────────────────────────────────

// Call once before rendering any screen. Populates _cache from IDB.
export async function initData() {
  try {
    const stored = await _idbGet(STATE_KEY);
    if (stored) {
      _cache = _ensureShape(stored);
    } else {
      // One-time migration from old localStorage
      const lsRaw = localStorage.getItem(LS_MIGRATE_KEY);
      if (lsRaw) {
        try { _cache = _ensureShape(JSON.parse(lsRaw)); } catch { _cache = _bootstrap(); }
        localStorage.removeItem(LS_MIGRATE_KEY);
      } else {
        _cache = _bootstrap();
      }
    }
    await _idbPut(STATE_KEY, _cache);
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage:', err);
    try {
      const raw = localStorage.getItem(LS_MIGRATE_KEY);
      _cache = raw ? _ensureShape(JSON.parse(raw)) : _bootstrap();
    } catch {
      _cache = _bootstrap();
    }
  }
}

// ── Core storage helpers ───────────────────────────────────────────────────

export function getData() {
  if (!_cache) {
    // Guard — shouldn't happen after initData(), but safe fallback
    const raw = localStorage.getItem(LS_MIGRATE_KEY);
    _cache = raw ? _ensureShape(JSON.parse(raw)) : _bootstrap();
  }
  return _cache;
}

export function setData(data) {
  _cache = data;
  _idbPut(STATE_KEY, data).catch(err => console.warn('IDB write failed:', err));
}

function _bootstrap() {
  const data = {
    version: DATA_VERSION,
    catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
    orders:  [],
    meta:    { lastExportAt: null },
    draft:   null,
  };
  setData(data);
  return data;
}

function _ensureShape(data) {
  if (!data.catalog) data.catalog = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  if (!data.orders)  data.orders  = [];
  if (!data.meta)    data.meta    = { lastExportAt: null };
  if (data.draft === undefined) data.draft = null;

  const v = data.version || 1;

  ['cfs', 'fish', 'veggies'].forEach(sup => {
    if (!data.catalog[sup]) data.catalog[sup] = [];
    data.catalog[sup].forEach(item => {

      if (v < 2) {
        // v1 → v2: migrate old tracking field to mode
        const old = item.tracking ?? (item.alwaysOn ? 'silent' : undefined);
        if      (old === 'silent' || old === 'alwaysOn') item.mode = 'mustHave';
        else if (old === 'must'   || old === 'mustHave') item.mode = 'mustHave';
        else if (old === 'track')                        item.mode = 'track';
        else                                             item.mode = 'off';
        delete item.tracking;
        delete item.alwaysOn;
      }

      if (v < 3) {
        // v2 → v3: add category field
        if (!item.category) item.category = 'common';
      }

      // Guarantee required fields on all catalog items
      if (!item.mode)                   item.mode     = 'off';
      if (!item.category)               item.category = 'common';
      if (item.archived  === undefined) item.archived = false;
      if (item.unit      === undefined) item.unit     = null;
    });
  });

  // Guarantee required fields on all order items
  data.orders.forEach(order => {
    (order.items || []).forEach(i => {
      if (i.unit           === undefined) i.unit           = null;
      if (i.customQuantity === undefined) i.customQuantity = null;
    });
  });

  if (v < DATA_VERSION) {
    data.version = DATA_VERSION;
    setData(data); // persist migration immediately
  }

  return data;
}

// ── Orders ─────────────────────────────────────────────────────────────────

export function getOrders(supplier = null) {
  const { orders } = getData();
  const list = supplier ? orders.filter(o => o.supplier === supplier) : orders;
  return list.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getOrderById(id) {
  return getData().orders.find(o => o.id === id) || null;
}

export function addOrder(order) {
  const data = getData();
  data.orders.push(order);
  setData(data);
}

export function deleteOrder(id) {
  const data = getData();
  data.orders = data.orders.filter(o => o.id !== id);
  setData(data);
}

// ── Catalog ────────────────────────────────────────────────────────────────

export function getCatalog() {
  return getData().catalog;
}

export function updateCatalog(catalog) {
  const data = getData();
  data.catalog = catalog;
  setData(data);
}

export function getCatalogItems(supplier) {
  const catalog = getCatalog();
  return (catalog[supplier] || []).filter(i => !i.archived);
}

// ── Meta ───────────────────────────────────────────────────────────────────

export function getMeta() {
  return getData().meta || {};
}

export function updateMeta(updates) {
  const data = getData();
  data.meta = { ...(data.meta || {}), ...updates };
  setData(data);
}

// ── Draft (in-progress order) ───────────────────────────────────────────────

export function getDraft() {
  return getData().draft || null;
}

export function saveDraft(draft) {
  const data = getData();
  data.draft = draft;
  setData(data);
}

export function clearDraft() {
  const data = getData();
  data.draft = null;
  setData(data);
}

// ── Backup / Restore ───────────────────────────────────────────────────────

export function exportJSON() {
  const data = getData();
  updateMeta({ lastExportAt: new Date().toISOString() });
  // Don't include draft in export
  const { draft, ...exportData } = data;
  return JSON.stringify(exportData, null, 2);
}

export function importJSON(jsonStr, mode = 'replace') {
  const incoming = JSON.parse(jsonStr);
  if (!incoming.orders || !incoming.catalog) throw new Error('Invalid backup file');

  if (mode === 'replace') {
    const shaped = _ensureShape(incoming);
    shaped.draft = null;
    setData(shaped);
    return;
  }

  // Merge: keep existing orders, add new ones not already present
  const data = getData();
  const existingIds = new Set(data.orders.map(o => o.id));
  const newOrders = incoming.orders.filter(o => !existingIds.has(o.id));
  data.orders = [...data.orders, ...newOrders];
  setData(data);
}
