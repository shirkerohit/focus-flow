'use strict';

// FocusFlow service worker: owns session state, the countdown alarm,
// statistics recording, offscreen audio, notifications, badge,
// site blocker and pomodoro engine. Popup is thin view.

importScripts('utils.js', 'storage.js', 'stats.js');

const SESSION_ALARM = 'ff-session-end';
const BADGE_ALARM = 'ff-badge-tick';
const WEATHER_ALARM = 'ff-weather-sync';
const WEATHER_LOCATION_KEY = 'ff_weather_location';
const WEATHER_CACHE_KEY = 'ff_weather_cache';
const OFFSCREEN_URL = 'offscreen/offscreen.html';
const NATURAL_STOP_FADE = 3;
const QUICK_STOP_FADE = 0.5;

let creatingOffscreen = null;
let queue = Promise.resolve(); // serializes mutations (rapid clicks)

// ---------------------------------------------------------------------------
// Offscreen document management

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length > 0) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play ambient focus sounds for FocusFlow sessions.',
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function sendToOffscreen(message, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
      if (res && res.ok) return;
    } catch (err) {
      // Offscreen document may still be booting; retry below.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.warn('FocusFlow: offscreen command unreachable', message.type);
}

// ---------------------------------------------------------------------------
// Badge

async function updateBadge() {
  try {
    const session = await Storage.getSession();
    if (!session || session.status !== 'running') {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'FocusFlow' });
      return;
    }
    if (session.kind === 'always') {
      await chrome.action.setBadgeBackgroundColor({ color: '#6c63f0' });
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setTitle({ title: 'FocusFlow — Always On' });
      return;
    }
    if (session.kind === 'break') {
      const remaining = Math.max(0, session.endsAt - Date.now());
      const text = Utils.formatBadge(remaining) || 'BRK';
      await chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
      await chrome.action.setBadgeText({ text: text.slice(0, 4) });
      const label = session.breakType === 'long' ? 'Long Break' : 'Short Break';
      await chrome.action.setTitle({ title: `FocusFlow — ${label} ${Utils.formatClock(remaining)} remaining` });
      return;
    }
    // focus
    const remaining = Math.max(0, session.endsAt - Date.now());
    const text = Utils.formatBadge(remaining);
    await chrome.action.setBadgeBackgroundColor({ color: '#6c63f0' });
    await chrome.action.setBadgeText({ text: text.slice(0, 4) });
    const taskPart = session.task ? ` — ${session.task}` : '';
    await chrome.action.setTitle({ title: `FocusFlow — ${Utils.formatClock(remaining)} remaining${taskPart}` });
  } catch (err) {
    console.warn('FocusFlow badge update failed', err);
  }
}

async function setBadgeTickAlarm(active) {
  await chrome.alarms.clear(BADGE_ALARM);
  if (active) {
    // periodInMinutes minimum is 1 on some Chrome; use 0.25 if allowed else 1
    try { chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 0.25 }); } catch {
      chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
    }
    await updateBadge();
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'FocusFlow' });
  }
}

// ---------------------------------------------------------------------------
// Weather sync — credible Open-Meteo, no key, sync at least every 30 min
// Ensures real-time data is fresh even when popup/home not open; widget also refreshes on display if cache stale.

