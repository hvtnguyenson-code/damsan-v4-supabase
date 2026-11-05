export type StimulusObject = Record<string, unknown>;

export type StimulusRender104 = {
  normalized: StimulusObject;
  html: string;
  types: string[];
  table_count: number;
  image_count: number;
};

const SUPPORTED_TYPES = [
  "TABLE",
  "CHART",
  "MAP",
  "SCHEMATIC_MAP",
  "IMAGE",
  "DIAGRAM",
  "CLIMOGRAPH",
  "CROSS_SECTION",
  "MULTI_SOURCE",
] as const;

const CHART_KINDS = ["BAR", "LINE", "GROUPED_BAR", "STACKED_100"] as const;
const MAX_RENDERED_HTML = 180000;
const MAX_IMAGE_DATA_URI = 1500000;

function fail(code: string): never {
  throw new Error(code);
}

function objectValue(value: unknown, code = "stimulus_invalid"): StimulusObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as StimulusObject;
}

function textValue(value: unknown, max: number, required = false, code = "stimulus_text_invalid") {
  const out = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (required && !out) fail(code);
  return out;
}

function finiteNumber(value: unknown, min = -1e12, max = 1e12, code = "stimulus_number_invalid") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(code);
  return n;
}

function textArray(value: unknown, min: number, max: number, itemMax = 120, code = "stimulus_array_invalid") {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code);
  return value.map((item) => textValue(item, itemMax, true, code));
}

function numberArray(value: unknown, min: number, max: number, code = "stimulus_array_invalid") {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code);
  return value.map((item) => finiteNumber(item, -1e12, 1e12, code));
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeClassToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "stimulus";
}

function binaryBase64(bytes: Uint8Array) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(out);
}

function svgDataUrl(svg: string) {
  return "data:image/svg+xml;base64," + binaryBase64(new TextEncoder().encode(svg));
}

function common(raw: StimulusObject) {
  return {
    intro: textValue(raw.intro, 600),
    title: textValue(raw.title, 300),
    caption: textValue(raw.caption, 500),
    unit: textValue(raw.unit, 80),
    source_note: textValue(raw.source_note, 600),
  };
}

function commonTop(c: ReturnType<typeof common>, type: string) {
  return [
    c.intro ? `<div data-damsan-stimulus-intro='1' class='damsan-stimulus-intro'>${esc(c.intro)}</div>` : "",
    c.title ? `<div data-damsan-stimulus-title='1' class='damsan-stimulus-title'>${esc(c.title)}</div>` : "",
    `<div data-damsan-stimulus-kind='${esc(type)}' class='damsan-stimulus-kind'>${esc(type.replaceAll("_", " "))}</div>`,
  ].join("");
}

function commonBottom(c: ReturnType<typeof common>) {
  return [
    c.caption ? `<div data-damsan-stimulus-caption='1' class='damsan-stimulus-caption'>${esc(c.caption)}</div>` : "",
    c.unit ? `<div data-damsan-stimulus-unit='1' class='damsan-stimulus-unit'>Đơn vị: ${esc(c.unit)}</div>` : "",
    c.source_note ? `<div data-damsan-stimulus-source='1' class='damsan-stimulus-source'>Nguồn: ${esc(c.source_note)}</div>` : "",
  ].join("");
}

function imgHtml(type: string, dataUrl: string, alt: string, width: number, height: number) {
  return `<img data-damsan-stimulus-image='1' data-damsan-stimulus='${esc(type)}' class='damsan-stimulus-image damsan-stimulus-${safeClassToken(type)}' src='${dataUrl}' alt='${esc(alt)}' width='${width}' height='${height}'>`;
}

