import { readFileSync, writeFileSync } from "node:fs";
const doc = readFileSync("/home/user/uploads/AURORA_TUM_ALANLAR_V2_KAPSAMLI_MASTER_PLANI (1).md","utf8");

// Section 6 is the per-domain catalogue: "## A. ...", "## B. ...", ... "## AH. ..."
const start = doc.indexOf("# 6. Alan alan");
const end = doc.indexOf("# 7. Hangi");
const section = doc.slice(start, end);

const domains = [];
let current = null;
for (const line of section.split("\n")) {
  const h = line.match(/^## ([A-Z]{1,2})\.\s+(.*)$/);
  if (h) { current = { code: h[1], name: h[2].trim(), repos: [] }; domains.push(current); continue; }
  if (!current) continue;
  for (const m of line.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    const repo = m[1].replace(/[).,]+$/, "");
    if (!current.repos.includes(repo)) current.repos.push(repo);
  }
}

const rows = new Map();
for (const l of readFileSync("results.jsonl","utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l); rows.set(r.repo, r);
}

const out = domains.map(d => ({ ...d, measured: d.repos.map(r => rows.get(r)).filter(Boolean) }));
writeFileSync("domains.json", JSON.stringify(out, null, 1));

console.log("alan sayisi:", out.length, "| toplam atanan repo:", out.reduce((a,d)=>a+d.repos.length,0));
console.log("");
for (const d of out.slice(0, 8)) {
  console.log(`${d.code.padEnd(3)} ${d.name.slice(0,44).padEnd(46)} ${String(d.repos.length).padStart(3)} aday`);
}
