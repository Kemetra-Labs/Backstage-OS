const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const fixture=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const script=html.split('<script>')[1].split('</script>')[0];
const calcs={}; let params={persona:'owner'};
const dash={calc:(id,o)=>{calcs[id]=o}, draw:()=>{}, data:()=>({status:'loading'}), params:()=>params, setParams:p=>{params={...params,...p}}};
const document={querySelectorAll:()=>[]};
new Function('dash','document','claude',script)(dash,document,{});
const out={};
for(const persona of ['owner','viewer']){ params={persona}; out[persona]={}; for(const [id,c] of Object.entries(calcs)) out[persona][id]=c.fn(fixture); }
console.log(JSON.stringify(out,null,1));
