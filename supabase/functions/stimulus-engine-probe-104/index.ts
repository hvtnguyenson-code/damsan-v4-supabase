import {
  composeStimulusStem104,
  normalizeAndRenderStimulus104,
  stimulusContract104
} from "../_shared/exam_stimulus_104.ts";

const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2v1sAAAAASUVORK5CYII=";

const fixtures: Record<string, unknown> = {
  TABLE: {
    type:"TABLE",
    intro:"Cho bảng số liệu sau:",
    title:"Sản lượng theo năm",
    unit:"nghìn tấn",
    headers:["Năm","2024","2025"],
    rows:[["Sản lượng",120,135]],
    source_note:"Nguồn kiểm thử P2-104"
  },
  CHART: {
    type:"CHART",
    title:"Cơ cấu theo năm",
    chart_kind:"GROUPED_BAR",
    categories:["2024","2025"],
    series:[
      {name:"Nhóm A",values:[40,55]},
      {name:"Nhóm B",values:[60,45]}
    ],
    unit:"%"
  },
  MAP: {
    type:"MAP",
    title:"Bản đồ kiểm thử",
    geometry_mode:"SOURCE_GROUNDED",
    geometry_provenance:"fixture-grounded-geometry",
    paths:[{closed:true,label:"Vùng A",points:[{x:20,y:20},{x:65,y:18},{x:72,y:68},{x:30,y:78}]}],
    points:[{x:42,y:46,label:"Điểm X"}]
  },
  SCHEMATIC_MAP: {
    type:"SCHEMATIC_MAP",
    title:"Lược đồ kiểm thử",
    geometry_mode:"SCHEMATIC",
    paths:[{closed:false,label:"Tuyến",points:[{x:12,y:20},{x:50,y:55},{x:85,y:75}]}],
    points:[{x:12,y:20,label:"A"},{x:85,y:75,label:"B"}]
  },
  IMAGE: {
    type:"IMAGE",
    title:"Ảnh kiểm thử",
    src:PNG_1X1,
    alt:"Điểm ảnh kiểm thử",
    width:120,
    height:120
  },
  DIAGRAM: {
    type:"DIAGRAM",
    title:"Sơ đồ kiểm thử",
    nodes:[
      {id:"A",label:"Nguyên nhân",x:20,y:50},
      {id:"B",label:"Kết quả",x:80,y:50}
    ],
    edges:[{from:"A",to:"B",label:"tác động"}]
  },
  CLIMOGRAPH: {
    type:"CLIMOGRAPH",
    title:"Biểu đồ khí hậu kiểm thử",
    temperature:[20,21,23,25,27,28,28,27,26,24,22,20],
    precipitation:[10,15,30,80,150,220,260,240,160,90,40,20]
  },
  CROSS_SECTION: {
    type:"CROSS_SECTION",
    title:"Mặt cắt kiểm thử",
    distance:[0,10,20,30,40],
    elevation:[20,180,520,240,50]
  },
  MULTI_SOURCE: {
    type:"MULTI_SOURCE",
    title:"Nguồn kết hợp kiểm thử",
    items:[
      {
        type:"TABLE",
        headers:["Năm","2024","2025"],
        rows:[["Giá trị",100,110]]
      },
      {
        type:"CHART",
        chart_kind:"LINE",
        categories:["2024","2025"],
        series:[{name:"Chỉ số",values:[100,110]}]
      }
    ]
  }
};

Deno.serve(() => {
  const results = Object.entries(fixtures).map(([name, fixture]) => {
    const rendered = normalizeAndRenderStimulus104(fixture, name === "TABLE" ? "3" : "2");
    if (!rendered) throw new Error("probe_render_missing");
    const stem = composeStimulusStem104("Hãy xử lí stimulus để trả lời câu hỏi.", rendered);
    return {
      name,
      normalized_type: rendered.normalized.type,
      types: rendered.types,
      table_count: rendered.table_count,
      image_count: rendered.image_count,
      html_length: rendered.html.length,
      stem_length: stem.length,
      has_root: stem.includes("data-damsan-stimulus-root='1'"),
      has_svg_image: rendered.html.includes("data:image/svg+xml;base64,"),
      has_table: rendered.html.includes("<table"),
    };
  });

  const ok = results.length === 9
    && results.every((item) => item.has_root)
    && results.find((item) => item.name === "TABLE")?.has_table === true
    && results.filter((item) => ["CHART","MAP","SCHEMATIC_MAP","DIAGRAM","CLIMOGRAPH","CROSS_SECTION"].includes(item.name))
      .every((item) => item.has_svg_image);

  return new Response(JSON.stringify({
    status: ok ? "success" : "error",
    engine_version: "104",
    contract: stimulusContract104(),
    results
  }), {
    status: ok ? 200 : 500,
    headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
});
