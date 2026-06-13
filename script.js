'use strict';

const CFG = {
  apiUrl: 'http://127.0.0.1:17377/stats',
  updateMs: 1000,
  localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  localLabel: 'LOCAL TIME',
  worldClock1Zone: 'America/New_York',
  worldClock1Label: 'NEW YORK, USA',
  worldClock2Zone: 'Asia/Tokyo',
  worldClock2Label: 'TOKYO, JAPAN',
  demoMode: false,
  showApiPanel: true,
  panelOpacity: .78,
  uiScale: 1,
  clockScale: 1,
  weatherLocationName: 'HAMBURG',
  weatherLatitude: 53.5511,
  weatherLongitude: 9.9937,
  weatherUpdateMinutes: 10
};

const histories = { cpu: Array(60).fill(0), gpu: Array(60).fill(0) };
const weatherState = { lastAt: 0, data: null, loading: false };
const $ = (id) => document.getElementById(id);
const clamp = (n, min=0, max=100) => Math.min(max, Math.max(min, Number.isFinite(+n) ? +n : 0));
const gb = (v) => (Number.isFinite(+v) ? (+v).toFixed(1) : '--');

function setRootVar(name, value){ document.documentElement.style.setProperty(name, value); }
function pushHistory(key, value){ histories[key].push(clamp(value)); histories[key].shift(); }

function drawLine(canvas, data){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(2, Math.floor(rect.width * dpr));
  canvas.height = Math.max(2, Math.floor(rect.height * dpr));
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  c.clearRect(0,0,w,h);
  c.strokeStyle = 'rgba(255,255,255,.17)'; c.lineWidth = 1;
  for(let i=0;i<=4;i++){ const y = h * i / 4; c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,.88)'; c.lineWidth = 1.8;
  c.beginPath();
  data.forEach((v,i)=>{ const x = i*(w/(data.length-1)); const y = h - (clamp(v)/100*h); i ? c.lineTo(x,y) : c.moveTo(x,y); });
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,.65)'; c.font = '10px Rajdhani, sans-serif'; c.textAlign='right';
  ['100','75','50','25','0'].forEach((t,i)=>c.fillText(t,w-2,9+i*(h-10)/4));
}

function buildSegments(el, pct, count = 44){
  if(!el.dataset.ready || +el.dataset.count !== count){
    el.innerHTML = ''; for(let i=0;i<count;i++) el.appendChild(document.createElement('i'));
    el.dataset.ready = '1'; el.dataset.count = count;
  }
  const on = Math.round(clamp(pct)/100*count);
  [...el.children].forEach((seg,i)=>seg.classList.toggle('on', i < on));
}

function drawAnalog(canvas, date){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(2, Math.floor(rect.width * dpr));
  canvas.height = Math.max(2, Math.floor(rect.height * dpr));
  const c = canvas.getContext('2d'); c.scale(dpr,dpr);
  const w = rect.width, h = rect.height, r = Math.min(w,h)/2 - 3, cx=w/2, cy=h/2;
  c.clearRect(0,0,w,h); c.strokeStyle='rgba(255,255,255,.45)'; c.lineWidth=1; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke();
  for(let i=0;i<60;i++){ const a=i/60*Math.PI*2-Math.PI/2; const len=i%5?3:7; c.beginPath(); c.moveTo(cx+Math.cos(a)*(r-len),cy+Math.sin(a)*(r-len)); c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); c.stroke(); }
  const hr = date.getHours()%12, mn=date.getMinutes(), sc=date.getSeconds();
  const hand=(ang,len,width)=>{ c.strokeStyle='rgba(255,255,255,.92)'; c.lineWidth=width; c.beginPath(); c.moveTo(cx,cy); c.lineTo(cx+Math.cos(ang)*len,cy+Math.sin(ang)*len); c.stroke(); };
  hand(((hr+mn/60)/12)*Math.PI*2-Math.PI/2,r*.48,2.4); hand(((mn+sc/60)/60)*Math.PI*2-Math.PI/2,r*.70,1.7); hand((sc/60)*Math.PI*2-Math.PI/2,r*.78,.8);
}

function fmtDate(date, tz){
  return new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(date).toUpperCase();
}
function fmtTime(date, tz){
  return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
}
function zonedDate(date, tz){
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}
function tzOffsetLabel(tz){
  try{
    const text = new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'shortOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value || '';
    return text.replace('GMT','UTC');
  }catch{ return tz; }
}

