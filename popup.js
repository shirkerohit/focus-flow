'use strict';

// Popup view layer. All state changes flow through the service worker;
// this script renders state, sends intents, and ticks the countdown locally.

const SOUNDS = [
  { id: 'rain', emoji: '🌧', label: 'Rain' },
  { id: 'cafe', emoji: '☕', label: 'Cafe' },
  { id: 'astral', emoji: '🌌', label: 'Astral' },
  { id: 'ocean', emoji: '🌊', label: 'Ocean' },
  { id: 'forest', emoji: '🍃', label: 'Forest' },
];
const SOUND_LABEL = Object.fromEntries(SOUNDS.map((s) => [s.id, s.label]));
const PRESETS = [15, 30, 45, 60];
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

let state = {
  settings: { soundId: 'rain', volume: 60, mode: 'focus', minutes: 30, task: '', pomodoroEnabled: false, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartBreaks: true, autoStartFocus: false, blockedSites: [], blockedEnabled: true, dailyGoalMinutes: 120, notificationsEnabled: true },
  session: null,
  pomodoro: { cycleCount: 0 },
};
let sessions = [];
let volumeDebounce = null;
let selectedMinutes = 30;

// Theme sync (home toggle → popup)
if (typeof Theme !== 'undefined') Theme.init();

// ---------------------------------------------------------------------------
// Messaging helpers

function send(type, extra = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ target: 'background', type, ...extra }, (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function act(type, extra) {
  const res = await send(type, extra);
  if (res) applyState(res);
}

function applyState(next) {
  if (!next) return;
  // Handle export special case not via applyState
  if (next.sessions && next.exportedAt) return; // export
  state = next;
  // Defensive: ensure shape
  if (!state.pomodoro) state.pomodoro = { cycleCount: 0 };
  selectedMinutes = state.settings.minutes;
  render();
}

// ---------------------------------------------------------------------------
// Derived state

function isPlaying() {
  return !!state.session && state.session.status === 'running';
}

function remainingMs() {
  const s = state.session;
  if (!s) return 0;
  if (s.kind === 'always') return null;
  if (s.status === 'paused') return Math.max(0, s.plannedMs - s.elapsedMs);
  return Math.max(0, s.endsAt - Date.now());
}

// ---------------------------------------------------------------------------
// Rendering

const $ = (id) => document.getElementById(id);

function render() {
  renderStatus();
  renderSounds();
  renderVolume();
  renderGoal();
  renderModeAndSession();
  renderBlocker();
  renderDashboard();
  renderPomodoroControls();
  syncSettingsInputs();
}

function renderStatus() {
  const pill = $('status-pill');
  pill.classList.toggle('playing', isPlaying());
  pill.classList.toggle('paused', !!state.session && state.session.status === 'paused');
  const s = state.session;
  $('status-text').textContent =
    !s ? 'Idle'
      : s.status === 'paused' ? 'Paused'
        : s.kind === 'always' ? 'Always On'
          : s.kind === 'break' ? (s.breakType === 'long' ? 'Long Break' : 'Short Break')
            : 'Focusing';
}

function renderSounds() {
  const grid = $('sound-grid');
  grid.textContent = '';
  for (const sound of SOUNDS) {
    const btn = document.createElement('button');
    btn.className = 'sound-btn' + (sound.id === state.settings.soundId ? ' selected' : '');
    btn.dataset.soundId = sound.id;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(sound.id === state.settings.soundId));
    const emoji = document.createElement('span');
    emoji.className = 'sound-emoji';
    emoji.textContent = sound.emoji;
    const name = document.createElement('span');
    name.className = 'sound-name';
    name.textContent = sound.label;
    btn.append(emoji, name);
    btn.addEventListener('click', () => {
      state.settings.soundId = sound.id;
      renderSounds();
      act('FF_SET_SOUND', { soundId: sound.id });
    });
    grid.appendChild(btn);
  }
}

