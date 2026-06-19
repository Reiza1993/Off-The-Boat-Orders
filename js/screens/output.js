// Output screen — show formatted order(s), copy / share
// Handles both single (orderIds: [id]) and multi-supplier (orderIds: [id1, id2, ...]) saves.

import { getOrderById } from '../data.js';
import { formatOrderText, supplierLabel, supplierColor, supplierEmoji, formatDateLong, copyText, vibrate, showToast } from '../utils.js';

let _orderIds = []; // one or more order IDs to display

export function init(params = {}) {
  // Support both old { orderId } and new { orderIds }
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

  // Combined clipboard text: each order block separated by a blank line
  // Extra blank line at end so pastes in succession (e.g. WhatsApp) have spacing
  const combinedText = orders.map(o => formatOrderText(o)).join('\n\n') + '\n\n';

  const isMulti = orders.length > 1;

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
            <span>${supplierEmoji(o.supplier)} ${o.items.filter(i => i.quantity).length} items</span>
          `).join('')}
        </div>
      ` : `
        <p class="text-sm opacity-70 mt-1">
          ${orders[0].items.filter(i => i.quantity).length} items
        </p>
      `}
    </div>

    <!-- Primary action: copy -->
    <div class="px-4 mt-4 space-y-3">
      <button data-action="copy"
        class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-md active:opacity-80 flex items-center justify-center gap-2">
        📋 Copy ${isMulti ? 'All Orders' : 'to Clipboard'}
      </button>

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

    <!-- Formatted text preview (one block per order, blank line between) -->
    <div class="mx-4 mt-6">
      <p class="text-xs text-muted mb-2 font-medium uppercase tracking-wide">
        ${isMulti ? 'Formatted output — all orders' : 'Formatted output'}
      </p>
      <pre id="order-text" class="card font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">${escHtml(combinedText.trimEnd())}</pre>
      ${isMulti ? `<p class="text-xs text-muted mt-1 text-center">Each supplier's block is separated by a blank line when copied</p>` : ''}
    </div>

    <!-- Per-order item breakdown (collapsible if multiple) -->
    <div class="mx-4 mt-6 mb-6 space-y-3">
      ${orders.map(order => {
        const color = supplierColor(order.supplier);
        const orderedItems = order.items.filter(i => i.quantity);
        return `
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xl">${supplierEmoji(order.supplier)}</span>
              <h3 class="font-bold text-sm">${supplierLabel(order.supplier)}</h3>
              <span class="text-xs text-muted ml-auto">${orderedItems.length} items</span>
            </div>
            <div class="card divide-y divide-border p-0 overflow-hidden">
              ${orderedItems.map(i => `
                <div class="flex justify-between px-3 py-2.5 text-sm">
                  <span>${escHtml(i.name)}</span>
                  <span class="font-semibold ml-4" style="color:var(--color-brand-light)">${escHtml(i.quantity)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  _attachEvents(container, orders, combinedText);
}

function _attachEvents(container, orders, combinedText) {
  container.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    try {
      await copyText(combinedText);
      vibrate(10);
      showToast(
        orders.length > 1
          ? `Copied ${orders.length} orders to clipboard!`
          : 'Copied to clipboard!',
        'success'
      );
    } catch {
      showToast('Copy failed — try long-pressing the text above', 'error');
    }
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
