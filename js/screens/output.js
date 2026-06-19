// Output screen — show formatted order, copy/share

import { getOrderById } from '../data.js';
import { formatOrderText, supplierLabel, supplierColor, formatDateLong, copyText, vibrate, showToast } from '../utils.js';

let _orderId = null;

export function init(params = {}) {
  _orderId = params.orderId || null;
}

export function render(container) {
  const order = _orderId ? getOrderById(_orderId) : null;

  if (!order) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-muted gap-4">
        <p class="text-5xl">📋</p>
        <p>No order to display.</p>
        <button data-action="go-new" class="btn-primary">New Order</button>
      </div>`;
    container.querySelector('[data-action="go-new"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'new-order' } }));
    });
    return;
  }

  const text  = formatOrderText(order);
  const color = supplierColor(order.supplier);

  container.innerHTML = `
    <!-- Order header banner -->
    <div class="mx-4 mt-4 p-4 rounded-2xl ${color.bg} ${color.border} border">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide ${color.text} opacity-70">Order ready</p>
          <p class="font-bold text-lg ${color.text}">${supplierLabel(order.supplier)}</p>
          <p class="text-sm ${color.text} opacity-80">${formatDateLong(order.date)}</p>
        </div>
        <span class="text-4xl">${order.supplier === 'cfs' ? '🧊' : order.supplier === 'fish' ? '🐟' : '🥦'}</span>
      </div>
      <div class="mt-2 text-sm ${color.text} opacity-70">
        ${order.items.filter(i => i.quantity).length} items ordered
      </div>
    </div>

    <!-- Formatted text block -->
    <div class="mx-4 mt-4">
      <p class="text-xs text-muted mb-2 font-medium">Formatted output</p>
      <pre id="order-text" class="card font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">${escHtml(text)}</pre>
    </div>

    <!-- Action buttons -->
    <div class="px-4 mt-4 space-y-3">
      <button data-action="copy"
        class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-md active:opacity-80 flex items-center justify-center gap-2">
        <span class="text-xl">📋</span> Copy to clipboard
      </button>

      ${navigator.share ? `
        <button data-action="share"
          class="w-full py-4 bg-surface border border-border text-text rounded-2xl font-semibold text-base active:opacity-80 flex items-center justify-center gap-2">
          <span class="text-xl">↗</span> Share
        </button>
      ` : ''}

      <button data-action="new-order"
        class="w-full py-4 bg-surface border border-border text-text rounded-2xl font-semibold text-base active:opacity-80 flex items-center justify-center gap-2">
        <span class="text-xl">✏️</span> New Order
      </button>
    </div>

    <!-- Item breakdown -->
    <div class="mx-4 mt-6 mb-4">
      <p class="text-xs text-muted mb-2 font-medium uppercase tracking-wide">Items in this order</p>
      <div class="card divide-y divide-border">
        ${order.items.filter(i => i.quantity).map(i => `
          <div class="flex justify-between py-2 text-sm">
            <span>${escHtml(i.name)}</span>
            <span class="font-semibold text-brand">${escHtml(i.quantity)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  _attachEvents(container, order, text);
}

function _attachEvents(container, order, text) {
  container.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    try {
      await copyText(text);
      vibrate(10);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Copy failed — try long-pressing the text above', 'error');
    }
  });

  container.querySelector('[data-action="share"]')?.addEventListener('click', async () => {
    try {
      await navigator.share({
        title: `OTB ${supplierLabel(order.supplier)} Order`,
        text,
      });
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
