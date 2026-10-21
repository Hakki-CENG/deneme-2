import { readFileSync, writeFileSync } from "node:fs";
const D = JSON.parse(readFileSync("domains17.json","utf8"));

const rows = [];
rows.push("# Aurora — 57 alan ailesi: aday eleme sonucu\n");
rows.push("**Tarih:** 2026-10-19 · **Kaynak:** master planı bölüm 17 (1056 repo) + bölüm 6 katalogu");
rows.push("**Ölçüm:** `tarama/aurora-aday-envanteri.csv` (1064 repo, shields.io)\n");
rows.push("## Eleme kuralları\n");
rows.push("Bu turda uygulanan kurallar **objektif** olanlardır. Hiçbiri \"en iyi\" kararı vermez.\n");
rows.push("| Kural | Karar | Gerekçe |");
rows.push("|---|---|---|");
rows.push("| Link ölü (`repo not found`) | **ELER** | Var olmayan proje entegre edilemez |");
rows.push("| Son commit 2024 veya öncesi | **ELER** | Bakımsız; CVE düzeltmesi ve sürüm desteği beklenemez |");
rows.push("| AGPL-3.0 | **ELER** | Ağ üzerinden kullanım bile kaynak paylaşımı doğurur; ayrı servis çalıştırmak kurtarmaz |");
rows.push("| Lisans belirsiz | **İNCELE** | \"Yok\" değil, \"tespit edilemedi\" — Gate A dosya bazında bakmadan kullanılamaz |");
rows.push("| Geri kalan | **KALIR** | Objektif engel yok; kalite kararı benchmark'a bırakıldı |\n");

const all = D.flatMap(d=>d.repos);
const t = {};
for (const r of all) { const k=r.verdict.split(":")[0]; t[k]=(t[k]||0)+1; }
rows.push("## Genel sonuç\n");
rows.push("| Karar | Atama |");
rows.push("|---|---:|");
for (const [k,v] of Object.entries(t).sort((a,b)=>b[1]-a[1])) rows.push(`| ${k} | ${v} |`);
rows.push(`\nToplam ${all.length} atama (bir repo birden çok alanda geçebiliyor), ${new Set(all.map(r=>r.repo)).size} benzersiz repo.\n`);

rows.push("## Alan alan sonuç\n");
rows.push("| Alan | Ad | Aday | KALIR | İNCELE | ELER |");
rows.push("|---|---|---:|---:|---:|---:|");
for (const d of D) {
  if (d.total === 0) continue;
  const c = { KALIR:0, INCELE:0, ELER:0 };
  for (const r of d.repos) { const k=r.verdict.split(":")[0]; if (k in c) c[k]++; }
  rows.push(`| ${d.code} | ${d.name.slice(0,54)} | ${d.total} | ${c.KALIR} | ${c.INCELE} | ${c.ELER} |`);
}

// Ilk dalga alanlari icin ayrinti
const WAVE = ["17.1","17.2","17.3","17.5","17.33","17.35"];
rows.push("\n## İlk dalga için ayrıntı\n");
rows.push("Planın ilk dalgası: eval, browser/OS, kod, doküman, model inference, web retrieval, telemetry, retrieval. Bunlar aşağıdaki alanlarda.\n");
for (const d of D.filter(x=>WAVE.includes(x.code))) {
  const survivors = d.repos.filter(r=>r.verdict==="KALIR");
  rows.push(`### ${d.code} — ${d.name}\n`);
  rows.push(`${d.total} aday · **${survivors.length} kalır** · ${d.repos.filter(r=>r.verdict.startsWith("ELER")).length} elenir · ${d.repos.filter(r=>r.verdict.startsWith("INCELE")).length} lisansı belirsiz\n`);
  const byLang = {};
  for (const r of survivors) byLang[r.language||"?"] = (byLang[r.language||"?"]||0)+1;
  const langs = Object.entries(byLang).sort((a,b)=>b[1]-a[1]).slice(0,6);
  rows.push(`Kalanların dili: ${langs.map(([k,v])=>`${k} ${v}`).join(" · ")}\n`);
  const elim = d.repos.filter(r=>r.verdict.startsWith("ELER"));
  if (elim.length) {
    rows.push("**Elenenler:**");
    for (const r of elim.slice(0,14)) rows.push(`- \`${r.repo}\` — ${r.verdict.replace("ELER: ","")}`);
    if (elim.length>14) rows.push(`- …ve ${elim.length-14} tane daha`);
    rows.push("");
  }
}
writeFileSync("/home/user/aurora-alan-eleme.md", rows.join("\n"));
console.log("YAZILDI: /home/user/aurora-alan-eleme.md");
console.log("satir:", rows.length);
