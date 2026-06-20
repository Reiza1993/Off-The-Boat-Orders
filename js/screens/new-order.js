// New Order screen — select supplier, fill quantities, save

import { getCatalogItems, getOrders, addOrder, getCatalog, updateCatalog } from '../data.js';
import { generateId, todayISO, supplierLabel, getItemInfo, vibrate, showToast, formatOrderText } from '../utils.js';

let _controller = null; // AbortController — prevents duplicate listeners on re-render

// Tracks Y-position of a qty input when it loses focus, so the next focused
// qty input can be scrolled to the same position. Null when a pointer tap caused the focus.
let _qtyAnchorY  = null;
let _pointerOnQty = false;

// State persisted while the screen is open
const CAT_LABELS = { all: 'All', common: 'Common', pizzeria: 'Pizzeria', cucina: 'Cucina' };

let _state = {
  supplier: 'cfs',
  date: todayISO(),
  // quantities keyed by itemId — persists across tab switches since IDs don't overlap
  quantities: {},
  // custom items tagged with the supplier they were added under
  customItems: [],  // [{ id, name, quantity, addToCatalog, supplier }]
  categoryFilter: 'all', // 'all' | 'common' | 'pizzeria' | 'cucina'
};

export function init() {
  _state.date = todayISO();
  // quantities & customItems intentionally survive tab switches so partial orders persist
}

