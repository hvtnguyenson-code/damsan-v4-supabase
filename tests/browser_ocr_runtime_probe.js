const resultEl = document.getElementById('probeResult');
const profiles = [
  {
    id: 'default-v7',
    options: {}
  },
  {
    id: 'refresh-default-v7',
    options: { cacheMethod: 'refresh' }
  },
  {
    id: 'pinned-simd-v7',
    options: {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-simd-lstm.wasm.js',
      cacheMethod: 'refresh'
    }
  },
  {
    id: 'pinned-nosimd-v7',
    options: {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-lstm.wasm.js',
      cacheMethod: 'refresh'
    }
  }
];

function errorText(error) {
  return String(error?.message || error || 'unknown error').replace(/\s+/g, ' ').slice(0, 700);
}

function timeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
  ]);
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1500;
  canvas.height = 2100;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = '700 72px Arial, sans-serif';
  ctx.fillText('VI TRI DIA LI VIET NAM 12345', 55, 180);
  ctx.font = '52px Arial, sans-serif';
  ctx.fillText('Dia li lop 12 - kiem tra OCR', 55, 300);
  ctx.fillText('Pham vi lanh tho va vi tri dia li', 55, 410);
  return canvas;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')), 'image/png');
  });
}

function usableText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return { text, ok: text.length >= 12 && /VIET|VIỆT|DIA|ĐỊA/i.test(text) };
}

const attempts = [];
let passed = false;
let winner = null;

for (const profile of profiles) {
  let worker = null;
  try {
    resultEl.textContent = `RUNNING ${profile.id}`;
    worker = await timeout(window.Tesseract.createWorker(['vie', 'eng'], 1, {
      ...profile.options,
      logger: () => {}
    }), 45000, `${profile.id} createWorker`);

    const canvas = makeCanvas();
    const canvasResult = await timeout(worker.recognize(canvas), 45000, `${profile.id} recognize canvas`);
    const canvasText = usableText(canvasResult?.data?.text);

    const blob = await canvasBlob(canvas);
    const blobResult = await timeout(worker.recognize(blob), 45000, `${profile.id} recognize blob`);
    const blobText = usableText(blobResult?.data?.text);

    const ok = canvasText.ok && blobText.ok;
    attempts.push({
      id: profile.id,
      ok,
      canvas_text: canvasText.text.slice(0, 220),
      blob_text: blobText.text.slice(0, 220),
      blob_bytes: blob.size
    });
    if (ok) {
      passed = true;
      winner = profile.id;
      break;
    }
  } catch (error) {
    attempts.push({ id: profile.id, ok: false, error: errorText(error) });
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* no-op */ }
    }
  }
}

const payload = { passed, winner, attempts };
document.body.dataset.result = passed ? 'PASS' : 'FAIL';
resultEl.textContent = JSON.stringify(payload, null, 2);
document.title = passed ? `PASS:${winner}` : 'FAIL:OCR';
