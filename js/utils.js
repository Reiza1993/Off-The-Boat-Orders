// Shared utility functions

// ── IDs ────────────────────────────────────────────────────────────────────

export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Date helpers ───────────────────────────────────────────────────────────

// Returns 'YYYY-MM-DD' for today
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Formats 'YYYY-MM-DD' → 'D/M/YY'  (no zero-padding)
export function formatDate(iso) {
  // Parse as local date to avoid timezone shift
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${String(y).slice(-2)}`;
}

// Full date string for display headers
export function formatDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

// ── Supplier labels ────────────────────────────────────────────────────────

export function supplierLabel(supplier) {
  return { cfs: 'CFS', fish: 'Fish', veggies: 'Veggies' }[supplier] || supplier;
}

export function supplierEmoji(supplier) {
  return { cfs: '🧊', fish: '🐟', veggies: '🥦' }[supplier] || '📦';
}

export function supplierColor(supplier) {
  return {
    cfs:    { bg: 'bg-blue-100 dark:bg-blue-900',  text: 'text-blue-800 dark:text-blue-200',  border: 'border-blue-300 dark:border-blue-700' },
    fish:   { bg: 'bg-cyan-100 dark:bg-cyan-900',   text: 'text-cyan-800 dark:text-cyan-200',   border: 'border-cyan-300 dark:border-cyan-700' },
    veggies:{ bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', border: 'border-green-300 dark:border-green-700' },
  }[supplier] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };
}

// ── Order output format ────────────────────────────────────────────────────

// Formats the order as plain text for copy/share
export function formatOrderText(order) {
  const label = supplierLabel(order.supplier);
  const date  = formatDate(order.date);
  const lines = [`${label} Off The Boat Pizzeria - ${date}`];
  order.items
    .filter(i => i.quantity && i.quantity.trim())
    .forEach(i => lines.push(`${i.name} - ${i.quantity.trim()}`));
  return lines.join('\n');
}

// ── Streak / badge logic ───────────────────────────────────────────────────

// Given all orders for a supplier (sorted newest-first) and one item,
// returns { streak, weeksMissed, lastQty }
// streak      = consecutive most-recent orders that include this item
// weeksMissed = consecutive most-recent orders where it's absent (only if
//               the item was ordered at least once previously)
// lastQty     = quantity string from the most recent order containing it
export function getItemInfo(itemId, itemName, supplierOrders) {
  if (!supplierOrders || supplierOrders.length === 0) {
    return { streak: 0, weeksMissed: 0, lastQty: null };
  }

  const hasItem = order =>
    order.items.some(i => (itemId && i.itemId === itemId) || i.name === itemName);

  // Streak: count consecutive orders from newest that include the item
  let streak = 0;
  for (const order of supplierOrders) {
    if (hasItem(order)) streak++;
    else break;
  }

  // Weeks missed: how many consecutive recent orders lack the item
  const everOrdered = supplierOrders.some(hasItem);
  let weeksMissed = 0;
  if (everOrdered && streak === 0) {
    for (const order of supplierOrders) {
      if (!hasItem(order)) weeksMissed++;
      else break;
    }
  }

  // Last-used quantity
  const lastOrderWithItem = supplierOrders.find(hasItem);
  const lastQty = lastOrderWithItem
    ? lastOrderWithItem.items.find(i => (itemId && i.itemId === itemId) || i.name === itemName)?.quantity ?? null
    : null;

  return { streak, weeksMissed, lastQty };
}

// ── Haptics ────────────────────────────────────────────────────────────────

export function vibrate(pattern = 10) {
  try { navigator.vibrate(pattern); } catch {}
}

// ── Clipboard ─────────────────────────────────────────────────────────────

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older Android WebViews
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

// ── Toast ──────────────────────────────────────────────────────────────────

export function showToast(message, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const colors = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    info:    'bg-blue-600',
    warning: 'bg-amber-600',
  };

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `fixed top-4 left-4 right-4 z-[200] ${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-center transition-all`;
  toast.style.maxWidth = '480px';
  toast.style.margin = '0 auto';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Confirm dialog ─────────────────────────────────────────────────────────

export function showConfirm(message, onConfirm, onCancel) {
  const overlay = document.getElementById('confirm-overlay');
  const msgEl   = document.getElementById('confirm-message');
  const okBtn   = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  msgEl.textContent = message;
  overlay.style.display = 'flex';

  const cleanup = () => { overlay.style.display = 'none'; };

  okBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = () => { cleanup(); if (onCancel) onCancel(); };
}

// ── Misc ───────────────────────────────────────────────────────────────────

// Parse a quantity string to a number; returns NaN if not numeric
export function parseQty(str) {
  if (!str) return NaN;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? NaN : n;
}