export function render(container) {
  let items       = getCatalogItems(_state.supplier);
  const allOrders = getOrders(_state.supplier);
  // Apply category filter
  if (_state.categoryFilter !== 'all') {
    items = items.filter(i => (i.category || 'common') === _state.categoryFilter);
  }
  // Only show custom items belonging to the active supplier tab
  const customItems = _state.customItems.filter(ci => ci.supplier === _state.supplier);

  container.innerHTML = `
    <!-- Supplier tabs -->
    <div class="flex gap-2 p-4 pb-0">
      ${['cfs','fish','veggies'].map(s => {
        // Show a dot indicator if that supplier tab has any filled quantities
        const hasFill = _hasAnyFilledForSupplier(s);
        return `
        <button
          data-action="switch-supplier"
          data-supplier="${s}"
          class="supplier-tab relative flex-1 py-3 rounded-xl font-semibold text-sm transition-all
            ${_state.supplier === s
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface text-muted border border-border'}">
          ${supplierLabel(s)}
          ${hasFill && _state.supplier !== s ? `<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400"></span>` : ''}
        </button>
      `}).join('')}
    </div>

    <!-- Category filter -->
    <div class="flex gap-1.5 px-4 pt-3">
      ${Object.entries(CAT_LABELS).map(([c, label]) => `
        <button data-action="cat-filter" data-cat="${c}"
          class="flex-1 py-2 rounded-xl text-xs font-semibold transition-all
            ${_state.categoryFilter === c
              ? 'bg-brand text-white shadow-sm'
              : 'bg-surface text-muted border border-border'}">
          ${label}
        </button>
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

    <!-- Search -->
    <div class="px-4 pt-3">
      <input id="order-search" type="search" placeholder="Search items…"
        class="input-field" autocomplete="off" autocorrect="off" autocapitalize="off">
    </div>

    <!-- Item list -->
    <div id="item-list" class="px-4 pt-3 space-y-2 pb-2">
      ${items.map(item => _itemCard(item, allOrders)).join('')}
    </div>

    <!-- Custom items for this supplier -->
    ${customItems.length ? `
      <div class="px-4 pt-2 space-y-2">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide">Custom items</p>
        ${customItems.map(ci => _customItemCard(ci)).join('')}
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
        <p class="font-semibold text-sm">New custom item for ${supplierLabel(_state.supplier)}</p>
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

    <!-- Bottom action buttons (sticky) -->
    <div class="sticky-bottom-action space-y-2">
      <!-- Primary: Save all non-empty supplier tabs + copy combined text -->
      <button data-action="save-all"
        class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-lg active:opacity-80 flex items-center justify-center gap-2">
        💾 Save All &amp; Copy to Clipboard
      </button>
      <!-- Secondary: Save only the active supplier tab -->
      <button data-action="save-order"
        class="w-full py-3 bg-surface border border-border rounded-2xl font-semibold text-sm active:opacity-80 flex items-center justify-center gap-1">
        Save ${supplierLabel(_state.supplier)} only →
      </button>
    </div>
  `;

  _attachEvents(container);
}

// ── Item card HTML ──────────────────────────────────────────────────────────

function _itemCard(item, allOrders) {
  const info = getItemInfo(item.id, item.name, allOrders);
  const qty  = _state.quantities[item.id] ?? '';
  const mode = item.mode || 'off';
  let badges = '';

  if (mode === 'mustHave') {
    // Always show 📌 icon; add red "Missed last week" if not in most recent order
    badges += `<span class="badge badge-pin">📌</span>`;
    if (info.streak === 0 && info.weeksMissed >= 1) {
      badges += `<span class="badge badge-danger">Missed last week</span>`;
    }

  } else if (mode === 'track') {
    // Show 🔔 icon; streak badges are dynamic (see input handler)
    badges += `<span class="badge badge-track">🔔</span>`;
    if (info.streak >= 2) {
      // Already 2+ in a row — always show orange, no need to be dynamic
      badges += `<span class="badge badge-warn">${info.streak} in a row</span>`;
    } else if (info.streak === 1) {
      // Ordered last week — badge upgrades to orange once user enters a qty
      badges += `<span class="badge badge-ok" data-streak-badge data-streak-value="1">Last week ✓</span>`;
    }
  }
  // mode === 'off': no badges

  return `
    <div class="card ${qty ? 'ring-1 ring-brand' : ''}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <span class="font-medium text-sm leading-snug item-name">${item.name}</span>
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
        enterkeyhint="next"
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
        enterkeyhint="next"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      />
    </div>
  `;
}

// ── Save helpers ────────────────────────────────────────────────────────────

// Build and save an order for one supplier. Returns the saved order, or null if empty.
function _buildAndSaveOrder(supplier) {
  const catalogItems = getCatalogItems(supplier);
  const items = [];

  catalogItems.forEach(item => {
    const qty = _state.quantities[item.id];
    if (qty && qty.trim()) {
      items.push({ itemId: item.id, name: item.name, quantity: qty.trim() });
    }
  });

  _state.customItems
    .filter(ci => ci.supplier === supplier && ci.quantity && ci.quantity.trim())
    .forEach(ci => items.push({ itemId: null, name: ci.name, quantity: ci.quantity.trim() }));

  if (!items.length) return null;

  const order = {
    id: generateId(),
    supplier,
    date: _state.date,
    items,
    createdAt: new Date().toISOString(),
  };
  addOrder(order);

  // Clear state for this supplier
  const supplierItemIds = new Set(catalogItems.map(i => i.id));
  Object.keys(_state.quantities).forEach(id => {
    if (supplierItemIds.has(id)) delete _state.quantities[id];
  });
  _state.customItems = _state.customItems.filter(ci => ci.supplier !== supplier);

  return order;
}

// "Save [Supplier] only" — saves the active tab
function _saveCurrentOrder() {
  const order = _buildAndSaveOrder(_state.supplier);
  if (!order) {
    showToast('Enter at least one quantity before saving', 'warning');
    return;
  }
  vibrate(15);
  window.dispatchEvent(new CustomEvent('navigate', {
    detail: { screen: 'output', orderIds: [order.id] }
  }));
}

// "Save All & Copy" — saves every supplier that has at least one filled item
async function _saveAllOrders() {
  const saved = [];
  for (const sup of ['cfs', 'fish', 'veggies']) {
    const order = _buildAndSaveOrder(sup);
    if (order) saved.push(order);
  }

  if (!saved.length) {
    showToast('Enter quantities in at least one tab first', 'warning');
    return;
  }

  vibrate(15);

  // Navigate to output screen with all saved order IDs
  window.dispatchEvent(new CustomEvent('navigate', {
    detail: { screen: 'output', orderIds: saved.map(o => o.id) }
  }));
}

// ── Events ─────────────────────────────────────────────────────────────────

function _attachEvents(container) {
  if (_controller) _controller.abort();
  _controller = new AbortController();
  const { signal } = _controller;

  container.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'switch-supplier') {
      _state.supplier = el.dataset.supplier;
      render(container);
      return;
    }
    if (action === 'cat-filter') {
      _state.categoryFilter = el.dataset.cat;
      render(container);
      return;
    }
    if (action === 'copy-last') {
      _copyLastOrder();
      render(container);
      return;
    }
    if (action === 'add-custom') {
      container.querySelector('#custom-item-form').classList.toggle('hidden');
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
      _state.customItems = _state.customItems.filter(c => c.id !== el.dataset.ciId);
      render(container);
      return;
    }
    if (action === 'save-order') {
      _saveCurrentOrder();
      return;
    }
    if (action === 'save-all') {
      _saveAllOrders();
      return;
    }
  });

  container.querySelector('#order-date')?.addEventListener('change', e => {
    _state.date = e.target.value;
  }, { signal });

  // Search — live filter without re-render
  container.querySelector('#order-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    container.querySelectorAll('#item-list .card').forEach(card => {
      const name = card.querySelector('.item-name')?.textContent.toLowerCase() || '';
      card.style.display = (q && !name.includes(q)) ? 'none' : '';
    });
  }, { signal });

  // Enter / Next key — move focus to the next qty input
  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (el.dataset.action !== 'qty-input' && el.dataset.action !== 'ci-qty-input') return;
    e.preventDefault();
    const inputs = Array.from(container.querySelectorAll(
      'input[data-action="qty-input"], input[data-action="ci-qty-input"]'
    )).filter(inp => inp.closest('.card')?.style.display !== 'none');
    const idx = inputs.indexOf(el);
    if (idx >= 0 && idx < inputs.length - 1) {
      inputs[idx + 1].focus();
    } else {
      el.blur();
    }
  }, { signal });

  // pointerdown flags deliberate taps so we don't hijack scroll correction
  container.addEventListener('pointerdown', e => {
    const isQty = !!(e.target.closest('input[data-action="qty-input"], input[data-action="ci-qty-input"]'));
    _pointerOnQty = isQty;
  }, { signal });

  container.addEventListener('focusout', e => {
    const el = e.target;
    if (el.dataset.action === 'qty-input' || el.dataset.action === 'ci-qty-input') {
      const card = el.closest('.card');
      if (card) { card.style.outline = ''; card.style.outlineOffset = ''; }
      _qtyAnchorY = el.getBoundingClientRect().top;
    } else {
      _qtyAnchorY = null;
    }
  }, { signal });

  container.addEventListener('focusin', e => {
    const el    = e.target;
    const isQty = el.dataset.action === 'qty-input' || el.dataset.action === 'ci-qty-input';

    if (isQty) {
      const card = el.closest('.card');
      if (card) { card.style.outline = '2px solid #f59e0b'; card.style.outlineOffset = '1px'; }
    }

    const anchor = _qtyAnchorY;
    _qtyAnchorY  = null;

    if (!isQty || _pointerOnQty || anchor === null) {
      _pointerOnQty = false;
      return;
    }
    _pointerOnQty = false;

    // rAF runs after the browser has auto-scrolled the new element into view
    requestAnimationFrame(() => {
      const delta = el.getBoundingClientRect().top - anchor;
      if (Math.abs(delta) > 5) window.scrollBy(0, delta);
    });
  }, { signal });

  container.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.action === 'qty-input') {
      _state.quantities[el.dataset.itemId] = el.value;
      const card = el.closest('.card');
      if (card) {
        const filled = !!el.value.trim();
        card.classList.toggle('ring-1',     filled);
        card.classList.toggle('ring-brand', filled);

        // For Track items ordered last week (streak=1), upgrade badge once qty entered
        const streakBadge = card.querySelector('[data-streak-badge]');
        if (streakBadge && streakBadge.dataset.streakValue === '1') {
          if (filled) {
            streakBadge.className   = 'badge badge-warn';
            streakBadge.textContent = '⚠ 2 in a row';
          } else {
            streakBadge.className   = 'badge badge-ok';
            streakBadge.textContent = 'Last week ✓';
          }
        }
      }
    }
    if (el.dataset.action === 'ci-qty-input') {
      const ci = _state.customItems.find(c => c.id === el.dataset.ciId);
      if (ci) ci.quantity = el.value;
    }
  }, { signal });
}