function renderTable(raw: StimulusObject, part: string): StimulusRender104 {
  const c = common(raw);
  const headers = textArray(raw.headers, 2, 12, 120, "stimulus_table_headers_invalid");
  if (!Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > 30) fail("stimulus_table_rows_invalid");

  const rows = raw.rows.map((row) => {
    if (!Array.isArray(row) || row.length !== headers.length) fail("stimulus_table_shape_invalid");
    return row.map((cell) => {
      if (typeof cell === "number") {
        if (!Number.isFinite(cell)) fail("stimulus_table_cell_invalid");
        return cell;
      }
      return textValue(cell, 240, true, "stimulus_table_cell_invalid");
    });
  });

  const p3 = part === "3" ? " data-damsan-p3='1'" : "";
  const caption = c.caption || c.title;
  const table = `<table data-damsan-stimulus='TABLE'${p3} class='damsan-stimulus-table'>` +
    (caption ? `<caption>${esc(caption)}</caption>` : "") +
    `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((row) => `<tr>${row.map((cell, i) => i === 0 ? `<th>${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  const normalized = {
    schema_version: "DAMSAN_STIMULUS_V1",
    type: "TABLE",
    ...c,
    headers,
    rows,
  };

  return {
    normalized,
    html: `<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-table-wrap'>${commonTop(c, "TABLE")}${table}${commonBottom({ ...c, caption: "" })}</div>`,
    types: ["TABLE"],
    table_count: 1,
    image_count: 0,
  };
}

function normalizeSeries(raw: unknown, categories: string[]) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) fail("stimulus_chart_series_invalid");
  return raw.map((entry) => {
    const item = objectValue(entry, "stimulus_chart_series_invalid");
    const name = textValue(item.name, 120, true, "stimulus_chart_series_invalid");
    const values = numberArray(item.values, categories.length, categories.length, "stimulus_chart_series_invalid");
    return { name, values };
  });
}

