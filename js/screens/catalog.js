// Catalog management — add/edit/remove items, set tracking mode, filter by mode
// AbortController ensures only one delegated click listener exists at a time.

import { getCatalog, updateCatalog } from '../data.js';
import { generateId, supplierLabel, vibrate, showToast, showConfirm, MODES, MODE_META } from '../utils.js';

let _supplier   = 'cfs';
let _modeFilter = 'all';   // 'all' | 'off' | 'track' | 'mustHave'
let _editingId  = null;
let _controller = null;

export function init() {}

export function render(container) {
  const catalog    = getCatalog();
  const allItems   = (catalog[_supplier] || []).filter(i => !i.archived);
  const filtered   = _modeFilter === 'all'
    ? allItems
    : allItems.filter(i => (i.mode || 'off') === _modeFilter);

  container.innerHTML = `
    <!-- Quick link to Backup -->
    <div class="px-4 pt-4">
      <button data-action="go-backup"
        class="w-full py-3 bg-surface border border-border rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-muted">
        💾 Backup &amp; Restore
      </button>
    </div>

    <!-- Supplier tabs -->
    <div class="flex gap-2 px-4 pt-3">
      ${['cfs','fish','veggies'].map(s => `
        <button data-action="switch-supplier" data-supplier="${s}"
          class="flex-1 py-3 rounded-xl font-semibold text-sm transition-all
            ${_supplier === s
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface text-muted border border-border'}">
          ${supplierLabel(s)}
        </button>
      `).join('')}
    </div>

    <!-- Mode legend -->
    <div class="mx-4 mt-3 p-3 rounded-xl bg-surface border border-border">
      <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tracking modes — tap icon to cycle</p>
      ${MODES.map(m => `
        <div class="flex items-center gap-2 text-xs py-0.5">
          <span class="text-base w-5 text-center">${MODE_META[m].icon}</span>
          <span class="font-semibold w-16">${MODE_META[m].label}</span>
          <span class="text-muted">— ${MODE_META[m].desc}</span>
        </div>
      `).join('')}
    </div>

    <!-- Filter by mode -->
    <div class="px-4 pt-3 flex items-center gap-2">
      <label class="text-xs text-muted font-medium shrink-0">Show:</label>
      <select id="mode-filter" class="input-field text-sm flex-1">
        <option value="all"      ${_modeFilter==='all'      ?'selected':''}>All modes</option>
        <option value="mustHave" ${_modeFilter==='mustHave' ?'selected':''}>📌 Must Have</option>
        <option value="track"    ${_modeFilter==='track'    ?'selected':''}>🔔 Track</option>
        <option value="off"      ${_modeFilter==='off'      ?'selected':''}>⚪ Off</option>
      </select>
      <span class="text-xs text-muted shrink-0">${filtered.length} / ${allItems.length}</span>
    </div>

    <!-- Item list -->
    <div id="catalog-list" class="px-4 pt-2 space-y-2 pb-4">
      ${filtered.map(item => _itemRow(item)).join('')}
      ${filtered.length === 0 ? `
        <div class="card text-center text-muted py-6 text-sm">No items match this filter</div>
      ` : ''}

      <!-- Add item form (always visible, below the filtered list) -->
      ${_modeFilter === 'all' ? `
        <div class="card mt-2 space-y-3">
          <p class="font-semibold text-sm">Add item to ${supplierLabel(_supplier)}</p>
          <input id="new-name" type="text" placeholder="Item name" class="input-field"
            autocomplete="off" autocorrect="off" autocapitalize="words">
          <input id="new-minqty" type="text" placeholder="Min qty (e.g. 3, 1 bag, as needed)" class="input-field"
            autocomplete="off" autocorrect="off" autocapitalize="off">
          <button data-action="add-item" class="w-full py-3 bg-brand text-white rounded-xl font-semibold text-sm">
            + Add item
          </button>
        </div>
      ` : `
        <button data-action="clear-filter"
          class="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted">
          Clear filter to add items
        </button>
      `}
    </div>
  `;

  _attachEvents(container);
}

// ── Item row ───────────────────────────────────────────────────────────────

function _itemRow(item) {
  const isEditing = _editingId === item.id;
  const mode      = item.mode || 'off';
  const meta      = MODE_META[mode];
  const nextMode  = MODES[(MODES.indexOf(mode) + 1) % MODES.length];

  if (isEditing) {
    return `
      <div class="card ring-1 ring-brand space-y-2" data-item-id="${item.id}">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide">Editing</p>
        <input id="edit-name-${escId(item.id)}" type="text" value="${escHtml(item.name)}"
          class="input-field" autocomplete="off" autocorrect="off" autocapitalize="words">
        <input id="edit-minqty-${escId(item.id)}" type="text" value="${escHtml(item.minQty || '')}"
          placeholder="Min qty (e.g. 3, 1 bag, as needed)" class="input-field"
          autocomplete="off" autocorrect="off" autocapitalize="off">
        <div class="flex gap-2">
          <button data-action="save-edit" data-item-id="${item.id}"
            class="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold">Save</button>
          <button data-action="cancel-edit"
            class="flex-1 py-3 rounded-xl bg-surface border border-border text-sm font-medium text-muted">Cancel</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" data-item-id="${item.id}">
      <div class="flex items-center gap-3">

        <!-- Mode cycle button: Off → Track → Must Have → Off -->
        <button
          data-action="cycle-mode"
          data-item-id="${item.id}"
          data-next-mode="${nextMode}"
          title="${meta.label}: ${meta.desc} — tap to change to ${MODE_META[nextMode].label}"
          class="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border
            ${mode === 'mustHave' ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700' : ''}
            ${mode === 'track'    ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : ''}
            ${mode === 'off'      ? 'bg-surface border-border' : ''}
          ">
          <span class="text-xl leading-none">${meta.icon}</span>
          <span class="text-[9px] font-bold mt-0.5
            ${mode === 'mustHave' ? 'text-amber-700 dark:text-amber-400' : ''}
            ${mode === 'track'    ? 'text-blue-600 dark:text-blue-400' : ''}
            ${mode === 'off'      ? 'text-muted' : ''}
          ">${meta.label}</span>
        </button>

        <!-- Name + min qty -->
        <div class="flex-1 min-w-0">
          <p class="font-medium text-sm leading-snug">${escHtml(item.name)}</p>
          <p class="text-xs text-muted">${item.minQty ? `min: ${escHtml(item.minQty)}` : 'no min set'}</p>
        </div>

        <!-- Edit + Delete -->
        <div class="flex gap-1 shrink-0">
          <button data-action="edit-item" data-item-id="${item.id}"
            class="w-11 h-11 flex items-center justify-center rounded-xl bg-surface border border-border text-lg"
            aria-label="Edit ${escHtml(item.name)}">✏️</button>
          <button data-action="delete-item" data-item-id="${item.id}"
            class="w-11 h-11 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-lg"
            aria-label="Delete ${escHtml(item.name)}">🗑</button>
        </div>
      </div>
    </div>
  `;
}

// ── Events ─────────────────────────────────────────────────────────────────

function _attachEvents(container) {
  if (_controller) _controller.abort();
  _controller = new AbortController();
  const { signal } = _controller;

  // Mode filter dropdown
  container.querySelector('#mode-filter')?.addEventListener('change', e => {
    _modeFilter = e.target.value;
    render(container);
  }, { signal });

  // All button clicks via delegation
  container.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'go-backup') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'backup' } }));
      return;
    }

    if (action === 'switch-supplier') {
      _supplier  = el.dataset.supplier;
      _editingId = null;
      render(container);
      return;
    }

    if (action === 'clear-filter') {
      _modeFilter = 'all';
      render(container);
      return;
    }

    if (action === 'cycle-mode') {
      const id      = el.dataset.itemId;
      const newMode = el.dataset.nextMode;
      const catalog = getCatalog();
      const item    = catalog[_supplier].find(i => i.id === id);
      if (!item) return;
      item.mode = newMode;
      updateCatalog(catalog);
      vibrate(10);
      showToast(`${MODE_META[newMode].icon} ${escHtml(item.name)} → ${MODE_META[newMode].label}`, 'info');
      render(container);
      return;
    }

    if (action === 'edit-item') {
      _editingId = el.dataset.itemId;
      render(container);
      return;
    }

    if (action === 'cancel-edit') {
      _editingId = null;
      render(container);
      return;
    }

    if (action === 'save-edit') {
      const id     = el.dataset.itemId;
      const safeId = escId(id);
      const name   = document.getElementById(`edit-name-${safeId}`)?.value.trim();
      const minQty = document.getElementById(`edit-minqty-${safeId}`)?.value.trim();
      if (!name) { showToast('Item name is required', 'warning'); return; }

      const catalog = getCatalog();
      const item    = catalog[_supplier].find(i => i.id === id);
      if (item) {
        item.name   = name;
        item.minQty = minQty || '';
        updateCatalog(catalog);
        vibrate(10);
        showToast('Item updated', 'success');
      }
      _editingId = null;
      render(container);
      return;
    }

    if (action === 'delete-item') {
      const id      = el.dataset.itemId;
      const catalog = getCatalog();
      const item    = catalog[_supplier].find(i => i.id === id);
      if (!item) return;
      showConfirm(`Remove "${item.name}" from catalog?`, () => {
        item.archived = true;
        updateCatalog(catalog);
        vibrate([10, 50, 10]);
        showToast('Item removed from catalog', 'info');
        render(container);
      });
      return;
    }

    if (action === 'add-item') {
      const nameEl = container.querySelector('#new-name');
      const minEl  = container.querySelector('#new-minqty');
      const name   = nameEl?.value.trim();
      const minQty = minEl?.value.trim();
      if (!name) { showToast('Enter an item name', 'warning'); return; }

      const catalog = getCatalog();
      catalog[_supplier].push({
        id: generateId(),
        name,
        minQty: minQty || '',
        mode: 'off',
        archived: false,
      });
      updateCatalog(catalog);
      vibrate(10);
      showToast(`"${name}" added to ${supplierLabel(_supplier)}`, 'success');
      if (nameEl) nameEl.value = '';
      if (minEl)  minEl.value  = '';
      render(container);
      return;
    }
  }, { signal });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escId(id) {
  return id.replace(/[^a-z0-9]/gi, '_');
}
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
