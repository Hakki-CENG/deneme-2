import { readFileSync, writeFileSync } from "node:fs";
const doc = readFileSync("/home/user/uploads/AURORA_TUM_ALANLAR_V2_KAPSAMLI_MASTER_PLANI (1).md","utf8");
const start = doc.indexOf("# 17. V2 kapsam denetimi");
const section = doc.slice(start);

const rows = new Map();
for (const l of readFileSync("results.jsonl","utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l); rows.set(r.repo, r);
}

const domains = [];
let cur = null;
for (const line of section.split("\n")) {
  const h = line.match(/^#{2,3}\s+(17\.\d+)\s+(.*)$/);
  if (h) { cur = { code: h[1], name: h[2].trim(), repos: [] }; domains.push(cur); continue; }
  if (!cur) continue;
  for (const m of line.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    const repo = m[1].replace(/[).,]+$/, "");
    if (!cur.repos.includes(repo)) cur.repos.push(repo);
  }
}

// Ölçümlerle birlestir + eleme kurallarini uygula
const BARE=/^(january|february|march|april|may|june|july|august|september|october|november|december)$/;
const WD=/^last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
function stale(r){
  const s=(r.lastCommit||"").toLowerCase().trim();
  if(s==="repo not found") return "gone";
  if(s==="today"||s==="yesterday"||WD.test(s)||BARE.test(s)) return "fresh";
  const y=s.match(/20(\d\d)/); if(y){ const yr=2000+ +y[1]; return yr>=2025?"fresh":"stale"; }
  return "unmeasured";
}
function verdict(r){
  const lic=(r.license||"");
  if(stale(r)==="gone") return "ELER: link olu";
  if(stale(r)==="stale") return "ELER: durgun ("+r.lastCommit+")";
  if(/^AGPL/.test(lic)) return "ELER: AGPL";
  if(["not identifiable by github","not specified","no license"].includes(lic.toLowerCase())) return "INCELE: lisans belirsiz";
  return "KALIR";
}

const out = domains.map(d => ({
  code: d.code, name: d.name, total: d.repos.length,
  repos: d.repos.map(repo => {
    const m = rows.get(repo);
    return m ? { repo, license: m.license, language: m.languageName, stars: m.stars, lastCommit: m.lastCommit, verdict: verdict(m) }
             : { repo, verdict: "OLCULEMEDI" };
  }),
}));
writeFileSync("domains17.json", JSON.stringify(out, null, 1));

const all = out.flatMap(d=>d.repos);
const tally={};
for(const r of all) tally[r.verdict.split(":")[0]]=(tally[r.verdict.split(":")[0]]||0)+1;
console.log("alan:", out.length, "| atanan:", all.length);
console.log("karar dagilimi:", JSON.stringify(tally));
console.log("");
for(const d of out) console.log(`${d.code.padEnd(6)} ${String(d.total).padStart(3)}  ${d.name.slice(0,58)}`);