function renderChart(raw: StimulusObject): StimulusRender104 {
  const c = common(raw);
  const kind = textValue(raw.chart_kind, 40, true, "stimulus_chart_kind_invalid").toUpperCase();
  if (!(CHART_KINDS as readonly string[]).includes(kind)) fail("stimulus_chart_kind_invalid");
  const categories = textArray(raw.categories, 2, 16, 80, "stimulus_chart_categories_invalid");
  const series = normalizeSeries(raw.series, categories);
  if (kind === "BAR" && series.length !== 1) fail("stimulus_chart_series_invalid");

  const width = 720, height = 380;
  const left = 58, right = 24, top = 44, bottom = 72;
  const plotW = width - left - right, plotH = height - top - bottom;
  const palette = ["#334155", "#0f766e", "#64748b", "#475569"];

  let minY = 0, maxY = 1;
  if (kind === "STACKED_100") {
    for (let i = 0; i < categories.length; i++) {
      const total = series.reduce((sum, s) => sum + s.values[i], 0);
      if (total <= 0 || series.some((s) => s.values[i] < 0)) fail("stimulus_chart_stacked_invalid");
    }
    minY = 0; maxY = 100;
  } else {
    const all = series.flatMap((s) => s.values);
    minY = Math.min(0, ...all);
    maxY = Math.max(0, ...all);
    if (maxY === minY) maxY = minY + 1;
  }

  const scaleY = (value: number) => top + plotH - ((value - minY) / (maxY - minY)) * plotH;
  const baseline = scaleY(0);
  const parts: string[] = [
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>`,
    "<rect width='100%' height='100%' fill='white'/>",
    `<text x='${width / 2}' y='24' text-anchor='middle' font-size='16' font-weight='700' fill='#111827'>${esc(c.title || "Biểu đồ")}</text>`,
  ];

  for (let tick = 0; tick <= 5; tick++) {
    const value = minY + (maxY - minY) * tick / 5;
    const y = scaleY(value);
    parts.push(`<line x1='${left}' y1='${y.toFixed(1)}' x2='${width - right}' y2='${y.toFixed(1)}' stroke='#e5e7eb' stroke-width='1'/>`);
    parts.push(`<text x='${left - 8}' y='${(y + 4).toFixed(1)}' text-anchor='end' font-size='11' fill='#475569'>${esc(Number(value.toFixed(1)))}</text>`);
  }

  parts.push(`<line x1='${left}' y1='${top}' x2='${left}' y2='${top + plotH}' stroke='#475569'/>`);
  parts.push(`<line x1='${left}' y1='${baseline.toFixed(1)}' x2='${width - right}' y2='${baseline.toFixed(1)}' stroke='#475569'/>`);

  const groupW = plotW / categories.length;
  if (kind === "BAR" || kind === "GROUPED_BAR") {
    const barGroupW = groupW * 0.72;
    const barW = barGroupW / series.length;
    categories.forEach((category, i) => {
      series.forEach((s, si) => {
        const value = s.values[i];
        const y = scaleY(value);
        const x = left + i * groupW + (groupW - barGroupW) / 2 + si * barW;
        const h = Math.abs(baseline - y);
        parts.push(`<rect x='${x.toFixed(1)}' y='${Math.min(y, baseline).toFixed(1)}' width='${Math.max(2, barW - 2).toFixed(1)}' height='${Math.max(1, h).toFixed(1)}' fill='${palette[si]}'/>`);
      });
      parts.push(`<text x='${(left + i * groupW + groupW / 2).toFixed(1)}' y='${height - 50}' text-anchor='middle' font-size='10' fill='#334155'>${esc(category.slice(0, 14))}</text>`);
    });
  } else if (kind === "STACKED_100") {
    categories.forEach((category, i) => {
      const total = series.reduce((sum, s) => sum + s.values[i], 0);
      let acc = 0;
      series.forEach((s, si) => {
        const pct = s.values[i] / total * 100;
        const yTop = scaleY(acc + pct), yBottom = scaleY(acc);
        const x = left + i * groupW + groupW * 0.18;
        parts.push(`<rect x='${x.toFixed(1)}' y='${yTop.toFixed(1)}' width='${(groupW * 0.64).toFixed(1)}' height='${Math.max(1, yBottom - yTop).toFixed(1)}' fill='${palette[si]}'/>`);
        acc += pct;
      });
      parts.push(`<text x='${(left + i * groupW + groupW / 2).toFixed(1)}' y='${height - 50}' text-anchor='middle' font-size='10' fill='#334155'>${esc(category.slice(0, 14))}</text>`);
    });
  } else {
    series.forEach((s, si) => {
      const points = categories.map((_, i) => {
        const x = left + groupW * (i + 0.5);
        const y = scaleY(s.values[i]);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      parts.push(`<polyline points='${points}' fill='none' stroke='${palette[si]}' stroke-width='3'/>`);
      categories.forEach((category, i) => {
        const x = left + groupW * (i + 0.5), y = scaleY(s.values[i]);
        parts.push(`<circle cx='${x.toFixed(1)}' cy='${y.toFixed(1)}' r='3.5' fill='${palette[si]}'/>`);
        if (si === 0) parts.push(`<text x='${x.toFixed(1)}' y='${height - 50}' text-anchor='middle' font-size='10' fill='#334155'>${esc(category.slice(0, 14))}</text>`);
      });
    });
  }

  series.forEach((s, si) => {
    const lx = left + si * 150;
    parts.push(`<rect x='${lx}' y='${height - 24}' width='12' height='12' fill='${palette[si]}'/><text x='${lx + 18}' y='${height - 14}' font-size='10' fill='#334155'>${esc(s.name.slice(0, 22))}</text>`);
  });
  if (c.unit) parts.push(`<text x='${left}' y='${top - 8}' font-size='10' fill='#475569'>Đơn vị: ${esc(c.unit)}</text>`);
  parts.push("</svg>");

  const dataUrl = svgDataUrl(parts.join(""));
  const normalized = {
    schema_version: "DAMSAN_STIMULUS_V1",
    type: "CHART",
    ...c,
    chart_kind: kind,
    categories,
    series,
  };
  return {
    normalized,
    html: `<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-chart'>${commonTop({ ...c, title: "" }, "CHART")}${imgHtml("CHART", dataUrl, c.title || "Biểu đồ", width, height)}${commonBottom(c)}</div>`,
    types: ["CHART"],
    table_count: 0,
    image_count: 1,
  };
}

