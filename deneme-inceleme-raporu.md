# Repo İncelemesi — Hakki-CENG/deneme (tam sürüm)

**Tarih:** 2026-10-03 · **Commit:** `d809834` · **Yöntem:** tam klon + kurulum + her iddia **çalıştırılarak** doğrulandı; sunucu gerçekten ayağa kaldırıldı, tarayıcı testleri gerçekten koşuldu.

---

## 1. Repo gerçekte ne?

`README.md` içeriği `# deneme` — 8 bayt. İçinde **`hybrid-agent-fabric`** (Aurora Motor Engine) var:
11 workspace'li, `1.65.0` sürümlü, TypeScript bir **ajan çalıştırma platformu**.

| Katman | İçerik |
|---|---|
| `packages/engine` | Çekirdek. 326 dosya / **100.907 satır**. 50+ modül: `aurora`, `execution`, `memory`, `society`, `security`, `mcp`, `sandbox`, `browser`, `channels`… |
| `packages/eval` | 58 dosya / 16.244 satır. Kabul kapıları, recall ölçümü, maturity register |
| `apps/` | `control-api` (3.513 satır `main.ts`, 624 route), `canvas-web` (React), `acp-server`, `session-worker`, `wasi-runner`, `desktop` (Electron), `headless-client`, `release-tool` |
| Toplam | **168.615 satır TS/TSX**, 277 test dosyası, **1.940 test** |

Mimari ciddî: WASI sandbox, MCP, çoklu LLM sağlayıcı (Bedrock/Vertex/Azure/OpenAI), NATS,
Postgres, OPA politika, SLSA/SBOM attestation, kanal adaptörleri (IRC/SMTP/Twilio),
kuşak-çitleme korumalı Python çekirdeği.

---

## 2. Ölçülen doğrulama tablosu

