'use strict';

const SOUNDS = [
  { id: 'rain', emoji: '🌧', label: 'Rain' },
  { id: 'cafe', emoji: '☕', label: 'Cafe' },
  { id: 'astral', emoji: '🌌', label: 'Astral' },
  { id: 'ocean', emoji: '🌊', label: 'Ocean' },
  { id: 'forest', emoji: '🍃', label: 'Forest' },
];
const SOUND_LABEL = Object.fromEntries(SOUNDS.map(s=>[s.id,s.label]));

let state = {
  settings: { soundId:'rain', volume:60, mode:'focus', minutes:30, task:'', pomodoroEnabled:false, shortBreakMinutes:5, longBreakMinutes:15, longBreakInterval:4, autoStartBreaks:true, autoStartFocus:false, blockedSites:[], blockedEnabled:true, dailyGoalMinutes:120, notificationsEnabled:true },
  session:null, pomodoro:{cycleCount:0}
};
let sessions = [];

const $ = id=>document.getElementById(id);
if (typeof Theme !== 'undefined') Theme.init();

function send(type, extra={}){
  return new Promise(resolve=>{
    try{ chrome.runtime.sendMessage({target:'background', type, ...extra}, res=>{ void chrome.runtime.lastError; resolve(res||null); }); } catch{ resolve(null); }
  });
}
async function act(type, extra){ const r=await send(type,extra); if(r) applyState(r); }
function applyState(next){
  if(!next||next.exportedAt) return;
  state = next;
  if(!state.pomodoro) state.pomodoro={cycleCount:0};
  render();
}

// Build visualizer bars once
(function buildVis(){
  const v=$('visualizer');
  for(let i=0;i<20;i++){
    const b=document.createElement('div');
    b.className='bar';
    b.style.animationDelay=(i*0.07)+'s';
    b.style.animationDuration=(0.5+Math.random()*0.4)+'s';
    v.appendChild(b);
  }
})();

function isPlaying(){ return !!state.session && state.session.status==='running'; }
function remainingMs(){
  const s=state.session; if(!s) return null;
  if(s.kind==='always') return null;
  if(s.status==='paused') return Math.max(0, s.plannedMs - s.elapsedMs);
  return Math.max(0, s.endsAt - Date.now());
}

function render(){
  renderStatus();
  renderSounds();
  renderVolume();
  renderHero();
  renderProgress();
  renderBlocker();
  renderPomodoroDetail();
  syncSettings();
}

function renderStatus(){
  const pill=$('status-pill');
  pill.classList.toggle('playing', isPlaying());
  const s=state.session;
  $('status-text').textContent = !s ? 'Idle' : s.status==='paused'?'Paused' : s.kind==='always'?'Always On' : s.kind==='break' ? (s.breakType==='long'?'Long Break':'Short Break') : 'Focusing';
  const vis=$('visualizer');
  vis.classList.toggle('playing', isPlaying());
  vis.classList.toggle('paused', !!s && s.status==='paused');
}

