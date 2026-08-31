const assert = require('assert');
const fs = require('fs');

// Read giaovien.js source to extract ensureExcelJsReady
const source = fs.readFileSync('giaovien.js', 'utf8');

// Mock browser environment for ExcelJS loader simulation
function createMockBrowserEnv() {
  const scripts = [];

  const mockDocument = {
    head: {
      appendChild(el) {
        scripts.push(el);
        if (el._triggerOnAppend) {
          setTimeout(() => el._triggerOnAppend(), 5);
        }
        return el;
      }
    },
    querySelector(selector) {
      for (const s of scripts) {
        if (selector.startsWith('script[data-damsan-exceljs-loader="')) {
          const match = selector.match(/script\[data-damsan-exceljs-loader="([^"]+)"\]/);
          if (match && s.getAttribute('data-damsan-exceljs-loader') === match[1]) {
            return s;
          }
        }
      }
      return null;
    },
    createElement(tag) {
      if (tag !== 'script') throw new Error('Only script tag supported in mock');
      const attributes = new Map();
      const eventListeners = new Map();
      const scriptEl = {
        src: '',
        async: false,
        onload: null,
        onerror: null,
        setAttribute(k, v) { attributes.set(k, v); },
        getAttribute(k) { return attributes.get(k) || null; },
        hasAttribute(k) { return attributes.has(k); },
        addEventListener(event, fn, opts) {
          if (!eventListeners.has(event)) eventListeners.set(event, []);
          eventListeners.get(event).push({ fn, once: opts && opts.once });
        },
        dispatchEvent(event) {
          const handlers = (eventListeners.get(event) || []).slice();
          for (const item of handlers) {
            item.fn({ type: event });
            if (item.once) {
              const current = eventListeners.get(event) || [];
              const idx = current.indexOf(item);
              if (idx >= 0) current.splice(idx, 1);
            }
          }
          if (event === 'load' && typeof scriptEl.onload === 'function') scriptEl.onload({ type: 'load' });
          if (event === 'error' && typeof scriptEl.onerror === 'function') scriptEl.onerror({ type: 'error' });
        },
        remove() {
          const idx = scripts.indexOf(scriptEl);
          if (idx >= 0) scripts.splice(idx, 1);
        },
        _triggerOnAppend: null
      };
      return scriptEl;
    }
  };

  const mockWindow = {
    ExcelJS: undefined,
    document: mockDocument,
    __EXCELJS_SCRIPT_TIMEOUT_MS: 30 // Fast deterministic timeout for unit tests
  };

  return { mockWindow, mockDocument, scripts };
}

