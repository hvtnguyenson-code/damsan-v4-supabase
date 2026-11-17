const fs=require('fs'),path=require('path');
const core=require('../omr/omr-core.js'),T=require('../omr/omr-template-moet-18-4-6.js').template,P=require('../omr/omr-precision-capture-experiment.js');
const dir=path.join(__dirname,'../precision_benchmark_stress');
const rows=[];
for(let n=1;n<=25;n++)for(const kind of ['blur','dark','crop']){
 const stem=String(n).padStart(2,'0')+'_'+kind;
 const meta=JSON.parse(fs.readFileSync(path.join(dir,stem+'.json'),'utf8'));
 const gray=core.grayscale(fs.readFileSync(path.join(dir,stem+'.rgba')),meta.width,meta.height);
 const corners=core.detectCornerMarkers(gray,meta.width,meta.height);
 const baseline=corners.ok&&core.fastTemplateRegistration(T,corners,meta.width,meta.height).ok;
 const r=P.evaluate(gray,meta.width,meta.height,T,core);
 rows.push({n,kind,baseline,ready:r.ready,reasons:r.reasons||[r.reason],focus:r.quality?.focus,light:r.quality?.mean});
}
const groups=Object.fromEntries(['blur','dark','crop'].map(kind=>{
 const arr=rows.filter(r=>r.kind===kind);return [kind,{total:arr.length,baseline:arr.filter(r=>r.baseline).length,precision:arr.filter(r=>r.ready).length,reasons:arr.reduce((a,r)=>{for(const x of r.reasons)a[x]=(a[x]||0)+1;return a;},{})}];
}));
console.log(JSON.stringify({groups,rows},null,2));
