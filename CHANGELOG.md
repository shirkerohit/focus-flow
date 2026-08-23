# Changelog

All notable changes to FocusFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-23

### Added
- High-quality real ambient recordings (3–6 MB each) for Rain, Cafe, Ocean, Forest, Astral from credible CC0/CC BY sources; `ATTRIBUTION.md` added; improved procedural fallback in `audio.js` with caching and instant 0.35 s crossfade
- Focus Home full page (`home.html`) with animated visualizer, hero timer, weather widget, sound grid, mode toggle, blocker manager, Today chart and preferences
- Weather widget (Open-Meteo, no key, 30-min background sync via `chrome.alarms` + real-time cache check) in popup and Home — user selects city, no auto-geolocation
- Dark / Light / Auto theme toggle in Home header (`theme.js`), synced to popup via `ff_theme` in storage
- Site Blocker per-site bypass map (was single host), robust `blocked.html`/`blocked.js` (CSP-safe external script, `about:blank` fallback)
- Buffer cache for instant sound switching (was 1.2 s fade)
- Clean toggle switches (36×20) with proper padding for all checkboxes
- Import aligned to button (was label), chart bottom-aligned fix, hero sheen `pointer-events:none`

### Changed
- `storage.js` now stores `ff_blocked_bypass` as map `{host: expiresAt}` and supports `getBlockedBypasses`/`saveBlockedBypass(host,exp)`
- `popup.css`/`home.css` Manual theme overrides via `[data-theme]` + toggle styles + weather styles
- `manifest.json` added `short_name`, `author`, `homepage_url`, `offline_enabled`, `incognito`

### Fixed
- Popup/home buttons (Start/Pause/Stop) blocked by hero overlay — added `pointer-events:none`
- Stats bar chart inversion (missing `justify-content:flex-end` in home)
- `blocked.html` inline script CSP violation — moved to `blocked.js`
- Audio placeholder 345 KB weird noise → real recordings

## [1.0.0] - 2026-08-15
- Initial release: 5 sounds (placeholder loops), Focus Sessions, Always On, Pomodoro, Dashboard, Site Blocker, Notifications & Badge, Daily Goal & Streaks, Export/Import, keyboard shortcuts