async function syncWeatherInBackground(){
  try{
    const bag = await chrome.storage.local.get(WEATHER_LOCATION_KEY);
    const loc = bag[WEATHER_LOCATION_KEY];
    if(!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(loc.latitude)}&longitude=${encodeURIComponent(loc.longitude)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto&temperature_unit=celsius&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cur = data.current || {};
    // WMO mapping (same as weather.js, kept minimal for background)
    const WMO = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Violent',95:'Thunderstorm',96:'Hail',99:'Hail'};
    const label = WMO[cur.weather_code] || 'Unknown';
    const emojiMap = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',51:'🌧️',61:'🌦️',63:'🌧️',65:'🌧️',71:'🌨️',73:'❄️',75:'❄️',80:'🌦️',95:'⛈️',96:'⛈️'};
    const emoji = emojiMap[cur.weather_code] || '🌡️';
    const result = {
      temperature: cur.temperature_2m,
      apparent: cur.apparent_temperature,
      code: cur.weather_code,
      label,
      emoji,
      wind: cur.wind_speed_10m,
      humidity: cur.relative_humidity_2m,
      time: cur.time,
      units: data.current_units || { temperature_2m: '°C', wind_speed_10m: 'km/h' },
    };
    await chrome.storage.local.set({ [WEATHER_CACHE_KEY]: { lat: loc.latitude, lon: loc.longitude, fetchedAt: Date.now(), data: result } });
  }catch(e){
    console.warn('Weather background sync failed', e);
  }
}

async function scheduleWeatherSync(){
  try{
    const bag = await chrome.storage.local.get(WEATHER_LOCATION_KEY);
    const loc = bag[WEATHER_LOCATION_KEY];
    await chrome.alarms.clear(WEATHER_ALARM);
    if(loc && typeof loc.latitude === 'number'){
      chrome.alarms.create(WEATHER_ALARM, { periodInMinutes: 30 });
      // also sync once now if cache stale
      const cacheBag = await chrome.storage.local.get(WEATHER_CACHE_KEY);
      const cached = cacheBag[WEATHER_CACHE_KEY];
      const stale = !cached || (Date.now() - cached.fetchedAt) > 30*60*1000 || cached.lat !== loc.latitude || cached.lon !== loc.longitude;
      if(stale) await syncWeatherInBackground();
    }
  }catch(e){ console.warn('scheduleWeatherSync failed', e); }
}

// ---------------------------------------------------------------------------
// Notifications

async function notify(title, message) {
  try {
    const settings = await Storage.getSettings();
    if (!settings.notificationsEnabled) return;
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title,
      message,
      priority: 2,
    });
  } catch (err) {
    console.warn('FocusFlow notify failed', err);
  }
}

// ---------------------------------------------------------------------------
// Pomodoro persistence

const POMODORO_KEY = 'ff_pomodoro';

async function getPomodoroState() {
  try {
    const bag = await chrome.storage.local.get(POMODORO_KEY);
    const v = bag[POMODORO_KEY];
    if (v && typeof v === 'object' && Number.isFinite(v.cycleCount)) {
      return { cycleCount: Utils.clamp(Math.round(v.cycleCount), 0, 100) };
    }
  } catch {}
  return { cycleCount: 0 };
}
async function savePomodoroState(state) {
  try { await chrome.storage.local.set({ [POMODORO_KEY]: state }); } catch {}
}
async function clearPomodoroState() { await savePomodoroState({ cycleCount: 0 }); }

// ---------------------------------------------------------------------------
// State helpers

function liveElapsed(session) {
  const runningPart = session.status === 'running' ? Date.now() - session.segmentStart : 0;
  return session.elapsedMs + runningPart;
}

async function getStatePayload() {
  const [settings, session] = await Promise.all([Storage.getSettings(), Storage.getSession()]);
  const pomodoro = await getPomodoroState();
  return { settings, session, pomodoro };
}

