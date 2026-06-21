// New Order screen — select supplier, fill quantities, save

import { getCatalogItems, getOrders, addOrder, getCatalog, updateCatalog, getDraft, saveDraft, clearDraft } from '../data.js';
import { generateId, todayISO, supplierLabel, getItemInfo, vibrate, showToast, formatOrderText } from '../utils.js';

let _controller   = null;
let _qtyAnchorY   = null;
let _pointerOnQty = false;
let _draftTimer   = null;

const CAT_LABELS = { all: 'All', common: 'Common', pizzeria: 'Pizzeria', cucina: 'Cucina' };
const CHIPS      = ['½'];

let _state = {
  supplier:        'cfs',
  date:            todayISO(),
  quantities:      {},
  customItems:     [],
  categoryFilter:  'all',
  customOverrides: {},       // itemId → custom quantity string
  expandedCustom:  new Set(), // itemIds with the custom field open
};

export function init() {
  // Only restore draft when state is truly empty (first load / after full save)
  const hasInMemory = Object.keys(_state.quantities).length > 0 ||
                      _state.customItems.length > 0 ||
                      Object.keys(_state.customOverrides).length > 0;
  if (!hasInMemory) {
    const draft = getDraft();
    if (draft) {
      _state.supplier        = draft.supplier        || 'cfs';
      _state.date            = draft.date            || todayISO();
      _state.quantities      = draft.quantities      || {};
      _state.customItems     = draft.customItems     || [];
      _state.categoryFilter  = draft.categoryFilter  || 'all';
      _state.customOverrides = draft.customOverrides || {};
      _state.expandedCustom  = new Set(draft.expandedCustom || []);
    } else {
      _state.date = todayISO();
    }
  }
}

