// Catalog management screen — add/edit/remove items, set min qty, always-on toggle

import { getCatalog, updateCatalog } from '../data.js';
import { generateId, supplierLabel, vibrate, showToast, showConfirm } from '../utils.js';

let _supplier = 'cfs';
let _editingId = null; // id of item being edited inline

export function init() {}

export function render(container) {
  const catalog = getCatalog();
  const items   = (catalog[_supplier] || []).filter(i => !i.archived);

  container.innerHTML = `
    <!-- Quick link to Backup screen -->
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

    <!-- Item count -->
    <div class="px-4 pt-3 pb-1">
      <p class="text-xs text-muted">${items.length} items in catalog</p>
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
        <button data-action="add-item"
          class="w-full py-3 bg-brand text-white rounded-xl font-semibold text-sm">
          + Add item
        </button>
      </div>
    </div>
  `;

  _attachEvents(container);
}

function _itemRow(item) {
  const isEditing = _editingId === item.id;

  if (isEditing) {
    return `
      <div class="card ring-1 ring-brand space-y-2" data-item-id="${item.id}">
        <p class="text-xs font-semibold text-muted uppercase">Editing</p>
        <input id="edit-name-${item.id}" type="text" value="${escHtml(item.name)}"
          class="input-field" autocomplete="off" autocorrect="off" autocapitalize="words">
        <input id="edit-minqty-${item.id}" type="text" value="${escHtml(item.minQty || '')}"
          placeholder="Min qty" class="input-field"
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
        <!-- Always-on toggle -->
        <button
          data-action="toggle-always-on"
          data-item-id="${item.id}"
          class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl
            ${item.alwaysOn
              ? 'bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700'
              : 'bg-surface border border-border text-muted'}"
          title="${item.alwaysOn ? 'Always-on (tap to disable)' : 'Mark as always-on'}"
        >${item.alwaysOn ? '📌' : '☆'}</button>

        <!-- Name + min qty -->
        <div class="flex-1 min-w-0">
          <p class="font-medium text-sm leading-snug">${escHtml(item.name)}</p>
          ${item.minQty ? `<p class="text-xs text-muted">min: ${escHtml(item.minQty)}</p>` : ''}
        </div>

        <!-- Edit + Delete -->
        <div class="flex gap-1 shrink-0">
          <button data-action="edit-item" data-item-id="${item.id}"
            class="w-10 h-10 flex items-center justify-center rounded-xl bg-surface border border-border text-base">
            ✏️
          </button>
          <button data-action="delete-item" data-item-id="${item.id}"
            class="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-base">
            🗑
          </button>
        </div>
      </div>
    </div>
  `;
}

function _attachEvents(container) {
  // Supplier tabs
  container.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'go-backup') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'backup' } }));
      return;
    }

    if (action === 'switch-supplier') {
      _supplier = el.dataset.supplier;
      _editingId = null;
      render(container);
      return;
    }

    if (action === 'toggle-always-on') {
      const id = el.dataset.itemId;
      const catalog = getCatalog();
      const item = catalog[_supplier].find(i => i.id === id);
      if (item) {
        item.alwaysOn = !item.alwaysOn;
        updateCatalog(catalog);
        vibrate(10);
        showToast(item.alwaysOn ? '📌 Marked as always-on' : 'Always-on removed', 'info');
        render(container);
      }
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
      const id      = el.dataset.itemId;
      const name    = container.querySelector(`#edit-name-${id}`)?.value.trim();
      const minQty  = container.querySelector(`#edit-minqty-${id}`)?.value.trim();
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
      const id = el.dataset.itemId;
      const catalog = getCatalog();
      const item    = catalog[_supplier].find(i => i.id === id);
      if (!item) return;

      showConfirm(`Remove "${item.name}" from the catalog?`, () => {
        // Archive rather than hard-delete to preserve history links
        item.archived = true;
        updateCatalog(catalog);
        vibrate([10, 50, 10]);
        showToast('Item removed from catalog', 'info');
        render(container);
      });
      return;
    }

    if (action === 'add-item') {
      const name   = container.querySelector('#new-name')?.value.trim();
      const minQty = container.querySelector('#new-minqty')?.value.trim();
      if (!name) { showToast('Enter an item name', 'warning'); return; }

      const catalog = getCatalog();
      catalog[_supplier].push({
        id: generateId(),
        name,
        minQty: minQty || '',
        alwaysOn: false,
        archived: false,
      });
      updateCatalog(catalog);
      vibrate(10);
      showToast(`"${name}" added to ${supplierLabel(_supplier)}`, 'success');
      render(container);
      return;
    }
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
