# Off The Boat Pizzeria — Order Manager

A mobile-first, single-user web app for managing weekly supply orders across three suppliers (CFS, Fish, Veggies). All data lives in `localStorage` — no backend, no login.

## Features

- **New Order** — select supplier, fill quantities, get streak/skip badges for CFS and Fish items
- **Output** — formatted order text, one-tap copy + mobile Share API
- **History** — filterable list of all past orders with tap-to-expand detail
- **Tracking** — consecutive-order watch list, skipped-item alerts, always-on items
- **Monthly Stats** — per-item totals with configurable date range
- **Backup / Restore** — JSON export/import, wipe option, backup-age reminder
- **Catalog** — add/edit/remove items, edit min qty, toggle "always-on" per item
- **PWA** — add to home screen from Chrome, works offline

---

## Running locally

You need a local HTTP server (ES modules don't load over `file://`).

**Option A — Python (built-in)**
```bash
cd Off-The-Boat-Orders
python3 -m http.server 8080
# open http://localhost:8080
```

**Option B — Node.js (npx)**
```bash
npx serve .
# follow the printed URL
```

**Option C — VS Code**
Install the *Live Server* extension, right-click `index.html` → Open with Live Server.

---

## Deploying to GitHub Pages

1. Push to a repo on GitHub (main branch or any branch).
2. Go to **Settings → Pages**.
3. Set *Source* to **Deploy from a branch**, choose your branch, folder `/` (root).
4. Click **Save**. GitHub Pages publishes the site at:
   `https://<username>.github.io/<repo-name>/`

That's it — no build step required.

---

## Backing up your data

All data is in the browser's `localStorage`. To transfer to another device:

1. Open the app → **Settings (⚙️)** tab → **Backup & Restore**.
2. Tap **Export all data** — saves `otb_backup_YYYY-MM-DD.json` to Downloads.
3. On the new device, open the app → same screen → **Choose backup file** → **Replace**.

The app shows a reminder banner if you haven't exported in 30+ days.

---

## Data model

Everything is stored under the key `otb_orders_v1` in `localStorage`:

```json
{
  "version": 1,
  "catalog": {
    "cfs":    [{ "id": "cfs-1", "name": "...", "minQty": "3", "alwaysOn": false, "archived": false }],
    "fish":   [...],
    "veggies":[...]
  },
  "orders": [
    {
      "id": "uuid",
      "supplier": "cfs",
      "date": "2026-06-19",
      "items": [{ "itemId": "cfs-1", "name": "Manildra flour", "quantity": "9" }],
      "createdAt": "2026-06-19T10:00:00.000Z"
    }
  ],
  "meta": { "lastExportAt": "2026-06-01T08:00:00.000Z" }
}
```

---

## Project structure

```
index.html                 — App shell, all screens, bottom nav, confirm dialog
manifest.json              — PWA manifest
sw.js                      — Service worker (cache-first offline support)
icons/icon.svg             — App icon
js/
  app.js                   — Router, navigation, SW registration
  data.js                  — localStorage read/write helpers
  utils.js                 — Dates, badges, toast, confirm, clipboard
  catalog-defaults.js      — Default CFS / Fish / Veggies item lists
  screens/
    new-order.js           — New order form with supplier tabs + badges
    output.js              — Formatted output + copy/share
    history.js             — Order list with filter and expand/delete
    tracking.js            — Streak watch list + skipped items dashboard
    stats.js               — Monthly stats table with date range selector
    backup.js              — Export/import/wipe
    catalog.js             — Catalog CRUD + always-on toggles
```

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| JS | Vanilla ES modules | Zero build step, fast load |
| CSS | Tailwind CSS (CDN) + custom props | Mobile-friendly utilities + dark mode |
| Data | `localStorage` | Offline, single-device, instant |
| PWA | `manifest.json` + Service Worker | Add to home screen, offline access |
| Deploy | GitHub Pages | Free, static, no CI needed |