export function render(container) {
  let items       = getCatalogItems(_state.supplier);
  const allOrders = getOrders(_state.supplier);
  if (_state.categoryFilter !== 'all') {
    items = items.filter(i => (i.category || 'common') === _state.categoryFilter);
  }
  const customItems = _state.customItems.filter(ci => ci.supplier === _state.supplier);

  container.innerHTML = `
    <!-- Supplier tabs -->
    <div class="flex gap-2 p-4 pb-0">
      ${['cfs','fish','veggies'].map(s => {
        const hasFill = _hasAnyFilledForSupplier(s);
        return `
        <button data-action="switch-supplier" data-supplier="${s}"
          class="supplier-tab relative flex-1 py-3 rounded-xl font-semibold text-sm transition-all
            ${_state.supplier === s
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface text-muted border border-border'}">
          ${supplierLabel(s)}
          ${hasFill && _state.supplier !== s ? `<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400"></span>` : ''}
        </button>`;
      }).join('')}
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
        <input id="order-date" type="date" value="${_state.date}" class="w-full input-field" />
      </div>
      <button data-action="copy-last"
        class="mt-5 px-4 py-3 bg-surface border border-border rounded-xl text-sm font-medium text-muted whitespace-nowrap"
        title="Pre-fill from last ${supplierLabel(_state.supplier)} order">
        ↩ Last order
      </button>
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
      <button data-action="save-all"
        class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-lg active:opacity-80 flex items-center justify-center gap-2">
        💾 Save All &amp; Copy to Clipboard
      </button>
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
  const info      = getItemInfo(item.id, item.name, allOrders);
  const qty       = _state.quantities[item.id] ?? '';
  const unit      = item.unit || '';
  const hasCustom = _state.expandedCustom.has(item.id);
  const customVal = _state.customOverrides[item.id] || '';
  const isFilled  = !!qty || hasCustom;
  const mode      = item.mode || 'off';
  let badges = '';

  if (mode === 'mustHave') {
    badges += `<span class="badge badge-pin">📌</span>`;
    if (info.streak === 0 && info.weeksMissed >= 1) {
      badges += `<span class="badge badge-danger">Missed last week</span>`;
    }
  } else if (mode === 'track') {
    badges += `<span class="badge badge-track">🔔</span>`;
    if (info.streak >= 2) {
      badges += `<span class="badge badge-warn">${info.streak} in a row</span>`;
    } else if (info.streak === 1) {
      badges += `<span class="badge badge-ok" data-streak-badge data-streak-value="1">Last week ✓</span>`;
    }
  }

  return `
    <div class="card ${isFilled ? 'ring-1 ring-brand' : ''}" data-item-id="${item.id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <span class="font-medium text-sm leading-snug item-name">${escHtml(item.name)}</span>
          ${item.minQty ? `<span class="text-xs text-muted ml-1">min: ${escHtml(item.minQty)}</span>` : ''}
        </div>
        ${badges ? `<div class="flex flex-wrap gap-1 shrink-0">${badges}</div>` : ''}
      </div>

      <!-- Quantity chips -->
      <div class="flex gap-1.5 flex-wrap mb-2">
        ${CHIPS.map(v => `
          <button data-action="chip" data-item-id="${item.id}" data-value="${v}"
            class="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all
              ${qty === v ? 'bg-brand text-white border-brand' : 'bg-surface border-border text-muted'}">
            ${v}
          </button>
        `).join('')}
        <button data-action="toggle-custom" data-item-id="${item.id}"
          class="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all
            ${hasCustom ? 'bg-amber-500 text-white border-amber-500' : 'bg-surface border-border text-muted'}">
          Custom
        </button>
      </div>

      <!-- Qty input + unit suffix -->
      <div class="flex items-center gap-2">
        <input
          type="text"
          data-item-id="${item.id}"
          data-action="qty-input"
          class="input-field qty-input min-w-0 flex-1"
          value="${escHtml(qty)}"
          placeholder="${escHtml(info.lastQty || 'Qty…')}"
          inputmode="decimal"
          enterkeyhint="next"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
        />
        ${unit ? `<span class="text-sm text-muted shrink-0 pr-1">${escHtml(unit)}</span>` : ''}
      </div>

      <!-- Custom override field (shown when expanded) -->
      ${hasCustom ? `
        <div class="mt-2 custom-qty-wrap">
          <input
            type="text"
            data-item-id="${item.id}"
            data-action="custom-qty-input"
            class="input-field qty-input"
            value="${escHtml(customVal)}"
            placeholder="Custom (e.g. 2x500g)…"
            style="border-color: #f59e0b;"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            enterkeyhint="next"
          />
        </div>
      ` : ''}
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

function _buildAndSaveOrder(supplier) {
  const catalogItems = getCatalogItems(supplier);
  const items = [];

  catalogItems.forEach(item => {
    const qty    = _state.quantities[item.id];
    const custom = _state.customOverrides[item.id];
    if (!custom && (!qty || !qty.trim())) return;
    if (!custom && qty.trim() === '0') return;
    items.push({
      itemId:         item.id,
      name:           item.name,
      quantity:       qty ? qty.trim() : '',
      unit:           item.unit || null,
      customQuantity: custom ? custom.trim() : null,
    });
  });

  _state.customItems
    .filter(ci => ci.supplier === supplier && ci.quantity && ci.quantity.trim())
    .forEach(ci => items.push({
      itemId:         null,
      name:           ci.name,
      quantity:       ci.quantity.trim(),
      unit:           null,
      customQuantity: null,
    }));

  if (!items.length) return null;

  const order = {
    id:        generateId(),
    supplier,
    date:      _state.date,
    items,
    createdAt: new Date().toISOString(),
  };
  addOrder(order);

  // Clear state for this supplier
  const supplierItemIds = new Set(catalogItems.map(i => i.id));
  Object.keys(_state.quantities).forEach(id => {
    if (supplierItemIds.has(id)) delete _state.quantities[id];
  });
  Object.keys(_state.customOverrides).forEach(id => {
    if (supplierItemIds.has(id)) delete _state.customOverrides[id];
  });
  _state.expandedCustom.forEach(id => {
    if (supplierItemIds.has(id)) _state.expandedCustom.delete(id);
  });
  _state.customItems = _state.customItems.filter(ci => ci.supplier !== supplier);

  return order;
}

function _saveCurrentOrder() {
  const order = _buildAndSaveOrder(_state.supplier);
  if (!order) {
    showToast('Enter at least one quantity before saving', 'warning');
    return;
  }
  _persistDraft(); // update draft to reflect the now-cleared supplier state
  vibrate(15);
  window.dispatchEvent(new CustomEvent('navigate', {
    detail: { screen: 'output', orderIds: [order.id] }
  }));
}

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
  clearDraft(); // everything saved — wipe draft entirely
  vibrate(15);
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
      _persistDraft();
      render(container);
      return;
    }
    if (action === 'cat-filter') {
      _state.categoryFilter = el.dataset.cat;
      _persistDraft();
      render(container);
      return;
    }
    if (action === 'copy-last') {
      _copyLastOrder();
      _persistDraft();
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
      _persistDraft();
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

    // Chip tap: fill qty input directly without re-render
    if (action === 'chip') {
      const id  = el.dataset.itemId;
      const val = el.dataset.value;
      _state.quantities[id] = val;
      const card = el.closest('.card');
      if (card) {
        const input = card.querySelector('input[data-action="qty-input"]');
        if (input) input.value = val;
        card.classList.add('ring-1', 'ring-brand');
        card.querySelectorAll('[data-action="chip"]').forEach(btn => {
          const active = btn.dataset.value === val;
          btn.classList.toggle('bg-brand',      active);
          btn.classList.toggle('text-white',    active);
          btn.classList.toggle('border-brand',  active);
          btn.classList.toggle('bg-surface',    !active);
          btn.classList.toggle('text-muted',    !active);
          btn.classList.toggle('border-border', !active);
        });
        const streakBadge = card.querySelector('[data-streak-badge]');
        if (streakBadge && streakBadge.dataset.streakValue === '1') {
          streakBadge.className   = 'badge badge-warn';
          streakBadge.textContent = '⚠ 2 in a row';
        }
      }
      _persistDraft();
      vibrate(6);
      return;
    }

    // Toggle custom override field without re-render
    if (action === 'toggle-custom') {
      const id   = el.dataset.itemId;
      const card = el.closest('.card');
      if (!card) return;
      const existing = card.querySelector('.custom-qty-wrap');
      if (existing) {
        existing.remove();
        _state.expandedCustom.delete(id);
        delete _state.customOverrides[id];
        el.classList.remove('bg-amber-500', 'text-white', 'border-amber-500');
        el.classList.add('bg-surface', 'text-muted', 'border-border');
        const qty = _state.quantities[id] || '';
        card.classList.toggle('ring-1',     !!qty.trim());
        card.classList.toggle('ring-brand', !!qty.trim());
      } else {
        _state.expandedCustom.add(id);
        const wrap = document.createElement('div');
        wrap.className = 'mt-2 custom-qty-wrap';
        const inp = document.createElement('input');
        inp.type              = 'text';
        inp.dataset.itemId    = id;
        inp.dataset.action    = 'custom-qty-input';
        inp.className         = 'input-field qty-input w-full';
        inp.value             = _state.customOverrides[id] || '';
        inp.placeholder       = 'Custom (e.g. 2x500g)…';
        inp.style.borderColor = '#f59e0b';
        inp.autocomplete      = 'off';
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('enterkeyhint', 'next');
        wrap.appendChild(inp);
        card.appendChild(wrap);
        inp.focus();
        el.classList.add('bg-amber-500', 'text-white', 'border-amber-500');
        el.classList.remove('bg-surface', 'text-muted', 'border-border');
        card.classList.add('ring-1', 'ring-brand');
      }
      _persistDraft();
      return;
    }
  }, { signal });

  container.querySelector('#order-date')?.addEventListener('change', e => {
    _state.date = e.target.value;
    _persistDraft();
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
    if (el.dataset.action !== 'qty-input' && el.dataset.action !== 'ci-qty-input' && el.dataset.action !== 'custom-qty-input') return;
    e.preventDefault();
    const inputs = Array.from(container.querySelectorAll(
      'input[data-action="qty-input"], input[data-action="custom-qty-input"], input[data-action="ci-qty-input"]'
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
    _pointerOnQty = !!(e.target.closest(
      'input[data-action="qty-input"], input[data-action="ci-qty-input"], input[data-action="custom-qty-input"]'
    ));
  }, { signal });

  container.addEventListener('focusout', e => {
    const el    = e.target;
    const isQty = el.dataset.action === 'qty-input' || el.dataset.action === 'ci-qty-input' || el.dataset.action === 'custom-qty-input';
    if (isQty) {
      const card = el.closest('.card');
      if (card) { card.style.outline = ''; card.style.outlineOffset = ''; }
      _qtyAnchorY = el.getBoundingClientRect().top;
    } else {
      _qtyAnchorY = null;
    }
  }, { signal });

  container.addEventListener('focusin', e => {
    const el    = e.target;
    const isQty = el.dataset.action === 'qty-input' || el.dataset.action === 'ci-qty-input' || el.dataset.action === 'custom-qty-input';
    if (isQty) {
      const card = el.closest('.card');
      if (card) { card.style.outline = '2px solid #f59e0b'; card.style.outlineOffset = '1px'; }
    }
    const anchor  = _qtyAnchorY;
    _qtyAnchorY   = null;
    if (!isQty || _pointerOnQty || anchor === null) {
      _pointerOnQty = false;
      return;
    }
    _pointerOnQty = false;
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
        const filled    = !!el.value.trim();
        const hasCustom = _state.expandedCustom.has(el.dataset.itemId);
        card.classList.toggle('ring-1',     filled || hasCustom);
        card.classList.toggle('ring-brand', filled || hasCustom);
        // Sync chip highlight with typed value
        card.querySelectorAll('[data-action="chip"]').forEach(btn => {
          const active = filled && btn.dataset.value === el.value.trim();
          btn.classList.toggle('bg-brand',      active);
          btn.classList.toggle('text-white',    active);
          btn.classList.toggle('border-brand',  active);
          btn.classList.toggle('bg-surface',    !active);
          btn.classList.toggle('text-muted',    !active);
          btn.classList.toggle('border-border', !active);
        });
        // Upgrade streak badge once qty entered
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
    if (el.dataset.action === 'custom-qty-input') {
      _state.customOverrides[el.dataset.itemId] = el.value;
    }
    _scheduleDraftSave();
  }, { signal });
}

function _copyLastOrder() {
  const orders = getOrders(_state.supplier);
  if (!orders.length) { showToast('No previous order found for this supplier', 'info'); return; }
  orders[0].items.forEach(i => {
    if (i.itemId) {
      _state.quantities[i.itemId] = i.quantity || '';
      if (i.customQuantity) {
        _state.customOverrides[i.itemId] = i.customQuantity;
        _state.expandedCustom.add(i.itemId);
      }
    }
  });
  showToast('Quantities pre-filled from last order', 'success');
}

function _saveCustomItem(container) {
  const name = container.querySelector('#ci-name')?.value.trim();
  const qty  = container.querySelector('#ci-qty')?.value.trim();
  const addToCatalog = container.querySelector('#ci-catalog')?.checked;
  if (!name) { showToast('Enter an item name', 'warning'); return; }

  _state.customItems.push({
    id:           generateId(),
    name,
    quantity:     qty,
    addToCatalog,
    supplier:     _state.supplier,
  });
  _persistDraft();

  if (addToCatalog) {
    const cat = getCatalog();
    cat[_state.supplier].push({
      id:       generateId(),
      name,
      minQty:   '',
      mode:     'off',
      category: 'common',
      unit:     null,
      archived: false,
    });
    updateCatalog(cat);
  }

  render(container);
}

function _scheduleDraftSave() {
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(_persistDraft, 400);
}

function _persistDraft() {
  saveDraft({
    supplier:        _state.supplier,
    date:            _state.date,
    quantities:      { ..._state.quantities },
    customItems:     [..._state.customItems],
    categoryFilter:  _state.categoryFilter,
    customOverrides: { ..._state.customOverrides },
    expandedCustom:  [..._state.expandedCustom],
  });
}

function _hasAnyFilledForSupplier(supplier) {
  const items = getCatalogItems(supplier);
  const hasCatalogQty = items.some(i => {
    const qty    = _state.quantities[i.id]?.trim();
    const custom = _state.customOverrides[i.id]?.trim();
    return custom || (qty && qty !== '0');
  });
  const hasCustomQty = _state.customItems.some(ci => ci.supplier === supplier && ci.quantity?.trim());
  return hasCatalogQty || hasCustomQty;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