function _copyLastOrder() {
  const orders = getOrders(_state.supplier);
  if (!orders.length) { showToast('No previous order found for this supplier', 'info'); return; }
  orders[0].items.forEach(i => {
    if (i.itemId) _state.quantities[i.itemId] = i.quantity;
  });
  showToast('Quantities pre-filled from last order', 'success');
}

function _saveCustomItem(container) {
  const name = container.querySelector('#ci-name')?.value.trim();
  const qty  = container.querySelector('#ci-qty')?.value.trim();
  const addToCatalog = container.querySelector('#ci-catalog')?.checked;

  if (!name) { showToast('Enter an item name', 'warning'); return; }

  _state.customItems.push({
    id: generateId(),
    name,
    quantity: qty,
    addToCatalog,
    supplier: _state.supplier,  // tag with current supplier
  });

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

// ── Helpers ─────────────────────────────────────────────────────────────────

// Returns true if the supplier has any filled quantities (for the dot indicator)
function _hasAnyFilledForSupplier(supplier) {
  const items = getCatalogItems(supplier);
  const hasCatalogQty = items.some(i => _state.quantities[i.id]?.trim());
  const hasCustomQty  = _state.customItems.some(ci => ci.supplier === supplier && ci.quantity?.trim());
  return hasCatalogQty || hasCustomQty;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
