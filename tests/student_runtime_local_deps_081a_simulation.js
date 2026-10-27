const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

const VERSION = '20261027-browser-compat-088b';
const html = fs.readFileSync('hoc_sinh.html', 'utf8');
const js = fs.readFileSync('hoc_sinh.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const deps = [
  {
    path: 'vendor/student/supabase-js-2.118.0.min.js',
    license: 'vendor/student/supabase-js-2.118.0.LICENSE',
    sha256: 'BEE24FC29228ED5A370F76A2BA1CA3C399549EDAD2FEF23453C80148856A49AF',
    script: './vendor/student/supabase-js-2.118.0.min.js'
  },
  {
    path: 'vendor/student/dompurify-3.0.6.min.js',
    license: 'vendor/student/dompurify-3.0.6.LICENSE',
    sha256: 'EA4B09082CA4BA0AE71BE6431A097678751D0453B9C52A4D2C7C39A2166ED9FC',
    script: './vendor/student/dompurify-3.0.6.min.js'
  },
  {
    path: 'vendor/student/crypto-js-4.1.1.min.js',
    license: 'vendor/student/crypto-js-4.1.1.LICENSE',
    sha256: '8E3B0117F4DF4BE452C0B6AF5B8F0A0ACF9D4ADE23D08D55D7E312AF22077762',
    script: './vendor/student/crypto-js-4.1.1.min.js'
  }
];

console.log('=== STUDENT RUNTIME LOCAL DEPENDENCIES 081A ===');

assert(js.includes(`const VERSION = '${VERSION}';`), 'hoc_sinh.js VERSION mismatch');
assert(sw.includes(`const VERSION = '${VERSION}';`), 'sw.js VERSION mismatch');
assert(html.includes(`hoc_sinh.js?v=${VERSION}`), 'hoc_sinh.js cache marker mismatch');
assert(html.includes(`manifest.json?v=${VERSION}`), 'manifest cache marker mismatch');

for (const dep of deps) {
  assert(fs.existsSync(dep.path), 'missing local dependency: ' + dep.path);
  assert(fs.existsSync(dep.license), 'missing dependency license: ' + dep.license);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(dep.path)).digest('hex').toUpperCase();
  assert.strictEqual(hash, dep.sha256, 'unexpected vendored dependency bytes: ' + dep.path);
  assert(html.includes(`src="${dep.script}"`), 'student HTML does not load local dependency: ' + dep.script);
  assert(sw.includes(`'${dep.script}'`), 'service worker CORE_ASSETS missing: ' + dep.script);
}

assert(!/<script[^>]+src=["']https?:\/\//i.test(html), 'student HTML still loads a remote script');
assert(!/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn-icons-png\.flaticon\.com/i.test(html), 'student HTML/CSP still depends on public CDN hosts');
assert(!/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn-icons-png\.flaticon\.com/i.test(sw), 'student service worker still references public CDN hosts');
assert(/script-src 'self' 'unsafe-inline';/.test(html), 'student CSP script-src should be self-contained');
assert(new RegExp('<link rel="manifest" href="manifest\\.json\\?v=' + VERSION + '">\\r?\\n\\s*<link rel="icon"').test(html), 'manifest/icon markup must use a real LF or CRLF newline');
assert(!html.includes('>\\\\r\\\\n    <link rel="icon"'), 'literal \\r\\n escape leaked into HTML markup');

const coreStart = sw.indexOf('const CORE_ASSETS = [');
const coreEnd = sw.indexOf('];', coreStart);
const coreBlock = sw.slice(coreStart, coreEnd);
assert(!/https?:\/\//.test(coreBlock), 'CORE_ASSETS must be same-origin only');

assert(js.includes('const SUBMISSION_FAST_RETRY_LIMIT = 6;'), '076 fast retry contract changed');
assert(js.includes('const SUBMISSION_MEDIUM_RETRY_LIMIT = 12;'), '076 medium retry contract changed');
assert(js.includes('return 90000 + Math.floor(Math.random() * 60001);'), '076 long retry contract changed');

console.log('PASS student_runtime_local_deps_081a_simulation');
