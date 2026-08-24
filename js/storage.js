'use strict';

const SoundList = ['cafe', 'rain', 'astral', 'ocean', 'forest'];

const DEFAULT_BLOCKED_SITES = [
  'youtube.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'reddit.com',
  'tiktok.com',
  'facebook.com',
  'netflix.com',
];

// All persistence goes through this module. Every read is validated so that
// corrupted or unexpected storage values degrade gracefully to defaults.
const Storage = (() => {
  const KEYS = {
    settings: 'ff_settings',
    session: 'ff_session',
    sessions: 'ff_sessions',
    blockedBypass: 'ff_blocked_bypass',
  };

  const DEFAULT_SETTINGS = Object.freeze({
    soundId: 'rain',
    volume: 60,
    mode: 'focus',
    minutes: 30,
    task: '',
    pomodoroEnabled: false,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    blockedSites: [...DEFAULT_BLOCKED_SITES],
    blockedEnabled: true,
    dailyGoalMinutes: 120,
    notificationsEnabled: true,
  });

  function validSettings(v) {
    return !!v && typeof v === 'object' &&
      SoundList.includes(v.soundId) &&
      Number.isFinite(+v.volume) &&
      ['focus', 'always'].includes(v.mode);
  }

  function validSession(v) {
    return !!v && typeof v === 'object' &&
      ['focus', 'always', 'break'].includes(v.kind) &&
      SoundList.includes(v.soundId) &&
      ['running', 'paused'].includes(v.status) &&
      Number.isFinite(v.startedAt) &&
      Number.isFinite(v.elapsedMs) &&
      Number.isFinite(v.segmentStart);
  }

  function validRecord(r) {
    return !!r && typeof r === 'object' &&
      typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      Number.isFinite(r.durationMs);
  }

  function sanitizeBlockedSites(arr) {
    if (!Array.isArray(arr)) return [...DEFAULT_BLOCKED_SITES];
    const out = [];
    for (const raw of arr) {
      if (typeof raw !== 'string') continue;
      let s = raw.trim().toLowerCase();
      if (!s) continue;
      // allow users to paste full URLs; extract hostname
      try {
        if (s.includes('://')) s = new URL(s).hostname;
      } catch {}
      s = s.replace(/^www\./, '').replace(/\/.*$/, '');
      if (s.length < 2 || s.length > 253) continue;
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) continue;
      if (!out.includes(s)) out.push(s);
      if (out.length >= 50) break;
    }
    return out.length ? out : [...DEFAULT_BLOCKED_SITES];
  }

  async function rawGet(key) {
    try {
      const bag = await chrome.storage.local.get(key);
      return bag[key];
    } catch (err) {
      console.warn('FocusFlow: failed to read storage key', key, err);
      return undefined;
    }
  }

  async function rawSet(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (err) {
      console.warn('FocusFlow: failed to write storage key', key, err);
    }
  }

  function sanitizeSettings(s) {
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      volume: Utils.clamp(Math.round(+s.volume), 0, 100),
      minutes: Utils.clamp(Math.round(+s.minutes || DEFAULT_SETTINGS.minutes), 1, 480),
      task: typeof s.task === 'string' ? s.task.slice(0, 120) : '',
      pomodoroEnabled: !!s.pomodoroEnabled,
      shortBreakMinutes: Utils.clamp(Math.round(+s.shortBreakMinutes || 5), 1, 30),
      longBreakMinutes: Utils.clamp(Math.round(+s.longBreakMinutes || 15), 1, 60),
      longBreakInterval: Utils.clamp(Math.round(+s.longBreakInterval || 4), 2, 8),
      autoStartBreaks: s.autoStartBreaks !== false,
      autoStartFocus: !!s.autoStartFocus,
      blockedSites: sanitizeBlockedSites(s.blockedSites),
      blockedEnabled: s.blockedEnabled !== false,
      dailyGoalMinutes: Utils.clamp(Math.round(+s.dailyGoalMinutes || 120), 15, 480),
      notificationsEnabled: s.notificationsEnabled !== false,
    };
  }

  return {
    KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_BLOCKED_SITES,

    async getSettings() {
      const v = await rawGet(KEYS.settings);
      if (!validSettings(v)) {
        // Even if invalid, try to merge known good fields from v
        if (v && typeof v === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...v };
          return sanitizeSettings(merged);
        }
        return { ...DEFAULT_SETTINGS };
      }
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...v });
    },

    saveSettings(settings) {
      return rawSet(KEYS.settings, sanitizeSettings(settings));
    },

    async getSession() {
      const v = await rawGet(KEYS.session);
      if (!validSession(v)) return null;
      return {
        ...v,
        endsAt: Number.isFinite(v.endsAt) ? v.endsAt : null,
        // sanitize optional fields
        task: typeof v.task === 'string' ? v.task.slice(0, 120) : '',
        cycleCount: Number.isFinite(v.cycleCount) ? v.cycleCount : 0,
        breakType: ['short', 'long'].includes(v.breakType) ? v.breakType : null,
        // legacy: ensure duration correct
      };
    },

    saveSession(session) {
      return rawSet(KEYS.session, session);
    },

    clearSession() {
      return new Promise((resolve) => chrome.storage.local.remove(KEYS.session, () => resolve()));
    },

    async getSessions() {
      const v = await rawGet(KEYS.sessions);
      return Array.isArray(v) ? v.filter(validRecord) : [];
    },

    async saveSessions(list) {
      await rawSet(KEYS.sessions, list.slice(0, 1000));
    },

    async getBlockedBypasses() {
      const v = await rawGet(KEYS.blockedBypass);
      if (!v || typeof v !== 'object') return {};
      // Backward compat: old single-object format {host, expiresAt}
      if (Number.isFinite(v.expiresAt) && typeof v.host === 'string') {
        const m = {}; m[v.host.toLowerCase()] = v.expiresAt; return m;
      }
      // New map format {host: expiresAt}
      const out = {};
      for (const [k, exp] of Object.entries(v)) {
        if (typeof k !== 'string') continue;
        if (!Number.isFinite(exp)) continue;
        if (exp <= Date.now() - 24*3600000) continue; // drop very old
        out[k.toLowerCase()] = exp;
      }
      return out;
    },
    async saveBlockedBypass(host, expiresAt) {
      const map = await Storage.getBlockedBypasses();
      map[host.toLowerCase()] = expiresAt;
      // prune expired
      const now = Date.now();
      for (const h of Object.keys(map)) if (map[h] <= now) delete map[h];
      // keep at most 30 hosts
      const keys = Object.keys(map);
      if (keys.length > 30) {
        // remove oldest
        keys.sort((a,b)=> map[a]-map[b]);
        for (let i=0;i<keys.length-30;i++) delete map[keys[i]];
      }
      return rawSet(KEYS.blockedBypass, map);
    },
    async clearBlockedBypass(host) {
      if (host) {
        const map = await Storage.getBlockedBypasses();
        delete map[host.toLowerCase()];
        if (Object.keys(map).length === 0) return new Promise((r) => chrome.storage.local.remove(KEYS.blockedBypass, () => r()));
        return rawSet(KEYS.blockedBypass, map);
      }
      return new Promise((r) => chrome.storage.local.remove(KEYS.blockedBypass, () => r()));
    },
    // legacy compat
    async getBlockedBypass() {
      const map = await Storage.getBlockedBypasses();
      const hosts = Object.keys(map);
      if (!hosts.length) return null;
      // return first entry for compat (not used directly anymore)
      const h = hosts[0];
      return {host: h, expiresAt: map[h]};
    },
    saveBlockedBypassLegacy(obj) { return Storage.saveBlockedBypass(obj.host, obj.expiresAt); },

    sanitizeBlockedSites,
  };
})();