// Build ensureExcelJsReady runner from code
function createLoaderFunction(fullSource) {
  const start = fullSource.indexOf('let excelJsLoadingPromise = null;');
  assert(start >= 0, 'start marker not found');
  const funcStart = fullSource.indexOf('function ensureExcelJsReady() {', start);
  assert(funcStart >= 0, 'funcStart marker not found');
  const openBracket = fullSource.indexOf('{', funcStart);
  let depth = 0;
  let end = -1;
  for (let i = openBracket; i < fullSource.length; i++) {
    if (fullSource[i] === '{') depth++;
    if (fullSource[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
  assert(end > 0, 'function closure not found');
  const code = fullSource.slice(start, end);

  return (w, d) => {
    const fn = new Function('window', 'document', `
      ${code}
      return ensureExcelJsReady;
    `);
    return fn(w, d);
  };
}

async function runTests() {
  console.log('--- Testing ExcelJS Loader Settled-Script & Timeout Lifecycle Cases (V4-1 to V4-2) ---');

  const getLoaderFactory = createLoaderFunction(source);

  // CASE A: Static failed script exists in DOM at page load
  {
    const { mockWindow, mockDocument, scripts } = createMockBrowserEnv();
    const staticScript = {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
      getAttribute(k) { return null; },
      addEventListener() {},
      remove() {}
    };
    scripts.push(staticScript);
    mockWindow.ExcelJS = undefined;

    const loader = getLoaderFactory(mockWindow, mockDocument);

    let primaryScriptCreated = false;
    let fallbackScriptCreated = false;

    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (el.src.includes('cdnjs')) {
          primaryScriptCreated = true;
          el.dispatchEvent('error');
        } else if (el.src.includes('jsdelivr')) {
          fallbackScriptCreated = true;
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    const excel = await loader();
    assert(excel && excel.Workbook, 'Case A: Loader resolves with ExcelJS');
    assert(primaryScriptCreated, 'Case A: Primary dynamic script created despite static script in DOM');
    assert(fallbackScriptCreated, 'Case A: Fallback jsdelivr script ran successfully');
    console.log('Case A (Static failed script does not hang loader): PASSED');
  }

  // CASE B: Concurrent calls share in-flight promise and deduplicate loading
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let scriptCreationCount = 0;
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      scriptCreationCount += 1;
      el._triggerOnAppend = () => {
        setTimeout(() => {
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }, 10);
      };
      return el;
    };

    const [res1, res2] = await Promise.all([loader(), loader()]);
    assert.strictEqual(res1, res2, 'Case B: Concurrent calls resolve to same ExcelJS instance');
    assert.strictEqual(scriptCreationCount, 1, 'Case B: Exactly 1 dynamic script created for concurrent calls');
    console.log('Case B (Concurrent calls deduplicate without duplicate scripts): PASSED');
  }

  // CASE C: Dynamic primary error transitions to fallback
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    const loadedSrcs = [];
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        loadedSrcs.push(el.src);
        if (el.src.includes('cdnjs')) {
          el.dispatchEvent('error');
        } else if (el.src.includes('jsdelivr')) {
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    const res = await loader();
    assert(res && res.Workbook, 'Case C: Resolves on fallback');
    assert.strictEqual(loadedSrcs.length, 2, 'Case C: Tried primary then fallback');
    assert(loadedSrcs[0].includes('cdnjs') && loadedSrcs[1].includes('jsdelivr'), 'Case C: Correct fallback order');
    console.log('Case C (Primary error transitions to jsdelivr fallback): PASSED');
  }

  // CASE D: Primary + fallback both error -> rejects with Vietnamese message, resets promise
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        el.dispatchEvent('error');
      };
      return el;
    };

    let threw = false;
    try {
      await loader();
    } catch (err) {
      threw = true;
      assert(err.message.includes('Không thể tải thư viện xử lý Excel'), 'Case D: Clear Vietnamese error on failure');
    }
    assert(threw, 'Case D: Rejects when both CDNs fail');
    console.log('Case D (Both CDNs fail -> clear error and promise settled): PASSED');
  }

  // CASE E: Retry after initial double failure works cleanly
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let failNetwork = true;
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (failNetwork) {
          el.dispatchEvent('error');
        } else {
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    try { await loader(); } catch (e) {}

    failNetwork = false;
    const retryRes = await loader();
    assert(retryRes && retryRes.Workbook, 'Case E: Retry succeeds without hanging on old failed state');
    console.log('Case E (Retry after settled failure succeeds cleanly): PASSED');
  }

  // CASE F: Dynamic script fires onload but ExcelJS global missing -> triggers fallback / rejection
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let triedFallback = false;
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (el.src.includes('cdnjs')) {
          el.dispatchEvent('load');
        } else if (el.src.includes('jsdelivr')) {
          triedFallback = true;
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    const res = await loader();
    assert(res && res.Workbook, 'Case F: Resolves on fallback');
    assert(triedFallback, 'Case F: Fallback triggered when primary onload lacked global ExcelJS');
    console.log('Case F (Onload without global triggers fallback without hanging): PASSED');
  }

  // CASE G: Primary dynamic script HANGS (no load/error event) -> times out, fallback succeeds
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let fallbackCreated = false;
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (el.src.includes('cdnjs')) {
          // Do NOT fire load or error event (hang)
        } else if (el.src.includes('jsdelivr')) {
          fallbackCreated = true;
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    const res = await loader();
    assert(res && res.Workbook, 'Case G: Resolves when fallback succeeds after primary timeout');
    assert(fallbackCreated, 'Case G: Fallback was triggered upon primary timeout');
    console.log('Case G (Primary hang -> timeout -> fallback succeeds): PASSED');
  }

  // CASE H: Primary + fallback BOTH HANG -> rejects after timeout without hanging indefinitely
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        // Neither script fires events (both hang)
      };
      return el;
    };

    let threw = false;
    try {
      await loader();
    } catch (err) {
      threw = true;
      assert(err.message.includes('Không thể tải thư viện xử lý Excel'), 'Case H: Rejection message on total timeout');
    }
    assert(threw, 'Case H: Loader rejects cleanly after finite timeout when both CDNs hang');
    console.log('Case H (Primary + fallback hang -> finite timeout rejection): PASSED');
  }

  // CASE I: Late events arriving after timeout do not cause duplicate settlement
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let latePrimaryElement = null;
    let fallbackCallsCount = 0;

    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (el.src.includes('cdnjs')) {
          latePrimaryElement = el;
          // Primary hangs initially
        } else if (el.src.includes('jsdelivr')) {
          fallbackCallsCount++;
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
          // Late event from primary arrives AFTER fallback already ran
          if (latePrimaryElement) {
            setTimeout(() => {
              latePrimaryElement.dispatchEvent('load');
              latePrimaryElement.dispatchEvent('error');
            }, 10);
          }
        }
      };
      return el;
    };

    const res = await loader();
    assert(res && res.Workbook, 'Case I: Loader resolves cleanly');
    assert.strictEqual(fallbackCallsCount, 1, 'Case I: Fallback executed exactly once');
    console.log('Case I (Late event after timeout ignored by settlement guard): PASSED');
  }

  // CASE J: Retry after timeout failure succeeds when network recovers
  {
    const { mockWindow, mockDocument } = createMockBrowserEnv();
    mockWindow.ExcelJS = undefined;
    const loader = getLoaderFactory(mockWindow, mockDocument);

    let hanging = true;
    const origCreate = mockDocument.createElement.bind(mockDocument);
    mockDocument.createElement = (tag) => {
      const el = origCreate(tag);
      el._triggerOnAppend = () => {
        if (hanging) {
          // Hang during initial attempt
        } else {
          // Recover during retry
          mockWindow.ExcelJS = { Workbook: class MockWorkbook {} };
          el.dispatchEvent('load');
        }
      };
      return el;
    };

    // First attempt times out
    try { await loader(); } catch (e) {}

    // Second attempt recovers
    hanging = false;
    const retryRes = await loader();
    assert(retryRes && retryRes.Workbook, 'Case J: Retry succeeds after previous timeout');
    console.log('Case J (Retry after timeout failure succeeds cleanly): PASSED');
  }

  console.log('account_import_excel_loader_simulation: All Cases A-J passed successfully.');
}

runTests().catch(err => {
  console.error('Loader simulation failed:', err);
  process.exit(1);
});
