(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrTemplate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const p=(x,y)=>[x/100,y/100];
  const m=(name,x,y)=>({name,x:x/100,y:y/100,size:0.30});
  const digitY=Array.from({length:10},(_,i)=>267+i*46.05);
  const p3Rows=Array.from({length:10},(_,i)=>1798+i*43.9);
  const template={
    id:'MOET_TLTN_2025_18_4_6_V1',
    name:'Phiếu TLTN BGD 2025 gốc — profile Địa lí 18-4-6',
    sourceProfile:'BGD_2025_ORIGINAL',
    widthCm:16.38,
    heightCm:23.39,
    bubbleRadiusCm:0.115,
    frame:[0,0,16.38,23.39],
    markers:[
      m('TL',53,43),m('TR',1594,43),m('BR',1594,2269),m('BL',53,2269),
      m('I0',54,759),m('I1',1594,759),m('I2',54,1270),m('I3',1594,1270),
      m('I4',53,1597),m('I5',1594,1597)
    ],
    p1:Array.from({length:18},(_,i)=>[177,243,309,374].map(x=>p(x+Math.floor(i/10)*370,859+(i%10)*39.4))),
    p1Labels:['A','B','C','D'],
    p2:Array.from({length:16},(_,i)=>{
      const q=Math.floor(i/4), offset=Math.floor(q/2)*370+(q%2)*132;
      return [177,243].map(x=>p(x+offset,1413+(i%4)*39.4));
    }),
    p2Labels:['Đ','S'],
    p3:Array.from({length:6},(_,q)=>{
      const base=169+q*236.3;
      return Array.from({length:4},(_,col)=>[
        p(base+col*39.4,col===0?1710:1650),
        p(base+col*39.4,(col===1||col===2)?1754:1650),
        ...p3Rows.map(y=>p(base+col*39.4,y))
      ]);
    }),
    p3Labels:['-',',','0','1','2','3','4','5','6','7','8','9'],
    sbd:Array.from({length:8},(_,i)=>digitY.map(y=>p(1147+i*31.65,y))),
    sbdLabels:Array.from({length:10},(_,i)=>String(i)),
    maDe:[1433,1465,1496,1528].map(x=>digitY.map(y=>p(x,y))),
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
