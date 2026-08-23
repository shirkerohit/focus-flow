'use strict';

const Utils = {
  DAY_MS: 86400000,

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  },

  pad2(n) {
    return String(n).padStart(2, '0');
  },

  formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Utils.pad2(Math.floor(total / 60))}:${Utils.pad2(total % 60)}`;
  },

  formatDuration(ms) {
    const minutes = Math.max(1, Math.round(ms / 60000));
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  },

  // Short duration like "25m" for badge
  formatBadge(ms) {
    if (ms == null || ms <= 0) return '';
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}:${Utils.pad2(m)}`;
  },

  toDateKey(date) {
    return `${date.getFullYear()}-${Utils.pad2(date.getMonth() + 1)}-${Utils.pad2(date.getDate())}`;
  },

  toTimeKey(date) {
    return `${Utils.pad2(date.getHours())}:${Utils.pad2(date.getMinutes())}`;
  },

  startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  // Monday 00:00 local time of the week containing `date`.
  startOfWeek(date) {
    const d = new Date(Utils.startOfDay(date));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  },

  getStreak(sessions, now = new Date()) {
    // Count consecutive days up to today where any focus session exists (or hits goal if goal supplied)
    if (!sessions.length) return 0;
    const daysWithSession = new Set(sessions.map(s => s.date));
    let streak = 0;
    let cursor = Utils.startOfDay(now);
    // Allow today to be missing; streak counts from yesterday if today empty, but if today has session counts today
    const todayKey = Utils.toDateKey(now);
    const hasToday = daysWithSession.has(todayKey);
    if (!hasToday) cursor -= Utils.DAY_MS; // start counting from yesterday
    while (true) {
      const key = Utils.toDateKey(new Date(cursor));
      if (daysWithSession.has(key)) {
        streak++;
        cursor -= Utils.DAY_MS;
      } else break;
      if (streak > 365) break;
    }
    return streak;
  },

  getGoalStreak(sessions, dailyGoalMs, now = new Date()) {
    if (!dailyGoalMs) return 0;
    const byDay = new Map();
    for (const s of sessions) {
      byDay.set(s.date, (byDay.get(s.date) || 0) + s.durationMs);
    }
    let streak = 0;
    let cursor = Utils.startOfDay(now);
    const todayKey = Utils.toDateKey(now);
    const todayMs = byDay.get(todayKey) || 0;
    if (todayMs < dailyGoalMs) cursor -= Utils.DAY_MS;
    while (true) {
      const key = Utils.toDateKey(new Date(cursor));
      const ms = byDay.get(key) || 0;
      if (ms >= dailyGoalMs) {
        streak++;
        cursor -= Utils.DAY_MS;
      } else break;
      if (streak > 365) break;
    }
    return streak;
  },

  getHostFromUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
  },

  hostMatchesBlocked(host, blockedList) {
    if (!host || !blockedList || !blockedList.length) return null;
    host = host.replace(/^www\./, '').toLowerCase();
    for (const b of blockedList) {
      const clean = b.replace(/^www\./, '').toLowerCase();
      if (host === clean || host.endsWith('.' + clean)) return clean;
    }
    return null;
  },
};