function renderVolume() {
  const slider = $('volume-slider');
  const vol = state.settings.volume;
  slider.value = vol;
  slider.style.setProperty('--fill', `${vol}%`);
  $('volume-value').textContent = `${vol}%`;
}

function renderGoal() {
  const summary = Stats.summarize(sessions);
  const goalMin = state.settings.dailyGoalMinutes || 120;
  const goalMs = goalMin * 60000;
  const pct = goalMs > 0 ? Math.min(100, Math.round((summary.todayMs / goalMs) * 100)) : 0;
  $('goal-text').textContent = `${Math.round(summary.todayMs/60000)} / ${goalMin} min`;
  $('goal-pct').textContent = `${pct}%`;
  $('goal-fill').style.width = `${pct}%`;
  const insights = Stats.insights(sessions, goalMin);
  const streakEl = $('streak-badge');
  const totalStreak = insights.streak;
  if (totalStreak > 0) {
    streakEl.textContent = `🔥 ${totalStreak} day streak`;
    streakEl.classList.remove('zero');
  } else {
    streakEl.textContent = '🔥 —';
    streakEl.classList.add('zero');
  }
  let sub = '';
  if (pct >= 100) sub = `Goal hit! ${insights.goalStreak ? `🔥 Goal streak: ${insights.goalStreak} days` : ''} Keep it up.`;
  else if (insights.avgMs) sub = `Avg ${Utils.formatDuration(insights.avgMs)} • ${insights.count} sessions total`;
  else sub = 'Set a daily goal to build a streak';
  $('goal-sub').textContent = sub;
}

function renderModeAndSession() {
  const session = state.session;
  const effectiveMode = session ? (session.kind === 'break' ? 'focus' : session.kind) : state.settings.mode;
  $('mode-focus').classList.toggle('active', effectiveMode === 'focus');
  $('mode-always').classList.toggle('active', effectiveMode === 'always');

  $('session-view').classList.toggle('hidden', !session);

  if (!session) {
    // Always show setup; renderSetup will hide presets/custom for Always On but keep Start button
    $('focus-setup').classList.remove('hidden');
    renderSetup(effectiveMode);
    return;
  }

  $('focus-setup').classList.add('hidden');
  renderTimer(session);
}

function renderSetup(mode) {
  const isFocus = mode === 'focus';
  $('presets').classList.toggle('hidden', !isFocus);
  document.querySelector('.custom-row').classList.toggle('hidden', !isFocus);
  document.querySelector('.task-row').classList.toggle('hidden', !isFocus);
  const pomToggleRow = $('pomodoro-toggle')?.closest('.toggle');
  if (pomToggleRow) pomToggleRow.classList.toggle('hidden', !isFocus);
  $('btn-start').textContent = isFocus ? 'Start Focus' : 'Start Always On';
  // task input
  const taskInput = $('task-input');
  if (document.activeElement !== taskInput) taskInput.value = state.settings.task || '';

  for (const chip of $('presets').children) {
    const minutes = Number(chip.dataset.minutes);
    const custom = !PRESETS.includes(selectedMinutes);
    chip.classList.toggle('selected', isFocus && !custom && minutes === selectedMinutes);
  }
  if (isFocus) {
    const input = $('custom-minutes');
    if (PRESETS.includes(selectedMinutes)) input.value = '';
    else input.value = selectedMinutes;
  }
  // pomodoro visibility
  const pomodoroEnabled = state.settings.pomodoroEnabled;
  $('pomodoro-toggle').checked = pomodoroEnabled;
  $('pomodoro-detail').classList.toggle('hidden', !pomodoroEnabled || !isFocus);
  $('hint-pomodoro').style.display = (pomodoroEnabled && isFocus) ? 'block' : 'none';
  if (pomodoroEnabled) {
    $('short-break').value = state.settings.shortBreakMinutes;
    $('long-break').value = state.settings.longBreakMinutes;
    $('long-interval').value = state.settings.longBreakInterval;
    $('auto-breaks').checked = state.settings.autoStartBreaks;
    $('auto-focus').checked = state.settings.autoStartFocus;
    $('hint-pomodoro').textContent = `Pomodoro: ${selectedMinutes}m focus → ${state.settings.shortBreakMinutes}m break ×${state.settings.longBreakInterval -1} → ${state.settings.longBreakMinutes}m long break`;
  }
}