type XY = { x: number; y: number };

function xyPoint(value: unknown, code: string): XY {
  const o = objectValue(value, code);
  return {
    x: finiteNumber(o.x, 0, 100, code),
    y: finiteNumber(o.y, 0, 100, code),
  };
}

function renderMap(raw: StimulusObject, type: "MAP" | "SCHEMATIC_MAP"): StimulusRender104 {
  const c = common(raw);
  const geometryMode = textValue(raw.geometry_mode, 40, true, "stimulus_map_geometry_invalid").toUpperCase();
  const geometryProvenance = textValue(raw.geometry_provenance, 600, type === "MAP", "stimulus_map_provenance_required");
  if (type === "MAP" && geometryMode !== "SOURCE_GROUNDED") fail("stimulus_map_geometry_invalid");
  if (type === "SCHEMATIC_MAP" && !["SCHEMATIC", "SOURCE_GROUNDED"].includes(geometryMode)) fail("stimulus_map_geometry_invalid");

  const rawPaths = Array.isArray(raw.paths) ? raw.paths : [];
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  if (!rawPaths.length && !rawPoints.length) fail("stimulus_map_geometry_invalid");
  if (rawPaths.length > 12 || rawPoints.length > 30) fail("stimulus_map_geometry_invalid");

  const paths = rawPaths.map((entry) => {
    const o = objectValue(entry, "stimulus_map_geometry_invalid");
    if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length > 100) fail("stimulus_map_geometry_invalid");
    return {
      points: o.points.map((p) => xyPoint(p, "stimulus_map_geometry_invalid")),
      closed: o.closed === true,
      label: textValue(o.label, 120),
    };
  });
  const points = rawPoints.map((entry) => {
    const o = objectValue(entry, "stimulus_map_geometry_invalid");
    const p = xyPoint(o, "stimulus_map_geometry_invalid");
    return { ...p, label: textValue(o.label, 120), symbol: textValue(o.symbol, 20) || "●" };
  });

  const width = 720, height = 420, padX = 52, padY = 48;
  const sx = (x: number) => padX + x / 100 * (width - padX * 2);
  const sy = (y: number) => padY + (100 - y) / 100 * (height - padY * 2);
  const parts = [
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>`,
    "<rect width='100%' height='100%' fill='white'/>",
    `<rect x='${padX}' y='${padY}' width='${width-padX*2}' height='${height-padY*2}' fill='#f8fafc' stroke='#94a3b8'/>`,
    `<text x='${width/2}' y='26' text-anchor='middle' font-size='16' font-weight='700' fill='#111827'>${esc(c.title || (type === "MAP" ? "Bản đồ" : "Lược đồ"))}</text>`,
  ];

  paths.forEach((path) => {
    const pointString = path.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    if (path.closed) parts.push(`<polygon points='${pointString}' fill='#e2e8f0' stroke='#334155' stroke-width='2'/>`);
    else parts.push(`<polyline points='${pointString}' fill='none' stroke='#334155' stroke-width='2'/>`);
    if (path.label) {
      const avgX = path.points.reduce((s,p)=>s+p.x,0)/path.points.length;
      const avgY = path.points.reduce((s,p)=>s+p.y,0)/path.points.length;
      parts.push(`<text x='${sx(avgX)}' y='${sy(avgY)}' text-anchor='middle' font-size='11' fill='#111827'>${esc(path.label)}</text>`);
    }
  });
  points.forEach((p) => {
    parts.push(`<circle cx='${sx(p.x)}' cy='${sy(p.y)}' r='4' fill='#0f766e'/>`);
    if (p.label) parts.push(`<text x='${sx(p.x)+7}' y='${sy(p.y)-7}' font-size='11' fill='#111827'>${esc(p.label)}</text>`);
  });
  parts.push(`<path d='M ${width-58} 78 L ${width-50} 56 L ${width-42} 78 Z' fill='#111827'/><line x1='${width-50}' y1='56' x2='${width-50}' y2='96' stroke='#111827' stroke-width='2'/><text x='${width-50}' y='48' text-anchor='middle' font-size='11'>B</text>`);
  parts.push("</svg>");

  const normalized = {
    schema_version: "DAMSAN_STIMULUS_V1",
    type,
    ...c,
    geometry_mode: geometryMode,
    geometry_provenance: geometryProvenance,
    paths,
    points,
  };
  return {
    normalized,
    html: `<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-map'>${commonTop({ ...c, title: "" }, type)}${imgHtml(type, svgDataUrl(parts.join("")), c.title || (type === "MAP" ? "Bản đồ" : "Lược đồ"), width, height)}${geometryProvenance ? `<div data-damsan-stimulus-provenance='1' class='damsan-stimulus-source'>Hình học: ${esc(geometryProvenance)}</div>` : ""}${commonBottom(c)}</div>`,
    types: [type],
    table_count: 0,
    image_count: 1,
  };
}