function coordText(lat, lon){
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(Number(lat)).toFixed(4)}° ${ns}, ${Math.abs(Number(lon)).toFixed(4)}° ${ew}`;
}

function weatherPresentation(code){
  const map = {
    0:['CLEAR SKY','☼',''],1:['MAINLY CLEAR','⛅',''],2:['PARTLY CLOUDY','☁︎',''],3:['OVERCAST','☁︎',''],
    45:['FOG','〰',''],48:['RIME FOG','〰',''],51:['LIGHT DRIZZLE','☁︎','///'],53:['DRIZZLE','☁︎','///'],55:['DENSE DRIZZLE','☁︎','////'],
    56:['FREEZING DRIZZLE','☁︎','///'],57:['HEAVY FREEZING DRIZZLE','☁︎','////'],61:['LIGHT RAIN','☁︎','///'],63:['RAIN','☁︎','////'],65:['HEAVY RAIN','☁︎','/////'],
    66:['FREEZING RAIN','☁︎','///'],67:['HEAVY FREEZING RAIN','☁︎','////'],71:['LIGHT SNOW','❄','*'],73:['SNOW','❄','**'],75:['HEAVY SNOW','❄','***'],
    77:['SNOW GRAINS','❄','*'],80:['RAIN SHOWERS','☁︎','///'],81:['HEAVY SHOWERS','☁︎','////'],82:['VIOLENT SHOWERS','☁︎','/////'],
    85:['SNOW SHOWERS','❄','**'],86:['HEAVY SNOW SHOWERS','❄','***'],95:['THUNDERSTORM','⚡','///'],96:['THUNDER HAIL','⚡','///'],97:['HEAVY THUNDER HAIL','⚡','////']
  };
  return map[code] || ['WEATHER','☁︎',''];
}

async function fetchWeather(){
  const now = Date.now();
  const refreshMs = Math.max(1, Number(CFG.weatherUpdateMinutes) || 10) * 60 * 1000;
  if (weatherState.loading) return weatherState.data;
  if (weatherState.data && now - weatherState.lastAt < refreshMs) return weatherState.data;
  weatherState.loading = true;
  try{
    const lat = Number(CFG.weatherLatitude), lon = Number(CFG.weatherLongitude);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    const json = await res.json();
    const current = json.current || {}, daily = json.daily || {};
    weatherState.data = {
      locationName: CFG.weatherLocationName,
      latitude: lat,
      longitude: lon,
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      pressure: current.pressure_msl,
      weatherCode: current.weather_code,
      tempMax: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
      tempMin: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null
    };
    weatherState.lastAt = Date.now();
    return weatherState.data;
  }catch(err){
    if(weatherState.data) return weatherState.data;
    return {
      locationName: CFG.weatherLocationName,
      latitude: Number(CFG.weatherLatitude),
      longitude: Number(CFG.weatherLongitude),
      temperature: null, humidity: null, wind: null, pressure: null,
      weatherCode: 3, tempMax: null, tempMin: null, error: err.message
    };
  }finally{ weatherState.loading = false; }
}

function updateWeatherUI(w){
  if(!w) return;
  const [label, icon, slashes] = weatherPresentation(w.weatherCode);
  $('weather-condition').textContent = label;
  $('weather-temp').textContent = Number.isFinite(+w.temperature) ? `${Math.round(w.temperature)}°C` : '--°C';
  $('weather-range').textContent = `↟ ${Number.isFinite(+w.tempMax) ? Math.round(w.tempMax) : '--'}°C   ↡ ${Number.isFinite(+w.tempMin) ? Math.round(w.tempMin) : '--'}°C`;
  $('city-title').textContent = (w.locationName || CFG.weatherLocationName || 'LOCATION').toUpperCase();
  $('city-coords').textContent = coordText(Number(w.latitude), Number(w.longitude));
  $('weather-humidity').textContent = `♢ ${Number.isFinite(+w.humidity) ? Math.round(w.humidity) : '--'}%`;
  $('weather-wind').textContent = `≋ ${Number.isFinite(+w.wind) ? Math.round(w.wind) : '--'} km/h`;
  $('weather-pressure').textContent = `◌ ${Number.isFinite(+w.pressure) ? Math.round(w.pressure) : '--'} hPa`;
  $('weather-icon').childNodes[0].textContent = icon;
  $('weather-slashes').textContent = slashes;
}

async function refreshWeather(){ updateWeatherUI(await fetchWeather()); }

function updateClocks(){
  const now = new Date();
  $('local-label').textContent = CFG.localLabel;
  $('local-time').textContent = fmtTime(now, CFG.localTimeZone);
  $('local-date').textContent = fmtDate(now, CFG.localTimeZone);
  [['wc1',CFG.worldClock1Zone,CFG.worldClock1Label],['wc2',CFG.worldClock2Zone,CFG.worldClock2Label]].forEach(([id,tz,label])=>{
    $(id+'-label').textContent = label; $(id+'-time').textContent = fmtTime(now,tz); $(id+'-date').textContent = fmtDate(now,tz); $(id+'-tz').textContent = tzOffsetLabel(tz); drawAnalog($(id+'-analog'), zonedDate(now,tz));
  });
}

function demoStats(){
  const t = Date.now()/1000;
  const cpu = clamp(34 + Math.sin(t/4)*12 + Math.random()*13);
  const gpu = clamp(51 + Math.sin(t/5+1.4)*18 + Math.random()*18);
  const ramPct = clamp(57 + Math.sin(t/19)*5 + Math.random()*2);
  const vramPct = clamp(47 + Math.sin(t/13)*9 + Math.random()*3);
  return { source:'demo', cpu:{name:'AMD RYZEN 7 7800X3D', usage:cpu, temp:55+cpu*.12}, gpu:{name:'NVIDIA GEFORCE RTX 4070 Ti', usage:gpu, temp:48+gpu*.18, memoryUsedGB:12*vramPct/100, memoryTotalGB:12}, ram:{usedGB:32*ramPct/100,totalGB:32}, motherboard:{temp:42+Math.sin(t/15)*2} };
}

async function readStats(){
  if(CFG.demoMode) return demoStats();
  try{
    const res = await fetch(CFG.apiUrl, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json(); json.source = 'local'; return json;
  }catch(err){
    const s = demoStats(); s.source = 'fallback demo'; s.error = err.message; return s;
  }
}

function updateStats(s){
  const cpu = s.cpu || {}, gpu = s.gpu || {}, ram = s.ram || {}, mb = s.motherboard || {};
  const cpuUse = clamp(cpu.usage), gpuUse = clamp(gpu.usage);
  const ramPct = ram.totalGB ? clamp(ram.usedGB / ram.totalGB * 100) : 0;
  const vramPct = gpu.memoryTotalGB ? clamp(gpu.memoryUsedGB / gpu.memoryTotalGB * 100) : 0;
  pushHistory('cpu', cpuUse); pushHistory('gpu', gpuUse);
  $('cpu-name').textContent = cpu.name || 'PROCESSOR'; $('gpu-name').textContent = gpu.name || 'GRAPHICS';
  $('cpu-usage').textContent = `${Math.round(cpuUse)}%`; $('gpu-usage').textContent = `${Math.round(gpuUse)}%`;
  $('ram-pct').textContent = `${Math.round(ramPct)}%`; $('ram-values').textContent = `${gb(ram.usedGB)} / ${gb(ram.totalGB)} GB`;
  $('vram-pct').textContent = `${Math.round(vramPct)}%`; $('vram-values').textContent = `${gb(gpu.memoryUsedGB)} / ${gb(gpu.memoryTotalGB)} GB`;
  $('cpu-temp').textContent = Number.isFinite(+cpu.temp) ? `${Math.round(cpu.temp)}°C` : '--°C';
  $('gpu-temp').textContent = Number.isFinite(+gpu.temp) ? `${Math.round(gpu.temp)}°C` : '--°C';
  $('mb-temp').textContent = Number.isFinite(+mb.temp) ? `${Math.round(mb.temp)}°C` : '--°C';
  buildSegments($('ram-bar'), ramPct); buildSegments($('vram-bar'), vramPct); buildSegments($('cpu-temp-bar'), clamp(cpu.temp,20,100), 25); buildSegments($('gpu-temp-bar'), clamp(gpu.temp,20,100), 25); buildSegments($('mb-temp-bar'), clamp(mb.temp,20,100), 25);
  drawLine($('cpu-chart'), histories.cpu); drawLine($('gpu-chart'), histories.gpu);
  $('api-source').textContent = s.source === 'local' ? 'LOCAL SENSOR BRIDGE' : 'DEMO / FALLBACK';
  $('api-status').textContent = s.source === 'local' ? 'Sensores do PC em tempo real' : (CFG.demoMode ? `Modo demo ativo${s.error ? ' • '+s.error : ''}` : `Fallback demo${s.error ? ' • '+s.error : ''}`);
  document.querySelector('.optional').style.display = CFG.showApiPanel ? '' : 'none';
}

async function loop(){ updateStats(await readStats()); }
setInterval(updateClocks, 1000);
setInterval(loop, CFG.updateMs);
setInterval(refreshWeather, 60000);
updateClocks();
loop();
refreshWeather();

window.wallpaperPropertyListener = {
  applyUserProperties(properties){
    const map = {
      apiurl:'apiUrl', updatems:'updateMs', localtimezone:'localTimeZone', locallabel:'localLabel', worldclock1zone:'worldClock1Zone', worldclock1label:'worldClock1Label', worldclock2zone:'worldClock2Zone', worldclock2label:'worldClock2Label', demomode:'demoMode', showapipanel:'showApiPanel', panelopacity:'panelOpacity', uiscale:'uiScale', clockscale:'clockScale', weatherlocationname:'weatherLocationName', weatherlatitude:'weatherLatitude', weatherlongitude:'weatherLongitude', weatherupdateminutes:'weatherUpdateMinutes'
    };
    for(const [k,field] of Object.entries(map)) if(properties[k]) CFG[field] = properties[k].value;
    if(properties.custombackground?.value) $('bg').style.backgroundImage = `url('file:///${properties.custombackground.value}')`;
    setRootVar('--opacity', CFG.panelOpacity); setRootVar('--scale', CFG.uiScale); setRootVar('--clock-size', CFG.clockScale);
    $('api-url-label').textContent = CFG.apiUrl;
    weatherState.lastAt = 0;
    refreshWeather();
  }
};
