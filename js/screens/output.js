// Output screen — show formatted order(s), copy / share
// Handles both single (orderIds: [id]) and multi-supplier (orderIds: [id1, id2, ...]) saves.

import { getOrderById } from '../data.js';
import { formatOrderText, supplierLabel, supplierColor, supplierEmoji, formatDateLong, copyText, vibrate, showToast } from '../utils.js';

let _orderIds = [];

export function init(params = {}) {
  if (params.orderIds?.length) {
    _orderIds = params.orderIds;
  } else if (params.orderId) {
    _orderIds = [params.orderId];
  } else {
    _orderIds = [];
  }
}

export function render(container) {
  const orders = _orderIds.map(id => getOrderById(id)).filter(Boolean);

  if (!orders.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-muted gap-4">
        <p class="text-5xl">📋</p>
        <p>No order to display.</p>
        <button data-action="go-new" class="btn-primary mt-2">New Order</button>
      </div>`;
    container.querySelector('[data-action="go-new"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'new-order' } }));
    });
    return;
  }

  const isMulti = orders.length > 1;
  // Per-order formatted text (used for individual copy buttons)
  const orderTexts = orders.map(o => formatOrderText(o));
  // Combined text for Share All
  const combinedText = orderTexts.join('\n\n') + '\n\n';

  container.innerHTML = `
    <!-- Summary banner -->
    <div class="mx-4 mt-4 p-4 rounded-2xl bg-brand text-white">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide opacity-75">
            ${isMulti ? `${orders.length} orders ready` : 'Order ready'}
          </p>
          <p class="font-bold text-lg mt-0.5">
            ${isMulti
              ? orders.map(o => supplierLabel(o.supplier)).join(' · ')
              : supplierLabel(orders[0].supplier)}
          </p>
          <p class="text-sm opacity-80 mt-0.5">${formatDateLong(orders[0].date)}</p>
        </div>
        <span class="text-3xl">
          ${isMulti ? '📦' : supplierEmoji(orders[0].supplier)}
        </span>
      </div>
      ${isMulti ? `
        <div class="mt-2 flex gap-3 text-sm opacity-80">
          ${orders.map(o => `
            <span>${supplierEmoji(o.supplier)} ${_countItems(o)} items</span>
          `).join('')}
        </div>
      ` : `
        <p class="text-sm opacity-70 mt-1">${_countItems(orders[0])} items</p>
      `}
    </div>

    <!-- Copy buttons: one per supplier when multi, single when one order -->
    <div class="px-4 mt-4 space-y-2">
      ${isMulti
        ? orders.map((o, idx) => `
            <button data-action="copy-one" data-order-idx="${idx}"
              class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-md active:opacity-80 flex items-center justify-center gap-2">
              📋 Copy ${supplierLabel(o.supplier)}
            </button>
          `).join('')
        : `
          <button data-action="copy-one" data-order-idx="0"
            class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-md active:opacity-80 flex items-center justify-center gap-2">
            📋 Copy to Clipboard
          </button>
        `}

      ${navigator.share ? `
        <button data-action="share"
          class="w-full py-4 bg-surface border border-border rounded-2xl font-semibold text-base active:opacity-80 flex items-center justify-center gap-2">
          ↗ Share ${isMulti ? 'All' : ''}
        </button>
      ` : ''}

      <button data-action="new-order"
        class="w-full py-4 bg-surface border border-border rounded-2xl font-semibold text-base active:opacity-80 flex items-center justify-center gap-2">
        ✏️ New Order
      </button>
    </div>

    <!-- Formatted text preview -->
    <div class="mx-4 mt-6">
      <p class="text-xs text-muted mb-2 font-medium uppercase tracking-wide">
        ${isMulti ? 'Formatted output — all orders' : 'Formatted output'}
      </p>
      <pre id="order-text" class="card font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">${escHtml(combinedText.trimEnd())}</pre>
    </div>

    <!-- Per-order item breakdown -->
    <div class="mx-4 mt-6 mb-6 space-y-3">
      ${orders.map(order => {
        const orderedItems = _filteredItems(order);
        return `
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xl">${supplierEmoji(order.supplier)}</span>
              <h3 class="font-bold text-sm">${supplierLabel(order.supplier)}</h3>
              <span class="text-xs text-muted ml-auto">${orderedItems.length} items</span>
            </div>
            <div class="card divide-y divide-border p-0 overflow-hidden">
              ${orderedItems.map(i => {
                const qtyDisplay = (i.customQuantity && i.customQuantity.trim())
                  ? i.customQuantity.trim()
                  : i.quantity.trim() + (i.unit ? ` ${i.unit}` : '');
                return `
                <div class="flex justify-between items-center px-3 py-2.5 text-sm gap-3">
                  <span class="flex-1 min-w-0">${escHtml(i.name)}</span>
                  <span class="font-bold shrink-0 text-amber-400">${escHtml(qtyDisplay)}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  _attachEvents(container, orders, orderTexts, combinedText);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _filteredItems(order) {
  return order.items.filter(i => {
    if (i.customQuantity && i.customQuantity.trim()) return true;
    if (!i.quantity || !i.quantity.trim()) return false;
    return i.quantity.trim() !== '0';
  });
}

function _countItems(order) {
  return _filteredItems(order).length;
}

// ── Events ───────────────────────────────────────────────────────────────────

function _attachEvents(container, orders, orderTexts, combinedText) {
  // Per-supplier copy buttons
  container.querySelectorAll('[data-action="copy-one"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx   = parseInt(btn.dataset.orderIdx, 10);
      const text  = orderTexts[idx];
      const label = supplierLabel(orders[idx].supplier);
      try {
        await copyText(text);
        vibrate(10);
        showToast(
          orders.length > 1 ? `${label} order copied!` : 'Copied to clipboard!',
          'success'
        );
      } catch {
        showToast('Copy failed — try long-pressing the text above', 'error');
      }
    });
  });

  container.querySelector('[data-action="share"]')?.addEventListener('click', async () => {
    const title = orders.length > 1
      ? `OTB Orders — ${orders.map(o => supplierLabel(o.supplier)).join(', ')}`
      : `OTB ${supplierLabel(orders[0].supplier)} Order`;
    try {
      await navigator.share({ title, text: combinedText });
      vibrate(10);
    } catch (e) {
      if (e.name !== 'AbortError') showToast('Share failed', 'error');
    }
  });

  container.querySelector('[data-action="new-order"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'new-order' } }));
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
