# AURORA V2 — KALAN TÜM İŞLER (envanter)

**Son commit:** `570df5a` · **Tarih:** 2026-10-21
**Kaynak:** `uploads/AURORA_TUM_ALANLAR_V2_KAPSAMLI_MASTER_PLANI (1).md` — §7 dalgalar (:1009), §12 exit checklist (:1215)
**Bu dosyanın kuralı:** bir madde yalnızca **ölçülmüşse** ✅ işaretlenir. "Kod var", "endpoint çalışıyor",
"modül testi geçti" kanıt değildir. Ölçülmeyen madde **ölçülmedi** olarak kalır.

---

## A. §12 PRODUCTION READINESS EXIT CHECKLIST (30 madde)

### A1. Doğruluk ve güvenilirlik (7)

| # | Madde | Durum | Kanıt / not |
|---|---|---|---|
| 1 | Kritik capability'lerin **gerçek model** kabul testleri var | ❌ **ölçülmedi** | 0 API anahtarı, GPU yok. Bu ortamda kapatılamaz. |
| 2 | Uçtan uca görev başarısı **dondurulmuş held-out** sette ölçülüyor | ❌ **ölçülmedi** | `eval:validate` 61 görev sayıyor ama held-out split yok. |
| 3 | **Sahte başarı** ve desteksiz iddialar test ediliyor | 🔶 **kısmen** | Bu oturumda 20+ yerde bu kusur kapatıldı ama sistematik bir regresyon paketi yok. |
| 4 | Retry döngüleri sonlanıyor; **iptal ve resume** çalışıyor | ✅ **KAPANDI** | `951e99d`. Sonlanma zaten sağlamdı (ölçüldü); iptal hiç yoktu, eklendi, 3/3, hata geri konarak doğrulandı. |
| 5 | Kalıcı durumun **şema migrasyonu** ve test edilmiş kurtarması var | 🔶 **kısmen** | Journal kurtarması `e112219` (8/8). Şema migrasyonu **ölçülmedi**. |
| 6 | Çok kullanıcılı/eşzamanlı oturumlar **veri sızdırmıyor** | ❌ **ölçülmedi** | RLS testi var ama superuser'a RLS uygulanmıyor (bilinen). |
| 7 | Harici yan etkiler **idempotent veya onay kapılı** | 🔶 **kısmen** | `risk:"process"` onay akışı `bindReviewer` ile düzeltildi; idempotency **ölçülmedi**. |

### A2. Güvenlik ve gizlilik (7)

| # | Madde | Durum | Kanıt / not |
|---|---|---|---|
| 8 | OS sandbox izolasyonu **adversarial testlerle** kanıtlanmış | ❌ **ölçülmedi** | Tranche A güvenlik işleri yapıldı ama adversarial kaçış testi yok. |
| 9 | API auth/authz/default bind güvenli | 🔶 **kısmen** | 4.2/4.3/4.4/4.5/4.6/K-1..K-6 kapatıldı (`813f5ff`, `98f79dd`, `bd318a6`…). Tam denetim **yok**. |
| 10 | Tool least privilege, egress kısıtı, **secret masking** çalışıyor | ❌ **ölçülmedi** | Secret scan var (`fd79cdd`) ama masking **ölçülmedi**. |
| 11 | **Prompt injection / indirect injection** regresyon paketi CI'da | ❌ **AÇIK — sıradaki aday** | Hiç ölçülmedi. |
| 12 | **SBOM, vulnerability scan, secret scan** her sürümde | ✅ **KAPANDI** | `fd79cdd`. SBOM zaten vardı; vuln+secret scan eklendi, test gerçek sır ekiyor (7/7). |
| 13 | PII saklama, export/silme, log politikası **belgelenmiş** | ❌ **ölçülmedi** | |
| 14 | Tüm yüksek etkili aktiviteler doğru **onay** istiyor | 🔶 **kısmen** | Onay akışı var; "tümü" **ölçülmedi**. |

### A3. Kalite ve performans (5)

