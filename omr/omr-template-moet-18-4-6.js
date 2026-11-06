(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrTemplate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  // Calibration source: assets/assets/phieu-chinh.pdf rendered at 200 DPI.
  // Coordinates are converted back to physical centimetre-like units so the
  // homography remains independent of camera resolution.
  const PX_PER_CM=200/2.54;
  const p=(x,y)=>[x/PX_PER_CM,y/PX_PER_CM];
  const m=(name,x,y,sizePx=42)=>({name,x:x/PX_PER_CM,y:y/PX_PER_CM,size:sizePx/PX_PER_CM});

  const digitY=[220.2,264.6,310.8,355.8,401.4,447.0,492.0,537.0,582.6,628.2];
  const p1Y=[852.67,887.55,922.8,957.6,992.77,1029.0,1063.88,1098.3,1133.32,1169.18];
  const p1X=[
    [178.44,246.6,314.76,381.36],
    [518.28,586.2,654.6,721.8]
  ];
  const p2X=[
    [178.92,246.6],
    [316.2,382.2],
    [519.24,587.4],
    [655.5,723.0]
  ];
  const p2Y=[1361.47,1396.34,1431.0,1465.8];
  const p3X=[
    [167.2,214.2,261.11,307.92],
    [384.4,431.4,478.09,525.0],
    [601.4,648.6,695.4,742.2],
    [819.0,867.0,914.02,960.72],
    [1037.1,1084.2,1131.0,1177.92],
    [1254.2,1301.4,1348.2,1395.0]
  ];
  const p3MinusY=1673.4;
  const p3CommaY=1708.3;
  const p3DigitY=[1747.35,1782.6,1818.6,1855.8,1890.6,1925.4,1962.55,1997.4,2034.55,2070.6];

  const template={
    id:'MOET_TLTN_2025_PHIEU_CHINH_18_4_6_V3',
    name:'Phiếu TLTN BGD 2025 phieu-chinh.pdf — profile Địa lí 18-4-6',
    sourceProfile:'BGD_2025_PHIEU_CHINH_PDF',
    sourceDpi:200,
    widthCm:1552/PX_PER_CM,
    heightCm:2254/PX_PER_CM,
    bubbleRadiusCm:12/PX_PER_CM,
    frame:[0,0,1552/PX_PER_CM,2254/PX_PER_CM],
    markers:[
      // Outer control marks (large)
      m('TL',50.5,60.5),m('TR',1496.0,60.5),m('BR',1496.0,2197.5),m('BL',50.5,2197.5),
      m('TOP-C',1028.5,60.5),m('MID-L',50.5,693.5),m('MID-C',1022.0,693.5),m('MID-R',1496.0,693.5),
      // SBD / mã đề internal controls
      m('ID-M1',1323.0,424.0,21),m('ID-M2',1323.0,651.0,21),
      // P1/P2 controls
      m('P1-A-T',433.98,796.98,21),m('P1-B-T',773.5,797.0,21),m('P1-C-T',1113.98,797.02,21),
      m('P1-A-B',434.0,1202.5,21),m('P1-B-B',773.5,1202.5,21),m('P1-C-B',1114.0,1202.5,21),
      m('P2-A-T',434.0,1260.5,21),m('P2-B-T',773.5,1260.5,21),m('P2-C-T',1114.0,1260.5,21),
      m('P2-A-B',434.0,1499.5,21),m('P2-B-B',773.98,1499.02,21),m('P2-C-B',1114.0,1499.5,21),
      // P3 controls
      m('P3-T1',337.5,1528.5,21),m('P3-T2',555.5,1528.5,21),m('P3-T3',990.5,1528.5,21),m('P3-T4',1208.0,1528.5,21),
      m('P3-B1',337.5,2142.5,21),m('P3-B2',555.5,2142.5,21),m('P3-B3',772.5,2142.5,21),m('P3-B4',990.5,2142.5,21),m('P3-B5',1208.0,2142.5,21)
    ],
    p1:Array.from({length:18},(_,i)=>{
      const block=i<10?0:1, row=i<10?i:i-10;
      return p1X[block].map(x=>p(x,p1Y[row]));
    }),
    p1Labels:['A','B','C','D'],
    p2:Array.from({length:16},(_,i)=>{
      const q=Math.floor(i/4), row=i%4;
      return p2X[q].map(x=>p(x,p2Y[row]));
    }),
    p2Labels:['Đ','S'],
    p3:p3X.map(xs=>xs.map((x,col)=>[
      col===0?p(x,p3MinusY):null,
      (col===1||col===2)?p(x,p3CommaY):null,
      ...p3DigitY.map(y=>p(x,y))
    ])),
    p3Labels:['-',',','0','1','2','3','4','5','6','7','8','9'],
    sbd:[1062.6,1095.0,1126.32,1158.6,1189.68,1220.64,1252.2,1283.4].map(x=>digitY.map(y=>p(x,y))),
    sbdLabels:Array.from({length:10},(_,i)=>String(i)),
    maDe:[1362.36,1393.8,1425.12,1456.2].map(x=>digitY.map(y=>p(x,y))),
    maDeLabels:Array.from({length:10},(_,i)=>String(i)),
    expected:{p1:18,p2Questions:4,p2Items:16,p3:6,sbdDigits:8,maDeDigits:4}
  };

  function validate(t=template){
    const errors=[];
    if(t.p1.length!==18) errors.push('P1 must have 18 rows');
    if(t.p2.length!==16) errors.push('P2 must have 16 statement rows');
    if(t.p3.length!==6) errors.push('P3 must have 6 questions');
    if(t.sbd.length!==8) errors.push('SBD must have 8 digit columns');
    if(t.maDe.length!==4) errors.push('MaDe must have 4 digit columns');
    if(t.markers.length<4) errors.push('At least four markers required');
    return {ok:errors.length===0,errors};
  }

  return {template,validate};
});