function broadcast(state) {
  chrome.runtime.sendMessage({ target: 'popup', type: 'FF_STATE', state }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Session lifecycle (always invoked through `enqueue`)

async function startFocus(minutes, opts = {}) {
  await teardownCurrentSession(QUICK_STOP_FADE, { recordFocus: true });

  const settings = await Storage.getSettings();
  const pomodoroState = await getPomodoroState();
  const now = Date.now();
  // If pomodoro is enabled and this is a manual start (not auto-start after break),
  // cycleCount should reflect ongoing pomodoro set. For continuity we use persisted count.
  // However if user requested explicit reset (opts.resetCycle) we start from 0.
  const cycleCount = opts.resetCycle ? 0 : (pomodoroState.cycleCount || 0);
  if (opts.resetCycle) await clearPomodoroState();

  const task = typeof opts.task === 'string' ? opts.task.slice(0, 120) : (settings.task || '');
  // persist last task
  if (task !== settings.task) {
    settings.task = task;
    await Storage.saveSettings(settings);
  }

  const session = {
    kind: 'focus',
    soundId: settings.soundId,
    status: 'running',
    startedAt: now,
    segmentStart: now,
    elapsedMs: 0,
    plannedMs: Utils.clamp(minutes, 1, 480) * 60000,
    endsAt: now + Utils.clamp(minutes, 1, 480) * 60000,
    task: task,
    cycleCount: cycleCount,
    breakType: null,
  };
  await Storage.saveSession(session);
  await setSessionAlarm(session.endsAt);
  await setBadgeTickAlarm(true);
  await sendToOffscreen({ type: 'FF_PLAY', soundId: settings.soundId, volume: settings.volume });
  await updateBadge();
}

async function startAlways() {
  await teardownCurrentSession(QUICK_STOP_FADE, { recordFocus: true });

  const settings = await Storage.getSettings();
  const now = Date.now();
  const session = {
    kind: 'always',
    soundId: settings.soundId,
    status: 'running',
    startedAt: now,
    segmentStart: now,
    elapsedMs: 0,
    plannedMs: null,
    endsAt: null,
    task: '',
    cycleCount: 0,
    breakType: null,
  };
  await Storage.saveSession(session);
  await clearSessionAlarm();
  await setBadgeTickAlarm(true);
  await sendToOffscreen({ type: 'FF_PLAY', soundId: settings.soundId, volume: settings.volume });
  await updateBadge();
}

async function startBreak(breakType, minutes, cycleCount, task) {
  const settings = await Storage.getSettings();
  const now = Date.now();
  const session = {
    kind: 'break',
    soundId: settings.soundId,
    status: 'running',
    startedAt: now,
    segmentStart: now,
    elapsedMs: 0,
    plannedMs: Utils.clamp(minutes, 1, 60) * 60000,
    endsAt: now + Utils.clamp(minutes, 1, 60) * 60000,
    task: task || '',
    cycleCount: cycleCount,
    breakType: breakType,
  };
  await Storage.saveSession(session);
  await setSessionAlarm(session.endsAt);
  await setBadgeTickAlarm(true);
  // For breaks we optionally lower volume or keep same; fade to same track but user can pause
  await sendToOffscreen({ type: 'FF_PLAY', soundId: settings.soundId, volume: settings.volume });
  await updateBadge();
  const label = breakType === 'long' ? 'Long break' : 'Short break';
  await notify(`${label} started`, `${minutes} min break — stretch, hydrate, breathe. Focus resumes after.`);
}

async function pauseSession() {
  const session = await Storage.getSession();
  if (!session || session.status !== 'running') return;
  session.elapsedMs = liveElapsed(session);
  session.status = 'paused';
  await Storage.saveSession(session);
  await clearSessionAlarm();
  await setBadgeTickAlarm(false);
  // show paused badge
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#9e9e9e' });
    await chrome.action.setBadgeText({ text: 'Ⅱ' });
    await chrome.action.setTitle({ title: 'FocusFlow — Paused' });
  } catch {}
  await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: 0.35 });
}

async function resumeSession() {
  const session = await Storage.getSession();
  if (!session || session.status !== 'paused') return;
  const settings = await Storage.getSettings();
  const now = Date.now();
  session.status = 'running';
  session.segmentStart = now;
  if (session.kind === 'focus' || session.kind === 'break') {
    const remaining = Math.max(session.plannedMs - session.elapsedMs, 1000);
    session.endsAt = now + remaining;
  } else {
    session.endsAt = null;
  }
  await Storage.saveSession(session);
  if (session.kind === 'focus' || session.kind === 'break') await setSessionAlarm(session.endsAt);
  await setBadgeTickAlarm(true);
  await sendToOffscreen({ type: 'FF_PLAY', soundId: session.soundId, volume: settings.volume });
  await updateBadge();
}

async function stopSession(fadeSeconds) {
  const session = await Storage.getSession();
  if (!session) {
    await setBadgeTickAlarm(false);
    await Storage.clearBlockedBypass();
    return;
  }
  session.elapsedMs = liveElapsed(session);
  session.status = 'paused'; // freeze before recording
  await Stats.record(session);
  await clearSessionAlarm();
  await Storage.clearSession();
  await Storage.clearBlockedBypass();
  await setBadgeTickAlarm(false);
  await sendToOffscreen({ type: 'FF_STOP', fadeSeconds });
  // Manual stop resets pomodoro cycle
  await clearPomodoroState();
}

async function teardownCurrentSession(fadeSeconds, opts = {}) {
  const session = await Storage.getSession();
  if (!session) return;
  session.elapsedMs = liveElapsed(session);
  session.status = 'paused';
  if (opts.recordFocus !== false) await Stats.record(session);
  await clearSessionAlarm();
  await Storage.clearSession();
  await sendToOffscreen({ type: 'FF_STOP', fadeSeconds });
  // Do NOT clear pomodoro here — caller decides
}

