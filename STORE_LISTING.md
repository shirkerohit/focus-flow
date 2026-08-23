# Chrome Web Store — Copy/Paste

## Name (max 75)
FocusFlow — Focus Sounds, Pomodoro & Site Blocker

## Short description (132 chars max, shown in search)
Ambient soundscapes, Pomodoro cycles, site blocker and goals to help you stay in flow. Local-only, private.

## Detailed description (store, with formatting allowed — plain text + limited HTML)

Stay in flow with FocusFlow — the private, offline-first focus companion.

**No accounts. No cloud. No tracking.** Everything runs locally in your browser.

**5 studio ambient sounds** — Rain, Cafe, Astral, Ocean, Forest. High-quality loops (3–6 MB) with instant 0.35 s crossfade and buffer cache. (See attribution for CC licences.)

**Focus Sessions with intention** — pick 15/30/45/60 or custom 1–480 min, set “What are you focusing on?” and stay accountable. Timer survives popup close and browser restart.

**Pomodoro Engine** — toggle Pomodoro, short/long breaks and interval, auto-start breaks/focus, cycle counter and green break badge.

**Site Blocker (focus-only)** — block youtube.com, twitter.com, reddit.com… or any domain you add. Per-site 5-min Allow or Disable for this site this session. Only active during focus.

**Daily Goal & Streaks** — set a daily goal, see progress, overall streak and goal streak, avg/best/total.

**Weather Widget** — optional small widget. Search a city → shows temp, condition, wind, humidity from Open-Meteo (no key, open-source). Syncs at least every 30 min in background, plus real-time on open if cache stale. You control the location; no auto-geolocation.

**Focus Home** — full-page dashboard with animated visualizer, timer, weather, sounds, blocker manager, 7-day chart. Open via ✨ Home.

**Theme** — Light / Dark / Auto toggle in Home, synced to popup.

**Privacy:** Local-only by default. History stays in chrome.storage.local. Weather only fetches after you pick a city (direct to api.open-meteo.com, no proxy). No analytics. See PRIVACY.md.

**Permissions explained:** storage (local prefs), alarms (countdown/badge/weather), offscreen (audio after popup closes), notifications (focus/break done), tabs + <all_urls> (block any host you add). No browsing data leaves the browser.

**Open source:** MIT. Audio licences in assets/audio/ATTRIBUTION.md.

---

## Category
Productivity

## Language
English

## Screenshots (1280x800 or 640x400, 1–5)
1. home-light.png — Home light, hero + weather + sounds
2. home-dark.png — Home dark with orbs and streak
3. popup.png — Popup 380×600, timer + dashboard
4. blocked.png — Blocked interstitial with Allow 5 min
5. weather.png — Weather search → London 19°C

## Icon
Use assets/icons/icon128.png (already 128). Also provide 16/32/48 for manifest.

## Support URL
https://github.com/<your-org>/focusflow/issues  (replace)

## Homepage URL
https://github.com/<your-org>/focusflow  (replace)

## Privacy policy URL
Link to PRIVACY.md raw GitHub URL or hosted page: https://github.com/<your-org>/focusflow/blob/main/PRIVACY.md

## Pricing
Free

## Additional fields for review
- **Single purpose:** Help users stay focused with ambient sounds, timed sessions, site blocking, and local progress tracking.
- **Host permission justification:** `<all_urls>` needed because blocker must observe any host the user adds; weather needs api.open-meteo.com/geocoding-api.open-meteo.com. No browsing data collected.
- **Remote code:** No. All code is bundled, no eval, no remote fetch of executable code. Weather and audio are data only.

## Store assets checklist before submit
- [ ] Replace placeholder screenshots with real 1280x800 captures (light/dark)
- [ ] Test on fresh profile: load unpacked → start focus → block youtube → allow → weather London → export/import
- [ ] Zip: see build step below
- [ ] Fill privacy policy URL, support URL, author email in dashboard

## Build zip
powershell: Compress-Archive -Path .\* -DestinationPath focusflow-v1.1.0.zip -Force
# Exclude: .git, *.zip, *.pem, node_modules (already in .gitignore)
# Or: use Chrome's "Pack extension" in chrome://extensions

## Notes for reviewer
- Weather uses Open-Meteo, no key, open-source, docs https://open-meteo.com/en/docs, terms https://open-meteo.com/en/terms
- Audio files are bundled MP3s (3–6 MB each) under CC0/CC BY (see ATTRIBUTION.md), no streaming
