const assert=require('assert');
const V6=require('../omr/omr-reliability-v6.js');
const template=require('../omr/omr-template-moet-18-4-6.js').template;
console.log('=== OMR 017 independent P3 recognizer ===');
const px=(pt,w,h)=>[pt[0]*(w-1)/template.widthCm,pt[1]*(h-1)/template.heightCm];
function render(answers,{light='day',ghost=null,extra=null}={}){
  const w=1000,h=Math.round(w*template.heightCm/template.widthCm);
  const gray=new Uint8Array(w*h).fill(218);
  const radius=template.bubbleRadiusCm*(w-1)/template.widthCm;
  const draw=(pt,r,val,outline=false)=>{
    const [x,y]=px(pt,w,h);
    for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(h-1,Math.ceil(y+r));yy++)
      for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(w-1,Math.ceil(x+r));xx++){
        const dist=(xx-x)**2+(yy-y)**2;
        if(dist<=r*r&&(!outline||dist>=(r*.82)**2))
          gray[yy*w+xx]=Math.min(gray[yy*w+xx],val);
      }
  };
  template.p3.forEach((question,q)=>{
    for(let col=0;col<4;col++){
      question[col].forEach(pt=>{if(pt)draw(pt,radius,127,true);});
      const token=(answers[q]||'')[col];
      if(token&&token!=='_'){
        const at=template.p3Labels.indexOf(token);
        assert(question[col][at],q+' column '+col+' missing printed token '+token);
        draw(question[col][at],radius*.54,70);
      }
    }
  });
  if(ghost)draw(template.p3[ghost.question][ghost.column][template.p3Labels.indexOf(ghost.token)],
    radius*.50,ghost.shade);
  if(extra)draw(template.p3[extra.question][extra.column][template.p3Labels.indexOf(extra.token)],
    radius*.54,70);
  if(light!=='day')for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let strength=light==='dim'?.62:light==='gradient'?.61+.31*x/w:1;
    if(light==='lamp'){
      const dx=x/w-.73,dy=y/h-.70;
      strength=.91-.37*Math.exp(-(dx*dx+dy*dy)/.017);
    }
    gray[y*w+x]=Math.round(gray[y*w+x]*strength);
  }
  return {gray,width:w,height:h};
}
const sheets=[
  {name:'Yen An',codes:['14,3','25,0','31,3','36,0','300','11,2']},
  {name:'9002',codes:['31,3','11,2','14,3','300','36','25,0']}
];
for(const sheet of sheets){
  for(const light of ['day','dim','gradient','lamp']){
    const input=sheet.codes.map(s=>s.padEnd(4,'_').replaceAll('_','_'));
    const result=V6.readP3Section(render(input,{light}),template);
    assert(result.calibration.reliable, sheet.name+light+' calibration');
    assert.deepStrictEqual(result.p3,sheet.codes,sheet.name+' '+light+' '+JSON.stringify(result));
    assert.strictEqual(result.issues.length,0,sheet.name+' '+light+' false warnings');
  }
}
// There must be an actual fourth filled column to append a digit.
const base=['31,3','11,2','14,3','300','36','25,0'].map(s=>s.padEnd(4,'_'));
const with0=base.slice();with0[3]='3000';
const with9=base.slice();with9[3]='3009';
assert.strictEqual(V6.readP3Section(render(base),template).p3[3],'300');
assert.strictEqual(V6.readP3Section(render(with0),template).p3[3],'3000');
assert.strictEqual(V6.readP3Section(render(with9),template).p3[3],'3009');
const erased=V6.readP3Section(render(base,{ghost:{question:3,column:3,token:'0',shade:204}}),template);
assert.strictEqual(erased.p3[3],'300','barely visible erased graphite must not append 0');
const two=V6.readP3Section(render(base,{extra:{question:3,column:1,token:'8'}}),template);
assert.strictEqual(two.p3[3],'?','double marked number column must abstain');
assert(two.issues.some(x=>x.key==='P3.4.2'));
assert.strictEqual(V6.decodeP3Positions([
 {state:'single',token:'3'},{state:'blank',token:''},{state:'single',token:'0'},{state:'blank',token:''}
]).value,'?','internal blank cannot compact into 30');
assert.strictEqual(V6.decodeP3Positions([
 {state:'single',token:'-'},{state:'single',token:'1'},{state:'single',token:','},{state:'single',token:'5'}
]).value,'-1,5');
assert.strictEqual(V6.decodeP3Positions([
 {state:'single',token:'3'},{state:'single',token:','},{state:'single',token:'1'},{state:'blank',token:''}
]).value,'3,1');
assert.strictEqual(V6.decodeP3Positions([
 {state:'blank',token:''},{state:'blank',token:''},{state:'blank',token:''},{state:'blank',token:''}
]).value,'');
assert.strictEqual(V6.decodeP3Positions([
 {state:'single',token:'3'},{state:'single',token:','},{state:'single',token:','},{state:'single',token:'5'}
]).value,'?');
console.log('PASS omr_v6_p3_017');