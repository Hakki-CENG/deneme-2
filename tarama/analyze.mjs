import { readFileSync, writeFileSync } from "node:fs";
const rows = readFileSync("results.jsonl","utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));

// Staleness from shields.io's relative wording.
// shields.io words recency relatively, and omits the year when it is the
// current one. So a bare month name means this year, "last <weekday>" means
// within the past week, and an explicit year is that year. Reading these
// naively as "unknown" would have written off half the catalogue as unmeasured.
const WEEKDAY = /^last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
const BARE_MONTH = /^(january|february|march|april|may|june|july|august|september|october|november|december)$/;
function bucket(r) {
  const s = (r.lastCommit || "").toLowerCase().trim();
  if (s === "repo not found" || s === "not-found" || s === "") return "gone";
  if (s.startsWith("error") || s.startsWith("http")) return "unmeasured";
  if (s === "today" || s === "yesterday" || WEEKDAY.test(s) || s.includes("ago")) return "this-week";
  if (BARE_MONTH.test(s)) return "this-year";
  const y = s.match(/20(\d\d)/);
  if (y) {
    const year = 2000 + Number(y[1]);
    if (year >= 2026) return "this-year";
    if (year === 2025) return "2025";
    if (year === 2024) return "2024";
    return "2023-or-older";
  }
  return "unmeasured";
}
// Copyleft is an integration constraint, not a judgement: AGPL/GPL obligations
// propagate to anything linked with the code.
const COPYLEFT = /^AGPL|^GPL|^LGPL|SSPL|EUPL|OSL|Sleepycat|EPL|MPL/i;
const NO_LIC = new Set(["not specified","not identifiable by github","no license","none","unknown"]);

const byLicense={}, byLang={}, byStale={}, copyleft=[], noLicense=[], stale=[];
for(const r of rows){
  byLicense[r.license]=(byLicense[r.license]??0)+1;
  byLang[r.languageName]=(byLang[r.languageName]??0)+1;
  const b=bucket(r); byStale[b]=(byStale[b]??0)+1;
  if(COPYLEFT.test(r.license||"")) copyleft.push(r.repo);
  if(NO_LIC.has((r.license||"").toLowerCase())) noLicense.push(r.repo);
  if(b==="2024"||b==="2023-or-older") stale.push(`${r.repo} (${r.lastCommit})`);
}
const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);

console.log("TOPLAM:", rows.length);
console.log("\n== LISANS (ilk 12) ==");
for(const [k,v] of top(byLicense,12)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log("\n== DIL (ilk 10) ==");
for(const [k,v] of top(byLang,10)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log("\n== SON COMMIT ==");
for(const [k,v] of top(byStale,10)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\n== RISK ==`);
console.log(`  copyleft (AGPL/GPL/MPL/EPL...): ${copyleft.length}`);
console.log(`  lisans belirsiz/yok:            ${noLicense.length}`);
console.log(`  2024 veya daha eski (durgun):   ${stale.length}`);

// CSV deliverable
const csv=["repo,license,language,languageShare,stars,lastCommit,staleness,copyleft,licenseUnclear"]
  .concat(rows.map(r=>{
    const b=bucket(r);
    const q=s=>`"${String(s??'').replace(/"/g,'""')}"`;
    return [q(r.repo),q(r.license),q(r.languageName),q(r.languageShare),q(r.stars),q(r.lastCommit),q(b),
            COPYLEFT.test(r.license||"")?"yes":"no", NO_LIC.has((r.license||"").toLowerCase())?"yes":"no"].join(",");
  })).join("\n");
writeFileSync("aurora-aday-envanteri.csv", csv);
writeFileSync("risk-copyleft.txt", copyleft.join("\n")+"\n");
writeFileSync("risk-lisanssiz.txt", noLicense.join("\n")+"\n");
writeFileSync("risk-durgun.txt", stale.join("\n")+"\n");
console.log("\nYAZILDI: aurora-aday-envanteri.csv, risk-copyleft.txt, risk-lisanssiz.txt, risk-durgun.txt");