function renderDiagram(raw: StimulusObject): StimulusRender104 {
  const c = common(raw);
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 20) fail("stimulus_diagram_nodes_invalid");
  const nodes = raw.nodes.map((entry) => {
    const o = objectValue(entry, "stimulus_diagram_nodes_invalid");
    return {
      id: textValue(o.id, 60, true, "stimulus_diagram_nodes_invalid"),
      label: textValue(o.label, 160, true, "stimulus_diagram_nodes_invalid"),
      x: finiteNumber(o.x, 0, 100, "stimulus_diagram_nodes_invalid"),
      y: finiteNumber(o.y, 0, 100, "stimulus_diagram_nodes_invalid"),
    };
  });
  if (new Set(nodes.map((n)=>n.id)).size !== nodes.length) fail("stimulus_diagram_nodes_invalid");
  const nodeMap = new Map(nodes.map((n)=>[n.id,n]));
  if (!Array.isArray(raw.edges) || raw.edges.length < 1 || raw.edges.length > 30) fail("stimulus_diagram_edges_invalid");
  const edges = raw.edges.map((entry) => {
    const o = objectValue(entry, "stimulus_diagram_edges_invalid");
    const from = textValue(o.from, 60, true, "stimulus_diagram_edges_invalid");
    const to = textValue(o.to, 60, true, "stimulus_diagram_edges_invalid");
    if (!nodeMap.has(from) || !nodeMap.has(to)) fail("stimulus_diagram_edges_invalid");
    return { from, to, label: textValue(o.label, 120) };
  });

  const width = 720, height = 400, padX = 70, padY = 60;
  const sx = (x:number)=>padX+x/100*(width-padX*2);
  const sy = (y:number)=>padY+y/100*(height-padY*2);
  const parts = [
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>`,
    "<defs><marker id='arrow' markerWidth='10' markerHeight='10' refX='8' refY='3' orient='auto'><path d='M0,0 L0,6 L9,3 z' fill='#475569'/></marker></defs>",
    "<rect width='100%' height='100%' fill='white'/>",
    `<text x='${width/2}' y='28' text-anchor='middle' font-size='16' font-weight='700'>${esc(c.title || "Sơ đồ")}</text>`,
  ];
  edges.forEach((e)=>{
    const a=nodeMap.get(e.from)!, b=nodeMap.get(e.to)!;
    const ax=sx(a.x), ay=sy(a.y), bx=sx(b.x), by=sy(b.y);
    parts.push(`<line x1='${ax}' y1='${ay}' x2='${bx}' y2='${by}' stroke='#475569' stroke-width='2' marker-end='url(#arrow)'/>`);
    if(e.label) parts.push(`<text x='${(ax+bx)/2}' y='${(ay+by)/2-6}' text-anchor='middle' font-size='10' fill='#334155'>${esc(e.label)}</text>`);
  });
  nodes.forEach((n)=>{
    const x=sx(n.x), y=sy(n.y);
    parts.push(`<rect x='${x-62}' y='${y-22}' width='124' height='44' rx='8' fill='#f8fafc' stroke='#0f766e' stroke-width='2'/>`);
    parts.push(`<text x='${x}' y='${y+4}' text-anchor='middle' font-size='11' fill='#111827'>${esc(n.label.slice(0,28))}</text>`);
  });
  parts.push("</svg>");

  return {
    normalized: { schema_version:"DAMSAN_STIMULUS_V1", type:"DIAGRAM", ...c, nodes, edges },
    html: `<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-diagram'>${commonTop({ ...c, title:"" }, "DIAGRAM")}${imgHtml("DIAGRAM",svgDataUrl(parts.join("")),c.title||"Sơ đồ",width,height)}${commonBottom(c)}</div>`,
    types:["DIAGRAM"],table_count:0,image_count:1,
  };
}