| Kontrol | Komut | Sonuç |
|---|---|---|
| Kurulum | `npm install` | ✅ 654 paket |
| Tip kontrolü (10 workspace) | `npm run typecheck` | ✅ **0 hata** |
| Tam derleme (10 workspace) | `npm run build` | ✅ exit 0 |
| Tam test paketi | `npm test` | ⚠️ **1937 passed, 1 skipped, 2 FAILED** |
| Chaos | `npm run test:chaos` | ✅ 15/15 |
| Adversarial | `npm run test:adversarial` | ⚠️ 504 passed, **2 FAILED** |
| Kabul kapıları | `npm run eval:gates` | ✅ **4/4** |
| OpenAPI bekçisi | `npm run docs:openapi:check` | ✅ 862 kayıt |
| Depo değişmezleri | `npm run verify:integration` | ❌ **8/10, exit 1** |
| Kernel smoke | `python3 python/kernel_server.py` | ✅ protocolVersion 2 |
| Bağımlılık güvenliği | `npm audit --omit=dev` | ✅ **0 açık** |
| Attestation | `npm run release:verify` | ✅ `valid:true` (imza `absent`) |
| **Gerçek çalışma zamanı** | `node apps/control-api/dist/main.js` | ✅ **ayağa kalktı, uçlar doğrulandı** |
| **Canvas E2E** | `npx playwright test` | ❌ **11 passed, 3 FAILED** |
| Docker build (P0-3) | — | ⚠️ **doğrulanamadı** (sandbox'ta docker yok) |

Kod hijyeni: **7** `TODO/FIXME/HACK/XXX` işareti / **125.983** kaynak satırı.

---

## 3. Çalışan sistem — gerçekten test edildi

Sunucu `0.0.0.0:8787`'de ayağa kalktı. Ölçülen yanıtlar:

```
GET /health → {"status":"ok","engine":"hybrid-agent-fabric","version":"1.65.0",
               "provider":["mock"],"sandbox":"local","persistence":"file","nats":false}
GET /v1/capabilities → 200, gerçek capability listesi
GET /              → 200, Canvas UI (sıkı CSP ile)
```

`/health` çıktısı `P0-DUZELTMELERI.md`'deki iddiayla **birebir aynı**.

**Güvenlik katmanı gerçekten çalışıyor:**
- Başlıklar: `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff`,
  `referrer-policy`, `permissions-policy`, `cross-origin-opener/embedder/resource-policy`, `x-xss-protection`
- Başlıklar **404 yanıtlarında da** uygulanıyor (çoğu uygulamada atlanır)
- Rate limiter aktif: `x-ratelimit-limit: 100`, sayaç azalıyor
- **Production'da stack trace bastırılıyor** — `NODE_ENV=production` ile doğruladım:
  `{"error":{"code":"HAF-8001","message":"Internal server error",...}}` (stack yok).
  `isDev` kapısı tasarlandığı gibi çalışıyor → **bilgi sızıntısı yok**

---

## 4. KIRIK 1 — `npm test`: git kökünde `.gitignore` yok

```
FAIL |release-tool| test/t-hygiene.test.ts  (2 test)
```

Audit doğrudan çalıştırıldı; **tek** kontrol kırılıyor:

```json
{ "name": "T1-tracked-artifacts", "ok": false, "count": 0, "bound": 6,
  "hasGitignore": false, "offenders": [] }
```

`scripts/repo-hygiene-audit.mjs:219` `.gitignore`'u **git kökünde** arıyor:

- `git rev-parse --show-toplevel` → `deneme/`
- `deneme/.gitignore` → **yok** (üç `.gitignore` hep alt klasörde)

**Kanıt:** köke geçici `.gitignore` koydum → `ok: true`. Sildim.

---

## 5. KIRIK 2 — `verify:integration` exit 1: `release-metadata/` gitignore'da

```
FAIL  release-metadata-fresh         → source-manifest.json is missing
FAIL  attestation-excludes-generated → source-manifest.json is missing
8/10 checks passed   (gerçek exit code: 1)
```

`Aurora-Motor-Engine/.gitignore:10` → `release-metadata/`. Doğrulamanın **şart koştuğu** dosya,
gitignore tarafından dışlanıyor; CI'da üreten adım yok.

**Kanıt:** `npm run release:prepare` → 5 dosya üretildi → `verify:integration` **10/10, exit 0**.

Projenin kendi dokümanı bunu öngörmüş — `P2-DUZELTMELERI.md` §4c doğru sıralamayı yazıyor,
§8 ise itiraf ediyor: *"Repository invariants adımı **gerçek runner'da çalıştırılmadı**."*
CI tam da orada kırılıyor.

---

## 6. YENİ BULGU — 6 API ucu olmayan kaynak için **500** dönüyor

`P2-DUZELTMELERI.md` §5.2 bunu "düzeltilmedi" diye kaydetmişti. **12 `/:id` ucunun tamamını
gerçek isteklerle taradım** — sorun hem doğrulandı hem kapsamı büyütüldü:

| Uç | HTTP | Kod | Değerlendirme |
|---|---|---|---|
| `/v1/automations/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/checkpoints/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/decisions/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/detached-workers/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/plans/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/society/authority/templates/:id` | **500** | HAF-8001 | ❌ 404 olmalı |
| `/v1/sessions/:id` | 404 | HAF-3001 | ✅ doğru |
| `/v1/sessions/:id/subagents/:name` | 404 | HAF-3001 | ✅ doğru |
| `/v1/media/jobs/:id` | 400 | HAF-2001 | ✅ geçerli zod doğrulaması (uuid) |
| `/v1/world/scopes/:scope` | 400 | HAF-2001 | ✅ geçerli zod doğrulaması (enum) |
| `/v1/aurora/fleet/members/:tenantId` | 200 | — | ✅ boş sonuç |
| `/v1/user-model/:userId` | 200 | — | ✅ boş sonuç |

**Kök neden ölçüldü:**
- Engine'de **212** yerde "not found" için düz `throw new Error(...)` atılıyor
- Genel amaçlı bir `NotFoundError` **yok**; yalnız 4 dar sınıf var
  (`McpOAuthPendingNotFoundError`, `ModelOAuthPendingNotFoundError`,
  `GitHubAppPendingNotFoundError`, `SessionNotFoundError`)
- API error-handler'a bağlı olan **tek** sınıf `SessionNotFoundError` → sessions 404, diğerleri 500
- `RESOURCE_NOT_FOUND` (HAF-7001, 404) ve `NotFoundError` sınıfı `error-handler.ts:73,114`'te
  **tanımlı ama hiç kullanılmıyor** — `error-handler.ts:232`'deki yorum aynı deseni
  sessions için zaten tarif ediyor

**P2 §5.2'nin kapsamı eksikti:** 4 servis saymış (`automations`, `learning`, `refinements`,
`agentProfiles`) — ama `learning`/`refinements`/`agentProfiles`'ın `/:id` GET ucu **yok**;
oradaki 404'ler "route bulunamadı" (HAF-7001). Gerçekte etkilenen **6** uç var ve 5'i
dokümanda hiç geçmiyor.

---

## 7. YENİ BULGU — `canvas-e2e` CI job'ı 3/14 deterministik kırık

Chromium kuruldu, sistem kütüphaneleri eklendi, testler gerçekten koşuldu:

```
✓ 1,2,5,6,7,8,9,10,12,14   (11 passed)
✘ 3  has theme toggle button
✘ 4  theme toggle changes data-theme attribute
✘ 13 light theme has correct CSS variables
```

**Kök neden, DOM'dan doğrulandı.** `App.tsx:449`:

```jsx
<button onClick={toggleTheme} title="Toggle theme">
  {theme === "dark" ? t("theme.light") : t("theme.dark")}
</button>
```

Ama `src/i18n.ts` içinde **hiç `theme` anahtarı yok** (ne `en` ne `tr` sözlüğünde).
`t()` (i18n.ts:314) eksik anahtarda **anahtarın kendisini** döndürüyor:

```js
let text = translations[locale]?.[key] ?? translations.en[key] ?? key;
```

Gerçek tarayıcıda ölçülen buton metni:

```
Toggle theme butonu metni: "theme.light"
E2E'nin aradığı /Light|Dark/ eşleşme sayısı: 0
```

Yani bu **kullanıcıya görünen bir arayüz hatası**: buton çevrilmemiş ham anahtarı gösteriyor.
E2E regex'i büyük harf aradığı için de eşleşmiyor.

**Düzeltme doğrulandı.** `i18n.ts`'e 4 satır ekledim (`en`: `Light`/`Dark`, `tr`: `Açık`/`Koyu`):

```
✓ 3  has theme toggle button            (788ms)
✓ 4  theme toggle changes data-theme    (908ms)
✓ 13 light theme has correct CSS vars   (876ms)
```

Typecheck exit 0. Üç test de yeşile döndü. *(Doğruladıktan sonra ağacı temiz bırakmak
için değişikliği geri aldım — yama yukarıda.)*

---

## 8. YENİ BULGU — E2E'de flaky test + bekçinin kapsam boşluğu

`Escape clears error toast` testi **kararsız**. Ölçümler:

| Koşum | Test 11 |
|---|---|
| Tam set, tema düzeltmesi **sonrası** | **4/4 KALDI** |
| Tam set, baseline | 1/2 kaldı |
| Tek başına, baseline | 5/5 geçti |
| Tek başına, düzeltmeyle | 3/3 geçti |

**Mekanizma:** `App.tsx:185-186` her başarısız fetch'te toast açıyor ve 5 sn sonra kapatıyor:

```js
setError(value instanceof Error ? value.message : String(value));
window.setTimeout(() => setError(null), 5000);
```

Test `Escape`'e basıp (satır 439 hatayı temizliyor) **hemen** toast yok diye assert ediyor.
Ama `playwright.config.ts`'teki `webServer` yalnızca Vite'ı başlatıyor — **control-api yok**.
Dolayısıyla her API çağrısı başarısız oluyor; hata toast'ı assert'ten **sonra** gelirse test kalıyor.
Yani test ile uygulama arasında senkronizasyon yok.

**Bekçinin boşluğu:** Proje tam da bunun için bir ratchet yazmış —
`scripts/repo-hygiene-audit.mjs:336` `checkNondeterminismInventory` (T9). Ama dosya deseni:

```js
if (!/\.test\.tsx?$/.test(path)) continue;
```

E2E dosyası `e2e/app.spec.ts` — `.spec.ts`, `.test.ts` değil. Yani **flaky ölçtüğüm tek paket,
flaky bekçisinin kapsamı dışında.**

---

## 9. Doğrulanan düzeltmeler (önceki denetim zinciri)

Kök dizindeki dosyalar bir denetim zinciri: `AURORA-INCELEME-RAPORU.md` (2026-09-21, **başka**
bir repoya — `Hakki-CENG/Aurora-Motor-Engine`, commit `b932623`) → `P0/P1/P2-DUZELTMELERI.md`.

Hepsi çalıştırılarak doğrulandı:

| İddia | Ölçülen |
|---|---|
| P0-1 `nodemailer` 7.0.5 → 10.0.10 | ✅ `^10.0.10`, kurulan `10.0.10`, audit **0 açık** |
| P0-2 kernel smoke'a fencing metadata | ✅ ci.yml'de 3 geçiş, smoke geçiyor |
| P1 Bug A: `eval:gates` izlenen dosyaları değiştiriyordu | ✅ gates koştuktan sonra `git status` **0 değişiklik** |
| P1 Bug B: `version.ts`'te ölü dal | ✅ artık yukarı yürüyüp `name === "@haf/engine"` olan package.json'u buluyor — sabit `../package.json` değil, doğru çözüm |
| P2 §5.1 eşleşmeyen route 500 → 404 | ✅ `/v1/uydurma` → 404 HAF-7001 |
| P2 §4b çifte attestation kaldırıldı | ✅ `Aurora-Motor-Engine/uploads/`'ta sadece PDF var |

---

## 10. Dikkat çeken dürüstlük

Bu repo'nun en ayırt edici yanı **kendi sınırlarını ölçüp söylemesi**:

