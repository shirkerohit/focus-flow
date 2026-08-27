# FocusFlow

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](#installation)

**Deep work, without the noise.** Ambient soundscapes, Pomodoro cycles, site blocker, daily goals, weather, and a beautiful Focus Home — all local, private, and offline-first.

> **Store short description (132 chars):** Focus soundscapes, Pomodoro, site blocker & goals to stay in flow. Local-only, private, with Home dashboard & weather.

No accounts. No cloud sync. No analytics. No clutter.

<img width="218" height="302" alt="image" src="https://github.com/user-attachments/assets/22459340-bbd2-435e-977e-8c0cb872c930" />
<img width="220" height="298" alt="image" src="https://github.com/user-attachments/assets/d85ca881-c726-4008-bcff-dbae85ed076f" />
<img width="218" height="299" alt="image" src="https://github.com/user-attachments/assets/49a4fd6b-f7e1-486b-870c-217d4ce9f06e" />

<img width="640" height="400" alt="image" src="https://github.com/user-attachments/assets/4e1962ff-83ff-48bd-85ee-87c855ea6e56" />
<img width="640" height="400" alt="image" src="https://github.com/user-attachments/assets/a33cb18d-08f5-4949-8d2b-7932b2e46c25" />
<img width="640" height="400" alt="image" src="https://github.com/user-attachments/assets/7cea5de2-2f4a-41e8-ac96-968d43287d36" />




---

## Features

- **5 studio ambient sounds** — Rain, Cafe, Astral, Ocean, Forest — high-quality MP3 loops (3–6 MB, 2–4 min) from credible CC0/CC BY sources (see `assets/audio/ATTRIBUTION.md`), seamless looping with Web Audio, instant switching via buffer cache and 0.35 s crossfade.
- **Task Intention** — set *What are you focusing on?* before Start; shown in timer, badge title, and recent sessions for accountability.
- **Pomodoro Engine** — toggle Pomodoro, short/long breaks (5/15 m) and interval (every 4), auto-start breaks/focus. Breaks have own countdown, green badge, notifications and cycle indicator `Focus 2/4`.
- **Site Blocker (focus-only)** — default 8 hosts `youtube.com, twitter.com, x.com, instagram.com, reddit.com, tiktok.com, facebook.com, netflix.com` (`storage.js:5`). Per-site *Allow 5 min* or *Disable for this site this session* via `blocked.html` (bypass map, not single host). Only active during `focus` running.
- **Always On** — indefinite ambience, not counted in stats.
- **Notifications & Badge** — desktop notifications on focus/break complete (`notifications` perm), badge `25m`/`ON`/`BRK` via `chrome.action` + `BADGE_ALARM` every minute.
- **Daily Goal & Streaks** — configurable daily goal (15–480 m, default 120) with progress bar, overall streak and goal-streak (`utils.js:48`), avg/best/total.
- **Weather Widget** — small widget in popup & Home. User selects city (search via `geocoding-api.open-meteo.com`), shows `19°C Clear sky` + wind/humidity/feels, powered by **Open-Meteo** (`api.open-meteo.com`, no key, 10k/day free, open-source). Background sync at least every 30 min via `chrome.alarms` (`ff-weather-sync`), plus real-time check on open if cache >30 min stale. No tracking.
- **Focus Home** — full-page dashboard `home.html` with animated orbs, visualizer (20 bars), timer, sound grid, mode toggle, blocker manager, Today chart, preferences. Open via ✨ Home in popup or blocked page.
- **Theme** — `◐` toggle in Home header cycles `Auto → Light → Dark`, stored `ff_theme` and synced to popup via `storage.onChanged` (`theme.js`). Respects `prefers-color-scheme` when Auto.
- **Dashboard** — Today/Week totals, 7-day bar chart (bottom-aligned, not inverted), 5 recents with task, streak pills.
- **Tools** — Export/Import JSON (`settings+sessions+pomodoro+weather`), Reset stats, keyboard `Alt+Shift+P` pause/resume, `Alt+Shift+S` stop, `Space` in popup.
- **Persistence & Recovery** — every transition persisted to `chrome.storage.local` with promise queue; `endsAt` + `chrome.alarms` survives popup close and browser restart via `recover()`.

## Screenshots

> Replace placeholders before store submission.

- `home-light.png` — Home light theme, hero timer, weather, blocker
- `home-dark.png` — Home dark theme with orbs
- `popup.png` — Popup 380×600, sounds + timer + dashboard
- `blocked.png` — Blocked interstitial

## Installation

### From Chrome Web Store (once published)
1. Visit the store listing (link after publish)
2. Click **Add to Chrome** → **Add to Edge** works too (Chromium)

### Developer mode (local)
1. `chrome://extensions` (or `edge://extensions`) → enable **Developer mode**
2. **Load unpacked** → select this `focusflow` folder
3. Pin the extension, click its icon → popup. Click **✨ Home** for full page.

No build step. All assets are local except weather fetches to `api.open-meteo.com` and `geocoding-api.open-meteo.com`.

## Permissions — why each is needed (for store review)

| Permission | Used for | Justification |
|------------|----------|---------------|
| `storage` | `ff_settings`, `ff_session`, `ff_sessions`, `ff_pomodoro`, `ff_blocked_bypass` (map), `ff_weather_location/cache`, `ff_theme` | Persist user prefs and history locally. Nothing leaves browser except weather fetches. |
| `alarms` | `ff-session-end`, `ff-badge-tick` (1 min), `ff-weather-sync` (30 min) | Reliable countdown while service worker sleeps; badge updates; weather background sync at least every 30 min. |
| `offscreen` | `offscreen.html` with `AUDIO_PLAYBACK` | Play ambient loops after popup closes (MV3 requirement). |
| `notifications` | `chrome.notifications.create` | Focus/break complete alerts even when popup closed (user can disable). |
| `tabs` | `chrome.tabs.onUpdated` / `tabs.update` | Intercept navigation to blocked hosts during focus and show `blocked.html` interstitial. |
| `host_permissions: <all_urls>` | Site blocker + weather `fetch` | Blocker must observe any host the user adds; weather fetches to `api.open-meteo.com`/`geocoding-api.open-meteo.com`. No browsing data is collected. |

See `PRIVACY.md` for full policy. **No remote analytics, no tracking, no data sale.**

## Privacy

- **Local-only by default.** All focus history stays in `chrome.storage.local`. Weather location is stored only after you explicitly select a city; weather fetches go directly to Open-Meteo (no proxy, no key).
- Read `PRIVACY.md` for details. Open-Meteo privacy: https://open-meteo.com/en/terms

## Folder Structure

```
focusflow/
├── manifest.json          # MV3 (storage, alarms, offscreen, notifications, tabs, <all_urls>)
├── background.js          # Service worker: session FSM, alarms, badge, blocker, pomodoro, weather sync
├── offscreen.html/.js     # Owns AudioContext playback
├── audio.js               # Web Audio: cache, instant 0.35 s crossfade, improved fallback
├── theme.js               # Light/Dark/Auto toggle, synced via storage
├── weather.js             # Open-Meteo geocoding + forecast, 30-min cache, sync
├── blocked.html/.js       # Blocked interstitial (no inline script, CSP-safe)
├── home.html/.css/.js     # Full Focus Home (hero, weather, sounds, blocker, Today)
├── popup.html/.css/.js    # 380×600 popup (same stores)
├── storage.js             # Validated storage, map bypass, settings sanitize
├── stats.js               # Recording + summarize + insights
├── utils.js               # Clamp, format, date, host matching, streaks
├── assets/
│   ├── audio/             # rain.mp3 3.8 MB, cafe.mp3 1.1 MB, forest.mp3 5.0 MB, ocean.mp3 6.3 MB, astral.mp3 5.7 MB
│   │   └── ATTRIBUTION.md # CC0/CC BY credits + credible source notes
│   └── icons/             # 16/32/48/128
├── PRIVACY.md
├── STORE_LISTING.md       # Store copy/paste
└── LICENSE
```

## Architecture

Audio lives in **offscreen document** (`audio.js` + `offscreen.js`) so it survives popup close. Popup/Home are thin views sending intents (`FF_START_FOCUS`, `FF_PAUSE`, `FF_SET_SOUND`, `FF_ALLOW_ONCE`, …) to the service worker, single owner of state. Every mutation is enqueued (`queue` promise chain) and persisted immediately.

- `endsAt` absolute timestamp + `chrome.alarms` → countdown survives worker suspension.
- `recover()` on `onInstalled`/`onStartup` finalises expired or resumes running sessions.
- `bufferCache` in `audio.js` → instant sound switching (was 1.2 s, now 0.35 s).

## Storage Keys

| Key | Value |
|-----|-------|
| `ff_settings` | `{soundId, volume, mode, minutes, task, pomodoro*, blockedSites[], blockedEnabled, dailyGoalMinutes, notificationsEnabled}` |
| `ff_session` | running/paused `{kind: focus|always|break, soundId, status, task, cycleCount, breakType, endsAt, ...}` or absent |
| `ff_sessions` | `[{date, startTime, endTime, durationMs, durationMinutes, soundId, task}]` (≤1000) |
| `ff_pomodoro` | `{cycleCount}` |
| `ff_blocked_bypass` | map `{host: expiresAt}` for per-site 5-min / session bypass |
| `ff_weather_location` | `{name,country,latitude,longitude,timezone}` after user selects city |
| `ff_weather_cache` | `{lat,lon,fetchedAt, data:{temperature,label,emoji,wind,humidity,time,units}}` |
| `ff_theme` | `light|dark|auto` |

Validated on read; corrupted → defaults. Dashboard computed on fly.

## Weather

- **API:** `https://geocoding-api.open-meteo.com/v1/search` + `https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code...` — **no key**, open-source, `10k/day` free, self-hostable. Credible, not flagged unsafe (vs keyed alternatives).
- **Flow:** user types city → debounced search → picks result → `ff_weather_location` saved → background `ff-weather-sync` alarm every 30 min fetches and caches → widget shows `emoji temp label` + meta, `Change` clears location. If cache missing or >30 min stale on open, fetch immediately (real-time sync).

## Audio Attribution

See `assets/audio/ATTRIBUTION.md`. Summary:
- Rain `CC BY 4.0` Orange Free Sounds (Zoom H5)
- Cafe `CC0` Freesound `Ultra-Edward 823831` (no music, chatter+espresso)
- Forest/Ocean/Astral `CC BY-NC 4.0` Orange Free Sounds (stream+birds, sea waves, ambient pad) — replace for commercial store if needed; Rain+Cafe already commercial-friendly.

## Development

No build. Edit files, reload extension in `chrome://extensions`.

```bash
# optional: zip for store
powershell -Command "Compress-Archive -Path .\* -DestinationPath focusflow-v1.1.0.zip -Force"
```

## Changelog

### 1.1.0 — Publish ready
- High-quality real recordings (was 345 KB placeholder loops)
- Home full page with Site Blocker manager, theme toggle, weather
- Weather widget (Open-Meteo, 30-min sync)
- Dark/Light/Auto theme synced popup↔home
- Instant sound switching via buffer cache (was 1.2 s)
- Clean toggle switches, Import aligned, chart bottom-aligned fix
- Per-site bypass map (was single host), robust `blocked.html` (CSP external script, `about:blank` fallback)
- Attribution, privacy, store assets

### 1.0.0 — Initial

## License

MIT — see `LICENSE`. Audio files keep their original CC licences (see `ATTRIBUTION.md`).

## Credits

Built with Web Audio, `chrome.storage`, `chrome.alarms`, `chrome.offscreen`. Weather by Open-Meteo. Icons placeholder — replace for store if needed.
