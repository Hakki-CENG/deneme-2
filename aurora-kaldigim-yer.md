> **Kalan tüm işlerin envanteri ayrı dosyada:** `/home/user/aurora-kalan-isler.md`
> (§12'nin 30 maddesi, 20 dalga maddesi, boş capability alanları, bu ortamda doğrulanamayanlar, sıralama önerisi.)

# AURORA — ÇALIŞMA DURUMU (kaldığım yer ve sonraki adım)

**Son güncelleme:** 2026-10-21
**Repo:** `/home/user/deneme` (git toplevel) — engine kökü: `Aurora-Motor-Engine/hybrid-agent-fabric`
**Son commit:** `951e99d` + `hygiene 66` düzeltmesi

Bu dosya, kesinti sonrası "nerede kalmıştım" sorusunun tek cevabıdır.
Her adım kapandığında güncellenir.

---

## 1. ŞU AN NEREDEYİM

**Adım 17 (harici denetim) ve Adım 18 kapandı.**

> **Adım 17 — dış denetim: TAMAMI KAPATILDI.** K-1…K-6, 4.1–4.8 ve madde 8; ayrıntı §4'te.
> **Adım 18 — taşınan iki "bekleyen iş" ölçüldü ve İKİSİ DE İŞ DEĞİL ÇIKTI** (`04be0e2`).

### Adım 18'de düzeltilen iki yanlış notum

Taşınan iki kalem de ölçülünce iş olmadı. İkisini de burada bırakıyorum ki bir daha
taşınmasın:

1. **"dangling `pdf` capability id'si" — YANLIŞ ÇERÇEVE.** `satisfiedBy` capability id
   listesi **değil**; `detectDeterministicGaps` envanterin id'lerini *ve açıklamalarını*
   tek bir haystack'de birleştirip `includes(token)` ile eşleştiriyor. Yani `"pdf"`,
   `["ocr","vision.text","tesseract"]` gibi bir **anahtar kelime ipucu**. Kırık referans
   yoktu. Asıl sorulmamış soru şuydu: PDF ayrıştırma artık varken boşluk gerçekten
   kapanıyor mu? `test/gap-detection-pdf.test.ts` iki yönü de sabitliyor.

2. **"30 unavailable/not configured throw sitesi" — ÖLÜ KORUYUCULAR.** Research
   motorunun "fetcher is not configured; nothing can be verified without fetching"
   satırı doğrudan kurulum için bir koruma; `engine.ts:2380` gerçek bir fetcher
   veriyor (`fetchPublicDocument`, 2 MB), `internalSearch` bilgi indeksine, `memory`
   `memoryGraph`'a bağlı. Kalanlar bu ortamda kapatılamaz: image/video OpenAI veya fal
   kimliği istiyor (**0 anahtar**), model OAuth çifti yapılandırma, initiative çifti
   teslim kanalı backend'i istiyor.

**Sonuç: denetim bitti, taşınan iş kalmadı.** Sıradaki iş kullanıcının vereceği yön.


---

## 2. KAPATILAN ADIMLAR (V2 master planı entegrasyonu)

| # | İş | Commit |
|---|---|---|
| 1 | Sandbox escape kapatıldı (17 test) | `cbadf04` |
| 2 | `CapabilityManifest` + verifier kuralı | `b5e31d5` |
| 3 | 1064-repo envanteri | — (`/home/user/tarama/`) |
| 4 | Alan bazlı eleme (57 §17 ailesi) | — (`/home/user/aurora-alan-eleme.md`) |
| 5 | Subprocess adapter + DuckDB (17/17) | `ee30546` |
| 6 | Broker kaydı (5/5) | `9182d90` |
| 7 | crawl4ai `web.render` (10/10) | `6873b68` |
| 8 | SymPy `math.symbolic` (16/16) | `2b37f98` |
| 9 | `document.parse` Tesseract+poppler (13/13) | `267b570` |
| 10 | Inspect AI `eval.inspect.run` (14/14) | `79d930b` |
| 11 | OTLP traces (16/16) | `62f7b80` |
| 12a | `document.parse` poppler rotası (15/15) | `8df103b` |
| 12b | `office.convert` (16/16) | `a52645f` |
| 13 | `data.profile` (16/16) | `fcfc27f` |
| 14 | `request_permission` kusuru kapatıldı (6/6) | `e99c081` |
| 15 | `data.graph.query` (17/17) | `597b393` |
| 16 | `science.sequence.analyse` + `science.molecule.analyse` (17/17) | `37cc44d` |
| 17 | Harici denetim: K-1…K-6, 4.1–4.8, madde 8 — tamamı kapatıldı | `209a3ed` `bd318a6` `1f45e1f` `3107962` `17cee68` `6b95c12` `813f5ff` `98f79dd` `f09556d` `cb917c2` |
| 18 | Taşınan iki "bekleyen iş" ölçüldü → ikisi de iş değil (4 test) | `04be0e2` |
| 19 | 4.7'nin kalanı: secret-source POSIX yol + `worker.sock` EACCES doğrulandı, background-shell **kusur değil** (10/10) | `c825a0b` |
| 20 | `web.search`: anahtarsız SearXNG provider (7/7) — public instance'lar JSON vermiyor, ölçüldü | `6829dff` |
| 21 | V2 dalga 2 madde 10: `audio.transcribe` (Vosk, Türkçe model) — isabet **unverified** (12/12) | `87ee1dd` |
| 22 | V2 dalga 2 madde 15: durability ihtiyacı **ölçüldü → zaten var ve doğru**; eksik olan kapsamdaydı (8/8) | `e112219` |
| 23 | **DALGA 3** madde 17: `math.smt.solve` (Z3 5.3.1) — model bağımsız doğrulanıyor, iki gerçek hata yakalandı (18/18) | `40ba8df` |
| 24 | **MADDE 17 KAPANDI**: `math.lean.check` + `requirements.txt` + `scripts/install-backends.mjs` (tek komutla kurulum) (10/10) | `e2653e3` |
| 25 | **MADDE 18**: `cad.render` (OpenSCAD 2021.01) — mesh geri ölçülüyor: hacim/üçgen/watertight (14/14, hepsi gerçek) | `59caa39` |
| 26 | **DALGA 2 MADDE 9** (donanım engelli sanılıyordu, **değilmiş**): fastembed/ONNX ile yerel embedding, `torch` yok (15/15) | `ec9c7d0` |
| 27 | **DALGA 2 MADDE 11**: `audio.speak` (Piper 1.8.0, MIT/ONNX) — üretim doğrulanıyor, **kalite unverified** (7/7) | `a56a1c8` |
| 28 | **§12 exit checklist**: `release-security-scan.mjs` — vuln + secret scan (SBOM zaten vardı); test gerçek bir sır ekiyor (7/7) | `fd79cdd` |
| 29 | **MADDE 19** (donanım engelli sanılıyordu, **değilmiş**): `science.md.simulate` (OpenMM 8.6.1, **CPU**) — enerji/sıcaklık doğrulanıyor (9/9) | `d351a32` |
| 30 | **§12**: recovery retry'ları **iptal edilebilir** — sonlanma zaten sağlamdı (ölçüldü), iptal hiç yoktu (3/3, hata geri konarak doğrulandı) | `951e99d` |
| 31 | **§12**: model-router fallback'i **ölçüldü** (7/7) — sağlam ama 429/circuit-breaker farkındalığı **yok**, bu açıkça sabitlendi | `0d2604a` |
| 32 | **§12**: provider varsayılanlarının **9'undan 8'i yüzen alias** — pin durumu açıkça beyan ediliyor + raporlanıyor (10/10) | `pin beyani` |

**On gerçek dış capability** broker'da kayıtlı ve yürütmeyle kanıtlı:
`data.duckdb.query` · `data.profile` · `data.graph.query` · `web.render` · `math.symbolic` ·
`document.parse` · `eval.inspect.run` · `office.convert` · `science.sequence.analyse` ·
`science.molecule.analyse`

**Gerçekten kapalı olanlar** (sahte sayı verilmedi, kanıtla raporlandı):
kod worker'ı (0 API key) · model inference (GPU yok) · retrieval (Postgres/Qdrant yok) ·
görsel/video/ses üretimi (`torch` kurulamıyor).

---

## 3. HER ADIMDA UYGULANAN KAPI SIRASI (değişmez)

1. `./node_modules/.bin/tsc -p packages/engine/tsconfig.json --noEmit` → 0
2. İlgili test dosyası: `npx vitest run test/<dosya>.test.ts`
3. Yeni export varsa: `npm run build -w @haf/engine` sonra `test/t7-api-surface.test.ts`
   → hata çıktısındaki `+ "İsim"` satırlarını **sıralı listeye** ekle
4. `node scripts/repo-hygiene-audit.mjs` → REGRESSION ise `T5-size-ratchet` için
   `engine.ts` bound'unu **audit'in kendi `measured` değerinden** al (`wc -l` DEĞİL — bir fazla sayıyor)
   ve **iki dosyada** güncelle: `scripts/repo-hygiene-audit.mjs` + `apps/release-tool/test/t-hygiene.test.ts`
5. Yeni test dosyası deterministik değilse: `NONDETERMINISM_ALLOWLIST`
   (`scripts/repo-hygiene-audit.mjs`, tam çift tırnaklı yol, alfabetik) + `allowlistSize`
   (`t-hygiene.test.ts`)
6. `npm run docs:state -w @haf/eval` → 0
7. `npm run typecheck` → 0
8. `npm test` → **exit 0**; `×` sayısı 0
9. `git config user.email aurora@local` + `user.name "Aurora Integration"` (her commit öncesi —
   `.git/config` snapshot dışı), `git status --porcelain --untracked-files=all` kontrolü, `git add -A`, commit
10. `/home/user/aurora-vnext-faz-takibi.md` dosyasına yeni bölüm — **`## Açık fazlar`'dan ÖNCE**,
    `assert s.count(anchor)==1`

---

## 4. HARİCİ DENETİM — **TÜM BULGULAR KAPATILDI** (K-1…K-6, 4.1–4.8, madde 8)

Rapor Windows + Node v24 + gerçek yerel modellerle yapılmış. **K-1…K-4 ve 4.8 ölçüldü, gerçek çıktı ve kapatıldı.**
Aşağıdaki "durum" sütunu ben doğruladıkça güncellenecek.

### Kritik (P0)

| ID | İddia | Raporun kaynağı | Durum |
|---|---|---|---|
| K-1 | Dev modunda token yoksa API `0.0.0.0` üzerinde anonim **systemAdmin** açılıyor | `startup-policy.ts:86-87` no-op olduğunu kendisi söylüyor; `main.ts` `HAF_HOST ?? "0.0.0.0"` | ✅ **KAPATILDI `bd318a6`** |
| K-2 | Control Center'ın tek inline `<script>`'i başlıktaki CSP tarafından engelleniyor | `main.ts:669` global `onSend` hook + `dashboard.ts:41` inline script; tarayıcı header∩meta **kesişimini** uygular | ✅ **KAPATILDI `bd318a6`** |
| K-3 | Dosya yazma yedekleri oturumlar arası paylaşılıyor → rollback başka oturumun dosyasını bozuyor | **GERÇEK.** `filesystemCapabilities()` bir kez çalışıyor (`engine.ts:1798`), tek motor tüm session'lara bakıyor, yedek **ham input path** ile anahtarlanıyordu. Rapor "modül-global" dedi, aslında closure — **sonuç doğru, mekanizma yanlış** | ✅ **KAPATILDI `209a3ed`** |
| K-4 | Aynı `x-idempotency-key` + farklı içerik → **hedef dosya siliniyor** | **GERÇEK**, testte üretildi. Sebep: journal replay'de `execute` hiç koşmuyor, bayat null yedek `rm` çağırıyordu | ✅ **KAPATILDI `209a3ed`** |
| K-5 | `workspacePath` için kök allowlist'i yok → `C:\Windows` workspace olarak açılıp `win.ini` okunabildi | **GERÇEK ve ciddi.** `POST /v1/sessions` şemasında `workspacePath: z.string().optional()` (main.ts:1887) — hiç doğrulama yok; `supervisor.ts:200` doğrudan `mkdir`. K-1 ile birleşince anonim systemAdmin任意 yolu seçebiliyordu | ✅ **KAPATILDI `3107962`** |
| K-6 | Model isteğinde etkin timeout yok; süreç öldürülünce oturum sessizce `idle` | **GERÇEK, iki yarısı da.** Router'da timeout hiç yoktu (yalnız codex-subscription'da var). Ve `getActor` `activeTurnId`'yi `_retiredTurn`'e destructure edip **atıyordu** — toparlanma vardı ama kesinti bilgisi kayboluyordu | ✅ **KAPATILDI `17cee68`** |

