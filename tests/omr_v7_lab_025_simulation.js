const assert=require('assert'),fs=require('fs');
const html=fs.readFileSync('omr/v7-lab.html','utf8'),js=fs.readFileSync('omr/v7-lab.js','utf8');
for(const name of ['omr-v7-candidate.js','omr-v7-research.js','omr-core.js',
 'omr-reliability-v6.js','omr-template-moet-18-4-6.js','v7-lab.js'])
 assert(html.includes('src="'+name+'"'),name+' missing');
for(const id of ['photoFile','startCamera','stopCamera','captureCamera','runDemo',
 'sourceImage','rectifiedImage','issues','differences','v6Text','v7Text'])
 assert(html.includes('id="'+id+'"'),id+' missing');
assert(!html.includes('omr-result-write.js'));
assert(!html.includes('supabase-js'));
assert(!js.includes('fetch(')&&!js.includes('localStorage')&&!js.includes('sessionStorage'));
assert(js.includes('chooseFrame(')&&js.includes('V7.compare(')&&js.includes('V7.analyzeImageData('));
new Function(js);
console.log('PASS isolated V7 browser lab safety');