async function completeFocusSession() {
  const session = await Storage.getSession();
  if (!session || session.kind !== 'focus') return;
  session.elapsedMs = session.plannedMs; // timer ran to completion
  session.status = 'paused';
  await Stats.record(session);
  await clearSessionAlarm();
  await Storage.clearSession();

  const settings = await Storage.getSettings();

  // Pomodoro handling
  if (settings.pomodoroEnabled) {
    const currentCycle = (session.cycleCount || 0) + 1;
    await savePomodoroState({ cycleCount: currentCycle });
    const isLong = currentCycle % settings.longBreakInterval === 0;
    const breakType = isLong ? 'long' : 'short';
    const breakMinutes = isLong ? settings.longBreakMinutes : settings.shortBreakMinutes;

    if (settings.autoStartBreaks) {
      // Start break automatically
      await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: 0.6 });
      await startBreak(breakType, breakMinutes, currentCycle, session.task);
      await notify('Focus complete — break time!', `Great work on "${session.task || 'focus'}" • ${breakMinutes} min ${breakType} break started.`);
      return;
    } else {
      // Notify and remain idle, but keep pomodoro state for next manual start
      await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: NATURAL_STOP_FADE });
      await setBadgeTickAlarm(false);
      if (isLong) await clearPomodoroState(); // long break interval completed if not auto-started, reset for next set
      await notify('Focus session complete!', `"${session.task || 'Focus'}" finished — ${isLong ? 'long' : 'short'} break (${breakMinutes} min) ready. Start break when you are ready.`);
      return;
    }
  }

  await setBadgeTickAlarm(false);
  await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: NATURAL_STOP_FADE });
  await notify('Focus complete!', `"${session.task || 'Focus'}" • ${Math.round(session.plannedMs/60000)} min done. Nice work!`);
}

async function completeBreakSession() {
  const session = await Storage.getSession();
  if (!session || session.kind !== 'break') return;
  session.elapsedMs = session.plannedMs;
  session.status = 'paused';
  await clearSessionAlarm();
  await Storage.clearSession();
  await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: 0.8 });

  const settings = await Storage.getSettings();
  const wasLong = session.breakType === 'long';
  if (wasLong) {
    await clearPomodoroState();
  }

  if (settings.autoStartFocus && settings.pomodoroEnabled) {
    // Auto-start next focus
    const nextMinutes = settings.minutes;
    await startFocus(nextMinutes, { task: session.task, resetCycle: false });
    await notify('Break over — back to focus', `Next focus: ${nextMinutes} min${session.task ? ` • ${session.task}` : ''}`);
  } else {
    await setBadgeTickAlarm(false);
    if (wasLong) {
      await notify('Long break complete', 'Pomodoro set finished! Ready for a new cycle?');
    } else {
      await notify('Break complete', 'Break over — ready to focus again?');
    }
  }
}

async function switchSound(soundId) {
  const settings = await Storage.getSettings();
  settings.soundId = soundId;
  await Storage.saveSettings(settings);

  const session = await Storage.getSession();
  if (session) {
    session.soundId = soundId;
    await Storage.saveSession(session);
    if (session.status === 'running') {
      await sendToOffscreen({ type: 'FF_PLAY', soundId, volume: settings.volume });
    }
  }
}

async function changeVolume(volume) {
  const settings = await Storage.getSettings();
  settings.volume = Utils.clamp(Math.round(volume), 0, 100);
  await Storage.saveSettings(settings);
  const session = await Storage.getSession();
  if (session && session.status === 'running') {
    await sendToOffscreen({ type: 'FF_SET_VOLUME', volume: settings.volume });
  }
}

async function resetStats() {
  await new Promise((resolve) => chrome.storage.local.remove(Storage.KEYS.sessions, () => resolve()));
  await clearPomodoroState();
}

// ---------------------------------------------------------------------------
// Site blocker