### Yüksek/orta

| ID | İddia | Durum |
|---|---|---|
| 4.1 | `npm audit --omit=dev`: yüksek/orta açıklar | **DOĞRULANDI** — 4 adet (3 yüksek + 1 orta), hepsi semver aralığı içinde düzeltilebilir | ✅ **KAPATILDI `6b95c12`** |
| 4.2 | Onay süresi dolması 500 dönüyor | **DOĞRULANDI** — `approval-service.ts` `throw new Error(...)` düz hata. **Raporun ifadesi eksik:** reviewer bağlıyken `request` onu doğrudan await ediyor, timeout timer'ı hiç kurulmuyor; süre-dolumu yolu yalnız reviewer **yokken** var | ✅ **KAPATILDI `813f5ff`** (409) |
| 4.3 | Olmayan dosya `/file` → 500 + mutlak yol sızıntısı | **DOĞRULANDI, iki yarısı da** — `executeSessionCapability` her hatayı 500'e sarıyordu; ve `filesystem.read`'in ENOENT mesajı `realpath` çıktısı yani **workspace'in mutlak yolu + session id**, bu `details.reason` ile istemciye gidiyordu | ✅ **KAPATILDI `813f5ff`** (404 + yol gizlendi) |
| 4.4 | Bozuk/boş JSON → 500 HAF-8001 + dev'de stack sızıntısı | **YARISI YANLIŞ:** bozuk JSON zaten 400 HAF-2001 dönüyordu (SyntaxError dalı mevcuttu) — **üretilmedi, testle sabitlendi**. **Stack sızıntısı gerçekti** | ✅ **KAPATILDI `813f5ff`** |
| 4.5 | CORS yok (`OPTIONS` → 404/401, `access-control-allow-*` yok) | **GÖZLEM DOĞRU, SONUÇ YANLIŞ** — `@fastify/cors` `main.ts:601`'de kayıtlı, `origin: false`; cross-origin **operatör açana kadar kapalı**. Dashboard aynı origin'den servis edildiği için preflight göndermiyor. **Kusur değil, kasıtlı güvenli varsayılan** — ama belgelenmemişti | ✅ **KAPATILDI `98f79dd`** |
| 4.6 | Global 100 req/dk; approval polling tek başına ~50/dk yiyor | **DOĞRULANDI** — `RateLimitPresets` **altı preset tanımlıyor ve hiçbiri kullanılmıyordu**; `registerRateLimiting` tek global hook kuruyordu. Raporun "1,2 sn" rakamı bu dashboard'a ait değil (5 sn'de bir) ama sorun aralıktan bağımsız | ✅ **KAPATILDI `98f79dd`** (ayrı kova 240/dk) |
| 4.7 | Windows'a özgü POSIX yolları | **worktree DOĞRULANDI:** `sandbox.ts:177` `isWindows ? "cmd.exe" : "/bin/bash"` ama `worktree-service` koşulsuz POSIX tek tırnak üretiyordu; `cmd.exe` `'`'i alıntı saymaz. **KALAN DOĞRULANMADI:** secret-source yol doğrulama, `worker.sock` EACCES, background-shell POSIX komutları | ⚠️ **worktree `f09556d`**, kalanı açık (Windows gerekiyor) |
| **4.8** | **"contract coverage 1" görev başarısı değil** — `missing.txt` hiç oluşmadı ama `status: completed, contract.coverage: 1` | **GERÇEK.** `verify` `CONVERSATION_CONTRACT`'ta hiç yok ⇒ sohbet turu 3/3=**1** veriyor, `missing` boş | ✅ **KAPATILDI `1f45e1f`** |
| 8 | README `eval:validate 60/60`; ölçülen 58/60 (2 bozuk) · yalnız 12/60 referans çözümü | **"58/60, 2 bozuk" ÜRETİLMEDİ** — `brokenCriteria 0`, `discriminative 60/60`. **"yalnız 12 referans çözümü" BİREBİR DOĞRU.** Asıl kusur: sayıyı **hiçbir test sabitlemiyordu**, aynı tabloda "0/61" yazıyordu | ✅ **KAPATILDI `cb917c2`** |

### Raporun kendi ayırdığı "ürün hatası değil" kalemler (Windows/ortam)
symlink EPERM · `.bin\tsx` ENOENT · `C:\C:\Users...` çift sürücü · OpenAPI CRLF · Unix araçları
(`make`, `printf`, `cat`, `/dev/zero`, `head`) · 5 sn test timeout · POSIX path beklentileri

### Raporun olumlu doğruladıkları
typecheck 10/10 · build 10/10 · production modunda fail-closed (`ProductionAuthPolicyError`) ·
token auth · tenant 403 HAF-1010 · path traversal/symlink engeli · approval akışı · commandId
idempotency · security headers · restart sonrası kalıcılık (4 oturum/907 event/8 mesaj) ·
secret taraması (7 eşleşme, hepsi fixture)

---

## 5. KRİTİK ÇALIŞMA KURALLARI (kullanıcının verdiği, değişmez)

- **Türkçe cevap ver.** Süre sınırı yok; hız değil eksiksizlik.
- Değişiklikleri **doğrudan repoya uygula** (ayrı branch/patch-only REDDEDİLDİ).
  V2 belgesinin FAZ 0'ı `integration-lab` branch'i öneriyor — **bu çelişiyor, kullanıcının
  talimatı geçerli.**
- **"adımları kapata kapata geç"** — her adımı tamamen kapat (implement + test + commit) sonra geç.
- **"sırayla devam et sırayı bozma adım adım tüm fazları tamamla"** — sırayı bozma, faz atlama.
- Kapatılamayan fazda **dur ve kanıtla raporla**; sayı uydurma, sessizce atlama.
- Aurora "kod çalışıyor" kararını **kendi vermeyecek** — compiler/test/güvenlik/statik analiz verir.
- **"repo eklendi", "endpoint çalışıyor", "modül testi geçti" kanıt değildir.**
- Bir capability'yi "prompt/rol/sınıf/API route eklendi" diye **tamam sayma.**
- Verifier yoksa sonuç `succeeded` değil **`unverified`**.
- Güvenlik taraması karar veremiyorsa **UNKNOWN**, SAFE değil.
- İş repoda **değişiklik** olarak inmeli, markdown/CSV deliverable olarak değil.

---

## 6. ORTAM TUZAKLARI (tekrar tekrar ısırıyor)

- **Ortam rastgele sıfırlanıyor:** `node_modules`, pip paketleri (`duckdb`, `polars`, `kuzu`,
  `biopython`, `rdkit`, `crawl4ai`), `tesseract`, `pdftoppm`, Chromium silinebiliyor.
  **Her koşuldan önce yeniden doğrula.** `node_modules` boşsa `npm ci`.
- **`npm test`'te "0 başarısız test ama N failed dosya"** = backend silinmiş, `beforeAll`'da patlıyor.
  `Test Files` ve `> @haf/` satırlarına bak, sadece `×`'e bakma.
- Test dosyaları backend yoksa `describe.skipIf(!PROBE)` ile atlanmalı (**`throw` etmek regresyon**).
  Pure-logic describe'lar skip'in DIŞINDA kalmalı.
- `PATH` kısıtlamak eksik araç simüle ETMEZ (sandbox `PATH=/usr/bin` zorluyor). Skip'i kanıtlamanın
  yolu: probe sabitini zorla false yap, koş, `N skipped` sayısını oku, geri al.
- `risk:"process"|"privileged"|"external_side_effect"` → severity high → **reviewer bağlanmazsa
  `.execute` sonsuza kadar asılır**: `engine.approvals.bindReviewer(async () => ({autoApproved:true, rationale:"…"}))`
- Broker, `verify` `ok:false` dönerse **THROW eder** — sonuç atılır.
- `.execute` yerine shutdown: **`await engine.shutdown()`** (`.close()` YOK).
- `engine.ts` boyut bound'unu **`wc -l`'den alma** — audit bir fazla sayıyor.
- `t7-api-surface.test.ts` **sıralı İSİM LİSTESİ** (`toEqual`), sayı değil.
- `packages/engine/tsconfig.json` yalnız `src/**/*.ts` içerir — **test dosyaları typecheck edilmez**.
- `npx tsc` sessizce `tsc@2.0.4` kurar — `./node_modules/.bin/tsc -p … --noEmit` kullan.
- `cmd | tail` exit kodunu maskeler (`${PIPESTATUS[0]}`).
- Node prob'ları repo İÇİNDE ve `.mjs` olmalı (`/tmp` `node_modules` çözemez).
- `column`/`rg`/`gh` yok. `grep -c` 0 dönünce exit 1.

---

## 7. KAYNAK DOSYALAR

- Plan: `/home/user/uploads/AURORA_TUM_ALANLAR_V2_KAPSAMLI_MASTER_PLANI (1).md`
  (§0 :13 · §2 :78 · Gates :217 · **Gate C :239** · §5 FAZ 0 :276…19 :632 · **§7 waves :1009** ·
  **§17 :1462 = gerçek katalog, 1056/1064 repo**)
- Takip: `/home/user/aurora-vnext-faz-takibi.md` (yeni bölüm `## Açık fazlar`'dan ÖNCE)
- Envanter: `/home/user/aurora-aday-envanteri-raporu.md` · `/home/user/tarama/`
- Eleme: `/home/user/aurora-alan-eleme.md`
- DoD: `/home/user/dod-listesi-denetim.md` · `/home/user/dod-uygulama-gunlugu.md`
- Repo incelemesi: `/home/user/deneme-inceleme-raporu.md`
- **Bu dosya:** `/home/user/aurora-kaldigim-yer.md`

