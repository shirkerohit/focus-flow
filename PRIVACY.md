# Privacy Policy — FocusFlow

**Last updated:** 2026-08-23
**Effective for version:** 1.1.0

FocusFlow is **local-first and private by design**. This policy explains what is stored, what is sent over the network, and what is not.

## Summary

- **No accounts, no cloud sync, no analytics, no tracking, no data sale.**
- **Default:** everything stays in `chrome.storage.local` on your device.
- **Only network requests you explicitly trigger:** (1) weather for a city you select, and (2) site-blocker does not send browsing history anywhere.

## Data Stored Locally (`chrome.storage.local`)

| Key | Contains | When created |
|-----|----------|--------------|
| `ff_settings` | sound, volume, mode, task, pomodoro config, blocked sites, daily goal, notifications toggle, theme | on first use / when you change settings |
| `ff_session` | currently running/paused focus/break session (or absent) | when you start a session |
| `ff_sessions` | history of completed focus sessions (date, duration, sound, task) — max 1000, oldest dropped | when a focus session ends |
| `ff_pomodoro` | pomodoro cycle count | when using pomodoro |
| `ff_blocked_bypass` | per-site temporary bypass `{host: expiresAt}` (e.g., 5-min allow) | when you click Allow/Disable on blocked page |
| `ff_weather_location` | city you **manually select** via search (name, country, lat, lon) | only after you search and pick a city |
| `ff_weather_cache` | last fetched weather for that location (temp, code, time) | after weather fetch |
| `ff_theme` | `light|dark|auto` | when you toggle theme in Home |

You can clear everything via **Reset stats** (clears `ff_sessions`/`ff_pomodoro`), **Import/Export**, or **Clear browsing data → Extensions** in Chrome, or by removing the extension.

**No browsing history, keystrokes, or audio is stored.** Sounds are local MP3s in `assets/audio/` or generated fallback; they do not stream from a server during focus.

## Network Requests

### 1. Weather (only if you use the widget)
- **When:** after you search for a city and select one. Background sync then fetches at most every 30 minutes via `chrome.alarms` (`ff-weather-sync`), plus a fetch on widget open if cache >30 min stale.
- **Where:** directly to `https://geocoding-api.open-meteo.com/v1/search?name=...` (geocoding) and `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=...` (forecast). No proxy, no API key, no FocusFlow server.
- **What is sent:** latitude/longitude of the city you selected (and city name during search). No extension ID, no user identifier.
- **Provider privacy:** https://open-meteo.com/en/terms • https://open-meteo.com/en/privacy
- **Opt-out:** don't select a location, or click **Change →** clear location (removes `ff_weather_location` and cancels background sync). No weather requests will be made.

### 2. Audio
- **Default:** all 5 ambient MP3s are bundled in `assets/audio/*.mp3` (3–6 MB each) and decoded locally via Web Audio. No streaming.
- **Fallback:** if a local file fails, a short 8 s procedural loop is synthesized locally — no network.

### 3. Site blocker
- Does **not** send your browsing history anywhere. It checks `chrome.tabs.onUpdated` URL host locally against `ff_settings.blockedSites` and your per-site bypass map. No remote blocklist.

### 4. No other requests
- No analytics scripts, no fonts CDN, no error reporting, no update ping beyond Chrome's own extension update check.

## Permissions Justification (for store review)

- `storage` — persist local settings/history.
- `alarms` — `ff-session-end`, `ff-badge-tick`, `ff-weather-sync`.
- `offscreen` — `AUDIO_PLAYBACK` to keep sound after popup closes (MV3).
- `notifications` — focus/break complete alerts (disable in settings).
- `tabs` + `host_permissions: <all_urls>` — observe any host you add to blocker and show `blocked.html` interstitial.

## Third-Party Services

- **Open-Meteo** (weather) — only if you use weather. Terms: https://open-meteo.com/en/terms — free for non-commercial, no key, open-source, self-hostable.
- **Audio sources** — see `assets/audio/ATTRIBUTION.md` for CC0/CC BY licences. No runtime fetch to those sites; files are bundled.

## Children's Privacy

FocusFlow does not knowingly collect data from children and does not require age.

## Changes

Material changes will be noted in `CHANGELOG` section of `README.md` and in store listing. Continued use after update implies acceptance.

## Contact

For questions, open an issue on your GitHub repo (add your repo URL here) or contact the publisher email you set in the Chrome Web Store dashboard.

---

**Data controller:** You — the user. All data lives on your device until you export it.
