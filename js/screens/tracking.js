// Tracking dashboard — two sections: Track streak alerts + Must Have missed alerts

import { getCatalogItems, getOrders } from '../data.js';
import { getItemInfo, supplierLabel, supplierColor,
         STREAK_WARN_AT, MUST_MISS_AT } from '../utils.js';

export function init() {}

export function render(container) {
  const streakAlerts = [];  // Track items ordered 2+ consecutive weeks
  const missedAlerts = [];  // Must Have items missed 2+ consecutive weeks

  // Check all suppliers (mode determines whether an item appears)
  ['cfs', 'fish', 'veggies'].forEach(supplier => {
    const items  = getCatalogItems(supplier);
    const orders = getOrders(supplier); // newest first

    items.forEach(item => {
      const mode = item.mode || 'off';
      if (mode === 'off') return; // Off items never appear on dashboard

      const info = getItemInfo(item.id, item.name, orders);

      if (mode === 'track' && info.streak >= STREAK_WARN_AT) {
        // Ordered last N consecutive orders — potential over-ordering
        const recentDates = orders
          .filter(o => o.items.some(i => i.itemId === item.id || i.name === item.name))
          .slice(0, 3)
          .map(o => _fmtDate(o.date));
        streakAlerts.push({ item, info, supplier, recentDates });
      }

      if (mode === 'mustHave' && info.weeksMissed >= MUST_MISS_AT) {
        // Not ordered in 2+ consecutive orders — critical alert
        missedAlerts.push({ item, info, supplier });
      }
    });
  });

  // Sort by most severe first
  streakAlerts.sort((a, b) => b.info.streak    - a.info.streak);
  missedAlerts.sort((a, b) => b.info.weeksMissed - a.info.weeksMissed);

  const allGood = streakAlerts.length === 0 && missedAlerts.length === 0;

  container.innerHTML = `

    ${allGood ? `
      <!-- All-clear state -->
      <div class="flex flex-col items-center justify-center px-8 pt-16 text-center">
        <p class="text-6xl mb-4">👍</p>
        <p class="text-xl font-bold">All good!</p>
        <p class="text-sm text-muted mt-2">
          No Track items on a streak and no Must Have items overdue.
        </p>
      </div>
    ` : ''}

    <!-- ── 🔔 Track — ordered 2+ weeks in a row ── -->
    <div class="px-4 pt-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">🔔</span>
        <div class="flex-1">
          <h2 class="font-bold text-base leading-tight">Track — consecutive orders</h2>
          <p class="text-xs text-muted">Ordered ${STREAK_WARN_AT}+ weeks in a row</p>
        </div>
        ${streakAlerts.length ? `<span class="badge badge-warn">${streakAlerts.length}</span>` : ''}
      </div>

      ${streakAlerts.length === 0 ? `
        <div class="card text-center text-muted py-5">
          <p class="text-sm">No Track items on a streak ✓</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${streakAlerts.map(({ item, info, supplier, recentDates }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                  </div>
                  <span class="badge badge-warn shrink-0">${info.streak} in a row</span>
                </div>
                ${recentDates.length ? `<p class="text-xs text-muted mt-1.5">Last ordered: ${recentDates.join(', ')}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- ── 📌 Must Have — missed ── -->
    <div class="px-4 pt-6 pb-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">📌</span>
        <div class="flex-1">
          <h2 class="font-bold text-base leading-tight">Must Have — missed</h2>
          <p class="text-xs text-muted">Not ordered ${MUST_MISS_AT}+ consecutive weeks</p>
        </div>
        ${missedAlerts.length ? `<span class="badge badge-danger">${missedAlerts.length}</span>` : ''}
      </div>

      ${missedAlerts.length === 0 ? `
        <div class="card text-center text-muted py-5">
          <p class="text-sm">All must-have items ordered on time ✓</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${missedAlerts.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card border-red-200 dark:border-red-900">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                  </div>
                  <span class="badge badge-danger shrink-0">−${info.weeksMissed}w</span>
                </div>
                ${item.minQty ? `<p class="text-xs text-muted mt-1.5">Min: ${escHtml(item.minQty)}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Link to stats -->
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

function _fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${String(y).slice(-2)}`;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