---

## SONRAKİ ADIM (tek cümle)

**Denetim, 4.7'nin kalanı, `web.search` ve V2 dalga 2'nin yapılabilir ilk maddesi kapandı.**
**Madde 15 ölçüldü ve gerekçesiz çıktı:** `CommandJournal`/`EffectJournal` `started`'ı operasyondan
**önce** dayanıklı yazıyor, çökme sonrası `COMMAND_OUTCOME_UNCERTAIN` / `EffectOutcomeUncertainError`
dönüyor (doğru at-most-once); `LongHorizonTaskManager` her geçişte diske yazıp açılışta `running`'i
`queued`'a alıyor. Temporal eklemek zaten tutan bir özelliği korumak için ağır bağımlılık olurdu.
Asıl boşluk **kapsamdaydı**: çökme yolunu hiçbir test sabitlemiyordu → 8 testle sabitlendi.

**MADDE 17 TAMAMEN KAPANDI** — üç ayağı da var: SymPy (`math.symbolic`), Z3 (`math.smt.solve`),
Lean (`math.lean.check`). Kullanıcının istediği "sadece indirmesi kalsın" hali kuruldu:
- `packages/engine/external-workers/requirements.txt` — tüm Python worker bağımlılıkları
- `npm run backends:check` / `npm run backends:install` (Lean için `--lean` bayrağı, çünkü
  `$HOME/.elan`'a yazıyor ve `npm install`'un yan etkisi olarak sessizce çalışması kabul edilemez)
