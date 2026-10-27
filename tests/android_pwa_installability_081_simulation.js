const assert = require('assert');
const fs = require('fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const html = fs.readFileSync('hoc_sinh.html', 'utf8');
const js = fs.readFileSync('hoc_sinh.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const version = '20261027-pwa-installability-087';

console.log('=== ANDROID PWA INSTALLABILITY 081 ===');

// P081-01: version/cache contract is synchronized.
assert(js.includes(`const VERSION = '${version}';`));
assert(sw.includes(`const VERSION = '${version}';`));
assert(html.includes(`hoc_sinh.js?v=${version}`));
assert(html.includes(`manifest.json?v=${version}`));

// P081-02: manifest has the core installability fields and local 192/512 icons.
assert.strictEqual(manifest.id, './hoc_sinh.html');
assert.strictEqual(manifest.start_url, './hoc_sinh.html');
assert.strictEqual(manifest.scope, './');
assert.strictEqual(manifest.display, 'standalone');
const icon192 = manifest.icons.find((x) => x.sizes === '192x192');
const icon512 = manifest.icons.find((x) => x.sizes === '512x512');
assert(icon192 && icon192.src === './icons/exam-192.png' && icon192.type === 'image/png');
assert(icon512 && icon512.src === './icons/exam-512.png' && icon512.type === 'image/png');
const installSvg = manifest.icons.find((x) => x.src === './icons/exam-installable.svg');
assert(installSvg && installSvg.sizes === 'any' && installSvg.type === 'image/svg+xml' && installSvg.purpose === 'any');
assert(fs.existsSync('icons/exam-installable.svg'), 'Chrome-compatible SVG install icon must exist');
assert(html.includes('rel="apple-touch-icon"'), 'iOS apple-touch-icon must be declared');
assert(!manifest.icons.some((x) => /^https?:/i.test(x.src)), 'manifest icons must be same-origin');

// P081-03: SW install cannot fail because an external CDN is unavailable.
assert(sw.includes('const CORE_ASSETS = ['));
assert(sw.includes("'./icons/exam-192.png'"));
assert(sw.includes("'./icons/exam-512.png'"));
assert(sw.includes("'./icons/exam-installable.svg'"));
const coreBlock = sw.slice(sw.indexOf('const CORE_ASSETS'), sw.indexOf('const OPTIONAL_ASSETS'));
assert(!/https?:\/\//.test(coreBlock), 'CORE_ASSETS must be same-origin only');
assert(sw.includes('Promise.allSettled'));
assert(sw.includes('OPTIONAL_ASSETS.map((url) => cache.add(url))'));
assert(sw.includes('cache.addAll(CORE_ASSETS)'));
assert(sw.includes('{ ignoreSearch: true }'), 'versioned local static requests need offline cache fallback');

// P081-04: Android no longer dead-ends when beforeinstallprompt is absent.
assert(html.includes('id="android-instructions"'));
assert(html.includes('“Cài đặt ứng dụng”'));
assert(html.includes('“Thêm vào màn hình chính”'));
assert(html.includes('Không mở bằng trình duyệt bên trong Zalo, Messenger, Facebook'));
assert(js.includes('function showAndroidInstallFallback'));
assert(js.includes('function schedulePwaInstallFallback'));
assert(js.includes('if (!deferredPrompt)'));
assert(js.includes("btn.textContent = deferredPrompt ? '✨ CÀI ĐẶT ỨNG DỤNG NGAY ✨' : '📱 HƯỚNG DẪN CÀI ĐẶT'"));
assert(js.includes("window.addEventListener('appinstalled'"));

// P081-05: diagnostics cover the actionable install prerequisites.
for (const token of [
  'window.isSecureContext',
  'document.querySelector(\'link[rel="manifest"]\')',
  'manifest.display === \'standalone\'',
  "includes('192x192')",
  "includes('512x512')",
  "navigator.serviceWorker.getRegistration('./')",
  'installPrompt: !!deferredPrompt'
]) {
  assert(js.includes(token), 'missing PWA diagnostic token: ' + token);
}

// P081-06: submission-retry safety from 076 remains intact.
assert(js.includes('const SUBMISSION_FAST_RETRY_LIMIT = 6;'));
assert(js.includes('const SUBMISSION_MEDIUM_RETRY_LIMIT = 12;'));
assert(js.includes('return 90000 + Math.floor(Math.random() * 60001);'));
assert(js.includes('scheduleDelayedSubmissionRetry();'));

console.log('PASS android_pwa_installability_081_simulation');
