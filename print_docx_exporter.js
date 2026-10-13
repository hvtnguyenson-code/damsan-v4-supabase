/* Dam San native DOCX exporter 077
 * Converts the existing print HTML into a real OOXML .docx package.
 * The print HTML/layout remains authoritative; this module only replaces packaging.
 */
(function (global) {
  'use strict';

  const VERSION = '20261013-native-docx-078';
  const DOCX_VERSION = '9.10.0';
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const A4_WIDTH_TWIP = 11906;
  const A4_HEIGHT_TWIP = 16838;
  const DEFAULT_FOOTER_TWIP = 567;
  const DOCX_SOURCES = [
    'https://cdn.jsdelivr.net/npm/docx@' + DOCX_VERSION + '/dist/index.iife.js',
    'https://unpkg.com/docx@' + DOCX_VERSION + '/dist/index.iife.js'
  ];

  let loaderPromise = null;

  function ensureDocxReady() {
    if (global.docx && global.docx.Document && global.docx.Packer) {
      return Promise.resolve(global.docx);
    }
    if (loaderPromise) return loaderPromise;

    loaderPromise = new Promise(function (resolve, reject) {
      let index = 0;

      function tryNext(lastError) {
        if (global.docx && global.docx.Document && global.docx.Packer) {
          resolve(global.docx);
          return;
        }
        if (index >= DOCX_SOURCES.length) {
          reject(lastError || new Error('Không tải được thư viện tạo DOCX chuẩn.'));
          return;
        }

        const src = DOCX_SOURCES[index++];
        const existing = document.querySelector('script[data-damsan-docx-src="' + src + '"]');
        if (existing) {
          if (existing.dataset.loaded === '1' && global.docx) {
            resolve(global.docx);
            return;
          }
          existing.addEventListener('load', function () {
            existing.dataset.loaded = '1';
            if (global.docx) resolve(global.docx);
            else tryNext(new Error('Thư viện DOCX đã tải nhưng không tạo được global docx.'));
          }, { once: true });
          existing.addEventListener('error', function () {
            tryNext(new Error('Lỗi tải ' + src));
          }, { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.damsanDocxSrc = src;
        script.onload = function () {
          script.dataset.loaded = '1';
          if (global.docx && global.docx.Document && global.docx.Packer) {
            resolve(global.docx);
          } else {
            tryNext(new Error('Thư viện DOCX không khởi tạo đúng sau khi tải ' + src));
          }
        };
        script.onerror = function () {
          tryNext(new Error('Lỗi tải ' + src));
        };
        document.head.appendChild(script);
      }

      tryNext();
    }).catch(function (error) {
      loaderPromise = null;
      throw error;
    });

    return loaderPromise;
  }

  function cmToTwip(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 566.9291338583) : 0;
  }

  function ptToTwip(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 20) : 0;
  }

  function ptToHalfPoint(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(1, Math.round(n * 2)) : 24;
  }

  function parsePt(value, fallback) {
    const match = String(value || '').match(/(-?\d+(?:\.\d+)?)\s*pt/i);
    return match ? Number(match[1]) : fallback;
  }

  function parsePercent(value, fallback) {
    const match = String(value || '').match(/(-?\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : fallback;
  }

  function normalizeFontName(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    return raw.split(',')[0].trim().replace(/^['"]|['"]$/g, '') || fallback;
  }

  function colorToHex(value, fallback) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return fallback || '000000';
    if (/^#[0-9a-f]{6}$/.test(v)) return v.slice(1).toUpperCase();
    if (/^#[0-9a-f]{3}$/.test(v)) {
      return (v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
    }
    if (v === 'red') return 'FF0000';
    if (v === 'black') return '000000';
    if (v === 'white') return 'FFFFFF';
    if (v === 'gray' || v === 'grey') return '808080';
    const rgb = v.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgb) {
      return [rgb[1], rgb[2], rgb[3]].map(function (n) {
        return Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
      }).join('').toUpperCase();
    }
    return fallback || '000000';
  }

  function defaultTextStyle(options) {
    const body = (options && options.bodyStyle) || {};
    return {
      font: body.font || 'Times New Roman',
      sizePt: Number(body.size) || 12,
      bold: !!body.bold,
      italics: !!body.italic,
      underline: !!body.underline,
      color: '000000',
      alignment: body.align || 'justify',
      line: Number(body.line) || 1.15,
      beforePt: Number(body.before) || 0,
      afterPt: Number(body.after) || 3,
      leftPt: 0,
      superScript: false,
      subScript: false
    };
  }

  function copyStyle(style) {
    return Object.assign({}, style || {});
  }

  function styleFromElement(el, inherited) {
    const next = copyStyle(inherited);
    if (!el || !el.style) return next;

    if (el.style.fontFamily) next.font = normalizeFontName(el.style.fontFamily, next.font);
    if (el.style.fontSize) next.sizePt = parsePt(el.style.fontSize, next.sizePt);
    if (el.style.fontWeight) {
      const fw = String(el.style.fontWeight).toLowerCase();
      next.bold = fw === 'bold' || Number(fw) >= 600;
    }
    if (el.style.fontStyle) next.italics = String(el.style.fontStyle).toLowerCase() === 'italic';
    if (el.style.textDecoration) next.underline = String(el.style.textDecoration).toLowerCase().indexOf('underline') >= 0;
    if (el.style.color) next.color = colorToHex(el.style.color, next.color);
    if (el.style.textAlign) next.alignment = el.style.textAlign;
    if (el.style.lineHeight) {
      const pct = parsePercent(el.style.lineHeight, null);
      if (pct != null) next.line = pct / 100;
    }
    if (el.style.marginTop) next.beforePt = parsePt(el.style.marginTop, next.beforePt);
    if (el.style.marginBottom) next.afterPt = parsePt(el.style.marginBottom, next.afterPt);
    if (el.style.marginLeft) next.leftPt = parsePt(el.style.marginLeft, next.leftPt || 0);

    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'b' || tag === 'strong') next.bold = true;
    if (tag === 'i' || tag === 'em') next.italics = true;
    if (tag === 'u') next.underline = true;
    if (tag === 'sup') next.superScript = true;
    if (tag === 'sub') next.subScript = true;
    return next;
  }

  function alignmentValue(api, value) {
    const v = String(value || '').toLowerCase();
    if (v === 'center') return api.AlignmentType.CENTER;
    if (v === 'right') return api.AlignmentType.RIGHT;
    if (v === 'left') return api.AlignmentType.LEFT;
    if (v === 'justify') return api.AlignmentType.JUSTIFIED;
    return api.AlignmentType.JUSTIFIED;
  }

  function borderNone(api) {
    return {
      top: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: api.BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    };
  }

  function borderSingle(api) {
    return {
      top: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' },
      left: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' },
      insideHorizontal: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' },
      insideVertical: { style: api.BorderStyle.SINGLE, size: 4, color: '000000' }
    };
  }

  function paragraphOptions(api, style) {
    const s = style || {};
    return {
      alignment: alignmentValue(api, s.alignment),
      spacing: {
        before: ptToTwip(s.beforePt || 0),
        after: ptToTwip(s.afterPt || 0),
        line: Math.max(1, Math.round(240 * (Number(s.line) || 1.15)))
      },
      indent: (s.leftPt || 0) ? { left: ptToTwip(s.leftPt) } : undefined
    };
  }

  function textRun(api, text, style) {
    const s = style || {};
    const options = {
      text: String(text == null ? '' : text),
      font: s.font || 'Times New Roman',
      size: ptToHalfPoint(s.sizePt || 12),
      bold: !!s.bold,
      italics: !!s.italics,
      color: s.color || '000000'
    };
    if (s.underline) options.underline = { type: api.UnderlineType.SINGLE };
    if (s.superScript) options.superScript = true;
    if (s.subScript) options.subScript = true;
    return new api.TextRun(options);
  }

  function normalizeTextNode(value) {
    return String(value || '').replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
  }

  function decodeDataUrl(src) {
    const match = String(src || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
    if (!match) return null;
    const mime = (match[1] || 'application/octet-stream').toLowerCase();
    let bytes;
    if (match[2]) {
      const binary = atob(match[3]);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      const decoded = decodeURIComponent(match[3]);
      bytes = new TextEncoder().encode(decoded);
    }
    return { mime: mime, bytes: bytes };
  }

  function imageTypeFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/bmp') return 'bmp';
    if (mime === 'image/svg+xml') return 'svg';
    return null;
  }

  function imageDimensions(src, el) {
    const attrW = Number(el && (el.getAttribute('width') || (el.style && el.style.width && parseFloat(el.style.width))));
    const attrH = Number(el && (el.getAttribute('height') || (el.style && el.style.height && parseFloat(el.style.height))));
    if (attrW > 0 && attrH > 0) return Promise.resolve({ width: attrW, height: attrH });

    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 });
      };
      image.onerror = function () {
        reject(new Error('Không đọc được kích thước hình ảnh để nhúng vào DOCX.'));
      };
      image.src = src;
    });
  }

  async function imageRun(api, el, ctx) {
    const src = el.getAttribute('src') || '';
    let payload = decodeDataUrl(src);

    if (!payload && /^https?:/i.test(src)) {
      const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error('Không tải được hình ảnh ngoài để nhúng vào DOCX.');
      const blob = await response.blob();
      payload = { mime: blob.type || 'application/octet-stream', bytes: new Uint8Array(await blob.arrayBuffer()) };
    }

    if (!payload) throw new Error('DOCX chuẩn chỉ nhúng được hình ảnh có dữ liệu hợp lệ.');
    const type = imageTypeFromMime(payload.mime);
    if (!type) throw new Error('Định dạng hình ảnh chưa được hỗ trợ khi xuất DOCX: ' + payload.mime);

    const dims = await imageDimensions(src, el);
    const maxWidth = Math.max(100, Number(ctx.maxImageWidthPx) || 600);
    const scale = dims.width > maxWidth ? maxWidth / dims.width : 1;
    const width = Math.max(1, Math.round(dims.width * scale));
    const height = Math.max(1, Math.round(dims.height * scale));

    return new api.ImageRun({
      type: type,
      data: payload.bytes,
      transformation: { width: width, height: height }
    });
  }

  async function inlineChildren(api, node, inherited, ctx) {
    const output = [];
    const children = Array.from(node.childNodes || []);

    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const txt = normalizeTextNode(child.nodeValue);
        if (txt) output.push(textRun(api, txt, inherited));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = String(child.tagName || '').toLowerCase();
      const style = styleFromElement(child, inherited);

      if (tag === 'br') {
        output.push(new api.TextRun({ text: '', break: 1, font: style.font || inherited.font, size: ptToHalfPoint(style.sizePt || inherited.sizePt || 12) }));
      } else if (tag === 'img') {
        output.push(await imageRun(api, child, ctx));
      } else if (tag === 'span') {
        const msoField = child.getAttribute('style') || '';
        if (/mso-field-code/i.test(msoField)) continue;
        output.push.apply(output, await inlineChildren(api, child, style, ctx));
      } else if (tag === 'b' || tag === 'strong' || tag === 'i' || tag === 'em' || tag === 'u' || tag === 'sup' || tag === 'sub' || tag === 'font' || tag === 'a') {
        output.push.apply(output, await inlineChildren(api, child, style, ctx));
      } else {
        output.push.apply(output, await inlineChildren(api, child, style, ctx));
      }
    }

    return output;
  }

  function isIgnorableEmptyParagraph(el) {
    if (!el || String(el.tagName || '').toLowerCase() !== 'p') return false;
    const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;
    // Preserve genuinely intentional visual content. The empty <p></p> artifacts
    // produced around Word <br> normalization must not become a real DOCX line.
    if (el.querySelector && el.querySelector('img,table,hr,br')) return false;
    return true;
  }

  async function paragraphFromElement(api, el, inherited, ctx) {
    const style = styleFromElement(el, inherited);
    const runs = await inlineChildren(api, el, style, ctx);
    return new api.Paragraph(Object.assign(paragraphOptions(api, style), { children: runs }));
  }

  function tablePercent(el) {
    const styleWidth = el && el.style ? el.style.width : '';
    const pct = parsePercent(styleWidth, null);
    if (pct != null) return Math.max(1, Math.min(100, pct));
    const attrWidth = el && el.getAttribute ? el.getAttribute('width') : '';
    const attrPct = parsePercent(attrWidth, null);
    if (attrPct != null) return Math.max(1, Math.min(100, attrPct));
    return 100;
  }

  function isBorderedTable(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains('da')) return true;
    const borderAttr = el.getAttribute && el.getAttribute('border');
    if (borderAttr && borderAttr !== '0') return true;
    return false;
  }

  function cellHasBorder(cell) {
    const border = cell && cell.style ? String(cell.style.border || '') : '';
    return !!border && border !== 'none' && border.indexOf('0') !== 0;
  }

  function inferColumnPercentages(table, count) {
    if (count <= 0) return [];
    const text = String(table.textContent || '');
    if (count === 2 && /Họ tên học sinh/i.test(text) && /MÃ ĐỀ/i.test(text)) return [78, 22];
    if (count === 2 && /TRƯỜNG/i.test(text) && (/KIỂM TRA/i.test(text) || /ĐÁP ÁN CHÍNH THỨC/i.test(text))) return [45, 55];

    const firstRow = table.rows && table.rows.length ? table.rows[0] : null;
    if (firstRow) {
      const explicit = Array.from(firstRow.cells || []).map(function (cell) {
        return parsePercent(cell.style && cell.style.width, null);
      });
      if (explicit.length === count && explicit.every(function (v) { return v != null && v > 0; })) {
        const sum = explicit.reduce(function (a, b) { return a + b; }, 0);
        return explicit.map(function (v) { return v / sum * 100; });
      }
    }
    return new Array(count).fill(100 / count);
  }

  async function tableFromElement(api, table, inherited, ctx) {
    const rowElements = Array.from(table.rows || []);
    if (!rowElements.length) return new api.Paragraph({ children: [] });

    const maxColumns = rowElements.reduce(function (max, row) {
      return Math.max(max, Array.from(row.cells || []).reduce(function (sum, cell) { return sum + (cell.colSpan || 1); }, 0));
    }, 0);

    const percent = tablePercent(table);
    const tableWidth = Math.max(1, Math.round(ctx.contentWidthTwip * percent / 100));
    const columnPercents = inferColumnPercentages(table, maxColumns);
    const columnWidths = columnPercents.map(function (p) { return Math.max(1, Math.round(tableWidth * p / 100)); });
    const tableBordered = isBorderedTable(table);
    const rows = [];

    for (const rowEl of rowElements) {
      const cells = [];
      let colIndex = 0;
      for (const cellEl of Array.from(rowEl.cells || [])) {
        const span = Math.max(1, cellEl.colSpan || 1);
        const widthTwip = columnWidths.slice(colIndex, colIndex + span).reduce(function (a, b) { return a + b; }, 0) || Math.round(tableWidth / maxColumns);
        colIndex += span;

        let cellStyle = styleFromElement(cellEl, inherited);
        if (table.classList && table.classList.contains('da')) cellStyle.alignment = 'center';
        if (String(cellEl.tagName || '').toLowerCase() === 'th') {
          cellStyle.bold = true;
          cellStyle.alignment = 'center';
        }

        let children = await containerChildren(api, cellEl, cellStyle, Object.assign({}, ctx, { contentWidthTwip: widthTwip - 120 }));
        if (!children.length) children = [new api.Paragraph({ children: [] })];

        const useBorder = tableBordered || cellHasBorder(cellEl);
        const cellOptions = {
          children: children,
          verticalAlign: api.VerticalAlign.CENTER,
          width: { size: widthTwip, type: api.WidthType.DXA },
          borders: useBorder ? borderSingle(api) : borderNone(api),
          margins: { top: 72, bottom: 72, left: 90, right: 90 }
        };
        if (span > 1) cellOptions.columnSpan = span;
        if (String(cellEl.tagName || '').toLowerCase() === 'th' && api.ShadingType) {
          cellOptions.shading = { fill: 'F2F2F2', type: api.ShadingType.CLEAR };
        }
        cells.push(new api.TableCell(cellOptions));
      }

      rows.push(new api.TableRow({ children: cells, cantSplit: false }));
    }

    return new api.Table({
      rows: rows,
      width: { size: tableWidth, type: api.WidthType.DXA },
      columnWidths: columnWidths,
      layout: api.TableLayoutType.FIXED,
      alignment: api.AlignmentType.CENTER,
      borders: tableBordered ? borderSingle(api) : borderNone(api)
    });
  }

  async function divAsCenteredParagraph(api, el, inherited, ctx) {
    const style = styleFromElement(el, inherited);
    style.alignment = 'center';
    const runs = await inlineChildren(api, el, style, ctx);
    return new api.Paragraph(Object.assign(paragraphOptions(api, style), { children: runs }));
  }

  async function containerChildren(api, root, inherited, ctx) {
    const out = [];
    let inlineBuffer = [];

    async function flushInline() {
      if (!inlineBuffer.length) return;
      const holder = document.createElement('span');
      inlineBuffer.forEach(function (n) { holder.appendChild(n.cloneNode(true)); });
      const runs = await inlineChildren(api, holder, inherited, ctx);
      if (runs.length) out.push(new api.Paragraph(Object.assign(paragraphOptions(api, inherited), { children: runs })));
      inlineBuffer = [];
    }

    for (const child of Array.from(root.childNodes || [])) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (normalizeTextNode(child.nodeValue).trim()) inlineBuffer.push(child);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = String(child.tagName || '').toLowerCase();
      const styleText = child.getAttribute('style') || '';
      if (child.id === 'f1' || /mso-element\s*:\s*footer/i.test(styleText)) {
        continue;
      }

      if (tag === 'p' || /^h[1-6]$/.test(tag)) {
        await flushInline();
        if (tag === 'p' && isIgnorableEmptyParagraph(child)) continue;
        out.push(await paragraphFromElement(api, child, inherited, ctx));
      } else if (tag === 'table') {
        await flushInline();
        out.push(await tableFromElement(api, child, inherited, ctx));
      } else if (tag === 'hr') {
        await flushInline();
        out.push(new api.Paragraph({
          spacing: { before: 0, after: 240 },
          border: { bottom: { style: api.BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
          children: []
        }));
      } else if (tag === 'div') {
        await flushInline();
        const align = String(child.getAttribute('align') || child.style.textAlign || '').toLowerCase();
        const directBlock = Array.from(child.children || []).some(function (e) {
          const t = String(e.tagName || '').toLowerCase();
          return t === 'p' || t === 'table' || t === 'hr' || /^h[1-6]$/.test(t) || t === 'div';
        });
        if (align === 'center' && !directBlock) {
          out.push(await divAsCenteredParagraph(api, child, inherited, ctx));
        } else {
          out.push.apply(out, await containerChildren(api, child, styleFromElement(child, inherited), ctx));
        }
      } else if (tag === 'br') {
        await flushInline();
      } else {
        inlineBuffer.push(child);
      }
    }

    await flushInline();
    return out;
  }

  function footerFromHtml(api, parsed, baseStyle) {
    const footerEl = parsed.querySelector('#f1') || Array.from(parsed.querySelectorAll('div')).find(function (el) {
      return /mso-element\s*:\s*footer/i.test(el.getAttribute('style') || '');
    });

    const text = footerEl ? String(footerEl.textContent || '') : '';
    const codeMatch = text.match(/Mã đề\s+([^\s-]+)/i);
    const prefix = codeMatch ? ('Mã đề ' + codeMatch[1] + ' - Trang ') : 'Trang ';
    const footerStyle = copyStyle(baseStyle);
    footerStyle.alignment = 'right';
    footerStyle.bold = false;
    footerStyle.italics = false;
    footerStyle.underline = false;
    footerStyle.beforePt = 0;
    footerStyle.afterPt = 0;

    return new api.Footer({
      children: [
        new api.Paragraph(Object.assign(paragraphOptions(api, footerStyle), {
          children: [
            new api.TextRun({
              font: footerStyle.font || 'Times New Roman',
              size: ptToHalfPoint(footerStyle.sizePt || 12),
              children: [prefix, api.PageNumber.CURRENT, ' / ', api.PageNumber.TOTAL_PAGES]
            })
          ]
        }))
      ]
    });
  }

  function buildContext(options) {
    const margins = (options && options.marginsCm) || {};
    const left = cmToTwip(margins.left);
    const right = cmToTwip(margins.right);
    const top = cmToTwip(margins.top);
    const bottom = cmToTwip(margins.bottom);
    const contentWidthTwip = Math.max(1000, A4_WIDTH_TWIP - left - right);
    const maxImageWidthPx = Math.max(100, Math.floor(contentWidthTwip / 20 * 96 / 72));
    return {
      margins: { top: top, right: right, bottom: bottom, left: left, footer: DEFAULT_FOOTER_TWIP },
      contentWidthTwip: contentWidthTwip,
      maxImageWidthPx: Math.min(600, maxImageWidthPx)
    };
  }

  function sanitizeFilename(filename) {
    const raw = String(filename || 'DeThi.docx').replace(/[\\/:*?"<>|]+/g, '_');
    return /\.docx$/i.test(raw) ? raw : raw.replace(/\.doc$/i, '') + '.docx';
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = sanitizeFilename(filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function buildDocument(options) {
    const api = await ensureDocxReady();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(String(options.html || ''), 'text/html');
    const baseStyle = defaultTextStyle(options);
    const ctx = buildContext(options);
    const body = parsed.body;
    if (!body) throw new Error('Không đọc được nội dung bản in để tạo DOCX.');

    const footer = footerFromHtml(api, parsed, baseStyle);
    const children = await containerChildren(api, body, baseStyle, ctx);
    if (!children.length) throw new Error('Bản in không có nội dung để xuất DOCX.');

    const page = {
      size: {
        width: A4_WIDTH_TWIP,
        height: A4_HEIGHT_TWIP,
        orientation: api.PageOrientation.PORTRAIT
      },
      margin: ctx.margins,
      pageNumbers: api.NumberFormat ? { start: 1, formatType: api.NumberFormat.DECIMAL } : { start: 1 }
    };

    const doc = new api.Document({
      creator: 'Dam San Online Test',
      title: sanitizeFilename(options.filename || 'DeThi.docx'),
      description: 'Native OOXML export generated from the Dam San print layout.',
      sections: [{
        properties: { page: page },
        footers: { default: footer },
        children: children
      }]
    });

    return { api: api, doc: doc };
  }

  async function packDocument(options) {
    const built = await buildDocument(options);
    const packed = await built.api.Packer.toBlob(built.doc);
    const buffer = await packed.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
      throw new Error('Bộ tạo DOCX không trả về gói OOXML hợp lệ (thiếu ZIP signature).');
    }
    return new Blob([buffer], { type: MIME });
  }

  async function downloadHtml(options) {
    const filename = sanitizeFilename(options && options.filename);
    const blob = await packDocument(options || {});
    triggerDownload(blob, filename);
    return { filename: filename, size: blob.size, mime: MIME, version: VERSION };
  }

  global.DamSanDocxExporter = Object.freeze({
    version: VERSION,
    libraryVersion: DOCX_VERSION,
    mime: MIME,
    ensureReady: ensureDocxReady,
    buildDocument: buildDocument,
    packDocument: packDocument,
    downloadHtml: downloadHtml,
    sanitizeFilename: sanitizeFilename,
    constants: Object.freeze({
      A4_WIDTH_TWIP: A4_WIDTH_TWIP,
      A4_HEIGHT_TWIP: A4_HEIGHT_TWIP
    })
  });
})(window);
