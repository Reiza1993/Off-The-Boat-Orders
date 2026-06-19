// Tracking dashboard — streak watch list, must-have alerts, always-on items

import { getCatalogItems, getOrders } from '../data.js';
import { getItemInfo, supplierLabel, supplierColor, formatDate,
         TRACKING_META, STREAK_WARN_AT, SKIP_WARN_TRACK, SKIP_WARN_MUST } from '../utils.js';

export function init() {}

export function render(container) {
  // Collect data for CFS + Fish (veggies excluded by spec)
  const watchList   = []; // streak ≥ 2, mode = 'track'
  const skipList    = []; // not ordered ≥ 3 weeks, mode = 'track'
  const mustMissed  = []; // not ordered ≥ 5 weeks, mode = 'must'
  const alwaysOn    = []; // mode = 'silent'
  const mustItems   = []; // mode = 'must' (all, for reference)

  ['cfs', 'fish'].forEach(supplier => {
    const items  = getCatalogItems(supplier);
    const orders = getOrders(supplier); // newest first

    items.forEach(item => {
      const mode = item.tracking || 'track';
      const info = getItemInfo(item.id, item.name, orders);

      if (mode === 'silent') {
        alwaysOn.push({ item, info, supplier });

      } else if (mode === 'must') {
        mustItems.push({ item, info, supplier });
        if (info.weeksMissed >= SKIP_WARN_MUST) {
          mustMissed.push({ item, info, supplier });
        }

      } else {
        // 'track' (default)
        if (info.streak >= STREAK_WARN_AT) {
          watchList.push({ item, info, orders, supplier });
        }
        if (info.weeksMissed >= SKIP_WARN_TRACK) {
          skipList.push({ item, info, supplier });
        }
      }
    });
  });

  container.innerHTML = `

    <!-- ── Streak watch list ── -->
    <div class="px-4 pt-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">⚠️</span>
        <div>
          <h2 class="font-bold text-base leading-tight">Consecutive-order watch list</h2>
          <p class="text-xs text-muted">🔔 Track items ordered ${STREAK_WARN_AT}+ weeks in a row</p>
        </div>
        ${watchList.length ? `<span class="ml-auto badge badge-warn">${watchList.length}</span>` : ''}
      </div>

      ${watchList.length === 0 ? `
        <div class="card text-center text-muted py-6">
          <p class="text-3xl mb-2">✅</p>
          <p class="text-sm">No items on streak watch</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${watchList.map(({ item, info, orders, supplier }) => {
            const color = supplierColor(supplier);
            const recentDates = orders
              .filter(o => o.items.some(i => i.itemId === item.id || i.name === item.name))
              .slice(0, 3)
              .map(o => formatDate(o.date));
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                  </div>
                  <span class="badge badge-warn shrink-0">${info.streak}w ⚠</span>
                </div>
                ${recentDates.length ? `<p class="text-xs text-muted mt-1">Last ordered: ${recentDates.join(', ')}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- ── Skip alerts (Track mode) ── -->
    <div class="px-4 pt-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">📉</span>
        <div>
          <h2 class="font-bold text-base leading-tight">Not ordered recently</h2>
          <p class="text-xs text-muted">🔔 Track items absent ${SKIP_WARN_TRACK}+ weeks</p>
        </div>
        ${skipList.length ? `<span class="ml-auto badge badge-miss">${skipList.length}</span>` : ''}
      </div>

      ${skipList.length === 0 ? `
        <div class="card text-center text-muted py-6">
          <p class="text-3xl mb-2">✅</p>
          <p class="text-sm">No tracked items overdue</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${skipList.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
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

    <!-- ── Must Have — missed alerts ── -->
    <div class="px-4 pt-6">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">📌</span>
        <div>
          <h2 class="font-bold text-base leading-tight">Must Have — missed</h2>
          <p class="text-xs text-muted">📌 Must Have items absent ${SKIP_WARN_MUST}+ weeks</p>
        </div>
        ${mustMissed.length ? `<span class="ml-auto badge badge-warn">${mustMissed.length}</span>` : ''}
      </div>

      ${mustMissed.length === 0 ? `
        <div class="card text-center text-muted py-6">
          <p class="text-3xl mb-2">✅</p>
          <p class="text-sm">All must-have items ordered on time</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${mustMissed.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full mr-1">${supplierLabel(supplier)}</span>
                    <span class="font-medium text-sm">${escHtml(item.name)}</span>
                    <span class="badge badge-pin ml-1">📌</span>
                  </div>
                  <span class="badge badge-warn shrink-0">−${info.weeksMissed}w ⚠</span>
                </div>
                ${item.minQty ? `<p class="text-xs text-muted mt-1">Min: ${escHtml(item.minQty)}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- ── Always On (silent) items ── -->
    ${alwaysOn.length ? `
      <div class="px-4 pt-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl">🔇</span>
          <div>
            <h2 class="font-bold text-base leading-tight">Always On</h2>
            <p class="text-xs text-muted">Ordered every week — no warnings</p>
          </div>
        </div>
        <div class="space-y-2">
          ${alwaysOn.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full">${supplierLabel(supplier)}</span>
                  <span class="font-medium text-sm flex-1">${escHtml(item.name)}</span>
                  ${info.streak > 0 ? `<span class="badge badge-ok">${info.streak}w streak</span>` : '<span class="text-xs text-muted">No recent orders</span>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- ── Must Have — full list ── -->
    ${mustItems.length ? `
      <div class="px-4 pt-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl">📌</span>
          <div>
            <h2 class="font-bold text-base leading-tight">Must Have — all items</h2>
            <p class="text-xs text-muted">Alerting if absent ${SKIP_WARN_MUST}+ weeks</p>
          </div>
        </div>
        <div class="space-y-2">
          ${mustItems.map(({ item, info, supplier }) => {
            const color = supplierColor(supplier);
            return `
              <div class="card">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold ${color.text} ${color.bg} px-2 py-0.5 rounded-full">${supplierLabel(supplier)}</span>
                  <span class="font-medium text-sm flex-1">${escHtml(item.name)}</span>
                  ${info.streak > 0 ? `<span class="badge badge-ok">${info.streak}w streak</span>` : ''}
                  ${info.weeksMissed >= SKIP_WARN_MUST ? `<span class="badge badge-warn">−${info.weeksMissed}w</span>` : (info.weeksMissed > 0 ? `<span class="badge badge-miss">−${info.weeksMissed}w</span>` : '')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Link to stats -->
    <div class="px-4 pt-6 pb-6">
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