function renderTimer(session) {
  const timeEl = $('timer-time');
  const labelEl = $('timer-label');
  const ring = $('ring-fg');
  const pauseBtn = $('btn-pause-resume');
  const taskDisp = $('task-display');
  const cycleDisp = $('cycle-display');
  const breakCtrls = $('break-controls');
  const wrap = document.querySelector('.timer-wrap');

  const paused = session.status === 'paused';
  const isBreak = session.kind === 'break';

  // task
  taskDisp.textContent = session.task ? `🎯 ${session.task}` : (isBreak ? 'Break — breathe & stretch' : '');
  // cycle
  if (state.settings.pomodoroEnabled) {
    const cycleCount = session.cycleCount || state.pomodoro.cycleCount || 0;
    if (isBreak) {
      cycleDisp.textContent = session.breakType === 'long'
        ? `Long break after ${cycleCount} focus sessions`
        : `Break ${cycleCount}/${state.settings.longBreakInterval}`;
    } else if (session.kind === 'focus') {
      const next = cycleCount + 1;
      cycleDisp.textContent = `Focus ${next} of ${state.settings.longBreakInterval} • ${cycleCount} completed`;
    } else cycleDisp.textContent = '';
  } else cycleDisp.textContent = '';

  // ring color
  wrap.classList.toggle('break-mode', isBreak);
  document.querySelector('.session-controls').classList.toggle('break-mode', isBreak);

  if (session.kind === 'always') {
    timeEl.textContent = '∞';
    labelEl.textContent = paused ? 'paused' : 'always playing';
    ring.style.strokeDashoffset = paused ? RING_CIRCUMFERENCE : 0;
    breakCtrls.classList.add('hidden');
  } else if (isBreak) {
    const remaining = remainingMs();
    timeEl.textContent = Utils.formatClock(remaining);
    labelEl.textContent = paused ? 'paused • break' : (session.breakType === 'long' ? 'long break' : 'short break');
    const progress = Utils.clamp(1 - remaining / session.plannedMs, 0, 1);
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
    breakCtrls.classList.remove('hidden');
  } else {
    const remaining = remainingMs();
    timeEl.textContent = Utils.formatClock(remaining);
    labelEl.textContent = paused ? 'paused' : 'remaining';
    const progress = Utils.clamp(1 - remaining / session.plannedMs, 0, 1);
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
    breakCtrls.classList.add('hidden');
  }

  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
}

function renderDashboard() {
  const summary = Stats.summarize(sessions);
  $('today-total').textContent = summary.todayMs > 0 ? Utils.formatDuration(summary.todayMs) : '0 min';
  $('week-total').textContent = summary.weekMs > 0 ? Utils.formatDuration(summary.weekMs) : '0 min';
  const insights = Stats.insights(sessions, state.settings.dailyGoalMinutes);
  const extra = $('dash-extra');
  extra.textContent = '';
  const pills = [];
  if (insights.avgMs) pills.push(`Avg ${Utils.formatDuration(insights.avgMs)}`);
  if (insights.streak) pills.push(`🔥 ${insights.streak}d streak`);
  if (insights.goalStreak) pills.push(`🎯 Goal ${insights.goalStreak}d`);
  if (insights.count) pills.push(`${insights.count} sessions`);
  if (insights.bestMs) pills.push(`Best ${Utils.formatDuration(insights.bestMs)}`);
  for (const txt of pills) {
    const span = document.createElement('span');
    span.className = 'dash-pill';
    span.textContent = txt;
    extra.appendChild(span);
  }
  renderChart(summary.days);
  renderRecent(summary.recent);
}

