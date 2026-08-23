'use strict';

// Recording and aggregation of Focus Session statistics.
// Always On and Break playback are intentionally never recorded here.
const Stats = {
  MIN_RECORD_MS: 1000,

  async record(session) {
    if (session.kind !== 'focus') return;
    if (session.elapsedMs < Stats.MIN_RECORD_MS) return;

    const endedAt = Date.now();
    const startedAt = endedAt - session.elapsedMs;
    const start = new Date(startedAt);

    const list = await Storage.getSessions();
    list.unshift({
      date: Utils.toDateKey(start),
      startTime: Utils.toTimeKey(start),
      endTime: Utils.toTimeKey(new Date(endedAt)),
      durationMs: session.elapsedMs,
      durationMinutes: Math.round((session.elapsedMs / 60000) * 10) / 10,
      soundId: session.soundId,
      task: typeof session.task === 'string' ? session.task.slice(0, 120) : '',
    });
    await Storage.saveSessions(list);
  },

  summarize(sessions, now = new Date()) {
    const todayStart = Utils.startOfDay(now);
    const weekStart = Utils.startOfWeek(now);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = todayStart - i * Utils.DAY_MS;
      days.push({
        start,
        label: new Date(start).toLocaleDateString(undefined, { weekday: 'short' }),
        ms: 0,
        isToday: i === 0,
      });
    }
    const byStart = new Map(days.map((d) => [d.start, d]));

    let todayMs = 0;
    let weekMs = 0;
    for (const s of sessions) {
      const dayStart = Utils.startOfDay(new Date(`${s.date}T00:00:00`));
      if (dayStart >= weekStart) weekMs += s.durationMs;
      if (dayStart >= todayStart) todayMs += s.durationMs;
      const bucket = byStart.get(dayStart);
      if (bucket) bucket.ms += s.durationMs;
    }

    return {
      todayMs,
      weekMs,
      days,
      recent: sessions.slice(0, 5),
    };
  },

  // Extended insights for the dashboard
  insights(sessions, dailyGoalMinutes, now = new Date()) {
    const summary = Stats.summarize(sessions, now);
    const dailyGoalMs = (dailyGoalMinutes || 120) * 60000;
    const goalProgress = dailyGoalMs > 0 ? Math.min(1, summary.todayMs / dailyGoalMs) : 0;
    const streak = Utils.getStreak(sessions, now);
    const goalStreak = Utils.getGoalStreak(sessions, dailyGoalMs, now);
    const totalMs = sessions.reduce((a, s) => a + s.durationMs, 0);
    const avgMs = sessions.length ? Math.round(totalMs / sessions.length) : 0;
    // Best day in last 30d
    const byDay = new Map();
    for (const s of sessions) byDay.set(s.date, (byDay.get(s.date) || 0) + s.durationMs);
    let bestDay = null, bestMs = 0;
    for (const [date, ms] of byDay) if (ms > bestMs) { bestMs = ms; bestDay = date; }

    // Focus score this week (sessions vs daily goal *7)
    const weekGoal = dailyGoalMs * 7;
    const weekProgress = weekGoal > 0 ? Math.min(1, summary.weekMs / weekGoal) : 0;

    return {
      ...summary,
      dailyGoalMs,
      goalProgress,
      streak,
      goalStreak,
      totalMs,
      avgMs,
      count: sessions.length,
      bestDay,
      bestMs,
      weekProgress,
    };
  },
};
