// New Order screen — select supplier, fill quantities, save

import { getCatalogItems, getOrders, addOrder, getCatalog, updateCatalog } from '../data.js';
import { generateId, todayISO, supplierLabel, getItemInfo, vibrate, showToast } from '../utils.js';

// State persisted while the screen is open
let _state = {
  supplier: 'cfs',
  date: todayISO(),
  quantities: {},   // itemId → quantity string
  customItems: [],  // [{ id, name, quantity, addToCatalog }]
};

export function init() {
  _state.date = todayISO();
  // Don't reset supplier/quantities between navigations so partial orders persist
}

export function render(container) {
  container.innerHTML = _buildHTML();
  _attachEvents(container);
}

// ── HTML ───────────────────────────────────────────────────────────────────

function _buildHTML() {
  const items    = getCatalogItems(_state.supplier);
  const allOrders = getOrders(_state.supplier);

  return `
    <!-- Supplier tabs -->
    <div class="flex gap-2 p-4 pb-0">
      ${['cfs','fish','veggies'].map(s => `
        <button
          data-action="switch-supplier"
          data-supplier="${s}"
          class="supplier-tab flex-1 py-3 rounded-xl font-semibold text-sm transition-all
            ${_state.supplier === s
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface text-muted border border-border'}"
        >${supplierLabel(s)}</button>
      `).join('')}
    </div>

    <!-- Date + Copy last order -->
    <div class="flex items-center gap-3 px-4 pt-4">
      <div class="flex-1">
        <label class="block text-xs text-muted mb-1">Order date</label>
        <input
          id="order-date"
          type="date"
          value="${_state.date}"
          class="w-full input-field"
        />
      </div>
      <button
        data-action="copy-last"
        class="mt-5 px-4 py-3 bg-surface border border-border rounded-xl text-sm font-medium text-muted whitespace-nowrap"
        title="Pre-fill from last ${supplierLabel(_state.supplier)} order"
      >↩ Last order</button>
    </div>

    <!-- Item list -->
    <div id="item-list" class="px-4 pt-4 space-y-2 pb-2">
      ${items.map(item => _itemCard(item, allOrders)).join('')}
    </div>

    <!-- Custom items -->
    ${_state.customItems.length ? `
      <div class="px-4 pt-2 space-y-2">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide">Custom items</p>
        ${_state.customItems.map(ci => _customItemCard(ci)).join('')}
      </div>
    ` : ''}

    <!-- Add custom item -->
    <div class="px-4 pt-4 pb-2">
      <button data-action="add-custom"
        class="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted font-medium flex items-center justify-center gap-2">
        <span class="text-xl leading-none">+</span> Add custom item
      </button>
    </div>

    <!-- Add custom item form (hidden by default) -->
    <div id="custom-item-form" class="hidden px-4 pb-4">
      <div class="card space-y-3">
        <p class="font-semibold text-sm">New custom item</p>
        <input id="ci-name" type="text" placeholder="Item name" class="input-field"
          autocomplete="off" autocorrect="off" autocapitalize="words">
        <input id="ci-qty" type="text" placeholder="Quantity (e.g. 2 boxes)" class="input-field"
          inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off">
        <label class="flex items-center gap-2 text-sm">
          <input id="ci-catalog" type="checkbox" class="w-4 h-4 rounded">
          Add to catalog permanently
        </label>
        <div class="flex gap-2">
          <button data-action="ci-cancel" class="flex-1 py-3 rounded-xl bg-surface border border-border text-sm font-medium">Cancel</button>
          <button data-action="ci-save"   class="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-medium">Add item</button>
        </div>
      </div>
    </div>

    <!-- Save order (sticky bottom) -->
    <div class="sticky-bottom-action">
      <button data-action="save-order"
        class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-lg active:opacity-80">
        Save Order ✓
      </button>
    </div>
  `;
}

function _itemCard(item, allOrders) {
  const info = getItemInfo(item.id, item.name, allOrders);
  const qty  = _state.quantities[item.id] ?? '';
  const isVeggies = _state.supplier === 'veggies';

  // Badge HTML
  let badges = '';
  if (!isVeggies) {
    if (item.alwaysOn) {
      badges += `<span class="badge badge-pin" title="Always-on item — streak warnings suppressed">📌</span>`;
    }
    if (info.streak >= 2 && !item.alwaysOn) {
      badges += `<span class="badge badge-warn">${info.streak} weeks ⚠</span>`;
    } else if (info.streak >= 1) {
      badges += `<span class="badge badge-ok">Last week ✓</span>`;
    }
    if (info.weeksMissed >= 3) {
      badges += `<span class="badge badge-miss">Not ordered ${info.weeksMissed}w</span>`;
    }
  }

  return `
    <div class="card ${qty ? 'ring-1 ring-brand' : ''}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <span class="font-medium text-sm leading-snug">${item.name}</span>
          ${item.minQty ? `<span class="text-xs text-muted ml-1">min: ${item.minQty}</span>` : ''}
        </div>
        ${badges ? `<div class="flex flex-wrap gap-1 shrink-0">${badges}</div>` : ''}
      </div>
      <input
        type="text"
        data-item-id="${item.id}"
        data-action="qty-input"
        class="input-field qty-input"
        value="${escHtml(qty)}"
        placeholder="${escHtml(info.lastQty || 'Quantity…')}"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      />
    </div>
  `;
}

function _customItemCard(ci) {
  return `
    <div class="card ring-1 ring-amber-400">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="font-medium text-sm">${escHtml(ci.name)}</span>
        <button data-action="remove-custom" data-ci-id="${ci.id}"
          class="text-red-500 text-lg leading-none p-1">✕</button>
      </div>
      <input
        type="text"
        data-ci-id="${ci.id}"
        data-action="ci-qty-input"
        class="input-field qty-input"
        value="${escHtml(ci.quantity ?? '')}"
        placeholder="Quantity…"
        inputmode="decimal"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      />
    </div>
  `;
}

// ── Events ─────────────────────────────────────────────────────────────────

function _attachEvents(container) {
  // Supplier tabs
  container.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'switch-supplier') {
      _state.supplier = el.dataset.supplier;
      render(container);
      return;
    }

    if (action === 'copy-last') {
      _copyLastOrder();
      render(container);
      return;
    }

    if (action === 'add-custom') {
      const form = container.querySelector('#custom-item-form');
      form.classList.toggle('hidden');
      return;
    }

    if (action === 'ci-cancel') {
      container.querySelector('#custom-item-form').classList.add('hidden');
      return;
    }

    if (action === 'ci-save') {
      _saveCustomItem(container);
      return;
    }

    if (action === 'remove-custom') {
      const id = el.dataset.ciId;
      _state.customItems = _state.customItems.filter(c => c.id !== id);
      render(container);
      return;
    }

    if (action === 'save-order') {
      _saveOrder();
      return;
    }
  });

  // Date change
  container.querySelector('#order-date')?.addEventListener('change', e => {
    _state.date = e.target.value;
  });

  // Quantity inputs — catalog items
  container.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.action === 'qty-input') {
      _state.quantities[el.dataset.itemId] = el.value;
      // Highlight card when filled
      const card = el.closest('.card');
      if (card) card.classList.toggle('ring-1', !!el.value.trim());
      if (card) card.classList.toggle('ring-brand', !!el.value.trim());
    }
    if (el.dataset.action === 'ci-qty-input') {
      const ci = _state.customItems.find(c => c.id === el.dataset.ciId);
      if (ci) ci.quantity = el.value;
    }
  });
}