- `math.lean.check` Lean varsa çalışıyor, yoksa `unavailable` + kurulum komutu dönüyor

**Bu adımda testlerin bulduğu iki gerçek hata:** (1) pip health check sahte yeşildi —
`pip install --dry-run` eksik paket olsa da 0 dönüyor; artık rapor okunuyor (düzeltmeden önce
82 paket eksikti). (2) `lean` yokken capability **sonsuza kadar asılıyordu** — var olmayan yolu
spawn etmek `error` yayar, `exit` yaymaz; kod yalnız `exit` dinliyordu. Test 5 sn'de zaman
aşımına uğrayınca ortaya çıktı.

**MADDE 18 KAPANDI** — `cad.render` (OpenSCAD 2021.01). Render edilen mesh **geri ölçülüyor**:
üçgen sayısı, divergence teoremiyle hacim, sınırlayıcı kutu, watertight'lık. Çağıran beklediği
hacmi söyleyebiliyor; uymayan render **başarısız** sayılıyor (10 kat büyük kutu testi: geçerli STL,
watertight mesh, temiz exit — ve yanlış şekil). Open mesh'te hacim `volumeMeasured: false`, çünkü
divergence teoremi kapalı yüzey ister. OpenSCAD `install-backends.mjs`'e de eklendi.

**ÖNEMLİ ÖLÇÜM: "donanım engelli" varsayımı yanlış çıktı.** Dalga 2 madde 9 (embedding) ve madde 11
(TTS) için `torch` istemeyen CPU-dostu alternatifler var: **fastembed 0.9.0** (ONNX, kuruldu ve
çalıştı — bge-small-en-v1.5, 384 boyut) ve **piper-tts 1.8.0** (kuruldu, henüz capability yok).
Yani "engelli" demeden önce alternatif ölçülmeli.

**Adım 26'da yapılan hata ve dersi:** local embedding'i **otomatik varsayılan** yaptım; her motor
kurulumu ilk embed'de `python3 -c "import fastembed"` doğurdu ve 2 çekirdek/1982 MB'ta eşzamanlı
ONNX importları **vitest worker havuzunu öldürdü** (`ERR_IPC_CHANNEL_CLOSED`, özet bile basılmadan).
Ortam hatası gibi görünüyor, değildi. Atıf için üç yönlü bisect gerekti: stash'liyken tamamlandı →
test dosyam çıkarılınca yine çöktü → yalnız engine bağlantısı geri alınınca tamamlandı. Sonuç:
**opt-in** (`localEmbeddings` veya `HAF_LOCAL_EMBEDDINGS=1`), hash varsayılan kaldı.
Ayrıca: test dosyasındaki **top-level `await`** tek başına havuzu başlatmaya yetiyordu (senkron
kontrol eklendi) ve worker'ın `stdin`'inde error handler yoktu (ele alınmamış akış hatası prosesi
düşürür).

**Bilinen tek başarısız test:** `web.render`'ın canlı ağ vakası ("the result does not name the URL
it came from") — gerçek bir public sayfayı çekiyor, ortam silinmesinden sonra egress değişti.
Bu değişiklikle ilgisi yok ve yeşil diye geçilmedi.

**MADDE 11 KAPANDI.** `audio.speak` (Piper 1.8.0). Kayıt **opt-in** (`config.speech.voicePath`):
eksik bir binary'nin bariz bir kurulum komutu vardır ama eksik bir sesin tek mantıklı varsayılanı
yoktur (dil/cinsiyet/boyut değişir), o yüzden sesi olmayan bir motor capability'yi **hiç kaydetmiyor**.
Piper 1.8.0'de downloader da yok — hata mesajı gereken iki dosyayı ve kaynağını söylüyor.
Doğrulanan: ses üretildi + dosya geri okundu + RIFF/WAVE başlığı testte bağımsız doğrulandı +
`lengthScale` büyüyince süre uzuyor. Doğrulanamayan: konuşmanın metne benzeyip benzemediği.

**Bilinen tek başarısız test (değişmedi):** `web.render` canlı ağ vakası — ortam silinmesinden
sonra egress değişti, bu değişikliklerle ilgisi yok, yeşil diye geçilmiyor.

**§12'ye geçildi, ilk madde kapandı.** Ölçüm: SBOM (CycloneDX + SPDX + in-toto provenance) zaten
vardı ve testliydi; **vulnerability scan ve secret scan yoktu** — yani o maddenin üçte ikisi eksikti
ve uzaktan tam görünüyordu. `scripts/release-security-scan.mjs` (+ `npm run security:scan`) ikisini
de koşuyor.

