const assert = require('assert');
const fs = require('fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const html = fs.readFileSync('hoc_sinh.html', 'utf8');
const js = fs.readFileSync('hoc_sinh.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const version = '20261027-browser-compat-088b';

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
assert(html.includes('id="btn-browser-fallback"'), 'verified browser fallback button must exist');
assert(html.includes('id="browser-fallback-box"'), 'verified browser fallback container must exist');
assert(js.includes("if (!('serviceWorker' in navigator))"), 'browser fallback hard-negative must require missing Service Worker');
assert(js.includes("code: 'service_worker_unsupported'"), 'missing Service Worker hard-negative code missing');
assert(js.includes("code: 'insecure_context'"), 'insecure-context hard-negative code missing');
assert(js.includes("sessionStorage.setItem(VERIFIED_BROWSER_FALLBACK_SESSION_KEY"), 'browser fallback permission must be session-scoped');
assert(js.includes('getVerifiedBrowserFallbackSession()'), 'reload must revalidate browser fallback');
assert(!js.includes("if (!deferredPrompt) {\n        sessionStorage.setItem(VERIFIED_BROWSER_FALLBACK_SESSION_KEY"), 'missing install prompt must never grant browser fallback');
assert(html.includes('id="browser-compat-check-box"'), 'advanced compatibility check box must exist');
assert(html.includes('id="btn-browser-compat-check"'), 'advanced compatibility check button must exist');
assert(js.includes("'UNCERTAIN'"), 'multi-level PWA compatibility state must include UNCERTAIN');
assert(js.includes("code: userConfirmedInstallFailure ? 'android_install_failed_after_diagnostics' : 'android_install_unverified'"), 'UNCERTAIN Android diagnostic code missing');
assert(js.includes("code: 'android_install_failed_after_diagnostics'"), 'soft Android compatibility exception code missing');
assert(js.includes("state: 'BROWSER_UNSUPPORTED'"), 'unsafe old browser must be rejected');
assert(js.includes('function getBrowserExamCapability()'), 'browser exam capability gate missing');
assert(js.includes("if (typeof Promise !== 'function')"), 'Promise capability check missing');
assert(js.includes("if (typeof fetch !== 'function')"), 'fetch capability check missing');
assert(js.includes("if (typeof TextEncoder !== 'function')"), 'TextEncoder capability check missing');
assert(js.includes("localStorage.setItem(key, '1')"), 'writable localStorage capability check missing');
assert(js.includes('BROWSER_FALLBACK_TTL_MS = 2 * 60 * 60 * 1000'), 'compatibility permit must expire after 2 hours');
assert(js.includes("isAndroidDevice() && diagnosticsReady && !diagnostics.installPrompt"), 'soft fallback must remain Android-only and diagnostics-gated');
assert(js.includes("classifyPwaCompatibility(diagnostics, true)"), 'manual failure confirmation must trigger advanced classification');
assert(js.includes("saveBrowserFallbackPermit(result, 'compatibility')"), 'compatibility permit must be explicitly issued');


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