function _copyLastOrder() {
  const orders = getOrders(_state.supplier);
  if (!orders.length) { showToast('No previous order found for this supplier', 'info'); return; }
  const last = orders[0];
  last.items.forEach(i => {
    if (i.itemId) _state.quantities[i.itemId] = i.quantity;
  });
  showToast('Quantities pre-filled from last order', 'success');
}

function _saveCustomItem(container) {
  const name = container.querySelector('#ci-name')?.value.trim();
  const qty  = container.querySelector('#ci-qty')?.value.trim();
  const addToCatalog = container.querySelector('#ci-catalog')?.checked;

  if (!name) { showToast('Enter an item name', 'warning'); return; }

  _state.customItems.push({ id: generateId(), name, quantity: qty, addToCatalog });

  if (addToCatalog) {
    const cat = getCatalog();
    cat[_state.supplier].push({
      id: generateId(),
      name,
      minQty: '',
      alwaysOn: false,
      archived: false,
    });
    updateCatalog(cat);
  }

  render(container);
}

function _saveOrder() {
  // Collect all items with non-blank quantities
  const items = [];

  const catalogItems = getCatalogItems(_state.supplier);
  catalogItems.forEach(item => {
    const qty = _state.quantities[item.id];
    if (qty && qty.trim()) {
      items.push({ itemId: item.id, name: item.name, quantity: qty.trim() });
    }
  });

  _state.customItems.forEach(ci => {
    if (ci.quantity && ci.quantity.trim()) {
      items.push({ itemId: null, name: ci.name, quantity: ci.quantity.trim() });
    }
  });

  if (!items.length) {
    showToast('Enter at least one quantity before saving', 'warning');
    return;
  }

  const order = {
    id: generateId(),
    supplier: _state.supplier,
    date: _state.date,
    items,
    createdAt: new Date().toISOString(),
  };

  addOrder(order);
  vibrate(15);

  // Reset state for next order
  _state.quantities = {};
  _state.customItems = [];

  // Navigate to output screen
  window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'output', orderId: order.id } }));
}

// Minimal HTML escape to prevent XSS from user-entered item names
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