async function isBlockedHost(host) {
  const settings = await Storage.getSettings();
  if (!settings.blockedEnabled) return null;
  const session = await Storage.getSession();
  // Only block during active focus (not break, not always, not paused)
  if (!session || session.status !== 'running' || session.kind !== 'focus') return null;
  const bypasses = await Storage.getBlockedBypasses();
  const now = Date.now();
  let hasExpired = false;
  for (const [bHost, exp] of Object.entries(bypasses)) {
    if (exp <= now) { hasExpired = true; continue; }
    if (host === bHost || host.endsWith('.' + bHost)) return null;
  }
  if (hasExpired) {
    // prune expired entries lazily
    for (const [h, exp] of Object.entries(bypasses)) if (exp <= now) await Storage.clearBlockedBypass(h);
  }
  return Utils.hostMatchesBlocked(host, settings.blockedSites);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // handle only when URL changes/is complete
  const url = changeInfo.url || tab.url;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
  const host = Utils.getHostFromUrl(url);
  if (!host) return;
  enqueue(async () => {
    const matched = await isBlockedHost(host);
    if (matched) {
      const blockedUrl = chrome.runtime.getURL('blocked/blocked.html') +
        `?host=${encodeURIComponent(matched)}&url=${encodeURIComponent(url)}&remain=${encodeURIComponent(String(await getRemainingForBlockPage()))}`;
      try { await chrome.tabs.update(tabId, { url: blockedUrl }); } catch {}
    }
  });
});

async function getRemainingForBlockPage() {
  const session = await Storage.getSession();
  if (!session || session.kind !== 'focus' || session.status !== 'running') return '';
  const remaining = Math.max(0, session.endsAt - Date.now());
  return Utils.formatClock(remaining);
}

chrome.tabs.onCreated.addListener((tab) => {
  // new tab immediate check (for restored sessions)
  if (!tab.url) return;
  const host = Utils.getHostFromUrl(tab.url);
  if (!host) return;
  enqueue(async () => {
    const matched = await isBlockedHost(host);
    if (matched) {
      const blockedUrl = chrome.runtime.getURL('blocked/blocked.html') +
        `?host=${encodeURIComponent(matched)}&url=${encodeURIComponent(tab.url)}&remain=${encodeURIComponent(String(await getRemainingForBlockPage()))}`;
      try { await chrome.tabs.update(tab.id, { url: blockedUrl }); } catch {}
    }
  });
});

// ---------------------------------------------------------------------------
// Alarms & recovery

async function setSessionAlarm(when) {
  await clearSessionAlarm();
  chrome.alarms.create(SESSION_ALARM, { when });
}

async function clearSessionAlarm() {
  await chrome.alarms.clear(SESSION_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_ALARM) {
    enqueue(async () => {
      const session = await Storage.getSession();
      if (!session) return;
      if (session.kind === 'focus') await completeFocusSession();
      else if (session.kind === 'break') await completeBreakSession();
      else await completeFocusSession();
      broadcast(await getStatePayload());
      await updateBadge();
    });
    return;
  }
  if (alarm.name === BADGE_ALARM) {
    updateBadge();
  }
  if (alarm.name === WEATHER_ALARM) {
    syncWeatherInBackground();
  }
});

// Browser restart / extension reload recovery.
async function recover() {
  const session = await Storage.getSession();
  if (!session || session.status !== 'running') {
    await setBadgeTickAlarm(false);
    return;
  }

  // Timer finished while the browser was closed.
  if ((session.kind === 'focus' || session.kind === 'break') && Date.now() >= session.endsAt) {
    if (session.kind === 'break') await completeBreakSession();
    else await completeFocusSession();
    return;
  }

  const settings = await Storage.getSettings();
  if (session.kind === 'focus' || session.kind === 'break') await setSessionAlarm(session.endsAt);
  await setBadgeTickAlarm(true);
  await sendToOffscreen({ type: 'FF_PLAY', soundId: session.soundId, volume: settings.volume });
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(() => enqueue(recover));
chrome.runtime.onInstalled.addListener(() => scheduleWeatherSync());
chrome.runtime.onStartup.addListener(() => enqueue(recover));
chrome.runtime.onStartup.addListener(() => scheduleWeatherSync());

// Also run on service worker wake to ensure badge correct
enqueue(recover);
enqueue(scheduleWeatherSync);
chrome.storage.onChanged.addListener((changes, area)=>{
  if(area==='local' && changes[WEATHER_LOCATION_KEY]){
    scheduleWeatherSync();
  }
});

// Notifications click -> focus extension
chrome.notifications.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage?.(() => {});
  // Also try to open popup is not possible programmatically; ensure badge updated
});

