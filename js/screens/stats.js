// Monthly Stats screen — per-item totals grouped by supplier

import { getOrders, getCatalogItems } from '../data.js';
import { todayISO, supplierLabel, supplierColor, supplierEmoji, parseQty } from '../utils.js';

// Default: last 4 weeks from today
function _defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 28);
  return d.toISOString().split('T')[0];
}

let _state = { dateFrom: _defaultFrom(), dateTo: todayISO() };

export function init() {}

export function render(container) {
  container.innerHTML = `
    <!-- Date range -->
    <div class="px-4 pt-4 space-y-2">
      <p class="text-xs text-muted font-semibold uppercase tracking-wide">Date range</p>
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="text-xs text-muted">From</label>
          <input type="date" id="stats-from" class="input-field text-sm" value="${_state.dateFrom}">
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted">To</label>
          <input type="date" id="stats-to" class="input-field text-sm" value="${_state.dateTo}">
        </div>
      </div>
      <div class="flex gap-2">
        <button data-range="28"  class="range-btn flex-1 py-2 text-xs rounded-xl border border-border bg-surface text-muted font-medium">Last 4w</button>
        <button data-range="56"  class="range-btn flex-1 py-2 text-xs rounded-xl border border-border bg-surface text-muted font-medium">Last 8w</button>
        <button data-range="84"  class="range-btn flex-1 py-2 text-xs rounded-xl border border-border bg-surface text-muted font-medium">Last 12w</button>
        <button data-range="365" class="range-btn flex-1 py-2 text-xs rounded-xl border border-border bg-surface text-muted font-medium">All year</button>
      </div>
    </div>

    <!-- Stats per supplier -->
    <div id="stats-body" class="px-4 pt-4 pb-6 space-y-6">
      ${_buildStats()}
    </div>
  `;

  _attachEvents(container);
}

function _buildStats() {
  const sections = [];

  ['cfs', 'fish', 'veggies'].forEach(supplier => {
    const orders = getOrders(supplier).filter(o =>
      o.date >= _state.dateFrom && o.date <= _state.dateTo
    );
    const catalogItems = getCatalogItems(supplier);
    const color = supplierColor(supplier);

    if (orders.length === 0 && catalogItems.length === 0) return;

    // Gather all item names that appear in orders OR are in catalog
    const itemMap = new Map(); // name → { name, itemId, weeksOrdered, totalQty, qtys: [] }

    catalogItems.forEach(item => {
      itemMap.set(item.name, { name: item.name, itemId: item.id, weeksOrdered: 0, totalQty: 0, occurrences: 0, qtys: [] });
    });

    orders.forEach(order => {
      order.items.forEach(i => {
        if (!itemMap.has(i.name)) {
          itemMap.set(i.name, { name: i.name, itemId: i.itemId || null, weeksOrdered: 0, totalQty: 0, occurrences: 0, qtys: [] });
        }
        const entry = itemMap.get(i.name);
        if (i.quantity && i.quantity.trim()) {
          entry.weeksOrdered++;
          entry.occurrences++;
          entry.qtys.push(i.quantity.trim());
          const n = parseQty(i.quantity);
          if (!isNaN(n)) entry.totalQty += n;
        }
      });
    });

    // Sort: ordered items first, then alphabetical
    const sorted = [...itemMap.values()].sort((a, b) => {
      if (b.weeksOrdered !== a.weeksOrdered) return b.weeksOrdered - a.weeksOrdered;
      return a.name.localeCompare(b.name);
    });

    if (sorted.every(s => s.weeksOrdered === 0)) {
      sections.push(`
        <div>
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xl">${supplierEmoji(supplier)}</span>
            <h2 class="font-bold">${supplierLabel(supplier)}</h2>
          </div>
          <div class="card text-center text-muted py-4 text-sm">No orders in this period</div>
        </div>
      `);
      return;
    }

    sections.push(`
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xl">${supplierEmoji(supplier)}</span>
          <h2 class="font-bold">${supplierLabel(supplier)}</h2>
          <span class="text-xs text-muted ml-auto">${orders.length} order${orders.length!==1?'s':''}</span>
        </div>
        <div class="card overflow-hidden p-0">
          <!-- Table header -->
          <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 ${color.bg} text-xs font-semibold ${color.text} border-b border-border">
            <span>Item</span>
            <span class="text-right">Weeks ordered</span>
            <span class="text-right">Total / Count</span>
          </div>
          <!-- Rows (only ordered items) -->
          ${sorted.filter(s => s.weeksOrdered > 0).map((s, idx) => {
            const totalDisplay = s.totalQty > 0
              ? s.totalQty % 1 === 0 ? String(s.totalQty) : s.totalQty.toFixed(1)
              : `${s.occurrences}×`;
            return `
              <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2.5 text-sm ${idx % 2 === 1 ? 'bg-surface/50' : ''} border-b border-border last:border-0">
                <span class="leading-snug">${escHtml(s.name)}</span>
                <span class="text-right font-semibold">${s.weeksOrdered}</span>
                <span class="text-right text-muted">${totalDisplay}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Items NOT ordered in period -->
        ${sorted.filter(s => s.weeksOrdered === 0).length > 0 ? `
          <details class="mt-2">
            <summary class="text-xs text-muted cursor-pointer px-1">
              ${sorted.filter(s => s.weeksOrdered === 0).length} items not ordered in this period ▼
            </summary>
            <div class="mt-1 card p-2">
              ${sorted.filter(s => s.weeksOrdered === 0).map(s => `
                <div class="py-1 text-sm text-muted">${escHtml(s.name)}</div>
              `).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `);
  });

  return sections.join('') || `<div class="text-center text-muted py-16">
    <p class="text-5xl mb-3">📊</p>
    <p>No data in selected range</p>
  </div>`;
}

function _attachEvents(container) {
  container.querySelector('#stats-from')?.addEventListener('change', e => {
    _state.dateFrom = e.target.value;
    container.querySelector('#stats-body').innerHTML = _buildStats();
  });
  container.querySelector('#stats-to')?.addEventListener('change', e => {
    _state.dateTo = e.target.value;
    container.querySelector('#stats-body').innerHTML = _buildStats();
  });

  container.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.range);
      const d = new Date();
      _state.dateTo   = todayISO();
      d.setDate(d.getDate() - days);
      _state.dateFrom = d.toISOString().split('T')[0];
      render(container);
    });
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