function renderChart(days) {
  const chart = $('chart');
  chart.textContent = '';
  const max = Math.max(...days.map((d) => d.ms), 1);

  for (const day of days) {
    const col = document.createElement('div');
    col.className = 'bar-col';

    const bar = document.createElement('div');
    bar.className = 'bar-fill' +
      (day.ms === 0 ? ' empty' : '') +
      (day.isToday ? ' today' : '');
    bar.style.height = day.ms === 0 ? '3px' : `${Math.max(8, (day.ms / max) * 100)}%`;
    bar.title = `${day.label}: ${Utils.formatDuration(day.ms)}`;

    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = day.label.slice(0, 2);

    col.append(bar, label);
    chart.appendChild(col);
  }
}

function renderRecent(recent) {
  const list = $('recent-list');
  list.textContent = '';

  if (recent.length === 0) {
    const li = document.createElement('li');
    li.style.justifyContent = 'center';
    li.textContent = 'No focus sessions yet';
    list.appendChild(li);
    return;
  }

  const todayKey = Utils.toDateKey(new Date());
  for (const rec of recent) {
    const li = document.createElement('li');
    const main = document.createElement('span');
    main.className = 'session-sound';
    const taskPart = rec.task ? ` • ${rec.task}` : '';
    main.textContent = `${Utils.formatDuration(rec.durationMs)} • ${SOUND_LABEL[rec.soundId] || rec.soundId}${taskPart}`;
    const when = document.createElement('span');
    when.className = 'session-when';
    when.textContent = rec.date === todayKey ? `Today ${rec.startTime}`
      : new Date(`${rec.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    li.append(main, when);
    list.appendChild(li);
  }
}

function renderBlocker() {
  const list = $('blocker-list');
  if (!list) return;
  list.textContent = '';
  const sites = state.settings.blockedSites || [];
  for (const site of sites) {
    const chip = document.createElement('span');
    chip.className = 'blocker-chip';
    chip.textContent = site;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = 'Remove';
    btn.addEventListener('click', async () => {
      const filtered = sites.filter(s => s !== site);
      state.settings.blockedSites = filtered;
      renderBlocker();
      send('FF_SET_BLOCKED_SITES', { blockedSites: filtered });
    });
    chip.appendChild(btn);
    list.appendChild(chip);
  }
  $('blocker-enabled').checked = state.settings.blockedEnabled !== false;
}

function renderPomodoroControls() {
  // already handled in renderSetup, but ensure blocker enabled sync
}

function syncSettingsInputs() {
  const dg = $('daily-goal');
  if (document.activeElement !== dg) dg.value = state.settings.dailyGoalMinutes;
  const nt = $('notif-toggle');
  if (document.activeElement !== nt) nt.checked = state.settings.notificationsEnabled !== false;
}

// ---------------------------------------------------------------------------
// Actions

const presetsHost = $('presets');
presetsHost.textContent = '';
PRESETS.forEach((minutes) => {
  const chip = document.createElement('button');
  chip.className = 'preset-chip';
  chip.dataset.minutes = String(minutes);
  chip.textContent = `${minutes}`;
  chip.addEventListener('click', () => {
    selectedMinutes = minutes;
    act('FF_SET_MINUTES', { minutes });
    renderSetup('focus');
  });
  presetsHost.appendChild(chip);
});

$('custom-minutes').addEventListener('input', (e) => {
  const value = Utils.clamp(Math.round(Number(e.target.value)) || 0, 1, 480);
  if (value >= 1) {
    selectedMinutes = value;
    renderSetup('focus');
  }
});
$('custom-minutes').addEventListener('change', (e) => {
  const v = Utils.clamp(Math.round(Number(e.target.value)) || selectedMinutes, 1, 480);
  selectedMinutes = v;
  send('FF_SET_MINUTES', { minutes: v });
});

$('task-input').addEventListener('input', (e) => {
  state.settings.task = e.target.value.slice(0, 120);
});
$('task-input').addEventListener('change', (e) => {
  const task = e.target.value.slice(0, 120);
  send('FF_SET_TASK', { task });
});
$('task-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    send('FF_SET_TASK', { task: e.target.value.slice(0, 120) });
    if (!state.session) $('btn-start').focus();
  }
});

$('pomodoro-toggle').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  send('FF_SET_SETTINGS', { settings: { pomodoroEnabled: enabled } }).then(r => { if(r) applyState(r); });
});

['short-break','long-break','long-interval'].forEach(id => {
  $(id).addEventListener('change', () => {
    send('FF_SET_SETTINGS', { settings: {
      shortBreakMinutes: Number($('short-break').value),
      longBreakMinutes: Number($('long-break').value),
      longBreakInterval: Number($('long-interval').value),
    }});
  });
});
$('auto-breaks').addEventListener('change', (e) => {
  send('FF_SET_SETTINGS', { settings: { autoStartBreaks: e.target.checked }});
});
$('auto-focus').addEventListener('change', (e) => {
  send('FF_SET_SETTINGS', { settings: { autoStartFocus: e.target.checked }});
});

$('volume-slider').addEventListener('input', (e) => {
  const volume = Number(e.target.value);
  state.settings.volume = volume;
  e.target.style.setProperty('--fill', `${volume}%`);
  $('volume-value').textContent = `${volume}%`;
  clearTimeout(volumeDebounce);
  volumeDebounce = setTimeout(() => send('FF_SET_VOLUME', { volume }), 120);
});

$('mode-focus').addEventListener('click', () => {
  state.settings.mode = 'focus';
  renderModeAndSession();
  send('FF_SET_MODE', { mode: 'focus' });
});

$('mode-always').addEventListener('click', () => {
  state.settings.mode = 'always';
  renderModeAndSession();
  send('FF_SET_MODE', { mode: 'always' });
});

$('btn-start').addEventListener('click', () => {
  const task = $('task-input').value.slice(0, 120);
  if (state.settings.mode === 'always') {
    act('FF_START_ALWAYS');
  } else {
    act('FF_START_FOCUS', { minutes: selectedMinutes, task });
  }
});

$('btn-pause-resume').addEventListener('click', () => {
  act(state.session?.status === 'paused' ? 'FF_RESUME' : 'FF_PAUSE');
});

$('btn-stop').addEventListener('click', () => act('FF_STOP'));
$('btn-skip-break').addEventListener('click', () => act('FF_SKIP_BREAK'));

$('blocker-enabled').addEventListener('change', (e) => {
  send('FF_SET_SETTINGS', { settings: { blockedEnabled: e.target.checked }});
});
$('btn-add-block').addEventListener('click', () => {
  const input = $('blocker-input');
  let val = input.value.trim();
  if (!val) return;
  // sanitize via Storage util if available (shared utils? we have sanitize via background)
  // simple client sanitize before send
  val = val.toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!val.includes('.')) { alert('Enter a valid domain like youtube.com'); return; }
  const next = [...(state.settings.blockedSites||[])];
  if (!next.includes(val)) next.push(val);
  input.value = '';
  state.settings.blockedSites = next;
  renderBlocker();
  send('FF_SET_BLOCKED_SITES', { blockedSites: next });
});
$('blocker-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('btn-add-block').click(); }
});

$('daily-goal').addEventListener('change', (e) => {
  const v = Utils.clamp(Math.round(+e.target.value)||120, 15, 480);
  send('FF_SET_SETTINGS', { settings: { dailyGoalMinutes: v }});
});
$('notif-toggle').addEventListener('change', (e) => {
  send('FF_SET_SETTINGS', { settings: { notificationsEnabled: e.target.checked }});
});

$('btn-reset-stats').addEventListener('click', async () => {
  if (confirm('Delete all focus statistics? This cannot be undone.')) {
    await act('FF_RESET_STATS');
    sessions = [];
    renderDashboard();
    renderGoal();
  }
});

$('btn-export').addEventListener('click', async () => {
  const data = await send('FF_EXPORT_DATA');
  if (!data || !data.sessions) { alert('Nothing to export'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusflow-export-${Utils.toDateKey(new Date())}.json`;
  a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
});
$('btn-import')?.addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!confirm(`Import ${data.sessions?.length||0} sessions? This will replace current history.`)) return;
    await send('FF_IMPORT_DATA', { data });
    sessions = await Storage.getSessions();
    renderDashboard();
    renderGoal();
    alert('Import complete');
  } catch(err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
});

