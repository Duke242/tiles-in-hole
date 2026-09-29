// Headless smoke test / auto-player. Opens the game in headless Chromium as a
// portrait phone, presses Play, steers the hole to the nearest goal tile and
// screenshots along the way, printing goal/size/timer state and frame
// timings. Needs a Chromium binary (CHROME env, defaults to Playwright's).
//   npm run dev &
//   node tools/autoplay.mjs http://localhost:5173/?level=8 out/l8 120 20
//   node tools/autoplay.mjs "http://localhost:5173/?mode=free" out/free 120 20   # free play
//   W=1280 H=800 node tools/autoplay.mjs http://localhost:5173/ out/desk 30 10
//   EXPR='__debug.hole()' node tools/autoplay.mjs http://localhost:5173/ out/x 0   # evaluate in-page
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, secondsArg = '0', everyArg = '3'] = process.argv.slice(2);
const seconds = +secondsArg, every = +everyArg;
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const port = 9222 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--window-size=${W},${H}`, `--remote-debugging-port=${port}`,
  '--user-data-dir=' + join(tmpdir(), 'tih-chrome-' + port),
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', (d) => { stderr += d; });

async function getTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      const t = (await r.json()).find((x) => x.type === 'page');
      if (t) return t;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('chrome did not come up: ' + stderr);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) logs.push('EVAL EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}-${name}.png`, Buffer.from(r.result.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
await sleep(2500);
for (let i = 0; i < 80; i++) {
  if (await evalJs('!!(window.__debug && window.__debug.ready())')) break;
  await sleep(250);
}
await shot('menu');
await evalJs(`document.getElementById(${JSON.stringify(url.includes('mode=free') ? 'freeBtn' : 'playBtn')}).click(); true`);
await sleep(800);
await shot('play0');
await evalJs('__debug.perf()');

if (process.env.EXPR) { await sleep(1500); console.log('EXPR =>', await evalJs(process.env.EXPR)); }
if (seconds > 0) {
  const t0 = Date.now();
  let k = 1, nextShot = every * 1000;
  let lastLog = 0;
  while (Date.now() - t0 < seconds * 1000) {
    // steer toward the nearest eatable idle object
    const st = await evalJs(`(() => {
      const h = __debug.hole(), p = __debug.progress();
      const goals = new Set((p ? p.goals : []).filter(g => g.have < g.need).map(g => g.key));
      let best = null, bd = 1e9;
      for (const o of __debug.targets()) {
        if (goals.size && !goals.has(o.key) && o.key !== 'prop') continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { const d = Math.hypot(best.x - h.x, best.z - h.z) || 1; __debug.setMove((best.x - h.x) / d, (best.z - h.z) / d); }
      else __debug.setMove(0, 0);
      return JSON.stringify({ status: __debug.status(), r: +h.r.toFixed(2), size: h.size, x: +h.x.toFixed(1), z: +h.z.toFixed(1),
        target: best && best.key, td: +bd.toFixed(1), left: p && +p.left.toFixed(1), eaten: h.eaten,
        goals: p && p.goals.map(g => g.have + '/' + g.need).join(' '), bodies: __debug.active(), run: __debug.run() });
    })()`);
    if (Date.now() - lastLog > 2000) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', st); lastLog = Date.now(); }
    if (Date.now() - t0 >= nextShot) { await shot('t' + k++); nextShot += every * 1000; }
    const s = JSON.parse(st || '{}');
    if (s.status === 'won' || s.status === 'lost') { await sleep(1500); await shot('end'); console.log('END', s.status); break; }
    await sleep(120);
  }
  await evalJs('__debug.setMove(null)');
  console.log('perf', JSON.stringify(await evalJs('__debug.perf()')));
}
console.log('console:\n' + logs.slice(0, 30).join('\n'));
ws.close();
chrome.kill('SIGKILL');
