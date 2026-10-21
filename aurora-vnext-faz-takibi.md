# Aurora vNext — Faz Takibi

Bu dosya **sıranın tek kaynağı**. 30 fazlı planın metni ilk turda hiçbir dosyaya
kaydedilmediği için sıra kayboldu; aynı şeyin tekrar olmaması için buradayız.
Plan yapıştırıldığında faz listesi aşağıya **birebir** işlenecek ve her faz
kapandığında kanıtıyla güncellenecek.

Depo: `deneme/` (git toplevel) · motor kökü: `deneme/Aurora-Motor-Engine/hybrid-agent-fabric`
Çalışma kuralı: **her fazı kapat** (kod + test + commit) → sonra sıradakine geç.
Kapanamayan faza gelince **dur, kanıtıyla bildir**, sonra devam et.

---

## Çalışma kuralları (kullanıcının açık talimatları)

- Aurora'nın kapsamı **daraltılmayacak**: memory, world model, proactive, society,
  self-improvement, research, security hepsi kalıyor.
- "Domain expert" **farklı bir prompt olmayacak**. Gerçek uzman = Domain Knowledge
  + Specialized Tools + Models + Retrieval + Planner + Verifier + Benchmark.
- Aurora **"kod çalışıyor" kararını asla kendisi vermeyecek** — derleyici, testler,
  güvenlik ve statik analiz verir.
- `NeuralMemoryFusion` / `NeuralCognitiveCore` ya gerçek öğrenen mekanizmalar
  olacak ya da adları dürüstleştirilecek.
- Güvenlik girdi taraması karar veremiyorsa **SAFE değil UNKNOWN** diyecek.
- Güvenlik **kesişen bir katman**, ayrı bir faz değil.
- Sayı **uydurulmayacak**: ölçülemeyen bir şey ölçülemedi diye yazılacak.
- Zaman sınırı yok; **tamlık hızdan önemli**.

## Bu sandbox'ın sert sınırları (ölçüldü, tahmin değil)

- GPU yok (`nvidia-smi` yok) · **1 GB toplam RAM** · 2 çekirdek · Docker yok
- 27B bir model burada **yüklenemez**
- Masaüstü oturumu yok · Jetson/RPi donanımı yok
- Node v20.20.2 · PostgreSQL 17.11 · test DB `postgres://haf_app:haf_pw@127.0.0.1/haf_test`
- `node_modules` ve `dist/` **oturum ortasında kaybolabiliyor** (3 kez oldu) —
  `npm ci` + `npm run build` ile geri gelir; kayıptan önce ölçülen her şey yeniden ölçülmeli

---

## Kapanan fazlar

### P0 — Ölçüm ✅ (`675e340` → `94c80fb`)

| adım | commit | kanıt |
| --- | --- | --- |
| 1 | `675e340` | `deriveOutcomeMetrics`/`compareOutcomeMetrics`, 10 test |
| 2 | `add7b1b` | `constraints`/`expectedEvidence` zorunlu, 15 test |
| 3 | `f64ecd6` | kalan 7 metrik + **eval testleri tip kontrolüne alındı** |
| 4 | `d4fa440`, `34274ab` | kalıcı baseline + `npm run baseline` kapısı |
| 5 | `94c80fb` | durum dokümanlarına bayatlık kapısı |

