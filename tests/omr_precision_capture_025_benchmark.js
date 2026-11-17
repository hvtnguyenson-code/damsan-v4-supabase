const fs=require('fs'),path=require('path');
const core=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const P=require('../omr/omr-precision-capture-experiment.js');
const dir=path.join(__dirname,'../precision_benchmark_images');
const rows=[];
for(let n=1;n<=25;n++){
 const stem=String(n).padStart(2,'0');
 const meta=JSON.parse(fs.readFileSync(path.join(dir,stem+'.json'),'utf8'));
 const raw=fs.readFileSync(path.join(dir,stem+'.rgba'));
 const gray=core.grayscale(raw,meta.width,meta.height);
 const baseline=core.detectCornerMarkers(gray,meta.width,meta.height);
 const geo=baseline.ok?core.fastTemplateRegistration(T,baseline,meta.width,meta.height):null;
 const r=P.evaluate(gray,meta.width,meta.height,T,core);
 rows.push({n,baseline:!!geo?.ok,ready:r.ready,reasons:r.reasons||[r.reason],internal:r.internalMatches||0,
  rmse:Number.isFinite(r.internalRmse)?Number(r.internalRmse.toFixed(1)):null,
  focus:r.quality?Number(r.quality.focus.toFixed(2)):null,light:r.quality?Number(r.quality.mean.toFixed(1)):null,
  score:r.score?Number(r.score.toFixed(1)):null});
}
console.log(JSON.stringify({count:rows.length,baseline:rows.filter(x=>x.baseline).length,precision:rows.filter(x=>x.ready).length,rows},null,2));