function renderClimograph(raw: StimulusObject): StimulusRender104 {
  const c=common(raw);
  const months = raw.months == null
    ? ["1","2","3","4","5","6","7","8","9","10","11","12"]
    : textArray(raw.months,12,12,20,"stimulus_climograph_months_invalid");
  const temperature=numberArray(raw.temperature,12,12,"stimulus_climograph_temperature_invalid");
  const precipitation=numberArray(raw.precipitation,12,12,"stimulus_climograph_precipitation_invalid");
  if(precipitation.some((v)=>v<0)) fail("stimulus_climograph_precipitation_invalid");

  const width=720,height=400,left=62,right=62,top=48,bottom=58;
  const plotW=width-left-right,plotH=height-top-bottom,groupW=plotW/12;
  const maxP=Math.max(1,...precipitation)*1.1;
  let minT=Math.min(...temperature), maxT=Math.max(...temperature);
  if(maxT===minT){maxT+=1;minT-=1;}
  const syP=(v:number)=>top+plotH-(v/maxP)*plotH;
  const syT=(v:number)=>top+plotH-((v-minT)/(maxT-minT))*plotH;
  const parts=[
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>`,
    "<rect width='100%' height='100%' fill='white'/>",
    `<text x='${width/2}' y='26' text-anchor='middle' font-size='16' font-weight='700'>${esc(c.title||"Biểu đồ khí hậu")}</text>`,
    `<line x1='${left}' y1='${top}' x2='${left}' y2='${top+plotH}' stroke='#475569'/><line x1='${left}' y1='${top+plotH}' x2='${width-right}' y2='${top+plotH}' stroke='#475569'/><line x1='${width-right}' y1='${top}' x2='${width-right}' y2='${top+plotH}' stroke='#475569'/>`,
  ];
  precipitation.forEach((v,i)=>{
    const x=left+i*groupW+groupW*0.18,y=syP(v);
    parts.push(`<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='${(groupW*0.64).toFixed(1)}' height='${(top+plotH-y).toFixed(1)}' fill='#64748b'/>`);
    parts.push(`<text x='${(left+i*groupW+groupW/2).toFixed(1)}' y='${height-35}' text-anchor='middle' font-size='10'>${esc(months[i])}</text>`);
  });
  const tempPts=temperature.map((v,i)=>`${(left+i*groupW+groupW/2).toFixed(1)},${syT(v).toFixed(1)}`).join(" ");
  parts.push(`<polyline points='${tempPts}' fill='none' stroke='#0f766e' stroke-width='3'/>`);
  temperature.forEach((v,i)=>parts.push(`<circle cx='${(left+i*groupW+groupW/2).toFixed(1)}' cy='${syT(v).toFixed(1)}' r='3' fill='#0f766e'/>`));
  parts.push(`<text x='${left}' y='${top-9}' font-size='10' fill='#475569'>mm</text><text x='${width-right}' y='${top-9}' text-anchor='end' font-size='10' fill='#0f766e'>°C</text></svg>`);

  return {
    normalized:{schema_version:"DAMSAN_STIMULUS_V1",type:"CLIMOGRAPH",...c,months,temperature,precipitation},
    html:`<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-climograph'>${commonTop({...c,title:""},"CLIMOGRAPH")}${imgHtml("CLIMOGRAPH",svgDataUrl(parts.join("")),c.title||"Biểu đồ khí hậu",width,height)}${commonBottom(c)}</div>`,
    types:["CLIMOGRAPH"],table_count:0,image_count:1,
  };
}

