# Definition-of-Done Listesi — İddia Denetimi

**Tarih:** 2026-10-03 · **Repo:** Hakki-CENG/deneme @ `d809834`
**Yöntem:** Listedeki her ölçülebilir iddia `grep`/kod okuma ile **doğrudan kaynağa karşı** doğrulandı.

**Sonuç: Liste büyük oranda DOĞRU.** 23 spesifik iddiayı birebir kanıtla doğruladım, 1 alıntı kodda yok,
4 madde ise mevcut durumu olduğundan eksik gösteriyor. Aşağıda hepsi dosya:satır ile.

---

## 1. DOĞRU çıkan iddialar (kanıtlı)

| # | İddia | Kanıt |
|---|---|---|
| 2 | `withTenant()` production'da kullanılmıyor, sadece testte | `src/` içinde **0** çağrı, `test/` içinde **1** |
| 29 | `SessionActor` tool çağrıları seri | `runtime/session-actor.ts:812` → `for (const call of toolCalls) {` + içeride `await` |
| 3 | ~79 servis `DurableJsonState` kullanıyor | **79** `new DurableJsonState`, 81 dosya referans veriyor — sayı birebir |
| 3 | RLS yalnız 5 tabloda | `postgres/database.ts:161` → `["events","snapshots","command_journal","effect_journal","agent_inbox"]` |
| 5 | `migrate()` başlangıçta `CREATE TABLE IF NOT EXISTS` | `database.ts:64` `private async migrate()`, **7** adet `CREATE TABLE IF NOT EXISTS` |
| 9 | rate limiter in-memory | `middleware/rate-limiter.ts:43-44` → modül seviyesi `new Map()` (tokenBuckets, slidingWindows) |
| 10 | audit JSONL + batch flush | `audit-logger.ts:78` `audit.jsonl`, `batchWrites: true`, `batchInterval: 5000` |
| 7 | scheduler `setInterval` | `scheduler/scheduler.ts:133` |
| 8 | `backgroundThinkingTimer` / `proactiveTimer` | `engine.ts:2917` ve `:2928` → `setInterval` |
| 60 | SDK isolated execution yok | `sdk/agent-sdk-service.ts:205` → *"sandboxed extension execution is not implemented"* |
| 65 | digital twin sync yok | `digital-twin/*.ts:324` → *"Digital twin sync is not implemented"* |
| 67 | federated local inference yok | `federated/*.ts:356` → *"Local inference … is not implemented"* |
| 35 | LLM judge bağlı değil | `eval/src/graders/grader.ts:290-321` → *"LLM-judge grading is not implemented: no judge model is wired"* |
| 13 | `/v1/federated/air-gap`, `/v1/sdk/config` yetki listelerinde değil | Route'lar **var** (`routes/aurora-services.ts:548-549` PUT dahil; `openapi.yaml:6896`). `auth-guards.ts`'te `federated`/`sdk` geçmiyor → mutasyon yalnız `operator` istiyor |
| 14 | `tenantId` body'den kör kabul | `auth-guards.ts:130` → `x-haf-tenant ?? body.tenantId ?? query.tenantId ?? env ?? "local"` |
| 12 | auth fail-open, production'da kapanmıyor | `identity-service.ts:156-163` → `anonymousIdentity()` **`systemAdmin: true`** veriyor. `main.ts`'te production'ı engelleyen tek `NODE_ENV` kontrolü cookie `maxAge` (satır 614) |
| 96 | Node sürüm uyuşmazlığı | `engines: node >=22.12.0` ↔ `@types/node: ^20.17.30` |
| 53 | connector'lar yarım | `connectors/*.ts:211,217` → `listEmails`/`searchEmails` *"is not implemented"* |
| 52 | click için rollback = wait | `computer-use-service.ts:350` → `case "click": return { type: "wait", value: "100" }` — **birebir** |
| 63 | world model prediction'ı caller veriyor | `main.ts:943` → `POST /v1/world/predictions` gövdeden `statement` + `probability` + `horizonAt` alıyor |
| 46 | Anthropic/Gemini gerçek stream değil | `anthropic-provider.ts:97`, `gemini-provider.ts:126` → `await response.json()` (toplam 5 yer) |
| 110 | docs ≠ reality | Committed `CURRENT_STATE.md`: **254 dosya / 1879 case**. `npm run docs:state` çıktısı: **261 / 1928** |
| 1 | tenant isolation kapsamı dar | **276** adet `/:id` route var; `resolveTenantId` yalnız **5** aileyi kayıttan çözüyor (`auth-guards.ts:67-79`). Listenin verdiği 15 ailenin hepsi mevcut, 30'u `/:id`'li |