// Commands (keyboard shortcuts)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-pause') {
    enqueue(async () => {
      const session = await Storage.getSession();
      if (!session) return;
      if (session.status === 'running') await pauseSession();
      else if (session.status === 'paused') await resumeSession();
      broadcast(await getStatePayload());
      await updateBadge();
    });
  } else if (command === 'stop-session') {
    enqueue(async () => {
      await stopSession(QUICK_STOP_FADE);
      broadcast(await getStatePayload());
      await updateBadge();
    });
  }
});

// ---------------------------------------------------------------------------
// Message router

const handlers = {
  async FF_GET_STATE() {
    return getStatePayload();
  },
  async FF_START_FOCUS(msg) {
    const settings = await Storage.getSettings();
    settings.mode = 'focus';
    settings.minutes = Utils.clamp(Math.round(+msg.minutes || settings.minutes), 1, 480);
    if (typeof msg.task === 'string') settings.task = msg.task.slice(0, 120);
    // pomodoro settings may be updated via FF_SET_SETTINGS, but also allow inline
    if (typeof msg.pomodoroEnabled === 'boolean') settings.pomodoroEnabled = msg.pomodoroEnabled;
    await Storage.saveSettings(settings);
    await startFocus(settings.minutes, { task: settings.task, resetCycle: !!msg.resetCycle });
  },
  async FF_START_ALWAYS() {
    const settings = await Storage.getSettings();
    settings.mode = 'always';
    await Storage.saveSettings(settings);
    await startAlways();
  },
  async FF_START_BREAK(msg) {
    // manual start break (from popup)
    const settings = await Storage.getSettings();
    const breakType = msg.breakType === 'long' ? 'long' : 'short';
    const minutes = breakType === 'long' ? settings.longBreakMinutes : settings.shortBreakMinutes;
    const pomodoro = await getPomodoroState();
    const session = await Storage.getSession();
    const task = session?.task || settings.task || '';
    // Teardown previous without recording (break manual)
    if (session) {
      await Storage.clearSession();
      await clearSessionAlarm();
      await sendToOffscreen({ type: 'FF_STOP', fadeSeconds: 0.4 });
    }
    await startBreak(breakType, minutes, pomodoro.cycleCount || 0, task);
  },
  async FF_PAUSE() {
    await pauseSession();
  },
  async FF_RESUME() {
    await resumeSession();
  },
  async FF_STOP() {
    await stopSession(QUICK_STOP_FADE);
  },
  async FF_SKIP_BREAK() {
    const session = await Storage.getSession();
    if (session && session.kind === 'break') {
      await completeBreakSession();
    }
  },
  async FF_SET_SOUND(msg) {
    if (!SoundList.includes(msg.soundId)) throw new Error('Unknown sound');
    await switchSound(msg.soundId);
  },
  async FF_SET_MODE(msg) {
    if (!['focus', 'always'].includes(msg.mode)) throw new Error('Unknown mode');
    const settings = await Storage.getSettings();
    settings.mode = msg.mode;
    await Storage.saveSettings(settings);
  },
  async FF_SET_MINUTES(msg) {
    const settings = await Storage.getSettings();
    settings.minutes = Utils.clamp(Math.round(+msg.minutes || 30), 1, 480);
    await Storage.saveSettings(settings);
  },
  async FF_SET_VOLUME(msg) {
    await changeVolume(Number(msg.volume));
  },
  async FF_RESET_STATS() {
    await resetStats();
  },
  async FF_SET_TASK(msg) {
    const settings = await Storage.getSettings();
    const task = typeof msg.task === 'string' ? msg.task.slice(0, 120) : '';
    settings.task = task;
    await Storage.saveSettings(settings);
    const session = await Storage.getSession();
    if (session && (session.kind === 'focus' || session.kind === 'break')) {
      session.task = task;
      await Storage.saveSession(session);
    }
  },
  async FF_SET_SETTINGS(msg) {
    const settings = await Storage.getSettings();
    const patch = msg.settings || {};
    // Validate and apply known keys
    if (typeof patch.pomodoroEnabled === 'boolean') settings.pomodoroEnabled = patch.pomodoroEnabled;
    if (Number.isFinite(+patch.shortBreakMinutes)) settings.shortBreakMinutes = Utils.clamp(Math.round(+patch.shortBreakMinutes), 1, 30);
    if (Number.isFinite(+patch.longBreakMinutes)) settings.longBreakMinutes = Utils.clamp(Math.round(+patch.longBreakMinutes), 1, 60);
    if (Number.isFinite(+patch.longBreakInterval)) settings.longBreakInterval = Utils.clamp(Math.round(+patch.longBreakInterval), 2, 8);
    if (typeof patch.autoStartBreaks === 'boolean') settings.autoStartBreaks = patch.autoStartBreaks;
    if (typeof patch.autoStartFocus === 'boolean') settings.autoStartFocus = patch.autoStartFocus;
    if (typeof patch.blockedEnabled === 'boolean') settings.blockedEnabled = patch.blockedEnabled;
    if (typeof patch.notificationsEnabled === 'boolean') settings.notificationsEnabled = patch.notificationsEnabled;
    if (Number.isFinite(+patch.dailyGoalMinutes)) settings.dailyGoalMinutes = Utils.clamp(Math.round(+patch.dailyGoalMinutes), 15, 480);
    if (patch.blockedSites) settings.blockedSites = Storage.sanitizeBlockedSites(patch.blockedSites);
    if (typeof patch.task === 'string') settings.task = patch.task.slice(0, 120);
    await Storage.saveSettings(settings);
    // If pomodoro disabled, clear cycle
    if (!settings.pomodoroEnabled) await clearPomodoroState();
  },
  async FF_SET_BLOCKED_SITES(msg) {
    const settings = await Storage.getSettings();
    settings.blockedSites = Storage.sanitizeBlockedSites(msg.blockedSites);
    await Storage.saveSettings(settings);
  },
  async FF_ALLOW_ONCE(msg) {
    const host = typeof msg.host === 'string' ? msg.host.toLowerCase().replace(/^www\./,'') : '';
    if (!host) throw new Error('No host');
    await Storage.saveBlockedBypass(host, Date.now() + 5 * 60000);
  },
  async FF_DISABLE_SITE_FOR_SESSION(msg) {
    const host = typeof msg.host === 'string' ? msg.host.toLowerCase().replace(/^www\./,'') : '';
    if (!host) throw new Error('No host');
    const session = await Storage.getSession();
    // Last until session ends + 2 min buffer, or 8h if no session/endsAt
    let expiresAt = Date.now() + 8 * 3600000;
    if (session && session.endsAt && Number.isFinite(session.endsAt)) {
      expiresAt = Math.max(expiresAt, session.endsAt + 120000);
    }
    await Storage.saveBlockedBypass(host, expiresAt);
  },
  async FF_EXPORT_DATA() {
    const [settings, sessions, pomodoro] = await Promise.all([
      Storage.getSettings(),
      Storage.getSessions(),
      getPomodoroState(),
    ]);
    return { settings, sessions, pomodoro, exportedAt: new Date().toISOString(), version: 2 };
  },
  async FF_IMPORT_DATA(msg) {
    const data = msg.data;
    if (!data || !Array.isArray(data.sessions)) throw new Error('Invalid import data');
    // Validate sessions
    const valid = data.sessions.filter(s => s && typeof s.date === 'string' && Number.isFinite(s.durationMs));
    await Storage.saveSessions(valid.slice(0, 1000));
    if (data.settings && typeof data.settings === 'object') {
      const cur = await Storage.getSettings();
      const merged = { ...cur, ...data.settings };
      // sanitize
      await Storage.saveSettings(merged);
    }
    if (data.pomodoro && Number.isFinite(data.pomodoro.cycleCount)) {
      await savePomodoroState({ cycleCount: Utils.clamp(Math.round(data.pomodoro.cycleCount),0,100) });
    }
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'background' || !handlers[msg.type]) return false;
  enqueue(async () => {
    let payload = null;
    try {
      const result = await handlers[msg.type](msg);
      payload = result && typeof result === 'object' && (result.settings || result.sessions) ? result : await getStatePayload();
      // For export, result is special payload; send that directly
      if (msg.type === 'FF_EXPORT_DATA' && result && result.sessions) {
        sendResponse(result);
        broadcast(await getStatePayload());
        return;
      }
    } catch (err) {
      console.warn('FocusFlow command failed', msg.type, err);
      payload = await getStatePayload();
    }
    broadcast(payload);
    sendResponse(payload);
  });
  return true;
});

// Serialize every mutation so rapid clicks can never interleave.
function enqueue(task) {
  queue = queue.then(task, task).catch((err) => console.warn('FocusFlow task failed', err));
  return queue;
}
