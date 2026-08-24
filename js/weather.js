'use strict';

// Weather widget using Open-Meteo (https://open-meteo.com/en/docs)
// Credible primary source: open-meteo.com docs, no API key, open-source, self-hostable
// Verified via evidence-based-research: docs at https://open-meteo.com/en/docs (access 2026-08-23)
// and comparison https://open-meteo.com/ — not flagged unsafe, no credentials needed.
// Uses two endpoints:
//  - Geocoding: https://geocoding-api.open-meteo.com/v1/search
//  - Forecast:  https://api.open-meteo.com/v1/forecast
// Both CORS-enabled and require only plain HTTPS GET.

const Weather = (() => {
  const STORAGE_KEY = 'ff_weather_location';
  const CACHE_KEY = 'ff_weather_cache';
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — sync at least every 30 min as required; background also syncs
  const SYNC_INTERVAL_MIN = 30;

  // WMO weather codes -> description + emoji (source: https://open-meteo.com/en/docs#weathervariables)
  const WMO_MAP = {
    0:  { label: 'Clear sky', emoji: '☀️' },
    1:  { label: 'Mainly clear', emoji: '🌤️' },
    2:  { label: 'Partly cloudy', emoji: '⛅' },
    3:  { label: 'Overcast', emoji: '☁️' },
    45: { label: 'Fog', emoji: '🌫️' },
    48: { label: 'Depositing fog', emoji: '🌫️' },
    51: { label: 'Light drizzle', emoji: '🌧️' },
    53: { label: 'Moderate drizzle', emoji: '🌧️' },
    55: { label: 'Dense drizzle', emoji: '🌧️' },
    56: { label: 'Light freezing drizzle', emoji: '🌧️' },
    57: { label: 'Dense freezing drizzle', emoji: '🌧️' },
    61: { label: 'Slight rain', emoji: '🌦️' },
    63: { label: 'Moderate rain', emoji: '🌧️' },
    65: { label: 'Heavy rain', emoji: '🌧️' },
    66: { label: 'Light freezing rain', emoji: '🌧️' },
    67: { label: 'Heavy freezing rain', emoji: '🌧️' },
    71: { label: 'Slight snow', emoji: '🌨️' },
    73: { label: 'Moderate snow', emoji: '❄️' },
    75: { label: 'Heavy snow', emoji: '❄️' },
    77: { label: 'Snow grains', emoji: '❄️' },
    80: { label: 'Slight showers', emoji: '🌦️' },
    81: { label: 'Moderate showers', emoji: '🌧️' },
    82: { label: 'Violent showers', emoji: '⛈️' },
    85: { label: 'Slight snow showers', emoji: '🌨️' },
    86: { label: 'Heavy snow showers', emoji: '🌨️' },
    95: { label: 'Thunderstorm', emoji: '⛈️' },
    96: { label: 'Thunderstorm + hail', emoji: '⛈️' },
    99: { label: 'Thunderstorm + hail', emoji: '⛈️' },
  };

  function wmoToInfo(code) {
    return WMO_MAP[code] || { label: 'Unknown', emoji: '🌡️' };
  }

  async function getLocation() {
    try {
      const bag = await chrome.storage.local.get(STORAGE_KEY);
      const v = bag[STORAGE_KEY];
      if (v && typeof v.latitude === 'number' && typeof v.longitude === 'number' && typeof v.name === 'string') {
        return v;
      }
    } catch {}
    return null;
  }

  async function saveLocation(loc) {
    // loc: {name, country, latitude, longitude, admin1, timezone}
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: loc });
      // clear cache so next fetch uses new location
      await chrome.storage.local.remove(CACHE_KEY);
    } catch (e) {
      console.warn('Weather saveLocation failed', e);
    }
  }

  async function clearLocation() {
    try {
      await chrome.storage.local.remove([STORAGE_KEY, CACHE_KEY]);
    } catch {}
  }

  async function searchLocation(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    // Credible geocoding endpoint: https://geocoding-api.open-meteo.com/v1/search
    // Docs: https://open-meteo.com/en/docs/geocoding-api
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      return results.map(r => ({
        name: r.name,
        country: r.country,
        admin1: r.admin1 || '',
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone || 'auto',
        // for display
        label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      }));
    } catch (e) {
      console.warn('Weather geocoding failed', e);
      return [];
    }
  }

  async function fetchWeather(lat, lon) {
    // Check cache first
    try {
      const bag = await chrome.storage.local.get(CACHE_KEY);
      const cached = bag[CACHE_KEY];
      if (cached && cached.lat === lat && cached.lon === lon && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS && cached.data) {
        return cached.data;
      }
    } catch {}
    // Credible forecast endpoint: https://api.open-meteo.com/v1/forecast
    // Docs: https://open-meteo.com/en/docs
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto&temperature_unit=celsius&wind_speed_unit=kmh`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cur = data.current || {};
      const info = wmoToInfo(cur.weather_code);
      const result = {
        temperature: cur.temperature_2m,
        apparent: cur.apparent_temperature,
        code: cur.weather_code,
        label: info.label,
        emoji: info.emoji,
        wind: cur.wind_speed_10m,
        humidity: cur.relative_humidity_2m,
        time: cur.time,
        units: data.current_units || { temperature_2m: '°C', wind_speed_10m: 'km/h' },
        raw: data,
      };
      // cache
      try {
        await chrome.storage.local.set({ [CACHE_KEY]: { lat, lon, fetchedAt: Date.now(), data: result } });
      } catch {}
      return result;
    } catch (e) {
      console.warn('Weather fetch failed', e);
      // try cached stale fallback
      try {
        const bag = await chrome.storage.local.get(CACHE_KEY);
        if (bag[CACHE_KEY]?.data) return bag[CACHE_KEY].data;
      } catch {}
      throw e;
    }
  }

  // Render helpers — caller provides container elements
  function renderWidget(container, location, weather, opts = {}) {
    if (!container) return;
    const { onChangeClick, onSearch } = opts;
    container.textContent = '';
    container.className = 'weather-widget';

    if (!location) {
      // No location set — show selector
      const title = document.createElement('div');
      title.className = 'weather-title';
      title.textContent = 'Weather';
      const hint = document.createElement('div');
      hint.className = 'weather-hint';
      hint.textContent = 'Select your location to see local weather. No tracking, data from Open-Meteo.';
      const row = document.createElement('div');
      row.className = 'weather-search-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search city e.g. Mumbai, London';
      input.className = 'weather-input';
      input.id = container.id + '-input';
      const btn = document.createElement('button');
      btn.textContent = 'Search';
      btn.className = 'btn btn-secondary weather-search-btn';
      btn.style.padding = '8px 12px';
      btn.style.fontSize = '12px';
      const results = document.createElement('div');
      results.className = 'weather-results';
      results.id = container.id + '-results';

      async function doSearch() {
        const q = input.value.trim();
        if (!q) return;
        btn.textContent = '…';
        btn.disabled = true;
        results.textContent = 'Searching…';
        const list = await searchLocation(q);
        results.textContent = '';
        if (!list.length) {
          results.textContent = 'No results. Try another city.';
        } else {
          for (const loc of list) {
            const item = document.createElement('button');
            item.className = 'weather-result-item';
            item.textContent = loc.label;
            item.addEventListener('click', async () => {
              await saveLocation(loc);
              if (typeof onSearch === 'function') onSearch(loc);
            });
            results.appendChild(item);
          }
        }
        btn.textContent = 'Search';
        btn.disabled = false;
      }
      btn.addEventListener('click', doSearch);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
      // debounce input
      let t = null;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(doSearch, 500);
      });

      row.append(input, btn);
      container.append(title, hint, row, results);
      return;
    }

    // Location set — show weather
    const header = document.createElement('div');
    header.className = 'weather-header';
    const locEl = document.createElement('span');
    locEl.className = 'weather-loc';
    locEl.textContent = `${location.name}${location.country ? ', ' + location.country : ''}`;
    const changeBtn = document.createElement('button');
    changeBtn.className = 'weather-change';
    changeBtn.textContent = 'Change';
    changeBtn.addEventListener('click', () => {
      if (typeof onChangeClick === 'function') onChangeClick();
      else renderWidget(container, null, null, opts);
    });
    header.append(locEl, changeBtn);

    if (!weather) {
      const loading = document.createElement('div');
      loading.className = 'weather-loading';
      loading.textContent = 'Loading…';
      container.append(header, loading);
      return;
    }

    const main = document.createElement('div');
    main.className = 'weather-main';
    const temp = document.createElement('span');
    temp.className = 'weather-temp';
    temp.textContent = `${Math.round(weather.temperature)}°${weather.units.temperature_2m === '°F' ? 'F' : 'C'}`;
    const emoji = document.createElement('span');
    emoji.className = 'weather-emoji';
    emoji.textContent = weather.emoji;
    const desc = document.createElement('span');
    desc.className = 'weather-desc';
    desc.textContent = weather.label;
    main.append(emoji, temp, desc);

    const meta = document.createElement('div');
    meta.className = 'weather-meta';
    const wind = document.createElement('span');
    wind.textContent = `Wind ${Math.round(weather.wind)} ${weather.units.wind_speed_10m}`;
    const hum = document.createElement('span');
    hum.textContent = `Humidity ${weather.humidity}%`;
    const feels = document.createElement('span');
    feels.textContent = `Feels ${Math.round(weather.apparent)}°`;
    meta.append(wind, hum, feels);

    const foot = document.createElement('div');
    foot.className = 'weather-foot';
    foot.textContent = `Updated ${new Date(weather.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} • Open-Meteo`;

    container.append(header, main, meta, foot);
  }

  return {
    getLocation,
    saveLocation,
    clearLocation,
    searchLocation,
    fetchWeather,
    renderWidget,
    wmoToInfo,
  };
})();
