// Tracking dashboard — streak watch list, skipped items, always-on items

import { getCatalogItems, getOrders } from '../data.js';
import { getItemInfo, supplierLabel, supplierColor, supplierEmoji, formatDate } from '../utils.js';

export function init() {}

export function render(container) {
  const sections = [];

  // Build data for CFS + Fish (veggies excluded)
  ['cfs', 'fish'].forEach(supplier => {
    const items  = getCatalogItems(supplier);
    const orders = getOrders(supplier); // sorted newest first

    const watch    = []; // streak >= 2, not alwaysOn
    const skipped  = []; // weeksMissed >= 3, ever ordered
    const alwaysOn = []; // alwaysOn items with any streak data

    items.forEach(item => {
      const info = getItemInfo(item.id, item.name, orders);

      if (item.alwaysOn) {
        alwaysOn.push({ item, info, orders, supplier });
        // Skipped warning still applies to always-on
        if (info.weeksMissed >= 3) skipped.push({ item, info, supplier });
      } else {
        if (info.streak >= 2) watch.push({ item, info, orders, supplier });
        if (info.weeksMissed >= 3) skipped.push({ item, info, supplier });
      }
    });

    sections.push({ supplier, watch, skipped, alwaysOn });
  });

  const allWatch   = sections.flatMap(s => s.watch);
  const allSkipped = sections.flatMap(s => s.skipped);
  const allAlways  = sections.flatMap(s => s.alwaysOn);

  container.innerHTML = `
    <!-- Watch list -->
    <div class="px-4 pt-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">⚠️</span>
        <h2 class="font-bold text-base">Consecutive-order watch list</h2>
        ${allWatch.length ? `<span class="ml-auto badge badge-warn">${allWatch.length}</span>` : ''}
      </div>

      ${allWatch.length === 0 ? `
        <div class="card text-center text-muted py-6">
          <p class="text-3xl mb-2">✅</p>
          <p class="text-sm">No items ordered unusually often</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${allWatch.map(({ item, info, orders, supplier }) => {
            const color = supplierColor(supplier);
            const recentDates = orders
              .filter(o => o.items.some(i => i.itemId === item.id || i.name === item.name))
              .slice(0, 3)
              .map(o => formatDate(o.date));
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold uppercase ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                  </div>
                  <span class="badge badge-warn shrink-0">${info.streak}w ⚠</span>
                </div>
                ${recentDates.length ? `
                  <p class="text-xs text-muted mt-1">Last ordered: ${recentDates.join(', ')}</p>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Skipped items -->
    <div class="px-4 pt-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">📉</span>
        <h2 class="font-bold text-base">Not ordered recently</h2>
        ${allSkipped.length ? `<span class="ml-auto badge badge-miss">${allSkipped.length}</span>` : ''}
      </div>

      ${allSkipped.length === 0 ? `
        <div class="card text-center text-muted py-6">
          <p class="text-3xl mb-2">✅</p>
          <p class="text-sm">No items missed for 3+ weeks</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${allSkipped.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            const pinBadge = item.alwaysOn ? ' <span class="badge badge-pin">📌 Always-on</span>' : '';
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold uppercase ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>${pinBadge}
                  </div>
                  <span class="badge badge-miss shrink-0">−${info.weeksMissed}w</span>
                </div>
                ${item.minQty ? `<p class="text-xs text-muted mt-1">Min: ${escHtml(item.minQty)}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Always-on items -->
    ${allAlways.length ? `
      <div class="px-4 pt-6 pb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl">📌</span>
          <h2 class="font-bold text-base">Always-on items</h2>
          <span class="text-xs text-muted ml-auto">Streak warnings suppressed</span>
        </div>
        <div class="space-y-2">
          ${allAlways.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold uppercase ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                  </div>
                  ${info.streak > 0 ? `<span class="badge badge-ok">${info.streak}w streak</span>` : '<span class="text-xs text-muted">No recent orders</span>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '<div class="pb-4"></div>'}

    <!-- Navigate to stats -->
    <div class="px-4 pb-6">
      <button data-action="go-stats"
        class="w-full py-3 bg-surface border border-border rounded-xl text-sm font-semibold text-muted flex items-center justify-center gap-2">
        📊 View Monthly Stats
      </button>
    </div>
  `;

  container.querySelector('[data-action="go-stats"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'stats' } }));
  });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