| # | Madde | Durum | Kanıt / not |
|---|---|---|---|
| 15 | **Latency/cost/reliability SLO**'ları tanımlı ve ölçülüyor | ❌ **AÇIK — sıradaki aday** | OTLP trace + `streamIdleTimeoutMs` var; SLO tanımına bağlı değil. |
| 16 | Her etkin alan için **baseline'a karşı iyileşme** benchmark'ı | ❌ **ölçülmedi** | |
| 17 | **Fallback'ler** outage/rate-limit/provider değişimi için test edilmiş | ✅ **KAPANDI** | `0d2604a` (7/7). **Not:** fallback sağlam ama 429/circuit-breaker farkındalığı **yok** — bu açıkça sabitlendi. |
| 18 | **GPU-ağır işler** kuyruklanıyor/iptal edilebilir, sistemi tüketmiyor | ❌ **ölçülmedi** | GPU yok. |
| 19 | **Model/provider güncellemeleri pinli** ve güvenle geri alınabilir | 🔶 **KAPANDI ama kısmen** | `570df5a`. 9 varsayılandan **8'i yüzen alias**; pin durumu artık açıkça beyan ediliyor ve raporlanıyor. **İkame yapılmadı** — bilerek (var olmayan bir sürüm adı istek anında patlardı). |

### A4. Ürün ve operasyon (6)

| # | Madde | Durum | Kanıt / not |
|---|---|---|---|
| 20 | **Temiz kurulum/güncelleme/kaldırma** hedef OS'ta test edilmiş | ❌ **ölçülmedi** | `install-backends.mjs` idempotent ama uninstall testi yok. |
| 21 | **Local vs API modu** açıkça ayırt ediliyor | 🔶 **kısmen** | `dataPolicy` ve `localEmbeddings` var; sistematik ayırt **ölçülmedi**. |
| 22 | **Capability kartları** supported/experimental/unavailable gösteriyor | 🔶 **kısmen** | `MATURITY_MATRIX.md` üretiliyor; kart düzeyinde **ölçülmedi**. |
| 23 | Kullanıcı görevi görebilir/iptal edebilir, artifact inceleyebilir, yan etkileri onaylayabilir ve **geri alabilir** | 🔶 **kısmen** | İptal `951e99d` ile cognitive loop'a eklendi. Geri alma **ölçülmedi**. |
| 24 | Dokümanlar, bilinen sınırlar ve hata mesajları **dürüst** | ✅ **sürekli** | Bu oturumun ana teması; `docs:state` + README iddia testi (`readme-eval-claims.test.ts` 2/2). |
| 25 | İzleme, **support bundle** ve kurtarma talimatları var | ❌ **ölçülmedi** | |

### A5. Açık kaynak entegrasyon yönetişimi (5)

| # | Madde | Durum | Kanıt / not |
|---|---|---|---|
| 26 | Her bileşenin sahibi, upstream'i, commit/sürümü, lisansı ve model/veri şartları var | 🔶 **kısmen** | `requirements.txt`'te capability→paket→sistem-bağımlılığı tablosu var. Tam envanter **yok**. |
| 27 | Sürümde **review edilmemiş `main`/`latest` bağımlılığı** yok | 🔶 **kısmen** | `570df5a` model alias'larını kapsıyor; **paket** tarafında `>=` alt-sınır var, üst-sınır **yok**. |
| 28 | Lisans bildirimleri ve atıf **paketlenmiş** | 🔶 **kısmen** | SBOM var (`release.ts:89-90`); atıf paketleme **ölçülmedi**. |
| 29 | Terk edilmiş/ele geçirilmiş upstream **devre dışı bırakılabilir/değiştirilebilir** | ❌ **ölçülmedi** | |
| 30 | Bileşen güncellemesi **benchmark ve güvenlik taraması** tetikliyor | ❌ **ölçülmedi** | Güvenlik taraması var (`fd79cdd`) ama güncellemeye bağlı **değil**. |

**§12 özeti:** 30 maddeden **4'ü kapandı** (4, 12, 17, 24), **1'i kısmen kapandı** (19), **10'u kısmen**, **15'i hiç ölçülmedi**.

---

## B. §7 DALGA MADDELERİ (20)