$('btn-home')?.addEventListener('click', () => {
  const url = chrome.runtime.getURL('home.html');
  chrome.tabs.create({ url });
});

 // Space toggles play/pause (unless typing in an input).
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  if (!state.session) return;
  act(state.session.status === 'paused' ? 'FF_RESUME' : 'FF_PAUSE');
});

// ---------------------------------------------------------------------------
// Live updates

setInterval(() => {
  if (state.session && state.session.status === 'running') renderTimer(state.session);
}, 250);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[Storage.KEYS.sessions]) return;
    Storage.getSessions().then((list) => {
      sessions = list;
      if (list.length > 0) state.session = list[list.length - 1];
      renderDashboard();
      renderGoal();
      render();
    });
  });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.target === 'popup' && msg.type === 'FF_STATE') {
    applyState(msg.state);
  }
});

// ---------------------------------------------------------------------------
// Weather widget (Open-Meteo, no key, credible source https://open-meteo.com/en/docs)
async function initWeatherWidget(){
  const container = $('weather-widget');
  if(!container || typeof Weather==='undefined') return;
  async function refresh(){
    const loc = await Weather.getLocation();
    if(!loc){
      Weather.renderWidget(container, null, null, {
        onSearch: async (newLoc)=>{
          // show loading then fetch
          Weather.renderWidget(container, newLoc, null, {onChangeClick: ()=> Weather.clearLocation().then(()=>refresh())});
          try{
            const w = await Weather.fetchWeather(newLoc.latitude, newLoc.longitude);
            Weather.renderWidget(container, newLoc, w, {
              onChangeClick: ()=> Weather.clearLocation().then(()=>refresh()),
              onSearch: async (l)=>{ await Weather.saveLocation(l); refresh(); }
            });
          }catch(e){
            Weather.renderWidget(container, newLoc, {temperature:'--', label:'Unable to load', emoji:'⚠️', wind:'--', humidity:'--', apparent:'--', units:{temperature_2m:'C', wind_speed_10m:''}, time:new Date().toISOString()}, {onChangeClick: ()=> Weather.clearLocation().then(()=>refresh())});
          }
        }
      });
      return;
    }
    Weather.renderWidget(container, loc, null, {onChangeClick: ()=> Weather.clearLocation().then(()=>refresh())});
    try{
      const w = await Weather.fetchWeather(loc.latitude, loc.longitude);
      Weather.renderWidget(container, loc, w, {
        onChangeClick: ()=> Weather.clearLocation().then(()=>refresh()),
        onSearch: async (l)=>{ await Weather.saveLocation(l); refresh(); }
      });
    }catch(e){
      Weather.renderWidget(container, loc, {temperature:'--', label:'Failed to load', emoji:'⚠️', wind:'--', humidity:'--', apparent:'--', units:{temperature_2m:'C', wind_speed_10m:''}, time:new Date().toISOString()}, {onChangeClick: ()=> Weather.clearLocation().then(()=>refresh())});
    }
  }
  await refresh();
  // sync at least every 30 min as required; also real-time check on every open via cache TTL
  setInterval(refresh, 30*60*1000);
  chrome.storage.onChanged.addListener((changes, area)=>{
    if(area==='local' && (changes['ff_weather_location']||changes['ff_weather_cache'])){
      refresh();
    }
  });
}
initWeatherWidget();

// ---------------------------------------------------------------------------
// Init

(async function init() {
  const payload = await send('FF_GET_STATE');
  if (payload) applyState(payload);
  else applyState({
    settings: await Storage.getSettings(),
    session: await Storage.getSession(),
    pomodoro: { cycleCount: 0 },
  });
  sessions = await Storage.getSessions();
  render();
})();
