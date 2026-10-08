// Headless smoke test for Squad Rush. Opens zombie.html in headless Chromium,
// lets the autopilot play (?bot=1), screenshots along the way and prints
// squad/boss state, frame rate and any console errors.
//   npm run dev &
//   node tools/squad-smoke.mjs "http://localhost:5173/zombie.html?level=1&bot=1" out/l1 60 5
//   node tools/squad-smoke.mjs "http://localhost:5173/zombie.html?mode=free&bot=1" out/free 90 10
//   node tools/squad-smoke.mjs http://localhost:5173/zombie.html out/menu 0      # just the menu
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, secondsArg = '0', everyArg = '5'] = process.argv.slice(2);
const seconds = +secondsArg, every = +everyArg;
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const CHROME = process.env.CHROME
  || ['/opt/pw-browsers/chromium', process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'].find(existsSync);
const port = 9222 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--window-size=${W},${H}`, `--remote-debugging-port=${port}`,
  '--user-data-dir=' + join(tmpdir(), 'squad-chrome-' + port),
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
  if (r.result?.exceptionDetails) logs.push('EVAL EXC ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}-${name}.png`, Buffer.from(r.result.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < H });
await send('Page.navigate', { url });
for (let i = 0; i < 80; i++) {
  if (await evalJs('!!window.__squad')) break;
  await sleep(250);
}
await sleep(1500);
await shot('start');

const state = `(() => {
  const s = __squad.sim, b = s.boss;
  return { run: !!__squad.run, status: s.status, d: Math.round(s.distance), count: s.count, zombies: s.zombies.length,
    bullets: s.bullets.length, kills: s.kills, score: s.finalScore, bosses: s.bossesBeaten,
    boss: b ? b.hp + '/' + b.maxHp : null, fps: window.__fps };
})()`;
await evalJs(`(() => { let n = 0, t = performance.now(); const f = (now) => { n++; if (now - t > 1000) { window.__fps = n; n = 0; t = now; } requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);

if (seconds > 0) {
  const t0 = Date.now();
  let k = 1, nextShot = every * 1000, lastLog = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const s = await evalJs(state);
    if (Date.now() - lastLog > 2000) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(s)); lastLog = Date.now(); }
    if (Date.now() - t0 >= nextShot) { await shot('t' + k++); nextShot += every * 1000; }
    if (s && s.run && s.status !== 'running') { await sleep(2000); await shot('end'); console.log('END', JSON.stringify(await evalJs(state))); break; }
    await sleep(150);
  }
}
console.log('console:\n' + logs.slice(0, 30).join('\n'));
ws.close();
chrome.kill('SIGKILL');