Ölçüm: 30 modül → 25 `exercised` · 3 `verified` · 2 `reachable` · **0 `production`**.
Olgunluk merdiveni **7** seviye (planın 6'sı değil): `implemented, initialized,
reachable, integrated, exercised, verified, production`.

### P1 — Universal Runtime Kernel ✅ TAMAM (4/4)

| alt faz | durum | commit |
| --- | --- | --- |
| P1.1 tek execution contract | ✅ | `61c4fd4` |
| P1.2 seçilen rota → understanding + planning | ✅ | `050e744` |
| P1.3 kanonik `provider:model` kimliği | ✅ | `b04b0ba` |
| P1.4 çekirdek hook'lar = production sözleşmesi | ✅ | `1db1866` |

**P1.1:** `execution/execution-contract.ts` — sözleşme artık bir *değer*, diyagram
değil. `TaskReport.contract` hangi aşamaların gerçekleştiğini, hangilerinin
atlandığını adlarıyla taşıyor. Ölçüm: `runtime/session-actor.ts` (1091 satır)
içinde `understand`/`recall`/`learn` **sıfır** kez geçiyordu — kullanıcının
konuştuğu yol route/execute/observe yapıyor, verify/recall/learn yapmıyordu ve
**hiçbir şey bunu söylemiyordu**. Artık söylüyor. Tek-kurulum invariant'ı teste
bağlandı: ikinci bir `new UnifiedExecutionLoop` testi kırıyor.

**P1.4:** motor 6 çekirdek hook'u zaten sağlıyordu; eksik olan
`ablateExecutionDependencies`'ın bunları **silebilmesi**ydi ve hiçbir kayıt
düşmemesiydi. `ablations:["verification"]` ile hiçbir doğrulayıcı çalışmayan bir
deployment kurulabiliyordu. Artık core hook'a dokunan bayrak **throw** eder;
`allowCoreAblation: true` (varsayılan kapalı) ile bilinçli aşılır.

**Ortam gerçeği (ölçüldü):** bu sandbox'ta **hiçbir model runnable değil** —
`"No runnable model: no provider is registered with a model"`. Yani `selectModel`
hook'u çalışıyor ama rota üretemiyor; `route` aşaması burada hiçbir zaman
gerçek bir modelle çalıştırılamaz. FAZ 2/20 (Model Arena, Bonsai 27B) bu yüzden
**gerçek sayı üretemez**; mock ile kurulur ama win/draw/loss uydurulmaz.

**P1.2'nin gerçek kök nedeni sıralamaydı, eksik argüman değil:**
`unified-execution-loop.ts:684` `understandGoal` · `:909` `plan` · `:1120` `selectModel`.
Rota, ona ihtiyaç duyan iki çağrıdan **sonra** atanıyor. Planın "10 satır" iddiası
yanlıştı ve bunu kabul ederken ben de eksik doğrulamıştım.

**P1.3:** `models/model-route.ts` — üç uyumsuz politika tek kurala indi.
Kalan ad-hoc kurulum **0**, ad-hoc çözüm **0**, 15 üretim dosyası kullanıyor.

---

### P2 — Model Fabric ✅ (`4c4e5ce`)

Ölçüm: P2'nin çoğu **zaten vardı**. `ModelProfile` context/tool/vision/audio/
reasoning/latency/cost/reliability taşlıyor ve ölçülmeyen değer `undefined`
(uydurulmuş sabit değil). Privacy/locality `model-router.ts:51`+`:113`'te;
bilinmeyen sağlayıcı **"cloud"** sayılıyor — gizlilik için güvenli yön.

Gerçek boşluk **aşamaya göre yönlendirme**ydi: yalnızca `UnderstandingModel` /
`PlanningModel` arayüzleri vardı, yani politika ile seçim iç içeydi ve
"doğrulamayı hangi model çalıştırdı, neden?" cevaplanamıyordu.

`models/stage-model-policy.ts`: politika **veri**, çözümleme saf fonksiyon,
seçim motorda. İki dürüstlük kuralı — rota kanonik `provider:model` olmalı
(P1.3 yeniden kullanılıyor) ve politikanın adlandırmadığı aşama **rota
uydurmaz**, çağıranınkini korur. Bağlanan aşamalar: understanding, planning,
execution. `SessionAgentOptions.modelRoute` bir **override**, mutasyon değil.

**Bilinçli olarak yapılmayanlar:**
- `privacy`/`locality` alanları profile eklenmedi — router'da tek kaynak olarak
  var; kopyalamak anlaşmazlık üretecek ikinci kaynak olurdu (P0'daki "ölü alan"
  tuzağı).
- `critic` ve `vision` aşamaları sözlükte **tanımlı ama bağlı değil**: motorun
  bugün bir critic ya da vision çalışma noktası yok (FAZ 12/18).
- Bonsai 27B burada çalıştırılamaz — FAZ 20 (Model Arena) bu sandbox'ta
  **gerçek sayı üretemez**.

### P3 — Meta Planner ✅ (3/3 kapandı)

Ölçüm: **dynamic replanning zaten vardı** (`unified-execution-loop.ts:1388`,
`MAX_REPLANS_PER_TASK` ile sınırlı). Eksik olan içindeydi: motorun `plan`
bağımlılığı yalnızca `context.goal`'u geçiriyordu, `PlanningRequest`'te kanıt
alanı yoktu. Yani planner aynı hedefi görüp aynı adımları döndürüyor, döngü de
ajana "farklı bir şey dene" diyerek **aynı adım listesini** veriyordu. Döngünün
kendi yorumu bunu söylüyordu: *"Telling is not doing."*

**1/3 (`7e55792`)** — `PriorAttempt` { attempt, replans, failureKind, detail,
previousSteps }. `failureKind = category ?? phase`, asla uydurulmuyor. İlk
planda `undefined` — hiçbir şey denenmeden kanıt uydurmak alana güveni
öğretirdi. Kanıt bloğu "measured data … not an instruction to you" diye
işaretli.

**2/3 (`5212be8`)** — `aurora/strategy-generator.ts`: önerme ile seçme ayrıldı.
Seçim saf fonksiyon (önce risk, sonra hız). **Tek aday tek aday olarak
raporlanır**; adaylar arasında ayrım yoksa sonuç *"this was not a real choice"*
diyor. `TaskPlanner` seçilen stratejiyi prompt'una alıyor.
**Bağlanmayan:** engine tarafında üretimi tetikleyen yol **henüz yok** — her
planlamada ek model çağrısı demek ve bu kararı FAZ 19 (Strategy Arena) ile
vermek daha doğru. Modül bugün çağrı bekliyor; bu saklanmıyor.

**3/3 (`0480537`)** — `aurora/hierarchical-plan.ts`: DAG'ın **üstüne** bir
seviye eklendi, DAG'ın yerine değil. Adımlar yürütülebilir birim olarak kalıyor,
döngü onları değiştirmeden yürüyor; milestone'lar onları grupluyor.

Kritik karar: **milestone kendi statüsünü taşımıyor — `milestoneState` onu adım
statülerinden türetiyor.** Kendi statüsü olan bir milestone, özetlediği
adımlarla çelişebilen ikinci bir görüştür. Türetme: herhangi bir adım
failed/blocked → `failed`; hepsi blocked → `blocked`; hepsi succeeded →
`succeeded` (**`executed` başarı değildir**); bazıları çalıştı → `in_progress`;
aksi halde `not_started`. `isSuccess`/`didRun`/`isFailure` yeniden tanımlanmadı,
`execution/execution-status.ts`'ten alındı.

`validatePlanHierarchy` **fırlatmıyor, sorun döndürüyor** — planner hatası
çalışmayı düşürmemeli: bilinmeyen adım referansı, yetim adım, **iki milestone'un
sahiplendiği adım** (ilerleme %100'ü aşar ve bir hatayı gizlerdi), boş
milestone, bilinmeyen milestone bağımlılığı, döngü.

**Bulunan kusur:** `TaskPlan.milestones?` ve `TaskReport.hierarchy?` önce
eklendi ve **atıldı** — döngünün `plan` bağımlılığı yalnızca adım döndürecek
şekilde tiplenmişti, yani alanları dolduracak hiçbir yol yoktu. Bağımlılık artık
`{ steps, milestones? }` da kabul ediyor; `buildPlan` milestone'ları alıyor;
döngü hiyerarşiyi doğrulayıp her sorunu **sessizce düşürmek yerine** başarısız
outcome olarak kaydediyor (`unresolvedDependencies`'ın kötü kenarı ele alış
biçimiyle aynı). Replan yolu aynı union'ı normalize ediyor.

20 test, **ratchet ile kanıtlandı** (`buildReport` türetmesi silinince
entegrasyon testi düşüyor). Bu sayede **gerçek bir mantık hatası** yakalandı ve
düzeltildi: "hepsi blocked" dalı `didRun` adım sayısını başarısız adımlarla
karşılaştırıyordu, ama `blocked` `didRun` içinde değil — karşılaştırma asla
doğru olamazdı. Export: t7 pin **461 → 464**.

---

### P4 — Expert Fabric ✅ (4/4 kapandı)

Ölçüm: `packages/engine/src/experts/` **yoktu**, `ExpertDefinition` adı motorda
**hiç geçmiyordu**. Yani bu faz sıfırdan.

**1/4 (`2c6ad7c`)** — `experts/expert-definition.ts`. Planın şartı "expert
sadece prompt olmayacak" olduğu için her yüz **zaten var olan ve denetlenebilen**
bir şeye bağlandı:

| yüz | bağlandığı gerçek şey |
| --- | --- |
| `tools` | capability id'leri, gerçek bir envantere karşı denetleniyor |
| `modelPolicy` | `StageModelPolicy` — **P2 doğrulayıcısı yeniden kullanıldı, kopyalanmadı** |
| `strategies` | `TaskStrategy` (P3) → P3 seçicisinin kriterlerine dönüştürülebiliyor |
| `safety` | kapalı `CapabilityRisk` merdiveninde bir tavan |
| `evaluator` | expert'ın puanlandığı domain'ler |

**İki yüz bilerek string kaldı** ve kodda öyle işaretlendi: `domain` ve
`knowledge`. `packages/eval` task domain'lerini kapalı enum olmadan `string[]`
diye tipliyor; burada bir liste uydurmak, domain'lerin ne olduğu hakkında
**çelişen ikinci bir görüş** yaratırdı. Eval'de gerçek bir registry olunca
bunlar ona bağlanmalı.

`validateExpertDefinition` **fırlatmıyor, sorun döndürüyor** (`validatePlanHierarchy`
ve `validateStageModelPolicy` ile aynı ilke): bozuk tanım bir yapılandırma
hatasıdır, çalışmayı düşürmemeli. Envanter verilmeden çağrılırsa **her aracı
bilinmiyor diye raporluyor** — hiçbir şeye bakılmamış araçlar için "her şey
temiz" demek olurdu. **Hiç aracı olmayan expert raporlanıyor**, çünkü tam da bu
katmanın engellemek için var olduğu prompt-şeklindeki şey o.

`toolsOverRiskCeiling` doğrulamadan **ayrı**, çünkü ikisi farklı soru soruyor:
iyi biçimlenmiş mi / güvenli mi. Bilinmeyen bir araç riski **tavanın üstünde**
sayılıyor; "güvenli" diye tahmin etmek, bir expert'ın kendisine hiç verilmemiş
bir privileged aracı elinde tutmasının yolu.

`strategyCriteriaForExpert` tavanı P3 seçicisinin zaten anladığı
`StrategySelectionCriteria`'ya çeviriyor — tanım planlamayı **kısıtlıyor**,
sadece anlatmıyor. Basamak→seviye eşlemesi bir yargı ve doc yorumunda
**saklanmadan** yazılı.

`RISK_ORDER` artık `aurora/role-authority-service.ts`'ten **export ediliyor**,
burada kopyalanmıyor: merdivenin ikinci bir kopyası, neyin neyden daha tehlikeli
olduğu hakkında ikinci bir görüş olurdu.

19 test. Fixture'daki dört capability id'si `src/capabilities/`'te **var olduğu
doğrulanarak** seçildi (`agent.spawn`, `agent.list`, `checkpoint.capture`,
`artifact.list`) — orada bir yeniden adlandırma bu testi kırsın, bir expert'ın
araç listesini sessizce kurguya çevirmesin diye.

**2/4 (`f3a90e0`)** — `experts/expert-registry.ts`. Tanım tek başına süs
olduğu için registry, motorun gerçekten sorduğu iki soruyu cevaplıyor ve ikisini
de **zaten var olan koda devrediyor**: aşama için hangi model → P2
`resolveStageRoute`; neyle planlayabilir → P3 `StrategySelectionCriteria`.

Yük taşıyan karar: **doğrulama kayıt anına sabitlenmiş bir kapı değil.** Broker
MCP ve plugin capability'lerini çalışma zamanında kaydediyor, yani açılışta
sorunsuz olan bir expert sonra bozulabilir, bozuk görünen biri düzelebilir. Her
okuma envanteri **o anki hâliyle** yeniden denetliyor. `register` yine de
sorunları hemen söylüyor. `usable(id)` bozuk bir expert için **bozuk expert
değil `undefined`** döndürüyor — ikisini ayırt edemeyen bir çağıran, görevi
kullanmasına izin olmayan araçları tutan bir expert'a yönlendirirdi.
Constructor capability kaynağını **zorunlu** tutuyor: hiçbir şeye karşı
doğrulama yapmak her aracı bilinmiyor diye raporlar, bu dürüsttür ama expert
hakkında değil registry'nin körlüğü hakkında bir cevaptır ve kazara
erişilebilir olmamalı. 18 test, **ratchet ile kanıtlı** (snapshot tasarımına
geçilince tam olarak 3 yeniden-doğrulama testi düşüyor).

**3/4 (`23c804e`)** — FAZ 4'ün saydığı **on bir yüzden biri eksikti: Planner.**
`planner.constraints` doğrudan `TaskPlannerDeps.constraints`'e takılıyor
(`TaskPlanner` zaten `DEFAULT_PLAN_CONSTRAINTS` üzerine birleştiriyor).
**Prompt yüzü bilerek yok:** planner'ın sistem prompt'u modül-özel
(`task-planner.ts:197`), böyle bir alanın gideceği yer yoktu — expert'ın
sahip olmadığı bir etkiye sahipmiş gibi görünürdü.

Bir expert motorun planlama bütçelerini **sıkılaştırabilir ama gevşetemez**;
varsayılanlar başıboş bir ayrıştırmanın plana dönüşmesini engelleyen şey ve bir
alan tanımı onu kaldırmak için gerekçe değil. `plannerConstraintsFor` üstteki
değeri kırpıyor ve `loosened` içinde raporluyor. Hiç plan tarif edemeyen bir
bütçe (0, negatif, NaN, Infinity) doğrulamada reddediliyor. 15 test; yük taşıyan
test expert'ın bütçesini **planner'ın kendi kullandığı** `validatePlanSteps`'e
veriyor ve varsayılanların kabul ettiği 3 adımlı bir planın `"limit 2"` ile
reddedildiğini gösteriyor.

**4/4 (`18326dd`)** — kalan üç yüz **bildiriliyor ama denetlenmiyordu**; bu,
hiçbir şeyin doldurmadığı bir alanla aynı kusur. Her biri ya zorunlu kılındı ya
da açıkça değil dendi:

- **Değerlendirme iddiaları `packages/eval`'de denetleniyor, motorda değil.**
  `@haf/eval` `@haf/engine`'e bağlı; motorun `EvalCategory`'yi import etmesi
  **döngü** olurdu, listeyi motora kopyalamak ise bu listeden sapmakta serbest
  **ikinci bir liste** olurdu. `src/experts/expert-eval-binding.ts`:
  `isEvalCategory`, `validateExpertEvalBinding`, `unmeasuredCategories`.
  Sonuncusu diğer ikisinin yakalayamadığını yakalıyor: her kategori geçerli
  olabilir ve expert **yine de ölçülmüyor** olabilir. "Hiç suite verilmedi"
  ile "suite yok" ayrı raporlanıyor.
- **`EvalCategory` artık `EVAL_CATEGORIES` dizisinden türetiliyor** — tip ile
  liste sapamaz.
- Alan **`evaluator` → `evaluatorCategories`** diye yeniden adlandırıldı:
  `EvalTask.domains?: string[]` alanını değil `category`'yi kastediyor ve
  **hiçbir core task `domains`'i doldurmuyor**.
- **Memory namespace:** `packages/engine/src/memory/`'de namespace kavramı
  **hiç yok**; bölümleme P21 (Memory 2.0), burada taklit edilmeyecek. Bugün
  zorunlu kılınabilen şey **benzersizlik**: `memoryNamespaceCollisions()` aynı
  namespace'i sahiplenen expert'ları raporluyor — alanın engellemek için var
  olduğu kusur tam olarak bu. Sınır, metodun doc yorumunda açıkça yazılı.

11 + 2 test; motordaki 54 expert testi geçmeye devam ediyor.

**P4 kapandı.** Sırada **FAZ 5 — Semantic Task Router**: `unified-engines.ts:600-602`'deki
keyword sınıflandırmasını bırakmak. Motor hâlâ bir `ExpertRegistry` kurmuyor ve
hiçbir şey expert seçmiyor — bu, plan sırasına göre FAZ 5'in işi, öne çekilmedi.

---

### FAZ 5 — Semantic Task Router ✅ (3/3 kapandı)

Ölçüm: **üç** keyword bölgesi var, üçü de farklı iş yapıyor.

| yer | ne yapıyor | FAZ 5 kapsamı |
| --- | --- | --- |
| `unified-engines.ts:557-610` | plan ayrıştırma | **meşru fallback** — model plan üretemeyince çalışıyor, zaten öyle belgelenmiş |
| `meta-controller.ts:105-118` | substring'lerle **karmaşıklık puanı** | **hedef — hâlâ açık (3/3)** |
| `neural-memory-fusion.ts:78` | embedding için kelime çıkarımı | routing değil, retrieval → **P21** |

**1/3 (`d766f91`)** — `experts/task-router.ts`. Cevapladığı soru farklı: *bu
görev gerçekte neyi gerektiriyor?* — ve cevabı bir **liste**, çünkü planın kendi
örneği (düzeltilip güvenle yayına alınacak bir performans hatası) bir yazılımcı +
güvenlik inceleyicisi + araştırmacı + yayıncı demek, tek bir kategori değil.

İki kural çizgiyi tutuyor:
1. **Bu dosyada hiçbir keyword eşleşmesi yok.** Hızlı yol olarak da yok, fallback
   olarak da yok. Capability analizi yoksa router `source: "none"` döndürüyor,
   kimseyi seçmiyor ve **keyword yerine koymadığını söylüyor**. "Semantik"
   kelimesini takınmış bir keyword tahmini, dürüst bir "bilemedim"den daha
   kötüdür — ve gerekçenin tam olarak bunu söylediğini doğrulayan bir test var.
2. Gereksinim→expert eşlemesi **expert'ların bildirdiği veri**
   (`servesCapabilities`, bu commit'te eklendi), router'da yazılı bir tablo
   değil. Expert eklemek routing kodunu değiştirmeyi gerektirmemeli.

`routeTask` saf: aynı gereksinim + aynı registry = aynı cevap, model çağrısı yok.
Sıralama en çok kapsama önce, eşitlikte id'ye göre — cevap expert'ların kayıt
sırasına bağlı değil (bir test aynı iki expert'ı iki sırada kaydedip aynı sonucu
doğruluyor). Kapsanmayan gereksinimler **raporlanıyor**, düşürülmüyor: eksik bir
alan böyle görünür olur. 16 test, ratchet ile kanıtlı (tek-expert tasarımına
geçilince çoklu-expert testleri düşüyor).

**2/3 (`c4a3798`)** — 1/3'te router doğruydu ama **hiçbir şey çağırmıyordu**. İki
uçtan kapatıldı.

*Üretim:* Goal understanding zaten bir model çağırıyor ve zaten yapılandırılmış
gerçekler çıkarıyordu; capability çıkarımı **ikinci bir çağrı eklemek yerine**
o çağrıya katıldı. `ValidatedUnderstanding` ve `GoalUnderstanding` artık
`capabilities` taşıyor ve **router'ın kullandığı aynı fonksiyonla**
(`parseCapabilityRequirements`) çözümleniyor — bu şekil için tek okuyucu var.
Bozuk girdiler atlanıyor, tüm çıkarım reddedilmiyor: çekirdek alanlar katı
doğrulanmaya devam ediyor ve tek bir capability girdisi bozuk diye iyi bir
anlamayı kaybetmek daha kötü bir takas. Bu asimetri **belgelendi**, fark
edilmesi için bırakılmadı. Dizinin kendisi dizi değilse bu yine ret — çünkü o
eksik bir alan değil, bozuk bir cevap. Fallback boş liste döndürüyor: bu
**"kimse bilmiyor" demek, "hiçbir şey gerekmiyor" değil.**

*Tüketim:* Döngü `experts` bağımlılığı kazandı, anlamadan sonra yönlendiriyor ve
rapor `routing` taşıyor. **Yok = kimse yönlendirmeye sorulmadı.** Var ama
`matches` boş = yönlendirme çalıştı ve kimseyi seçmedi; gerekçe bunun
"belirlenemedi" mi "uygun expert yok" mu olduğunu söylüyor — ikisi farklı olgu
ve sadece biri doğru. Hiçbir expert'ın karşılamadığı gereksinimler ayrıca
observe ediliyor, yani eksik alan sadece routing kaydında değil çalışmada da
görünüyor. `HybridAgentEngine` config'ine `experts` eklendi ve döngünün
kurulduğu **tek yere** geçiriliyor.

**Boyut ratchet'ı 5579 → 5582**, hem script'te hem pinli testte, gerekçesi
ratchet'ın yanında kayıtlı: üç satır — bir config alanı ve onu geçiren satır —
ikisi de başka yerde yaşayamaz. Bu değişikliğin **iki erken taslağı açıklamasını
engine.ts'te taşıyordu ve 5593 ölçtü**; açıklama, okuyucunun baktığı yer olan
döngü bağımlılığının kendi doc yorumuna taşındı.

Her test ratchet ile kanıtlı: routing çağrısı kapatılınca 4/5 düşüyor; motordaki
thread silinince engine testi düşüyor.

**3/3 (`995a560`)** — FAZ 5'in adını andığı **son** keyword sınıflandırıcısı.
`analyzeComplexity` karmaşıklığı kelimelerden puanlıyordu (`"implement"` = 2,
`"refactor"` = 3, `"from scratch"` = 4) ve bu puan **hangi alt sistemlerin
çalıştığını, token bütçesini ve süre tahminini** seçiyordu. Yani bir isteğin
**ifadesi**, ne kadar makine alacağına karar veriyordu.

Değiştirmeden önce ölçüldü: sınıflandırıcının **tek çağıranı** var
(`profileTask`), onun da tek çağıranı var (`run`), ona da motor `runTask()`
üzerinden ulaşıyor (`engine.ts:2237` servisi kuruyor). **Canlı, dekoratif değil.**

`complexityFromCapabilities` aynı merdiveni **yapıdan** türetiyor — görevin
gerektirdiği **kaç ayrı uzmanlık türü** olduğundan — ve ifadeye hiç bakmıyor.
Gereksinim yoksa `undefined` döndürüyor, çünkü **"hiçbir şey analiz edilmedi"
ile "bu trivial" aynı şey değil.** Ve **asla `trivial` döndürmüyor**: uzmanlık
gerektirdiği analiz edilmiş bir görev tanım gereği trivial değildir.

`analyzeComplexity` analiz varsa onu kullanıyor, yoksa eski puanlayıcıya
düşüyor. Fallback **silinmedi**, çünkü `runTask()` yolu hedefi hiç anlamıyor —
silmek o yolu cevapsız bırakırdı. Değişen şey **seçimin kaydedilmesi**:
`TaskProfile.complexitySource` cevabın `capabilities`'ten mi `keyword`'ten mi
geldiğini söylüyor, yani keyword'le puanlanmış bir profil artık analiz edilmiş
gibi görünemiyor.

Alanı eklemek `aurora/unified-cognitive-loop.ts:186`'da **ikinci bir TaskProfile
kurulumu** ortaya çıkardı — başarısız bir çalıştırma için yapılmış, karmaşıklığı
sabit `"moderate"` olan bir yer tutucu. Bunu keyword-türevli diye kaydetmek
**yalan olurdu**, bu yüzden tip üçüncü bir değer kazandı: `none`, yani bu profili
kimse analiz etmedi. **Bunu derleyici buldu** — alanı zorunlu yapmanın amacı
tam olarak buydu.

9 test, ratchet ile kanıtlı. Yük taşıyan çift aynı ağır ifadeyi iki yoldan
çalıştırıyor: eski puanlayıcı trivial değil diyor, **tek analiz edilmiş
gereksinim onu "simple" yapıyor**; ayna vaka ise puanlayan kelimelerin hiçbiri
olmayan bir hedefin beş gereksinimle "extreme"e ulaştığını gösteriyor. Üçüncü
test kaydedilen kaynak ile değerin aynı görev için **çelişemediğini**
doğruluyor. 32 FAZ 5 testi 4 dosyada geçiyor.

**Bir hata ve düzeltmesi (`ed1c65f`):** patch'i uygulamak için kullandığım
tek seferlik script (`patch-faz5-meta.py`) ilk denemede bir assertion'da
takılıp hiçbir şey yazmadı; düzeltilmiş hâli ayrı bir çalıştırmayla uygulandı
ve **dosya arkada kaldı**. `git add -A` onu commit'e süpürdü. Import edilmiyordu,
davranış değişmedi — hata, add'in ne topladığına bakmadan tüm ağacı eklemekti;
dosya commit'ten önce `git status`'ta görünüyordu ve kontrol edilmedi.

**FAZ 5 kapandı.** Başta ölçülen üç keyword bölgesinden: bu **değiştirildi**,
`unified-engines.ts:557-610` belgelenmiş modelsiz fallback olarak **kalıyor**,
`neural-memory-fusion.ts:78` routing değil retrieval olduğu için **P21'e** ait.

---

### FAZ 6 — Coding Expert ✅ (3/4 kapandı, kalan boşluklar adlandırıldı)

**Önce ölçüldü.** Capability yüzeyi FAZ 6'nın listesinin beklenenden fazlasını
zaten karşılıyor: `code.catalog/symbols/definition/references/dependencies`,
`code.patch.generate`, `code.refactor.verify`, `code.diagnostics.run` +
`.evidence`, `filesystem.patch`, `shell.start/output/stop`, `verify.run` +
`.evidence`, `security.audit.query`, ve `git.rollback` dahil git ailesi.
Language server gerçek — `code-intelligence/` **2398 satır**.

**Eksik olanlar:** profiler, debugger, capability olarak code review,
`git.ci.status` ötesi CI/PR.

`domain-experts/domain-expert-service.ts` kontrol edildi ve **ilgisiz**:
`DomainType`'ı legal/finance/health/tax uyumluluğu, kodlama alanı hiç yok.
FAZ 6 sıfırdan.

**1/4 (`69eb44d`)** — `experts/coding-expert.ts` iki şey tutuyor.

*Tanım.* Constant değil factory — bir dağıtım namespace'i veya planlama
bütçesini dosyayı düzenlemeden değiştirebilsin. Risk tavanı **`process`**:
workspace'e yaz ve build çalıştır, ama **yayınlama**. `git.push` ve `git.clone`
kayıtlı capability'ler ama bu expert **bilerek onları tutmuyor**; geri dönüş
yolu olan `git.rollback` ise kapsamda. Planlama motorun 24'üne karşı **12
adımda** sınırlı: daha fazlasına ihtiyaç duyan bir kodlama planı bir
ayrıştırma problemidir, plan değil.

Bir test çalışma zamanında `src/capabilities/`'i **okuyor** ve bildirilen her
aracın orada kayıtlı olduğunu doğruluyor — yani bu liste kurguya dönüşemez.
**23 id'nin hepsi doğrulanıyor.** Kulağa hoş gelen bir `code.ast.parse`
eklemek testi **adıyla** düşürüyor.

*Kural.* `acceptCodeWork(report)` bir doğrulama raporunun kod işini kabul
etmeye yetip yetmediğine karar veriyor ve **kontrollerin sırası meselenin
kendisi**:

1. **Dışarıdan hiçbir şey çalışmadı → reddedilir.** Doğrulanmamış bir
   çalıştırma bir geçiş değildir ve "hiçbir verifier itiraz etmedi" kanıt
   değildir.
2. **Çalışan herhangi bir kontrol başarısız → reddedilir.** Daha zayıf bir
   katmandan gelen pass bir derleyiciyi geçersiz kılmaz.
3. Çalışan kontroller çalıştı ve hiçbiri başarısız olmadı → kabul.

"Dış" = `V1_formal` veya `V2_empirical` — bir ispat, ya da **çalıştırılmış ve
çıktısı okunmuş** bir komut. `V3_consensus` bir kod iddiasını **tek başına
taşıyamaz**, kaç değerlendirici anlaşırsa anlaşsın; ret bunun nedenini
söylüyor: *değerlendiriciler arasındaki anlaşma bir exit code değildir.*
`V4_unverifiable` aynı şekilde reddedilir.

Bu kural yazılmadan önce mevcut consensus verifier **kontrol edildi**:
`execution/consensus-verifier.ts` zaten güvenini 0.75'te sınırlıyor ve ground
truth kuramayacağını belgeliyor — yani katman kendi hakkında dürüsttü. Eksik
olan, bir kod iddiasına **hiç karar veremeyeceğine** dair kodlamaya özgü
kuraldı.

12 test, iki iddia da ratchet ile kanıtlı.

**2/4 (`0caf5c2`)** — `acceptCodeWork` artık `UnifiedExecutionLoop.verify()`
içinde, mevcut workspace-scope düşürmesinden **sonra** ve reward-hacking
audit'inden **önce** — yani bir kararın güvenilir sayılmak üzere olduğu anda.

**Kod işi olduğunun sinyali FAZ 5'in yönlendirmesi**, hedef metninin taranması
değil: görev `servesCapabilities`'i `code_change` içeren bir expert'a
yönlendirilmiş mi. Burada ifadeyi okumak, FAZ 5'in kaldırdığı sınıflandırmayı
geri getirmek olurdu ve kuralın dosyadan söz eden bir araştırma görevinde
tetiklenmesine yol açardı.

Tetiklendiğinde ve karar pass ise `acceptCodeWork` karar veriyor. Reddedilirse
rapor **`uncertain` / `unverified`'a düşürülüyor** ve neden yazılıyor.
**`fail`'e çevrilmiyor:** kod pekâlâ doğru olabilir, eksik olan bunu öğrenecek
bir şeyin çalışmış olması. Bu, komşu workspace-scope düşürmesinin zaten
davrandığı biçim — bir düşürme neyin doğrulanamadığını söyler, bir başarısızlık
uydurmaz.

5 test, ratchet ile kanıtlı. Tek destekçisi bir V3 reviewer olan kodlama görevi
düşürülüyor ve özet *"kodun yazan modeli onun çalıştığına tanık değildir"*
diyor. Aynı görev yanında çalışan bir `vitest` geçişiyle **`pass` kalıyor**.
Gerçek bir derleyici hatası **`fail` kalıyor** — kural yalnızca hak edilmemiş
geçişleri durduruyor, gerçekleri yumuşatmıyor.

**İki negatif vaka bunu dürüst tutan şey:** aynı ifade ama `code_change`'e
hizmet eden expert yok → dokunulmuyor; kodlama capability'si var ama registry
yok → dokunulmuyor. Bunlar olmadan test, kural yönlendirme yerine hedef metnine
baksaydı da geçerdi. Kontrol kapatılınca **tam olarak** düşürme testi düşüyor.

**3/4 (`baab1cb`)** — 1/4 tanımı yazdı, 2/4 kuralı bağladı, ama **hiçbir şey
expert'ı kurmuyordu**: bir dağıtımın expert almak için tanımı elle yazması
gerekiyordu. Aynı kusur, bir seviye yukarıda.

`experts/built-in-experts.ts` tek satırlık yol: `builtInExpertRegistry(source)`
`EngineConfig.experts`'e verilebilecek bir registry **artı bir durum raporu**
döndürüyor. Motora **kendiliğinden hiçbir şey kaydetmiyor** — sessizce expert
kazanan bir motor, davranışı kimsenin seçmediği bir listeye bağlı bir motor
olurdu.

Doğrulamayan expert'lar **yine de kaydediliyor**, böylece `standing` nedenini
açıklayabiliyor; `ExpertRegistry.usable()` bozuk olanı vermeyi yine reddediyor.
`code.*` capability'leri olmayan bir host, sessizce hiçbir şey yapmayan bir
expert yerine **neyin eksik olduğunun adlandırılmış listesini** alıyor. Bir test
kaydetmeyi filtrelemekle değiştirip bunu kanıtlıyor.

**Yük taşıyan test `src/capabilities/`'i okuyor** ve motorun gönderdiği her şeyi
kaydetmiş bir host'un coding expert'ı gerçekten çalıştırıp çalıştıramadığını
soruyor. **Çalıştırabiliyor:** 23 aracın hepsi kayıtlı, tanım temiz
doğrulanıyor, `missingCapabilitiesForBuiltIns` boş döndürüyor.

**Bilerek eklenmeyen:** FAZ 6'nın listesi profiler, debugger ve capability olarak
code review sayıyor. Hiçbiri `src/capabilities/`'te yok ve onları bildirmek
**inert genişlik** olurdu — hiçbir şey çalıştırmayan bir capability id'si, kabul
edilmiş bir boşluktan **daha kötüdür**, çünkü id kapsam gibi okunur. Boşluk
olarak kalıyorlar.

**Bu aynı zamanda 1/4'teki bir ölçümü düzeltiyor.** 1/4 "CI/PR `git.ci.status`
ötesi eksik" demişti; bu çok kabaydı:

- `git.ci.status` (`capabilities/git.ts:128`) **bilerek** yalnızca yerel
  gerçekleri okuyor ve bunu kendi açıklamasında söylüyor: *"does not invent
  hosted CI results"*. Bu bir **karar**, bir boşluk değil.
- `repositories/github-app-manager.ts` **849 satır gerçek GitHub App tesisatı**
  — installation, webhook doğrulama, credential üretimi, pull-request webhook
  olayları. Capability olarak açık değil; eksik olanın doğru ifadesi
  **entegrasyon değil, exposure.**

Ayrıca doğrulanan: yinelenen araç yok (bir yinelenen, kapsam raporunda iki kez
sayılıp bir boşluğu gizlerdi) ve coding expert `servesCapabilities`'inde
**`code_change` bildiriyor** — bu olmadan 2/4'teki kural gerçek bir dağıtımda
asla tetiklenemezdi, çünkü yönlendirme id'ye değil `servesCapabilities`'e bakıyor.

**FAZ 6 için açık kalan:** hiçbir varsayılan dağıtım built-in'leri kaydetmiyor,
yani bir host'un opting-in yapması gerekiyor; ve profiler, debugger, code-review
ile PR-oluşturma capability'leri **bildirim değil, boşluk** olarak kalıyor.

---

### FAZ 7 — Coding Expert Arena ✅ (3/3 kapandı · mekanizma tamam, sayı üretilemedi)

**Önce söylenmesi gereken:** bu sandbox'ta **GPU yok ve hiçbir rakip kodlama
ajanı kurulu değil** — Claude Code, Codex, OpenHands, OpenCode, Prime hiçbiri.
Yani **hiçbir win/draw/loss sayısı üretilmedi** ve bu commit'te yok. Burada olan
şey puanlama mekanizması ve **sonuç uydurmasını engelleyen kural.**

**Ölçüm:** `benchmarking/comparison.ts` zaten ajanları dürüstçe karşılaştırıyor
— paylaşılan görev kümesi, `0` yerine `"not-provided"`,
`nonOverlappingTaskIds`, `honestNotes`. Ama FAZ 7'nin sorduğu soruyu
**cevaplamıyor**: bu ailede Aurora kazanıyor mu, berabere mi kalıyor, kaybediyor
mu? `benchmarking/arena.ts` onun **üzerine** kurulan katman, yanına değil —
`ComparisonRun`'ı kullanıyor.

**Dört kural**, her biri "sonuca benzeyen bir sayı" üretmenin bir yolunu
kapatıyor:

1. **İki yarışmacıdan az sonuç varsa** → `comparable` false ve her karar
   `no-verdict`. **Tek yarışmacılı bir arena %100 raporlamaz.**
2. **Yalnızca baseline'ın çalıştırdığı görev `no-verdict`**, win değil —
   `honestNotes`'ta "sayılmadı, hariç tutuldu" diye yazılı.
3. **İki başarısızlık bir draw'dur ve "not a shared success" diye etiketlenir.**
   Bir draw "ikisi de iyi yaptı" diye okunmamalı.
4. **Sıralama bir kez yazılı:** verified success > unverified success >
   completed > nothing. Tek başına success asla verified iddia etmez.

`arenaHeadline` arena comparable değilken **`undefined` döndürüyor** — yani
çağıran, kimseye karşı "Aurora görevlerin %100'ünü kazandı" yazmak yerine
yazacak bir şey alamıyor. Testler iki şekli de kapsıyor: tek yarışmacı → başlık
yok; kurulmuş bir rakibe karşı gerçek bir görevlik karşılaştırma → "1 of 1"
diyen başlık.

Kararlar her görevde alanın **en iyi gösterisine** karşı ölçülüyor,
ortalamasına değil, ve kod bunu söylüyor — "Aurora alanı yeniyor" iddiası
alanın en iyisine karşı tutmalı, tesadüfen başarısız olmuş bir rakibe karşı
değil.

**Bir varsayılan yanlıştı ve testler yakaladı:** `familyOf` varsayılanı görev
id'siydi, bu da `scoreArenaFamily("refactor", ...)` çağrısının `"refactor-1"`
adlı görevi elemesine yol açıyordu. Varsayılan artık "çalıştırmadaki her görev
puanlanan aileye ait" — doğal okuma bu; karışık bir çalıştırmayı bölmek için
`familyOf` veriliyor.

13 test, ratchet ile kanıtlı: başlık fonksiyonunda `comparable` yok sayılınca
baseline-eksik vakası düşüyor.

**2/3 (`b524ae0`)** — kullanılabilirlik **ölçülüyor**, iddia edilmiyor:
`binaryAvailable()` PATH'i `access(X_OK)` ile geziyor. FAZ 7'nin adlandırdığı 6
rakip binary'nin **hiçbiri bu makinede yok** ve bu bir test.

**3/3 (`659c19e`)** — engine-backed contestant. `TaskReport` → puanlanan sonuç
eşlemesi motorun **kendi** predicate'lerini kullanıyor (`isSuccess`, `didRun`),
ikinci bir sözlük uydurmuyor. `isSuccess` bilerek **tek** durum; kendi yorumu
"her seferinde bir küme olduğunda `executed` eklendi" diyor.

**Sonuç şu:** doğrulaması geçmeyen bir `succeeded` raporu **unverified success**
puanlanıyor ve verified'ın **altında** sıralanıyor. Yani arena FAZ 6'nın
kuralını dolanmanın bir yolu **olamıyor** — kendini değerlendiren bir çalışma
burada da en üst sırayı alamıyor.

**İki hata kodu çalıştırınca yakalandı, okuyunca değil:**

- **TDZ `ReferenceError`:** test, aynı kapsamda hem `report()` yardımcısını hem
  de destructure'dan `report` sabitini bağlıyordu. `tsc --noEmit` bunu
  **yakalamıyor.**
- **Yanlış fixture:** `autonomy: "auto"` gerçek bir değer değil; alan
  `"high" | "controlled" | "approval_required"`. Bunu **repo typecheck**
  yakaladı ve fixture artık motorun kendi `autonomyFor`'unu çağırıyor. Bunun
  ortaya çıkardığı boşluk: `packages/eval/tsconfig.json` **test dosyalarını
  dışlıyor**, yani `tsc -p packages/eval` geçerken repo typecheck düşüyordu.

**FAZ 7'nin sınırı, değişmedi ve örtülmüyor:** mekanizma artık **uçtan uca
çalışıyor** ama bu makinede hiçbir rakip kodlama ajanı yok, dolayısıyla **hiçbir
win/draw/loss sayısı üretilmedi.** Gerçek rakipleri çalıştırmak binary'leri ve
bir model sağlayıcısını gerektiriyor; ikisi de burada yok ve sonuçları simüle
edilip ölçülmüş gibi sunulmayacak.

---

### FAZ 8 — Research / Knowledge Expert ✅ (4/4 kapandı)

**Önce ölçüldü ve ölçüm fazı değiştirdi.** FAZ 8'in listesi bir inşaat emri gibi
okunuyor — search, web, PDF, source ranking, citation, claim extraction,
contradiction detection, freshness, evidence graph, fact checking, synthesis,
research verifier — ama **çoğu zaten uygulanmış:**

- `research/research-engine-service.ts` (**1157 satır**) zaten şunları taşıyor:
  `trustScore` / `relevanceScore` / `freshnessScore` ve `unknown`'ı içeren bir
  `sourceType` ile `ResearchSource`; alıntılanan metni **getirilen içeriğe karşı
  kontrol eden** (`:580` alıntıyı normalize edip içerikte arıyor, yoksa
  `verified:false`) ve `contentDigest` ile ona **bağlayan** `Citation`;
  severity + resolution'lı `Contradiction`; `disputed` ve `retracted`'lı
  `VerificationResult`.
- `research/pdf-text-extract.ts` (184), `research/source-extraction.ts` (173),
  `search/hybrid-index.ts` (263), `web/web-search.ts` (152) → search, web, PDF.

**İkinci bir citation ya da contradiction sistemi yazmak çalışan bir alt sistemi
çoğaltmak olurdu.** Gerçekten eksik olan planın **Evaluator** satırıydı: bir
raporu citation correctness, source quality, claim support, coverage,
contradiction ve temporal validity üzerinde yargılayan bir şey. Eklenen o.

**Üç kural taşıyor**, her biri rahat bir cevap üretmenin bir yolunu kapatıyor:

1. **`unknown` güvenli değildir.** Bilinmeyen tipte bir kaynak **blocking**,
   nötür değil — güvenlik taramasının izlediği kuralın aynısı. Düşük trust yalnızca
   warning; **unknown değil.**
2. **Bir contradiction asla ortalanarak yok edilmez.** Çözülmemiş bir major
   contradiction raporu **bloklar.** Denetleyici birbirine katılmayan kaynaklar
   üzerinde ortalama bir güven **hesaplamaz**; onları adlandırır. Çözülmüş olan
   warning olur ve çözüm kaydedilir.
3. **Kontrol edilemeyen bir boyut pass değildir.** Kaynak verilmediğinde altı
   boyutun dördü **skipped** raporlanıyor ve verdict `unverified`. Yaş ufku
   verilmediğinde temporal validity **atlanıyor**, "sorun yok" sayılmıyor;
   tarihi olmayan bir kaynak *"age unknown, not assumed fresh"* diye uyarılıyor.

Citation kontrolleri motorun **zaten kaydettiğine** bağlanıyor: kaynak kümesinde
olmayan bir kaynağı gösteren alıntı, motorun doğrulanmamış işaretlediği alıntı ve
`contentDigest`'i kaynağının şu anki digest'inden farklı olan bir alıntı —
**kaynağın artık tutmadığı bir içeriğe karşı kontrol edilmiş kanıt** — her biri
blocking. Hâlâ alıntılanan retracted bir kaynak bloklar; disputed olan uyarır.

`researchReportEvaluator` bir denetimi `source:
"deterministic:research-report-audit"` ile bir consensus `Evaluator`'ına
sarıyor. Bu string kozmetik değil: consensus aynı kaynağı paylaşan
evaluator'ları **bir kez** sayıyor çünkü hataları korelasyonlu — ve deterministik
bir denetim bir model yargıcıyla hiçbir şey paylaşmıyor, yani **gerçek
bağımsızlık** ekliyor. Bir boyut kontrol edilemediğinde `pass` değil
**`uncertain`** döndürüyor.

22 test, ratchet ile kanıtlı: bilinmeyen kaynak tipini warning yapmak **iki**
testi düşürüyor.

**2/4 (`e1d2ae0`)** — planın adlandırdığı **evidence graph** kuruldu, ama
`ProvenanceService`'in **üzerine**: yeni bir graf tipi **tanımlanmadı.**
`researchEvidenceTrace` bir rapordan **`ProvenanceTrace`** üretiyor, mevcut
kind'lar ve ilişkilerle: report → `cognitive-object`, source → `world-entity`,
audit → `decision`, citation → `sourced-from` kenarı, audit → `verified-by`
kenarı. Digest **`explain` ile aynı formülle** hesaplanıyor, yani bir araştırma
izi kalıcı durumdan kurulan izle **karşılaştırılabilir** — ve bir test bu
eşitliği yoruma güvenmeden doğruluyor.

**Dört kural**, her biri grafın raporu pohpohlamasını engelliyor:

1. **Çözülemeyen bağlantı kaydedilir, düşürülmez** — `unresolvedRefs`'e ve
   narrative'e yazılıyor. Eksik bağlantı **bulgunun kendisi** ve `unresolvedRefs`
   tam da bunun için var olan alan.
2. **Denetimin kararı `verified-by` kenarına yazılıyor**, blocking sayısı ve
   ilk blocking mesajları dahil. Doğrulamanın *olduğunu* kaydedip *başarısız
   olduğunu* kaydetmeyen bir graf, **sonucu gizleyen** bir graftır. Denetim
   verilmemişse kenar yok ve bir not "graf provenance kaydediyor ama karar
   yok" diyor.
3. **Retracted/disputed durum kaynağın kendi düğümünde taşınıyor** (trust ve
   type ile birlikte) — yani kusur düğümle seyahat ediyor, okuyucunun denetimi
   de elinde tutmasına bağlı değil.
4. **Hiçbir kenar uydurulmuyor.** Aynı kaynağa iki alıntı **iki kanıt ama tek
   provenance bağlantısı** — çoğaltmak, ona ne kadar şeyin dayandığını
   abartırdı. Toplanmış ama hiç alıntılanmamış bir kaynak **hâlâ bir düğüm**,
   ama onu sahiplenen kenar yok.

`sourcesSupportingClaim` çözülemeyen bir alıntı için **hiçbir şey döndürmüyor**
— çözülemeyen bir alıntıyı destek saymıyor.

14 test, ratchet ile kanıtlı: çözülemeyen alıntıları kaydetmek yerine düşürmek
**iki** testi düşürüyor.

**FAZ 8 için açık kalan — ve en kritik adım:** denetim de graf da **hiçbir şey
tarafından çağrılmıyor.** Research motoru rapor üretiyor ve evaluator onları
yargılayabiliyor, ama **hiçbir kod yolu üretilen bir rapor üzerinde denetimi
çalıştırmıyor** ve evidence graph'ı provenance olarak açan bir şey yok. Bu
bağlama 3/4 ve **1/4 ile 2/4'ün gerçek mi dekoratif mi olduğuna karar veren
adım bu.**

**3/4 (`96ea950`)** — `generateReport` (`POST /v1/research/:id/report`'un
çağırdığı metod) artık ürettiği rapor üzerinde denetimi **sonucun gerçekten
kullandığı kaynaklara karşı** çalıştırıyor ve hem denetimi hem evidence grafını
rapora **ekliyor.** İkisi de raporla seyahat ediyor, yani hiçbir okuyucu **kararı
olmayan bir rapor alamıyor.** Opsiyoneller, çünkü bu alan yokken yazılmış
durumdan yüklenen bir raporun denetimi yoktur ve onun için denetim **uydurmak**,
boşluğu kabul etmekten kötü olurdu.

**Bağlamanın hemen ortaya çıkardığı şey — ölçüldü, varsayılmadı:** üretilen bir
raporun özeti bulguların *"all bound to verified citations"* olduğunu söylerken,
tek kaynağı `sourceType: "unknown"` ve `verified: false` dönüyordu. İddia
alıntıların **bağlanması** hakkındaydı; kaynağın bağlanmaya **değer olup
olmadığı** hakkında hiçbir şey söylemiyordu. Denetim katılmıyor — bir blocking
`source_quality` bulgusu — ve özet artık *"Audit: 1 blocking finding(s); …"*
taşıyor, yani **pohpohlayıcı cümle tek başına durmuyor.** Denetim temizken hiçbir
audit satırı eklenmiyor; test **iki yönü de** doğruluyor.

**Yaş ufku çağıranın politikası, uydurulmuş bir varsayılan değil.** Ufuk olmadan
temporal validity "kontrol edilmedi" raporlanıyor ve rapor doğrulanamıyor — bu
dürüst ama pratikte **her raporu unverified** yapardı, bu yüzden `generateReport`
`auditOptions { maxAgeDays, minTrustScore }` alıyor ve bir test ufkun
atlanmasının boyutu **geçirmek yerine atladığını** sabitliyor.

8 test, ratchet ile kanıtlı: `generateReport`'taki denetim ataması kapatılınca
**dördü** düşüyor. Evidence grafı **gerçek bir rapor** üzerinde doğrulanıyor:
çözülemeyen ref yok, alıntı başına bir `sourced-from` kenarı, kararı taşıyan bir
`verified-by` kenarı, ve `ProvenanceService.explain`'in kullandığı formülle
hesaplanmış digest.

**FAZ 8 için açık kalan:** denetim **kaydediliyor ama hiçbir şey ona göre
davranmıyor** — denetimi başarısız olmuş bir rapor hâlâ dönüyor ve API route
tarafından hâlâ sunuluyor. Başarısız bir denetimin **engelleyeceği mi,
işaretleyeceği mi, yoksa yalnızca not mu düşeceği** bir politika sorusu ve kendi
adımını hak ediyor — bu commit'e kaçırılacak bir karar değil. Bu 4/4.


**4/4 (`a8f44fe`)** — başarısız bir denetimin ne yapacağı artık **çağıranın
politikası**, koda gömülü tek bir cevap değil. Üç mod ve her birinin maliyeti
adlandırıldı:

| mod | ne yapar | maliyeti |
| --- | --- | --- |
| `annotate` | denetimi ekler, özette belirtir — **varsayılan** | `audit`'i yok sayan bir istemci eskisini görür |
| `flag` | ayrıca başlığa `[UNVERIFIED] ` koyar | yalnızca başlık gösteren yüzeyler için |
| `block` | raporu üretmeyi reddeder, hatada denetimi taşır | **varsayılan yapılmadı:** `research.report` `risk: "pure"` ve raporlar önceden başarılıydı |

Persist'ten **önce** uygulanıyor, yani engellenen bir rapor saklanmıyor ve sonra
geçmiş gibi getirilemiyor; bir test store'un boş kaldığını doğruluyor.

**İki kural tüm modlarda tutuluyor** ve her moda karşı test ediliyor:

1. **Hiçbir politika unverified bir raporu verified yapamaz.**
2. **Temiz bir denetim hiçbir şey değiştirmez** — modlar yalnızca *başarısız* bir
   denetimin ne yaptığında ayrışıyor, yani bir politika iyi bir raporu da
   kötüleştiremez.

Bilinmeyen bir politika **atıyor**, hoşgörülü olana düşmüyor.

`research.report` capability'si opsiyonel `policy` alıyor, yani politika bir tool
çağrısından **erişilebilir.** Açıklaması da değişti ve **değişiklik meselenin
özü:** *"every factual finding is a quoted span bound to a source citation"*
diye söz veriyordu — doğru, ama 3/4 tam bu iddiayı taşıyan bir raporun tek
kaynağının `unknown` ve `verified: false` olduğunu ölçmüştü. **Bağlı olmak,
sağlam olmak değildir.**

### Bir ratchet beni yakaladı — ve atlatılmadı

Yeni `throw`, `ResourceNotFoundError` taramasının `NOT_FOUND` desenine
"unknown" kelimesiyle takıldı ve plain site sayısını **27 → 28** yaptı. Mesajı
tarayıcıdan kaçacak şekilde yeniden yazmak **kapıyı atlatmak** olurdu; onun
yerine dosyanın **kendi tasarlanmış yolu** izlendi: gerekçesiyle allowlist'e
eklendi (*"400: unknown enum member supplied by the caller; deliberately not the
permissive default"*) ve sabitlenen sayı ile başlık güncellendi. Dosya bunu zaten
söylüyor: *"adding one requires editing this file on purpose"*.

8 test, ratchet ile kanıtlı. Ayrıca bu turda **iki test hatası** yaptım ve ikisi
de kodda değil testteydi: `applyResearchAuditPolicy` denetimi rapora eklemiyor
(onyu `generateReport` yapıyor) ve `maxAgeDays: 0` yalnızca warning üretiyor —
warning'ler bir raporu unverified **yapmıyor**, yalnızca blocking bulgular ya da
kontrol edilemeyen bir boyut yapıyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**316 dosya / 2444 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**489 → 494**.

**FAZ 8'in dürüst sınırı:** bu sandbox'ta **hiçbir model çalışmıyor**, yani
denetimin getirilen içeriğe bağlı boyutları fixture'lara karşı çalıştırılıyor ve
hiçbir yerde gerçek dünyaya dair bir fact-checking sonucu iddia edilmiyor.
---

### FAZ 9 — Science / Math / Data Expert ✅ (3/3 kapandı · sayısal yarı gerçek, sembolik yarı boşluk)

**Önce ölçüldü.** `packages/engine/src` içinde **Python, pandas, sympy, notebook
ya da jupyter desteği yok** — yani **CAS yok, sembolik doğrulayıcı yok, proof
checker yok.** "python" birkaç dosyada yalnızca **dil adı** olarak geçiyor.
Bunlar eksik ve **adlarıyla bildiriliyor**, varmış gibi yapılmıyor.

Var olan: `verify.run` projenin kendi build/test komutlarını çalıştırıp kanıt
kaydediyor (**kod** için harici doğrulayıcı) ve `background-shell.ts` ile kod
yürütme mevcut. Eksik olan **bir sayı** için olandı — bir istatistik, çözülmüş bir
denklem, uydurulmuş bir katsayı. Bir model bir sonuç söyleyebiliyordu ve rapor
onu taşıyordu.

**1/3 (`b6cf2e3`)** — `science/computation-verifier.ts` **yeniden hesaplıyor.**
Bir iddia, değeri tekrar üreten kodla eşleştiriliyor, kod çalışıyor ve ikisi
karşılaştırılıyor. **Modelin cevabı asla kanıt değil; yalnızca çalıştırılmış
sonuç kanıt.**

**Beş kural**, her biri rahat bir cevap üretmenin bir yolunu kapatıyor:

1. **Kontrolsüz iddia `no-check`**, asla verified değil — ve tek başına verdict'i
   `uncertain` yapıyor. Planın şartının somut hali bu.
2. **Atan kontrol `did-not-run`** — mismatch değil (değer hiç üretilmedi), pass
   hiç değil.
3. **Tolerans belirtilir, varsayılmaz.** Verilmediğinde karşılaştırma **kesin** ve
   kanıt *"exact comparison, no tolerance stated"* diyor. Bir test `0.1 + 0.2`'yi
   `0.3` iddiasına karşı sabitliyor: **mismatch**, çünkü yanlış bir cevabı sessizce
   emen belirtilmemiş bir epsilon, toleranssızlıktan **daha kötü.**
4. **NaN asla doğrulanmaz** — bir NaN iddiası bir NaN hesaplamaya karşı bile.
   `NaN === NaN` false'tur ve "ikisi de hiçbir şey üretmedi" **uyuşma değildir.**
5. **Birden çok çalıştırmada sonuçlar uyuşmalı**; `reproduced-inconsistently`
   kendi outcome'ı, çünkü çalıştırmalar arasında değişen bir sayı — iddiaya ne
   kadar yakın olursa olsun — **bir sonuç değildir.**

`computationVerifier` bunu **V2 empirical** doğrulayıcı olarak sarıyor —
`empiricalVerifier`'ın kullandığı tier. **Bu bir ayrıntı değil, meselenin özü:**
V2, FAZ 6'nın `acceptCodeWork`'ü için **harici kanıt** sayılıyor; oysa yalnızca V3
consensus'a dayanan bir kod iddiasını **reddediyor.** Bir test zincirin tamamını
sürüyor ve `acceptCodeWork`'ün **tek destekçisi bir yeniden-hesaplama olan** bir
raporu kabul ettiğini doğruluyor — yani bağlantı yorumda iddia edilmiyor,
**kanıtlanıyor.**

15 test, ratchet ile kanıtlı: kontrolsüz bir iddianın verdict'i değiştirmemesine
izin vermek kural-1 testini düşürüyor.

**Bir test hatası probe ile bulundu, tahminle değil:** bir doğrulayıcı yalnızca
`verdict`/`evidence`/`confidence` döndürüyor; `tier`, `verifier` ve `scope`'u
**`VerificationFactory`** doğrulayıcının kendi tanımından ekliyor
(`verification-factory.ts:195-199`). FAZ 6 testinin ilk hali outcome'u bunlarsız
elle kuruyordu, dolayısıyla `acceptCodeWork` **haklı olarak** harici tier bulamadı
ve reddetti. Ayrıca düzeltilen: `deciding` tier adı değil **karar veren
result'ları** taşıyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**317 dosya / 2459 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**494 → 496**.

**FAZ 9 için açık kalan:** hiçbir şey gerçek bir görevden `NumericClaim`
üretmiyor, yani doğrulayıcı **erişilebilir ama erişilmiyor**; ve **sembolik yarı**
— CAS, proof checking — burada uygulanmıyor ve **sayısal bir muadille
uydurulamaz.**


**2/3 (`b02550c`)** — bir görevin gerçekten izlediği yol: bir iddia **artı**
değeri yeniden üreten komut, oturum sandbox'ında çalıştırılıyor.
`SandboxFactory` üzerinden gidiyor — `process.exec`'in kullandığı yol — yani
sandbox backend'i, workspace sınırlandırması ve environment scrubbing
**devralınıyor**, yeniden uygulanmıyor. Risk `process`, `sideEffect: true`,
çünkü bir komut çalıştırıyor; capability bunu söylüyor, `pure` görünmüyor.

**Hesaplamış sayılmanın üç kuralı:**

1. **Sıfır-olmayan exit = çalışmadı.** stdout'u ne kadar sayısal görünürse
   görünsün bir sonuç değil. Timeout bir başarısızlıktan **ayrı** raporlanıyor.
2. **Sayı olmayan çıktı = çalışmadı**, ve ham satır kanıta yazılıyor. Yalnızca
   **son boş-olmayan stdout satırı** okunuyor, yani bir komut ilerleme
   loglayıp yine de cevap verebilir — ama **hiçbir şey yazmayan komut cevap
   vermemiştir.**
3. **İddia edilen değer ile komut bilerek farklı yerlerden geliyor.** Değer
   modelin söylediği; **karar veren komut.** Fazı taşıyan test `9` iddiasını `4`
   yazan bir komuta karşı kuruyor ve **mismatch** doğruluyor.

Tolerans iddia başına, ve **bilinmeyen bir tolerans alanı reddediliyor** —
sessizce kabul edilen `sloppy: 1`, kimsenin göremediği bir tolerans olurdu.

`engine.ts`'te `processCapability`'nin yanına kaydedildi. Mantığın **hepsi**
`capabilities/science.ts`'te; `engine.ts` **üç satır** kazandı ve 5584 satıra
çıktı, bu da boyut ratchet'ını **iki dosyada birden 5582 → 5585** yaptı. Bir
ratchet'ı yükseltmek bir **maliyettir** ve buraya kaydedildi; alternatifi mantığı
`engine.ts`'e koymak olurdu — ratchet'ın caydırmaya çalıştığı tam olarak bu.

16 test, ratchet ile kanıtlı. Biri **gerçek bir `HybridAgentEngine` boot ediyor**
ve `science.recompute`'un `capabilities.list()`'te `process` riskiyle olduğunu
doğruluyor — yani **kaydı** kanıtlıyor, modülün varlığını değil. Kayıt
kapatılınca tam olarak o test düşüyor.

**Üç hata derleyerek ve çalıştırarak bulundu, okuyarak değil:**
`SandboxExecResult`'ta `stderr` alanı **yok** ve `exitCode`'u **nullable**; iki
spread `exactOptionalPropertyTypes`'ı ihlal etti çünkü zod opsiyonelleri
`number | undefined` üretirken doğrulayıcının toleransı **"yok = kesin"**
anlamına geliyor; ve test harness'ı **kendi sayaç nesnesini spread'liyordu**,
yani `destroyed` bayat bir sıfır okuyordu ve sızdıran-sandbox testi **yanlış
sebeple geçecekti.**

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** (engine.ts 5585) ·
`docs:state` **318 dosya / 2475 case / 30 modül** · drift **4/4** · t7 **4/4**,
pin **496 → 498**.

**FAZ 9 için açık kalan:** planner hiçbir yerden **sayısal iddia + komut**
üretmiyor, yani bir görevin yeniden-hesaplama istemesi gerekiyor; ve **sembolik
yarı** (CAS, proof checking) burada uygulanmıyor ve **sayısal bir
yaklaşıkla ikame edilmeyecek.**
---

**3/3 (`117c251`)** — bir plan adımı üreteceği sayıyı **beyan edebiliyor** ve
`science/numeric-claims.ts` bu beyanları doğrulayıcının zaten anladığı iddia ve
kontrollere çeviriyor.

Beyan `successCriterion`'ın yanına oturdu; onun kendi yorumu bunun modeli:
*"eksik bir kriter yürütmeyi engellemez — **teyidi** engeller."* Burada da aynı
şekil. Opsiyonel, çünkü planner genellikle hiçbir şey belirtmez ve bir beklenti
**uydurmak**, kimsenin tarif etmediği bir iş hakkında iddia olurdu.

**Fazı taşıyan kural türetmede değil doğrulamada:** komutsuz bir değer beyan eden
adım **reddediliyor**, gerekçesiyle: *"yeniden üretemediği bir sayı, modeli tek
karar verici bırakır."* Bu kural olmadan alan, **modelin ileri sürdüğü ve hiçbir
şeyin kontrol etmediği bir sayı** olurdu — FAZ 9'un yasağının bir plan alanı
kılığına girmiş hali. Boş bir komut, eksik olan kadar kesin reddediliyor; sonlu
olmayan bir değer reddediliyor; bozuk bir tolerans **yok sayılmıyor,
reddediliyor.**

Sıradan bir plan hiçbir şey beyan etmiyor ve **geçerli kalıyor.** Bu bir boşluk
değil: o zaman yeniden hesaplanacak bir şey yoktur ve `verifyPlanNumbers` pass
yerine **"nothing was claimed"** ile `uncertain` raporluyor. Hiçbir şey
kontrol edilmemiş bir planı doğrulanmış gösteremez.

Modül **kendisi komut çalıştırmıyor** — bir runner alıyor — yani aynı türetme
üretimde sandbox'a, testte bir stub'a karşı çalışıyor; hem planlanmış (`name`) hem
çalıştırılmış (`id`) adımlar uyuyor.

**Bunun kanıtlamadığı şey, açıkça:** bu sandbox'ta **hiçbir model çalışmıyor**,
yani gerçek kullanımda bir planner'ın `numericExpectation` üretip üretmediği
**test edilmedi.** Şema kabul ediyor, doğrulama koruyor, türetme tüketiyor;
**prompt değiştirilmedi**, çünkü burada bir prompt değiştirmek model davranışı
hakkında **doğrulanamaz bir iddia** üretirdi. Planner'ın system prompt'unu
bağlamak, test etmek için bir model gerektiren ayrı bir karar.

14 test, ratchet ile kanıtlı: komutsuz bir beklentiyi kabul etmek **ikisini**
düşürüyor.

**Bir hata:** yedek bir import `task-planner.ts`'in **ilk satırından sonra**
eklendi — o satır bir doc yorumu — ve import **yorumun içine** düştü. `tsc`
yakaladı, gerçek import'ların altına taşındı.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** (engine.ts 5585'te
dokunulmadı) · `docs:state` **319 dosya / 2489 case / 30 modül** · drift **4/4** ·
t7 **4/4**, pin **498 → 502**.

**FAZ 9'un dürüst sınırı:** sayısal yarı **gerçekten yeniden hesaplıyor.**
Sembolik yarı — CAS, proof checking — burada **uygulanmıyor** ve **sayısal bir
yaklaşıkla ikame edilmedi**, çünkü "sayısal olarak denedim, tuttu" bir ispat
değildir ve FAZ 9 tam da bunu söyleyen faz.

---

### FAZ 10 — Computer Use Expert 🟡 (2/3 kapandı, kalan kısım bu sandbox'ta kurulamaz)

**Önce ölçüldü.** `computer-use/computer-use-service.ts` (367 satır) zaten
screenshot, görsel grounding, form doldurma, görev yaşam döngüsü ve rollback
içeriyor. **İçermediği şey doğrulama:** mouse, keyboard, clipboard, window,
accessibility ve "verif" kelimeleri dosyada **sıfır** kez geçiyor. Bir adımın
durumu, eylem **gönderildiğinde** `completed` oluyor ve sonrasında **hiçbir şey
bir şey olup olmadığına bakmıyor.**

Bu, FAZ 6'nın kod için ve FAZ 9'un sayılar için kapattığı kusurun **üçüncü
yeri:** *"şeyi yaptım"ı "şey çalıştı" sayan bir sistem.*

**1/3 (`1ca6ef2`)** — beş kural:

1. **Beklentisi olmayan tamamlanmış bir adım `not-checked`**, asla verified
   değil. `completed` eylemin **gönderildiğini** kaydeder; dünya hakkında kanıt
   değildir. Temiz bitmiş, hatasız bir adım bile **kanıtlanmamıştır.**
2. **Atan bir kontrol `could-not-observe`**, başarısızlık değil. Bakamamak ile
   bakıp yanlış bulmak aynı şey değil — biri ölçüm eksikliği, diğeri bir bug.
3. **Tamamlanmamış bir adım asla doğrulanmaz**, kontrolü geçse bile. Çalışmamış
   bir eylem üzerinde geçen bir kontrol **çelişkidir** ve kazanmış gibi
   puanlanmak yerine öyle raporlanır.
4. **Başarı, hatanın yokluğundan çıkarılmaz.**
5. **Bir görev yalnızca her adımı doğrulandığında doğrulanır.** Kontrol
   edilmemiş tek adım görevi doğrulanmamış yapar — research audit'inin zaten
   izlediği kural.

Başarısız bir kontrol **gerekçeyi** raporluyor, bir boolean'ı değil: *"the dialog
is still open"* başarısız bir doğrulamayı **eyleme geçirilebilir** yapan şey.

**Ortam — ölçüldü, varsayılmadı:** `DISPLAY` ve `WAYLAND_DISPLAY` **ikisi de
tanımsız**, ve `xdotool`, `wmctrl`, clipboard aracı ya da accessibility bus
**yok.** `displayAvailable()` bu kontrolü çalışma zamanında yapıyor ve bir test
cevabı doğruluyor — yani bir ekran ortaya çıkarsa test **düşer**, ki bu doğru,
çünkü dürüst cevap o zaman değişirdi.

`automationVerifier` görev doğrulamasını **V2_empirical** olarak sarıyor — FAZ
6'nın `acceptCodeWork`'ü için harici kanıt. Yani **adımları hiç gözlenmemiş bir
otomasyon çalıştırması consensus ile de taşınamaz**, ve bir test zinciri
kanıtlıyor.

15 test, ratchet ile kanıtlı: kontrol edilmemiş bir adımın doğrulanmış bir göreve
sayılmasına izin vermek **ikisini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** (engine.ts 5585'te
dokunulmadı) · `docs:state` **320 dosya / 2504 case / 30 modül** · drift **4/4** ·
t7 **4/4**, pin **502 → 506**.

**2/3 (`36baf59`)** — kurallar bağlıydı ama **hiçbir yere bağlı değildi** ve
hiçbir yere bağlı bir modül kapalı bir adım değildir (FAZ 8 3/4 ve FAZ 9 2/3'ün
dersi). Kusurun **yaşadığı yer** ölçüldü: `executeTask`, `executeStep` atmayınca
adımı **anında** `completed` yapıyordu — **eylemi göndermek ile çalıştığını
doğrulamak aynı olaydı.** Adımda adım-sonrası kanıt için bir `screenshot` alanı
zaten vardı ve **hiçbir şey onu okumuyordu.**

**Yürütme durumu ile doğrulama artık ayrı olgular** — FAZ 9 3/3'ün bir adımın
çalışması ile bir sayının teyit edilmesi arasında çizdiği ayrımın aynısı:
`AutomationStep.verification` (adım başına) · `AutomationTask.verification` (görev
özeti) · `executeTask(taskId, expectations?)` her adımı tamamlanınca doğruluyor.

Beklentiler opsiyonel, yani **tek mevcut çağıran** — HTTP route'u
`POST /v1/computer-use/tasks/:id/execute` — **değişmeden derleniyor.** Artık
yanıtında `unverified` ve `notChecked: N` taşıyor: beklentisiz bir çalıştırma
**"hiçbir şey gözlenmedi"** diyor, tamamlanmış bir çalıştırmayı çalışan bir
çalıştırma gibi sunmuyor. O route'a beklenti kabul ettirmek **OpenAPI
yeniden üretimi gerektiren bir API değişikliği** ve sessizce yapılmadı.

4 test, **gerçek bir `ComputerUseService` ve gerçek disk store'u** üzerinden —
mock ile değil — ve `wait` adımlarıyla, çünkü `executeStep` `wait`'i yerine
getiriyor (beklemek backend gerektirmiyor) ve diğer her şey için "not
implemented" atıyor. **Bu test sürücüleri değil, bağlantıyı kanıtlıyor.**

Taşıyıcı olan şu: tamamlanmış, her adımı `completed` bir çalıştırma **hâlâ
`verdict: "unverified"`** ve `notChecked: 2`. Bir diğeri ayrımın kontrol
başarısızken de durduğunu gösteriyor — `task.status === "completed"` iken
`verification.failed === 1`.

Ratchet ile kanıtlı: görev düzeyindeki doğrulamayı kapatmak **4'ünü de** düşürüyor.

**Bir araç notu:** bu düzenlemeden sonraki ilk typecheck **`TSC=127`** yazdırdı.
Bu "komut bulunamadı" — `node_modules` yine kaybolmuştu — ve **bir typecheck
sonucu değil.** Yeniden kuruldu, gerçek tsc, 0 hata.

**FAZ 10'un kalanı ve neden kapanmıyor:** mouse, keyboard, clipboard, window
management ve accessibility API **serviste yok** ve hiçbiri **ekransız bir
sandbox'a karşı kurulamaz.** Sürücüleri yazmak mümkün olurdu — ama
**doğrulanamaz stub'lar** olurdu ve bu **tam da bu fazın karşı olduğu şey.**
Bir tıklama sürücüsünü "yazdım, çalışıyor" diye geçirmek FAZ 10'un yasakladığı
şeyin ta kendisi; bu yüzden **yazılmadı.**


---

### FAZ 11 — Connector Fabric 🟡 (1/3 kapandı)

**Önce ölçüldü.** `connectors/connector-service.ts` (420 satır) connector
tiplerini, durumlarını, kimlik bilgilerini, aksiyonlarını, olaylarını, senkron
sonuçlarını ve beş alan şeklini modelliyor. **İçermediği şey somut bir
sağlayıcı:** `provider` serbest bir string ve yorumu *"e.g., gmail, outlook,
salesforce, sap, shopify"* diyor. **"field mapping" ve "schema discovery"
kelimeleri motorda sıfır dosyada geçiyor.**

Yani bir connector `connected` durumuna ulaşabiliyor ve `SyncResult` başarı
raporlayabiliyor — **kimse bir taraftaki alanların diğer taraftakilere
karşılık geldiğini kurmamışken.** Bu, FAZ 6'nın kod için, FAZ 9'un sayılar
için, FAZ 10'un otomasyon için kapattığı kusurun **dördüncü yeri.**

**1/3 (`4f5d75b`)** — beş kural:

1. **Eşlemesi olmayan hedef alan `unmapped` ve sonuçta *yok***, sessizce
   doldurulmuyor. **Taşıyıcı kural bu:** senkronlanmış bir kayıttaki boş bir
   string, **kaynağın gerçekten boş gönderdiği bir alandan ayırt edilemez** —
   yani bir placeholder yazmak, *"verilmedi"* ile *"boş olarak verildi"*
   arasındaki ayrımı yok eder. Test iki tarafı da kapsıyor: eşlenmemiş alan
   **hiç anahtar üretmiyor**, gerçekten `title: ""` gönderen kaynak ise onu
   **koruyor ve clean kalıyor.**
2. **Kaynakta olmayan bir alana bakan eşleme `missing-source`** — eşleme
   bayat ve bayat eşlemeler **yarım kayıt üretmek yerine yüksek sesle
   başarısız oluyor.**
3. **Hiçbir şey uydurulmuyor.** Bir test sonuçtaki her değerin kaynağın
   gerçekten sahip olduğu bir değer olduğunu doğruluyor.
4. **Tek bir payload'dan keşfedilen şema `sample` olarak işaretleniyor**,
   `live-payload` değil, ve özet bunu söylüyor. **Bir gözlem bir şema
   değildir.** `declared` bir şema bu uyarıyı taşımıyor.
5. **Bir şey düşüren ya da uyduran senkron clean değil** ve hiç hedef alan
   istememek de clean bir senkron değil.

`unmetTargets`, bir kaynağın hangi hedef alanları **hiç karşılayamayacağını
veri taşınmadan önce** cevaplıyor — yani bir entegrasyon, şekiller karşılık
gelmediği gerekçesiyle **reddedilebiliyor**, senkron delikli kayıtlar
ürettikten sonra değil.

**Bu faz bilerek connector kurmuyor.** Burada bir connector **canlı bir
üçüncü-taraf hesabı ve ağ erişimi** gerektirirdi ve ancak **doğrulanamaz bir
stub** olabilirdi — FAZ 10'un mouse ve keyboard sürücüleri için verdiği
kararın aynısı. Gerçek bir connector'ın ihtiyacı olan şey, **altındaki bu
katman.**

13 test, ratchet ile kanıtlı: eşlenmemiş bir alanı `""` ile doldurmak
**birini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**322 dosya / 2521 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**506 → 509**.

**FAZ 11 için açık kalan:** 20+ somut connector'ın kendisi, sağlayıcı başına
OAuth 2.0/PKCE ve webhook alıcısı. OAuth, rate limiting ve circuit breaking
motorda **zaten bir yerde var** (sırasıyla 14, 5 ve 5 dosya bahsediyor) ama
**bu eşleme katmanına bağlı değil** ve gerçek sağlayıcılara bağlamak burada
**doğrulanamaz.**


---

### FAZ 12 — Multimodal 🟡 (1/3 kapandı)

**Önce ölçüldü ve ölçüm bu adımın ne olması gerektiğini değiştirdi.** Multimodal
katmanı yapamadığı şey hakkında **zaten dürüst:** önceki bir geçiş
`analyzeImage`, `analyzeVideo`, OCR ve transkripsiyonu
`MultimodalCapabilityUnavailableError` attırmış — `[OCR placeholder for
file.png]` döndürmek yerine — ve oradaki yorum kusuru tam olarak adlandırıyor:
*"a downstream consumer had no way to tell placeholder text from a real
transcript, so the whole pipeline produced confident nonsense."*

**Ama o ret yalnızca legacy giriş noktalarını kapsıyor.** Gerçek yol — bir
workspace görüntüsünün bir model sağlayıcısının native payload'ına
projektelenmesi (`models/multimodal.ts`, 34 satır) — **sağlayıcının döndürdüğünü
döndürüyor ve hiçbir şey onu kontrol etmiyor.** Boş bir nesne listesi ve kendinden
emin bir özetle cevap veren bir sağlayıcı, **aynı kusuru ön kapıdan yeniden
üretiyor.**

**1/3 (`c319e4e`)** — beş kural:

1. **Gözlemi olmayan bir analiz `empty`**, asla *"analiz edildi, içinde hiçbir
   şey yok"* değil. İkincisi dünya hakkında bir iddiadır; birincisi bir ölçüm
   yokluğudur.
2. **Bir analiz, tarif ettiğini iddia ettiği girdiye bağlı olmalı.** Herhangi bir
   görüntü hakkında olabilecek bir özet, *bu* görüntü hakkında kanıt değildir.
   Hem eksik girdi hem id uyuşmazlığı `unbound`.
3. **Modalite eşleşmeli.** Bir video girdisi için dönen "image" analizi kısmi bir
   başarı değil, bir uyuşmazlıktır.
4. **Gözlem olmadan eklenen confidence kanıt değildir** — bir süstür.
5. **Her gözlem alanı boşken içerik iddia eden bir özet `unsupported-claim`**,
   bilerek `empty`'den ayrı tutuluyor: ikisi de kanıt yokluğu, ama **yalnızca
   biri aşağı akışta bir bulgu gibi görünüyor.**

`countObservations`, `AnalysisResult`'taki **her** gözlem alanını sayıyor
(entities, objects, timeSeriesPoints, text, structure, spatialData). Hepsi
opsiyonel, yani bir analiz bir özet ve başka hiçbir şeyle gelebiliyor — **tam
olarak bulgu gibi okunan şekil.** `"   "` transkripsiyon metni döndüren bir
sağlayıcı **sıfır** gözlem sayılıyor, bir değil.

`isEvidence` yalnızca `supported`'ı kabul ediyor. `empty`'yi *"hiçbir şey
bulunamadı"* diye geçirmek, **ölçülmemiş bir dosyanın temiz bir dosya olarak
kaydedilme** yolu.

**Burada hiçbir vision/STT/TTS/video backend'i kurulmuyor.** Bu sandbox'ta
**hiçbir model çalışmıyor.** Ayrıca `audio.transcribe` ve `audio.synthesize`
capability'leri **kontrol edildi ve dürüst:** sonucu uydurmuyor, yapılandırılmış
bir STT sağlayıcısına karşı `AudioService`'e devrediyorlar — yani orada
kapatılacak bir kusur yoktu.

11 test, ratchet ile kanıtlı: gözlemsiz bir özeti `supported` saymak **ikisini**
düşürüyor.

**Kendi yazdığım bir test adıyla çelişiyordu** — *"supports an OCR result on its
own"* `modality-mismatch` doğruluyordu, çünkü analiz varsayılan image
modalitesinde kalırken girdi `ocr`'dı. **İddia ettiği şeyi test edecek şekilde
düzeltildi.**

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**323 dosya / 2532 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**509 → 512**.

**FAZ 12 için açık kalan:** backend'lerin kendisi — object detection, OCR, scene
understanding, Whisper STT, TTS ve video understanding. Hiçbiri **model
çalıştırmayan bir sandbox'a karşı kurulamaz.**


---

### FAZ 13 — Society 🟡 (1/3 kapandı)

**Önce ölçüldü.** "debate" yalnızca **2** dosyada ve ikisi de world-model dosyası;
"conflict resolution" **1** dosyada, o da world-model; **"mentor" hiçbirinde.**
Yani society katmanında **hiç debate mekanizması yok.**

Consensus **var** — `execution/consensus-verifier.ts` (P1'de kuruldu) — ama **tek
bir ikili iddiayı** cevaplıyor: bu tutuyor mu, evet/hayır, bağımsız kaynaklar
arasında oylanarak. Bu, **kendi sorusu için doğru mekanizma ve bu fazınki için
yanlış.**

İki uzman **maddi olarak farklı** konumlar ürettiğinde — *"sebep X"* karşısında
*"sebep Y"* — bir çoğunluk oyu birini seçip diğerini atıyor ve sonuç **bir
bastırma iken çözüm gibi okunuyor.** Kaybeden konumun kanıtı kayıttan
kayboluyor; **yanlış bir cevabın hayatta kalma yolu tam olarak bu: itirazı elinde
tutan kimse kalmıyor.**

Bu, FAZ 8'in alıntılar için koyduğu kuralın — **çözülmemiş bir majör çelişki
bloklar ve asla ortalamayla kaybolmaz** — uzmanlara uygulanmış hali.

**1/3 (`034d402`)** — beş kural:

1. **Bir çoğunluk çözümü muhalefeti silmez.** Her konum kaydediliyor, bastırılanlar
   **kanıtlarını koruyor** ve özet neyin bastırıldığını adlandırıyor. **Taşıyıcı
   kural bu.**
2. **Beraberlik `tie`**, yazı-tura değil — ve bir test aynı iki konumu **ters
   sırada** göndererek beraberliğin geliş sırasıyla bozulmadığını kanıtlıyor.
3. **Kanıtı olmayan bir konum kazanamaz.** Bu kural olmadan **en gürültülü uzman
   kazanır** ve bir debate bir ses yarışmasına döner. **Kanıt taşıyan tek bir
   konum, desteksiz bir çoğunluğu yener** — mesele bu.
4. **Çekimser kalan uzman anlaşmış sayılmaz** ve **bir kaynağı paylaşan iki uzman
   iki fikir değildir:** bir kaynağın üç takma adı, başka bir kaynağa karşı
   **beraberliktir, 3-1 galibiyet değil.** Consensus'un zaten uyguladığı
   bağımsızlık kuralının konumlara uygulanması.
5. **Her konum kanıtsızsa** oylar nasıl düşerse düşsün debate **çözülmemiştir.**
   Tartılacak bir şey yok.

`tie` ve `unresolved` **ikisi de ret** ama ayrı tutuluyor, çünkü farklı şeyler
anlama geliyorlar: **beraberlik kanıtın bölündüğü**, çözülmemişlik **hiç olmadığı**
anlamına gelir. Boşluk kanıt sayılmıyor.

### Neden uzman roster'ı kurulmuyor

FAZ 13'ün 15+ uzmanı, mentorship'i ve team coordination'ı **gerçek domain
uzmanları** gerektiriyor ve **araçsız, verifier'sız on beş persona** tam olarak
**kullanıcının reddettiği şey:** *"bir domain uzmanı farklı bir prompt değildir."*

Roster'ın altında ihtiyacı olan şey, **verimli bir şekilde anlaşmazlığa düşmenin
bir yolu** — ki bu da burada kurulan şey.

12 test, ratchet ile kanıtlı: bastırılan konumları kayıttan silmek **ikisini**
düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**324 dosya / 2544 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**512 → 516**.

**FAZ 13 için açık kalan:** uzman roster'ının kendisi, mentorship ve team
coordination.


---

### FAZ 14 — Long Horizon 🟡 (2/3 kapandı, üretim çağıranı hedef modeline bağlı)

**Önce ölçüldü.** "replan" **14** dosyada, "reflect" **22**, "checkpoint" **8**,
"rollback" **32** — bu fazın replan/reflect/checkpoint/rollback yarısı
**büyük ölçüde var.** **"goal drift" sıfır dosyada**, "long horizon" da öyle.
FAZ 14'ün adlandırdığı ve motorda olmayan tek mekanizma, **görevin artık o görev
olmadığını fark eden mekanizma.**

### Drift, diğerlerinin yakalayamadığı uzun-ufuk başarısızlık modu

Bir checkpoint nerede olduğunu kaydeder; bir rollback seni oraya döndürür; bir
replan yeni bir yol seçer. **Hepsi varış noktasının hâlâ varış noktası olduğunu
varsayar.**

Yüz adım boyunca, her biri yerel olarak makul, çalışma **kimsenin istemediği bir
yere varabilir** — ve o yolda bu mekanizmaların **her biri başarı raporlardı.**

### Dürüst kısıt — ve bunun neden küçük olduğu

Drift, **bir adımın nasıl hissettirdiğine bakarak tespit edilemez.** Yalnızca
**açık bir şeye karşı** ölçülebilir. Yani bu, bir yörüngeyi **beyan edilmiş hedef
kriterlerine karşı** ölçüyor ve ölçülecek bir şey olmadığında **cevap vermeyi
reddediyor.**

**1/3 (`6208547`)** — beş kural:

1. **Kriteri olmayan bir hedef `unmeasurable`**, asla "on-goal" değil. Hiç
   belirtilmemiş bir şeyden sapamazsın ve on-goal raporlamak **ölçüm kılığına
   girmiş bir iddia** olurdu — ve **herhangi bir yörüngeyi sertifikalandırırdı.**
2. **Var olmayan bir kritere iz süren bir adım bir hatadır, bir iz değil.** Hiçbir
   şey belirtmeyen bir adımdan **daha kötü:** orada olmayan bir bağlantı iddia
   ediyor ve bunu sessizce yok saymak o iddiayı **aklardı.**
3. **İzi olmayan adımlar sayılıyor ve oranıyla raporlanıyor**, sessizce
   emilmiyor. Bir test **100 adım** sürüyor: 98'i hedefe hizmet ediyor, **hiçbir
   yerde hiçbir şey başarısız olmuyor** ve yörünge **hâlâ sapıyor** — bu
   mekanizmanın var olma sebebi olan durum.
4. **Başarısız bir adım drift değildir.** Drift **yön** hakkındadır, başarısızlık
   değil; başarısızlıkları drift saymak, **dürüstçe başarısız olmuş bir görevi
   yoldan çıkmış gibi gösterir** ve bir replan'ı **yanlış problemin** peşine
   gönderirdi.
5. **Hiçbir adımın hizmet etmediği bir kriter, karşılanmamış bir hedeftir.**
   Drift'in **iki yönü** var — hiçbir şeye hizmet etmeyen çalışma ve hiçbir
   çalışmanın hizmet etmediği hedef — ve **yalnızca birincisi genellikle fark
   edilir.**

`traceThreshold` varsayılanı **1:** hiçbir şeye hizmet etmeyen bir adım, **kimsenin
gerekçelendiremediği** bir adımdır ve uzun bir görev tam olarak *"çoğunlukla
hedefte"*nin yüz adım sonra *"başka bir yerde"*ye dönüştüğü yer. Bir çağıran daha
düşük bir eşik beyan edebilir ve bir test yörüngenin 0.6'da tutunduğunu, **izi
olmayan adımın yine de raporlandığını** gösteriyor.

`isDriftReportActionable`, `unmeasurable` için **false** döndürüyor. Onu bir pass
saymak, **kimsenin yazmadığı bir hedefin herhangi bir yörüngeyi
sertifikalandırmasına** izin verirdi.

11 test, ratchet ile kanıtlı.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**325 dosya / 2555 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**516 → 518**.

**2/3 (`3cb4ed3`)** — 1/3 drift tespitini kurdu ama **hiçbir yerden
çağırmıyordu**, ki bu kapalı bir adım değildir (FAZ 9 2/3 ve FAZ 10 2/3'ün aynı
dersi). Benzer sinyal için zaten var olan döngüye bağlandı.

Döngünün nerede olduğu ölçüldü: `AuroraPlanFeedback.advise`, bir karar çok
yanlış çıktığında bir aday inisiyatif yükseltiyor ve **kendi yorumu sınırı tam
çiziyor:** *"It never rewrites the plan by itself."* Drift bu sınırı
**çiğnemiyor, izliyor** — çünkü *"bu adımlar hiçbir beyan edilmiş kritere iz
sürmüyor"* hem iş hem **hedefin ifade edilişi** hakkında bir ifadedir ve yüz
adımlık ilerlemeyi bu gerekçeyle sessizce atmak, drift'i hiç fark etmemekten
**daha kötü** olurdu.

`adviseOnDrift(tenantId, goal, trajectory, context)` drift'i tespit ediyor ve
sapma varsa, **accounted/unaccounted sayılarını**, karşılanmamış kriterleri ve
**başarısızlıkları ayrı kaydederek** (çünkü başarısızlık drift değildir) bir
inisiyatif öneriyor.

**Taşıyıcı kural: `unmeasurable` bir rapor hiçbir şey yükseltmiyor.** Kriter
belirtmeyen bir hedef bir yörüngeyi on-goal olarak **sertifikalandıramaz** ve
aynı gerekçeyle **birini kovalamayı da haklı çıkaramaz** — orada bir replan
önermek, **sistemin sahip olmadığı bir kanıta cevap veriyor gibi görünmesine**
yol açardı. İki test kapsıyor: kriter yok, ve henüz yörünge yok.

Initiative bağımlılığı yokken **drift raporu yine dönüyor**, yalnızca öneri
atlanıyor. **Drift'in kendisi hakkındaki sessizlik kusur olurdu;** hiç
bağlanmamış bir öneri kanalı hakkındaki sessizlik değil.

### Bunun yapmadığı şey — ölçüldü, varsayılmadı

**Henüz bir üretim çağıranı yok.** `AuroraPlanFeedback` `engine.ts:2037`'de
kuruluyor ve metrikler üzerinden erişilebilir, ama grep `adviseOnDrift` için bir
çağrı yeri **bulmuyor.** Sebep ölçüldü: drift tespiti **beyan edilmiş kriterleri
olan bir hedef** gerektiriyor ve `PlanRecord` yalnızca `goalId?` ile
`objective: string` taşıyor — **kriter listesi yok.** Motor şu anda böyle bir
şey **üretmiyor.**

Bir çağrı yeri icat etmek, **ölçülecek kriterleri uydurmak** anlamına gelirdi —
ki bu, bu mekanizmanın **reddettiği tek şey.** Yani dürüst durum şu: **mekanizma
kuruldu, test edildi, motorun kurduğu servisin üzerinde public, ve kriter beyan
eden bir hedef modelini bekliyor.** FAZ 14'ün gerçek kalan boşluğu bu.

7 test, gerçek bir `AuroraPlanFeedback` üzerinden — kendisine ne önermesi
istendiğini kaydeden bir initiative stub'ı ile, çünkü bağlantının meselesi
**hangi durumların `propose`'a ulaştığı.** Ratchet ile kanıtlı: `unmeasurable`'ın
öneri yükseltmesine izin vermek **ikisini** düşürüyor.

**Kendi test hatam:** üç adımdan ikisi iz sürerken bir testte "1/3 step(s)
trace" bekledim. **Kod doğruydu, test yanlıştı** — test düzeltildi.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**326 dosya / 2562 case / 30 modül** · drift **4/4** · t7 **4/4**, pin **518'de
değişmedi** — yeni metod zaten export edilen bir sınıfın üzerinde, yani API
yüzeyi büyümedi.


---

### FAZ 15 — Proactive 🟡 (1/3 kapandı)

**Önce ölçüldü.** Proactive katmanı büyük: watchers, intake events, `runWatchers`,
`propose`, `budget`, `evaluate`, `markDelivered` ve `dismiss` içeren **912
satırlık** bir `ProactiveInitiativeService` — ve FAZ 15'in beş mekanizması da
motorda bir yerde var (opportunity 13 dosya, anomaly 7, proactive 19, scheduled
13, trigger 32).

**İçermediği şey kendi doğruluğunun bir ölçüsü.** `InitiativeEvaluation`
`queued`, `suppressed`, `digested` ve `budget` raporluyor — bu **şimdi ne
gönderileceğine** dair bir karar. `dismiss` bir reddi kaydediyor ve **hiçbir şey
o kayıtları bir orana çevirmiyor.** Sistem neyi yüzeye çıkaracağına karar veriyor
ve **yüzeye çıkarmanın doğru olup olmadığını hiç öğrenmiyor.**

### Bu neden diğer alt sistemlerden daha önemli

Çünkü başarısızlık modu **kendi kendini güçlendiriyor:** çoğunlukla gürültü yüzeye
çıkaran proaktif bir asistan **bir mesaj için yok sayılmaz — kalıcı olarak yok
sayılır.**

Motorda şu anda hiçbir şey **"kullanıcı sessiz çünkü söyleyecek bir şey yok"** ile
**"kullanıcı sessiz çünkü okumayı bıraktı"** arasında ayrım yapmıyor.

**1/3 (`e5f74d0`)** — beş kural:

1. **Kesinlik yalnızca kullanıcıya gerçekten ulaşan inisiyatifler üzerinden
   hesaplanıyor.** `candidate`, `queued`, `suppressed`, `digested` ve `expired`
   **hiç kimseye ulaşmadı**, yani onları saymak sayıyı şişirir — **bastırılmış bir
   inisiyatif doğru bir inisiyatif değil, kimsenin görmediği bir inisiyatiftir.**
   Bir test 60 inisiyatif sürüyor ve yalnızca 10'u ulaşıyor; ikincisi, **yalnızca
   bastıran** bir sistemin gurur verici bir %100 yerine `insufficient-sample`
   raporladığını gösteriyor.
2. **Çok az ulaşan inisiyatif `insufficient-sample` veriyor**, asla bir oran değil.
   **Baştan çıkarıcı durum açıkça kapsanıyor:** 1 ulaşan, 0 reddedilen — *"%100
   kesinlik"* gibi okunuyor ve gerçekte **tek bir inisiyatif.**
3. **Kesinlik her zaman paydasıyla raporlanıyor.** Çıplak bir yüzde, **onu
   anlamlı kılan şey olmadan alıntılanan** şekildir.
4. **Bir ret bir sinyaldir, bir hüküm değil** — reddedilmiş bir inisiyatif yine de
   yüzeye çıkarılmaya değmiş olabilir. Ama **gerçek bir örneklem üzerindeki bir ret
   oranı** kanıttır ve hesaplanan şey bu.
5. **Yüksek bir ret oranı, sistemin bir kusuru olarak açıkça ifade ediliyor** —
   yumuşatılmıyor ve **kullanıcıya atfedilmiyor.** Bir test sınırı **tam yarıda**
   sabitliyor, yani alarm %50'de yükselmiyor.

`minSample` varsayılanı 10 ve **bir sabit değil bir parametre**, çünkü doğru taban
sistemin ne sıklıkta konuştuğuna bağlı. `isPrecisionActionable`,
`insufficient-sample` için false: **bir avuç mesaja dayanarak proaktif bir sistemi
ayarlamak, hiçbiri yokken ayarlamakla aynı şekil.**

9 test, ratchet ile kanıtlı: hiç ulaşmamış inisiyatifleri paydaya saymak
**ikisini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**327 dosya / 2571 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**518 → 520**.

**FAZ 15 için açık kalan:** bu ölçüm henüz bir raporlama yüzeyine bağlı değil ve
hiçbir eşik ona göre davranmıyor. İkisi de **sistemin gürültülü olduğunu
öğrendiğinde ne yapması gerektiğine dair bir karar** gerektiriyor — ki bu bir
**ürün kararı, bir mekanizma değil**, ve tahmin edilmek yerine kaydediliyor.


---

### FAZ 16 — Self Improvement 🟡 (1/3 kapandı)

**Önce ölçüldü ve ölçüm eksik bir özelliğe değil belirli bir satıra işaret etti.**
"strategy update", "skill learn" ve "performance analysis" **sıfır** dosyada, ama
`evolution/skill-evolution-service.ts` **676 satır** — gerçek bir gap modeli,
blueprint → sandbox → test → beta → production aşamalama, scorecard'lar,
regression baseline'lar ve bir journal. **Self-improvement döngüsü var.**

### Yanlış olan tek bir yerdi

`advanceStage`, bir skill production'a ulaştığı anda ona sebep olan gap'i
**`resolved`** işaretliyordu.

O terfinin etrafındaki gate'ler **gerçekten titiz:** production açık bir onay
aktörü, kayıtlı bir regression baseline, composite ≥ 0.7, safety ≥ 0.9 ve en az
bir kayıtlı beta invocation gerektiriyor.

**Ama onların her biri skill hakkında bir ifade. Hiçbiri gap hakkında bir ifade
değil.** Yani iyi puanlanmış bir şey kuran bir döngü, **yola çıktığı problemi
çözdüğü sonucuna varıyordu — hiçbir şey kontrol etmeden.**

### Bu neden diğerlerinden daha kötü

Bu, FAZ 6'nın kod, FAZ 9'un sayı, FAZ 10'un otomasyon, FAZ 11'in connector ve
FAZ 14'ün drift için kapattığı kusurun self-improvement sürümü: **"şeyi yaptım"ın
"şey çalıştı" olarak kaydedilmesi.**

Burada diğerlerinden **daha kötü**, çünkü **kendi gap'lerini gönderim üzerine
kapatan bir self-improvement döngüsü, düzeltmenin işe yaramadığını kendisine
söyleyecek sinyali üretmeyi bırakır.** Hata kendini gizleyen bir hale geliyor.

### Değişiklikler

- **Yeni bir gap durumu, `mitigated`:** bu gap için kurulan bir skill production'a
  ulaştı, ama **hiçbir şey gap'in probleminin ortadan kalktığını doğrulamadı.**
- `advanceStage` artık `mitigated` yazıyor, asla `resolved` değil, ve nedenini
  journal'a kaydediyor. Zaten `resolved` olan bir gap **düşürülmüyor.**
- **`resolveGap(tenantId, gapId, { evidenceRefs, reason, actor })` `resolved`'a
  giden tek yol** ve boş ya da yalnızca boşluktan oluşan kanıtı **yok saymak
  yerine reddediyor** — boş bir liste, gap'i kapandı diye kaydederken **onu
  kapatacak hiçbir şey bırakmazdı.**
- Gap'leri filtreleyen **iki zod enum'u** (`capabilities/evolution.ts` ve
  control-api route'u) `mitigated`'ı kabul ediyor, yani durum **görünmez değil,
  sorgulanabilir.** `docs/openapi.yaml` bu enum değerlerini yazmıyor, yani
  doküman yeniden üretimi gerekmedi — **bu varsayılmadı, kontrol edildi.**

**Gate'ler olduğu gibi bırakıldı.** Bu değişiklik, bir terfinin **gap hakkında ne
iddia ettiğini** değiştiriyor, terfi etmek için ne gerektiğini değil.

8 test, gerçek bir `SkillEvolutionService`'i gözlemlenmiş bir gap'ten production
bir skill'e kadar **her gate'ten geçirerek** sürüyor. Bir test gate'lerin
onaysız bir production terfisini **hâlâ reddettiğini** kanıtlıyor. Ratchet ile
kanıtlı: terfide `resolved`'ı geri getirmek **4'ünü** düşürüyor.

**İki test hatam, ikisi de benim, kodun değil:** bir journal alanını `detail`
diye okudum, adı `summary`; ve journal öznesinin gap olduğunu iddia ettim, oysa
bir stage kaydının öznesi **doğru olarak** sahnelenen skill'dir ve gap özette
adlandırılır. İkisi de testte düzeltildi.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**328 dosya / 2579 case / 30 modül** · drift **4/4** · t7 **4/4**, pin **520'de
değişmedi** — `resolveGap` zaten export edilen bir sınıfın üzerinde.

**FAZ 16 için açık kalan:** şu anda `resolveGap`'i **hiçbir şey çağırmıyor**,
çünkü bir gap'i kapatmak **gap'in probleminin ortadan kalktığına dair kanıt**
gerektiriyor ve motorda bugün o kanıtı üreten bir yer yok. **Yol var ve
gate'lenmiş; kanıt kaynağı yok.**


---

### FAZ 17 — Capability Acquisition 🟡 (1/3 kapandı)

**Önce ölçüldü.** MCP katmanı büyük: `discover`, `listTools`, `callTool`,
`callToolInteractive`, `awaitTask` ve `listen` içeren **559 satırlık** bir
`stateless-mcp-client.ts`, ayrıca bir registry, bir OAuth sağlayıcısı ve bir
elicitation servisi — **17 dosya** MCP'den, **13'ü** plugin'den bahsediyor.
`callTool`'un gerçek girdi hijyeni var: sınırlı `requestState`, sınırlı
`inputResponses`, sunucunun geri gönderdiği şey üzerinde şekil kontrolleri.

**Ne client'ın ne registry'nin sahip olduğu şey: herhangi bir güven kavramı.**
verify, allowlist, trust ve approve kelimeleri **iki dosyada da sıfır** yerde
geçiyor. Yani `listTools` sunucunun ilan ettiği her şeyi döndürüyor ve `callTool`
**herhangi birini çağırıyor.**

Sınırlar **bozuk biçimli bir yanıta karşı** koruyor; **bu aracın hiç çağrılabilir
olup olmadığı** sorusuna cevap vermiyorlar.

### Bu, diğer dördünün bağlı olduğu parça

Tool discovery zaten çalışıyor; **tool generation yalnızca doğrulanmamış araç
sayısını çarpardı**; bir plugin sistemi **yüzeyi genişletir.** Verification,
**bunlardan herhangi birine sahip olmayı güvenli kılan şey.**

**1/3 (`509c535`)** — beş kural:

1. **Keşfedilen bir araç `unverified`.** Bir sunucunun bir aracı tarif etmesi
   **sunucunun bir iddiasıdır, bir ölçüm değil.**
2. **Doğrulama, ilan edilmiş olanın bir digest'ine bağlı, isme değil.** `search`'ü
   onaylayıp sonra sunucunun `search`'ü **yeniden tanımlaması onayı
   devralmamalı** — o ikame **saldırının tamamı.** Digest ismi, açıklamayı ve
   input schema'yı kapsıyor ve **sunucuya göre kapsamlandırılıyor**, yani bir
   sunucunun onayı diğerinin değil.
3. **Doğrulama sonrası değişen bir tanım `changed`**, doğrulanmamış sayılıyor.
   Testler üç yolu da kapsıyor: değişen açıklama, genişleyen input schema, ve
   hiç olmayan bir açıklamanın eklenmesi.
4. **Doğrulanmamış bir aracı çağırmak reddediliyor, uyarılmıyor.** Bir log'daki
   uyarı **bir kontrol değildir.**
5. **Ret, hiç bakılmamış olmaktan farklı** ve bir gerekçeyle kaydediliyor —
   doğrulanmamış bir araç sonra doğrulanabilir, **reddedilmiş bir araç sunucu onu
   aynı isimle yeniden ilan etti diye sessizce geri gelmemeli.**

**Açıklama bilerek digest'in parçası:** bir çağıranın aracı nasıl kullanacağına
karar verme şekli odur, yani kendini başka bir şey yapıyor diye tarif etmeye
başlayan bir araç, **şeması aynı olsa bile değişmiştir.**

`decideToolTrust` **saf ve yan etkisiz** — karar bir sunucu olmadan test
edilebiliyor ve kalıcılığı çağıran sahipleniyor. `verifyTool` bir doğrulayıcı
kimliği ve gerekçe istiyor, ikisi boşsa **reddediyor** — **kimsenin atfedemediği
ve kimsenin açıklamadığı bir onay denetlenebilir değildir.**

13 test, ratchet ile kanıtlı: bir tanım değişikliğini yok saymak **4'ünü**
düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**329 dosya / 2592 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**520 → 524**.

**FAZ 17 için açık kalan:** `decideToolTrust`'ı **henüz hiçbir şey çağırmıyor** —
`callTool` ona danışmıyor, yani **keşfedilen bir araç pratikte hâlâ
çağrılabilir.** Bunu bağlamak, **tenant başına güven kayıtlarının nerede
yaşadığına** ve **zaten bağlı sunuculara ne olacağına** karar vermek demek; bu,
**MCP client'ın sözleşmesine bir değişiklik** ve bu commit'in yanına iliştirilmek
yerine kaydediliyor.


---

### FAZ 18 — Expert Evaluator Fabric 🟡 (1/3 kapandı)

Plan bu fazı **"her alanda en iyinin gizli anahtarı"** diye adlandırıyor: her
expert kendi evaluator'üne sahip olacak ve **Aurora'nın zekâsı generation +
verification.**

**Önce ölçüldü ve ölçüm parçaların var olduğunu ama birleşmediğini söylüyor.**
`ExpertDefinition` `evaluatorCategories?: readonly string[]` taşıyor — **opsiyonel**
ve bu, `packages/eval`'in **offline** puanladığı **eval kategori isimlerinin** bir
listesi. **Bir evaluator değil; içindeki hiçbir şey bir işi kontrol etmiyor.**

Bu arada dört domain evaluator'ü önceki fazlarda kuruldu ve **hiçbiri bir expert'e
bağlı değil:**

- coding: `acceptCodeWork` (FAZ 6)
- research: `auditResearchReport` (FAZ 8)
- math/data: `verifyNumericClaims` (FAZ 9)
- vision: `verifyMultimodalAnalysis` (FAZ 12)

Yani **FAZ 18'in tarif ettiği fabric henüz yok, ama evaluator'lerinin beşte dördü
var.** Bu adım onları birleştiriyor.

**1/3 (`96f7e08`)** — beş kural:

1. **Evaluator'ü olmayan bir expert için iş değerlendirmek `uncertain` ve
   `evaluated: false` döndürüyor**, asla `pass` değil. **Bir kontrolcünün yokluğu,
   iş hakkında bir sonuç değildir.**
2. **Başarısız olamayan bir evaluator kayıt sırasında reddediliyor.** Kayıt,
   evaluator'ün **reddetmesi gereken bir probe** çalıştırıyor; her şeyi geçiren bir
   evaluator **hiçbir şey kontrol etmeden kapsam raporlardı** — ki bu, evaluator'ü
   olmamaktan **daha kötü**, çünkü **kapsanmış görünüyor.** Kendi probe'unda atan
   bir evaluator da aynı gerekçeyle reddediliyor.
3. **Bir evaluator değerlendirdiği domain'i beyan etmeli ve expert'inkiyle
   eşleşmeli.** Bir research expert'ine bağlı bir coding evaluator'ü, kural 2 ile
   aynı sebepten hiçbir şeyden daha kötü.
4. **Kapsam raporlanıyor**, evaluator'ü olmayan expert'ler adlandırılarak.
   **Kapsamadığını söyleyemeyen bir fabric, kapsadığı şey için de güvenilir
   olamaz.**
5. **Çalışma zamanında atan bir evaluator `uncertain` veriyor**, pass da fail de
   değil. **Kontrol edememek hiçbir yönde bir hüküm değildir.**

Bir expert'i yeniden kaydetmek, evaluator'ünü **sessizce değiştirmek yerine
reddediliyor** — çünkü öncekini sessizce atmak, **kapsam sayısını değiştirmeden bir
kontrolü kaldırmak** olurdu.

12 test. Biri sahte bir evaluator yerine **FAZ 12'nin gerçek
`verifyMultimodalAnalysis`'ini** bağlıyor — probe'u, reddettiği
özet-gözlemsiz analiz — **fabric'in zaten var olan evaluator'lere yanına
oturmak yerine onları birleştirdiğini kanıtlamak için.** Üç durum o bağlantıyı
sürüyor: kayıt reddi kanıtlıyor, desteklenen iş geçiyor, reddedilen iş kalıyor.

Ratchet ile kanıtlı: bir rubber stamp'i kabul etmek **birini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**330 dosya / 2604 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**524 → 526**.

**FAZ 18 için açık kalan:** fabric **hiçbir yerde kurulmuyor** ve hiçbir expert
içine kaydedilmiyor, yani dört mevcut evaluator **pratikte hâlâ bağlı değil.**
Bunu bağlamak, **her domain'in verifier'ı için adapter şeklini** kararlaştırmak
demek — **farklı argümanlar alıyorlar ve farklı şekiller döndürüyorlar** — ve
tahmin edilmek yerine kaydedildi, çünkü **yanlış bir adapter şekli, expert'in
ürettiğini gerçekte kontrol etmeyen evaluator'ler bağlardı.**


---

### FAZ 19 — Strategy Arena 🟡 (1/3 kapandı)

FAZ 19 bir task için A/B/C/D stratejileri üretilmesini ve sandbox'ta
yarıştırılmasını istiyor, açık bir cümleyle: **"Aurora 'her zaman benim yöntemim'
demesin."**

**Önce ölçüldü.** `aurora/strategy-generator.ts` (170 satır) bir hedef için zaten
**birkaç ayrı strateji** öneriyor — `TaskStrategy`, `selectStrategy`,
`parseStrategyProposals`, ve ayrı yaklaşımlar isteyen bir system prompt. **O yarı
var.**

### Yaptığı şey seçmek, yarıştır değil

`selectStrategy` önce risk, sonra hız ile sıralıyor — `candidate.riskLevel` ve
`candidate.estimatedMs` kullanarak. Ve `estimatedMs`'in yorumu açıkça **"the
planner's own estimate"** diyor.

Yani **en hızlı ve en az riskli olduğunu iddia eden strateji kazanıyor ve iddia
hiç test edilmiyor. Öngören kendi ödevini notlandırıyor.**

Bu, FAZ 19'un yasakladığı cümlenin **fazladan adımlı hali:** planner'ın tercih
ettiği yaklaşım, aynı zamanda **iyi sayıları alan** yaklaşım.

### Beş kural

1. **Sıralama yalnızca ölçülmüş sonuçları kullanıyor.** Bir stratejinin kendi
   `estimatedMs` ve `riskLevel`'ı sıralamada **hiç görünmüyor** ve bir test tahminin
   sonuca **hiç sızmadığını** doğruluyor.
2. **Çalışmayan bir strateji `not-run`, asla sonuncu değil.** Çalışmamış bir
   stratejiyi alanın en kötüsü diye sıralamak **kimsenin gözlemlemediği bir
   performansı uydurmak** olur. Eksik bir sonuç, çalışmamış bir sonuçla aynı
   tutuluyor, yani **dörtlü bir alan tek bir eksikle sessizce üçlü olmuyor.**
3. **Doğrulanmış, ölçülmüş sonucu olan ikiden az strateji ⇒ sıralama yok**,
   `comparable: false`. FAZ 7'nin tek yarışmacılı coding arena'sına uyguladığı
   kural: **tek bir sonuç bir karşılaştırma değildir.**
4. **Beraberlik beraberliktir**, place 1'i paylaşır ve kazanan olmaz; bir test aynı
   iki stratejiyi **ters sırada** önererek beraberliğin **öneri sırasıyla
   bozulmadığını** kanıtlıyor.
5. **Doğrulanmamış bir sonuç kazanamaz.** Kimsenin kontrol etmediği bir çıktı
   üreten bir strateji **kazanmadı; kontrol edilmemiş çıktı üretti.** Bu, FAZ
   18'in noktasının arena'ya varması — **doğrulama olmadan generation'ın
   sıralayacak bir şeyi yoktur.**

`isArenaDecisive`, tek bir kazanan olmadığında false. **Tek bir ölçülmüş stratejiyi
bir yarışı kazanmış gibi ele almak, "her zaman benim yöntemim"in bir skor
tablosu giyerek geri dönme şeklidir.**

13 test, ratchet ile kanıtlı: doğrulanmamış bir çalıştırmanın kazanmasına izin
vermek **ikisini** düşürüyor.

**Taşıyıcı test ilki:** "aurora-native" `riskLevel: low` ve `estimatedMs: 100`
beyan ediyor, sonra rakibinin 900ms'sine karşı **9000ms ölçüyor** ve **kaybediyor.**
Yalnızca dürüst girdileri kullanan bir test paketi **bunu göstermezdi.**

### Kendi test hatam

Bir testte bir düzenleme artığı bıraktım: `"not a field of three".replace("not a
field of three", "did not run")` — yani uzun yoldan yazılmış `toContain("did not
run")`. **Geçti**, ve geçmek **niyetin açık bir ifadesi olmakla aynı şey değil.**
Temizlendi.

### İki takip edilen doküman değişti — kontrol edildi

`KNOWN_GAPS.md` ve `MATURITY_MATRIX.md` bu commit'te değişti. İkisi de
`npm run docs:state -w @haf/eval` tarafından üretiliyor ve **"do not edit by
hand"** yazıyor; ikisinde de tek değişiklik **tarih damgasının bugüne kayması.**
**Bu varsayılmadı, `git diff` ile kontrol edildi.**

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**331 dosya / 2617 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**526 → 528**.

**FAZ 19 için açık kalan:** `raceStrategies`'i **hiçbir şey çağırmıyor.** Gerçek
bir yarış yürütmek **bir model gerektiriyor** ve burada hiçbir model çalışmıyor —
yani mekanizma kurulmuş ve test edilebilir, ama **üreteceği sayılar bu sandbox'ta
üretilemez.** Bu, FAZ 7'nin rakip coding agent'ları için kaydettiği sınırın aynısı
ve **uydurma zamanlamalarla doldurulmak yerine kaydedildi.**


---

### FAZ 20 — Model Arena 🟡 (1/3 kapandı)

FAZ 20 modeller arasında **Task Type, Difficulty, Latency, Cost, Success,
Reliability ve Privacy** ile seçim istiyor.

**Önce ölçüldü ve çoğu var.** `models/` 24 dosya — dokuz provider, bir OAuth
yöneticisi, bir credential pool, provider profilleri, bir stage-model policy.
`routing/model-routing.ts` (601 satır) `AdaptiveModelRouter`, `BenchmarkRunner`,
`ModelComparator` ve `ModelRoutingPipeline` içeriyor ve
`accuracy * 0.6 + latency * 0.2 + cost * 0.2` ile skorluyor.

**Privacy zaten dürüst ele alınmış:** `ModelProviderRegistry` provider başına
locality beyan ediyor ve **beyan edilmemiş bir provider'ı cloud varsayıyor** —
çünkü bir privacy kısıtı için bilinmeyen hakkında güvenli varsayım, **verinin
cihazdan çıkacağı** yönünde.

### Eksik olan boyut reliability

Ölçüm tartışmasız: bu kelime `routing/` ve `models/` altında **sıfır** dosyada
geçiyor. `ModelProfile` `accuracy: number // 0-1` taşıyor — **tek bir beyan edilen
rakam** — yanında beyan edilen `latencyMs` ve `costPerToken`.

### Reliability accuracy değildir

İkisini birleştirmek, **üretimde en çok önemli olan başarısızlık modunu gizler.**

Bir model **tamamladığı her istekte mükemmel** olabilir ve yine de **kötü bir
seçim** olabilir — çünkü isteklerin yarısında timeout oluyor, reddediyor ya da
bozuk biçimli çıktı döndürüyor.

**Beyan edilen accuracy'ye göre skorlayan bir router o modeli sonsuza dek seçmeye
devam eder**, çünkü **her başarılı çalıştırma, seçilmesine sebep olan rakamı
doğruluyor.** Ölçülmeyen şey, görünmüyor.

**1/3 (`6250c20`)** — beş kural:

1. **Reliability gözlemlenen çalıştırmalardan ölçülüyor, asla beyan edilmiyor.**
   Bir profil kendi reliability'sini beyan edemez — FAZ 19'un arena'sının bir
   stratejinin kendi tahminine göre sıralayamamasının aynı sebebi.
2. **Hata veren, timeout olan ya da kullanılamaz çıktı döndüren bir çalıştırma
   reliability'ye karşı sayılıyor.** Bunlar yanlış cevap değil, **bir cevabın
   yokluğu** — ve çağıranın reliability olarak deneyimlediği şey bu.
3. **Çok az çalıştırma `insufficient-sample` veriyor ve bu güvenilir
   okunmamalı.** Baştan çıkarıcı varsayılan — *başarısızlık gözlenmedi, o halde
   güvenilir* — **hiç denenmemiş bir model için tam olarak ters**, ve `detail`
   bunu söylüyor.
4. **Reliability her zaman paydasıyla raporlanıyor.**
5. **Beyan edilen accuracy ile ölçülen reliability ayrı olgular olarak
   raporlanıyor**, fark 0.2'yi aştığında adlandırılarak. İkisini birleştirmek,
   **cevap verdiğinde haklı olan bir modelin, cevap vermemesine tahammül
   edemeyen bir iş için seçilme şeklidir.**

`minRuns` varsayılanı 10, FAZ 15'in precision tabanıyla aynı.
`isReliabilityActionable`, `insufficient-sample` için false: **onu路由 üzerinde
kullanmak, hiç denenmemiş bir modeli ölçülmüş olana tercih etmek** olurdu — ki bu,
bir reliability boyutunun var olmasının engellemek için olduğu davranış.

10 test, ratchet ile kanıtlı: ölçülmemiş bir modeli ölçülmüş saymak **üçünü**
düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**332 dosya / 2627 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**528 → 531**.

**FAZ 20 için açık kalan:** `AdaptiveModelRouter` **hâlâ beyan edilen profille
skorluyor**, yani reliability ölçülüyor ama **henüz routing kararında bir terim
değil** — ve hiçbir şey gerçek çağrılardan `ModelRunRecord` kaydetmiyor, çünkü bu
sandbox'ta **hiçbir model çalışmıyor.**

Reliability'yi **bir çalıştırma kaynağı olmadan** skora eklemek, routing'i **her
zaman boş olan bir sayıya** bağımlı yapardı — ki bu, **o boyuta hiç sahip
olmamaktan daha kötü.**


---

### FAZ 21 — Memory 2.0 🟡 (1/3 kapandı — kullanıcının açık kısıtı)

FAZ 21 üç şey istiyor: mevcut memory'yi kaldırmadan
`Memory → Recall → Belief → Decision → Action → Outcome → Updated Memory`
dönüşümü; memory'nin *"geçmiş deneyim bugünkü kararımı nasıl değiştirmeli"*
sorusunu da cevaplaması; ve **`NeuralMemoryFusion` / `NeuralCognitiveCore`: ya
gerçek learned mekanizma ya isimler dürüstleştirilsin.**

Üçüncüsü **kullanıcının baştan beri tekrarladığı açık kısıt.**

### Teşhis zaten dosyadaydı — ama iki seçenek de yapılmamıştı

`experimental/maturity.ts` **bu kısıtı modül yorumu olarak zaten kodlamış:**

> *"NeuralCognitiveCore, CounterfactualSimulator gibi isimleri ancak
> implementasyon isimlerinin vaat ettiği seviyeye geldiğinde 'gerçek' olarak sun."*

Ve iki modülü de **tam olarak** kaydetmiş, iki seçeneği adlandırarak. Bunu
girdiye güvenmek yerine **grep ile doğruladım:** train, gradient, backprop, epoch
ve learn **iki dosyada da sıfır** kez geçiyor.

- `neural-memory-fusion`: keyword hash'i üzerinde `Math.sin` ile 64 boyutlu hash
  vektörleri, cosine similarity, Jaccard keyword overlap. **Gerçek, yararlı bir
  retrieval — ama içinde hiçbir ağ, eğitim ya da öğrenilmiş ağırlık yok.**
- `neural-cognitive-core`: activation sayaçları ve snapshot'ları olan kalıcı bir
  pattern registry. **`Neuron` ve `Connection` arayüzleri bias/activation/weight
  alanları taşıyor — ismi inandırıcı kılan şey buydu — ama hiçbir şey bir
  ağırlığı güncellemiyor**, yani graf **ağ şeklinde statik bir veri yapısı.**

Yani **teşhis vardı, iki seçenek de alınmamıştı.**

### Alınan seçenek: yeniden adlandırma

Diğer seçenek **bir model gerektiriyor** ve bu sandbox'ta hiçbir model çalışmıyor:

- `NeuralMemoryFusionService` → **`VectorMemoryFusionService`**
- `NeuralCognitiveCoreService` → **`CognitivePatternRegistryService`**

Dosyalar `git mv` ile yeniden adlandırıldı — **çünkü bir yol da bir isimdir.** Her
dosya artık **ne olduğu ve ne olmadığıyla** açılıyor. Eski sınıf isimleri
**deprecated alias** olarak export edilmeye devam ediyor; bunlar **alias, ikinci
bir implementasyon değil.**

Meta-controller'ın alt sistem etiketleri de onlarla değişti. **Yapmadan önce
kontrol ettim:** `ALL_SUBSYSTEMS` yalnızca taze state'i tohumlamak ve saymak için
kullanılıyor, **kalıcı kayıtlarla isim üzerinden çapraz referans yok**, yani
hiçbir mevcut health kaydı yetim kalmıyor.

### Bilerek değiştirilmeyen şey

`engine.neuralMemoryFusion` / `engine.neuralCognitiveCore` property'leri ve
**`/v1/neural-fusion/*` ile `/v1/neural-core/*` HTTP route'ları.**

Bunlar `docs/openapi.yaml`'da sabitlenmiş **public API yüzeyi** ve yeniden
adlandırmak **kırıcı bir değişiklik** + registration ratchet maliyeti. İki
maturity girdisi de bunu `gapToStable`' içinde söylüyor.

**Sınıf ismi mekanizma hakkında bir iddiaydı; route yolu bir uyumluluk
sözleşmesi.** Bunlar farklı şeyler ve birincisi dürüstleştirildi.

### Maturity girdileri ne diyor

Her ikisi de **isim boşluğunun kapandığını ve mekanizma boşluğunun
kapanmadığını** söylüyor — **çünkü kapanmadı.** Bir yeniden adlandırma ismi doğru
yapar; **mekanizmayı öğrenmiş yapmaz** ve girdiler bunu ima etselerdi yalan
söylemiş olurlardı.

### Bir ratchet bunu yakaladı ve yakalamakta haklıydı

Test dosyasını yeniden adlandırmak **`T9-nondeterminism-inventory`'yi kırdı** — bu
kontrol `Math.random`/`Date.now` kullanan testleri **dosya adıyla** allowlist'liyor.

Düzeltme, allowlist girdisini yeni yola taşımaktı — **bir ekleme değil, bir
yeniden adlandırma**, yani **liste boyutu değişmedi** ve daha önce izin verilmeyen
bir şeye sessizce izin verilmedi.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**332 dosya / 2627 case / 30 modül** · drift **4/4** · maturity-registry
**15/15** (kayıtlı her modül yolunun diskte var olduğunu kontrol eden test dahil) ·
yeniden adlandırılmış servisin kendi **15 testi** · t7 **531'de değişmedi** —
**iki servis de hiçbir zaman `index.ts`'ten export edilmiyordu**, yani bu
yeniden adlandırma motor içinde ve API yüzeyine dokunmuyor.

### Bir araç notu

`maturity.ts`'i yamalamaya ilk girişimim **sıfır** kez eşleşti, çünkü aynı
oturumdaki daha önceki bir yama `module:` yollarını zaten yeniden yazmıştı.
**Assert herhangi bir yazımdan önce düştü**, yani hiçbir şey değişmedi ve ardından
gelen yeşil typecheck **değişmemiş dosyanın** sonucuydu. Gerçek metni yeniden
ölçtüm ve sonra yamaladım.

**FAZ 21 için açık kalan:** recall → belief → decision → outcome → updated memory
döngüsü, ve iki yeniden adlandırmanın **mekanizma yarı** — ki bu bir model
gerektiriyor.


---

### FAZ 22 — World Model 2.0 🟡 (1/3 kapandı)

FAZ 22 mevcut `predict/act/observe/compare/surprise/calibrate`'i koruyor ve şunları
ekliyor: structured state, causal relations, **learned transition**, uncertainty,
counterfactual.

**Önce ölçüldü.** `world/` dört dosyada **1965 satır** ve beş eklemeden **dördü
zaten var:** structured state (`upsertEntity`, `recordState`, `stateAt`,
`temporalView` — 36 geçiş), causal relations (`assertCausality`,
`recordCausalObservation`, `causalLinks` — 19), uncertainty (16), counterfactual
(4). Surprise 42 kez geçiyor. **"transition" sıfır kez.**

### Eksik olan, aynı zamanda "learned" denen

Bu, dikkatli olunması gereken yerdi — **FAZ 21 az önce, öğrenme yapmadığı halde
öğrenme vaat eden iki modülü yeniden adlandırmıştı.**

Bu fazın kurulabilir olup olmadığına karar veren ölçüm
`recordCausalObservation` ve **kararı veriyor:** confirmations ve refutations'ı
artırıyor, confidence'ı **Laplace-yumuşatılmış `(c+1)/(total+2)`** olarak yeniden
hesaplıyor ve strength'i ayarlıyor.

**Bu veriden gerçek öğrenme.** Neural değil, istatistiksel — ve **çalışıyor.**

Yani **learned transition modeli burada bir model sunucusu olmadan kurulabilir:**
gözlenen geçişleri say ve ima ettikleri dağılımı raporla.

### Beş kural

1. **Bir geçiş olasılığı yalnızca gözlenen geçişlerden geliyor.** API'de hiçbir
   şey çağıranın verdiği bir olasılığı kabul etmiyor.
2. **Gözlenmemiş bir (state, action) çifti hiç tahmin vermiyor — olasılık sıfır
   değil.** Sıfır, *"bu hiçbir yere çıkmaz"* iddiası olurdu, ki bu **dünya
   hakkında bir ifade**; yokluk ise **kayıt hakkında bir ifade.** Bu, FAZ 12, 14
   ve 20'nin kodladığı kuralın world-model sürümü.
3. **Çok az gözlem `insufficient-sample` veriyor**, bir olasılık değil. **Bir kez
   görülen bir geçiş bir anekdottur** ve onu %100 diye raporlamak, bir world
   modelin **kendinden emin şekilde yanlış olma** şeklidir. Kendi kendisiyle
   zaten anlaşmazlığa düşen küçük bir örneklem bunu `detail`'da söylüyor.
4. **Her tahmin örneklem büyüklüğünü ve tam dağılımını taşıyor**, yani
   deterministik olmayan bir sonuç **moduna indirgenmek yerine görünür.**
5. **Model bir frekans modeli olduğunu söylüyor** — neural bir transition
   function değil ve **görmediği state'lere genellemiyor.** Bunu doğuşta söylemek,
   sonra yeniden adlandırmaktan ucuz — **FAZ 21'in dersi tekrarlanmak yerine
   uygulanıyor.**

`minObservations` düşürülebilir ama **1'de kıstırılıyor:** sıfır gözlem üzerinde
bir olasılık daha düşük bir çıta değil, **çıtanın yokluğu.**
`isPredictionActionable` hem `unobserved` hem `insufficient-sample` için false —
ikisine karşı plan yapmak, world modelin **kanıtı olmayan bir şeyi iddia etmesi**
demek, ki bu tam olarak predict/observe/compare döngüsünün yakalamak için var
olduğu şey.

Model **verilen gözlemlerden kuruluyor**, bir store'a sahip değil — yani **kendi
kanıtından sapamaz.** Bir test ayrıca yalnızca boşlukla farklılaşan state'lerin
ayrı kaldığını sabitliyor: **kayıt kayıttır** ve sessizce kırpmak çağıranın farklı
yazdığı iki state'i birleştirirdi.

11 test, ratchet ile kanıtlı: gözlenmemiş bir çift için olasılık 0 döndürmek
**ikisini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**333 dosya / 2638 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**531 → 534**.

**FAZ 22 için açık kalan:** bu modele **henüz hiçbir şey gerçek geçiş
beslemiyor** — `WorldModelService` olayları ve state'leri kaydediyor ama
**(state, action, next-state) üçlüleri üretmiyor**, yani modelin bir kaynağı yok.

Bunu bağlamak, **adımları tipli ama action-etiketli olmayan bir sistemde neyin bir
action sayıldığını** kararlaştırmak demek — ve tahmin edilmek yerine kaydedildi.


---

### FAZ 23 — Digital Twin'i gerçek yap 🟡 (1/3 kapandı)

FAZ 23 User, Projects, Devices, Tasks, Calendar, Goals, Resources ve Constraints'i
tek state modelinde istiyor, ve üç sorunun simüle edilebilmesini:
*"Bu haftaki görev yüküm nasıl?"*, *"Gecikme riski nerede?"*,
*"Bu kararı alırsam gelecek hafta ne değişir?"*

**Önce ölçüldü.** `digital-twin-service.ts` **346 satır** ve her metod
add/get/update/record. `sync()` zaten, **hiçbir şeyle temas etmeyen bir sync için
`{ synced: true }` döndürmek yerine throw ediyor.** `maturity.ts` modülü
`experimental` olarak kaydetmiş ve boşluğu tam adlandırmış:
*"Maintains a mirrored state record; no simulation loop."*

### State modelinde ne var, ne yok

Var: **User, Projects, Tools, Workflows, Constraints.**
Yok: **Tasks, Calendar, Goals, Resources, Devices.**

**Bu alanlar eklenmedi.** Eklemek kolay ve **boş olurlardı** — ve **boş bir alan,
modellenmemiş bir kavramın modellendiği gibi okunur.** Kaydedildi.

### Üç soru aynı türden şeyler değil

Onları **tek bir sesle** cevaplamak, **bir tahminin aritmetik gibi görünmesinin
yolu.** Bu yüzden her cevap **türünü** taşıyor:

| Soru | Tür | Ne yapıyor |
|---|---|---|
| *"görev yüküm nasıl"* | **`sum`** | `WorkflowStep.estimatedMinutes` toplamı — **topladığı satırlar ekli**, ki sayı **onaylanmak yerine denetlenebilsin** |
| *"gecikme riski nerede"* | **`threshold`** | Her deadline'ın **tarihinden**, **verilen bir `now`'a karşı** hesaplanıyor |
| *"bu kararı alırsam"* | **`counterfactual`**, `simulated: false` | **Bugün daima.** |

İlk ikisi twin'in zaten sakladığı veriden hesaplanabilir. **Üçüncüsü değil** — ve
dürüst cevabın makul olandan ayrıldığı yer burası: bir counterfactual bir
**transition modeli** gerektirir, **FAZ 22 bir tane kurdu**, ve **hiçbir şey onun
için `(state, action, next-state)` geçişleri gözlemiyor.** Onları uydurmak,
**simülasyon kıyafeti giymiş bir tahmin** olurdu.

### Gecikme-riski kuralı sahip olmaya değer bir şey buldu

Her `Deadline` **beyan edilen bir status** taşıyor — `upcoming`, `at_risk`,
`overdue`, `met` — ve **hiçbir şey onu tarihe karşı kontrol etmiyordu.**

Artık risk **tarihten hesaplanıyor** ve beyan edilen status çeliştiğinde
**çelişki raporlanıyor, iki taraftan biri lehine sessizce çözülmüyor:**

- **Dokuz gün önce `"met"` ilan edilmiş bir deadline** → **overdue + iliştirilmiş çelişki**
- **Aralık'ta `"at_risk"` ilan edilmiş bir deadline** → **on-track + iliştirilmiş çelişki**

**Anlaşma sessiz; yüzeye çıkan şey anlaşmazlık.**

**Ayrıştırılamayan bir tarih en kötü durum olarak raporlanıyor** ve parse hatası
adlandırılıyor, **asla on-track olarak değil** — **değerlendirilemeyen bir kayıt,
güvenli bir kayıt değildir.**

### `digital-twin` experimental kaldı

Maturity girdisi bütün bunları söyleyecek şekilde güncellendi ve **seviyesi
`experimental` kaldı:** **üç sorudan ikisinin aritmetik olması bir simülasyon
döngüsü değildir**, yani **isim hâlâ dürüst değil** ve girdi öyle diyor.

10 test, ratchet ile kanıtlı: beyan edilen status'u yetkili kılmak **ikisini**
düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**334 dosya / 2648 case / 30 modül** · drift **4/4** · maturity-registry
**15/15** (`digital-twin` hâlâ experimental olarak sabitlenmiş) · t7 **4/4**,
pin **534 → 538**.

**FAZ 23 için açık kalan:** state modelinin eksik varlıkları, ve
counterfactual'ı **bir red yerine bir simülasyona** çevirecek geçiş kaynağı.


---

### FAZ 24 — Federated / Distributed Aurora 🟡 (1/3 kapandı — ve bir çelişki)

FAZ 24 `task → node selection → remote execution → result → verification` istiyor ve
**fazın kendi metni "İlk aşamada yapma" diyor.**

⚠️ **Bu, "sırayla devam et, tüm fazları tamamla" talimatınla doğrudan çelişiyor.**
Kararı ben vermedim, ikisini de uyguladım: **zinciri kurmadım** (fazın dediği gibi),
ama **kurulabilir olan tek halkayı ölçtüm ve kapattım.**

### Neden zincirin geri kalanı kurulmadı

- **remote execution** — **tek makine, peer node yok, üçüncü taraflara ağ yok.**
  `runInference` zaten placeholder döndürmek yerine **throw ediyor.**
- **gradient exchange** — **çalışan bir model gerek.**

`maturity.ts` bunu zaten dürüstçe kaydetmiş: *"Node registry and round
bookkeeping; no gradient exchange."* **`federated` experimental kaldı.**

### Ama ikinci halka ölçülebilirdi — ve ölçülünce 3 kusur çıktı

`FederatedService.selectNode`:

```ts
nodes.find(n => n.status === "online" && n.models.includes(modelId))
  ?? nodes.find(n => n.status === "online")
```

1. **Fallback modeli olmayan HERHANGİ bir online node'u döndürüyor.** Bu, *"hiçbir
   node bunu çalıştıramaz"* cevabını *"bu node başarısız olacak"*a çeviriyor — ki bu
   **daha kötü bir cevap, çünkü bir seçim gibi görünüyor.**
2. **`capabilities` hiç sorgulanmıyor.** `NodeCapabilities` cpu, memory, gpu,
   storage, network ve `supportedFormats` beyan ediyor ve **1 MB boş alanı olan bir
   node, 64 GB'ı olanla aynı şekilde seçiliyor.**
3. **`registerNode` kayıt anında `status: "online"` yazıyor, `lastHeartbeat`
   undefined.** `heartbeat()` `lastHeartbeat`'in **tek yazarı** — yani **kayıt
   edilip bir daha temas edilmemiş bir node sonsuza dek online** ve `selectNode`
   buna güveniyor.

**Kusur 3, bu projenin tekrarlayan kusurunun federated biçimi:** bir kez beyan
edilen bir status, **sürekli yapılan bir ölçüm gibi** ele alınıyor. **FAZ 23 aynı
şekli bir `Deadline.status`'ta buldu; FAZ 20 bir `ModelProfile.accuracy`'de.**

### Beş kural

1. **Modeli olmayan bir node aday değildir.** Gereksinimi sessizce genişleten bir
   fallback **yok.**
2. **`status: "online"` kayıt anında yapılan bir iddia**, temas kanıtı değil.
   Heartbeat yoksa ya da **belirtilen pencereden** eskiyse seçilemez — pencere bir
   **varsayım değil, adlandırılmış sabit.**
3. **Beyan edilen yetenekler birer iddiadır**, bu yüzden modelin gerçekte
   gerektirdiğine karşı kontrol ediliyor: boyut ↔ boş storage (**%25 pay**),
   memory ↔ boyut, `supportedFormats` ↔ modelin formatı. **Bir red, kısıtı
   adlandırıyor.**
4. **Hiçbir şey seçmemek geçerli ve raporlanabilir bir sonuç.** `no-suitable-node`
   **değerlendirilen her node için gerekçe** taşıyor ve **boş kalmamak için yanlış
   bir node seçmiyor**; boş bir registry **boş bir registry olarak** raporlanıyor.
5. **Bu yalnızca seçim.** Burada hiçbir şey uzaktan çalışmıyor ve cevap **hiçbir
   result/output alanı taşımıyor.**

Uygun node'lar arasında **en çok beyan edilen boş storage'a sahip olan** tercih
ediliyor. Beyan edilen bir sayı hâlâ bir iddia, ama **daha büyük iddiayı tercih
etmenin maliyeti yok** ve hiç sıralamamak **mevcut tek sinyali çöpe atmak** olurdu.

15 test **kusurları yeniden üretiyor**, yalnızca düzeltmeyi sabitlemiyor: eski
fallback geri konunca **dördü** düşüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**335 dosya / 2663 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**538 → 542**.

**FAZ 24'ün geri kalanı planın bıraktığı gibi:** node kaydı ve heartbeat var, remote
execution bu sandbox'ta olmayan peer'lar gerektiriyor, gradient exchange bir model
gerektiriyor. **Hiçbiri uydurulmadı.**


---

### FAZ 25 — Gerçek Production State 🟡 (1/3 kapandı)

FAZ 25 `Postgres + NATS + Event Store + Snapshot + Lease + Worker`'ı backbone
yapmak istiyor; JSON yalnız config / local cache / export için.

**Önce ölçüldü — ve altısının da hepsi zaten var:**
`persistence/{event-store, snapshot-store, session-lease, command-journal,
effect-journal, production-persistence}.ts` (**1994 satır**) + `persistence/postgres/*`
+ `transport/nats/nats-transport.ts`.

Yani soru **"ne var"** değil, **belirli bir dağıtımın hangisinde çalıştığı** — ve
**bunu cevaplayan hiçbir şey yoktu.** `engine.ts` `FileEventStore`'u ve beş
Postgres store'unun hepsini **yan yana** import ediyor ve **hiçbir tek yer hangi
modda olduğunu söylemiyordu.**

Motor bir yerde zaten dürüst — `schedulerLease` doküman yorumu file-based lease'in
*"owner'ın pid'inden canlılık çıkardığını, bunun bir sezgi olduğunu; pid'i sonradan
yeniden kullanılmış çökmüş bir process'in bıraktığı lock dosyasının canlı
görüneceğini ve scheduler'ın hiç başlamayacağını"* söylüyor.

**Bu doğru türde bir ifade — ve tek bir option'ın yorumuna gömülü.** Bu commit onu
**bir operatörün okuyabileceği tek bir yere** koyuyor.

### Beş kural

1. **Hazırlık, bağlı olduğu beyan edilen şeyden değerlendiriliyor** ve değerlendirme
   **bunun ne olduğunu söylüyor** — çalışan bir sistemin probu değil ve öyle olduğunu
   iddia etmiyor.
2. **File-backed bir store `file-backed` olarak raporlanıyor, asla "configured"
   olarak değil.** Bir JSON store'u karşılanmış bir gereksinim saymak, **FAZ 25'in
   sorununu çözüm olarak yeniden ifade etmek** olurdu.
3. **Ne connection string ne pool taşıyan bir beyan edilmiş veritabanı
   `unconnected`'tır, bağlı değil.** Her iki alan da `PostgresDatabaseOptions`'ta
   **opsiyonel**, yani tamamen boş bir options nesnesi erişilebilir ve aksi halde
   **bir Postgres dağıtımı gibi okunurdu.**
4. **Karar, dağıtımı backbone'dan alıkoyan HER bileşeni adlandırıyor.** Çıplak bir
   *"not-production-backbone"* bir operatöre **üzerinde çalışacak hiçbir şey
   söylemez.**
5. **Bu bir değerlendirme, bir migrasyon değil.** Hiçbir şeye bağlanmıyor ve **yeşil
   bir değerlendirme file-backed bir dağıtımı production yapmaz.**

**Var olmayan bir bileşen `absent` olarak değerlendiriliyor**, karşılanmış
varsayılmıyor — snapshot'lardan hiç söz etmeyen bir dağıtımın **snapshot store'u
yoktur** ve bu ihmali sorun saymamak, **bir backbone gereksiniminin sessizce
gereksinim olmaktan çıkma** şeklidir. Her yokluk **maliyetini söylüyor:** snapshot
yoksa **her restore bütün log'u yeniden oynatır**; lease yoksa **iki runtime'ın aynı
scheduler'ı çalıştırmasını hiçbir şey durdurmaz.**

11 test, ratchet ile kanıtlı: file-backed store'ları backbone saymak **üçünü**
düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** · `docs:state`
**336 dosya / 2674 case / 30 modül** · drift **4/4** · t7 **4/4**, pin
**542 → 544**.

### Bir ölçüm notu

İlk grep'im **altı bileşenin hepsi için 0 dosya** döndürdü. Sebep benim hatamdı:
`-E` ile ayrım `|`'dir, `\|` değil — yani literal olarak `event-store\|EventStore`
aramıştım. **Doğru ölçünce 16/49/42/4/14/18 dosya çıktı.** Yanlış bir 0, yanlış bir
faz teşhisi demekti.

**FAZ 25 için açık kalan:** `assessBackboneReadiness`'i **hiçbir şey çağırmıyor** ve
motor boot'ta kendi modunu raporlamıyor. Bunu bağlamak, **değerlendirmenin nerede
görüneceğini** seçmek demek — bir boot log satırı, bir health endpoint'i, ya da
ikisi — ve bu **tahmin edilmek yerine kaydedilen bir ürün kararı.**

**Bu commit hiçbir dağıtımı migrate etmedi.** Sandbox'ta PostgreSQL 17.11 olması
bunu değiştirmiyor: store'lar var ve kendi testleriyle çalıştırılıyor, ama bu commit
**yalnızca soruyu cevaplanabilir yapıyor.**


---

### FAZ 26 — Engine parçalama 🟡 (1/3 kapandı — planın son fazı)

FAZ 26 `engine.ts`'i ~5.5K satır diye sekiz composition'a bölmek istiyor, **sonra
"Şimdi sırf güzel dursun diye yapma" diyor.**

Yani bu faz **bölme talimatı değil** — **yalnızca gerçek bir sebep varsa bölme
talimatı.** Bu commit o sebebin olup olmadığını ölçüyor.

### Ölçüm

| Bölge | Satır |
|---|---|
| toplam | **5584** |
| import + re-export (**249 import**) | ~689 |
| `EngineConfig` + doc (sınıf 690'da açılıyor) | ~235 |
| **constructor (925..2526)** | **1602** |
| 36 metod | 3058 |

**Belirleyici sayı constructor.** Sınıfın **1602 satırı davranış değil, kablolama** —
sınıfın geri kalanının kullandığı servisleri kuruyor.

**Planın sekiz kategorisi boyunca bir bölme metodları taşır ve metod-düzeyi bir
bölme constructor'a hiç dokunmaz.** Dosyadaki en büyük tek blok refactor'dan
**değişmeden çıkardı** ve dosya yine büyük olurdu.

Ve **kablolama, coupling'in gerçekte yaşadığı yer:** sekiz composition'ın her biri
diğerlerinin de gerektirdiği servisleri istiyor, yani bir bölme **ya kurulumu
çoğaltır ya da kurulumu sahiplenen ve her composition'a bağımlılıklarını veren bir
container getirir.** O container **dosyayı bölmekten daha büyük bir değişiklik** ve
**onu bir dosyayı küçültmek için kurmak, fazın yasakladığı kozmetik iş.**

### Beş kural

1. **Satır sayısı asla bir gerekçe değildir.** Önemli olan sorumlulukların **hiç
   ayrılıp ayrılamayacağı** ve bu ölçülüyor.
2. **Dosyadaki en büyük blok constructor** ve metod-düzeyi bir bölme onu
   küçültmüyor. **Metodları taşıyarak dosyanın boyutunu düzelttiğini iddia eden
   her öneri, başka bir dosyayı tarif ediyor.**
3. **Composition'lar arası coupling ölçülüyor** ve başka bir composition'ın
   servislerine uzanan bir composition **bölmenin ödeyeceği maliyet** olarak
   raporlanıyor.
4. **Kozmetik bir bölme, ölçümle reddediliyor** — bir görüşle değil.
5. **Hiçbir şey taşınmıyor.** Raporluyor; refactor yapmıyor.

### `'justified'` diye bir durum yok — ve bunu bulmak işin yararlı kısmıydı

İlk sürümümde vardı ve **test çelişkiyi ortaya çıkardı:** kural 1 yüksek coupling'in
bölünmeyi gerekçelendirdiğini söylerken, kural 3 yüksek coupling'i **bölmenin
maliyeti** olarak raporluyordu.

**İkisi de yarı yarıya haklıydı:**

- **Düşük coupling** → dosya dolanmamış → **kod taşımak hiçbir şeyi ayırmaz**
- **Yüksek coupling** → dolanmış → **ama çözüm bir container, dosya bölme değil**

Yani `SplitVerdict = "cosmetic" | "entangled-needs-container"` — **ikisi de
bölünmeyi belirtildiği şekliyle reddediyor, farklı sebeplerle.**

Yapısal gerçekler **test sırasında `engine.ts`'ten okunuyor**, elle yazılmıyor — yani
ölçüm **yüksek sesle bayatlıyor:** test constructor'ın sonunu bulmak için süslü
parantezleri yürütüyor ve dosya şekil değiştirirse düşüyor.

9 test, ratchet ile kanıtlı: satır sayısını yeterli saymak **birini** düşürüyor.

**Kapılar.** engine tsc **0** · repo typecheck **0** · build **0** · `npm test`
exit **0** / **0 FAIL** · hygiene **"all ratchets hold"** (engine.ts 5585'te
dokunulmadı) · `docs:state` **337 dosya / 2683 case / 30 modül** · drift **4/4** ·
t7 **4/4**, pin **544 → 547**.

**Bu commit hiçbir dosyayı bölmedi.** Bölme istenirse, denetim önce ne gerektiğini
söylüyor: **kurulumu sahiplenen bir container, sonra composition'lar.**


---

## Boşluk kapatma geçişi — FAZ 9–26 arası, kodla kapanabilenler

Plan bittikten sonra, açık kalan kalemlerden **kodla kapanabilenler** ölçülüp
kapatıldı. Ölçüm başlangıcı: `decideToolTrust`, `assessBackboneReadiness`,
`assessEngineSplit`, `raceStrategies`, `recordModelRun`, `evaluateExpertWork` —
**hepsinin dış kullanımı sıfırdı.**

| # | Boşluk | Ne yapıldı | Commit |
|---|---|---|---|
| 1 | **FAZ 17** — keşfedilen bir araç **onaysız çağrılabiliyordu** (güvenlik boşluğu) | `callTool` artık RPC'den önce trust gate'e danışıyor; `callToolInteractive` de kapsanıyor (422'de delege ediyor) | `e19a83f` |
| 2 | **`CounterfactualSimulator`** — üçüncü sahte isim, ve **maturity'de hiç kaydı yoktu** | `ScenarioComparisonService` olarak yeniden adlandırıldı, kayıt eklendi, `recommend` girdilerinin beyan edildiğini söylüyor | `d59f612` |
| 3 | **FAZ 20** — `ModelRunRecord` kaydeden **hiçbir şey yoktu**, reliability atıldı | `ModelProviderRegistry`'de tek noktada kayıt; reliability artık ölçülebiliyor | `f7cc43b` |

### 1 — FAZ 17: gerçek bir güvenlik boşluğu

`callTool` `auroraText(input.name)`'den doğrudan `this.rpc("tools/call", params)`'a
gidiyordu. Yani **bir sunucunun bir aracı tanıtması, onu çağrılabilir yapıyordu** —
**keşif, yetkilendirme sayılıyordu.** FAZ 17'nin reddettiği tam olarak bu.

En güçlü test iddiası: **`tools/call` sunucuya hiç ulaşmıyor.** Bir red ancak çağrı
hiç gelmediyse kanıtlanmış olur.

### 2 — Üçüncü sahte isim

106 satır, **hiçbir şey simüle etmiyor**: senaryolar çağırandan geliyor, ağırlıklı
toplamla sıralanıyor, sonuç kalibre ediliyor. Ayrıca **FAZ 19'un kusuru** burada da
vardı: `recommend` **beyan edilen** alanlar üzerinde sıralıyor.

Neredeyse hata yapıyordum: `main.ts` `/v1/simulations` gösteriyordu ama **asıl
route'lar `routes/aurora-services.ts`'te `/v1/counterfactual/simulations`** ve
openapi'de sabitlenmiş. **İki route seti var** ve yalnızca birini ölçmek kırıcı bir
değişiklik üretirdi.

### 3 — FAZ 20: döngü kapandı

Tek darboğaz `ModelProviderRegistry.stream()` — en az 7 çağrı noktası buradan
geçiyor. `register()`'da sarmak **tek yer** ve her denemeyi **gerçekten hizmet eden
ya da başarısız olan provider'a** atfediyor.

Kilit vaka: **fallback ile kurtarılan başarısız bir provider yine kaydediliyor.**
Bu olmadan, **çalışan bir default'un arkasında hep başarısız olan bir model sonsuza
dek mükemmel güvenilir görünür** — FAZ 20'nin adlandırdığı kusurun fallback yolundan
gelen hali.

**Terk edilen bir çalıştırma sonuç olarak kaydedilmiyor** — çağıran erken durduğunda
model iyi bir cevap üretmek üzere olabilirdi. **Ayrı sayılıyor**, çünkü
*"çağıran çekip gitti"* modelin yaptığı bir şey değil.

### Kendi yanlış varsayımlarım (kod her seferinde haklıydı)

- `carriesContent` boş string'li bir `"text"` event'ini içerik sayıyordu — **gerçek
  kusur, düzeltildi** (boş bir tamamlanma `usable` görünecekti)
- Fonksiyon `measureModelReliability`, alan `unusable`/`errors` — `failures` değil
- `parseModelRoute` **`:`** ile ayırıyor, `/` ile değil — `bad/m1` default'a
  gidiyordu. **İki kez tahmin ettim**, sonra tally'leri yazdıran bir prob yazdım ve
  **tek çalıştırmada** çözüldü

### 4 — FAZ 25: "kodla kapanmaz" demiştim, **yanlıştı** (`472efca`)

Geçen turda bunu *"değerlendirmenin nerede görüneceği bir ürün kararı"* diye
sınıflandırmıştım. **Ölçünce yanlış olduğu ortaya çıktı:** `/v1/system/health`
**zaten var** (`routes/aurora-services.ts:362`) ve `{ debugging, capabilities,
routing, costs }` döndürüyor. Bir alan eklemek **eklemeli ve kırıcı değil** — yani
**verilecek bir karar yoktu** ve boşluğu açık bırakmak için sebep yoktu.

`engine.backboneWiring()` `initialize()`'ın **gerçekte kurduğunu** raporluyor,
config'in ima ettiğini değil — **ve ikisi farklılaşıyor.** Worker koşulsuz
`absent`: **motorun hiç worker kavramı yok**, worker ayrı bir uygulama. İlk
sürümüm var olmayan bir `config.sessionWorker` alanı okuyordu — **uydurmak,
kimsenin denetleyemeyeceği bir sebeple hep "worker yok" diyen bir health cevabı
üretirdi.**

**İki şey ölçüldü, varsayılmadı:**
- `postgres: {}` **"unconnected" üretmiyor** — `PostgresDatabase` daha boot
  bitmeden **throw ediyor.** Kural el yapımı bir kablolama için hâlâ doğru ama
  **motor ona ulaşamıyor**, bu yüzden hiçbir test ulaşabildiğini iddia etmiyor.
- `initialize()` **gerçekten bağlanıyor** ve bu sandbox'ta **PostgreSQL yok**
  (`psql`/`pg_ctl` yok). Yani `backboneWiring()`'in Postgres dalının **boot edilmiş
  motor kapsamı yok** — test bunu yorumda söylüyor ve **sahte bir pool kapsam gibi
  görünürdü ve hiçbir şey kanıtlamazdı.**

**T5 size ratchet bunu yakaladı:** engine.ts **5585 → 5613**. Sınır iki sabitleme
dosyasında da gerekçesiyle yükseltildi.

### Sınıflandırma düzeltmesi — "kodla kapanmaz" listem fazla uzundu

FAZ 25'i yanlış sınıflandırdığımı bulduktan sonra kalanları aynı şüpheyle yeniden
ölçtüm:

| Boşluk | Önceki iddiam | Ölçüm |
|---|---|---|
| **FAZ 25** | "ürün kararı" | ❌ **yanlıştı** — `/v1/system/health` zaten var → **kapatıldı** |
| **FAZ 18** | "alan bilgisi gerekir" | ⚠️ **abartılı** — **yalnızca 1 uzman** kategori bildiriyor (`coding`) ve **hiç evaluator implementasyonu yok**, yani bu **alan bilgisi değil kod işi** (FAZ 6'nın `acceptCodeWork`'ü doğal aday) |
| **FAZ 26** | "ürün kararı" | ⚠️ FAZ 25'le aynı desen — bir geliştirici-yüzeyi var mı diye **sormadım** |
| **FAZ 16** | "ürün kararı" | ⚠️ doğal bir çağıran (gönderim sonrası doğrulama) **var olabilir** |
| **FAZ 19** | "model gerekir" | ✅ **doğru** — yarış çalıştırılacak bir şey olmadan kazanma/beraberlik üretemez |
| **route'lar** | "kırıcı API" | ✅ **doğru** — openapi ratchet maliyeti |

**Ders:** *"bu bir karar gerektiriyor"* demek, **önce o kararın verileceği bir
yüzeyin zaten var olup olmadığını ölçmekten** daha kolay. FAZ 25'te ölçmedim ve
yanıldım.

### Gerçekten kodla kapanamayanlar

- **FAZ 19** `raceStrategies` — gerçek bir yarış **çalıştırılacak bir model
  gerektiriyor**; kazanma/beraberlik/kaybetme sayıları uydurulamaz
- **`/v1/neural-*` ve `/v1/counterfactual/*` route'ları** — **kırıcı API**, openapi
  ratchet maliyeti
- **`CounterfactualSimulator` mekanizması** — gerçek bir counterfactual **bir dünya
  modeli** gerektiriyor
- **`backboneWiring()`'in Postgres dalı** — bu sandbox'ta **PostgreSQL kurulu
  değil**, boot edilmiş motorla kapsanamıyor



### FAZ 26 kapatıldı — `dc4c321` (2026-10-10)

`CURRENT_STATE.md` engine.ts'i canlı ölçüyor; **hiçbir dosya bölünmedi**.

### FAZ 16 kapatıldı — `edaa092` (2026-10-10)

`POST /v1/evolution/gaps/:gapId/resolve` eklendi; `resolved` artık erişilebilir.

### FAZ 18 kısmen kapatıldı — `fed3fe0` (2026-10-10)

`codingExpertEvaluator` yazıldı (FAZ 6'nın `acceptCodeWork`'ü üzerine, 10 test).
**Kalan:** `EvaluatorFabric` motorda kurulmuyor — `this.experts` hiç atanmıyor.

## V2 Adım 8 — Sembolik matematik: KAPANDI (`2b37f98`)

**Ölçüm.** `tarama/results.jsonl` içinden `math` alanı sorgulandı:
`sympy/sympy` — 31220★ · BSD-3 · 2026-10-09 · Py · planın önerdiği isim.

**Gate A'da düzeltilen bir hata.** Envanter taraması SymPy için
`licence "not identifiable by github"` demişti. Bu bir lisans sorunu değil,
otomatik tespit aracının sınırıydı. `raw.githubusercontent.com/.../LICENSE`
çekildi ve dosya **BSD-3-Clause** (a/b maddeleri + disclaimer) çıktı.
Dosyayı gerçekten açan biri ile açmayan biri arasındaki fark burada somut.

**Neden bu adım öncekilerden farklı.** Buraya kadar "verify" demek
"baytlar geri geldi ve parse ediliyor" demekti; bir web sayfası veya SQL
sorgusu için söylenebilecek tek şey buydu. Sembolik matematik daha fazlasını
kabul ediyor: bir çözüm denkleme geri konup **residual** incelenebilir; bir
türev, motorun kendi kurallarından bağımsız hesaplanan **merkezî fark
bölümü** ile karşılaştırılabilir. O yüzden bu capability yalnızca böyle bir
kontrol çalışıp onayladığında `verified` dönüyor.

**Ölçülen sonuçlar.** `solve(x**2-5*x+6)` → `[2, 3]`, residuals `[0, 0]` ·
`diff(sin(x)*x**2)` → `x**2*cos(x) + 2*x*sin(x)`, delta `0` ·
`integrate(1/x)` → `log(x)` · `factor(x**3-1)` → `(x-1)*(x**2+x+1)`.

**Tasarımı ölçüm belirledi, akıl yürütme değil.** İlk sürümde verifier,
hiçbir kontrolün ulaşamadığı cevaplar için `ok: false` dönüyordu —
"doğrulanmamış bir cevap onaylanmamalı" ilkesiyle. Broker'dan geçirilince
görülen şu: **`ok: false` çağrıyı throw ediyor ve sonucu çöpe atıyor.** Yani
`integrate("1/x")` bir hataya dönüşüyor ve çağıran `log(x)`'i hiç görmüyor.
Doğru cevapları çöpe atan bir verifier, çağıranlara onu bypass etmeyi
öğretir. Ayrım artık açık: verifier yalnızca **bağımsız kontrol
UYUŞMADIĞINDA** veya hiç cevap gelmediğinde başarısız; kontrol
uygulanamıyorsa cevap `unchecked: true` alanıyla birlikte dönüyor.
İlk bakışta zayıflama gibi; dürüstlük, çağıranın gerçekten tartabileceği
bir alana taşındı.

**Güvenlik.** Kapalı parse namespace + boş `__builtins__` + `parse_expr`
(`sympify` değil). `__import__("os").system("id")`,
`open("/etc/passwd").read()`, `eval('1+1')`,
`[c for c in ().__class__.__bases__]` → hepsi `NameError` ile reddedildi.

**Dürüst limitler.** Kanıt üreten bir backend değil — sadeleştirir ve çözer,
sertifika vermez. Sonuç SymPy'nin string formu, yapılandırılmış ifade ağacı
değil. Benchmark yok (Gate D açık). Kontrolün uygulanamadığı işlemlerde cevap
doğru olabilir ama sistem bunu **bilmediğini söylüyor** — ki bu, bilmediğini
söyleyebilen ilk capability.

**Kapılar:** 16/16 (gerçek SymPy 1.14.0) · typecheck 0 · `npm test` exit 0
ve 0 başarısız · hygiene "all ratchets hold" · `docs:state` 0.
Ratchet'lar: t7 export pinine 7 isim eklendi · `allowlistSize` 59→60 ·
`engine.ts` 5633→5641 (kayıt +8 satır, mantık değil).

## V2 Adım 9 — Belge çıkarma + ölçümle bulunan bir kusur: KAPANDI (`267b570`)

Planın ilk dalga maddesi 4 ("Documents: PDF türlerine göre route"). Bunu
yapmak için mevcut çıkarıcının gerçekte ne yaptığını ölçmek gerekti ve o
ölçüm **canlı bir kusur** buldu.

**Bulunan kusur.** `extractPdfText`'in docstring'i, PDF'de metin katmanı
yoksa "uydurmak yerine söyler" diyordu. Gerçek iki sayfalık bir tarama
üzerinde ölçüldüğünde: `extracted: true`, **7951 karakter decode edilmiş
görüntü baytı**, sebep alanı boş. `research-engine-service.ts` bunu bir
kaynağın içeriği olarak saklıyor, parmak izini hesaplıyor ve notu
"PDF text extracted" yazıyordu — üstelik gerçeği söyleyecek bir `else` dalı
**zaten vardı** ve bayrak yalan söylediği için hiç çalışmıyordu.

**Mekanizma.** Görsel akışlarını atlayan guard, `stream` anahtarından önceki
600 karakter içindeki sözlüğe bakıyor. Bir sayfalık PIL taraması buna denk
geliyor; iki sayfalı gelmiyor — görüntü baytları inflate olup Tj decoder
içlerinde desen buluyor. **Filtre kara listesi formatlar hakkında bir
tahmindir ve eksikti.** Düzeltme bunun yerine ÇIKTIYI kontrol ediyor:
`assessTextLegibility`, eşikleri üç örnekle ölçülmüş — çöp %14.7 kontrol
karakteri ve %2.9 NUL, gerçek metin katmanı %0/%0, o taramanın OCR'ı %0/%0.
NUL baytı sert sinyal; kontrol eşiği %5'te, iki tarafta da bir büyüklük
mertebesi marjla. Docstring artık kodun yaptığını söylüyor.

**Yönlendirme.** `document.parse`: `pdf-text-layer` (süreç içi, kayıpsız) veya
`ocr-image` / `ocr-scanned-pdf` (Tesseract 5.5.0, Apache-2.0, render için
poppler). Tesseract, poppler ve Türkçe dil paketi kuruldu ve gerçek
belgelerle doğrulandı.

**Kaydı ayrıca bir iddiayı onarıyor.** `gap-detection.ts` `pdf_parsing`
boşluğunu `document.parse` ile karşılanmış sayıyordu ama böyle bir id'li
capability yoktu — yani bir boşluk, çağrılamazken "karşılandı" diye
raporlanıyordu. Yanında anılan `pdf` id'si **hâlâ yok** ve manifest bunu
söylüyor, iddianın ayakta kalmasına izin vermiyor.

**Doğrulama dürüstlüğü — bedeli olan kısım.** OCR sonuçları **her zaman**
`unchecked: true` dönüyor. Ölçüldü: aynı görselde doğru okunan bir Türkçe
satır 85.2 ortalama güven aldı; aynı satır İngilizce modelle çöp
("Turkce glsi6g") olarak okunduğunda **84.3** aldı. Doğru ile yanlış arasında
0.9 puan. Kötü render edilmiş bir görsel 54.5'e düştü — yani sayı bir şey
ifade ediyor, sadece **doğruluk** ifade etmiyor. Dil seçimi aynı sebeple yük
taşıyor; o yüzden varsayılan Tesseract'ın `eng`'i değil `tur+eng`, çünkü
`eng` Türkçeyi sessizce bozuyor.

Yol erişimi çağıranın workspace'iyle sınırlı — buradaki diğer subprocess
adapter'ların şu an olduğundan daha sıkı.

**Kapılar:** 13/13 (gerçek dosyalarla) · typecheck 0 · `npm test` exit 0 ve
0 başarısız · hygiene "all ratchets hold" · `docs:state` 0.
Ratchet'lar: t7 pinine 6 isim · `allowlistSize` 60→61 · `engine.ts`
5641→5650. Fikstür: `scanned-two-page-no-text-layer.pdf` (36 KB, kusuru
yeniden üretiyor — bir sayfalı sürüm üretmiyor, çünkü guard ona denk geliyor).

## V2 Adım 10 — `eval.inspect.run` + repoya getirdiğim bir kusurun düzeltilmesi: KAPANDI (`79d930b`)

Planın ilk dalga maddesi 1. Inspect AI 0.3.281, MIT — hem deponun LICENSE
dosyasından hem kurulu dağıtımın metadata'sından doğrulandı. Planın koşulu
korundu: Inspect harness'ı sağlıyor, Aurora'nın kendi task şeması ve
verifier'ları yerinde kalıyor. `packages/eval`'in yerine geçmiyor.

**Eklediği şey başka bir evaluator değil.** Başkasının benchmark tanımını
çalıştırıp kökeni olan bir skor almak: task adı, model, scorer başına
metrikler, örnek başına notlar, token kullanımı. Gerçek task ile ölçüldü:
`status success`, scorer'lar `match` ve `includes`, örnek notları `"I"`,
mock model üzerinden 92 token.

**Yapmadığı üç şey** — hepsi manifest'te, çünkü üçü de yanlış anlaşılabilir:
(1) Aurora'yı hiçbir konuda iyi yapmıyor; worker'a kimlik bilgisi gitmediği
için barındırılan modele ulaşılamıyor ve task'lar `mockllm` altında koşuyor —
böyle bir skor **harness'ın çalıştığını** ölçer. (2) Task dosyasını
sandbox'lamıyor; bir task'ı değerlendirmenin tek yolu onu tanımlayan kodu
çalıştırmak, kapsama süreç (shell yok, duvar saati, PATH+LANG) — parser
değil. Bu yüzden `risk: "process"`. (3) `networkPolicy: "none"` bir proxy
yüzünden değil o kimlik bilgisi kısıtı yüzünden doğru ve manifest neyin bunu
bozacağını söylüyor.

**Verifier koşuyu yargılıyor, skoru asla.** Mock model altında iki scorer da
accuracy 0.0 veriyor ve verifier geçiyor — çünkü sıfır bir ölçüm. Düşük
skorda başarısız olan bir verifier, entegrasyonu kontrol ettiğini iddia
ederken modeli notlandırıyor olurdu.

**Ölçümle gelen iki düzeltme.** (a) `risk: "process"` politika motorunda
yüksek önem alıyor, yani çağrılar onaydan geçiyor; mock model ile varsayılan
reviewer hiç çözülmüyor ve `execute()` sonsuza dek asılıyor. Boot ve execute
ayrı ayrı zamanlanarak izole edildi, sonra mevcut bir capability ile
doğrulandı. (b) Worker'ın model-adı doğrulamasını test etmek için yazılan test
ona hiç ulaşmıyordu: PolicyEngine `rm -rf /`'yi kritik sayıp subprocess
doğmadan engelliyor. **Sistem testimden güçlüydü.** İki katman da artık
doğrulanıyor, ikincisini yalnızca worker'ın kendi kontrolünün yakaladığı bir
payload ile.

**Ayrıca bu commit'te: repoya getirdiğim bir kusur düzeltildi.** Altı dış
capability test dosyası, backend eksikken `throw` ediyordu — "atlanan
entegrasyon testi kanıt değildir" gerekçesiyle. Bu, duckdb/crawl4ai/
Tesseract/Chromium kurulu olmayan **her makinede** `npm test`'i exit 1
yapıyordu. Artık reponun mevcut konvansiyonunu izliyorlar
(`postgres-rls-integration`, `real-encoder-recall`, `version`) ve görünür
şekilde atlıyorlar — document-parse için ölçüldü: **8 passed | 5 skipped** —
saf-mantık describe'ları atlamanın dışında bırakıldı, böylece her dosya her
zaman bir şey doğruluyor. Altısı da önce gerçek backend'lere karşı yeniden
çalıştırıldı: **75/75**.

**Kapılar:** bu capability 14/14 · altı adapter suite'i 75/75 · typecheck 0 ·
`npm test` exit 0 (298 dosya geçti, 1 önceden atlanan) · hygiene "all ratchets
hold" · `docs:state` 0. Ratchet'lar: t7 pinine 6 isim · `allowlistSize`
61→62 · `engine.ts` 5650→5658.

## V2 Adım 11 — OTLP traces: KAPANDI (`62f7b80`)

Planın ilk dalga maddesi 7. **Önce ölçüldü:** `otlp-exporter.ts` zaten OTLP
*metrik* gönderiyor, `engine.ts`'e bağlı ve testli. Hiç dahil olmadığı şey
tracing — o dosyada span/trace araması sıfır sonuç veriyor. Yani bu adım ikinci
bir metrik yolu değil, span ekliyor.

**Span'ler broker'ın yaşam döngüsü event'lerinden kuruluyor**, yanında tutulan
yeni bir kayıttan değil. `CapabilityLifecycleEvent` zaten descriptor, context,
politika kararı, durum ve süre taşıyor; ikinci bir günlük kaçınılmaz olarak
ikisinin ayrışmasına yol açardı. Bir turun UUID'si trace id, bir tool
çağrısının UUID'si span id oluyor — yani bir tur bir trace ve eşleme yalnızca
id'den çıkarılabiliyor.

**Dört konvansiyon metrik exporter'ından devralındı**, çünkü onu çalıştırmayı
güvenli kılan şey onlar: içeriksiz attribute'lar; export hatalarında yalnızca
hata sınıfı; fail-open; unref'li timer. İçeriksizlik özen isteyen kısım —
broker'ın `error` alanı çağıran içeriğini alıntılayabilen bir mesaj, o yüzden
tamamen atılıyor ve yalnızca `haf.error.present` kaydediliyor.
`PolicyDecision.message` aynı sebeple düz yazı; yalnızca enum ve reason code
tutuluyor.

**Kaydedilmeyen iki şey**, ikisi de modülde yazılı çünkü ikisinin de üstü
kolayca örtülebilir. Broker, politika-engelli veya onay-reddedilmiş bir çağrı
için `finished`'ı `started`'dan **ÖNCE** yayınlıyor (`capability-broker.ts:192,
:204` vs `:215`), yani o çağrıların ölçülmüş bir süresi yok; span'leri
sıfır-uzunlukta ve `haf.span.timing = no-start-observed` işaretli — makul
görünen uydurma bir süre verilmiyor. Ve tur-kök span'i yok: broker'ın
event'leri capability çağrısında başlıyor, yani trace çağrıları gösteriyor,
etrafındaki akıl yürütmeyi değil.

**Payload elle kuruluyor** (metrik exporter'ıyla aynı). Bu ancak şekil, elle
kurulmamış bir şeyle karşılaştırılırsa savunulabilir — o yüzden test gerçek
`@opentelemetry/sdk-trace-base` ve `exporter-trace-otlp-http`'yi yerel bir HTTP
alıcısına karşı çalıştırıp ikisinin aynı yapıyı ve aynı id formatını
(32 ve 16 hex, asla tümü-sıfır) ürettiğini doğruluyor. **İkisi de gerçek
socket'ten geçiyor; mock'lanmış fetch yok.** Teste yazılmış sabitlere karşı
doğrulamak yalnızca test ile modülün birbiriyle anlaştığını kanıtlardı.
OpenTelemetry paketleri devDependency: `src/` içinde hiçbir şey onları import
etmiyor.

**Ölçümle gelen üç düzeltme.** (a) Span süresi artık broker'ın `durationMs`'inden
geliyor, exporter'ın iki kendi gözlemi arasındaki farktan değil — ikincisi event
dispatch süresini de içeriyor. (b) İçerik sızmadığını doğrulayan test "SELECT"
içeren bir payload kullanıyordu ve `SQL-SELECT` reason code'unda başarısız oldu —
reason code'lar tanımlayıcıdır ve kasıtlı olarak kaydediliyor. (c) 19 basamaklı
nanosaniye zaman damgalarını karşılaştıran bir assertion `Number`'dan geçiyor,
hassasiyet kaybediyor ve 12 ms'i `12000256 ns` diye raporluyordu — exporter'ın
kendi BigInt aritmetiği doğruyken.

**Son test bağlantı testi:** çalışan bir engine, broker üzerinden gerçek bir
capability çağrısı, gerçek bir alıcıya ulaşan bir span. Bu repo daha önce
kurulmuş-ama-ulaşılamamış bir özellik gönderdi.

**Kapılar:** 16/16 · typecheck 0 · `npm test` exit 0 (299 dosya geçti) ·
hygiene "all ratchets hold" · `docs:state` 0. Ratchet'lar: t7 pinine 4 isim ·
`allowlistSize` 62→63 · `engine.ts` 5658→5679.

## V2 Adım 12 — Belge çıkarıcı iyileştirmesi + Office desteği: KAPANDI (`8df103b`, `a52645f`)

Planın ikinci dalga maddesi 13, ama sırası ölçümle değişti: önce çıkarıcı
iyileştirildi ki Office capability'sinin ürettiği PDF'ler hemen işe yarasın.

### 12a — `document.parse`'a poppler rotası (`8df103b`)

**Aynı dosyada yan yana ölçüm** (LibreOffice'in bir .docx'ten yazdığı PDF):

| Çıkarıcı | Sonuç |
|---|---|
| `extractPdfText` (repo, bağımlılıksız) | `extracted=false`, 3996 karakterde 316 NUL |
| `pdftotext` (poppler) | `Aurora Office Testi / Bu bir docx paragrafıdır. Türkçe: ğüşıöç / hücre` — tablo hücresi dahil |

Repo'nun çıkarıcısı bağımlılıksız ve CID/CMap fontlarını **kasıtlı olarak**
decode etmiyor — ki gerçek dünyadaki PDF'lerin çoğu bunları kullanıyor. Bu
rotadan önce o belgeler doğrudan OCR'a düşüyordu: yavaş, kayıplı ve
doğrulanmamış transkripsiyon olarak raporlanıyordu; oysa kayıpsız bir çıkarma
mümkündü. Yeni rota süreç-içi okuyucu ile OCR arasında; ucuz yol önce
çalışıyor, OCR son çare kalıyor. Çıktısı aynı legibility kontrolünden geçiyor
ve diğer metin-katmanı rotaları gibi `unchecked: true`.

**Ölçümle yakalanan tuzak:** `pdftotext` metin katmanı olmayan bir PDF için
exit 0 verip yalnızca form-feed üretiyor. Exit durumuna güvenmek, taranmış bir
belge için "başarılı boş çıkarma" raporlardı — oysa OCR'a düşmesi gerekiyordu.
O yüzden içerik kontrol ediliyor ve bir test taranmış fikstürün hâlâ OCR'a
ulaştığını sabitliyor. *(Bu aracın "her zaman exit 0 verdiği" yönündeki önceki
okumam yanlıştı — eksik/bozuk dosyada exit 1 veriyor; o okuma `$?`'yi pipe'tan
sonra kontrol etmekten geliyordu.)*

### 12b — `office.convert` (`a52645f`)

**Önce ölçüldü:** Aurora'da .docx/.xlsx/.pptx için **hiçbir destek yoktu** —
paketteki hiçbir kaynak dosya bu uzantılardan bahsetmiyordu. Tamamen boş soket.

LibreOffice 25.2.3, **MPL-2.0**. Lisans hakkında, çünkü MPL yanlış anlaşılması
kolay: dosya-düzeyi copyleft ve burası LibreOffice'i **subprocess olarak
çağırıyor**, link değil — yani Aurora'nın kaynağına hiçbir yükümlülük
ulaşmıyor. Bazı LibreOffice bileşenleri Apache-2.0/GPL/LGPL taşıyor; onlar
LibreOffice'in sorumluluğu ve özetlenip geçilmiyor.

**Yönlendirmeyi tek bir ölçüm şekillendirdi.** Tablo içeren bir .docx'i
LibreOffice'in `txt:Text` filtresiyle dönüştürmek başarısız olmadı —
**döngüye girdi.** Ölçüldü: geçici dosya on iki saniyede 72 → 94 → 116 MB
büyüdü, `soffice.bin` %99.8 CPU'da, yazdığı 992 MB'lık tmpfs'i doldurma
yolunda. Tablosuz .docx 835 ms'de dönüştü; yani tetikleyen tablo ve hiçbir
çağıran bunu öngöremez. O yüzden `txt:Text` Writer belgeleri için **asla**
kullanılmıyor, CSV yalnızca tablolardan kabul ediliyor ve red metni nedenini
söyleyip çalışan yolu gösteriyor.

**Ayrıca iki teşhis.** (1) `sideEffect: true` bildiren bir capability,
`context.idempotencyKey`'e göre effect journal'dan geçiyor
(`capability-broker.ts:221`). Test tek anahtar kullanıyordu, yani ikinci çağrı
birincinin önbelleklenmiş sonucunu döndürdü — çıktı yolu hakkında bir
assertion, kaynak yolu hakkında bir red gördü. (2) Önceki commit'te yazdığım
**kırılgan bir assertion**: span'in "40000" içermediğini doğruluyordu, ama span
id'leri 16 hex ve zaman damgaları 19 rakam — ölçüldü, **200000 zaman
damgasından 22221'i** o alt dizeyi içeriyor, yani %11 başarısızlık oranı;
bir kez şansla geçmişti. Token artık a-f dışında harfler kullanıyor, ikisinde de
bulunamaz. **10 ardışık koşu ile doğrulandı.**

**Kapılar:** office.convert 16/16 · document.parse 15/15 · altı adapter suite'i
77/77 · typecheck 0 · `npm test` exit 0 (300 dosya) · hygiene "all ratchets
hold" · `docs:state` 0. Ratchet'lar: t7 pinine 6+4 isim · `allowlistSize`
63→64 · `engine.ts` 5679→5686.

## V2 Adım 13 — `data.profile`: KAPANDI (`fcfc27f`)

Planın ikinci dalga maddesi 14'ün kalan yarısı (DuckDB Adım 5'te bitmişti).
Polars 2.0.0, MIT.

**Önce ölçüldü:** `data.` alanında tam olarak bir capability vardı —
`data.duckdb.query`, tek bir SQL cümlesi alıp satır döndürüyor. "Bu veri seti
nedir" sorusuna (şekil, tipler, eksik değerler, aralıklar, dağılımlar) elle SQL
yazmadan cevap veren hiçbir şey yoktu. `analysis|stats|statistics|dataframe`
araması boş döndü.

**Bunun `polars.describe()`'ın bir endpoint arkasına konmuş hâli olmamasının
sebebi** worker'ın ikinci yarısı. Anahtar sayıların hepsi ham dosyadan
Python'ın stdlib `csv` modülüyle yeniden hesaplanıp karşılaştırılıyor: satır
sayısı, kolon sayısı, kolon başına null sayısı ve ilk sayısal kolonun
ortalaması ham hücrelerden toplanıp bölünerek. Yeniden hesaplama **kasıtlı
olarak polars kullanmıyor** — çünkü bir kütüphanenin kendi çıktısını tekrar
etmesi kanıt değildir, iki bağımsız okumanın uyuşması kanıttır.

**O kontrol ilk koşuda yerini kazandı.** Worker'ın yeniden hesaplaması hiçbir
kolonun toplamını biriktirmiyordu — guard `if name not in numeric_sums`
okuyordu, boş başlayan bir dict'e karşı — yani bağımsız ortalaması null iken
profil 25.2 raporluyordu. Sonuç doğrulanmamış döndü, uyuşmazlık kolonu adıyla
söyledi ve **hata profilde değil kontrolcideydi.** Çalıştırmak bunu buldu;
okumak bulmamıştı.

**Gizlenmek yerine raporlanan bir davranış:** boş bir CSV hücresi eksik değer
olarak okunuyor ve ne `null_values=[]` ne `schema_overrides` bunu değiştiriyor.
Yani `nullCount` boş hücreleri eksik sayıyor ve bu capability CSV'de boş bir
dizeyi olmayan bir değerden ayırt edemiyor. Not sonucun içinde taşıyor, yalnızca
manifest'te değil.

**Verifier yalnızca yeniden hesaplama uyuşmadığında başarısız.** Kontrolsüz bir
profil başarısız sayılmıyor, doğrulanmamış dönüyor — çünkü "kimse teyit
edemedi" ile "bu yanlış" aynı şey değil ve ikisini karıştırmak çağıranlara
verifier'ı bypass etmeyi öğretir. `summariseChecks` yalan söyleyen bir kontrole
karşı test ediliyor, aynı sebeple: hiç çalıştırılmamış bir uyuşmazlık yolu
`verified: true`'yu hiçbir şey hakkında bir iddiaya dönüştürür.

**Bir düzeltme:** test, `sampleValues=99`'u worker'ın reddetmesini bekliyordu;
oysa capability'nin zod şeması 20'de sınırlıyor, yani broker çağrıyı
doğrulama sırasında reddediyor ve hiçbir subprocess doğmuyor. Sistem testimden
güçlüydü.

**Ayrıca:** `engine.ts` boyut sınırı `wc -l`'den alınmıştı (5692), oysa audit
5693 sayıyor. Sınır her zaman audit'in kendi `measured` değerinden alınmalı.

**Kapılar:** data.profile 16/16 · typecheck 0 · `npm test` exit 0 (301 dosya) ·
hygiene "all ratchets hold" · `docs:state` 0. Ratchet'lar: t7 pinine 6 isim ·
`allowlistSize` 64→65 · `engine.ts` 5686→5693.

## V2 Adım 14 — #15 Workflow durability ölçüldü, gerçek kusur kapatıldı (`e99c081`)

Plan koşullu yazmıştı: *"if current persistence/retry needs justify it"*. Ölçüm
**koşulun sağlanmadığını** söyledi — kalıcılık katmanı zaten güçlü: event store,
command ve effect journal'ları, snapshot store, session lease'ler, her geçişte
kalıcı yazıp adım indeksinden devam eden `long-horizon-task-manager`. Temporal
veya Inngest eklemek kutucuk işaretlemek için modül eklemek olurdu.

**Ama ölçüm bir kusur buldu** ve bu dalın tekrar tekrar bulduğu kusur:

`chooseRecovery`, `permission_gap` için `request_permission` ve
`canContinue: true` döndürüyor. Yürütme döngüsünde bu stratejiyi ele alan
**hiçbir şey yok** — tüm `src/` içinde yalnızca bir dosyada geçiyor, o da onu
döndüren taksonomi. Gerçek döngüyü izin reddi veren bir ajanla çalıştırıp
sonucu ölçtüm:

| | Ölçüm |
|---|---|
| Önce | **3 ajan çağrısı** (`maxAttempts: 3`), her seferinde aynı reddedilen işlem; gap detection üçünde de `permission_gap`'i adlandırdı |
| Sonra | **1 çağrı** + `blocked: Authorisation was needed on attempt 1 but no authorisation provider was supplied` |

Raporun tek escalation satırı *"Exhausted 3 recovery attempts; escalating
rather than looping"* idi — **hiçbir şey escalate edilmeden.** Az önce
reddedilmiş bir işlemi tekrarlamak strateji değil, o yüzden döngü artık ilk
reddette duruyor ve nedenini kaydediyor. Onay veren provider tekrar denetiyor;
reddeden duruyor ve "soruldu ve reddedildi" diyor — ki bu, "kimseye
sorulamadı"dan farklı bir gerçek. Fırlatan provider ikisi olarak da
okunmuyor, üçüncü gerçek olarak kaydediliyor.

**Kasıtlı olarak yapılmayan iki şey:**

1. **Motor provider'ı sağlamıyor** — sebep kimlik, tembellik değil:
   `ApprovalService.request` zorunlu `sessionId`/`turnId`/`toolCallId` içeren
   bir `CapabilityContext` istiyor, `TaskContext`'te ise turn veya tool-call
   kimliği yok. Önce bu şekilde bağladım, **altı tip hatası verdi ve hatalar
   işe yarayan kısımdı** — o alanları uydurmak, bir insanın sonra okuyacağı
   onay kaydına icat edilmiş kimlikler yazmak olurdu.
2. **`retry_with_backoff` bozuk değil.** Önce onu da, üç stratejiyle birlikte,
   ele alınmıyor diye raporladım — strateji adını grep'leyip sıfır bulduğum
   için. Oysa döngü `recovery.backoffMs`'e göre dağıtıyor ve bekliyor. *Bir
   ifade için sıfır grep sonucu, mekanizmanın eksik olduğunun kanıtı değildir.*

6 test yeni davranışı kapsıyor; sıradan geçici bir hatanın hâlâ tüm deneme
bütçesini kullandığını doğrulayan bir koruma dahil — aksi hâlde bu, her hatayı
durdurarak bir yalanı başka bir yalanla değiştirmiş olurdu.

**Kapılar:** yeni 6/6 · komşu altı kurtarma suite'inde 72/72 · data.profile +
DuckDB suite'leri backend'ler varken 38/38 · typecheck 0 · `npm test` exit 0 ·
hygiene "all ratchets hold" · `docs:state` 0.

## V2 Adım 15 — `data.graph.query`: KAPANDI (`597b393`)

Plan ikinci-dalga #16 Knowledge graph. Kuzu 0.11.3, **MIT** — paket
metadata'sında çıplak "MIT" yazıyordu, metin yoktu; **gerçek LICENSE dosyasında
doğruladım.**

**Önce ölçüldü:** `knowledge.search` = BM25/vector benzerlik (session messages,
memories, skills, artifacts). `adjacency|neighbours|traverseGraph|knowledgeGraph`
araması motor genelinde **hiçbir şey** döndürmedi. Aurora *benzer* olanı
bulabiliyor, *neyin neye bağlı* olduğunu cevaplayamıyordu.

**Kasıtlı olarak bu olmayan şey:** Aurora'nın kendi belleği üzerinde bir bilgi
grafı. Onu kurmak entity/relation extraction gerektiriyor, o da model
gerektiriyor ve burada 0 API key var. Çağıranın verdiği bir kenar listesine
dayanarak "bilgi grafı" iddia etmek, planın uyardığı *"sınıf ekledim, uzmanlık
dedim"* hatası olurdu. Manifest bunu açıkça söylüyor.

**Kuzu'nun arkasına endpoint koyulmuş hâli olmamasının sebebi** kontrol: her
cevap, aynı dosyadan stdlib `csv` ile kurulan bir dict-of-lists üzerinde
**burada yazılmış bir BFS** ile yeniden hesaplanıp karşılaştırılıyor. O kontrol
ilk koşularda **iki kez** yerini kazandı ve ikisinde de haklıydı:

1. **Kendine döngü (`X,X`), `reachable` from X.** Kuzu X'i erişilebilirler
   arasında döndürdü; BFS yalnızca Y döndürdü, çünkü başlangıç düğümünü
   sonuçtan siliyordu. **Kuzu haklıydı:** bir kendine döngü, başlangıçtan
   kendine uzunluğu ≥1 bir yolun gerçekten var olduğu anlamına gelir ve bunu
   silmek graf hakkında bilinmeye en değer gerçeği — döngüsü olduğunu — gizler.
   BFS artık başlangıcın komşularından 1. atlamada yürüyor.
2. **Aynı grafta `shortest_path` from X to X.** Kuzu hiçbir şey döndürmedi,
   BFS 1 dedi. Doğrudan ölçüldü: **Kuzu'nun `SHORTEST` deseni başlangıç ve
   bitiş aynı düğüme bağlandığında satır döndürmüyor**, oysa düz değişken-uzunluk
   deseni 1 uzunluğundaki yolu buluyor. Aynı-düğüm soruları artık sayma ile
   cevaplanıyor ve worker o dalın daha maliyetli olduğunu söylüyor.

**Üçüncü bulgu** worker'a yazıldı çünkü teşhisi zaman aldı: bir parametreye
`$end` adı vermek **Parser exception** veriyor — `end` Kuzu'nun sorgu
dilbilgisinde ayrılmış — ve mesaj ayrılmış sözcüğü söylemek yerine sorgu
metnini gösteriyor; yani sorgu doğruyken bozuk gibi okunuyor.

**Kapılar:** data.graph.query 17/17 · typecheck 0 · `npm test` exit 0 (303
dosya) · hygiene "all ratchets hold" · `docs:state` 0. Ratchet'lar: t7 pinine 6
isim · `engine.ts` 5693→5700 (**audit'in `measured` değerinden**, `wc -l` 5699
demişti).

## V2 Adım 16 — `science.sequence.analyse` + `science.molecule.analyse`: KAPANDI (`37cc44d`)

Üçüncü dalga: biopython + rdkit. **Biopython 1.88, "Biopython License
Agreement"** — izinli/MIT-benzeri, bazı dosyalar BSD-3-Clause ile çifte lisanslı;
shields.io "not identifiable by github" diyordu, o yüzden **gerçek LICENSE.rst'yi
okudum.** RDKit 2026.09.1, BSD-3-Clause.

**Önce ölçüldü:** `science.recompute` tek bilim capability'siydi ve **alan-bağımsız**
— bir iddianın taşıdığı komutu çalıştırıp sayıyı karşılaştırıyor. O dosyada
`dna|protein|sequence|molecule|smiles|fasta|amino` araması **sıfır** döndü.
Aurora komut verilirse bir sayıyı kontrol edebiliyor, dizi ve molekül hakkında
hiçbir şey bilmiyordu.

**Bunların kütüphanelerin arkasına konmuş endpoint olmamasının sebebi** kontrol:
anahtar sayıların hepsi worker'da **kütüphaneyi çağırmayan** kodla yeniden
hesaplanıyor. O kontrol ilk koşularda **dört gerçek şey** buldu ve her seferinde
kütüphane haklı, ilk yeniden-hesaplama hatalıydı:

1. **Moleküler ağırlık.** Worker *rezidü* kütleleri kullanıp tek su çıkarıyordu.
   Biopython'ın modeli: serbest monomer kütleleri toplamı − (uzunluk−1)×su.
   39-mer'de **35.9 Da** fark (12156.855 vs 12192.756) — kontrol raporladı.
   Monomer tabloları artık Biopython'dan ölçülerek alındı; aynı dizi **0.0136 Da**
   içinde uyuşuyor.
2. **GC kesri.** `gc_fraction` paydayı **belirsiz olmayan pozisyon** sayısından
   alıyor, uzunluktan değil: `ATGGCCATTNNNGGGCCC` için 0.666667 (10/15),
   10/18 olsaydı 0.555556. Uzunluğu varsayan çağıran sayıyı yanlış okur — o
   yüzden payda ve notu artık değerle birlikte taşınıyor.
3. **Ters tamamlama.** RNA dizide Biopython **DNA döndürüyor**: `AUGGCCAUU...`
   → `GCGGCCCA**TT**...`, girdide U olan yerde T. RNA tamamlaması diye
   raporlansa düpedüz yanlış olurdu; karşılaştırmadan ve döndürülmeden önce
   normalize ediliyor ve bir test sonucun T değil U içerdiğini sabitliyor.
4. **Belirsizlik.** Biopython N/X pozisyonu için ValueError fırlatıyor, yani öyle
   bir dizinin moleküler ağırlığı yok. Kontrol atlanıp neden söyleniyor —
   belirsizliğin ortalamasını alıp buna ölçüm demek yerine. Özet "hesaplanmadı"yı
   üçüncü bir durum olarak tutuyor: uyuşmadan da başarısızlıktan da ayrı.

**Ayrıca düzeltildi:** bir test, gerçekte 22 G/C içeren bir 39-mer için 10/39 GC
iddia ediyordu; sayı belirsiz fikstürden kopyalanmıştı.

**Kapılar:** iki capability için 17/17 · typecheck 0 · `npm test` exit 0 (304
dosya) · hygiene "all ratchets hold" · `docs:state` 0. Ratchet'lar: t7 pinine 10
isim · `engine.ts` 5700→5715 (audit'in `measured` değerinden).

## Açık fazlar

> Plan metni bekleniyor. Geldiğinde bu bölüm planın **kendi sırasıyla** doldurulacak;
> hiçbir faz atlanmayacak ve sıra buradan takip edilecek.

| # | faz | durum | commit |
| --- | --- | --- | --- |
| P0 | Measurement | ✅ | `675e340`…`94c80fb` |
| P1 | Runtime Kernel (1.1–1.4) | ✅ | `61c4fd4` `050e744` `b04b0ba` `1db1866` |
| P2 | Model Fabric (aşamaya göre yönlendirme) | ✅ | `4c4e5ce` |
| P3 | Meta Planner — 1/3 replanning · 2/3 strateji · 3/3 hierarchy | ✅ | `7e55792` `5212be8` `0480537` |
| P4 | Expert Fabric — 1/4 tanım · 2/4 registry · 3/4 planner · 4/4 evaluator+namespace | ✅ | `2c6ad7c` `f3a90e0` `23c804e` `18326dd` |
| FAZ 5 | Semantic Task Router — 1/3 router · 2/3 extraction+wiring · 3/3 complexity | ✅ | `d766f91` `c4a3798` `995a560` |
| FAZ 6 | Coding Expert — 1/4 tanım + dış-karar kuralı · 2/4 kural doğrulama yolunda · 3/4 built-in'ler erişilebilir + boşluklar adlandırıldı | ✅ | `69eb44d` `0caf5c2` `baab1cb` |
| FAZ 7 | Coding Expert Arena — 1/3 verdict mekanizması · 2/3 contestant'lar, kullanılabilirlik **ölçülüyor** · 3/3 engine-backed contestant + uçtan uca arena — mekanizma tamam, **rakip binary yok (ölçüldü) ⇒ win/draw/loss üretilmedi, uydurulmadı** | ✅ | `f560c1b` `b524ae0` `659c19e` |
| FAZ 8 | Research Expert — 1/4 denetleyici (6 boyut) · 2/4 evidence graph `ProvenanceTrace` · 3/4 `generateReport`'a bağlandı · 4/4 başarısız denetim politikası (annotate/flag/block) | ✅ | `cb78ea5` `e1d2ae0` `96ea950` `a8f44fe` |
| FAZ 9 | Science / Math / Data Expert — 1/3 yeniden-hesaplama doğrulayıcısı (V2) · 2/3 `science.recompute` capability'si · 3/3 plan adımı sayı beyan edebilir, **komutsuz sayı reddedilir** | ✅ | `b6cf2e3` `b02550c` `117c251` |
| **FAZ 26** | Engine parçalama — **bölünmedi ve bölünmemeli** ✅ · ölçüm: **5584 satırın 1602'si constructor (kablolama)** · metod-düzeyi bölme onu **hiç etkilemiyor** · `'justified'` diye bir durum **yok** (test bunu ortaya çıkardı) ← **PLANIN SON FAZI** | 🟡 | `02bca95` |
| **FAZ 25** | Production State — altı bileşenin **hepsi zaten var** (1994 satır + `postgres/*` + `transport/nats/`) · 1/3 backbone readiness ✅ (hangi modda olduğunu söyleyen tek yer) · **hiçbir şey çağırmıyor**, motor boot'ta kendi modunu raporlamıyor ← **SIRADAKİ** | 🟡 | `1a0ba84` |
| **FAZ 24** | Federated — fazın **kendi metni "İlk aşamada yapma" diyor** ⚠️ · 1/3 node selection ✅ (`selectNode`'da **3 gerçek kusur** bulundu) · remote execution **mümkün değil** (tek makine, peer yok) · gradient exchange **mümkün değil** (model yok) · `federated` **experimental kaldı** ← **SIRADAKİ** | 🟡 | `097fa45` |
| **FAZ 23** | Digital Twin — 1/3 üç soru **türüne göre ayrıldı**: workload=sum, delay-risk=threshold (tarihten hesaplanır, beyan edilen status'a güvenilmez), counterfactual=**reddedilir** ✅ · state modelinde **Tasks/Calendar/Goals/Resources/Devices yok** (boş alan eklenmedi) · `digital-twin` **experimental kaldı** ← **SIRADAKİ** | 🟡 | `775baa1` |
| **FAZ 22** | World Model 2.0 — 1/3 learned transition (frekans modeli, kendini öyle adlandırıyor) ✅ · structured (36)/causal (19)/uncertain (16)/counterfactual (4) zaten var · **geçiş kaynağı yok** (servis triple üretmiyor) ← **SIRADAKİ** | 🟡 | `d5652bd` |
| **FAZ 21** | Memory 2.0 — 1/3 **`NeuralMemoryFusion` → `VectorMemoryFusionService`, `NeuralCognitiveCore` → `CognitivePatternRegistryService`** ✅ (kullanıcının açık kısıtı) · mekanizma yarı **açık** (model gerek) · engine property + `/v1/neural-*` route'ları **eski isimde** (kırıcı API) ← **SIRADAKİ** | 🟡 | `2c71e47` |
| **FAZ 20** | Model Arena — 1/3 reliability boyutu ✅ · 24 model dosyası + 601 satır routing zaten var, privacy zaten dürüst · **reliability skora girmiyor** (çalıştırma kaynağı yok) ← **SIRADAKİ** | 🟡 | `6250c20` |
| **FAZ 19** | Strategy Arena — 1/3 ölçüme göre sıralayan arena ✅ · `strategy-generator` zaten çoklu strateji üretiyor ama **beyan edilen tahminle seçiyor** · **gerçek yarış model gerektiriyor, bu sandbox'ta yok** ← **SIRADAKİ** | 🟡 | `a7d667d` |
| **FAZ 18** | Expert Evaluator Fabric — 1/3 evaluator fabric ✅ · 4 domain evaluator'ü zaten vardı (FAZ 6/8/9/12) ama hiçbiri bir expert'e bağlı değildi · **fabric hiçbir yerde kurulmuyor** ← **SIRADAKİ** | 🟡 | `96f7e08` |
| **FAZ 17** | Capability Acquisition — 1/3 tool trust (keşif ≠ doğrulama, onay tanıma bağlı) ✅ · MCP (17 dosya) + plugin (13) zaten var · **`callTool` `decideToolTrust`'a danışmıyor** ← **SIRADAKİ** | 🟡 | `509c535` |
| **FAZ 16** | Self Improvement — 1/3 gap çözümü skill terfisinden ayrıldı (`mitigated` vs `resolved`, kanıtsız kapanmıyor) ✅ · evolution servisi zaten var (676 satır) · **`resolveGap`'i çağıran yok: kanıt kaynağı yok** ← **SIRADAKİ** | 🟡 | `a44fbd3` |
| **FAZ 15** | Proactive — 1/3 kendi yanlış-pozitif oranını ölçme ✅ · beş mekanizma da zaten var (opportunity 13 / anomaly 7 / proactive 19 / scheduled 13 / trigger 32) · **eşik/raporlama yüzeyi yok** ← **SIRADAKİ** | 🟡 | `e5f74d0` |
| **FAZ 14** | Long Horizon — 1/3 goal drift detection · 2/3 `adviseOnDrift` ile plan-feedback döngüsüne bağlandı ✅ · replan (14)/reflect (22)/checkpoint (8)/rollback (32) zaten var · **üretim çağıranı yok: `PlanRecord` kriter taşımıyor** (ölçüldü) ← **FAZ 15'e geçiliyor** | 🟡 | `6208547` `3cb4ed3` |
| **FAZ 13** | Society — 1/3 debate + conflict resolution ✅ · consensus zaten vardı (P1) · **mentor 0 dosya**, 15+ uzman roster'ı **kurulmuyor** (araçsız/verifier'sız persona = kullanıcının reddettiği şey) ← **SIRADAKİ** | 🟡 | `034d402` |
| **FAZ 12** | Multimodal — 1/3 analiz doğrulama ✅ · legacy yol zaten throw ediyor (dürüst), `audio.*` capability'leri sağlayıcıya devrediyor (dürüst) · backend'ler (vision/OCR/Whisper/TTS/video) **burada kurulamaz** ← **SIRADAKİ** | 🟡 | `c319e4e` |
| **FAZ 11** | Connector Fabric — 1/3 şema keşfi + alan eşleme ✅ · **somut connector YOK** (`provider` serbest string), 20+ connector/OAuth/webhook burada doğrulanamaz ← **SIRADAKİ** | 🟡 | `4f5d75b` |
| **FAZ 10** | Computer Use Expert — 1/3 eylem doğrulama · 2/3 `executeTask`'e bağlandı (gerçek çalışan yol) ✅ · mouse/keyboard/clipboard/window/accessibility **serviste yok** (ölçüldü) ve sandbox'ta ekran yok ⇒ sürücüler **kurulamaz**, stub yazılmadı ← **FAZ 11'e geçiliyor** | 🟡 | `1ca6ef2` `36baf59` |
| P9 | Science / Data / Math Expert | — | — |
| P10 | Computer Use Expert | — | — |
| P11 | Connector Fabric | — | — |
| P12 | Multimodal (Voice + Vision) | — | — |
| P13 | Agent Society 2.0 | — | — |
| P14 | Long-Horizon Jarvis | — | — |
| P15 | Proactive Intelligence | — | — |
| P16 | Self-Improvement 2.0 | — | — |
| P17 | Capability Acquisition 2.0 | — | — |
| P18 | Expert Evaluator Fabric | — | — |
| P19 | Strategy Arena | — | — |
| P20 | Model Arena | — | — |
| P21 | Memory 2.0 (+ Neural* isim dürüstlüğü) | — | — |
| P22 | World Model 2.0 | — | — |
| P23 | Digital Twin | — | — |
| P24 | Federation *(donanım yok — kapanamaz)* | — | — |
| P25 | Production State (Postgres/NATS/Event Store) | — | — |
| P26 | Engine parçalama | — | — |
| FAZ 27 | Security 2.0 *(kesişen katman, her fazda)* | 🟡 A1–A4, B, C kapandı; UNKNOWN state açık | — |
| FAZ 28–30 | Domain depth / Capability Map / Arena | — | — |

---

## Her faz kapanışında çalıştırılacak kapılar

```
npm run build          # 0
npm run typecheck      # 0  (eval testleri dahil)
npm test               # exit 0, 0 FAIL
node scripts/repo-hygiene-audit.mjs   # "all ratchets hold"
npm run docs:state -w @haf/eval       # doküman sayaçlarını tazele
```

Not: `scripts/repo-hygiene-audit.mjs` ratchet'ları **ölçülerek** değiştirilir ve
`apps/release-tool/test/t-hygiene.test.ts` ile **birlikte**, yazılı gerekçeyle.
