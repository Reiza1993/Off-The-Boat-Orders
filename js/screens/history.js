// History screen — list of past orders, filter, view, delete

import { getOrders, deleteOrder } from '../data.js';
import { supplierLabel, supplierColor, supplierEmoji, formatDate, formatDateLong, formatOrderText, copyText, vibrate, showToast, showConfirm } from '../utils.js';

let _filter     = { supplier: 'all', dateFrom: '', dateTo: '' };
let _expanded   = null;
let _controller = null; // AbortController — prevents duplicate listeners on re-render

export function init() {}

export function render(container) {
  const allOrders = getOrders();
  const filtered  = _applyFilter(allOrders);

  container.innerHTML = `
    <!-- Filter bar -->
    <div class="px-4 pt-4 space-y-2">
      <div class="flex gap-2">
        <select id="filter-supplier" class="input-field flex-1 text-sm">
          <option value="all" ${_filter.supplier==='all'?'selected':''}>All suppliers</option>
          <option value="cfs"    ${_filter.supplier==='cfs'?'selected':''}>CFS</option>
          <option value="fish"   ${_filter.supplier==='fish'?'selected':''}>Fish</option>
          <option value="veggies"${_filter.supplier==='veggies'?'selected':''}>Veggies</option>
        </select>
        ${_filter.supplier !== 'all' || _filter.dateFrom || _filter.dateTo ? `
          <button data-action="clear-filter" class="px-3 py-2 text-sm rounded-xl bg-surface border border-border text-muted">Clear</button>
        ` : ''}
      </div>
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="text-xs text-muted">From</label>
          <input type="date" id="filter-from" class="input-field text-sm" value="${_filter.dateFrom}">
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted">To</label>
          <input type="date" id="filter-to" class="input-field text-sm" value="${_filter.dateTo}">
        </div>
      </div>
    </div>

    <!-- Results count -->
    <div class="px-4 pt-3 pb-1">
      <p class="text-xs text-muted">${filtered.length} order${filtered.length !== 1 ? 's' : ''}</p>
    </div>

    <!-- Order list -->
    <div id="order-list" class="px-4 pb-4 space-y-2">
      ${filtered.length === 0 ? `
        <div class="text-center py-16 text-muted">
          <p class="text-5xl mb-3">📭</p>
          <p class="font-medium">No orders yet</p>
          <p class="text-sm mt-1">Create your first order to see it here</p>
        </div>
      ` : filtered.map(o => _orderCard(o)).join('')}
    </div>
  `;

  _attachEvents(container);
}

function _orderCard(order) {
  const color    = supplierColor(order.supplier);
  const isExpand = _expanded === order.id;
  const orderedItems = order.items.filter(i => {
    if (i.customQuantity && i.customQuantity.trim()) return true;
    if (!i.quantity || !i.quantity.trim()) return false;
    return i.quantity.trim() !== '0';
  });

  return `
    <div class="card ${isExpand ? 'ring-1 ring-brand' : ''}" data-order-id="${order.id}">
      <!-- Card header (always visible) -->
      <div class="flex items-center gap-3 cursor-pointer" data-action="toggle-order" data-order-id="${order.id}">
        <div class="w-10 h-10 flex items-center justify-center rounded-xl ${color.bg} text-xl shrink-0">
          ${supplierEmoji(order.supplier)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">${supplierLabel(order.supplier)}</div>
          <div class="text-xs text-muted">${formatDateLong(order.date)} · ${orderedItems.length} items</div>
        </div>
        <span class="text-muted text-lg">${isExpand ? '▲' : '▼'}</span>
      </div>

      <!-- Expanded detail -->
      ${isExpand ? `
        <div class="mt-3 pt-3 border-t border-border space-y-1">
          ${orderedItems.map(i => {
            let qtyDisplay;
            if (i.customQuantity && i.customQuantity.trim()) {
              qtyDisplay = escHtml(i.customQuantity.trim());
            } else {
              qtyDisplay = escHtml(i.quantity.trim());
              if (i.unit) qtyDisplay += ` ${escHtml(i.unit)}`;
            }
            return `
            <div class="flex justify-between text-sm py-1">
              <span>${escHtml(i.name)}</span>
              <span class="font-semibold text-brand">${qtyDisplay}</span>
            </div>`;
          }).join('')}
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mt-3 pt-3 border-t border-border">
          <button data-action="copy-order" data-order-id="${order.id}"
            class="flex-1 py-2.5 rounded-xl bg-surface border border-border text-sm font-medium flex items-center justify-center gap-1">
            📋 Copy
          </button>
          ${navigator.share ? `
            <button data-action="share-order" data-order-id="${order.id}"
              class="flex-1 py-2.5 rounded-xl bg-surface border border-border text-sm font-medium flex items-center justify-center gap-1">
              ↗ Share
            </button>
          ` : ''}
          <button data-action="delete-order" data-order-id="${order.id}"
            class="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 text-sm font-medium flex items-center justify-center gap-1">
            🗑 Delete
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function _applyFilter(orders) {
  return orders.filter(o => {
    if (_filter.supplier !== 'all' && o.supplier !== _filter.supplier) return false;
    if (_filter.dateFrom && o.date < _filter.dateFrom) return false;
    if (_filter.dateTo   && o.date > _filter.dateTo)   return false;
    return true;
  });
}

function _attachEvents(container) {
  if (_controller) _controller.abort();
  _controller = new AbortController();
  const { signal } = _controller;

  // Filter controls
  container.querySelector('#filter-supplier')?.addEventListener('change', e => {
    _filter.supplier = e.target.value;
    render(container);
  });
  container.querySelector('#filter-from')?.addEventListener('change', e => {
    _filter.dateFrom = e.target.value;
    render(container);
  });
  container.querySelector('#filter-to')?.addEventListener('change', e => {
    _filter.dateTo = e.target.value;
    render(container);
  });

  container.querySelector('[data-action="clear-filter"]')?.addEventListener('click', () => {
    _filter = { supplier: 'all', dateFrom: '', dateTo: '' };
    render(container);
  });

  // Delegated clicks on order cards
  container.querySelector('#order-list')?.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action  = el.dataset.action;
    const orderId = el.dataset.orderId;

    if (action === 'toggle-order') {
      _expanded = _expanded === orderId ? null : orderId;
      render(container);
      return;
    }

    if (action === 'copy-order') {
      const order = getOrders().find(o => o.id === orderId);
      if (!order) return;
      try {
        await copyText(formatOrderText(order));
        vibrate(10);
        showToast('Copied!', 'success');
      } catch { showToast('Copy failed', 'error'); }
      return;
    }

    if (action === 'share-order') {
      const order = getOrders().find(o => o.id === orderId);
      if (!order) return;
      try {
        await navigator.share({ title: `OTB ${supplierLabel(order.supplier)} Order`, text: formatOrderText(order) });
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Share failed', 'error');
      }
      return;
    }

    if (action === 'delete-order') {
      showConfirm('Delete this order? This cannot be undone.', () => {
        deleteOrder(orderId);
        if (_expanded === orderId) _expanded = null;
        vibrate([10, 50, 10]);
        showToast('Order deleted', 'info');
        render(container);
      });
      return;
    }
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