function renderSounds(){
  const g=$('sound-grid'); g.textContent='';
  for(const sound of SOUNDS){
    const btn=document.createElement('button');
    btn.className='sound-btn'+(sound.id===state.settings.soundId?' selected':'');
    const e=document.createElement('span'); e.className='sound-emoji'; e.textContent=sound.emoji;
    const n=document.createElement('span'); n.className='sound-name'; n.textContent=sound.label;
    btn.append(e,n);
    btn.addEventListener('click', ()=>{ state.settings.soundId=sound.id; renderSounds(); send('FF_SET_SOUND',{soundId:sound.id}); });
    g.appendChild(btn);
  }
}
function renderVolume(){
  const s=$('volume-slider'); s.value=state.settings.volume;
  s.style.setProperty('--fill', state.settings.volume+'%');
  $('volume-value').textContent=state.settings.volume+'%';
  $('minutes-input').value=state.settings.minutes;
  $('task-input').value=state.settings.task||'';
  $('pomodoro-toggle').checked=!!state.settings.pomodoroEnabled;
  // mode toggle
  const mode = state.settings.mode || 'focus';
  const focusBtn = $('mode-focus'), alwaysBtn=$('mode-always');
  if(focusBtn && alwaysBtn){
    focusBtn.classList.toggle('active', mode==='focus');
    alwaysBtn.classList.toggle('active', mode==='always');
  }
  // hide minutes/pomodoro when Always On
  const minutesLabel = $('minutes-input')?.closest('label');
  const pomCheck = $('pomodoro-toggle')?.closest('label');
  if(minutesLabel) minutesLabel.style.display = mode==='always' ? 'none' : '';
  if(pomCheck) pomCheck.style.display = mode==='always' ? 'none' : '';
  const detail=$('pomodoro-detail');
  if(detail && mode==='always') detail.classList.add('hidden');
}
function renderPomodoroDetail(){
  const enabled = !!state.settings.pomodoroEnabled;
  const detail = $('pomodoro-detail');
  if(detail) detail.classList.toggle('hidden', !enabled);
  if(enabled){
    const sb=$('short-break'), lb=$('long-break'), li=$('long-interval'), ab=$('auto-breaks'), af=$('auto-focus');
    if(sb) sb.value = state.settings.shortBreakMinutes;
    if(lb) lb.value = state.settings.longBreakMinutes;
    if(li) li.value = state.settings.longBreakInterval;
    if(ab) ab.checked = !!state.settings.autoStartBreaks;
    if(af) af.checked = !!state.settings.autoStartFocus;
  }
}
function renderBlocker(){
  const list=$('blocker-list');
  if(!list) return;
  list.textContent='';
  const sites = state.settings.blockedSites || [];
  for(const site of sites){
    const chip=document.createElement('span');
    chip.className='blocker-chip';
    chip.textContent=site;
    const btn=document.createElement('button');
    btn.textContent='×';
    btn.title='Remove';
    btn.addEventListener('click', async()=>{
      const filtered = sites.filter(s=>s!==site);
      state.settings.blockedSites = filtered;
      renderBlocker();
      send('FF_SET_BLOCKED_SITES', {blockedSites: filtered});
    });
    chip.appendChild(btn);
    list.appendChild(chip);
  }
  const en=$('blocker-enabled');
  if(en) en.checked = state.settings.blockedEnabled !== false;
}
function syncSettings(){
  const dg=$('daily-goal');
  if(dg && document.activeElement!==dg) dg.value = state.settings.dailyGoalMinutes;
  const nt=$('notif-toggle');
  if(nt && document.activeElement!==nt) nt.checked = state.settings.notificationsEnabled !== false;
}

function renderHero(){
  const s=state.session;
  const timeEl=$('time-hero'), labelEl=$('label-hero'), taskEl=$('task-hero'), cycleEl=$('cycle-hero');
  const startBtn=$('btn-start'), pauseBtn=$('btn-pause'), stopBtn=$('btn-stop');
  if(!s){
    taskEl.textContent = state.settings.task ? `🎯 Next: ${state.settings.task}` : '';
    timeEl.textContent = 'Ready to focus';
    labelEl.textContent = state.settings.pomodoroEnabled ? `Pomodoro • ${state.settings.minutes}m focus` : `${state.settings.minutes} min focus`;
    cycleEl.textContent = '';
    startBtn.classList.remove('hidden'); pauseBtn.classList.add('hidden'); stopBtn.classList.add('hidden');
    startBtn.textContent = state.settings.mode==='always' ? 'Start Always On' : 'Start Focus';
    return;
  }
  taskEl.textContent = s.task ? `🎯 ${s.task}` : (s.kind==='break'?'Break — breathe':'');
  if(s.kind==='always'){
    timeEl.textContent='∞'; labelEl.textContent=s.status==='paused'?'paused':'always playing';
  } else if(s.kind==='break'){
    timeEl.textContent=Utils.formatClock(remainingMs()); labelEl.textContent=s.breakType==='long'?'long break':'short break';
  } else {
    timeEl.textContent=Utils.formatClock(remainingMs()); labelEl.textContent=s.status==='paused'?'paused':'remaining';
  }
  if(s.kind==='focus' && state.settings.pomodoroEnabled){
    const c=s.cycleCount||state.pomodoro.cycleCount||0;
    cycleEl.textContent = `Focus ${c+1} of ${state.settings.longBreakInterval} • ${c} done`;
  } else if(s.kind==='break' && state.settings.pomodoroEnabled){
    cycleEl.textContent = s.breakType==='long' ? `Long break after ${s.cycleCount} sessions` : `Break ${s.cycleCount}/${state.settings.longBreakInterval}`;
  } else cycleEl.textContent='';

  startBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden'); stopBtn.classList.remove('hidden');
  pauseBtn.textContent = s.status==='paused' ? 'Resume' : 'Pause';
}