- `CURRENT_STATE.md`: *"implemented: 0 · initialized: 0 · reachable: 2 · integrated: 0 ·
  exercised: 25 · verified: 3 · **production: 0**"* ve *"Most of this system is exercised —
  tests drive it. Far less is verified."*
- Recall gate kendi başarısızlığını yazıyor: `FAIL: Recall@8 0.317 → 0.339 (Δ0.022 < margin 0.05)`
  — sonra "bu regresyon kilidi, FAZ 11 kriteri değil" diye açıklıyor
- `execution-status.ts`'te `skipped`/`simulated`/`unverified`/`unavailable`/`blocked`
  durumları `succeeded`'dan ayrı
- CI yorumları adımların **neden** var olduğunu anlatıyor
- `P2` §8, kendi eklediği CI adımının gerçek runner'da hiç denenmediğini açıkça yazıyor

---

## 11. Hijyen sorunları (kırıcı değil)

| # | Sorun | Ölçülen |
|---|---|---|
| 1 | **Electron tarayıcı profili commit'lenmiş** | `.config/` altında **114 dosya** — Cookies DB, Local Storage leveldb, Trust Tokens, GPUCache, Crashpad. **İyi haber:** iki Cookies DB de **0 kayıt**, Local Storage boş → kimlik bilgisi sızmamış |
| 2 | `.sudo_as_admin_successful` (0 bayt) | ajan sandbox izi |
| 3 | 880 KB PDF | repodaki en büyük dosya |
| 4 | Boş `package-lock.json` | kökte `{"name":"user","packages":{}}` |
| 5 | Doküman taşması | **123 MD / 30.588 satır** doküman ↔ 168.615 satır kod |
| 6 | 3 commit'te 1.112 dosya | `git log` hiçbir şey anlatmıyor |
| 7 | Bayat üretilmiş doküman | committed `254 dosya / 1879 case` ↔ `docs:state` çıktısı **261 / 1928** |

---

## 12. Özet hüküm

**Ne:** Ciddî, büyük ölçekli bir TypeScript ajan platformu. 168k satır, 1.940 test,
çok katmanlı güvenlik ve ölçüm altyapısı. **Çalışıyor** — sunucuyu ayağa kaldırdım,
uçlar doğru yanıt veriyor, güvenlik başlıkları ve rate limiter gerçekten aktif.

**Kod kalitesi yüksek:** typecheck 0 hata, 125.983 satırda 7 TODO işareti,
0 bağımlılık açığı, production'da stack sızıntısı yok.

**Kırık olanlar (5):**

1. `npm test` → 2 test: git kökünde `.gitignore` yok
2. `verify:integration` → exit 1: `release-metadata/` gitignore'da
3. **6 API ucu olmayan kaynak için 500 dönüyor** (404 olmalı) — 212 düz `Error` throw'u, genel `NotFoundError` yok
4. **`canvas-e2e` 3/14 deterministik kırık** + kullanıcıya görünen ham i18n anahtarı — 4 satırlık düzeltmesi doğrulandı
5. **E2E'de flaky test** ve flaky bekçisinin `.spec.ts`'i kapsamaması

1 ve 2 **paketleme** hatası: `hybrid-agent-fabric`'i `Aurora-Motor-Engine/` altına yuvalayıp
`deneme` diye yayınlarken oluşmuş. Son commit'in adı bunu söylüyor: *"Aurora Motor Engine
klasor yapisi duzeltildi."* Proje kendi hijyen bekçisini yazmış — bekçi paketleme hatasını
doğru yakalıyor. 3, 4, 5 ise **gerçek kod kusurları** ve projenin kendi denetiminin
kapsamı dışında kalmış.

**Öneri sırası:**
1. `ci.yml`'e `verify:integration`'dan önce `npm run release:prepare` ekle
2. Git köküne `.gitignore` koy (veya `hybrid-agent-fabric`'i ayrı repo yap)
3. `i18n.ts`'e 4 satır theme anahtarı ekle *(yaması §7'de, doğrulandı)*
4. Engine'e tiplendirilmiş `NotFoundError` ekle, 212 throw sitesini kademeli geçir; en az 6 ucu `RESOURCE_NOT_FOUND`'a bağla
5. E2E'yi backend'siz çalışacak şekilde sabitle (mock API veya toast senkronizasyonu); T9 desenini `.spec.ts`'i kapsayacak şekilde genişlet
6. `.config/`, `.sudo_as_admin_successful`, boş `package-lock.json`, 880 KB PDF → `git rm`
7. `npm run docs:state` çıktısını commit'le; kök doküman yığınını `docs/archive/`'a taşı

**Doğrulanamayanlar:** `docker build` (sandbox'ta docker yok) ve CI'ın gerçek GitHub Actions
runner'daki davranışı.
