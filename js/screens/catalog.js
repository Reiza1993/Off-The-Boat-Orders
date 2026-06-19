// Catalog management screen — add/edit/remove items, tracking mode, min qty
// Crash fix: AbortController ensures only one click listener exists at a time.

import { getCatalog, updateCatalog } from '../data.js';
import { generateId, supplierLabel, vibrate, showToast, showConfirm, TRACKING_MODES, TRACKING_META } from '../utils.js';

let _supplier  = 'cfs';
let _editingId = null;
let _controller = null; // AbortController — cancelled on every re-render to avoid stacked listeners

export function init() {}

export function render(container) {
  const catalog = getCatalog();
  const items   = (catalog[_supplier] || []).filter(i => !i.archived);

  container.innerHTML = `
    <!-- Quick link to Backup -->
    <div class="px-4 pt-4">
      <button data-action="go-backup"
        class="w-full py-3 bg-surface border border-border rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-muted">
        💾 Backup &amp; Restore
      </button>
    </div>

    <!-- Supplier tabs -->
    <div class="flex gap-2 px-4 pt-3 pb-0">
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

    <!-- Legend for tracking modes -->
    <div class="mx-4 mt-3 p-3 rounded-xl bg-surface border border-border space-y-1">
      <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Tracking modes</p>
      ${TRACKING_MODES.map(m => `
        <div class="flex items-center gap-2 text-xs">
          <span class="text-base w-5">${TRACKING_META[m].icon}</span>
          <span class="font-semibold">${TRACKING_META[m].label}</span>
          <span class="text-muted">— ${TRACKING_META[m].desc}</span>
        </div>
      `).join('')}
      <p class="text-xs text-muted pt-1">Tap the icon on any item to cycle through modes.</p>
    </div>

    <!-- Item count -->
    <div class="px-4 pt-3 pb-1">
      <p class="text-xs text-muted">${items.length} items in ${supplierLabel(_supplier)} catalog</p>
    </div>

    <!-- Item list -->
    <div id="catalog-list" class="px-4 space-y-2 pb-4">
      ${items.map(item => _itemRow(item)).join('')}

      <!-- Add new item form -->
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
    </div>
  `;

  _attachEvents(container);
}

// ── Item row ───────────────────────────────────────────────────────────────

function _itemRow(item) {
  const isEditing = _editingId === item.id;
  const mode = item.tracking || 'track';
  const meta = TRACKING_META[mode];

  if (isEditing) {
    return `
      <div class="card ring-1 ring-brand space-y-2" data-item-id="${item.id}">
        <p class="text-xs font-semibold text-muted uppercase tracking-wide">Editing item</p>
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

  // Tracking mode button cycles track → must → silent → track
  const nextMode = TRACKING_MODES[(TRACKING_MODES.indexOf(mode) + 1) % TRACKING_MODES.length];

  return `
    <div class="card" data-item-id="${item.id}">
      <div class="flex items-center gap-3">

        <!-- Tracking mode cycle button -->
        <button
          data-action="cycle-tracking"
          data-item-id="${item.id}"
          data-next-mode="${nextMode}"
          title="${meta.label}: ${meta.desc} — tap to change"
          class="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border text-center
            ${mode === 'track'  ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : ''}
            ${mode === 'must'   ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-700' : ''}
            ${mode === 'silent' ? 'bg-surface border-border' : ''}
          ">
          <span class="text-xl leading-none">${meta.icon}</span>
          <span class="text-[9px] font-bold mt-0.5
            ${mode === 'track'  ? 'text-blue-600 dark:text-blue-400' : ''}
            ${mode === 'must'   ? 'text-amber-700 dark:text-amber-400' : ''}
            ${mode === 'silent' ? 'text-muted' : ''}
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

// ── Events (AbortController prevents duplicate listeners) ──────────────────

function _attachEvents(container) {
  // Cancel the previous listener before adding a new one
  if (_controller) _controller.abort();
  _controller = new AbortController();
  const { signal } = _controller;

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

    if (action === 'cycle-tracking') {
      const id      = el.dataset.itemId;
      const newMode = el.dataset.nextMode;
      const catalog = getCatalog();
      const item    = catalog[_supplier].find(i => i.id === id);
      if (!item) return;
      item.tracking = newMode;
      updateCatalog(catalog);
      vibrate(10);
      showToast(`${TRACKING_META[newMode].icon} ${item.name} → ${TRACKING_META[newMode].label}`, 'info');
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
      const nameEl  = document.getElementById(`edit-name-${safeId}`);
      const minEl   = document.getElementById(`edit-minqty-${safeId}`);
      const name    = nameEl?.value.trim();
      const minQty  = minEl?.value.trim();
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
      const nameEl  = container.querySelector('#new-name');
      const minEl   = container.querySelector('#new-minqty');
      const name    = nameEl?.value.trim();
      const minQty  = minEl?.value.trim();
      if (!name) { showToast('Enter an item name', 'warning'); return; }

      const catalog = getCatalog();
      catalog[_supplier].push({
        id: generateId(),
        name,
        minQty: minQty || '',
        tracking: 'track',
        archived: false,
      });
      updateCatalog(catalog);
      vibrate(10);
      showToast(`"${name}" added to ${supplierLabel(_supplier)}`, 'success');
      // Clear the inputs before re-render
      if (nameEl)  nameEl.value  = '';
      if (minEl)   minEl.value   = '';
      render(container);
      return;
    }
  }, { signal });
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Make an item ID safe to use as a CSS id selector suffix
function escId(id) {
  return id.replace(/[^a-z0-9]/gi, '_');
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
