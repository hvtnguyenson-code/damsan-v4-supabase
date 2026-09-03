const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runCspAndVendorStaticAssertions() {
  console.log('=== RUNNING ACCOUNT IMPORT EXCELJS CSP & VENDOR SIMULATION (C1 - C12) ===');

  const htmlPath = path.join(__dirname, '..', 'giaovien.html');
  const jsPath = path.join(__dirname, '..', 'giaovien.js');
  const vendorJsPath = path.join(__dirname, '..', 'vendor', 'exceljs-4.3.0.bare.min.js');
  const vendorLicensePath = path.join(__dirname, '..', 'vendor', 'exceljs-4.3.0.LICENSE');
  const vendorRegeneratorPath = path.join(__dirname, '..', 'vendor', 'regenerator-runtime-0.13.11.min.js');
  const vendorRegeneratorLicensePath = path.join(__dirname, '..', 'vendor', 'regenerator-runtime-0.13.11.LICENSE');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  // C1: giaovien.html static script uses ./vendor/exceljs-4.3.0.bare.min.js
  assert(
    htmlContent.includes('<script src="./vendor/exceljs-4.3.0.bare.min.js"></script>'),
    'C1 FAIL: giaovien.html must include static script pointing to ./vendor/exceljs-4.3.0.bare.min.js'
  );
  console.log('C1 (giaovien.html static script uses ./vendor/exceljs-4.3.0.bare.min.js): PASSED');

  // C2: giaovien.html does NOT contain non-bare exceljs/4.3.0/exceljs.min.js
  assert(
    !htmlContent.includes('exceljs/4.3.0/exceljs.min.js'),
    'C2 FAIL: giaovien.html must NOT contain non-bare exceljs/4.3.0/exceljs.min.js'
  );
  console.log('C2 (giaovien.html does NOT contain exceljs/4.3.0/exceljs.min.js): PASSED');

  // C3: giaovien.js loader only uses exceljs.bare.min.js for CDN URLs
  assert(
    jsContent.includes('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.bare.min.js'),
    'C3 FAIL: giaovien.js primarySrc must use cdnjs exceljs.bare.min.js'
  );
  assert(
    jsContent.includes('https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.bare.min.js'),
    'C3 FAIL: giaovien.js fallbackSrc must use jsdelivr exceljs.bare.min.js'
  );
  console.log('C3 (giaovien.js loader CDN URLs use exceljs.bare.min.js): PASSED');

  // C4: giaovien.js loader has no non-bare bundle URLs
  assert(
    !jsContent.includes('dist/exceljs.min.js') && !jsContent.includes('cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js'),
    'C4 FAIL: giaovien.js must NOT contain non-bare exceljs.min.js URLs'
  );
  console.log('C4 (giaovien.js loader contains no non-bare bundle URLs): PASSED');

  // C5: CSP does NOT contain 'unsafe-eval'
  const cspMatch = htmlContent.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert(cspMatch, 'C5 FAIL: Content-Security-Policy meta tag must be present in giaovien.html');
  const cspContent = cspMatch[1];
  assert(
    !cspContent.includes("'unsafe-eval'") && !cspContent.includes('"unsafe-eval"'),
    'C5 FAIL: CSP must NOT contain unsafe-eval'
  );
  console.log('C5 (CSP strictly preserves policy without unsafe-eval): PASSED');

  // C6: giaovien.js cache-bust version in giaovien.html is 20260903-flex-lite-007
  assert(
    htmlContent.includes('giaovien.js?v=20260903-flex-lite-007'),
    'C6 FAIL: giaovien.html script version must be giaovien.js?v=20260903-flex-lite-007'
  );
  console.log('C6 (giaovien.js cache-bust is 20260903-flex-lite-007): PASSED');

  // C7: vendor JS exists, size > 1MB, not HTML
  assert(fs.existsSync(vendorJsPath), 'C7 FAIL: vendor/exceljs-4.3.0.bare.min.js must exist');
  const vendorJsStat = fs.statSync(vendorJsPath);
  assert(vendorJsStat.size > 1000000, `C7 FAIL: vendor JS size must be > 1MB (actual: ${vendorJsStat.size} bytes)`);
  const vendorHead = fs.readFileSync(vendorJsPath, 'utf8').slice(0, 200);
  assert(
    !vendorHead.toLowerCase().includes('<!doctype html') && !vendorHead.toLowerCase().includes('<html'),
    'C7 FAIL: vendor JS must not be an HTML error page'
  );
  console.log(`C7 (vendor/exceljs-4.3.0.bare.min.js exists, valid JS, size: ${vendorJsStat.size} bytes): PASSED`);

  // C8: vendor LICENSE exists and is non-empty
  assert(fs.existsSync(vendorLicensePath), 'C8 FAIL: vendor/exceljs-4.3.0.LICENSE must exist');
  const licenseStat = fs.statSync(vendorLicensePath);
  assert(licenseStat.size > 100, `C8 FAIL: vendor LICENSE must be valid non-empty file (actual: ${licenseStat.size} bytes)`);
  console.log(`C8 (vendor/exceljs-4.3.0.LICENSE exists, size: ${licenseStat.size} bytes): PASSED`);

  // C9: giaovien.html load local regenerator-runtime trước local ExcelJS
  const regeneratorTag = '<script src="./vendor/regenerator-runtime-0.13.11.min.js"></script>';
  const exceljsTag = '<script src="./vendor/exceljs-4.3.0.bare.min.js"></script>';
  assert(htmlContent.includes(regeneratorTag), 'C9 FAIL: giaovien.html must include ./vendor/regenerator-runtime-0.13.11.min.js');
  const regIdx = htmlContent.indexOf(regeneratorTag);
  const excIdx = htmlContent.indexOf(exceljsTag);
  assert(regIdx !== -1 && excIdx !== -1 && regIdx < excIdx, 'C9 FAIL: regenerator-runtime script tag must appear BEFORE exceljs bare script tag');
  console.log('C9 (giaovien.html loads local regenerator-runtime before local ExcelJS): PASSED');

  // C10: CSP không unsafe-eval (thực hiện kiểm tra kép toàn diện trên toàn bộ file HTML)
  assert(!htmlContent.includes("'unsafe-eval'"), 'C10 FAIL: giaovien.html must strictly not contain \'unsafe-eval\' anywhere in policy');
  console.log('C10 (CSP strictly avoids unsafe-eval across entire file): PASSED');

  // C11: regenerator vendor tồn tại, không phải HTML, size hợp lý (> 1KB, < 50KB)
  assert(fs.existsSync(vendorRegeneratorPath), 'C11 FAIL: vendor/regenerator-runtime-0.13.11.min.js must exist');
  const regStat = fs.statSync(vendorRegeneratorPath);
  assert(regStat.size > 1000 && regStat.size < 50000, `C11 FAIL: regenerator vendor size must be reasonable (actual: ${regStat.size} bytes)`);
  const regHead = fs.readFileSync(vendorRegeneratorPath, 'utf8').slice(0, 200);
  assert(
    !regHead.toLowerCase().includes('<!doctype html') && !regHead.toLowerCase().includes('<html'),
    'C11 FAIL: regenerator vendor must not be an HTML error page'
  );
  assert(fs.existsSync(vendorRegeneratorLicensePath), 'C11 FAIL: vendor/regenerator-runtime-0.13.11.LICENSE must exist');
  console.log(`C11 (vendor/regenerator-runtime-0.13.11.min.js and LICENSE exist, size: ${regStat.size} bytes): PASSED`);

  // C12: không có CDN regenerator-runtime trong giaovien.html
  assert(
    !htmlContent.includes('regenerator-runtime@') && !htmlContent.includes('cdnjs.cloudflare.com/ajax/libs/regenerator-runtime'),
    'C12 FAIL: giaovien.html must NOT load regenerator-runtime from external CDN'
  );
  console.log('C12 (no CDN regenerator-runtime in giaovien.html): PASSED');

  console.log('\nAll C1 - C12 assertions passed successfully.');
}

runCspAndVendorStaticAssertions();
