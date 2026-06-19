// Backup / Restore screen — export JSON, import JSON

import { exportJSON, importJSON, getMeta } from '../data.js';
import { vibrate, showToast, showConfirm } from '../utils.js';

export function init() {}

export function render(container) {
  const meta = getMeta();
  const daysSinceExport = _daysSinceExport(meta.lastExportAt);

  container.innerHTML = `
    <!-- Export reminder banner -->
    ${daysSinceExport > 30 ? `
      <div class="mx-4 mt-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
        <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">⚠️ Backup reminder</p>
        <p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
          ${meta.lastExportAt
            ? `Last backup was ${daysSinceExport} days ago`
            : 'You haven\'t backed up your data yet'}.
          Export a backup to avoid losing your order history.
        </p>
      </div>
    ` : meta.lastExportAt ? `
      <div class="mx-4 mt-4 p-3 rounded-2xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
        <p class="text-sm text-green-800 dark:text-green-200">
          ✅ Last backup: ${_formatLastExport(meta.lastExportAt)}
        </p>
      </div>
    ` : `
      <div class="mx-4 mt-4 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <p class="text-sm text-blue-800 dark:text-blue-200">💡 No backup yet. Export your data below.</p>
      </div>
    `}

    <!-- Export section -->
    <div class="mx-4 mt-4">
      <div class="card space-y-3">
        <h2 class="font-bold">Export data</h2>
        <p class="text-sm text-muted">Downloads a JSON file with all your orders, catalog, and settings. Save this somewhere safe.</p>
        <button data-action="export"
          class="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-md active:opacity-80 flex items-center justify-center gap-2">
          💾 Export all data
        </button>
      </div>
    </div>

    <!-- Import section -->
    <div class="mx-4 mt-4">
      <div class="card space-y-3">
        <h2 class="font-bold">Import data</h2>
        <p class="text-sm text-muted">Upload a previously exported JSON backup file.</p>

        <!-- Import mode -->
        <div class="space-y-2">
          <label class="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer">
            <input type="radio" name="import-mode" value="replace" checked class="w-4 h-4">
            <div>
              <p class="text-sm font-medium">Replace</p>
              <p class="text-xs text-muted">Overwrite all current data with the backup</p>
            </div>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer">
            <input type="radio" name="import-mode" value="merge" class="w-4 h-4">
            <div>
              <p class="text-sm font-medium">Merge</p>
              <p class="text-xs text-muted">Add orders from the backup that don't already exist</p>
            </div>
          </label>
        </div>

        <button data-action="import"
          class="w-full py-4 bg-surface border border-border rounded-2xl font-semibold text-base active:opacity-80 flex items-center justify-center gap-2 text-text">
          📂 Choose backup file
        </button>

        <!-- Hidden file input -->
        <input type="file" id="import-file" accept=".json,application/json" class="hidden">
      </div>
    </div>

    <!-- Danger zone: wipe data -->
    <div class="mx-4 mt-6 mb-6">
      <div class="card border border-red-200 dark:border-red-800 space-y-3">
        <h2 class="font-bold text-red-600 dark:text-red-400">Danger zone</h2>
        <p class="text-sm text-muted">Permanently delete all orders and reset the catalog to defaults. Cannot be undone.</p>
        <button data-action="wipe"
          class="w-full py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 rounded-2xl font-semibold text-sm active:opacity-80">
          🗑 Wipe all data
        </button>
      </div>
    </div>
  `;

  _attachEvents(container);
}

function _attachEvents(container) {
  container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    try {
      const json = exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href     = url;
      a.download = `otb_backup_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      vibrate(10);
      showToast('Backup downloaded!', 'success');
      render(container); // refresh banner
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  container.querySelector('[data-action="import"]')?.addEventListener('click', () => {
    container.querySelector('#import-file').click();
  });

  container.querySelector('#import-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mode = container.querySelector('input[name="import-mode"]:checked')?.value || 'replace';
    const modeLabel = mode === 'replace' ? 'REPLACE all current data' : 'MERGE with current data';

    const reader = new FileReader();
    reader.onload = () => {
      showConfirm(
        `Import this backup? This will ${modeLabel}.`,
        () => {
          try {
            importJSON(reader.result, mode);
            vibrate(15);
            showToast('Data imported successfully!', 'success');
            render(container);
          } catch (err) {
            showToast('Import failed: ' + err.message, 'error');
          }
        }
      );
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be picked again
  });

  container.querySelector('[data-action="wipe"]')?.addEventListener('click', () => {
    showConfirm(
      'Wipe ALL data? This permanently deletes all orders and resets the catalog. Export first!',
      () => {
        localStorage.removeItem('otb_orders_v1');
        vibrate([30, 100, 30]);
        showToast('All data wiped. App reset to defaults.', 'info');
        render(container);
      }
    );
  });
}

function _daysSinceExport(isoTimestamp) {
  if (!isoTimestamp) return Infinity;
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  return Math.floor(ms / 86400000);
}

function _formatLastExport(isoTimestamp) {
  const d = new Date(isoTimestamp);
  const days = _daysSinceExport(isoTimestamp);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