function renderProgress(){
  const summary=Stats.summarize(sessions);
  const goalMin=state.settings.dailyGoalMinutes||120;
  const goalMs=goalMin*60000;
  const pct=goalMs>0?Math.min(100,Math.round(summary.todayMs/goalMs*100)):0;
  $('goal-fill').style.width=pct+'%';
  $('goal-text').textContent=`${Math.round(summary.todayMs/60000)} / ${goalMin} min`;
  $('goal-pct').textContent=pct+'%';
  $('goal-hero').textContent=`${Math.round(summary.todayMs/60000)}/${goalMin} min today`;
  const ins=Stats.insights(sessions, goalMin);
  $('streak-hero').textContent = ins.streak ? `🔥 ${ins.streak}d streak` : 'no streak yet';

  // chart
  const chart=$('chart'); chart.textContent='';
  const max=Math.max(...summary.days.map(d=>d.ms),1);
  for(const day of summary.days){
    const col=document.createElement('div'); col.className='bar-col';
    const bar=document.createElement('div'); bar.className='bar-fill'+(day.ms===0?' empty':'')+(day.isToday?' today':'');
    bar.style.height= day.ms===0 ? '3px' : Math.max(8, (day.ms/max)*100)+'%';
    bar.title=day.label+': '+Utils.formatDuration(day.ms);
    const lab=document.createElement('span'); lab.className='bar-label'; lab.textContent=day.label.slice(0,2);
    col.append(bar,lab); chart.appendChild(col);
  }
  // recent
  const list=$('recent-list'); list.textContent='';
  const todayKey=Utils.toDateKey(new Date());
  const recent=summary.recent;
  if(!recent.length){ const li=document.createElement('li'); li.textContent='No sessions yet'; li.style.justifyContent='center'; list.appendChild(li); }
  else for(const r of recent){
    const li=document.createElement('li');
    const a=document.createElement('span'); a.className='session-sound';
    a.textContent=`${Utils.formatDuration(r.durationMs)} • ${SOUND_LABEL[r.soundId]||r.soundId}${r.task?' • '+r.task:''}`;
    const b=document.createElement('span'); b.className='session-when';
    b.textContent= r.date===todayKey ? `Today ${r.startTime}` : new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    li.append(a,b); list.appendChild(li);
  }
}