function renderCrossSection(raw: StimulusObject): StimulusRender104 {
  const c=common(raw);
  const distance=numberArray(raw.distance,2,30,"stimulus_cross_section_distance_invalid");
  const elevation=numberArray(raw.elevation,distance.length,distance.length,"stimulus_cross_section_elevation_invalid");
  for(let i=1;i<distance.length;i++) if(distance[i]<=distance[i-1]) fail("stimulus_cross_section_distance_invalid");

  const width=720,height=350,left=60,right=28,top=44,bottom=56;
  const plotW=width-left-right,plotH=height-top-bottom;
  const minX=distance[0],maxX=distance[distance.length-1];
  let minY=Math.min(...elevation),maxY=Math.max(...elevation);
  if(minY===maxY) maxY=minY+1;
  const sx=(v:number)=>left+(v-minX)/(maxX-minX)*plotW;
  const sy=(v:number)=>top+plotH-(v-minY)/(maxY-minY)*plotH;
  const points=distance.map((d,i)=>`${sx(d).toFixed(1)},${sy(elevation[i]).toFixed(1)}`).join(" ");
  const area=`${left},${top+plotH} ${points} ${width-right},${top+plotH}`;
  const parts=[
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>`,
    "<rect width='100%' height='100%' fill='white'/>",
    `<text x='${width/2}' y='25' text-anchor='middle' font-size='16' font-weight='700'>${esc(c.title||"Mặt cắt địa hình")}</text>`,
    `<polygon points='${area}' fill='#e2e8f0'/><polyline points='${points}' fill='none' stroke='#334155' stroke-width='3'/>`,
    `<line x1='${left}' y1='${top}' x2='${left}' y2='${top+plotH}' stroke='#475569'/><line x1='${left}' y1='${top+plotH}' x2='${width-right}' y2='${top+plotH}' stroke='#475569'/>`,
    `<text x='${left}' y='${height-26}' font-size='10'>${esc(minX)}</text><text x='${width-right}' y='${height-26}' text-anchor='end' font-size='10'>${esc(maxX)}</text>`,
    "</svg>"
  ];
  return {
    normalized:{schema_version:"DAMSAN_STIMULUS_V1",type:"CROSS_SECTION",...c,distance,elevation},
    html:`<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-cross-section'>${commonTop({...c,title:""},"CROSS_SECTION")}${imgHtml("CROSS_SECTION",svgDataUrl(parts.join("")),c.title||"Mặt cắt địa hình",width,height)}${commonBottom(c)}</div>`,
    types:["CROSS_SECTION"],table_count:0,image_count:1,
  };
}

function renderImage(raw: StimulusObject): StimulusRender104 {
  const c=common(raw);
  const src=textValue(raw.src,MAX_IMAGE_DATA_URI,true,"stimulus_image_src_invalid");
  if(!/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(src)) fail("stimulus_image_src_invalid");
  const alt=textValue(raw.alt,300,true,"stimulus_image_alt_required");
  const width=finiteNumber(raw.width ?? 640,80,1200,"stimulus_image_dimension_invalid");
  const height=finiteNumber(raw.height ?? 400,60,1200,"stimulus_image_dimension_invalid");
  return {
    normalized:{schema_version:"DAMSAN_STIMULUS_V1",type:"IMAGE",...c,src,alt,width,height},
    html:`<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-image-wrap'>${commonTop(c,"IMAGE")}${imgHtml("IMAGE",src,alt,width,height)}${commonBottom(c)}</div>`,
    types:["IMAGE"],table_count:0,image_count:1,
  };
}

