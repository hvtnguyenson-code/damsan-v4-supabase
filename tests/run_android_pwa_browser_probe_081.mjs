import fs from 'node:fs';
const devtoolsHost = process.env.PWA_DEVTOOLS_HOST || 'http://127.0.0.1:9235';
const targetUrl = process.env.PWA_PROBE_URL || 'http://127.0.0.1:8768/hoc_sinh.html';
const deadline = Date.now() + 90000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(devtoolsHost + '/json/list', { cache: 'no-store' });
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
        if (target) return target;
      }
    } catch (error) { lastError = error; }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint unavailable: ' + (lastError?.message || 'timeout'));
}

const target = await waitForTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const consoleLines = [];

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(entry.method + ': ' + message.error.message));
    else entry.resolve(message.result || {});
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const values = (message.params?.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
    consoleLines.push('[console.' + (message.params?.type || 'log') + '] ' + values);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params?.exceptionDetails;
    consoleLines.push('[exception] ' + (detail?.text || '') + ' ' + (detail?.exception?.description || ''));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', () => reject(new Error('DevTools WebSocket failed to open')), { once: true });
});

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
  platform: 'Android'
});
await send('Page.navigate', { url: targetUrl });

let snapshot = null;
while (Date.now() < deadline) {
  const evaluated = await send('Runtime.evaluate', {
    expression: `(async()=> {
      if (typeof capNhatChanDoanPWA !== 'function' || typeof checkAndShowInstallButton !== 'function') return JSON.stringify({ready:false});
      if (typeof showSection === 'function') showSection('pwa-install-section');
      checkAndShowInstallButton();
      const d = await capNhatChanDoanPWA(true);
      return JSON.stringify({
        ready:true,
        diagnostics:d,
        dependencies:{
          supabase: typeof window.supabase?.createClient === 'function',
          dompurify: typeof window.DOMPurify?.sanitize === 'function',
          cryptojs: typeof window.CryptoJS?.SHA256 === 'function'
        },
        buttonDisplay:document.getElementById('btn-auto-install')?.style?.display || '',
        buttonText:document.getElementById('btn-auto-install')?.textContent || '',
        androidDisplay:document.getElementById('android-instructions')?.style?.display || '',
        diagVisible:document.getElementById('pwa-diagnostics')?.classList?.contains('show') || false
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const value = evaluated?.result?.value;
  if (typeof value === 'string') {
    snapshot = JSON.parse(value);
    if (snapshot.ready && snapshot.diagnostics?.secure && snapshot.diagnostics?.manifest
        && snapshot.diagnostics?.icons && snapshot.diagnostics?.serviceWorker
        && snapshot.diagnostics?.chromeAndroid) break;
  }
  await sleep(500);
}

const manifestInfo = await send('Page.getAppManifest');
const installabilityErrors = await send('Page.getInstallabilityErrors');

await send('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  platform: 'Windows'
});
await send('Page.reload', { ignoreCache: true });
await sleep(1200);
const desktopManifestInfo = await send('Page.getAppManifest');
const desktopInstallabilityErrors = await send('Page.getInstallabilityErrors');
const pngDimensions = (path) => {
  const buf = fs.readFileSync(path);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
};
const iconFiles = {
  icon192: pngDimensions('icons/exam-192.png'),
  icon512: pngDimensions('icons/exam-512.png')
};
process.stdout.write('=== PWA browser probe console ===\n');
for (const line of consoleLines.slice(-80)) process.stdout.write(line + '\n');
process.stdout.write('=== PWA browser probe result ===\n' + JSON.stringify({ snapshot, manifestInfo, installabilityErrors, desktopManifestInfo, desktopInstallabilityErrors, iconFiles }, null, 2) + '\n');

try { ws.close(); } catch {}

if (!snapshot?.ready) throw new Error('PWA runtime did not become ready');
for (const key of ['secure','manifest','icons','serviceWorker','chromeAndroid']) {
  if (!snapshot.diagnostics?.[key]) throw new Error('PWA diagnostic failed: ' + key);
}
for (const key of ['supabase','dompurify','cryptojs']) {
  if (!snapshot.dependencies?.[key]) throw new Error('Local student dependency failed to load: ' + key);
}
if (snapshot.buttonDisplay !== 'block') throw new Error('Android fallback button is not visible without relying on beforeinstallprompt');
if (snapshot.androidDisplay !== 'block' && !snapshot.diagnostics?.installPrompt) {
  throw new Error('Android manual install fallback is not visible when native prompt is unavailable');
}
if (!snapshot.diagVisible) throw new Error('PWA diagnostics panel did not open');
if (!manifestInfo?.url || !manifestInfo.url.includes('manifest.json')) throw new Error('Chrome did not discover the web app manifest');
if (Array.isArray(manifestInfo.errors) && manifestInfo.errors.some((e) => e.critical === 2)) {
  throw new Error('Chrome reported critical manifest errors: ' + JSON.stringify(manifestInfo.errors));
}
