'use strict';

// Theme manager: light / dark / auto (follows system)
// Stored in chrome.storage.local under ff_theme
// Applies via document.documentElement data-theme attribute, synced across popup/home/background
const Theme = (() => {
  const KEY = 'ff_theme';
  const VALID = ['light', 'dark', 'auto'];

  function apply(theme) {
    const t = VALID.includes(theme) ? theme : 'auto';
    if (t === 'auto') {
      document.documentElement.removeAttribute('data-theme');
      // also remove from body for popup.css that uses :root
      document.body.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
      document.body.setAttribute('data-theme', t);
    }
    // Update toggle icon if exists
    const btn = document.getElementById('btn-theme');
    if (btn) {
      const icon = t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '◐';
      const label = t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'Auto';
      btn.textContent = icon;
      btn.title = `Theme: ${label} (click to switch)`;
      btn.setAttribute('aria-label', `Theme: ${label}`);
    }
  }

  async function get() {
    try {
      const bag = await chrome.storage.local.get(KEY);
      const v = bag[KEY];
      if (VALID.includes(v)) return v;
    } catch {}
    return 'auto';
  }

  async function set(theme) {
    const t = VALID.includes(theme) ? theme : 'auto';
    try {
      await chrome.storage.local.set({ [KEY]: t });
    } catch {}
    apply(t);
  }

  async function cycle() {
    const cur = await get();
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    await set(next);
    return next;
  }

  async function init() {
    const theme = await get();
    apply(theme);
    // Listen for changes from other contexts
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) {
          const v = changes[KEY].newValue;
          apply(VALID.includes(v) ? v : 'auto');
        }
      });
    } catch {}
    // Also listen to system changes when auto
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', async () => {
        const cur = await get();
        if (cur === 'auto') apply('auto');
      });
    } catch {}
    // Wire toggle button if exists
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.addEventListener('click', () => cycle());
    }
  }

  return { init, get, set, cycle, apply };
})();
