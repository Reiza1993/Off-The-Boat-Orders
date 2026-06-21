// App entry point — routing, navigation, service worker registration

import * as NewOrder from './screens/new-order.js';
import * as Output   from './screens/output.js';
import * as History  from './screens/history.js';
import * as Tracking from './screens/tracking.js';
import * as Stats    from './screens/stats.js';
import * as Backup   from './screens/backup.js';
import * as Catalog  from './screens/catalog.js';
import { initData } from './data.js';
import { todayISO }  from './utils.js';

// Screen registry — maps screen name → { module, container, navId }
const SCREENS = {
  'new-order': { module: NewOrder, navId: 'nav-new-order' },
  'output':    { module: Output,   navId: null },
  'history':   { module: History,  navId: 'nav-history' },
  'tracking':  { module: Tracking, navId: 'nav-tracking' },
  'stats':     { module: Stats,    navId: 'nav-stats' },
  'backup':    { module: Backup,   navId: 'nav-backup' },
  'catalog':   { module: Catalog,  navId: 'nav-catalog' },
};

let _current = 'new-order';

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Update date in header
  _updateHeaderDate();

  // Register service worker for PWA/offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }

  // Load data from IndexedDB (migrates from localStorage on first run)
  await initData();

  // Listen for programmatic navigation events (from screen modules)
  window.addEventListener('navigate', e => {
    const { screen, ...params } = e.detail;
    navigateTo(screen, params);
  });

  // Wire up bottom nav
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  // Start on new-order
  navigateTo('new-order');
});

// ── Navigation ─────────────────────────────────────────────────────────────

export function navigateTo(screenName, params = {}) {
  const def = SCREENS[screenName];
  if (!def) { console.warn('Unknown screen:', screenName); return; }

  // Hide all screens
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

  // Show target screen
  const container = document.getElementById(`screen-${screenName}`);
  if (!container) return;
  container.classList.add('active');

  // Update header title
  const titles = {
    'new-order': 'New Order',
    'output':    'Order Ready',
    'history':   'History',
    'tracking':  'Tracking',
    'stats':     'Monthly Stats',
    'backup':    'Backup & Restore',
    'catalog':   'Catalog',
  };
  document.getElementById('screen-title').textContent = titles[screenName] || 'OTB Orders';

  // Update nav highlight (output has no nav item)
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('nav-active', btn.dataset.nav === screenName);
  });

  // Init + render the screen
  if (def.module.init) def.module.init(params);
  def.module.render(container, params);

  _current = screenName;

  // Scroll to top
  container.scrollTop = 0;
  window.scrollTo(0, 0);
}

function _updateHeaderDate() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const d = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}
