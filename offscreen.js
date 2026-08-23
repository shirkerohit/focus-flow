'use strict';

// Offscreen document: receives audio commands from the service worker and
// owns actual playback so sound keeps running after the popup closes.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;

  handleCommand(msg)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      console.warn('FocusFlow offscreen command failed', err);
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // async response
});

async function handleCommand(msg) {
  switch (msg.type) {
    case 'FF_PLAY':
      await AudioEngine.play(msg.soundId, msg.volume);
      break;
    case 'FF_STOP':
      AudioEngine.stop(msg.fadeSeconds);
      break;
    case 'FF_SET_VOLUME':
      AudioEngine.setVolume(msg.volume);
      break;
    case 'FF_PING':
      break; // liveness check only
    default:
      throw new Error(`Unknown offscreen command: ${msg.type}`);
  }
}