### Madde 1 için en kritik kanıt

Kodun kendi yorumu (`auth-guards.ts:60-66`) doğru modeli tarif ediyor:

> *"Reading the tenant from the request would let a caller name any tenant they like;
> resolving it from the stored record is what makes the role check below mean something."*

Yani proje **deseni biliyor**, ama yalnız 5 aileye uygulamış:
`sessions`, `automations`, `learning/candidates`, `learning/refinements`, `agent-profiles`.

Bu aynı zamanda daha önce bulduğum **500-404 hatasının da kök nedeni**: `resolveTenantId`
guard içinde `engine.automations.get(id)` çağırıyor; olmayan ID'de düz `Error` fırlıyor →
handler'a hiç gelmeden 500. İki bulgu aynı tasarımın iki yüzü.

---

## 2. YANLIŞ çıkan iddia

**Madde 15:** *"Şu an local sandbox açıkça 'trusted-development backend' olarak tanımlı."*

Bu alıntı **kodda yok**. `grep -rn "trusted-development\|trusted development" packages/ apps/` → 0 sonuç.
`LocalSandbox` (`sandbox.ts:169`) sadece `kind = "local"` diyor.

Altındaki kaygı (local sandbox bir izolasyon sınırı değildir) teknik olarak makul —
ama "kod bunu açıkça yazıyor" iddiası doğru değil. Ayrıca repoda zaten `docker`, `singularity`,
`ssh` backend'leri ve `scrubEnvironment()` var.

---

## 3. Olduğundan eksik gösteren maddeler

| # | Liste ne diyor | Gerçekte ne var |
|---|---|---|
| 46 | "bazı sağlayıcılar `response.json()` sonra delta üretiyor" | Doğru — ama `codex-subscription-provider.ts:151-197` **gerçek SSE** yapıyor (`text/event-stream`, `getReader()`, 2 MiB buffer sınırı). Yani doğru desen repoda zaten var, yaygınlaştırılacak |
| 62-63 | "şu an daha çok state store" | `world` modelinde **Brier skoru**, `accuracy`, `expiry`, `inconsistency` tespiti var (`aurora-metrics.ts:270-273,353`). Prediction caller'dan geliyor (doğru) ama kalibrasyon altyapısı gerçek |
| 97 | "254 test dosyası / ~1880 test" | Ölçülen: **261 dosya / 1928 case**. Sayı listeden iyi; ama listenin asıl dediği (sayı kanıt değildir) geçerli |
| 15 | sandbox'ta "no ambient environment" eksik | `scrubEnvironment()` mevcut; ayrıca `docker`/`singularity`/`ssh` backend'leri var |

---

## 4. Doğrulayamadıklarım

Bunlar repo içinden ölçülemez — altyapı/operasyon maddeleri:

- 82-88: load/soak/chaos/DR/capacity — gerçek cluster gerekir
- 91-93: PostgreSQL HA, NATS HA, worker HA — deployment konusu
- 94: Kubernetes hardening — sandbox'ta docker bile yok
- 78-79: gerçek modelle benchmark — model API anahtarı gerekir
- 70-72: domain experts / embodiment / STT-TTS — harici donanım/servis

