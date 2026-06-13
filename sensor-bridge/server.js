'use strict';

const http = require('http');
const os = require('os');
const si = require('systeminformation');
const PORT = Number(process.env.HUD_SENSOR_PORT || 17377);
let last = null;
let lastAt = 0;

function round(n, d = 1){ return Number.isFinite(+n) ? Math.round(+n * 10 ** d) / 10 ** d : null; }
function bytesToGB(v){ return Number.isFinite(+v) ? round(v / 1024 / 1024 / 1024, 1) : null; }
function pickTemp(temp, wanted){
  if (!temp) return null;
  const candidates = Array.isArray(temp.cores) ? temp.cores.filter(Number.isFinite) : [];
  if (wanted === 'cpu') return round(temp.main ?? temp.max ?? (candidates.length ? Math.max(...candidates) : null), 0);
  return null;
}

async function collect(){
  const [load, mem, cpu, graphics, temps, baseboard] = await Promise.all([
    si.currentLoad(), si.mem(), si.cpu(), si.graphics(), si.cpuTemperature(), si.baseboard().catch(() => null)
  ]);
  const controller = graphics.controllers?.[0] || {};
  const vramTotalMB = controller.memoryTotal || controller.vram || null;
  const vramUsedMB = controller.memoryUsed || null;
  const gpuTemp = controller.temperatureGpu ?? controller.temperatureMemory ?? null;
  return {
    timestamp: new Date().toISOString(),
    host: os.hostname(),
    cpu: {
      name: `${cpu.manufacturer || ''} ${cpu.brand || 'CPU'}`.trim(),
      usage: round(load.currentLoad, 1),
      temp: pickTemp(temps, 'cpu')
    },
    gpu: {
      name: controller.model || 'GPU',
      usage: round(controller.utilizationGpu ?? controller.load ?? 0, 1),
      temp: round(gpuTemp, 0),
      memoryUsedGB: vramUsedMB ? round(vramUsedMB / 1024, 1) : null,
      memoryTotalGB: vramTotalMB ? round(vramTotalMB / 1024, 1) : null
    },
    ram: {
      usedGB: bytesToGB(mem.active || (mem.total - mem.available)),
      totalGB: bytesToGB(mem.total)
    },
    motherboard: {
      name: baseboard ? `${baseboard.manufacturer || ''} ${baseboard.model || ''}`.trim() : 'Motherboard',
      temp: null
    }
  };
}

async function getStats(){
  const now = Date.now();
  if (last && now - lastAt < 750) return last;
  last = await collect(); lastAt = now; return last;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true})); }
  if (req.url !== '/stats') { res.writeHead(404, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'not found'})); }
  try { const stats = await getStats(); res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(stats)); }
  catch (err) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error: err.message})); }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Hamburg System HUD sensor bridge running at http://127.0.0.1:${PORT}/stats`));