**Testin bulduğu hata (bu commit'i değerli kılan kısım):** ilk sürüm tarama kökünü
`import.meta.url`'den türetiyordu; bu `process.cwd()` ile eşdeğer **görünüyordu ama değildi** —
tarama her zaman bu repoyu hedefliyordu. Yani fixture'a sır eken test gerçek ağacı tarıyor, hiçbir
şey bulmuyor ve tarayıcı **hiçbir şey tespit etmezken temiz rapor veriyordu**. O ana kadar bastığı
her "sır bulunamadı" anlamsızdı. Test olmasa görünmezdi.

**İki yönlü assert zorunlu:** her zaman başarısız olan bir tarayıcı da "planted key'i yakalıyor"
testini geçerdi; o yüzden 5 kimlik bilgisi biçiminin her ikisi de doğrulanıyor (varsa bulur,
silinince temiz).

İlk koşuda 10 eşleşme çıktı, hepsi kasıtlı: AWS'nin kendi doküman örneği `AKIAIOSFODNN7EXAMPLE`,
yerel `postgresql://haf:haf@localhost`, iki üretilmiş TLS fixture anahtarı, `sk-1234567890abcdef`
placeholder'ı. Her biri açılıp okundu ve dosya listesinde ne bulunduğu yazılı — review
tekrarlanabilir, güvenilmeye gerek yok. **Downgrade ediliyor, atlanmıyor**; "testler sorun değil"
diye blanket kural yok, çünkü o, bir test dosyasına commit edilmiş gerçek anahtarı geçirirdi.

**Ölçülen bir düzeltme daha:** `openmm` **`torch` çekmiyor** ("Would install OpenMM-8.6.1") — yani
madde 19'un "donanım engelli" varsayımı da fastembed'deki gibi yanlıştı. Henüz capability yazılmadı.

**Dürüst not:** bu adım için tam vitest paketi yeniden koşulmadı — değişiklik ayrı bir `.mjs`,
bir `node:test` dosyası ve iki npm script; TS kaynağına dokunulmadı, son tam koşu bir commit önce
(`a56a1c8`).

**MADDE 19 KAPANDI.** `science.md.simulate` (OpenMM 8.6.1). **"Donanım engelli" varsayımı yine
yanlıştı** — `pip install openmm` `torch` çekmiyor ve paket bir **CPU platformu** ile geliyor:
8 atomlu Lennard-Jones sistemi 200 adımı bir saniyenin çok altında koştu, 94 K hedefe karşı
**90.9 K** ölçtü (termostat tutuyor). GPU'suz makinede CUDA/OpenCL platformu yok, yani eksik olan
**throughput, capability değil**; sonuç hangi platformun koştuğunu ve hangilerinin var olduğunu söylüyor.

Doğrulanan: enerji sonlu kaldı (minimize → dinamik karşılaştırması, ıraksama = başarısız), sonlu
olmayan enerji verification'da düşüyor. Doğrulanamayan: sayıların fiziksel doğruluğu — bu tamamen
force field ve girdi yapısına bağlı, `physicallyValidated: false`.

**Bu adımın bulduğu ikinci şey:** repodaki hygiene audit'i bir önceki commit'te eklediğim güvenlik
tarayıcısını işaretledi — o dosya aradığı kimlik bilgisi **biçimlerini** içerdiği için audit'in sır
grep'ine yapısal olarak uyuyor. Tam dosya adıyla atlanıyor (dizin wildcard'ı ile değil) ve gerekçesi
skip'in yanına yazılı: pattern'leri değer değil, anchor ve karakter sınıfı.

**§12 durumu: 1 madde kapandı** (SBOM+vuln+secret scan). Kalan maddeler henüz ölçülmedi:
retry/cancellation/resume (bir kısmı Adım 22'de journal kurtarması olarak sabitlendi), prompt-injection
regresyon paketi, SLO'lar, fallback testleri, GPU iş kuyruğu, model pinleme/rollback, temiz
kurulum/kaldırma testi.

**Bilinen tek başarısız test (3 commit'tir değişmedi):** `web.render` canlı ağ vakası — ortam
silinmesinden sonra egress değişti, bu değişikliklerle ilgisi yok, yeşil diye geçilmiyor.

**Sıradaki iş:** §12'nin kalan maddeleri. En verimli başlangıç "Retry loops terminate; cancellation
and resume work" — çünkü journal kurtarması ve `LongHorizonTaskManager`'ın `running`→`queued`
davranışı zaten sabitlendi; eksik olan retry'ın **sonlanma** garantisi ve cancellation.

**Bu adımda öğrenilen ve tekrar işe yarayacak olan:** worker'ın kendi kendini kontrolü çeviri
hatasını **yakalamaz** (çözücü, kendisine *verilen* kısıtları doğru çözer). Yakalayan şey, dönen
modeli çağıranın ağacına **TypeScript tarafında** geri koymak. Ve bir testin işe yaradığını
doğrulamanın yolu, hatayı geçici olarak geri koyup kırmızıya döndüğünü görmek.

**Bu ortamda doğrulanamayan, doğrulanmadan "düzeltildi" denmeyecek olanlar:**
- 4.7'nin Windows dalları (drive path, UNC, `\.\pipe`) — burada Windows yok; documented biçime
  karşı test edildi, OS'a karşı değil.
- `audio.transcribe` isabeti — Türkçe espeak-ng sesi "ama çoğu" diye çevrildi; gerçek insan sesi
  olmadan modelin mi sesin mi kusurlu olduğu ayrılamıyor. Sonuçlar bu yüzden `unchecked: true`.
- SearXNG provider'ın canlı yolu — public instance'lar JSON vermiyor; test kendi HTTP
  sunucuma karşı çalıştı.

### Kapatılan 5 bulgunun özeti (kanıt + commit)

**K-1** — varsayılan host `0.0.0.0` → **`127.0.0.1`**; yeni `assertAnonymousExposurePolicy` bilerek
`nodeEnv`'e bağlı **değil** — anonim mod + loopback dışı adresi **her modda** reddediyor, çünkü
"development" gerekçesi yalnız soket yerelken geçerli. Bilinçli tercih:
`HAF_DEV_ANONYMOUS_NONLOOPBACK=true`. **17/17.**

**K-2** — script **SHA-256 hash** ile izinli, `'unsafe-inline'` ile gevşetmek yerine; hash
`dashboardHtml`'den hesaplanıyor, kopyalanmıyor (kopyalanan hash ilk düzenlemede sessizce bayatlar
ve sayfa yine ölür). Bir test varsayılan politikanın `'unsafe-inline'` **içermediğini** sabitliyor. **8/8.**

**K-3/K-4** — yedek anahtarına workspace eklendi **ve** kayıt başarılı `atomicWrite`'tan hemen sonra
siliniyor. **Anahtarlamak tek başına yetmedi:** replay'de `execute` koşmadığı için bayat kayıt hâlâ
diskle eşleşiyor ve null yedek dosyayı siliyordu. **3/3**, düzeltme öncesi kırmızıydı.

**4.8** — tur sonucuna `verification` alanı eklendi: doğrulayıcı çalışmadığını açıkça söylüyor +
araç çağrısı/hata sayısı + başarısız capability'ler. Actor `isError`'u zaten takip ediyordu, sadece
hiçbir yerde özetlenmiyordu. Test gerçek motorla denetimin senaryosunu üretiyor: workspace dışına
yazan `filesystem.write` ⇒ `toolErrors: 1`, `failedTools: ["filesystem.write"]`,
`allToolCallsFailed: true` — hem de `coverage: 1` yanında. **3/3.**

### K-5 / K-6 nasıl kapatıldı

**K-5** (`3107962`) — yeni `packages/engine/src/runtime/workspace-policy.ts`. İki kural, bilerek
farklı türde: (1) **her zaman** geçerli deny listesi — dosya sistemi kökleri, `/etc`, `/usr`,
`C:\Windows`, `C:\Program Files`, home dizini; **dizinin kendisini** karşılaştırıyor, altındakileri
değil, yani `/usr`'yi reddetmek `/usr/local/src/project`'i engellemiyor; traversal önce
çökertiliyor (`/etc/../etc` geçemiyor). (2) **isteğe bağlı** `allowedWorkspaceRoots` — bilerek
opt-in, çünkü Aurora meşru olarak oturum oluştururken seçilen dizinlere karşı çalışıyor (içe
aktarılan oturumlar, worktree'ler, testler). Göreli yol tamamen reddediliyor (sunucunun cwd'sine
çözülürdü). Ret **400 HAF-4031** olarak dönüyor, 500 değil.

**Testin yakaladığı, planda olmayan şey:** allowlist reddi başlangıçta izinli kökleri hata
mesajında listeliyordu. Workspace yolu isteyebilen biri tekrar tekrar isteyebilir, yani o mesaj
sunucunun dosya düzenini bir 400 karşılığında verirdi. Kökler artık yalnız loglanan `detail`
alanında; bir test gövdede bulunmadığını sabitliyor.

**K-6** (`17cee68`) — yeni `models/model-stream-timeout.ts`. Timeout **toplam sürede değil
sessizlikte**: uzun üretim meşru, patolojik olan hiç olay gelmemesi. Pencere her olayda
sıfırlanıyor — bir test tam bunu doğruluyor (1 sn pencereye karşı 40 ms arayla 6 parça, hiç
kesilmiyor). Varsayılan 120 sn, 1 sn–30 dk arası kıstırılmış. Süre dolunca isteğin kendi
signal'i de iptal ediliyor (soket terk edilmiş bir generator'ın ardında açık kalmasın). Kod
`stream_idle_timeout` — `cancelled`'dan (kullanıcı durdurdu) ve `transport_error`'dan (bağlantı
koptu) bilerek ayrı.