// Events
$('volume-slider').addEventListener('input', e=>{
  const v=Number(e.target.value); state.settings.volume=v; e.target.style.setProperty('--fill', v+'%'); $('volume-value').textContent=v+'%';
  send('FF_SET_VOLUME',{volume:v});
});
$('task-input').addEventListener('change', e=>{ send('FF_SET_TASK',{task:e.target.value.slice(0,120)}); });
$('minutes-input').addEventListener('change', e=>{ const m=Utils.clamp(Math.round(+e.target.value)||30,1,480); send('FF_SET_MINUTES',{minutes:m}); });
$('pomodoro-toggle').addEventListener('change', e=>{ send('FF_SET_SETTINGS',{settings:{pomodoroEnabled:e.target.checked}}).then(r=>{ if(r) applyState(r); }); });
['short-break','long-break','long-interval'].forEach(id=>{
  const el=$(id);
  if(el) el.addEventListener('change', ()=>{
    send('FF_SET_SETTINGS',{settings:{
      shortBreakMinutes: Number($('short-break').value),
      longBreakMinutes: Number($('long-break').value),
      longBreakInterval: Number($('long-interval').value),
    }});
  });
});
const ab = $('auto-breaks'); if(ab) ab.addEventListener('change', e=>{ send('FF_SET_SETTINGS',{settings:{autoStartBreaks:e.target.checked}}); });
const af = $('auto-focus'); if(af) af.addEventListener('change', e=>{ send('FF_SET_SETTINGS',{settings:{autoStartFocus:e.target.checked}}); });
const mf=$('mode-focus'); if(mf) mf.addEventListener('click', ()=>{
  state.settings.mode='focus'; renderVolume(); send('FF_SET_MODE',{mode:'focus'});
});
const ma=$('mode-always'); if(ma) ma.addEventListener('click', ()=>{
  state.settings.mode='always'; renderVolume(); send('FF_SET_MODE',{mode:'always'});
});
const be=$('blocker-enabled'); if(be) be.addEventListener('change', e=>{ send('FF_SET_SETTINGS',{settings:{blockedEnabled:e.target.checked}}); });
const btnAdd=$('btn-add-block'); if(btnAdd) btnAdd.addEventListener('click', ()=>{
  const input=$('blocker-input'); let val=input.value.trim(); if(!val) return;
  val=val.toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if(!val.includes('.')){ alert('Enter a valid domain like youtube.com'); return; }
  const next=[...(state.settings.blockedSites||[])];
  if(!next.includes(val)) next.push(val);
  input.value=''; state.settings.blockedSites=next; renderBlocker(); send('FF_SET_BLOCKED_SITES',{blockedSites: next});
});
const bi=$('blocker-input'); if(bi) bi.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); $('btn-add-block').click(); } });
const dg=$('daily-goal'); if(dg) dg.addEventListener('change', e=>{ const v=Utils.clamp(Math.round(+e.target.value)||120,15,480); send('FF_SET_SETTINGS',{settings:{dailyGoalMinutes:v}}); });
const nt=$('notif-toggle'); if(nt) nt.addEventListener('change', e=>{ send('FF_SET_SETTINGS',{settings:{notificationsEnabled:e.target.checked}}); });
const bex=$('btn-export'); if(bex) bex.addEventListener('click', async()=>{
  const data=await send('FF_EXPORT_DATA'); if(!data||!data.sessions){ alert('Nothing to export'); return; }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`focusflow-export-${Utils.toDateKey(new Date())}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
const impBtn=$('btn-import'); if(impBtn) impBtn.addEventListener('click', ()=> $('import-file').click());
const imp=$('import-file'); if(imp) imp.addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(!confirm(`Import ${data.sessions?.length||0} sessions? This will replace current history.`)) return;
    await send('FF_IMPORT_DATA',{data}); sessions=await Storage.getSessions(); renderProgress();
    alert('Import complete');
  }catch(err){ alert('Import failed: '+err.message); }
  e.target.value='';
});
const br=$('btn-reset'); if(br) br.addEventListener('click', async()=>{
  if(confirm('Delete all focus statistics? This cannot be undone.')){
    const r=await send('FF_RESET_STATS'); if(r) applyState(r);
    sessions=[]; renderProgress();
  }
});

$('btn-start').addEventListener('click', ()=>{
  const task=$('task-input').value.slice(0,120);
  const mins=Utils.clamp(Math.round(+$('minutes-input').value)||state.settings.minutes,1,480);
  if(state.settings.mode==='always') act('FF_START_ALWAYS');
  else act('FF_START_FOCUS',{minutes:mins, task});
});
$('btn-pause').addEventListener('click', ()=>{ act(state.session?.status==='paused'?'FF_RESUME':'FF_PAUSE'); });
$('btn-stop').addEventListener('click', ()=> act('FF_STOP'));
$('btn-close').addEventListener('click', ()=> window.close());

setInterval(()=>{ if(state.session && state.session.status==='running') renderHero(); }, 250);

chrome.storage.onChanged.addListener((c,a)=>{ if(a==='local'&&c[Storage.KEYS.sessions]) Storage.getSessions().then(l=>{ sessions=l; renderProgress(); }); });
chrome.runtime.onMessage.addListener(msg=>{ if(msg && msg.target==='popup' && msg.type==='FF_STATE') applyState(msg.state); });

// Weather widget (Open-Meteo, credible, no key)
async function initWeatherWidget(){
  const container = $('weather-widget');
  if(!container || typeof Weather==='undefined') return;
  async function refresh(){
    const loc = await Weather.getLocation();
    if(!loc){
      Weather.renderWidget(container, null, null, {
        onSearch: async (newLoc)=>{
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

(async function init(){
  const p=await send('FF_GET_STATE');
  if(p) applyState(p);
  else applyState({settings:await Storage.getSettings(), session:await Storage.getSession(), pomodoro:{cycleCount:0}});
  sessions=await Storage.getSessions();
  render();
})();
