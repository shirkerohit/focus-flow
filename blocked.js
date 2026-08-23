'use strict';

const params = new URLSearchParams(location.search);
const host = params.get('host') || 'this site';
const originalUrl = params.get('url') || '';
const remain = params.get('remain') || '';
document.getElementById('host').textContent = host;
if (originalUrl) document.getElementById('url-preview').textContent = originalUrl;
if (remain) document.getElementById('remain').textContent = remain + ' remaining';

function safeSend(msg) {
  return new Promise((resolve) => {
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) { resolve(null); return; }
      chrome.runtime.sendMessage(msg, (res) => {
        void chrome.runtime.lastError;
        resolve(res);
      });
    } catch (e) { resolve(null); }
    setTimeout(() => resolve(null), 1200);
  });
}

document.getElementById('btn-back').addEventListener('click', () => {
  const btn = document.getElementById('btn-back');
  btn.textContent = 'Going back…';
  btn.disabled = true;
  // For extension blocked page, history is unreliable — go directly to blank (user can use browser back)
  setTimeout(()=>{ try{ location.href='about:blank'; }catch{ try{ window.close(); }catch{} } }, 100);
  setTimeout(() => { btn.textContent = '← Go back'; btn.disabled=false; }, 1200);
});

document.getElementById('btn-allow').addEventListener('click', async () => {
  const btn = document.getElementById('btn-allow');
  const orig = btn.textContent;
  btn.textContent = 'Allowing…';
  btn.disabled = true;
  await safeSend({ target: 'background', type: 'FF_ALLOW_ONCE', host });
  setTimeout(()=>{
    if (originalUrl) location.href = originalUrl;
    else location.href='about:blank';
  }, 200);
  setTimeout(()=>{ btn.textContent=orig; btn.disabled=false; }, 1500);
});

document.getElementById('btn-disable').addEventListener('click', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-disable');
  if (!confirm(`Allow ${host} for the rest of this focus session?`)) { btn.disabled=false; return; }
  const orig = btn.textContent;
  btn.textContent = 'Disabling…';
  btn.disabled = true;
  await safeSend({ target: 'background', type: 'FF_DISABLE_SITE_FOR_SESSION', host });
  setTimeout(()=>{
    if (originalUrl) location.href = originalUrl;
    else location.href='about:blank';
  }, 200);
  setTimeout(()=>{ btn.textContent=orig; btn.disabled=false; }, 1500);
});

document.getElementById('btn-home').addEventListener('click', (e) => {
  e.preventDefault();
  const homeUrl = chrome.runtime.getURL('home.html');
  try { location.href = homeUrl; } catch { window.open(homeUrl, '_blank'); }
});

async function refreshRemain(){
  try {
    const state = await safeSend({ target: 'background', type: 'FF_GET_STATE' });
    if (state && state.session && state.session.endsAt) {
      const ms = Math.max(0, state.session.endsAt - Date.now());
      const m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
      document.getElementById('remain').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} remaining`;
    } else if (state && !state.session) {
      document.getElementById('remain').textContent = 'Focus session ended — you are free to browse';
      document.getElementById('remain').style.background='rgba(46,125,50,.12)';
      document.getElementById('remain').style.color='#2e7d32';
    }
  } catch {}
}
setInterval(refreshRemain, 1000);
refreshRemain();