İkinci yarı: `getActor`'daki `activeTurnId` artık `initialize`'a geçiyor; kesinti hem
`turn.interrupted` olayıyla hem sohbete eklenen mesajla bildiriliyor. Mesaj işin eksik
olabileceğini ve **hiçbir şeyin doğrulanmadığını** söylüyor. Tur yokken sıradan toparlanma
düzgün raporlanıyor — olmayan bir kesinti uydurmak bildirimi güvenilmez kılardı.

**Kendi üç test hatam** (hepsi yanlış varsayım, yazım hatası değil): 60 ms pencere bekledim,
1000 ms geldi — clamp çalışıyordu. Fallback testi iki adayı da aynı sağlayıcıya yönlendirdi,
çünkü çıplak model rotası registry'nin varsayılan sağlayıcısına (ilk kaydedilene) çözülüyor.
Ve toparlanma fikstürü `save(sessionId, snapshot)` çağırdı, oysa store yalnız snapshot alıyor —
yani bir UUID string'i yazdı ve vaka **hiçbir sebep yokken** geçti; artık fikstürün diskte
olduğunu doğruluyor.

### 4.1–4.4 özeti

**4.1** (`6b95c12`) — `@modelcontextprotocol/sdk` 1.30.0→1.32.1, `hono` 4.13.8→4.13.13,
`source-map-js` 1.2.1→1.2.2, `vite` 6.4.3→6.4.5, `http-cache-semantics` 4.2.0→4.3.0.
**Yalnız `package-lock.json` değişti**, hiçbir `package.json` değil ⇒ hepsi zaten kabul edilmiş
aralıklarda. `npm audit --omit=dev` artık boş. **Dürüst not:** kalan 11 açığın tümü yalnız-geliştirme;
ikisi kritik (`vitest`/`tinypool`) ve tek düzeltme semver-major — test koşucusunu yükseltmek bir
güvenlik commit'inin içine sessizce alınacak bir şey değil, karar olarak bırakıldı.

**4.2** (`813f5ff`) — `ApprovalNotPendingError` (HAF-3007) + **409**. 404 değil: kayıt duruyor
(denetim günlüğünde karar veya `expired` ile), kaybolan yalnız karar verebilme yetkisi.

**4.3** (`813f5ff`) — ENOENT/ENOTDIR → **404 HAF-7001**, ve `reason` artık çağıranın verdiği göreli
yol; `realpath`'in ürettiği mutlak yol gövdeye girmiyor. Bir test sunucu önekinin gövdede
bulunmadığını doğruluyor.

**4.4** (`813f5ff`) — bozuk JSON iddiası **üretilmedi** (zaten 400 HAF-2001); mevcut davranış
testle sabitlendi, çünkü üretilmeden "kapandı" denilen bulgu tekrar rapor edilir. Stack sızıntısı
gerçekti ve kaldırıldı — stack zaten sunucu loguna yazılıyor, gövdede tekrarına gerek yok.

**Bir test hatam daha:** gövdede `"at "` alt dizesinin olmadığını iddia ettim; o sıradan düzyazıda
geçiyor ve aslında temiz olan bir yanıtta düştü. İddialar artık stack'in *biçimini* tarif ediyor.

### Ölçülen `eval:validate` sayıları (`cb917c2`)

`totalTasks 61 · evaluatedTasks 60 · skippedTasks 1 · discriminative 60 · brokenCriteria 0 ·
vacuous 0 · byDesignNoop 2 · withReferenceSolution 12`

Yeni `packages/eval/test/readme-eval-claims.test.ts` README satırını okuyup **her sayıyı
`validateCoreSuite()` ile karşılaştırıyor** (sabit değerlerle değil) — görev eklenirse test kırılır.
Ayrıca `withReferenceSolution < evaluatedTasks` iddiasını içeriyor; gurur okşayan bir iddia değil
ama dürüst olanı.

### 4.5 / 4.6 / 4.7 nasıl kapandı

**4.5** — `middleware/cors-policy.ts`: `HAF_CORS_ORIGIN` yoksa `origin: false`. `"*"` değil, çünkü
`credentials: true` ile tarayıcı wildcard'ı zaten reddeder ve niyet origin'lerin **adlandırılması**.
Boş/beyaz-alan değişken "tanımsız" sayılıyor. Bir test alt-dizi eşleşmesinin
`https://ops.example.com.evil.tld`'yi geçirmediğini doğruluyor.

**4.6** — `RateLimitPresets.polling` (240/dk) + **iki hook**. Polled rotalar muaf **değil**, ayrı
kovalı; ikinci limiter `polling:` önekli anahtar kullanıyor, yoksa iki hook aynı istemci-IP kovasını
paylaşırdı — bir test genel bütçeyi doldurup poll'un hâlâ 200 döndüğünü doğruluyor.

