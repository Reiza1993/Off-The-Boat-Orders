// Data layer — all reads/writes go through here.
// Single localStorage key keeps everything atomic.

import { DEFAULT_CATALOG } from './catalog-defaults.js';

const STORAGE_KEY  = 'otb_orders_v1';
const DATA_VERSION = 2;

// ── Core storage helpers ───────────────────────────────────────────────────

export function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _bootstrap();
    return _ensureShape(JSON.parse(raw));
  } catch {
    return _bootstrap();
  }
}

export function setData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function _bootstrap() {
  const data = {
    version: DATA_VERSION,
    catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
    orders: [],
    meta: { lastExportAt: null },
  };
  setData(data);
  return data;
}

function _ensureShape(data) {
  if (!data.catalog) data.catalog = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  if (!data.orders)  data.orders  = [];
  if (!data.meta)    data.meta    = { lastExportAt: null };

  const v = data.version || 1;

  ['cfs', 'fish', 'veggies'].forEach(sup => {
    if (!data.catalog[sup]) data.catalog[sup] = [];
    data.catalog[sup].forEach(item => {

      if (v < 2) {
        // ── v1 → v2 migration ─────────────────────────────────────────────
        // Old field was `tracking` ('track'|'must'|'silent') or `alwaysOn` bool
        const old = item.tracking ?? (item.alwaysOn ? 'silent' : undefined);
        if      (old === 'silent' || old === 'alwaysOn') item.mode = 'mustHave';
        else if (old === 'must'   || old === 'mustHave') item.mode = 'mustHave';
        else if (old === 'track')                        item.mode = 'track';
        else                                             item.mode = 'off';
        delete item.tracking;
        delete item.alwaysOn;
      }

      // Guarantee required fields exist on all items
      if (!item.mode)              item.mode     = 'off';
      if (item.archived === undefined) item.archived = false;
    });
  });

  if (v < DATA_VERSION) {
    data.version = DATA_VERSION;
    setData(data); // persist the migration immediately
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

// ── Backup / Restore ───────────────────────────────────────────────────────

export function exportJSON() {
  const data = getData();
  updateMeta({ lastExportAt: new Date().toISOString() });
  return JSON.stringify(data, null, 2);
}

export function importJSON(jsonStr, mode = 'replace') {
  const incoming = JSON.parse(jsonStr);
  if (!incoming.orders || !incoming.catalog) throw new Error('Invalid backup file');

  if (mode === 'replace') {
    setData(_ensureShape(incoming));
    return;
  }

  // Merge: keep existing orders, add new ones that aren't already present
  const data = getData();
  const existingIds = new Set(data.orders.map(o => o.id));
  const newOrders = incoming.orders.filter(o => !existingIds.has(o.id));
  data.orders = [...data.orders, ...newOrders];
  setData(data);
}