### İlk dalga (1-8)
| # | Madde | Durum |
|---|---|---|
| 1 | Evaluation (Inspect AI adaptasyonu) | ✅ |
| 2 | Browser/OS (Playwright) | ✅ `web.render` |
| 3 | Code worker (OpenCode/OpenHands/Aider) | ⛔ **0 API anahtarı** |
| 4 | Documents (Docling/PaddleOCR/Tesseract) | ✅ `document.parse`, `extractPdfText` |
| 5 | Model inference (Ollama/vLLM) | ⛔ **GPU yok** |
| 6 | Web retrieval (SearXNG + Crawl4AI) | ✅ SearXNG provider 7/7 |
| 7 | Telemetry (OpenTelemetry) | ✅ OTLP traces |
| 8 | Retrieval (Qdrant/pgvector) | ⛔ **Postgres yok** |

### İkinci dalga (9-15) — **KAPALI**
| # | Madde | Durum |
|---|---|---|
| 9 | Real embedding + reranking | ✅ `ec9c7d0` fastembed, **torch'suz**, 15/15 |
| 10 | Audio ASR | ✅ `87ee1dd` Vosk, 12/12 |
| 11 | Local TTS | ✅ `a56a1c8` Piper 1.8.0, 7/7 |
| 12 | Image generation (ComfyUI) | ⛔ **GPU yok** |
| 13 | Office (LibreOffice) | ✅ `office.convert` (MPL-2.0 ölçüldü) |
| 14 | Data analysis (DuckDB+Polars) | ✅ `data.duckdb.query`, `data.profile` |
| 15 | Workflow durability (Temporal) | ✅ **ölçüldü, gerekçesiz bulundu** — `e112219`, boşluk kapsamdı |

### Üçüncü dalga (16-20)
| # | Madde | Durum |
|---|---|---|
| 16 | Video generation | ⛔ **GPU yok** |
| 17 | Math formal (SymPy/Lean/Z3) | ✅ `e2653e3` 18/18 + `40ba8df` |
| 18 | 3D/CAD | 🔶 OpenSCAD ✅ `cad.render` 14/14; **Blender ve FreeCAD entegre değil** |
| 19 | Scientific packs (RDKit/Biopython/OpenMM) | ✅ `d351a32` OpenMM CPU, 9/9 |
| 20 | Robotics/IoT, CRM/ERP, finance/legal/medical | ❌ **AÇIK** — plan açık güvenlik ve review kapıları şart koşuyor |

---

## C. HİÇ DOLDURULMAMIŞ CAPABILITY ALANLARI

Aurora **427 capability** tanımlıyor; boşluk capability sayısı değil, **backend**. Hâlâ boş olanlar:

1. **Image generate** — ComfyUI worker (GPU gerekiyor)
2. **Image edit**
3. **Image upscale**
4. **Video generate** (GPU gerekiyor)
5. **Outbound message** (e-posta/mesaj gönderme)

---

## D. BU ORTAMDA DOĞRULANAMAYANLAR (dürüst liste)

Bunlar eksik iş değil, **bu sandbox'ın sınırları**. Kapatmak için farklı bir ortam gerekiyor:

1. **Windows dalları** — gerçek bir Windows OS'a karşı doğrulanmalı (`windows-path-portability.test.ts` 10/10 ama simüle)
2. **ASR doğruluğu** — kayıtlı insan konuşmasına karşı (Vosk bilinen bir Türkçe cümleyi `"ama çoğu"` diye çevirdi)
3. **TTS doğallığı** — insan dinleyiciye karşı (referans kayıt yok; tanıyıcıya yönlendirmek sadece Vosk'u ölçer)
4. **`raceStrategies`** — gerçek eşzamanlılıkla
5. **`/v1/neural-*` ve `/v1/counterfactual/*` yeniden adlandırmaları** — kırıcı API değişikliği
6. **`CounterfactualSimulator` mekanizması** — gerçek öğrenme mi, isim mi?
7. **`backboneWiring()`'in Postgres dalı** — Postgres yok
8. **FAZ 2'nin gerçek-model çıkış kriteri** — 0 API anahtarı
9. **Lean kernel'ı gerçekten çalıştırmak** — 10 vaka stand-in `lean` betiğiyle, 2 gerçek-kernel vakası `skipIf`
10. **vitest 4.x major** — tek çözümü semver-major bump olan dev-only advisories

---

## E. SIRALAMA ÖNERİSİ (bu ortamda kapatılabilir olanlar)

Ölçülebilirlik ve sonraki işi mümkün kılma sırasına göre:

1. **§12 #15 — SLO'lar** *(sıradaki)* — OTLP trace altyapısı zaten var; tanım + ölçüm eksik. Somut ve doğrulanabilir.
2. **§12 #11 — prompt-injection regresyon paketi** — security input screening UNKNOWN-döndürme kuralı zaten var; paket yok.
3. **§12 #20 — temiz kurulum/kaldırma** — `install-backends.mjs` var, uninstall yolu test edilmedi.
4. **§12 #10 — secret masking** — secret scan var (`fd79cdd`), masking ölçülmedi. Aynı altyapıyı kullanır.
5. **§12 #27 — paket üst-sınır pinleri** — `570df5a` model tarafını yaptı; `requirements.txt` hâlâ yalnızca `>=`.
6. **§12 #25 — support bundle + kurtarma talimatları** — journal kurtarması var, paketleme yok.
7. **§12 #5 — şema migrasyonu** — journal kurtarması var, migrasyon yok.
8. **§12 #29 — upstream devre dışı bırakma** — capability registry'de `healthCheck` var, devre dışı bırakma yolu ölçülmedi.
9. **§12 #30 — güncelleme→tarama tetikleyicisi** — tarama var, tetikleyici yok. Küçük iş.
10. **Dalga 18 — Blender/FreeCAD** — OpenSCAD yolu kanıtlandı; ikincisi ek backend.

**Bu ortamda kapatılamayacak olanlar (yukarıya almayın):** §12 #1, #2, #6 (kısmen), #8, #16, #18; dalga 3, 5, 8, 12, 16, 20.

---

## F. TEKRARLAYAN KUSUR KALIBI (kapatıldı ama izlenmeli)

*"İşi yaptım"ı "iş işe yaradı" sanmak.* Bu oturumda 20'den fazla yerde kapatıldı. Alt biçimleri:

- Oluşturmada bir kez yazılan alanın sonra canlı ölçüm diye okunması
- Var olan ama hiç kablolanmayan bir konfigürasyon nesnesi
- Gerçek bir durumun sunucu arızası gibi gösterilmesi
- Gerçek bir olayın hiçbir yere raporlanmaması
- Tek platformun yol biçimini varsayan bir kontrol
- Çalıştığı bildirilen bir çözücünün yanlış transkripsiyon üretmesi
- Kodda var olan ama hiçbir testte olmayan bir güvenlik özelliği
- Modeli çağıranın kısıtlarını sağlamayan bir `sat` hükmü
- Çıkış kodu okunduğundan başka anlama gelen bir health check
- Temiz süreç çıkışının doğru sonuç diye raporlanması
- Yük altında tüm sistemi düşüren otomatik seçilmiş "daha iyi" backend
- **Üç parçasından biri var diye tatmin edilmiş sayılan bir sürüm kontrol listesi maddesi**
- **Yanlış alanı işaret eden bir assertion yüzünden doğru bir değişikliğin geri alınmak istenmesi**

**İkincisi bu oturumda iki kez yaşandı** (cognitive loop iptali, model-router fallback'i). İkisinde de duvar saati / olay sayısı aksini söylüyordu. **Bir assertion kırmızıyken önce assertion'ı şüphelen.**

---

## G. KAPI DURUMU (son ölçülen)

- typecheck: **0**
- `npm test`: **321 passed / 1 failed / 1 skipped** — tek başarısız `web.render`'ın canlı ağ vakası, **5 commit'tir değişmedi**, ortam silinmesinden sonra egress değişti, regresyon **değil**
- `docs:state`: **380 test dosyası / 3106 vaka / 31 modül**
- hygiene: **all ratchets hold** (main.ts 3593, engine.ts **5843**, nondeterminism envanteri **66**, OpenAPI **863**)

---

## I. REPONUN KENDİ BOŞLUK LİSTESİ — `KNOWN_GAPS.md` (25 modül + 3 + 3)

**Kaynak:** `npm run docs:state -w @haf/eval` üretiyor, elle düzenlenmiyor. "Ölçülmüş boşluklar
only" — hepsi bir komutla doğrulanmış.

### I1. Stabil'e uzaklığı beyan edilen 25 modül

| Modül | Olgunluk | Eksik olan |
|---|---|---|
| `security/security-system` | beta | Guard yalnız **iki** şeyi kontrol ediyor: kill switch + prompt injection. **Kanıtlanmamış olan: gerçek bir model altında davranış** — enjekte edilen metnin capability argümanında değil model çıktısında geldiği durum. Payload pattern'leri (SQL/command/path/script) bu sınırda **ölçümle** hariç tutuldu: argümanları onlarla taramak 5 geçen testi bozdu, çünkü bir shell capability'si `&&` almak için var ve bir patch diff'inde `../` taşıyor. |
| `aurora/long-horizon-memory` | beta | Kümeleme **tam paylaşılan association string**'e göre, semantik benzerliğe göre değil; promotion/consolidation eşikleri **sabit sabit**, öğrenilmiş değil; `search()` terim örtüşmesine göre eşleşiyor, anlama göre değil — yani **eş sözcüksüz bir paraphrase hâlâ hiçbir şey döndürmüyor**. |
| `aurora/self-improvement` | beta | Operatör kümesi sabit; mutasyon uzayında **öğrenilmiş arama yok**. |
| `aurora/vector-memory-fusion` | beta | **Gerçek bir embedding modeli kablolanmalı.** FAZ 21 `NeuralMemoryFusionService`'ten yeniden adlandırdı (isim yarısı kapandı); **mekanizma yarısı değişmedi** ve model çalıştırmayan bir sandbox'ta kapatılamaz. Engine property ve `/v1/neural-fusion` route'ları **hâlâ eski isimde** — kırıcı API değişikliği, açık olarak kayıtlı. |
| `aurora/cognitive-pattern-registry` | beta | **Öğrenen bir mekanizma gerekli.** Aynı durum: isim yarısı kapandı, mekanizma yarısı açık, `/v1/neural-core` route'ları eski isimde. |
| `aurora/scenario-comparison` | beta | Her senaryonun **yazarının verdiği tahminlere** göre değil **ölçülmüş sonuçlara** göre sıralamalı — FAZ 19'un `selectStrategy`'de bulduğu kusur; kalibrasyon verisi zaten toplanıyor. `CounterfactualSimulatorService`'ten yeniden adlandırıldı ama **diskteki dosya hâlâ `counterfactual-simulator.json`** ve `/v1/counterfactual` route'ları değişmedi (yeniden adlandırmak mevcut state'i yetim bırakır veya pinli bir public API'yi kırardı). |
| `world/world-model-exploration` | beta | **Öğrenilmiş forward model yok**; tahminler çağırandan geliyor. |
| `routing/model-routing` | beta | Üretim sonuçlarından **online öğrenme yok**. |
| `society/agent-society` | beta | Ajanlar arası **emergent müzakere yok**. |
| `aurora/goal-discovery` | beta | Anomali tespiti **pattern-tabanlı, semantik değil**. |
| `security/reward-hacking-defense` | beta | Saldırı kütüphanesi **statik**; adaptif red-teaming yok. |
| `execution/unified-execution-loop` | beta | Planner ve learn hook'ları opsiyonel ve **`engine.execute()` tarafından şu an sağlanmıyor**; capability acquisition **kurtarma yolunda henüz yok**. |
| `execution/capability-acquisition` | beta | Zincir uçtan uca çalışıyor (gap → contract → code → static analysis → sandbox → known-good → decoys → CapabilityBroker) ve doğrulanmış capability gerçek broker'a `acquired.` namespace'i altında kaydoluyor. **Kalan sınır kablolama değil kapsam:** test vakaları kural başına elle yazılmış, yani bu yolla **tam olarak bir** capability edinilebiliyor. |
| `execution/gap-detection` | beta | Gereksinim tablosu **sabit 7 girişli liste**, öğrenilmiş değil; LLM katmanı **implemente edilmek yerine fırlatıyor**. 7 girişten yalnız `visual_diff` test vakası taşıyor ve gerçekten sentezlenebilir; `pdf_parsing` **`synthesisable: false`'a düşürüldü** — sandbox'ta dosya sistemi veya binary decoding olmadığı ölçüldü, yani üretilen kod yalnızca **taklit edebilirdi**. |
| `execution/verification-factory` | beta | Hangi verifier'ların geçerli olduğuna **hâlâ çağıran karar veriyor**; V3 consensus'ın implementasyonu var ama çağıranın sağladığı gerçek bir evaluator paneli gerekiyor. |
| `execution/failure-taxonomy` | beta | Sınıflandırma **regex-tabanlı**; yapısal veya LLM-destekli katman yok. |
| `security/reward-hacking-detectors` | beta | Eşikler **sabit sabit**, gerçek hacking denemelerinin etiketli bir korpusuna karşı kalibre edilmemiş; tespit **sinyal başına**, ortak model yok. |
| `pipeline/code-pipeline-service` | experimental | **Sekiz aşamadan altısı** pipeline'ın bir koşuyu tamamlayabilmesi için gerçek backend gerektiriyor. |
| `aurora/integration-verification` | beta | Rollback **bellek-içi durumu** kapsıyor, **dosya sistemini değil**. |
| `sdk/agent-sdk-service` | experimental | Extension'ların hiç çalışabilmesi için **gerçek bir isolate** kablolanmalı (SandboxExecutor'ın Worker isolate'i veya imzalı WasiPluginManager). |
| `surface/jarvis-surface` | beta | **Paketlenmiş STT/TTS/vision implementasyonu yok**; automation veya connector backend'i yok. *(Not: `audio.transcribe` ve `audio.speak` capability'leri bu oturumda eklendi ama bu surface'e bağlanmadı.)* |
| `digital-twin` | experimental | **Hâlâ simülasyon döngüsü yok.** Karşı-olgusal soru ("bu kararı alırsam gelecek hafta ne değişir") **cannot-simulate** dönüyor, çünkü FAZ 22'nin TransitionModel'inin ileriye projekte etmesi için hiçbir şey `(state, action, next-state)` geçişlerini gözlemlemiyor. **Üç sorudan ikisinin aritmetik olması bir simülasyon değil, yani isim hâlâ dürüst değil.** |
| `embodiment` | experimental | Gerçek bir actuator/effector entegrasyonu gerekiyor. |
| `federated` | experimental | Node'lar arası **gerçek parametre agregasyonu** gerekiyor; **altı politika kuralı türünden dördü** (encrypt_at_rest, encrypt_in_transit, retention, anonymize) **hâlâ değerlendirilmiyor**. |
| `domain-experts` | experimental | **Gerçekten uzmanlaşmış expert backend'leri ve gerçek bir kaynak veritabanı** gerekiyor. O zamana kadar bu modülün değeri **reddetmeleri**: yüklenmiş gereksinim olmadan yapılan compliance kontrolü artık `status unknown, score 0` döndürüyor, 2026-09 öncesinde yüksek riskli bir hukuki soru için döndürdüğü `compliant, score 100` değil. |

### I2. Gerçek bir görev sırasında boşta kalan 3 modül

V8 coverage ile ölçüldü (2026-09-20): biri yalnız `initialize()` çağıran, biri gerçek bir hedef de
çalıştıran iki koşu, farkı alındı. **31 modülden 28'i görev sırasında iş yaptı.** `wiredToEngine`
31/31 için `true` diyor — **boşluk tam olarak bu.**

| Modül | Olgunluk | Gözlem |
|---|---|---|
| `capabilities/capability-synthesis` | stable | yalnız constructed |
| `aurora/scenario-comparison` | beta | yalnız constructed |
| `routing/model-routing` | beta | yalnız constructed |

*Tek görev tek yolu çalıştırır, yani buradaki bir satır "bu hedef tarafından ulaşılmadı" demek,
"ölü kod" demek değil.* Yeniden üret: `npm run observe:runtime -w @haf/engine`.

### I3. Modül kaydının dışındaki 3 boşluk

| Boşluk | Detay |
|---|---|
| Capability acquisition zinciri | gap → synthesis → verify → registry → retry **uçtan uca kapalı değil** |
| **Gerçek-model benchmark** | **bugüne kadarki her eval koşusu mock provider kullandı; gerçek-model sayıları henüz yok** |
| State backend | **77 servis JSON dosyalarına yazıyor**; yalnız event store'un Postgres backend'i var |

### I4. Bilerek boşluk **olmayan** şeyler (yeniden raporlanmasın diye)

Prometheus `/metrics`, `/health`, OTLP exporter, SSE streaming, 11-değerli execution status
sözleşmesi, 11 kurtarma stratejili 15-türlü failure taxonomy, event pagination (`afterSequence`),
`VerificationGapError`, dört bellek türünün hepsi, RRF'li hybrid retrieval, context compaction,
paralel tool execution, reward-hacking defences, durable persistence (journal/snapshot/lease/Postgres).

---

## J. 30-FAZLI META-AGENT PLANI — açık kalan fazlar

`aurora-vnext-faz-takibi.md`. FAZ 5-17 kapandı; **FAZ 18-26 🟡 (kısmen)** ve her birinin
adlandırılmış bir sonraki adımı var:

| FAZ | Konu | Kalan iş |
|---|---|---|
| **18** | Expert Evaluator Fabric | **Fabric hiçbir yerde kurulmuyor** — 4 domain evaluator'ü var ama hiçbiri bir expert'e bağlı değil |
| **19** | Strategy Arena | Arena ölçüme göre sıralıyor ama `strategy-generator` **beyan edilen tahminle seçiyor**; gerçek yarış **model gerektiriyor** |
| **20** | Model Arena | Reliability boyumu var ama **reliability skora girmiyor** (çalıştırma kaynağı yok) |
| **21** | Memory 2.0 | İsimler değişti ✅; **mekanizma yarı açık** (model gerek); engine property + `/v1/neural-*` route'ları **eski isimde** (kırıcı API) |
| **22** | World Model 2.0 | Learned transition var ama **geçiş kaynağı yok** — servis triple üretmiyor |
| **23** | Digital Twin | Üç soru türüne ayrıldı ✅; **state modelinde Tasks/Calendar/Goals/Resources/Devices yok**; `digital-twin` experimental kaldı |
| **24** | Federated | Fazın **kendi metni "İlk aşamada yapma" diyor** ⚠️; remote execution ve gradient exchange **mümkün değil** (tek makine, peer yok, model yok) |
| **25** | Production State | Altı bileşenin **hepsi zaten var** (1994 satır + `postgres/*` + `transport/nats/`); backbone readiness ✅ ama **hiçbir şey çağırmıyor**, motor boot'ta kendi modunu raporlamıyor |
| **26** | Engine parçalama | **Bölünmedi ve bölünmemeli** ✅ — 5584 satırın 1602'si constructor (kablolama), metod-düzeyi bölme onu hiç etkilemiyor; `'justified'` diye bir durum **yok** (test ortaya çıkardı). **PLANIN SON FAZI** |

**FAZ 1-4 ve gap-closing pass** (`e19a83f` `f7cc43b` `472efca` `dc4c321` `edaa092` `fed3fe0`) kapalı.

---

## K. 111 MADDELİK DoD LİSTESİ

**Denetim sonucu** (`dod-listesi-denetim.md`): listedeki her ölçülebilir iddia `grep`/kod okuma ile
doğrudan kaynağa karşı doğrulandı.

- **23 spesifik iddianın hepsi** kaynak kodda birebir doğrulandı ✅
- **1 yanlış** — `README.md:2053`'teki "58/60, 2 broken" iddiası **yeniden üretilemedi** (`cb917c2`)
- **4 abartılı**
- Ölçülen `eval:validate`: `totalTasks 61 · evaluatedTasks 60 · skippedTasks 1 · discriminative 60 · brokenCriteria 0 · vacuous 0 · byDesignNoop 2 · withReferenceSolution 12`

**Açık kalan:** DoD'nin gerçek-model gerektiren maddeleri (yukarıdaki §D ile aynı engel).

---

## L. HARİCİ DENETİM — **TAMAMI KAPALI**

`4.1`-`4.8` ve `K-1`-`K-6`. Commit'ler: `209a3ed` (K-3/K-4) · `bd318a6` (K-1/K-2) · `1f45e1f` (4.8) ·
`3107962` (K-5, **400 HAF-4031**) · `17cee68` (K-6) · `6b95c12` (4.1) · `813f5ff` (4.2/4.3/4.4 —
500⇒**409 HAF-3007**, 500⇒**404 HAF-7001**) · `98f79dd` (4.5/4.6 — 240/dk bucket) · `f09556d` (4.7).

**Öğrenilen:** bir harici raporun mekanizması yanlış olabilirken sonucu doğru olabilir, **ya da sonucu
baştan yanlış olabilir** (K-3, K-2, 4.4, 4.5, 4.6, ve item 8'in "58/60"ı).

---

## M. REPO-LEVEL BAKIM İŞLERİ

| İş | Durum |
|---|---|
| 116 çöp dosya untracked yapıldı | ✅ |
| `scripts/zod-to-schema.mjs` → OpenAPI `requestBody` 0→258, `x-schema-status: unspecified` 856→598 | ✅ `6d300f3` |
| 3 upstream commit, v1.650 | ✅ clone doğrulandı |
| **`engine.ts` 5843 satır** — FAZ 26 "bölünmemeli" dedi ama izleniyor | 🔶 ratchet'ta |
| **`main.ts` 3593 satır** | 🔶 ratchet'ta |
| **vitest 4.x major** — dev-only advisories'in tek çözümü | ❌ açık |
| **`.git/config` snapshot-dışı** — her commit'te identity yeniden set edilmeli | ⚠️ sürekli |
| **pip ve bazı apt paketleri adımlar arası siliniyor** — `node scripts/install-backends.mjs` geri yüklüyor | ⚠️ sürekli |
| **PATH spawned süreçler için `/usr/bin`'e zorlanıyor** | ⚠️ sürekli |

---

## H. NASIL DEVAM EDİLİR

**Bu dosyanın bölümleri:**
- **A** §12 exit checklist (30 madde) · **B** §7 dalga maddeleri (20) · **C** boş capability alanları (5)
- **D** bu ortamda doğrulanamayanlar (10) · **E** sıralama önerisi (10) · **F** tekrarlayan kusur kalıbı
- **G** kapı durumu
- **I** reponun kendi `KNOWN_GAPS.md`'i (25 modül + 3 boşta + 3 kayıt-dışı)
- **J** 30-fazlı meta-agent planının açık fazları (18-26)
- **K** 111 maddelik DoD listesi · **L** harici denetim (kapalı) · **M** repo-level bakım

**Toplam açık iş:** §12'den 26 · dalgadan 6 · boş capability 5 · `KNOWN_GAPS`'ten 31 · açık faz 9
· bakım 4 = **~81 kalem**. Bunların bir kısmı aynı işin farklı görünümü (ör. gerçek-model
eksikliği hem §12 #1-2'yi hem `KNOWN_GAPS`'in "real-model benchmark"ını hem FAZ 19-20'yi kapatıyor).

1. `/home/user/aurora-kaldigim-yer.md` — **adım adım günlük** (nerede kaldım, hangi commit, hangi hata)
2. Bu dosya — **kalan iş envanteri**
3. `aurora-vnext-plan.md` · `aurora-vnext-faz-takibi.md` — önceki plan ve faz takibi
4. `dod-listesi-denetim.md` — 111 maddelik DoD denetimi
5. `deneme-inceleme-raporu.md` · `aurora-aday-envanteri-raporu.md` · `aurora-alan-eleme.md` — analiz raporları

**Çalışma kuralı (kullanıcının talimatı):** her adımı **tam kapat** (implement + test + commit) sonra
sıradakine geç. Sırayı bozma. Kapatılamayan bir fazda **dur ve kanıtla raporla** — sayı uydurma,
sessizce atlama.