---

## 5. Kapsam hakkında dürüst değerlendirme

Liste **111 madde**. Bunların kabaca dağılımı:

| Sınıf | Adet | Nitelik |
|---|---|---|
| Kodda kapatılabilir, test edilebilir | ~35 | Bu oturumda başlanabilir |
| Yeni subsystem yazımı gerektirir | ~30 | Haftalar-aylar |
| Altyapı/ops (repo'da "kapatılamaz") | ~25 | Cluster, HA, DR, kapasite |
| Harici servis/donanım gerektirir | ~12 | Vault, STT/TTS, actuator |
| Sürekli operasyon (hiç bitmez) | ~9 | CVE, provider değişikliği |

**"Hepsini kapatıp sistemi nihai hale getirelim" tek oturumda mümkün değil** — ve listenin
kendisi de bunu söylüyor ("sürekli operasyonel işler… bunlar bir kere yapıp bitti değildir").

Ama **madde 1-14 (P0 güvenlik) + birkaç P1** gerçekten kodda kapatılabilir ve testle kanıtlanabilir.
Doğru sıra da listenin kendi dediği gibi: **önce isolation.**

---

## 6. Önerilen ilk tranche — kodda kapatılabilir, testle kanıtlanabilir

### Tranche A — Güvenlik (madde 12, 13, 14, 1)

| İş | Etki | Kanıt yöntemi |
|---|---|---|
| Production'da auth fail-open'u kapat | **Kritik** — anonymous `systemAdmin` | `NODE_ENV=production` + auth'suz → process başlamamalı |
| `federated`/`sdk` + diğer global uçları yetki listesine al | Yüksek | route metadata tabanlı tablo + test |
| `resolveTenantId`'yi 276 `/:id` route'a genişlet | **Kritik** — cross-tenant | cross-tenant test matrisi: tenant B, tenant A kaynağına GET/PUT/DELETE/execute → hepsi 403/404 |
| Engine'e tiplendirilmiş `NotFoundError` + 6 ucu 404'e bağla | Orta | daha önce ölçtüğüm 6 adet 500 → 404 |

### Tranche B — Distributed doğruluk (madde 2, 3, 4, 7, 8, 9)

| İş | Etki |
|---|---|
| `withTenant()`'ı tüm Postgres repository'lerine bağla | RLS gerçekten çalışsın |
| Command/effect journal'a `lease`/`owner`/`heartbeat`/`fencing` | worker ölünce kayıt yetim kalmasın |
| scheduler + background/proactive timer'a distributed lease | 5 instance aynı işi tetiklemesin |
| rate limiter'ı paylaşımlı store'a taşı | instance başına limit çarpmasın |

### Tranche C — Yürütme (madde 29, 46, 96)

| İş | Etki |
|---|---|
| Bağımsız tool çağrılarını paralelleştir (side-effect barrier ile) | `session-actor.ts:812` |
| Anthropic/Gemini/Azure'u gerçek SSE'ye geçir | Codex'te desen hazır |
| `@types/node` ↔ `engines` hizala | tip/runtime uyuşmazlığı |

---

## 7. Sonuç

**Liste güvenilir.** 23 spesifik iddianın hepsi kaynak kodda birebir doğrulandı; tek yanlış
alıntı "trusted-development backend"; 4 madde mevcut durumu eksik gösteriyor.

Listenin en değerli tespiti doğru: **problem "100 eksik özellik" değil, 6-8 kritik mekanizmanın
derinliği.** Ve en kritik ikisi ölçüldü:

1. **Tenant isolation:** 276 `/:id` route, 5 aile korunuyor
2. **Seri tool yürütme:** `session-actor.ts:812`

Doğru başlangıç **Tranche A** — çünkü liste de bunu söylüyor: *"Bunlar bitmeden yeni cognitive
feature eklemezdim."*
