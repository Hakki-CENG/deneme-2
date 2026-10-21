import { readFileSync, writeFileSync } from "node:fs";
const rows = readFileSync("results.jsonl","utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
async function langName(repo){
  try{
    const r = await fetch(`https://img.shields.io/github/languages/top/${repo}.json`,{signal:AbortSignal.timeout(20000)});
    const j = await r.json();
    return String(j?.label ?? j?.value ?? "unknown");
  }catch{ return "error"; }
}
let i=0;
const out=[];
const size=8;
let idx=0;
await Promise.all(Array.from({length:size}, async()=>{
  while(idx<rows.length){
    const row=rows[idx++];
    row.languageName = await langName(row.repo);
    row.languageShare = row.language;
    out.push(row);
    if(++i%100===0) process.stdout.write(`\r  ${i}/${rows.length}`);
  }
}));
process.stdout.write(`\r  ${rows.length}/${rows.length}\n`);
writeFileSync("results.jsonl", out.map(r=>JSON.stringify(r)).join("\n")+"\n");