function renderSingle(value: unknown, part: string, allowMulti: boolean): StimulusRender104 {
  const raw=objectValue(value);
  const type=textValue(raw.type,40,true,"stimulus_type_invalid").toUpperCase();
  if(!(SUPPORTED_TYPES as readonly string[]).includes(type)) fail("stimulus_type_invalid");

  if(type==="TABLE") return renderTable(raw,part);
  if(type==="CHART") return renderChart(raw);
  if(type==="MAP"||type==="SCHEMATIC_MAP") return renderMap(raw,type);
  if(type==="IMAGE") return renderImage(raw);
  if(type==="DIAGRAM") return renderDiagram(raw);
  if(type==="CLIMOGRAPH") return renderClimograph(raw);
  if(type==="CROSS_SECTION") return renderCrossSection(raw);
  if(type==="MULTI_SOURCE"){
    if(!allowMulti) fail("stimulus_multi_nested_invalid");
    const c=common(raw);
    if(!Array.isArray(raw.items)||raw.items.length<2||raw.items.length>3) fail("stimulus_multi_items_invalid");
    const children=raw.items.map((item)=>renderSingle(item,part,false));
    const normalized={
      schema_version:"DAMSAN_STIMULUS_V1",type:"MULTI_SOURCE",...c,
      items:children.map((child)=>child.normalized),
    };
    return {
      normalized,
      html:`<div data-damsan-stimulus-block='1' class='damsan-stimulus damsan-stimulus-multi'>${commonTop(c,"MULTI_SOURCE")}${children.map((child)=>child.html).join("")}${commonBottom(c)}</div>`,
      types:["MULTI_SOURCE",...children.flatMap((child)=>child.types)],
      table_count:children.reduce((n,child)=>n+child.table_count,0),
      image_count:children.reduce((n,child)=>n+child.image_count,0),
    };
  }
  fail("stimulus_type_invalid");
}

export function normalizeAndRenderStimulus104(value: unknown, part: string): StimulusRender104 | null {
  if(value==null) return null;
  const result=renderSingle(value,part,true);
  if(result.html.length>MAX_RENDERED_HTML) fail("stimulus_render_too_large");
  return result;
}

export function composeStimulusStem104(questionText: string, rendered: StimulusRender104 | null) {
  if(!rendered) return questionText;
  const text=textValue(questionText,16000,true,"question_text_required");
  const type=textValue(rendered.normalized.type,40,true,"stimulus_type_invalid");
  return `<div data-damsan-stimulus-root='1' data-damsan-stimulus-type='${esc(type)}' class='damsan-stimulus-root'>${rendered.html}<div data-damsan-stimulus-question='1' class='damsan-stimulus-question'>${esc(text)}</div></div>`;
}

export function stimulusContract104() {
  return {
    schema_version:"DAMSAN_STIMULUS_V1",
    engine_version:"104",
    supported_types:[...SUPPORTED_TYPES],
    chart_kinds:[...CHART_KINDS],
    map_policy:{
      MAP:{geometry_mode:"SOURCE_GROUNDED",geometry_provenance_required:true},
      SCHEMATIC_MAP:{geometry_modes:["SCHEMATIC","SOURCE_GROUNDED"]},
    },
    image_policy:{
      allowed_data_uri_types:["image/png","image/jpeg","image/webp"],
      external_http_images:false,
      inline_svg_input:false,
      server_generated_svg:true,
    },
    limits:{
      max_rendered_html:MAX_RENDERED_HTML,
      max_image_data_uri:MAX_IMAGE_DATA_URI,
      max_multi_source_items:3,
    },
  };
}
