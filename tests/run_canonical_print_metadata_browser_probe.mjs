const devtoolsHost = process.env.PRINT_META_DEVTOOLS_HOST || 'http://127.0.0.1:9234';
const targetUrl = process.env.PRINT_META_PROBE_URL || 'http://127.0.0.1:8767/tests/browser_canonical_print_metadata_probe.html';
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
await send('Page.navigate', { url: targetUrl });

let snapshot = null;
while (Date.now() < deadline) {
  const evaluated = await send('Runtime.evaluate', {
    expression: "JSON.stringify({state:document.body?.dataset?.result||'NO_BODY',text:document.getElementById('probeResult')?.textContent||'',title:document.title})",
    returnByValue: true
  });
  const value = evaluated?.result?.value;
  if (typeof value === 'string') {
    snapshot = JSON.parse(value);
    process.stdout.write('PRINT_META_PROBE state=' + snapshot.state + '\n');
    if (snapshot.state === 'PASS' || snapshot.state === 'FAIL') break;
  }
  await sleep(500);
}
process.stdout.write('=== print metadata probe console ===\n');
for (const line of consoleLines.slice(-100)) process.stdout.write(line + '\n');
process.stdout.write('=== print metadata probe result ===\n' + JSON.stringify(snapshot, null, 2) + '\n');
try { ws.close(); } catch {}
if (!snapshot || snapshot.state !== 'PASS') {
  throw new Error('Canonical print metadata browser probe failed: ' + (snapshot?.text || 'timeout'));
}