**4.7** — `quoteForShell(value, platform)`: bash → tek tırnak + `'"'"'`; cmd → çift tırnak, `"` →
`""`, `%` → `%%` (cmd.exe çift tırnak **içinde** `%VAR%` genişletir), `^` yalnız bırakılıyor (çift
tırnak içinde özel değil). **POSIX dalı gerçek `/bin/bash` ile round-trip edildi** (`$(echo pwned)`
literal kalıyor); **cmd.exe dalı yalnız belgelenmiş kurallara karşı doğrulandı** — bu ortamda
`cmd.exe` yok ve bu sınırlama testin içine yazıldı. `sandbox.exec` argv değil komut dizesi alıyor,
yani asıl düzeltme (kabuk dizesi hiç kurmamak) arayüz değişikliği gerektiriyor.


---

## §12 "Retry loops terminate; cancellation and resume work" — KISMEN ÖLÇÜLDÜ, KAPATILMADI

**Ölçülen (doğrulandı): sonlanma yarısı zaten sağlam.** `model-router` aday listesiyle sınırlı,
`session-lease` `attempt < 2`, `mcp-manager` `maxRetries: 3`, `UnifiedCognitiveLoop.handleFailure`
`maxRetries` ile sınırlı ve sayaç `execute()` başında (satır 68) sıfırlanıyor — yani **sayaç
çalıştırmalar arası sızmıyor**, şüphelendiğim hata yok. Test bunu doğruluyor: iptal olmayan bir
çalışma tam backoff'u (1+2+3 sn) koşup kendi kendine bitiyor, `metaController.run` tam 4 kez
çağrılıyor (1 orijinal + 3 retry). **Bu test GEÇİYOR.**

**Bulunan gerçek boşluk: iptal yarısı hiç yok.** Döngüde `AbortSignal` yok, hiçbir yerde iptal
kontrolü yok (dosyadaki tek "cancel" satır 260'ta bir mod adı eşlemesi), ve denemeler arasında
**kesilemeyen** `setTimeout` var. Sınırlı olduğu için asla "hang" gibi görünmüyor — sadece
gereğinden uzun sürüp başarısız oluyor.

**⚠️ YAPILAN DEĞİŞİKLİK ÇALIŞMIYOR — COMMIT EDİLMEDİ.** `execute()`'a opsiyonel `signal` eklendi,
kesilebilir bir `sleep()` yazıldı, döngü başına iptal kontrolü kondu; `TSC=0`. Ama iki test
**KIRMIZI**: `result.recoveryCancelled` **undefined** dönüyor, yani **iptal dalı hiç çalışmıyor**.
Muhtemel sebep: `this.signal` ataması `handleFailure`'a ulaşmıyor (ya atama satırı beklediğim
yerde değil ya da `handleFailure` başka bir yoldan çağrılıyor). Bu, değişikliğin çalıştığını değil
çalışmadığını kanıtlıyor; "kapandı" diye commit edilmedi.

Bu yolda düzeltilen iki gerçek hata: iptal-dönüş nesnesinde `subsystemsUsed` eksikti
(`updateStateFromResult` satır 289 `result.subsystemsUsed.length` okuyor — eksikse iptal olduğunu
bildirmek yerine fırlatıyordu) ve `finish` beyanından önce kullanılıyordu.

**Çalışma ağacında commit edilmemiş duruyor:**
- `packages/engine/src/aurora/unified-cognitive-loop.ts` (değişik)
- `packages/engine/test/cognitive-loop-cancellation.test.ts` (yeni, 1/3 geçiyor)

**Sonraki turda ilk iş:** `execute()` içindeki `this.signal = signal` atamasının gerçekten
çalıştığını ve `handleFailure`'ın o instance üzerinden çağrıldığını doğrulamak (bir `console.log`
veya breakpoint ile), sonra iki testi yeşile almak, sonra commit.

**Son commit hâlâ `d351a32`** (madde 19). Bu adım commit edilmedi.

**§12'nin geri kalanı henüz ölçülmedi:** prompt-injection regresyon paketi, SLO'lar, fallback
testleri, GPU iş kuyruğu, model pinleme/rollback, temiz kurulum/kaldırma testi.


---

## §12 "Retry loops terminate; cancellation and resume work" — KAPANDI (`951e99d` + `6e82e0f`)

**Ölçüldü: sonlanma yarısı zaten sağlamdı.** Tüm retry döngüleri sınırlı — `model-router` aday
listesiyle, `session-lease` `attempt < 2`, `mcp-manager` `maxRetries: 3`,
`UnifiedCognitiveLoop.handleFailure` `maxRetries` ile ve sayaç `execute()` başında sıfırlanıyor
(satır 68). Çalıştırmalar arası sızan bir sayaç aradım, **yok**. Bunu sabitleyen test var: iptal
olmayan bir çalışma tam 1+2+3 sn backoff'u koşuyor ve controller'ı tam 4 kez çağırıyor.

**İptal yarısı hiç yoktu.** Döngüde `AbortSignal` yok, hiçbir yerde iptal kontrolü yok (tek
"cancel" satır 260'ta bir mod adı eşlemesi), denemeler arasında kesilemeyen `setTimeout` var.
Sınırlı olduğu için asla "hang" gibi görünmüyordu — sadece uzun sürüp başarısız oluyordu, ki bu
modele atfedilen türden bir belirti.

**Şimdi:** `execute()` opsiyonel `AbortSignal` alıyor; döngü her denemeden önce kontrol ediyor;
backoff sleep abort'ta çözülüyor. İptal edilen çalışma **6 saniye yerine onlarca ms**'de dönüyor,
`recoveryCancelled` veriyor, `task.recovery.cancelled` event'i atıyor ve failure'ı kendi trace
slotuna yazıyor.

**Bu turda üç hata, hepsi benim — ve sıra önemli.** (1) İptal-dönüş nesnesinde `subsystemsUsed`
eksikti; `updateStateFromResult` onu koşulsuz okuduğu için iptal edilen çalışma iptal olduğunu
bildirmek yerine fırlatıyordu. (2) Sleep'in tamamlama callback'i beyanından önce
kullanılıyordu. (3) Ve hepsi düzelip kod çalıştıktan sonra bile iki test kırmızıydı — çünkü
`execute` run result'ı sarmalıyor ve bayrak `result.runResult.recoveryCancelled`'da, 
`result.recoveryCancelled`'da değil. **Yanlış alanı işaret eden bir assertion yüzünden doğru bir
değişikliği neredeyse geri alıyordum.** Duvar saati sayıları aksini söylüyordu: iptal edilen vaka
29 ms'de, iptal olmayan 5004 ms'de dönüyordu.

**Regresyon testi hata geri konarak doğrulandı:** abort kontrolü `false` yapılınca 2 vaka
kızarıyor, geri konunca 3/3.

**Ayrıca:** nondeterminism envanteri 65→66 (yeni test gerçek timer kullanıyor, çünkü test ettiği
şey gerçek bir timer'ı kesmek) ve bunu yakalayan **test** oldu, audit scripti değil — script "all
ratchets hold" diyordu çünkü yeni giriş doğru şekilde allowlist'teydi, ama audit'in kendi
sayılarını kontrol eden test hâlâ 65 bekliyordu. Aynı rapor hakkında anlaşamayan bir script ve bir
test, tek başına ikisinden de değerli.

**Kapılar:** typecheck 0 · hygiene all ratchets hold · `docs:state` **378/3089/31** · tam test
**321 passed / 1 failed / 1 skipped** — tek başarısız `web.render` canlı ağ vakası, 4 commit'tir
değişmedi, çevresel.

**§12'nin geri kalanı (henüz ölçülmedi):** prompt-injection regresyon paketi, SLO'lar, fallback
testleri (outage/rate-limit/provider değişimi), GPU iş kuyruğu, model pinleme/rollback, temiz
kurulum/kaldırma testi, lisans uyumu, çok kiracılı izolasyon testi.


---

## §12 "Fallbacks tested for outage/rate-limit/provider change" — KAPANDI (`0d2604a`)

**Ölçüldü: fallback altyapısı zaten sağlam.** `model-router.ts` sıralı aday listesinde geziyor,
takılan provider'ı **deneme başına** bir controller ile iptal ediyor (ilk provider'ı öldürmek
onun yerine geçeni de iptal etmesin diye), idle timeout uyguluyor, hatayı sınıflandırıyor,
`route_failed` atıyor ve ilk denemeden sonraki her event'i `fallback: true` ile işaretliyor.
Catch bloğu doğru: yalnızca çıktı zaten üretildiyse, hata cancellation ise, **veya** aday
kalmadıysa yeniden fırlatıyor.

**Eksik olan:** başarının *neden* olduğuna dair hiçbir farkındalık yok — 429 okunmuyor,
rate-limit backoff yok, circuit breaker yok. Rate-limit yiyen provider ile çöken provider
**birebir aynı** ele alınıyor. Ve dosyanın **kendi testi yoktu**, yani "fallback çalışıyor"
kod yorumlarında taşınan bir varsayımdı, ölçülmüş bir özellik değil.

**7 vaka artık ölçüyor:** outage'da fallback + `fallback: true` işaretinin assert edilmesi,
aday kalmayınca sebebin yüzeye çıkması, kayıtlı olmayan provider'ın adıyla bildirilmesi,
provider değişiminde yenisinin hizmet verip emeklinin çağrılmaması, çift kaydın reddi,
default provider'ın çalışma sırasında unregister edilmekten korunması.

**Rate-limit vakası bir YOKLUĞU assert ediyor** — hiçbir şeyin `retryAfterMs` beklemediğini ve
hiçbir şeyin hatanın rate-limit olduğunu kaydetmediğini. Bir yokluğu sabitlemek burada değerli:
rate-limit ele alımı sonradan eklenirse o vaka yeniden yazılmak **zorunda**, yani ekleme fark
edilir, kimse izlemezken davranış sessizce değişmez.

**⚠️ DÖRT VAKA İLK DENEMEDE BAŞARISIZDI VE DÖRDÜ DE BENİM HATAMDI.** Aday listesi
`request.model` + `request.fallbackModels`'dan kuruluyor ve bir route yalnızca
`provider:model` biçimindeyse bir provider adı taşıyor — `parseModelRoute` **iki nokta** ile
ayırıyor, slash ile değil. İlk sürüm `model: "whatever"` veriyordu, `fallbackModels` yoktu,
yani tam **bir** aday vardı ve doğru olarak fallback olacak bir şey yoktu; sonra `"primary/m"`
verdi, ki bu hiç parse edilmiyor, o yüzden her aday default provider'a çözüldü ve ikinci deneme
aynı ölü provider'a çarptı. **İkisi de tam olarak bozuk bir fallback gibi görünüyordu ve ikisi
de bozuk bir testti.** Router'ın hiçbir değişikliğe ihtiyacı yoktu ve hiçbir değişiklik almadı.

**Kapılar:** 7/7 · typecheck 0 · hygiene all ratchets hold · `docs:state` **379/3096/31**. Kaynak
değişikliği yok, o yüzden ratchet oynamadı.

**§12'den geriye kalan:** prompt-injection regresyon paketi, SLO'lar (latency/cost/reliability),
GPU iş kuyruğu, model pinleme/rollback, temiz kurulum/kaldırma testi, lisans uyumu, çok kiracılı
izolasyon testi.


---

## §12 "Model/provider updates pinned and rolled back safely" — KAPANDI (`570df5a`)

**Ölçüldü ve maruziyet beklediğimden geniş: 9 varsayılandan 8'i yüzen alias.**
- `google` ve `vertex` → `gemini-pro-latest` (Google'ın **tanım gereği** taşıdığı bir işaretçi)
- `openai` ve `openai-responses` → tarihsiz `gpt-4.1-mini`
- `ollama` → `qwen3` · `qwen` ve `qwen-local` → `qwen3.8-27b` · `openrouter` → `anthropic/claude-sonnet-4.5`
- Tarihli pinlenmiş olan yalnız **bir** tane: `claude-sonnet-4-5-20250929`

Bir provider alias'ı taşıdığında motorun davranışı **kod değişikliği olmadan, sürüm bump'ı
olmadan ve dün kullanılan modele geri dönmenin bir yolu olmadan** değişiyor — ve repoda bu
maruziyeti kaydeden hiçbir şey yoktu.

**Bilerek YAPILMAYAN:** pinlenmiş ikame seçilmedi. Bir tane seçmek belirli bir sürüm adı
vermek demek; var olmayan ya da ilgili hesabın çağıramayacağı bir ad vermek, dürüst bir yüzen
varsayıldan **daha kötü** olurdu, çünkü review anında değil istek anında patlardı. Yani çözüm
ikame değil **görünürlük + zorlama**: `classifyModelPin` sınıflandırıyor, her profil
`defaultModelPinned`'i açıkça beyan ediyor, `floatingDefaultModels` maruz kalanları sayı olarak
değil **provider+model çifti** olarak raporluyor — ki kasıtlı rollback'i mümkün kılan bu.

Bir boyut son eki sürüm pini sayılmıyor: `qwen3.8-27b` modelin ne kadar büyük olduğunu
söylüyor, hangi revizyonun hizmet edildiğini değil. Sınıflandırıcı, yanlış olmanın en ucuz
olduğu yönde temkinli: stabil bir modele yüzen demek sadece birinin bakması demek; hareket
eden birine pinli demek ise davranışı sessizce değiştiren bir değişikliği gizlerdi.

**ÇÖZÜLMEMİŞ NÜANS, testte kayıtlı:** yerel bir provider'da model adı kendi kendine değişmeyen
bir ağırlık dosyasını adlandırır, yani "yüzen" orada tartışmalı olarak yanlış kelime. Yerel
profiller yine de string'lerine göre sınıflandırılıyor, çünkü belirli bir dağıtımın ağırlıkları
gerçekten pinleyip pinlemediğini bu dosya bilemez ve tahmin etmek, pinli bir yerel model ile
hareket eden bir cloud alias'ı arasındaki gerçek farkı gizlerdi.

**Bu turun hatası:** Gemini profillerinin `gemini` ve `gemini-cli` olduğunu **tahmin ettim**,
gerçekte `google` ve `vertex`. Test bunu yakaladı; oradan sonrası ölçülerek yapıldı.

**Kapılar:** 10/10 ve 14/14 · typecheck 0 · hygiene all ratchets hold · `docs:state`
**380/3106/31**.

**§12'den geriye kalan:** prompt-injection regresyon paketi, SLO'lar (latency/cost/reliability),
GPU iş kuyruğu, temiz kurulum/kaldırma testi, lisans uyumu, çok kiracılı izolasyon testi.
