# AURORA — TÜM ALANLAR İÇİN AÇIK KAYNAK ENTEGRASYON VE KAPALI KAYNAK FARK KAPATMA MASTER PLANI

**Belge sürümü:** 2.0 — kapsam genişletilmiş sürüm  
**Tarih:** 13 Ekim 2026  
**İncelenen taban:** `workspace-01a1246e-9661-75bf-bd6e-586d6123b3da(1).zip`, `hybrid-agent-fabric` 1.65.0; ZIP içindeki güncel durum belgeleri 10 Ekim 2026 üretim tarihli.  
**Hedef:** Aurora'yı farklı alanlarda gerçek işler yapabilen, uygun açık/kapalı kaynak modelleri ve uzman araçları seçip yöneten, sonuçlarını doğrulayan, güvenli biçimde yetenek geliştirebilen genel amaçlı bir AI çalışma sistemi hâline getirmek.  
**Bu belgenin türü:** Uygulama planı ve araştırma envanteri; önceki 420 maddelik kontrol listesinin yerine geçmez, onun üzerine kurulur. V2; 57 katalog alt bölümü, 44 üst düzey alan ailesi kontrol listesi ve 1.000’den fazla GitHub repository-root/path adayı içerecek şekilde genişletilmiştir. Bağlantıların bulunması, projenin lisansının, güncelliğinin veya kalitesinin doğrulandığı anlamına gelmez; entegrasyon öncesi doğrulama zorunludur.

> **Önemli gerçekçilik notu:** “Bütün alanlar” matematiksel olarak kapalı bir liste değildir; yeni alanlar, modeller ve ürünler sürekli ortaya çıkar. Bu belge kişisel bilgisayar kullanımı ve üretkenlikten yazılım geliştirmeye, araştırmadan bilim/ mühendisliğe, yaratıcı üretimden fiziksel sistemlere kadar ana alanları ve çok sayıda nişi kapsayan bir **genişletilebilir katalog** verir. Her kategorinin “kesin olarak dünyanın en iyisi” olduğunu iddia etmez. Adaylar 13 Ekim 2026 civarında erişilebilen bir başlangıç kısa listesidir; entegrasyondan önce sürüm, lisans, donanım, bakım durumu ve kendi ölçümleriniz doğrulanmalıdır.

---

# 0. En net karar

**Aurora'yı silip baştan yazma. Mevcut sistemi koru; P0 güvenlik ve doğrulama işlerini tamamla, ardından uzman yetenekleri ortak bir sözleşmeyle sisteme bağla.**

En güçlü strateji, her özelliği sıfırdan yazmak değildir. En iyi strateji şu beş şeyi birlikte yapmaktır:

1. Aurora'nın bugün sahip olduğu görev yürütme, oturum, araç, kontrol API'si, istemci, bellek ve değerlendirme altyapısını koru.
2. Her alanda güçlü açık kaynak yazılımları, modelleri ve veri altyapılarını araştır; lisans ve güvenlik taramasından geçir.
3. Bunları doğrudan ana motora gömmek yerine mümkün oldukça **Capability/Adapter sözleşmesi** ile bağla. Büyük Python/GPU uygulamalarını ayrı servis veya işçi olarak çalıştır.
4. En iyi kapalı kaynak ürünleri “hedef referans” olarak kullan; aynı görevlerde Aurora ve açık kaynak alternatiflerinin farkını ölç.
5. Yalnızca ölçümler gösteriyorsa bir bileşeni varsayılan yap. “Repo eklendi”, “endpoint çalışıyor” veya “modül testi geçti” başarı kanıtı değildir.

Bu, Aurora'yı “birçok aracın bulunduğu monolit” olmaktan çıkarıp “gerektiğinde en uygun aracı seçen, işi uçtan uca yürüten ve sonucu doğrulayan ortak sistem” hâline getirmeyi hedefler.

## Yapılmaması gerekenler

- 50 agent framework'ünü aynı anda ekleme.
- Her alanda bütün açık kaynak depolarını ana repoya kopyalama.
- GitHub yıldızı, demo videosu veya README iddiasına göre “en iyi” kararı verme.
- Sadece prompt, rol, sınıf veya API route ekleyerek yetenek tamamlandı sayma.
- Ağırlıkları açık bir modeli, lisansı ve ticari kullanım şartları tamamen serbest bir yazılım gibi varsayma.
- Kendi kendini değiştiren kodu ana sürece veya sınırsız ağ/dosya erişimine koyma.
- Aynı isimli “memory”, “world model”, “learning”, “expert” modüllerinin gerçek semantik öğrenme, simülasyon veya uzmanlık kanıtı sayılmasına izin verme.
- Kapalı kaynak sistemin her yeteneğini, her veri avantajını veya her model kalitesini açık kaynağa mutlaka taşıyabileceğini varsayma.

---

# 1. İncelenen ZIP'in gerçek başlangıç çizgisi

Aşağıdaki durum, ZIP içindeki `hybrid-agent-fabric/CURRENT_STATE.md`, `MATURITY_MATRIX.md` ve `KNOWN_GAPS.md` üzerinden alınmıştır. Bu dosyalar ZIP'te 10 Ekim 2026 tarihli üretilmiş durum belgesi olarak bulunuyordu.

| Ölçüm | ZIP'te bildirilen durum | Bunun anlamı |
|---|---:|---|
| Test dosyası | 342 | Test altyapısı geniş. Bu tek başına gerçek model kalitesini göstermez. |
| Bildirilen test sayısı | 2.725 + tablo-tabanlı bildirim | Birçok birim/entegrasyon davranışı deneniyor; saha başarımı ayrıca ölçülmeli. |
| Olgunluk kaydındaki modül | 31 | Modül sayısı, yetenek sayısı veya kullanıcıya hazır özellik sayısı değildir. |
| Gerçek bir görev sırasında iş yaptığı gözlenen modül | 28/31 | Tek örnek görev: `hello.txt` oluşturma. Bu bütün görev yollarını kapsamaz. |
| CI içindeki kabul kapısı | 4 | Kabul testleri sayıca artırılmalı ve gerçek görev kapsamı genişletilmeli. |
| `verified` seviyesine ulaşan modül | 3 | Modül davranışını ölçen bir kabul kapısı var. |
| `production` kanıt seviyesine ulaşan modül | 0 | Olgunluk matrisinde üretimde gözlemlenmiş kanıt henüz kaydedilmemiş. |
| `engine.ts` uzunluğu | 5.612 satır; kurucu 1.602 satır | Modül sınırları ve bağımlılık grafiği ölçülmeli; sırf dosya uzun diye refactor yapılmamalı. |
| Kalıcı durum | 77 servis JSON dosyalarına yazıyor; event store için Postgres backend var | Tutarlılık, göç, eşzamanlılık, şema sürümü ve geri alma planı gerekli. |
| Gerçek model benchmark'ı | Durum dosyasına göre mevcut eval sonuçları mock provider kullanmış | Gerçek model sağlayıcısıyla sonuç/kalite kıyaslaması henüz yok. |
| Capability synthesis | Yeteneği alma zinciri kısmen uçtan uca; belgede gerçek şekilde sentezlenebilir örnek `visual_diff` ile sınırlı | “Eksik yetenek edinimi” henüz her tür yeteneği kendi başına edinme anlamına gelmiyor. |
| Bellek | Gerçek bellek hattı var; uzun vadeli bellek araması kelime örtüşmesine dayanıyor; vektör füzyonu hash tabanlı | Gerçek embedding, reranker ve anlamsal retrieval ölçümü gerekiyor. |
| Self-improvement | Deterministik mutation operatörleri ve held-out challenge mevcut | Öğrenilmiş arama/iyileştirme için kanıt ve genişletilmiş mutasyon uzayı gerekiyor. |
| World model | Durum/eylem/tahmin/sonuç kaydı var; tahminler çağırandan geliyor | Gerçek öğrenilmiş ileri model veya kalibre simülatör henüz kanıtlanmış değil. |
| `code-pipeline-service` | Sekiz aşamanın altısı gerçek backend bekliyor | Pipeline'ın durum makinesi tamamlanmış iş hattı sayılmamalı. |
| `domain-experts` | Etiketleme/yönlendirme altyapısı; gerçek uzman backend ve kaynak verisi eksik | Uzman adı, uzman yeteneği değildir. |
| `surface/jarvis-surface` | STT/TTS/vision birimleri yapılandırılmış sağlayıcılara delege ediliyor | Varsayılan çalışan yerel ses/görsel yığını ayrıca kurulmalı. |
| `federated` | Düğüm kaydı/round altyapısı var; gerçek parametre agregasyonu eksik | Gerçek federated learning tamamlanmış değil. |

## Öncelik sırasındaki anlam

1. **P0:** Çalışan mevcut sistemi koru; güvenli kod yürütme, kimlik doğrulama/izinler, secret hijyeni ve depoda sızabilecek kullanıcı verilerini ele al.
2. **P1:** Gerçek modellerle testleri çalıştırabilen, görev sonucu doğrulayan ve benchmark kayıtlarını güvenilir tutan değerlendirme sistemi kur.
3. **P1:** Aurora ana çekirdeğinin hedefi güvenli planlama/yürütme/doğrulama olarak sabit olsun; yeni alanların tümü ortak capability standardına bağlansın.
4. **P2:** En yüksek kullanım ve en yüksek fayda sağlayan ilk alanları ekle: kodlama, browser/desktop, web araştırma, belgeler, model yönlendirme, bellek, ofis/veri analizi.
5. **P3:** Görsel/ses/video, bilim/matematik, 3D/CAD, oyun, iş uygulamaları ve fiziksel sistemlere genişle.
6. **Sürekli:** Her yeni kaynak sürümü için lisans/güvenlik/uyumluluk kontrolünü ve benchmark tekrarını çalıştır.

**Not:** Önceki inceleme sırasında `sandbox-worker.ts` / kod yürütme sınırı için sandbox kaçışı riski gözlenmişti. Bu iddia yeni izole testle yeniden doğrulanmalı; ama riskin çözülmesi kanıtlanana kadar güvenilmeyen model kodunu ana makinede sınırsız çalıştırmak güvenli kabul edilmemeli. Worker thread, tek başına güvenlik sınırı değildir. Gerekirse ayrı kullanıcı, konteyner, gVisor/Firecracker benzeri katman, dosya sistemi allowlist'i, ağ egress politikası, kaynak sınırı ve tek kullanımlık çalışma ortamı kullan.

---

# 2. Hedef mimari: Aurora ortak bir “yetenek işletim katmanı” olsun

## 2.1 Katmanlar

```text
KULLANICI / API / DESKTOP / CLI / SCHEDULED JOB / WEBHOOK
                       |
              1) Intent & Request Layer
     amaç / kısıtlar / risk / izin / başarı şartı / bütçe
                       |
             2) Planner + Task Graph
     alt görevler / bağımlılıklar / paralellik / durdurma şartı
                       |
              3) Model Router / Policy
    açık model / kapalı API / uzman model / yerel çalışma seçimi
                       |
             4) Capability Registry
    sözleşme + yetenek kartı + izinler + sağlık + benchmark + lisans
                       |
      +----------------+-------------------------+
      |                |                         |
  Code Worker      Browser/OS              Domain workers
  Shell/Test       Playwright              OCR / Audio / Video
  Git/IDE           Desktop API             Data / Math / CAD / etc.
      |                |                         |
      +----------------+-------------------------+
                       |
          5) Artifact & Evidence Store
        diff / dosya / kaynak / trace / test / çıktı
                       |
               6) Independent Verifier
      test / schema / citation / visual check / grader / safety
                       |
               7) Recovery Controller
       kök neden → alternatif plan → retry bütçesi → insan onayı
                       |
            8) Memory & Learning Pipeline
     başarılı stratejiler / hatalar / tercih / değerlendirme datası
                       |
           9) Telemetry + Offline Evaluation
       maliyet / gecikme / başarı / doğruluk / güvenlik / regresyon
```

## 2.2 “Ana zekâ” ile “uzman araç” ayrımı

Aurora'nın ana çekirdeği bütün uzman algoritmaların en iyisi olmak zorunda değildir. Ana çekirdek şunları iyi yapmalıdır:

- Kullanıcının hedefini ve gerçek bitiş şartını anlamak.
- Gerekli girdilerin eksik olup olmadığını belirlemek.
- Görevi bağımlılıkları belli alt görevlere ayırmak.
- Her alt görev için uygun model/araç/servisi seçmek.
- Risk ve yetki politikasını uygulamak.
- Araçlara açık sözleşmeli, doğrulanabilir çağrılar yapmak.
- Sonuçları birleştirmek ve bağımsız biçimde doğrulamak.
- Başarısızlıkta hatanın kaynağını sınıflandırıp kontrollü şekilde toparlanmak.
- Gözlemlenebilir kanıta göre öğrenmek; başarısız denemeyi başarı gibi belleğe kaydetmemek.

Uzman işçiler, daha dar alanlarda daha iyi olmalıdır. Örneğin bir CAD aracı geometrik model oluşturur; görüntü üretici pikseller üretir; matematik motoru sembolik ifadeleri çözer; browser agent web arayüzünü kontrol eder. Aurora bunları görevin bütünü için koordine eder.

## 2.3 Her capability için standart sözleşme

Aşağıdaki alanlar registry'de zorunlu olmalı. Örnek TypeScript taslağı, doğrudan kopyalamak için değil sözleşme fikrini sabitlemek içindir:

```ts
interface CapabilityManifest {
  id: string;                 // e.g. docs.pdf.extract
  version: string;            // semver + pinned adapter/model version
  domain: string[];           // document-processing, research
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  executionMode: "in-process" | "subprocess" | "service" | "remote-api";
  requiredPermissions: string[];
  networkPolicy: "none" | "allowlist" | "unrestricted-by-policy";
  filesystemPolicy: "none" | "workspace-only" | "read-allowlist";
  resourceLimits: { timeoutMs: number; memoryMb?: number; cpu?: number };
  healthCheck: string;
  verifierIds: string[];
  benchmarks: string[];
  provenance: { repository: string; commit: string; license: string; modelLicense?: string };
  limitations: string[];
  fallbackCapabilityIds: string[];
}
```

Her çalıştırmanın standart zarfı:

- `runId`, `taskId`, `capabilityId`, sürüm/commit/model kimliği.
- Input/output için schema ve boyut limitleri.
- `startedAt`, `finishedAt`, süre, token/compute maliyeti ve log/trace ref'i.
- Sonuç durumu: `succeeded`, `failed`, `unverified`, `unavailable`, `blocked`, `simulated` gibi açık durumlar.
- Kanıtlar: dosya hash'i, test raporu, kaynak URL'leri, grader sonucu, ekran görüntüsü, çıktı dosyası.
- Gerekli insan onayı, iptal/rollback planı ve izin kaydı.

**Asla başarıyı sırf alt süreç exit code 0 verdi diye ilan etme.** Örneğin kodlama görevi tamamlandıysa kod değişikliği, ilgili testler, beklenmeyen yan etki ve kullanıcının bitiş koşulu doğrulanmalıdır.

---

# 3. Açık kaynak adaylarını nasıl seçeceksin?

## 3.1 Aday değerlendirme puanı

Her aday için 0–5 arası puan ver; bilinmeyen alanı “0” veya “kanıt yok” olarak tut, tahminle doldurma. Aşağıdaki ağırlıklar başlangıç içindir, benchmark sonuçlarına göre değişebilir:

| Boyut | Ağırlık | Ölçüm örneği |
|---|---:|---|
| Gerçek görev başarı oranı | 25% | 50–200 sabit görevde başarı / kısmi başarı / başarısızlık |
| Aurora'ya kattığı net fayda | 20% | Aynı görevde Aurora baseline'a göre delta |
| Güvenlik ve güvenli hata davranışı | 15% | Yetki aşımı, prompt injection, dosya/ağ erişimi, veri sızıntısı testleri |
| Entegrasyon ve bakım yükü | 10% | Adaptör karmaşıklığı, bağımlılık, sürüm kırılmaları, test yükü |
| Gecikme ve donanım gereksinimi | 10% | P50/P95 latency, RAM/VRAM, CPU/GPU, peak memory |
| Maliyet ve kullanım sınırları | 8% | Yerel compute + API token + depolama + işletim maliyeti |
| Lisans/provenance açıklığı | 7% | Kod lisansı, model lisansı, bağımlılık lisansları, veri kökeni |
| Aktif bakım ve dokümantasyon | 5% | Son sürümler, açık güvenlik sorunları, issue/PR temposu |

**Kesin veto nedenleri:** Kullanım koşullarının hedef dağıtım/ ticari kullanımın için uygun olmaması; güvenli izolasyon sağlayamaması; açık kritik güvenlik sorunu; yeniden üretilemeyen benchmark; veri/çıktı koşulları belirsizliği; anahtarların veya kullanıcı verisinin beklenmedik yere gönderilmesi.

## 3.2 Benchmark kuralları

- Aynı görev metni, aynı çalışma alanı, aynı başlangıç kodu/dokümanı ve aynı bitiş koşulu.
- Aynı compute veya harcama bütçesi (gerektiğinde ayrı “eşit model” ve “ürün paketi” yarışları).
- Sabit test split'i ve ayrı gizli/held-out test split'i.
- Her karşılaştırmada prompt, model id, model sürümü, agent sürümü, ayarlar, seed varsa seed, tool izinleri ve bütçe kaydedilsin.
- Birkaç örnek değil, alanın hata türlerini temsil eden veri kümesi.
- Otomatik grader ve yüksek riskli örneklerde insan incelemesi.
- Geçen testi ana branch'e kabul etmeden önce regresyon testleri.
- Başarı kadar güvenli ret, belirsizlik belirtme ve yanlış iddiadan kaçınma da ölçülsün.

## 3.3 “En iyi açık kaynak” demek için gereken kanıt

Bir yazılımı/modeli “en iyi” ilan etmek yerine **“Aurora'nın belirli görev ve koşullarında şu an en iyi aday”** olarak kaydet. İki tür yarış yürüt:

1. **Bileşen karşılaştırması:** Aynı model ve araçlarla sadece orchestration/agent framework kıyaslanır.
2. **Uçtan uca ürün karşılaştırması:** Her ürün varsayılan özellikleriyle ve eşit maliyet/izin koşulları altında kıyaslanır.

İkisini birleştirirsen framework katkısını model kalitesiyle karıştırırsın.

---

# 4. Entegrasyon standardı — her aday aynı kapıdan geçsin

## Gate A — keşif

- Resmî repo/docs doğru mu? Fork mu, aktif proje mi?
- Repo sürümü ve commit hash'i kaydedildi mi?
- Kod lisansı hangi klasörlere uygulanıyor? Alt klasör/enterprise dosyalarında farklı lisans var mı?
- Model ağırlığı lisansı ve yazılım lisansı ayrı incelendi mi?
- Ticari dağıtım, hosted service, redistribution, attribution, copyleft ve trademark şartları incelendi mi?
- Model gereksinimi, GPU/CPU/RAM/VRAM ve internet bağımlılığı belirlendi mi?
- Veri çıkışı/telemetry varsayılanı saptandı mı?
- Aktif bilinen güvenlik açığı ve CVE tarandı mı?

## Gate B — ayrı ortamda prototip

- Önce main workspace'e kopyalamadan Docker/VM/venv/işçi içinde çalıştır.
- Kullanıcı dosyası yerine sahte veri kullan.
- Egress ağını varsayılan kapalı tut.
- Path traversal, prompt injection, bozuk dosya, aşırı büyük girdi, timeout, process crash ve bellek tüketimi testlerini çalıştır.
- Çıktı şemasını doğrula; loglarda secret bulunmadığını kontrol et.

## Gate C — Aurora adapter'i

- Tool/Capability manifest tanımla.
- Input/output JSON Schema ve versioning oluştur.
- Idempotency ve cancellation desteği ekle.
- Timeout, retry budget, concurrency limit ve backoff koy.
- Açık hata türleri oluştur; “her hata yeniden denenir” yaklaşımından kaçın.
- Artefact store ve trace ile bağla.
- Verifier tanımla; verifier yoksa sonucu `unverified` olarak ver.
- Kullanıcı onayı gerektiren etki türlerini belirt: para transferi, e-posta gönderimi, dosya silme, yayınlama, satın alma, makine hareketi vb.

## Gate D — kalite testi

- En az 20 smoke task + alan uygunluğuna göre 50–200 benchmark task.
- Negative/adversarial tests ve regression tests.
- P50/P95 latency, fail rate, retry count, cost/compute, output quality.
- Baseline Aurora ve referans ürüne karşı test.
- Kabul eşiği önceden yazılı olsun. Başarısız testleri gizleme/benchmark listesinden çıkarma.

## Gate E — kademeli dağıtım

- Feature flag ve hızlı rollback.
- Önce sadece sandbox/deneme görevleri; sonra düşük riskli gerçek görevler.
- İnsan onayını ortadan kaldırmadan gölge (shadow) test.
- 7/30 gün hata telemetrisi ve abuse testing sonrası varsayılan açma.

## Gate F — koruma ve güncelleme

- Pinlenmiş sürüm; otomatik `latest` yükseltmesi yok.
- SBOM + license report + vulnerability scan.
- Yeni sürümde benchmark/safety tests yeniden çalıştır.
- API değişikliğinde contract tests.
- Geri alma imajı, veritabanı migration planı ve kullanıcı verisini koruyan rollback.

---

# 5. Faz faz ana uygulama planı

## FAZ 0 — tabanı koru ve tekrarlanabilir hâle getir

**Amaç:** Ek entegrasyonlar mevcut Aurora'yı bozmasın.

1. Çalışan ZIP'i ve Git commit'ini salt okunur baseline olarak sabitle.
2. `main` yerine ayrı `integration-lab` dalı aç; her büyük capability ayrı feature branch'te olsun.
3. `npm ci`, typecheck, test, build, integration verify ve eval gates sonuçlarını temiz makinada kaydet.
4. `CURRENT_STATE.md`, `MATURITY_MATRIX.md`, `KNOWN_GAPS.md` dokümanlarını sadece generator üzerinden yenile; eski elle yazılmış raporlardaki tamamlanma iddialarını karar kaynağı yapma.
5. Zip/repo dışına çıkmaması gereken `.config/Electron/Cookies`, Local Storage, Session Storage, cache, profile ve benzeri yerel kullanıcı verilerini dağıtım arşivlerinden çıkar. Daha önce paylaşılan arşivde gerçek hesap oturumu ihtimali varsa oturumları kapat/rotasyon yap.
6. API key, `.env`, browser cookie, SSH key, private token, dataset lisansı ve model dosyalarının repo dışı olduğuna dair secret scan kur.
7. Tüm kritik bileşenler için sahip, dependency, runtime, license ve `known limitations` tablosu çıkar.

**Bitiş ölçütü:** Temiz kurulum tekrarlanabiliyor; dosya/secret hijyeni taranıyor; baseline test raporu artifact olarak üretiliyor; geri dönülebilir Git checkpoint var.

## FAZ 1 — P0 güvenlik kapıları

1. Model-generated code için main process dışında, disposable, OS-level sandbox/worker tasarla.
2. Sandbox için pozitif ve negatif testler oluştur: `process`, `require`, `child_process`, filesystem traversal, DNS/network, env secrets, prototype chain, dynamic import, WASM, worker escape, symlink/hardlink, path normalization, archive bomb, fork bomb, memory/CPU exhaustion.
3. Dosya erişimini workspace allowlist ile sınırla; realpath/symlink kontrolü yap; temp root iş başına ayrı olsun.
4. Ağ egress'i kapalı varsayılan yap; alan adı/IP allowlist'i proxy seviyesinde uygula; metadata endpoint/loopback/private network erişimini engelle.
5. CPU/memory/pid/file size/stdout/stderr/time wall limits koy; child process teardown ile beraber bütün alt süreçleri kapat.
6. Control API: authentication, authorization, CSRF/CORS, rate limits, request size, path scopes, secret redaction, audit log ve secure headers kontrolü.
7. Capability izinleri en az yetki (least privilege) modeliyle uygulansın; model doğrudan kendi yetkisini genişletemesin.
8. Prompt injection güvenlik katmanlarını “dize tarama” ile sınırlama; untrusted content etiketleri, tool output isolation, policy gating ve confirmation step ekle.
9. Browser profilleri ve kimlik bilgilerini worker'a kopyalamak yerine scope/token bazlı ve kısa ömürlü erişim kullan.
10. Bağımlılık taraması, SAST, secret scanning, SBOM ve lisans taramasını CI'a bağla.
11. Yazma/silme, e-posta yollama, publish/deploy, ödeme, hesap değişikliği, robot hareketi gibi etkili işlemleri “önizleme + kullanıcı onayı” katmanından geçir.

**Bitiş ölçütü:** P0 tehdit modelinde her riskin testi var; güvenilmeyen kodun OS seviyesindeki izolasyon sınırını aşamadığı kanıtlanmış; en kritik API testleri geçiyor. Sadece unit testin geçmesi yeterli değil; red-team senaryoları gerekli.

## FAZ 2 — gerçek-model değerlendirme platformu

1. Mock provider testlerini birim testlerde koru, fakat gerçek kaliteyi bunlardan türetme.
2. En az iki gerçek sağlayıcı (biri açık/yerel, biri API olabilir) ile küçük, tekrarlanabilir görev kümesi oluştur.
3. Model/agent/run metadata'sını kaydet: sürüm, prompt, tool schema, temperature, max tokens, context, environment image, permission scopes, cost.
4. `task`, `attempt`, `tool_call`, `artifact`, `verification`, `failure` veri modelini sabitle.
5. Başarıyı alt durumlara ayır: complete, partial, wrong, unsafe, blocked, unavailable, unverified; net success yalnızca doğru sonuç + gerekli kanıt varsa verilsin.
6. `Inspect AI` gibi evaluation framework'lerini Aurora eval sistemine adapte ederek prototiple; komple eval stack'i körlemesine değiştirme. Resmî kaynak: https://github.com/UKGovernmentBEIS/inspect_ai
7. Kodlama için SWE-bench/benzer açık issue görevleri; bilgisayar kullanımı için OSWorld/BrowserGym benzeri benchmark'ları aday olarak incele. Dataset koşulları, görev sürümü ve lisans ayrı kontrol edilsin.
8. 50 görevlik ilk pilotu 200+ task'e çıkar; alan başına en az 20 kritik hata türü ekle.
9. Holdout test setini prompt ayarlama sırasında kullanma; model/developer overfitting'i önle.
10. Her release'te regression raporu, önceki versiyonla delta ve başarısız görev örnekleri üret.
11. İnsan değerlendiriciler arası uyumu kontrol et; öznel işlerde rubric ve çift puanlama kullan.
12. Tüm benchmark'larda seed/karşılaştırılabilirlik sınırlamalarını raporla.

**Bitiş ölçütü:** Gerçek modelle çalışmış en az 100 görev sonucu, kaynak kanıtı ve maliyet/latency metrikleri var; mock testleri gerçek performans diye raporlanmıyor.

## FAZ 3 — ortak capability registry ve provider gateway

1. CapabilityManifest gibi ortak manifest şemasını kur.
2. Provider adapter, tool capability, data connector, workflow service ve domain specialist kavramlarını ayrı tut.
3. Capability lifecycle: discovered → approved → installed → tested → enabled → degraded → disabled → retired.
4. Health check, feature flag, timeout, retry/circuit breaker, concurrency, cancellation, backpressure ve quota ekle.
5. Tool-result contract'ında artifact ref + evidence + status zorunlu olsun.
6. Model routing: göreve göre kalite, gizlilik, gecikme, maliyet, bağlam uzunluğu, tool call kabiliyeti, multimodal destek ve uptime kullan.
7. Fallback sadece aynı kalite sınıfı ve izin şartları sağlanıyorsa devreye girsin; sessizce çok daha düşük modelle yüksek riskli iş yapma.
8. Provider streaming durumunu gerçek sağlayıcı protokolüne göre tanımla; yanıttan sonradan sahte chunk üretmek gerçek streaming sayılmasın.
9. Resmî/model sağlayıcı SDK'larında timeout, retry, idempotency, rate limit ve error mapping'i normalize et.
10. Model profile'larına ölçülmüş benchmark bilgisi iliştir; el ile yazılan “reasoning=high” metadata'sı gerçek kalibrasyon yerine geçmesin.

**Bitiş ölçütü:** Yeni bir uzman aracı ayrı adapter + manifest ile eklenebiliyor; ana motorun çekirdeğini değiştirmek gerekmiyor; başarısız/unavailable durumları doğru yayılıyor.

## FAZ 4 — görev yürütme ve planlama çekirdeği

1. Plan → execute → observe → verify → recover döngüsünü tek bir sözleşmeye oturt.
2. Büyük işleri DAG/task graph olarak temsil et; bağımlılığı olmayan okuma görevlerini paralelleştir, yan etkili yazma işlemlerini güvenli sırala.
3. Her alt görevin kabul kriteri olsun; “çıktı üretildi” yerine başarı şartına bak.
4. Plan revizyonunu evidence-based yap: aynı başarısız yöntemi sonsuz tekrar etme.
5. Retry budget, total task budget, deadline, cancellation ve user-approved continuation ekle.
6. Önce read-only araçlarla keşif; sonra değişiklik; sonra test; en sonda commit/deploy gibi yüksek etkili işlem.
7. Ara çalışma alanları için branch/worktree/container yarat; başarısız denemeyi rollback edilebilir tut.
8. Final output'ta hangi işlerin gerçekten tamamlandığı, hangilerinin doğrulanmadığı, hangi araçların kullanıldığı ve hangi dosyaların değiştiği açıklansın.
9. Agent'lar arası rol bölme yalnızca bağımsız alt görevlerde kullanılsın; her alt ajanın output'u doğrulansın; çoğunluk oyu doğruluk kanıtı değildir.
10. Deadlock, infinite loop, context exhaustion, tool spam ve maliyet taşması için runtime guard koy.
11. Kullanıcıdan soru sormak zorunda kalmadığında güvenli varsayımla ilerle; ama belirsiz ve riskli geri döndürülemez işler için durup onay iste.
12. Plan başarı skorunu yalnızca LLM self-judge ile verme; objektif test/kabul kriteri kullan.

**Bitiş ölçütü:** En az 30 çok adımlı görevde uçtan uca tamamlama ve hata kurtarma ölçülüyor; task graph izlenebiliyor; başarısız alt görev bütün sonucun yanlışlıkla başarı sayılmasına yol açmıyor.

## FAZ 5 — uzman ajanlar: yazılım geliştirme ve bilgisayar bilimi

Önce yüksek getirili alanlardan biri olduğundan kodlama, test, debug, repo yönetimi ve build pipeline'ını güçlendir.

1. Ayrı bir sandbox'lı kodlama worker'ı için OpenHands, OpenCode, Aider ve SWE-agent gibi adayları aynı görevlerde test et. Bunları aynı anda motor olarak gömme; bir veya ikisini ilk prototipte kıyasla.
2. Kendi repo navigator'ını güçlendir: symbol index, AST, grep/ripgrep, language server, dependency graph, code search, build graph ve dosya sahipliği.
3. Planlama için “önce oku, sonra planla, küçük patch, test, diff review, retest” standardı uygula.
4. TypeScript/JavaScript, Python, Rust, Go, Java, C/C++, C#, Kotlin, Swift, PHP, Ruby, SQL, Bash/PowerShell gibi dillerde syntax/test/lint/build backendlerini ayrı capability olarak kaydet.
5. Her dil için parse/lint/typecheck/test/build/package/documentation format aşamalarını kapsayan test kümesi hazırla.
6. Git branch/worktree/patch apply/conflict resolution, commit message ve code review işleri; force push / delete / deploy için onay.
7. Test yazma ve coverage artışı kadar regression kaçırma/false pass de ölçülsün.
8. Debugging'de log/stacktrace/benchmark/profiler toplama; rastgele değişiklik değil hipotez + test loop'u zorunlu olsun.
9. DB migration, API schema, OpenAPI contract, backwards compatibility, dependency update ve security patch işleri için özel test.
10. IDE, editor, terminal, shell, REPL, notebook, debugger, profiler, compiler, package manager, container ve CI adapter'ları oluştur.
11. Kod üretme kalitesi ile ajan yürütme kalitesini ayrı benchmark et: aynı modelle farklı agent scaffold; aynı scaffold ile farklı model.
12. Kod güvenlik denetimi için Semgrep/Trivy/Gitleaks/ZAP gibi defensive scanner'ları ekle; sonuçları otomatik düzeltmeden önce test et.
13. Dokümantasyon üretiminde kaynak koda bağlı kontrol ve snippet compilation; test edilmemiş komutları “tested” diye yazmama.
14. OSS projelerden öğrenirken repo/sürüm pinle, lisansı doğrula ve bağımlılığı minimum tut.

**Açık kaynak adayları:** [OpenCode](https://github.com/anomalyco/opencode), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Aider](https://github.com/Aider-AI/aider), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai). Adayların aynı sınıfta olmadığına dikkat et: bazıları uçtan uca ürün, bazıları agent scaffold, bazıları değerlendirme aracı.

**Kapalı kaynak referansları:** Claude Code, OpenAI Codex, GitHub Copilot, Gemini CLI/Code Assist gibi ürünler; güncel özellik ve erişim koşulları resmi dokümanlarından doğrulanır. Kıyaslamada aynı repo, aynı task, aynı izin ve benzer token/compute bütçesi kullan.

**Kapalı–açık farkını nasıl kapatacaksın:** repo bağlamını daha iyi indeksle; test komutlarını gerçek çalıştır; diff'i bağımsız gözden geçir; başarısız komutlardan kök neden çıkar; tool-call başarısını benchmark'la; görev bütçesine göre planla; modelin yetemediği örneklerde kaliteli kapalı API'yi fallback olarak bırak.

## FAZ 6 — web araştırma, tarayıcı, masaüstü ve telefon

1. Browser worker için Playwright tabanlı deterministic controls, DOM accessibility tree ve gerektiğinde screenshot/vision kullan.
2. Browser Use gibi agent katmanlarını kendi `BrowserCapability` adaptöründen çalıştır; mevcut Playwright araçlarıyla çakışmasını ölç.
3. Web search provider'ları, metin crawl, robots/ToS uyumu, URL fetch, PDF capture, source extraction ve citation verifier'ı birbirinden ayır.
4. Crawl4AI benzeri parser/crawler ile web'i LLM-ready markdown'a çevir; resmi dokümanlardaki attribution ve robots kurallarını uygulamayı unutma.
5. Kaynak toplamada site başına rate limit, robots.txt, lisans/TOS, PII ve paywall/erişim sınırlarına uy.
6. Araştırma raporunda iddia → kaynak → alıntı/parafraz → tarih → güven → çelişen kaynak zinciri tut.
7. Browser state'ini kullanıcı profilinden ayrı, izole profilde tut. Cookie ve credential'ları task worker loguna yazma.
8. Desktop automation için OS-specific adapters (Windows UIA/PowerShell, macOS accessibility/AppleScript, Linux AT-SPI/DBus) ayrı ve testli olsun.
9. Görsel click/coordinate fallback'ını son çare yap; önce semantic element locator kullan; click sonrası state değişimini doğrula.
10. File picker, download, upload, form, calendar, email, spreadsheet, slide deck, screenshot, clipboard, window/task switching ve accessibility workflows testlerini ekle.
11. Mobil cihaz için Android ADB/Accessibility ve iOS izin/kurallarını ayrı değerlendir; kullanıcının açık onayı olmadan mesaj yollama/satın alma/hesap değişimi yapma.
12. BrowserGym/OSWorld gibi benchmarkları resmi task suite ve kendi tekrar üretilebilir benchmark'ınla birlikte kullan.
13. CAPTCHA/anti-bot sınırını atlatmaya yönelik stealth davranışını varsayılan yapma; web sitesinin erişim koşullarına uy.

**Açık kaynak adayları:** [Playwright](https://github.com/microsoft/playwright), [Browser Use](https://github.com/browser-use/browser-use), [Crawl4AI](https://github.com/unclecode/crawl4ai), [SearXNG](https://github.com/searxng/searxng), [OSWorld](https://github.com/OSWorld/OSWorld), [BrowserGym](https://github.com/ServiceNow/BrowserGym). Lisans ve kullanım şartlarını her birinde ayrıca kontrol et.

**Kapalı kaynak referansları:** ChatGPT computer use, Claude computer-use workflows, Gemini multimodal/browser capabilities ve mevcut commercial research/search ürünleri; ürün erişimi ve feature flags zamanla değişir.

## FAZ 7 — web arama, knowledge base, belge işleme ve RAG

1. PDF, DOCX, PPTX, XLSX, CSV, HTML, Markdown, EPUB, e-posta, taranmış görüntü, ses/video transcript ve kod dokümanlarını ayrı parser'lara bağla.
2. PDF için text layer check → layout parser → OCR fallback → page-level source positions gibi pipeline kur.
3. OCR sonucu için sayfa bbox, confidence, OCR engine/model version ve image ref tut.
4. Tablo, formül, şekil, sayfa başlığı, dipnot, citation ve doküman hiyerarşisini düz metne düzleyip kaybetme.
5. [Docling](https://github.com/docling-project/docling), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Tesseract](https://github.com/tesseract-ocr/tesseract) gibi parser/OCR adaylarını farklı belge sınıflarında değerlendir.
6. Retriever: BM25/keyword + vector semantic + metadata/date filters + reranker. Sadece cosine ya da yalnızca keyword kullanma.
7. [Qdrant](https://github.com/qdrant/qdrant), [pgvector](https://github.com/pgvector/pgvector), OpenSearch/Elasticsearch sınıfını veri büyüklüğü ve işletim ihtiyacına göre benchmark et; üç vector DB'yi birden varsayılan kurma.
8. Embedding, reranker, OCR ve LLM modellerini farklı rol olarak yönlendir; hash vektörü test double'ı olabilir, üretim semantic embedding'i değildir.
9. Chunking: başlık/semantik blok, tablo ve kod özel kuralları; chunk overlap ve context window için deney.
10. Retrieval evaluation: Recall@k, precision/nDCG, citation support, answer groundedness, abstention quality.
11. Document access control ve tenant isolation; embedding'e girmeden önce ACL/secret handling.
12. Web içeriklerini source timestamp, fetched-at, canonical URL ve snapshot/hash ile sürümle.
13. Retrieval'de eski bilgi/çelişki/aynı konuda birkaç kaynağı yönet; freshness policy koy.
14. Cross-encoder reranker ve query rewriting yalnızca offline ölçümle kabul edilsin.
15. Özel domain corpus'larında lisans, PII, retention ve indexing permission kontrolü.

**Kapalı kaynak referanslar:** ChatGPT/Claude/Gemini uzun belge ve deep research; Microsoft 365 Copilot veya kurumsal search ürünleri (uygun olduğu yerde). İstenen sonuç “cevap verdi” değil, belgeyi doğru bulma + kanıta dayalı yanıt + kaynak doğru gösterimi.

## FAZ 8 — bellek, kişiselleştirme, öğrenme ve yetenek edinimi

1. Working memory, conversation memory, user preference memory, episodic memory, semantic knowledge ve task/project memory'yi ayrı tut.
2. Memory record: kaynak, zaman, güven, doğrulama durumu, ACL, expire/retention, provenance, embedding/model version.
3. Kullanıcı belleği silme/export/consent kontrollerini ekle; hassas veriyi varsayılan olarak kalıcılaştırma.
4. Hybrid retrieval + embeddings + reranker uygula; `Recall@k`, temporal query, paraphrase query, conflict resolution ve stale memory testleri oluştur.
5. [Letta](https://github.com/letta-ai/letta), [Graphiti](https://github.com/getzep/graphiti) gibi stateful/temporal graph memory yaklaşımlarını aday olarak kıyasla; mevcut Aurora belleğini tamamen değiştirmek için kanıt iste.
6. Başarılı strateji belleğini sadece görev verifier'ı geçerse güçlendir; başarısız denemeleri “başarılı skill” olarak promotion etme.
7. Skill registry: precondition, inputs, outputs, failure modes, side effects, permission scope, verifier, provenance, test corpus, version, rollback.
8. Self-improvement deneylerini offline sandbox + held-out test + regression gate içinde yap; canlı kullanıcı işine otomatik self-modification uygulama.
9. Mutation/search policy sabit operatörlerden daha iyi olacaksa bunu ablation study ile göster.
10. Capability acquisition için genel generator, static checks, security audit, known-good tests, known-bad decoys, adversarial tests, sandbox execution, independent verifier, human approval ve rollback gerekiyor.
11. “Eksik capability” saptama için açık requirement schema kullan; sahte yetenek üretmeyi ve sadece stub endpoint oluşturmayı reddet.
12. Öğrenme sinyalleri: objective task success, regression, user correction (consent ile), latency/cost, human rating. Modelin kendi güven puanı tek başına ödül olmasın.
13. World model/digital twin için gerçek state/action/next-state dataset'i, kalibrasyon, prediction intervals ve held-out rollout evaluation yoksa “simulation” iddiası verme.
14. Online model tuning/fine-tuning için data curation, privacy, eval, rollback ve model registry kurmadan üretime gitme.
15. RAG ile “belleğe alma”, supervised fine-tuning ile “ağırlık değiştirme”, RL/online policy update ile “davranış öğrenme” kavramlarını birbirine karıştırma.

**Bitiş ölçütü:** Paraphrase ve zaman sorgularında retrieval ölçülüyor; skill promotion yalnızca doğrulanan görevlerden oluyor; kendi kendine üretilen yetenek, ayrı test/güvenlik kapısından geçmeden çalıştırılamıyor.

## FAZ 9 — ses, konuşma, görsel anlama ve multimodal giriş

1. Speech-to-text, speaker diarization, voice activity detection, noise reduction, audio classification, translation, text-to-speech ve voice cloning işlerini ayrı capability'ler olarak tanımla.
2. [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) gibi STT seçeneklerini Türkçe, İngilizce, gürültü, aksan ve uzun kayıtta WER/CER ve gecikmeyle kıyasla.
3. Piper/Kokoro ve benzeri TTS adaylarını lisans, Türkçe ses kalitesi, gecikme, streaming ve kullanım şartlarına göre değerlendir. Kullanılan ses modelinin lisansı yazılım lisansından ayrı olabilir.
4. Gerçek zamanlı ses için VAD + streaming ASR + turn-taking + interruption + streaming TTS ve latency bütçesi ölç.
5. Görsel anlayış için OCR/layout + VLM + specialist vision (detection, segmentation, pose, image similarity) hibrit pipeline oluştur.
6. Aday kategorileri: Qwen-VL/InternVL benzeri açık ağırlıklı VLM aileleri, Florence-2 benzeri visual perception, SAM 2 benzeri segmentation. Tam model lisansı ve güncel benchmark her aday için ayrıca kontrol edilmeli.
7. Görüntü girişinde size/format/EXIF/metadata ve private face/doc handling güvenliği ekle.
8. Görsel QA için soruyu doğrudan modele sormanın yanında OCR + crop + region locator + independent verification kullan.
9. Audio/video zaman damgalarını koru; transcript'in hangi saniyede geçtiği bilinmeli.
10. Voice cloning yalnızca izinli kişinin açık rızasıyla; impersonation ve kimlik doğrulama bypass'ı yasaklanmalı.
11. Multimodal model seçimi resolution, frame budget, OCR quality, context, VRAM, speed ve licensing'e göre yapılmalı.

**Kapalı kaynak referanslar:** OpenAI multimodal APIs, Claude vision, Gemini multimodal, ElevenLabs, Google speech services gibi kategorik referanslar; kesin modeller/ürün planları entegrasyon günü doğrulanır.

## FAZ 10 — görsel tasarım, resim düzenleme, video ve medya üretimi

1. Text-to-image, image-to-image, inpainting, outpainting, upscaling, segmentation, background removal, vectorization, compositing ve batch generation için ayrı araçlar.
2. [ComfyUI](https://github.com/Comfy-Org/ComfyUI) üzerinden node workflow'larını ayrı bir GPU worker olarak çalıştır; GPL-3.0 yükümlülüklerini ve dağıtım mimarisini hukuk/lisans incelemesinden geçir.
3. [Hugging Face Diffusers](https://github.com/huggingface/diffusers) ve [InvokeAI](https://github.com/invoke-ai/InvokeAI) gibi alternatifleri model workflow, extensibility, license ve maintenance açısından kıyasla.
4. Model/LoRA/VAE/ControlNet/adapter/embedding kaynaklarını model registry'de tut; hash ve lisans kaydı ekle.
5. Çıktı kontrolü: safety, prompt adherence, OCR text correctness, anatomy/object counts, composition, resolution, transparency, visual similarity, output metadata.
6. Görsel düzenleme talebinde kaynak görselin kimlik/yüz koruma gibi kullanıcı kısıtlarını test setine çevir.
7. Video: text-to-video, image-to-video, video continuation, interpolation, upscaling, frame extraction, video understanding, captioning, subtitles, cut/edit, audio sync.
8. [Wan2.2](https://github.com/Wan-Video/Wan2.2) gibi video modellerini aday olarak benchmark et; model deposu Apache 2.0 dediği hâlde her bağımlılık/ön eğitim kaynağının koşulunu ayrı incele.
9. [FFmpeg](https://ffmpeg.org/) ile medya dönüştürme/encode/decode işini ayrı araçlaştır; derleme seçenekleri ve codec lisansları incelensin.
10. Video için frame budget, motion consistency, temporal artifacts, subject identity, prompt adherence, duration, resolution, FPS, VRAM ve üretim süresini ölç.
11. Audio/video gen süreçleri GPU kuyruk yönetimi, job cancellation ve output storage ile ana agent'ı bloke etmemeli.
12. İçerik provenance/watermark metadata ve kullanıcıya üretimin model tabanlı olduğunu bildirme seçeneklerini tasarla.
13. Telifli karakter, kişi görüntüsü, müzik ve marka kullanımıyla ilgili kullanıcı izinleri/uygunluk kuralları oluştur.

**Kapalı kaynak referanslar:** OpenAI image/video ürünleri, Midjourney, Adobe Firefly, Google Imagen/Veo, Runway, ElevenLabs gibi kategoriler. Bunların her birinde output/license/enterprise terms ayrı değerlendirilir.

## FAZ 11 — ofis, kişisel asistan, dosya, e-posta ve planlama

1. DOCX/XLSX/PPTX/ODF/PDF okuma-yazma/dönüştürme; şablonlu belge üretme ve kalite kontrolü.
2. [LibreOffice](https://www.libreoffice.org/) headless ve ilgili Python/JS kütüphanelerini aday olarak değerlendir; output integrity için round-trip ve golden-file tests oluştur.
3. Spreadsheet: formulas, charts, styles, pivot/data summaries, CSV import, workbook links, calculation engine differences, file preservation.
4. Slides: slide layout, theme, charts, speaker notes, accessibility, render-to-image regression, font fallback.
5. E-posta: search, draft, attachment extraction, classify, summarize; **send/delete/archive/forward** için explicit approval policy.
6. Takvim ve task tracker: availability, recurrence, timezone, conflicts, reminders; create/update/cancel için audit + confirmation.
7. Local files: search, rename, move, zip/unzip, dedupe, backup, OCR indexing; mass delete/sync işlemleri dry-run ve rollback kullanmalı.
8. Password manager/auth: sırları model context'ine koyma; vault operation sadece dar scoped secret broker üzerinden olsun.
9. Browser/mobile app login: ephemeral token/credential vault, no cookie export in logs.
10. Accessibility: screen-reader, OCR, caption, keyboard navigation, focus detection.
11. Notion/Jira/GitHub/GitLab/Slack/Discord/Google Workspace/Microsoft 365/Nextcloud connector'larını resmi API ve scope izinleriyle sıraya koy.
12. Email/calendar connectors için prompt injection'ın e-posta gövdesinden tool action'a geçişini engelle; email content untrusted data kabul edilsin.
13. Reminder/scheduler/automation için idempotency, retries, timezone-aware dates, daylight saving, misfire policy ve user-facing audit trail.

**Kapalı kaynak referanslar:** Microsoft 365 Copilot, Google Workspace/Gemini, Notion AI, Slack AI, Zapier AI ve benzeri productivity agents. Kıyaslama: task completion, data permissions, citations, output quality, side-effect safety.

## FAZ 12 — veri bilimi, istatistik, SQL, BI ve otomatik raporlama

1. Data source connectors: CSV/TSV, XLSX, Parquet, JSON, JSONL, SQLite, PostgreSQL, MySQL, DuckDB, APIs, data warehouses.
2. [DuckDB](https://github.com/duckdb/duckdb), [Polars](https://github.com/pola-rs/polars), pandas/NumPy/SciPy, Jupyter gibi runtime ve kütüphaneleri görev tipine göre seç.
3. SQL read-only role ile başla; query explain, row limit, timeout, query plan, schema discovery, PII masking ve cost limit ekle.
4. Grafik üretimi için chart spec → deterministic renderer → image check; grafik başlığı/axis/units/data source zorunlu olsun.
5. Data profile, quality checks, null/outlier/duplicate detection, data leakage, sampling bias, missingness ve schema drift testleri ekle.
6. İstatistik: confidence interval, hypothesis test, regression, power/sample size, Bayesian analysis, causal inference; varsayımları ve etki büyüklüğünü raporla.
7. ML: tabular classification/regression, clustering, time series, feature engineering, validation split, leakage tests, calibration, fairness, reproducibility, model registry.
8. Experiment: seed, environment lock, data version, experiment tracking, artifact registry, repeat-run support.
9. Notebooks'i sınırsız terminal değil, izolasyonlu compute jobs olarak çalıştır.
10. R/Julia/Matlab-like workflow'lar için runtime ve lisans koşulları; GNU Octave/Jupyter/SageMath gibi alternatifleri değerlendirme.
11. BI dashboard, scheduled reporting, anomaly alert ve data catalog; açık projeler için Apache Superset/Metabase gibi adayları ayrı lisans/hosting değerlendirmesine al.
12. Sonuç doğrulama: SQL cross-check, invariant, reconciliation, dimensional checks ve synthetic data tests.

**Kapalı kaynak referanslar:** ChatGPT/Claude/Gemini data analysis, Excel/Microsoft Copilot, Tableau/Power BI Copilot gibi ürün sınıfları. Aynı datasette doğru sonuç, grafik, kaynak gösterimi, kod yeniden üretilebilirliği ve maliyet kıyaslanmalı.

## FAZ 13 — matematik, mantık, optimizasyon ve biçimsel doğrulama

1. Numeric computation, symbolic algebra, calculus, linear algebra, discrete math, statistics, probability, optimization, operations research ve numerical simulation için ayrı test setleri.
2. [SymPy](https://github.com/sympy/sympy), NumPy/SciPy, [SageMath](https://github.com/sagemath/sage), OR-Tools gibi deterministic/symbolic tools.
3. Proof tasks için [Lean 4](https://github.com/leanprover/lean4) + [mathlib](https://github.com/leanprover-community/mathlib4) gibi formal system candidate'ları; theorem-prover'ın kabul ettiği proof, doğal dil cevabından daha güçlü doğrulama olabilir.
4. SAT/SMT: Z3/CVC5 gibi solver'ları problem tipine göre kullan; solver result'larını independently verify et.
5. Numeric precision, unit consistency, rounding, overflow, convergence, conditioning, error propagation ve interval arithmetic.
6. Optimization için objective/constraints/feasibility/optimality, solver status, deterministic reproducibility ve infeasible diagnostics.
7. Matematiksel iddiada symbolic result, numeric test, proof checker veya kaynak kanıtı yoksa certainty sınırı bildirilsin.
8. “Model çözdü” ile “formal proof verified” ayrı status olsun.

**Kapalı kaynak referanslar:** Wolfram Alpha/Mathematica, Maple ve güçlü reasoning modelleri; domain benchmark'ta symbolic/formal araçlarla kıyasla. Kapalı reasoning modeli doğru kanıt yerine ikna edici yanlış anlatı üretebilir.

## FAZ 14 — bilim ve uzman teknik alanlar

### 14.1 Araştırma genel iş akışı

- Kaynak keşfi, makale/PDF parse, bibliography/reference graph, dataset download, notebook, reproducible code, chart, literature review, contradictory findings, citation accuracy ve paper drafting.
- [OpenAlex](https://openalex.org/), Crossref, arXiv, PubMed veya ilgili bilimsel API'ler gibi kaynakları kullanım şartları ve rate limit ile bağla.
- Bilimsel iddiayı tek makaleden genelleme; meta-analysis, evidence table, study type, sample size, uncertainty ve replication state tut.

### 14.2 Biyoloji/biyoinformatik

- FASTA/FASTQ, sequence alignment, variant analysis, phylogenetics, gene expression, single-cell analysis, protein structure, pathway analysis.
- Biopython, scikit-bio, Scanpy, RDKit (kimya), OpenMM (molecular dynamics), selected open research models.
- Veri gizliliği/genomik identifiability, dataset license, biological safety ve high-risk experimental suggestion policy.

### 14.3 Kimya/malzeme/fizik

- Molecule parsing, reaction prediction, property estimation, computational chemistry, molecular dynamics, materials database search, simulation and unit tests.
- RDKit, Open Babel, OpenMM, ASE ve ilgili bilimsel paketler; model output'u fiziksel simülasyon veya deneysel kanıt gibi sunma.

### 14.4 Sağlık/medikal

- Medical documents, clinical terminology, lab result explanation, appointment admin, literature retrieval, DICOM/image pipelines (ör. MONAI, OHIF gibi adayları incele).
- Tıbbi teşhis/tedavi kararını özerk biçimde verme değil; validated data, clinical policy, professional review and clear uncertainty. HIPAA/GDPR/local regulation vb. hedef pazara göre incele.
- Medical model weights, data access, patient consent, PHI security, auditability ve clinical validation kapısı zorunlu.

### 14.5 Hukuk/politika/uyum

- Contract comparison, clause extraction, jurisdiction/date research, case law citations, compliance checklist, evidence tables.
- Lisanslı legal databases/API'leri yalnızca sözleşme izin veriyorsa kullan; web scraping ile erişim şartlarını aşma.
- Her iddia için jurisdiction, valid date, primary authority and citation. Avukat onayı/insan karar noktası olmadan bağlayıcı hukuki tavsiye/filing otomatiği yapma.

### 14.6 Finans/ekonomi/muhasebe

- Spreadsheet reconciliation, budgeting, forecasting, accounting categorization, invoice OCR, cashflow, scenario analysis, time series, portfolio metrics, risk dashboards.
- Finansal tavsiye/işlem yapma ayrı izinli yüksek risk capability; real-time market data licensing, freshness, transaction confirmation ve audit log zorunlu.

### 14.7 Tarım, iklim, çevre, enerji

- Weather/climate data, satellite imagery, GIS, crop monitoring, yield estimates, remote sensing, emissions inventory, energy/load forecast.
- OpenStreetMap, Copernicus/NASA/NOAA gibi açık veri kaynaklarının ayrı data terms ve update cadence'i var; provenance/temporal resolution tut.

**Kapalı kaynak referanslar:** Wolfram, Bloomberg/FactSet/financial data, Elsevier/Westlaw/Thomson Reuters legal databases, commercial bio/chemistry APIs ve alan-specific managed services. Kapalı veritabanı lisansı olmadan rakibin veri kapsamını taklit ettiğini varsayma.

## FAZ 15 — tasarım, 3D, CAD/CAM, mühendislik ve oyun geliştirme

1. 2D raster: GIMP, Krita; vector: Inkscape, SVG tooling; diagrams: Mermaid, draw.io; UI prototyping and design tokens.
2. 3D asset: [Blender](https://github.com/blender/blender), Open3D, trimesh, glTF/USD conversion, mesh repair, texture/material workflows.
3. CAD: [FreeCAD](https://github.com/FreeCAD/FreeCAD), [OpenSCAD](https://github.com/openscad/openscad), STEP/IGES/STL/3MF parsing; parametric constraints and geometry validation.
4. 2D/3D game: [Godot](https://github.com/godotengine/godot), Bevy and appropriate commercial engines; level editor, asset pipeline, scripting, testing, build/export, performance profiling.
5. Game development tasks: mechanic spec → prototype → code → asset creation → automated play/test → performance → packaging. Avoid claiming “playable” if only static scene or mock assets exist.
6. Electronics/EDA: KiCad, ngspice, schematic/PCB rules; high-voltage/safety critical designs must be professionally reviewed.
7. Mechanical engineering: CAD, FEA/CFD through appropriate tools, units/material assumptions, mesh refinement, solver convergence; model-created geometry needs engineering validation.
8. Civil/architecture: IFC/BIM, GIS, structural calculations and local code/version controls; no unverified compliance statements.
9. Robotics/automation: [ROS 2](https://github.com/ros2/ros2), [MuJoCo](https://github.com/google-deepmind/mujoco), Gazebo; simulation vs real hardware must be separate.
10. 3D asset and CAD files may contain proprietary or sensitive intellectual property; isolate per workspace and ensure license compatibility.

**Kapalı kaynak referanslar:** Adobe tools, Autodesk Fusion/AutoCAD, SolidWorks, Unity services, Unreal workflows, commercial CAD/CAE applications. A reference tool might be better in geometry reliability or ecosystem; close the gap by measuring round-trip, constraints, render output, scene validation, task completion and file interoperability.

## FAZ 16 — iletişim, iş akışı, CRM, proje, e-ticaret ve ev otomasyonu

1. Workflow engine: compare Temporal/Argo Workflows/Prefect and own durable state machine; do not put long-running irreversible jobs inside a request handler.
2. Visual automation: n8n is source-available/fair-code and not OSI-approved open source under its Sustainable Use License; license compatibility requires deliberate review. Node-RED and other alternatives may fit different workflow needs.
3. Connector catalog: Gmail/Calendar, Microsoft Graph, GitHub/GitLab, Jira/Linear, Slack/Discord/Matrix, Notion/Confluence, CRM, project tracker, database, cloud storage, CI/CD, ticketing, billing and commerce.
4. API connector template: OAuth scope, secret vault, pagination, rate limit, webhook signature, idempotency, retries, cursor sync, deletion/export behavior and audit.
5. CRM: lead enrichment only from permitted sources; email campaign send, CRM update, deal stage, payment or purchase need approval policy.
6. E-commerce: product catalog, order status, customer support, returns; transactions require price/stock confirmation and user consent.
7. ERP: invoices, inventory, procurement, payroll and accounting need segregation of duties, immutable audit, approval and reconciliation.
8. Home IoT: Home Assistant, MQTT, ESPHome, Node-RED-like candidates; door locks, alarms, heating/electricity and physical safety require explicit policy and fail-safe state.
9. Messaging: draft vs send split; contacts, recipients, attachment and content confirmation. Avoid social engineering, mass spam, auto-unsubscribe violations or message sending without consent.
10. Scheduling: timezone, recurrence, conflict and daylight-saving test matrix. Long-term workflow state should survive process restarts.
11. Map/routing: OpenStreetMap data (ODbL obligations), OSRM/GraphHopper/openrouteservice-like routers, GeoJSON and GIS; do not assume tiles/API are free for unrestricted commercial use.
12. Travel: compare dates/timezones, booking prices, availability, refunds, traveler details and explicit checkout confirmation; never simulate a booking and report it as booked.

**Bitiş ölçütü:** Connector scopes minimal; side effects require permission; retries don't duplicate invoices/messages; every action is traced and can be audited.

## FAZ 17 — siber güvenlik, gizlilik, kalite ve olay yönetimi

1. Defensive application security: static analysis, dependency scan, secret scan, container scan, DAST, SBOM, license compliance, CVE triage.
2. Candidate defensive tools: [Semgrep](https://github.com/semgrep/semgrep), [Trivy](https://github.com/aquasecurity/trivy), [Gitleaks](https://github.com/gitleaks/gitleaks), [OWASP ZAP](https://github.com/zaproxy/zaproxy). Lisans ve product/community/enterprise differences checked separately.
3. Attack simulation strictly in lab/authorized environments: threat modeling, prompt-injection tests, sandbox escape, auth bypass, SSRF, XSS, SQL/command injection, path traversal, deserialization, secret leakage.
4. LLM guard tests: indirect injection, poisoned pages/PDFs/emails, tool output that requests privilege escalation, malicious image/audio/transcript and data exfiltration attempt.
5. Policy enforcement independent of the model. The model cannot turn off safety gates or grant itself capabilities.
6. Red-team findings → issue → reproducer → patch → regression test → release note pipeline.
7. PII detection/redaction, data retention, encryption at rest/transit, key rotation, access audit, tenant boundaries and data export/deletion.
8. Risk classify capability: read-only low risk, writing internal, external communication, financial transaction, safety-critical physical actuation; policy differs for each.
9. High-risk fields (health, law, finance, industrial controls, cyber) require domain-specific sources, human review and calibrated abstention.
10. Evaluate false positive/false negative trade-off; simplistic universal regex filters can both miss attacks and break valid tools.

**Bitiş ölçütü:** Release has threat model, attack regression suite, known-vulnerability report, component inventory, data-retention policy and tested rollback.

## FAZ 18 — dağıtım, dayanıklılık, maliyet ve kullanıcı ürünü

1. State store migration from many independent JSON files to a deliberate persistence strategy; use transactional DB where consistency/concurrency matter; maintain JSON export/import.
2. Schema migrations are versioned/backwards-compatible; restore/backup is periodically tested.
3. Job queue workers for CPU/GPU-heavy work, backpressure, cancellation, retry budgets, dead-letter queue, and per-user quotas.
4. Metrics: success by domain, failure class, verified completion, cost, latency, retries, tool call counts, safety blocks, provider errors, memory recall and user corrections.
5. Trace each task end-to-end with redacted data; include capability/version and evidence links.
6. Provider outages and rate limits: bounded retry, circuit breaker, fallback router, local mode, status view and user-facing truthful errors.
7. Build/release: signed artifacts, reproducible packaging, SBOM, update channel, version pinning, release notes, rollback.
8. Config: validated typed schema; distinguish secrets; secure defaults, config migration and startup diagnostics.
9. Installer: Windows/Linux/macOS as supported; GPU optional capability detection; model download sizes/disk usage and hardware prerequisites shown.
10. Offline/local mode: explicit download and storage flow, model license acceptance, update strategy and no hidden telemetry.
11. Accessibility/i18n: Turkish/English first, Unicode, locale numbers/dates/time zones, RTL where needed, screen readers.
12. User UX: task plan preview for costly/risky tasks, cancellation, progress, artifact list, confidence/evidence, permission request, undo/rollback.
13. Documentation: fresh-install quickstart, model provider setup, local model setup, tool permissions, threat model, known limitations, restore/export, benchmark methodology.
14. Package separation: main product shouldn't require every GPU stack; optional domain packs installed on demand.
15. Plugin ABI and capability versioning so an adapter can fail gracefully after an update.

**Bitiş ölçütü:** Fresh install, upgrade, rollback, backup/restore, offline start and provider outage scenarios are tested on target OS/hardware matrix.

## FAZ 19 — closed-source leader comparison and continuous improvement

1. Define category benchmarks per domain, not a single synthetic “AI score.”
2. For each task, capture: Aurora OSS-only, Aurora hybrid, closed-source reference products, human baseline when feasible.
3. Control inputs, tool access, permissions, time limits, data availability and spend; explain unavoidable differences.
4. Compare not only output quality but task completion, safety, latency, cost, citations, reproducibility and recovery from failure.
5. For every gap, tag root cause: foundation model, agent orchestration, tools/connectors, missing data, verifier, policy, compute, UI or integration.
6. Prioritize high-frequency/high-severity gaps by expected benefit / implementation cost / risk.
7. Write one issue per measurable gap with baseline, target, owner, tests and exit criteria.
8. Run ablation tests: remove one component and measure whether it contributes.
9. Promote candidates to default only if statistically meaningful improvement and no critical regression.
10. Re-evaluate when model/tool versions change; don't hardcode “best OSS 2026” forever.
11. Publish an honest capability card: supported, experimental, requires API, requires GPU, offline capable, verified task types, limitations.
12. Maintain an “unsupported/not verified” state so Aurora never implies that it completed work it only simulated.

**Bitiş ölçütü:** Her major domain için current leader, OSS candidate, gap summary, benchmark score, known failures, cost/latency and next actions tracked in a living registry.

---

# 6. Alan alan genişletilebilir katalog: açık kaynak adayları, kapalı referanslar ve farkı kapatma stratejisi

**Okuma kuralı:** Listedeki adaylar “hepsini kur” listesi değildir. Her alan için aday havuzu verir. İlk 1–3 aday sandbox'ta değerlendirilir; aynı sorumluluğu yapan yığınlar birlikte seçilmez. Lisans, model ağırlığı, veri koşulu ve bakım durumu entegrasyon günü doğrulanır.

## A. Genel zekâ / LLM / model çalışma altyapısı

**Nişler:** genel sohbet, instruction following, muhakeme, uzun bağlam, kod, Türkçe/çok dil, vision-language, speech-language, embedding, reranking, classification, structured output, function/tool calling, small/on-device models, local inference, batch inference, quantization, fine-tuning, evaluation.

**Açık kaynak/weight adayları:** Qwen ailesi, DeepSeek ailesi, Llama ailesi, Mistral ailesi, Gemma ailesi, GLM ve başka açık/açık ağırlıklı aileleri model registry'de aday olarak tut; [Transformers](https://github.com/huggingface/transformers), [vLLM](https://github.com/vllm-project/vllm), [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://github.com/ollama/ollama), [SGLang](https://github.com/sgl-project/sglang) ve [MLX](https://github.com/ml-explore/mlx) çalışma altyapılarını donanıma göre değerlendir.

**Kapalı referanslar:** OpenAI API/Codex models, Anthropic Claude, Google Gemini, xAI, Azure/AWS hosted model catalogs and relevant specialized APIs. Ürün/modellerin isimleri, endpointleri, erişimi ve kullanım koşulları hızlı değişebildiğinden entegrasyondan önce resmi doküman kontrolü gerekir.

**Farkın ölçümü:** domain-specific accuracy/success, long-context recall, tool-call validity, JSON-schema compliance, calibration, latency, cost, safety, multilingual quality, image/audio capability, local RAM/VRAM.

**Entegrasyon:** tek `ModelProvider` interface + capability tags + constrained router; her model için test suite ve profile; farklı role'lere farklı modeller yönlendir. Model sayısını sırf fazla olsun diye artırma. Model cascading yalnızca ölçülmüş routing policy ile yapılmalı.

## B. Agent runtime, workflow ve multi-agent coordination

**Nişler:** durable task execution, checkpoint/resume, planner, supervisor/worker, sequential/parallel workflows, human-in-the-loop, workflow retries, event-driven tasks, long-running jobs.

**Adaylar:** Aurora'nın kendi loop'u baseline olarak korunmalı; [LangGraph](https://github.com/langchain-ai/langgraph), [PydanticAI](https://github.com/pydantic/pydantic-ai), [Microsoft Agent Framework](https://github.com/microsoft/agent-framework), [Haystack](https://github.com/deepset-ai/haystack), [CrewAI](https://github.com/crewAIInc/crewAI) ve model/agent demo depoları karşılaştırılabilir. [Temporal](https://github.com/temporalio/temporal) daha çok durable workflow altyapısıdır, tek başına LLM ajanı değildir.

**Kritik karar:** Orchestrator olarak bir tane ana mekanizma seç; alternatif framework'leri branch/prototype'ta benchmark et. İhtiyaç olan durable execution'ı ayrı Temporal benzeri servisle sağlayabilirsin.

**Kapalı referanslar:** OpenAI/Anthropic agent SDK/workflows, Google ADK / Vertex agent patterns, Copilot/Codex/Claude Code ürünleri.

**Fark kapatma:** state persistence, cancellation, trace completeness, error recovery, tool gating, durable resume ve task success measured; “agent sayısını artırmak” hedef değil.

## C. Kodlama, yazılım mühendisliği ve DevOps

**Nişler:** codebase understanding, bug fixing, feature work, refactoring, test writing, code review, security remediation, dependency update, docs, API clients, build systems, compiler errors, SQL/schema, CI/CD, deployment, release, performance profiling, migration, infrastructure-as-code, log analysis, incident resolution.

**Adaylar:** [OpenCode](https://github.com/anomalyco/opencode), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Aider](https://github.com/Aider-AI/aider), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [Cline](https://github.com/cline/cline), [Continue](https://github.com/continuedev/continue), [Goose](https://github.com/block/goose), plus language servers/AST/test tools.

**Kapalı referanslar:** Claude Code, OpenAI Codex, GitHub Copilot, Gemini Code Assist/CLI, Cursor and commercial IDE agents.

**Entegrasyon:** separate sandbox worker, git worktree, repository scanner, shell/test runner, patch applier, independent code review/verifier. Mevcut repo tools kullanılıyorsa duplicate Git logic yazma; adapter olarak bağla.

**Farkı kapat:** same tasks against SWE-bench-like issues, private Aurora repo tasks, tests pass rate, regression rate, patch acceptance, security scans, time, tokens, rollback, failure recovery.

## D. Web arama / araştırma / haber / kaynak toplama

**Nişler:** search, URL fetch, extraction, site crawl, literature review, news monitoring, source comparison, citation answer, market research, fact verification, report synthesis, change detection.

**Adaylar:** [SearXNG](https://github.com/searxng/searxng), [Crawl4AI](https://github.com/unclecode/crawl4ai), [Playwright](https://github.com/microsoft/playwright), [Scrapy](https://github.com/scrapy/scrapy), [trafilatura](https://github.com/adbar/trafilatura) and official source APIs.

**Kapalı referanslar:** Perplexity, ChatGPT Deep Research, Gemini Deep Research, commercial search/browser APIs.

**Entegrasyon:** provider-specific search adapter → canonical URL → page snapshot → parser → source-aware chunks → evidence record → citation verifier. API/search/crawler terms separately respected.

**Farkı kapat:** source recall, freshness, citation precision, claim support, conflicting evidence, robots/terms compliance, extraction success, anti-injection robustness.

## E. Browser / desktop / mobile / OS actions

**Nişler:** form fill, account navigation, booking flows, e-commerce, spreadsheets in UI, desktop apps, settings, screenshot understanding, file picker, download/upload, remote support, accessibility, Android automation, local OS admin.

**Adaylar:** Playwright, [Browser Use](https://github.com/browser-use/browser-use), [BrowserGym](https://github.com/ServiceNow/BrowserGym), OS-specific UI Automation, [OSWorld](https://github.com/OSWorld/OSWorld) for benchmark. Use a separate OS worker; browser session is sensitive state.

**Kapalı referanslar:** ChatGPT computer use, Claude computer-use, Gemini interactive capabilities and commercial RPA agents.

**Farkı kapat:** semantic locator rate, screenshot grounding, completion %, action precision, recovery from layout change, unintended side effects, accessibility test, time/cost.

## F. OCR / PDF / contracts / documents / tables

**Nişler:** scanned PDFs, books, invoices, receipts, forms, technical drawings, tables, formulas, charts, legal contracts, multi-column papers, handwriting, multilingual OCR, image captioning, doc classification, extraction/schema mapping.

**Adaylar:** [Docling](https://github.com/docling-project/docling), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Tesseract](https://github.com/tesseract-ocr/tesseract), [MinerU](https://github.com/opendatalab/MinerU), [Marker](https://github.com/VikParuchuri/marker); check license/model terms per candidate.

**Kapalı referanslar:** Azure Document Intelligence, Google Document AI, AWS Textract, Adobe PDF services, commercial legal-document analysis.

**Entegrasyon:** file sniff → malware/size guard → parser/OCR selection → normalized document AST with page/coordinate/source refs → verifier.

**Farkı kapat:** character/word error, table cell exactness, layout retention, field extraction F1, page-level citation, malformed/complex PDF, language coverage, runtime.

## G. Knowledge base / RAG / vector / graph retrieval

**Nişler:** enterprise search, personal knowledge, code search, long-term memory, temporal facts, entity resolution, deduplication, FAQ, recommendation, structured search, multi-hop query, access-controlled retrieval.

**Adaylar:** [Qdrant](https://github.com/qdrant/qdrant), [pgvector](https://github.com/pgvector/pgvector), OpenSearch, [Haystack](https://github.com/deepset-ai/haystack), [LlamaIndex](https://github.com/run-llama/llama_index), [Graphiti](https://github.com/getzep/graphiti), [Letta](https://github.com/letta-ai/letta). Don't install all databases; decide by scale/operability and benchmark.

**Kapalı referanslar:** enterprise search, hosted vector search, proprietary document-RAG systems.

**Farkı kapat:** Recall@5/10, NDCG, reranking, ACL leakage, answer grounding, memory persistence, temporal query, stale/conflict resolution.

## H. Görsel üretim / düzenleme / vision

**Nişler:** text-to-image, image edit, inpaint/outpaint, upscale, background removal, object detect, segmentation, OCR, image QA, chart understanding, screenshot, visual search, identity/subject continuity, style conditioning, product image, graphic design.

**Adaylar:** [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [Diffusers](https://github.com/huggingface/diffusers), [InvokeAI](https://github.com/invoke-ai/InvokeAI), GIMP/Krita/Inkscape, SAM 2/Grounding DINO/Florence/Qwen-VL family candidates (license and weight terms individually checked).

**Kapalı referanslar:** GPT image APIs, Midjourney, Adobe Firefly, Google Imagen, commercial vision APIs.

**Farkı kapat:** prompt adherence, visual QA, text rendering, identity/object continuity, resolution, editing constraints, safety, latency and compute. Image generation API success is not proof the visual requested properties are correct.

## I. Video / motion / animation

**Nişler:** text-to-video, image-to-video, video editing, frame interpolation, upscaling, subtitles, transcription, scene detection, summarization, motion consistency, temporal QA, avatar/animation, clip generation.

**Adaylar:** [Wan2.2](https://github.com/Wan-Video/Wan2.2), ComfyUI workflows, FFmpeg and open-source video tools; verify every model/dependency license and GPU needs.

**Kapalı referanslar:** Sora, Veo, Runway and other commercial video-generation APIs.

**Farkı kapat:** temporal coherence, identity, motion, prompt adherence, frame-level artifact rate, duration/resolution/FPS, runtime, VRAM, output rights.

## J. Ses, konuşma, müzik ve meeting intelligence

**Nişler:** ASR, VAD, diarization, meeting notes, translation, TTS, voice conversion, speech enhancement, audio classification, music generation, separation, transcription alignment, sound effects, subtitle timing.

**Adaylar:** [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Piper](https://github.com/rhasspy/piper), audio-related Hugging Face model families, FFmpeg/Audacity/Ardour/LMMS depending on task. Voice/model licenses differ.

**Kapalı referanslar:** OpenAI audio, ElevenLabs, Deepgram, Google speech, Azure speech, commercial music generation.

**Farkı kapat:** WER/CER, diarization DER, latency, Turkish quality, accents/noise, voice naturalness, speaker consent, subtitle alignment, audio artifact and privacy.

## K. Çeviri, dil ve lokalizasyon

**Nişler:** text translation, subtitles, speech translation, document translation, terminology glossary, transliteration, localization, tone adaptation, mixed-language OCR, low-resource languages.

**Adaylar:** Argos Translate/LibreTranslate-type self-hostable tools and multilingual model candidates; NLLB/model license must be carefully checked for noncommercial restrictions and language coverage.

**Kapalı referanslar:** DeepL, Google Translate, Microsoft Translator and high-quality commercial LLM translation.

**Farkı kapat:** human evaluation, COMET/chrF where appropriate, terminology compliance, idiom/format preservation, Turkish morphology, privacy, domain glossary.

## L. Ofis / üretkenlik / e-posta / takvim / dosyalar

**Nişler:** Word processing, spreadsheet modeling, slide decks, email, meeting notes, calendaring, task lists, file management, PDF-to-office conversion, knowledge capture.

**Adaylar:** LibreOffice, Apache POI, python-docx/openpyxl and official SaaS APIs; use adapters per file/API.

**Kapalı referanslar:** Microsoft 365 Copilot, Google Workspace/Gemini, Notion AI.

**Farkı kapat:** round-trip file integrity, formulas/formatting retained, correct edits, approval for send/delete, calendar timezone accuracy, artifact render checks.

## M. SQL / data engineering / analytics / BI

**Nişler:** SQL generation, query optimization, ETL/ELT, schema discovery, validation, dashboards, data cleaning, anomalies, reporting, lineage, data catalog, warehouse operations.

**Adaylar:** [DuckDB](https://github.com/duckdb/duckdb), [Polars](https://github.com/pola-rs/polars), PostgreSQL, dbt-core (verify applicable license/version), Apache Superset, Metabase (license/edition specifics), Jupyter.

**Kapalı referanslar:** Power BI Copilot, Tableau, Snowflake/Databricks managed assistants, commercial analytics.

**Farkı kapat:** result exactness, SQL semantics, performance, data leakage, chart correctness, data lineage, reproducibility, permission controls.

## N. Matematik / bilimsel hesaplama / formal methods

**Nişler:** algebra, calculus, proof, numerical methods, optimization, simulation, units, symbolic execution, theorem proof, SAT/SMT, statistics.

**Adaylar:** SymPy, NumPy/SciPy, SageMath, Lean/mathlib, Z3/CVC5, OR-Tools. Use deterministic verifier first where possible.

**Kapalı referanslar:** Wolfram Alpha/Mathematica, Maple, specialist reasoning engines.

**Farkı kapat:** proof checking, numerical error bounds, assumptions, solver result verification, reproducibility, correct statement of uncertainty.

## O. Bilimsel araştırma / makale / literatür

**Nişler:** literature survey, citation graph, evidence synthesis, paper explanation, systematic review, data extraction, replication, research code, abstract, figures and reviewer response.

**Adaylar:** OpenAlex/Crossref/arXiv/PubMed APIs (subject to terms), Docling/OCR, Jupyter, stats/plotting stack, RAG. Don't use scraping to bypass subscription and database terms.

**Kapalı referanslar:** ChatGPT/Claude/Gemini Research products, NotebookLM-like tools, domain-specific literature platforms.

**Farkı kapat:** citation accuracy, coverage, freshness, contradictory evidence, claim-source entailment, reproducible calculations, no fabricated papers.

## P. Biyoloji / sağlık / kimya / moleküler bilim

**Nişler:** sequence analysis, protein structure, gene expression, chemistry, compounds, molecular dynamics, clinical document extraction, DICOM, biomedical RAG, medical coding.

**Adaylar:** Biopython, Scanpy, RDKit, Open Babel, OpenMM, MONAI and relevant open research model families. Model weights/datasets/data rights separately vetted.

**Kapalı referanslar:** domain-specific clinical/biomedical APIs, commercial chemistry databases and medical imaging systems.

**Farkı kapat:** clinical/experimental validation, dataset shifts, calibration, data privacy, traceable evidence, human expert review, no autonomous high-stakes decisions.

## Q. Hukuk / uyum / mevzuat / sözleşme

**Nişler:** clause extraction, contract diff, citation search, regulatory updates, policy comparison, obligation matrix, legal translation, discovery/document review.

**Adaylar:** document parsers + official law/gov APIs and approved repositories; jurisdiction database needs provenance and date tracking. Legal corpus/license is often the bottleneck, not the LLM.

**Kapalı referanslar:** Westlaw, LexisNexis, Thomson Reuters CoCounsel and legal research platforms.

**Farkı kapat:** exact authority citations, jurisdiction/date, clause-level traceability, confidence/abstention, review by qualified professional. Avoid unsupported legal conclusions.

## R. Finans / muhasebe / ekonomi / piyasalar

**Nişler:** invoice extraction, categorization, reconciliation, budget, forecasting, financial statements, scenario, market analysis, tax document organization, risk dashboard.

**Adaylar:** OCR/PDF+spreadsheet stack, DuckDB/Polars, accounting data formats and licensed market data sources; Beancount/hledger-type ledgers can be evaluated for personal finance.

**Kapalı referanslar:** Bloomberg/FactSet/market-data services, commercial broker APIs, banking/enterprise copilots.

**Farkı kapat:** balance invariants, reconciliations, source dates, real-time licensing, no unapproved transactions, forecasts uncertainty and human review.

## S. Tasarım / CAD / 3D / mühendislik / mimarlık

**Nişler:** raster/vector design, diagramming, image editing, mesh creation, texture, CAD part, assemblies, parametric design, CAD conversion, simulation, architectural documents, BIM.

**Adaylar:** Blender, FreeCAD, OpenSCAD, Open3D, trimesh, Inkscape, GIMP, Krita, draw.io/Mermaid and appropriate exchange-format libraries.

**Kapalı referanslar:** Adobe Creative Cloud, AutoCAD/Fusion/SolidWorks, commercial CAD/CAE/rendering tools.

**Farkı kapat:** geometry validity, dimension correctness, parametric constraints, file interchange, render quality, simulation convergence, licensing and safety review.

## T. Oyun geliştirme / interaktif deneyim

**Nişler:** concept design, GDD, code, engine scripting, procedural levels, 2D/3D assets, animation, UI, sound, tests/playtesting, build packaging, profiling.

**Adaylar:** Godot, Blender, Krita, Audacity/LMMS, language tooling, OpenGameData/asset sources (license verified).

**Kapalı referanslar:** Unity/Unreal workflows and commercial asset-generation tools.

**Farkı kapat:** playable build, automated smoke tests, scene transitions, input handling, performance FPS/memory, asset license, reproducible export. “Project file created” ≠ “game works”.

## U. Robotics / IoT / hardware / physical environment

**Nişler:** robot navigation, simulation, perception, manipulator planning, sensor fusion, home automation, industrial telemetry, embedded code, PCB/EDA, digital twins.

**Adaylar:** ROS 2, Gazebo, MuJoCo, PyBullet, Home Assistant, ESPHome, Node-RED, KiCad, ngspice (verify current license/features and device compatibility).

**Kapalı referanslar:** NVIDIA Isaac/enterprise robotics stacks, proprietary CAD/robot orchestration and vendor hardware APIs.

**Farkı kapat:** sim-to-real tests, physical safety interlocks, deterministic emergency stop, certified controls where required, action authorization, no simulator result treated as real-world success.

## V. Siber güvenlik / IT operations / SRE

**Nişler:** code scan, CVE prioritization, secret detection, SBOM, container scanning, log triage, patch recommendations, incident timeline, backup/recovery testing, policy checks.

**Adaylar:** Semgrep, Trivy, Gitleaks, OWASP ZAP, OpenTelemetry, Prometheus, Grafana, system-level log tools. Production security operations must be authorized and defensive.

**Kapalı referanslar:** Snyk, GitHub Advanced Security, commercial SIEM/XDR/cloud security services.

**Farkı kapat:** true/false positives, coverage, exploitability context, patch regression rate, detection/response latency, incident audit. Don't turn the system into an unauthorized offensive operator.

## W. Eğitim / kişisel öğrenme / tutoring

**Nişler:** explanations, adaptive practice, course planning, flashcards, quiz, code tutor, language learning, feedback, curriculum map, learning analytics.

**Adaylar:** Moodle/Open edX ecosystem (licenses differ), Jupyter, local speech/translation, content retrieval and assessment tools.

**Kapalı referanslar:** Khanmigo, Duolingo Max, commercial AI tutoring and school copilots.

**Farkı kapat:** learning outcome, correctness, misconception detection, retention/transfer, age-appropriate safeguards, citation to curriculum, privacy.

## X. İşletme / CRM / satış / marketing / e-ticaret

**Nişler:** lead triage, CRM updates, customer-support drafts, sales analysis, campaign drafts, product descriptions, inventory, orders, returns, invoices, workflow automation.

**Adaylar:** official API adapters; ERPNext/Frappe, commerce APIs, Plane/project-management tools or workflow engines considered one by one with license/edition due diligence.

**Kapalı referanslar:** Salesforce Einstein, HubSpot AI, Zendesk AI, Shopify AI and commercial marketing platforms.

**Farkı kapat:** CRM data correctness, permission, customer response quality, conversions with causality caveat, no spam, no wrong orders/invoices, auditability.

## Y. İletişim / sosyal / topluluk yönetimi

**Nişler:** message classification, summaries, drafts, moderation assistance, community analytics, calendar/post drafts, support queues and social listening.

**Adaylar:** official platform APIs, Matrix ecosystem, analytics/open-source community tools. API policy and license/brand conditions first.

**Kapalı referanslar:** platform-native AI, social-management products.

**Farkı kapat:** moderation precision/recall, privacy, consent, platform policy compliance, no mass messaging/publishing without review.

## Z. Harita / seyahat / lojistik / konum

**Nişler:** geocoding, route planning, trip itineraries, ETA, routing with constraints, map data parsing, delivery optimization, shipment tracking.

**Adaylar:** OpenStreetMap data, OSRM, GraphHopper/openrouteservice candidates, PostGIS/QGIS/GeoPandas for spatial data; terms and ODbL obligations matter.

**Kapalı referanslar:** Google Maps Platform, HERE, Mapbox, commercial logistics/routing.

**Farkı kapat:** route correctness, freshness, traffic/ETA source, data license, access constraints, geography coverage and no fabricated reservation/status claims.

## AA. Enerji / çevre / hava / iklim / tarım

**Nişler:** weather data, climate series, satellite monitoring, emissions, energy modeling, demand forecasting, crop/soil insights, irrigation planning, ecological impact analysis.

**Adaylar:** NOAA/NASA/Copernicus/open geospatial data, raster/GIS packages, scikit-learn/PyTorch forecasting stack. Individual dataset update/usage rights must be tracked.

**Kapalı referanslar:** proprietary weather, GIS, satellite analytics and energy-forecast services.

**Farkı kapat:** forecast calibration, spatial/temporal resolution, uncertainty, observation data quality, regional validation, model drift.

## AB. Sunum / diyagram / teknik iletişim

**Nişler:** slide design, diagrams, architecture graphs, Mermaid, SVG, technical illustrations, flowcharts, charts, document rendering and report generation.

**Adaylar:** Mermaid, draw.io, LibreOffice, PptxGenJS/python-pptx and chart libraries, with rendered output checks.

**Kapalı referanslar:** PowerPoint Copilot, Canva, Figma/Diagramming tools.

**Farkı kapat:** content correctness, layout overflow, render fidelity, editable output, accessible contrast, citations and consistent visual hierarchy.

## AC. Dosya/backup/archive/data lifecycle

**Nişler:** find, summarize, classify, checksum, deduplicate, archive, convert, sync, backup, restore, metadata extraction, sensitive file detection.

**Adaylar:** standard OS APIs, ripgrep, file type utilities, archive libraries, ClamAV-type malware scan, backup tool integrations; no user data deletion until dry-run/confirm.

**Kapalı referanslar:** enterprise file search/backup/records platforms.

**Farkı kapat:** false deletion prevention, hash integrity, restore success, metadata correctness, permission preservation, rollback.

## AD. Accessibility / inclusion / assistive computing

**Nişler:** screen reader workflows, image descriptions, speech control, captions, OCR, simplified language, navigation assistance, document accessibility, keyboard-only operation.

**Adaylar:** NVDA/OS accessibility APIs, Tesseract/PaddleOCR, Whisper-family ASR, local TTS, axe-core-like accessibility testing.

**Kapalı referanslar:** platform-native accessibility assistants and commercial voice-control solutions.

**Farkı kapat:** task success for real users, keyboard/focus correctness, caption error, image description quality, language support, user-control and privacy.

## AE. API/connector/SDK/plugin ecosystem

**Nişler:** REST, GraphQL, OAuth, Webhooks, MCP servers/clients, ACP-style agent communication, SDK generation, connector sync, app marketplace, plugin discovery and update.

**Adaylar:** official MCP SDKs, OpenAPI tooling, OAuth libraries, Connector-specific SDKs, workflow adapters.

**Closed reference:** Zapier/Make integrations, vendor plugin ecosystems and closed app marketplace support.

**Farkı kapat:** schema completeness, scopes, webhook verification, idempotency, rate limits, lifecycle, signature, safe upgrades, connector coverage and compatibility tests.

## AF. Veri güveni / provenance / knowledge governance

**Nişler:** source tracking, license tracking, data lineage, model registry, dataset catalog, data quality, versioned evidence, PII detection, deletion requests.

**Adaylar:** OpenTelemetry trace IDs, MLflow-type experiment/model registry, lakeFS/DVC-type data versioning (check license/fit), SPDX/SBOM tooling.

**Closed reference:** commercial governance/catalog products.

**Farkı kapat:** traceability, reproducibility, provenance correctness, deletion propagation, data/weight license proof, access logs.

## AG. Internal AI development / fine-tuning / model research

**Nişler:** dataset preparation, training, fine-tuning, LoRA/QLoRA, synthetic data, distillation, evals, quantization, serving, model merge, inference optimization, safety evaluation.

**Adaylar:** Transformers, PEFT, TRL, Axolotl/Unsloth-type training stacks, DeepSpeed/FSDP, vLLM/llama.cpp. This is a *research track*, not first-line path to broad capability.

**Farkı kapat:** data quality/licensing, benchmark contamination, instruction adherence, reasoning/coding evaluation, safety regression, inference costs, throughput, reproducibility.

**Kural:** Yeni mimari/weight training, yalnızca çok sayıda modül eklemekten ayrı bir bütçe/araştırma hattı olarak yürüsün. Fine-tuned model mevcut frontier kapalı modeli otomatik geçmez.

## AH. Yeni nişler ve bilinmeyen kabiliyetler

- Kullanıcının isteği mevcut capability registry'de eşleşmiyorsa sistem “desteklenmiyor” deyip kapanmak yerine goal decomposition ve research mode'a geçebilir.
- Önce uygunluğu ve güvenlik riskini araştırır; bilinen OSS/API/tool adaylarını arar.
- Kullanım lisansı ve veri koşulunu kontrol eder; varsa sadece deney sandbox'ında küçük PoC oluşturur.
- Genel capability contract'a uygun adapter üretir; fixture ve known-good/known-bad testleri yazar.
- İnsan onayı ve red-team testleri olmadan capability'yi üretime açmaz.
- İlk iki benchmark görevinde değil, held-out görevlerde işe yaradığını gösterir.
- Yeni yeteneği “experimental” olarak yayınlar; verified/production durumuna geçiş kriterlerini yerine getirir.

Bu son alan, Aurora'nın “bilmediği işi yapmaya çalışması” hedefi için kritik; fakat bilinmeyen yetenek üretimi otomatik güven kazanma anlamına gelmemeli.

---

# 7. Hangi açık kaynakları önce entegre etmeli? Önerilen uygulama sırası

Bu sıra “dünyadaki mutlak en iyiler” sıralaması değildir; Aurora'nın mevcut durumuna, solo geliştiriciye getirisine ve entegrasyon maliyetine göre önerilen **deney sırasıdır**.

## İlk dalga — yüksek getiri, ortak sistem için gerekli

1. **Evaluation:** Inspect AI'dan fikir/altyapı adaptasyonu; kendi Aurora task schema ve verifiers'ı korunmalı. 
2. **Browser/OS:** Playwright + Browser Use aday benchmark; önce browser-only sandbox.
3. **Code worker:** OpenCode veya OpenHands veya Aider'dan birini başlangıç rakibi seç; üç ayrı ürünü tek agent loop olarak iç içe kullanma.
4. **Documents:** Docling + PaddleOCR/Tesseract adayları; PDF türlerine göre route.
5. **Model inference:** mevcut donanıma göre Ollama/llama.cpp (yerel prototip) veya vLLM/SGLang (uygun GPU sunucusu).
6. **Web retrieval:** SearXNG + Crawl4AI/Playwright tarzı fetch-extract; politikalara uyan official APIs tercih.
7. **Telemetry/evaluation:** OpenTelemetry + Langfuse/Phoenix-type observability; telemetry/hosting/license/telemetry defaults incelenmeli.
8. **Retrieval:** mevcut bellek hattıyla A/B test için Qdrant veya pgvector'dan birini seç; ikinci DB eklemek yalnızca ölçülen ihtiyaç varsa.

## İkinci dalga — ana yetenek kapsamını yükseltir

9. Real embedding + reranking stack; hybrid retrieval metrics.
10. Audio ASR; faster-whisper / Whisper with Turkish tests.
11. Local TTS; voice quality/license test.
12. Image generation: ComfyUI external worker; GPU queue and output verifier.
13. Office integration: LibreOffice and official connectors.
14. Data analysis worker: DuckDB + Polars + Jupyter-style sandbox.
15. Workflow durability: Temporal-like durable orchestration if current persistence/retry needs justify it.

## Üçüncü dalga — uzman alan paketleri

16. Video generation via suitable model worker; only if hardware resources support it.
17. Math formal tools: SymPy, Lean/mathlib, Z3.
18. Creative 3D/CAD: Blender/FreeCAD/OpenSCAD.
19. Scientific domain packs: RDKit/Biopython/OpenMM and licensed data.
20. Robotics/IoT, CRM/ERP, finance/legal/medical workflows only with explicit safety and review gates.

---

# 8. Kapalı kaynaklarla farkı kapatmak için alan başına “gap sheet” şablonu

Her kategori için bu tabloyu dosyada veya issue tracker'da ayrı aç:

```text
DOMAIN:
SUBTASK:
CLOSED_REFERENCE_PRODUCT + version/date:
OPEN_SOURCE_CANDIDATES + exact commit/model ID:
TASK DATASET + license + split:
BASELINE AURORA VERSION:
EQUAL-COMPUTE / EQUAL-COST CONDITION:
METRICS:
AURORA BASELINE RESULT:
OPEN SOURCE RESULT:
CLOSED REFERENCE RESULT:
GAP (absolute and relative):
FAILURE TAXONOMY:
LIKELY ROOT CAUSE: model | planner | context | retrieval | tools | verifier | data | compute | UX | security
PROPOSED CHANGE:
ABLATION TEST:
SAFETY / LICENSE FINDINGS:
ACCEPTANCE THRESHOLD:
ROLLBACK VERSION:
DECISION: adopt | keep experimental | reject | retest
```

Örnek (kodlama):
- Task: gerçek GitHub bugfix issue.
- Bitiş şartı: doğru patch + test pass + no newly introduced critical regression.
- Metrik: pass rate, regression rate, patch acceptance, time-to-verified-success, token/compute cost.
- Aurora OSS, Aurora with closed API, OpenHands with same model, closed coding product in product mode ayrı koşular.
- Hata sınıfı: model wrong / repository misunderstood / tool malfunction / test not run / verifier false positive / safety blocked / dependency unavailable.

Örnek (PDF):
- Task: taranmış Türkçe fatura ve tablo içeren 30 sayfa PDF'den alanlar çıkar.
- Bitiş şartı: golden JSON fields exact + page/coordinate evidence.
- Metrik: field exact match, OCR CER, page recall, missing field, runtime.
- Docling/PaddleOCR/Tesseract pipeline vs cloud document API; aynı PDF seti ve aynı hedef schema.

---

# 9. Test ve benchmark kataloğu

## Core agent tests

- Multi-step planning; missing input; ambiguous task; task deadline.
- Tool call with valid/invalid schema; wrong tool choice; tool unavailable.
- Tool output poisoning/prompt injection; conflicting outputs.
- One stage failure and retry; deterministic retry; no infinite loop.
- Long-running process and app restart; resume from checkpoint.
- Partial result, cancellation, user veto, rollback.
- Parallel read tasks; sequential conflicting writes.
- Model rate limit, outage, malformed JSON, timeout, context limit.
- Tool returns false success; verifier catches it.
- Model claims a file was created but it doesn't exist.

## Code tasks

- Fix issue; add feature; tests; debug; refactor; code review; dependency/CVE update.
- Multi-language baseline; large repo; long build; failing test; noisy logs.
- File deletion prevention; network disabled; sandbox escape attempt.
- Hidden regression test; generated patch compiles but behavior wrong.

## Browser/desktop tasks

- Find source and cite; fill but do not submit; submit after approval; search/filter/sort.
- UI layout changes; session expiry; login challenge; popup; download; file upload.
- Browser content asks to reveal secret/run tool; deny.
- Payment/booking/email send must pause for explicit confirmation.

## RAG/document tasks

- Paraphrase/semantic retrieval; temporal question; contradictory source; stale page.
- Scan PDF, rotated page, table, multi-column, formula, Turkish, handwritten page.
- Citation must support exact claim; source URL invalid; no reliable evidence → abstain.
- ACL/tenant boundary; retrieval not leak restricted docs.

## Multimodal tasks

- OCR exactness, visual query, crop/region grounding, chart/table understanding.
- Image edit constraints, face/identity condition, object count, text rendering.
- STT with Turkish/English/mixed language/noisy audio; diarization and timestamps.
- Video temporal consistency, frame accuracy, subtitles and audio sync.

## Data/science/math tasks

- Known-answer SQL query; schema changes; null/duplicate/outlier.
- Numeric computation with reference result; unit conversion; symbolic solve.
- Statistical assumptions; code reproducibility; data leakage.
- Formal proof accepted by checker; solver says unknown/infeasible; numerical convergence.

## Business/safety tasks

- User data deletion/export; permission violation; double webhook; duplicate invoice.
- Wrong recipient; incorrect timezone; purchase confirmation; regulated legal/medical/financial question.
- User asks to do something unsafe/out-of-scope; accurate refusal and safe route.

---

# 10. Lisans ve yasal uygunluk: açık kaynak gözüyle değil dosya bazında düşün

**“GitHub'da herkese açık” ile “lisans açısından istediğin şekilde kullanabilirsin” aynı şey değildir.** Her package/model/data asset için ayrı kayıt gerekir.

## Kontrol edilecek katmanlar

1. **Agent/framework code license:** source code, plugin code, UI, backend, examples.
2. **Model weights license:** commercial use, redistribution, derivative fine-tuning, attribution, acceptable use policy, monthly active user/revenue restrictions, gated access.
3. **Training/dataset license:** text/image/audio rights, personal data, opt-out, restrictions on generated derivative dataset.
4. **Runtime/dependency licenses:** FFmpeg codecs/build, browser drivers, Python/Node deps, system packages, fonts, templates.
5. **Generated output rights:** does not automatically imply underlying model output is unencumbered; model card and product terms review.
6. **Hosted service/TOS:** API data retention/training, request rights, rate limit, end-user terms, data localization.
7. **Distribution obligation:** LICENSE, NOTICE, copyright attribution, source offer, copyleft, source disclosure, trademark.

## İhlal riski yüksek örnekler

- [ComfyUI](https://github.com/Comfy-Org/ComfyUI) main repo's LICENSE is GPL-3.0; distribution and derivative-work obligations must be reviewed.
- [Wan2.2](https://github.com/Wan-Video/Wan2.2) states model license is Apache 2.0 in its repository; still verify code/dependency/model-specific assets.
- [n8n](https://github.com/n8n-io/n8n) Community/Sustainable Use License is fair-code/source-available, not OSI-approved open source as described in n8n's own docs. Don't list it as unrestricted OSS.
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) repo declares `autogpt_platform/` under Polyform Shield and other portions under MIT; repository must be evaluated by specific folder/component, not brand name.
- [Langfuse](https://github.com/langfuse/langfuse) says MIT except `ee` folders; verify exact paths and enterprise code.
- [Crawl4AI](https://github.com/unclecode/crawl4ai) changelog states Apache 2.0 with required attribution clause; follow actual current license text.
- Model families may have “open weights” but different custom/model-use licenses or data limitations. Do not infer a model license from framework license.

## Required artifacts per release

- SPDX SBOM or equivalent package inventory.
- License report grouped by direct/transitive dependencies and model assets.
- Notices/attribution file.
- Exact commit + tag + download hash.
- Security scan report and accepted CVE exceptions.
- Model card/dataset provenance and terms.
- Update/revocation policy for unsafe or relicensed upstream project.

This is engineering process guidance, not legal advice. For commercial distribution or copyleft/ambiguous licenses, seek legal review before bundling or modifying.

---

# 11. Model and hardware plan: local-first but not local-only

## Model tiers

- **Tier 0 — deterministic tools:** parser, calculator, tests, database, formatters and verifiers; use before LLM when possible.
- **Tier 1 — fast small model:** classification, routing proposal, extraction, short summary; local when quality is sufficient.
- **Tier 2 — general worker model:** everyday drafting, code patch, document reasoning; local or API depending on budget/latency.
- **Tier 3 — high-reasoning/frontier model:** complex ambiguous/high-value tasks; API only if policy allows, or best available local model.
- **Tier 4 — specialist models:** vision, ASR, TTS, image/video generation, embeddings, rerankers, OCR and domain specialists.
- **Tier 5 — verifier:** deterministic tests, schema checks, symbolic engines, second model or human review; do not default to the same model as sole judge.

## Router policy

For each request, consider:

- Domain/type and expected task risk.
- Required modality/tool calls/context length.
- Current measured quality per candidate.
- Data privacy and whether external APIs are permitted.
- Latency/service availability/budget/hardware utilization.
- Need for reproducible deterministic output.
- Fallback quality threshold; if no acceptable model available, clearly report unavailable/unverified.

## What not to do

- Don't pass a task through 10–40 models by default: latency, cost and disagreement often increase without quality gain.
- Don't route every task to the biggest model; deterministic tool calls may solve it better.
- Don't call local model “free”: account for GPU, power, download, quantization quality, memory, runtime and maintenance.
- Don't assume local weight model at 27B+ will provide frontier-level tool/agent performance on modest hardware; measure actual tok/s, VRAM, quality and concurrency.
- Don't fine-tune before a benchmark can show a repeatable deficiency and a held-out set proves the improvement.

---

# 12. Production readiness exit checklist

Aurora should not be declared production-ready until **all relevant criteria** are satisfied for the product's actual intended threat model and supported environments.

## Correctness & reliability

- [ ] Critical capabilities have real-model acceptance tests.
- [ ] End-to-end task success is measured on frozen held-out suite.
- [ ] False success and unsupported claims are tested.
- [ ] Retry loops terminate; cancellation and resume work.
- [ ] Persistent state has schema migrations and tested recovery.
- [ ] Multi-user/concurrent sessions don't leak data.
- [ ] External side effects are idempotent or approval-gated.

## Security & privacy

- [ ] OS sandbox isolation proven by adversarial tests.
- [ ] API auth/authorization/default bind is secure.
- [ ] Tool least privilege, egress restrictions and secret masking work.
- [ ] Prompt injection/indirect injection regression suite runs in CI.
- [ ] SBOM, vulnerability scan and secret scan run every release.
- [ ] PII retention, export/deletion and logging policy are documented.
- [ ] All high-impact activities require correct approval.

## Quality and performance

- [ ] Latency/cost/reliability SLOs defined and measured.
- [ ] Benchmark shows improvement vs baseline for each enabled domain.
- [ ] Fallbacks tested for outage/rate-limit/provider change.
- [ ] GPU-heavy jobs are queued/cancellable and don't exhaust system.
- [ ] Model/provider updates are pinned and rolled back safely.

## Product and operations

- [ ] Clean install/update/uninstall tested on target OS.
- [ ] Local vs API mode clearly identified.
- [ ] Capability cards show supported/experimental/unavailable status.
- [ ] User can view/cancel task, inspect artifacts, approve side effects and undo where possible.
- [ ] Docs, known limitations and error messages are truthful.
- [ ] Monitoring, support bundle and recovery instructions exist.

## Open-source integration governance

- [ ] Every component has owner, upstream, commit/version, license and model/dataset terms.
- [ ] No unreviewed `main`/`latest` dependency in release.
- [ ] License notices and attribution are packaged.
- [ ] Abandoned/compromised upstream can be disabled/replaced.
- [ ] Component update triggers benchmark and security scans.

---

# 13. Önerilen başlangıç backlog'u — ilk 30 iş

Bu sıralama, en fazla sonraki işi mümkün hâle getiren maddelerden başlar:

1. [ ] Baseline git tag + reproducible clean install / full check report.
2. [ ] Published-archive secret/profile cleanup; scanner in CI.
3. [ ] Sandbox threat model + escape tests; OS-level isolation proposal.
4. [ ] Sandbox fix; deny network by default; hard resource limits.
5. [ ] Control API secure defaults/authz/CORS/rate limits audit.
6. [ ] Model-generated tool inputs treated as untrusted; capability-level permissions.
7. [ ] Real provider evaluation runner, no mock metrics labeled as real.
8. [ ] 100-task cross-domain benchmark starter and frozen holdout split.
9. [ ] Task result contract + evidence/artifact references standardized.
10. [ ] Capability manifest schema and registry validator.
11. [ ] Integration test harness to run external service/worker adapters.
12. [ ] Model gateway/provider health/rate-limit/fallback metrics.
13. [ ] Router baseline and same-task candidate comparison harness.
14. [ ] Task graph / verification / failure-recovery loop acceptance tests.
15. [ ] Parallel read tasks, serialized side effects and idempotency tests.
16. [ ] Independent verifier per core task class.
17. [ ] Browser worker prototype with Playwright and isolated profile.
18. [ ] Browser Use versus native browser tool benchmark.
19. [ ] Coding worker prototype: select OpenCode OR OpenHands OR Aider for first A/B.
20. [ ] Real repo bugfix benchmark; tests/build/diff verifier.
21. [ ] PDF/OCR benchmark corpus: native PDF, scan, tables, Turkish, rotated pages.
22. [ ] Docling versus PaddleOCR/Tesseract pipeline comparison.
23. [ ] Hybrid memory retrieval baseline; real embedding + reranking experiment.
24. [ ] Recall@k/paraphrase/temporal/conflict benchmark.
25. [ ] Persistence inventory and migration design for JSON-heavy services.
26. [ ] OpenTelemetry trace context through model/tool/verification stages.
27. [ ] Release SBOM + license report + vulnerability scan.
28. [ ] Local model serving prototype appropriate to current hardware.
29. [ ] Whisper/faster-whisper Turkish ASR test; latency and quality baseline.
30. [ ] Capability dashboard: verified/experimental/unavailable + last benchmark evidence.

Only after these show real improvements should you widen the installation to many additional domain workers.

---

# 14. Resource and solo-developer strategy

Given a solo maintainer, the biggest danger is maintenance debt from many separate repositories and runtimes. Keep the number of actively maintained stacks small.

- Have **one common Aurora core**, not a dozen overlapping orchestration frameworks.
- Choose **one primary tool per responsibility** and keep at most one challenger in evaluation.
- Prefer separate workers/HTTP/CLI/MCP adapters over vendoring entire repositories.
- Use GPU worker queues for image/video/large models; don't require every user to install all models.
- Track “time to maintain” as a real metric; an OSS package that wins a benchmark by 1% but adds a fragile 3-runtime dependency may be a net loss.
- Separate `core`, `domain packs`, `model packs`, and optional `commercial API packs` as installable modules.
- Make a small number of verified tasks excellent before adding hundreds of unverified capabilities.
- New capability promotion to stable requires tests, red-team checks, benchmark, documentation, owner, license/provenance and rollback.

## “İnsanlar neden Aurora'yı kullansın?” sorusunun cevabı

Aurora'nın farkı “800 entegrasyonum var” olmamalı. Şu üç avantajdan en az birini gerçekten kanıtlamalı:

1. Bir görevi birçok uygulama/model arasında tek workflow ile uçtan uca tamamlama.
2. Kullanıcının verisini yerelde veya seçtiği sağlayıcıda güvenli ve şeffaf şekilde çalıştırma.
3. Başarısız görevi gerekçeli biçimde toparlama, sonucu kanıtla doğrulama ve kişisel/kurumsal çalışma biçimine uyum sağlama.

Geniş kapsam önemli; ama güvenilir sonuçlar olmadan kapsam ürün değerine dönüşmez.

---

# 15. Resmî/primary kaynak başlangıç listesi

Aşağıdaki linkler, adayların kendi repo/docs sayfalarını kontrol etmek için başlangıç noktalarıdır; her biri entegrasyon öncesi güncel commit, lisans ve kullanım koşulları açısından yeniden incelenmelidir.

## Agent/coding/workflow

- [OpenCode](https://github.com/anomalyco/opencode)
- [OpenHands](https://github.com/All-Hands-AI/OpenHands)
- [Aider](https://github.com/Aider-AI/aider)
- [SWE-agent](https://github.com/SWE-agent/SWE-agent)
- [Cline](https://github.com/cline/cline)
- [Continue](https://github.com/continuedev/continue)
- [Goose](https://github.com/block/goose)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [PydanticAI](https://github.com/pydantic/pydantic-ai)
- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)
- [Haystack](https://github.com/deepset-ai/haystack)
- [Temporal](https://github.com/temporalio/temporal)
- [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai)
- [DSPy](https://github.com/stanfordnlp/dspy)

## Browser/research

- [Playwright](https://github.com/microsoft/playwright)
- [Browser Use](https://github.com/browser-use/browser-use)
- [BrowserGym](https://github.com/ServiceNow/BrowserGym)
- [OSWorld](https://github.com/OSWorld/OSWorld)
- [Crawl4AI](https://github.com/unclecode/crawl4ai)
- [SearXNG](https://github.com/searxng/searxng)
- [Scrapy](https://github.com/scrapy/scrapy)

## Models/inference/RAG/memory

- [Transformers](https://github.com/huggingface/transformers)
- [vLLM](https://github.com/vllm-project/vllm)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [Ollama](https://github.com/ollama/ollama)
- [SGLang](https://github.com/sgl-project/sglang)
- [Qdrant](https://github.com/qdrant/qdrant)
- [pgvector](https://github.com/pgvector/pgvector)
- [Letta](https://github.com/letta-ai/letta)
- [Graphiti](https://github.com/getzep/graphiti)
- [DSPy](https://github.com/stanfordnlp/dspy)

## Documents/audio/visual/media

- [Docling](https://github.com/docling-project/docling)
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
- [Tesseract](https://github.com/tesseract-ocr/tesseract)
- [MinerU](https://github.com/opendatalab/MinerU)
- [Whisper](https://github.com/openai/whisper)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Piper](https://github.com/rhasspy/piper)
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI)
- [Diffusers](https://github.com/huggingface/diffusers)
- [Wan2.2](https://github.com/Wan-Video/Wan2.2)
- [FFmpeg](https://ffmpeg.org/)

## Data/science/creative/robotics

- [DuckDB](https://github.com/duckdb/duckdb)
- [Polars](https://github.com/pola-rs/polars)
- [SymPy](https://github.com/sympy/sympy)
- [SageMath](https://github.com/sagemath/sage)
- [Lean 4](https://github.com/leanprover/lean4)
- [mathlib4](https://github.com/leanprover-community/mathlib4)
- [RDKit](https://github.com/rdkit/rdkit)
- [OpenMM](https://github.com/openmm/openmm)
- [Blender](https://github.com/blender/blender)
- [FreeCAD](https://github.com/FreeCAD/FreeCAD)
- [OpenSCAD](https://github.com/openscad/openscad)
- [Godot](https://github.com/godotengine/godot)
- [ROS 2](https://github.com/ros2/ros2)
- [MuJoCo](https://github.com/google-deepmind/mujoco)

## Security/operations/governance

- [Semgrep](https://github.com/semgrep/semgrep)
- [Trivy](https://github.com/aquasecurity/trivy)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [OWASP ZAP](https://github.com/zaproxy/zaproxy)
- [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector)
- [Prometheus](https://github.com/prometheus/prometheus)
- [Langfuse](https://github.com/langfuse/langfuse)
- [OpenLineage](https://github.com/OpenLineage/OpenLineage)

## Primary references for selected license/maturity checks

- OpenCode repo identifies the coding agent and MIT license: https://github.com/anomalyco/opencode
- Browser Use repo and LICENSE: https://github.com/browser-use/browser-use
- PaddleOCR repo states Apache 2.0: https://github.com/PaddlePaddle/PaddleOCR
- faster-whisper repository's MIT LICENSE: https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE
- Piper repository's MIT LICENSE: https://github.com/rhasspy/piper/blob/master/LICENSE.md
- Wan2.2 repository states its model license: https://github.com/Wan-Video/Wan2.2
- Qdrant repository states Apache 2.0: https://github.com/qdrant/qdrant
- Inspect AI repository states MIT: https://github.com/UKGovernmentBEIS/inspect_ai
- Temporal repository license: https://github.com/temporalio/temporal/blob/main/LICENSE
- n8n's own license explanation: https://docs.n8n.io/sustainable-use-license/
- AutoGPT license distinctions: https://github.com/Significant-Gravitas/AutoGPT/blob/master/LICENSE
- ComfyUI GPL license: https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE
- Crawl4AI current repo/license/changelog: https://github.com/unclecode/crawl4ai
- Blender license and dependencies: https://github.com/blender/blender/blob/main/release/license/license.md
- FreeCAD source license explanation: https://github.com/FreeCAD/FreeCAD-documentation/wiki/License.md

## Benchmark references

- SWE-bench: https://www.swebench.com/
- OSWorld: https://os-world.github.io/
- Inspect AI: https://inspect.aisi.org.uk/
- BrowserGym: https://github.com/ServiceNow/BrowserGym

---

# 16. Son karar ve uygulama kuralı

Aurora'nın her alanda en iyi olmasını istemen hedefi belirliyor; fakat teknik yöntem “bütün projeleri ekle, hepsini çalışıyor say” olmamalı. Doğru uygulama şudur:

1. **Mevcut Aurora'yı koru.** Önce güvenlik ve gerçek ölçüm açıklarını kapat.
2. **Her alanı alt yeteneklere böl.** Kodlama = yalnızca kod yazmak değil; repo anlama, test, refactor, debug, build, deployment ve doğrulama gibi alt işlerden oluşur. Benzer şekilde her diğer alan da alt görevlere ayrılmalı.
3. **Her alt görev için kapalı referans + en az iki OSS adayı belirle.** Bunların sürüm/lisans/requirements bilgilerini kayıt altına al.
4. **Aynı görevlerde kıyasla.** Yıldız sayısıyla veya “bence en iyi” ile seçim yapma.
5. **En iyi adayı Aurora'ya adapter olarak bağla.** Kodunu komple kopyalamak en son tercih olsun; servis/CLI/library/MCP gibi en dar ve güvenli entegrasyonu seç.
6. **Farkları task failure taxonomy ile sınıflandır.** Model, data, planner, tool, verifier, hardware, safety, UX ve permission nedenlerini ayır.
7. **Farkı kapatacak değişiklikleri sırala.** Her değişiklikten önce ve sonra aynı benchmark koşsun; kazanç ölçülmüyorsa varsayılan olarak tutma.
8. **Güvenilir olmayan yetenekleri experimental bırak.** “Çalışıyor” ile “verified” ve “production evidence” ayrı durumlardır.
9. **Gelecekteki nişler için capability acquisition pipeline'ı koru.** Araştır → sandbox prototype → tests → security review → benchmark → human approval → staged rollout.
10. **Yalnızca onaylanmış görevlerde gerçek yan etki üret.** Dosya, e-posta, ödeme, deploy, hesap, fiziksel cihaz ve benzeri işlemlerde izin politikası Aurora'nın vazgeçilmez parçası olsun.

Bu plan Aurora'yı her alanda kesin bir numara yapacağını garanti etmez; hiçbir dürüst plan bunu garanti edemez. Ancak açık kaynak projeleri akıllıca birleştirip kapalı kaynak referanslarla ölçme stratejisi, mevcut çalışan kodu atıp baştan başlamak veya kontrolsüz biçimde yüzlerce modül eklemekten çok daha sistematik bir yoldur. Aurora için asıl rekabet avantajı, en fazla sayıda araca sahip olmak değil; **doğru aracı seçmek, işi güvenilir biçimde tamamlamak, sonucu kanıtlamak ve eksiklerini ölçerek kapatmaktır.**

---

# 17. V2 kapsam denetimi: önceki katalog her alanı kapsıyor muydu?

**Hayır.** V1, 34 geniş alan ailesini ve bir başlangıç kısa listesini kapsıyordu; her alt alan ve nişi ayrı ayrı kapatmıyordu. Aşağıdaki genişletme, her nişi ayrı bir yetenek kabulü, açık kaynak aday listesi, kapalı kaynak karşılaştırma sınıfı ve gap-test ile eşleştirir.

“Dünyadaki her alan” mutlak, bir kez tamamlanıp kapatılabilecek bir liste değildir: yeni meslekler, bilim dalları, yazılım paketleri ve modeller ortaya çıkar. Bu sürümün hedefi insan faaliyetlerinin mümkün olduğunca geniş alan atlasını çıkarmak ve yeni nişleri otomatik keşfetmeye uygun bir kayıt sistemi kurmaktır. Her aday **kurulması zorunlu bileşen** değil, test edilmesi gereken kısa listedir. Kod lisansı, model ağırlığı lisansı, veri seti koşulları, ticari kullanım, güncellik ve güvenlik her entegrasyon tarihinde tekrar doğrulanmalıdır.

## 17.1 AI çekirdeği, modeller, ajanlar, bellek ve değerlendirme

- **Genel LLM ve yerel inference:** [Transformers](https://github.com/huggingface/transformers), [vLLM](https://github.com/vllm-project/vllm), [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://github.com/ollama/ollama), [SGLang](https://github.com/sgl-project/sglang), [MLX](https://github.com/ml-explore/mlx), [TGI](https://github.com/huggingface/text-generation-inference). Kapalı referans: GPT, Claude, Gemini ve uzman API modelleri. Entegrasyon: tek provider gateway; donanım profili, model/weight lisansı, context ve structured-tool-call ölçümü.
- **Model eğitimi ve fine-tuning:** [PEFT](https://github.com/huggingface/peft), [TRL](https://github.com/huggingface/trl), [Axolotl](https://github.com/axolotl-ai-cloud/axolotl), [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory), [Unsloth](https://github.com/unslothai/unsloth), [torchtune](https://github.com/pytorch/torchtune), [LitGPT](https://github.com/Lightning-AI/litgpt), [DeepSpeed](https://github.com/microsoft/DeepSpeed). Kapalı referans: frontier lab model training. Gap: veri lisansı, veri kalitesi, contamination, ablation, held-out eval ve eğitim maliyeti.
- **Model hızlandırma/quantization:** [bitsandbytes](https://github.com/bitsandbytes-foundation/bitsandbytes), [GPTQModel](https://github.com/ModelCloud/GPTQModel), [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM), [llama.cpp](https://github.com/ggml-org/llama.cpp), [vLLM](https://github.com/vllm-project/vllm), [MLX](https://github.com/ml-explore/mlx). Kapalı referans: managed inference. Gap: aynı görevlerde kalite, RAM/VRAM, token/s, ilk token gecikmesi ve uzun bağlam.
- **Embedding, reranking ve retrieval:** [Sentence Transformers](https://github.com/UKPLab/sentence-transformers), [FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding), [fastembed](https://github.com/qdrant/fastembed), [TEI](https://github.com/huggingface/text-embeddings-inference), [ColBERT](https://github.com/stanford-futuredata/ColBERT), [Pyserini](https://github.com/castorini/pyserini). Kapalı referans: hosted embedding/reranking API. Gap: Türkçe ve çok dilli Recall@k, nDCG, query latency, domain-specific relevance.
- **Constrained output / schema / tool calling:** [Outlines](https://github.com/dottxt-ai/outlines), [Guidance](https://github.com/guidance-ai/guidance), [LM Format Enforcer](https://github.com/noamgat/lm-format-enforcer), [Instructor](https://github.com/567-labs/instructor), [llguidance](https://github.com/guidance-ai/llguidance). Kapalı referans: ticari JSON/schema output modları. Gap: schema-pass oranı, bozuk girdi, tool çağrılarında yetki aşımı.
- **Agent frameworkleri:** [LangGraph](https://github.com/langchain-ai/langgraph), [PydanticAI](https://github.com/pydantic/pydantic-ai), [smolagents](https://github.com/huggingface/smolagents), [Haystack](https://github.com/deepset-ai/haystack), [CrewAI](https://github.com/crewAIInc/crewAI), [Dify](https://github.com/langgenius/dify), [Flowise](https://github.com/FlowiseAI/Flowise). Kapalı referans: OpenAI/Anthropic/Google agent SDK'ları. Kural: tek ana orkestratör seç; diğerlerini benchmark/worker olarak dene.
- **Uzun görev/durable workflow:** [Temporal](https://github.com/temporalio/temporal), [Prefect](https://github.com/PrefectHQ/prefect), [Dagster](https://github.com/dagster-io/dagster), [Kestra](https://github.com/kestra-io/kestra), [Argo Workflows](https://github.com/argoproj/argo-workflows), [Apache Airflow](https://github.com/apache/airflow). Kapalı referans: managed workflow hizmetleri. Gap: crash-resume, duplicate side effects, idempotency, cancellation.
- **Multi-agent koordinasyon:** [AutoGen](https://github.com/microsoft/autogen), [LangGraph](https://github.com/langchain-ai/langgraph), [CrewAI](https://github.com/crewAIInc/crewAI), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [PydanticAI](https://github.com/pydantic/pydantic-ai). Kapalı referans: Codex/Claude/Gemini agentic workflows. Gap: tek ajana kıyasla kalite artışı, ek maliyet, aynı işi tekrar yapma, yazma çakışmaları.
- **MCP/API/connector standardı:** [Model Context Protocol SDKs](https://github.com/modelcontextprotocol), [FastMCP](https://github.com/jlowin/fastmcp), [OpenAPI Generator](https://github.com/OpenAPITools/openapi-generator), [Swagger Codegen](https://github.com/swagger-api/swagger-codegen), [Bruno](https://github.com/usebruno/bruno), [Schemathesis](https://github.com/schemathesis/schemathesis). Kapalı referans: Zapier/Make/vendor connectors. Gap: scope küçültme, rate limit, webhook imzası, idempotency.
- **Memory/personal knowledge:** [Letta](https://github.com/letta-ai/letta), [Graphiti](https://github.com/getzep/graphiti), [Mem0](https://github.com/mem0ai/mem0), [Cognee](https://github.com/topoteretes/cognee), [LlamaIndex](https://github.com/run-llama/llama_index), [Zep](https://github.com/getzep/zep). Kapalı referans: hosted agent memory. Gap: geçmiş/şimdi ayrımı, provenance, düzeltme/silme, stale fact, kullanıcılar arası sızıntı.
- **Knowledge graph/entity resolution:** [NetworkX](https://github.com/networkx/networkx), [RDFLib](https://github.com/RDFLib/rdflib), [Apache Jena](https://github.com/apache/jena), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Graphiti](https://github.com/getzep/graphiti), [Neo4j GraphRAG](https://github.com/neo4j/neo4j-graphrag-python). Kapalı referans: enterprise knowledge graph. Gap: entity F1, kaynaklı edge, çelişki çözümü, multi-hop support.
- **Vector/full-text databases:** [Qdrant](https://github.com/qdrant/qdrant), [Milvus](https://github.com/milvus-io/milvus), [Weaviate](https://github.com/weaviate/weaviate), [Chroma](https://github.com/chroma-core/chroma), [LanceDB](https://github.com/lancedb/lancedb), [pgvector](https://github.com/pgvector/pgvector), [Vespa](https://github.com/vespa-engine/vespa), [OpenSearch](https://github.com/opensearch-project/OpenSearch). Kapalı referans: managed enterprise search. Kural: hepsini kurma; ölçüme göre bir ana store seç.
- **LLM/agent benchmark ve eval:** [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai), [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness), [OpenCompass](https://github.com/open-compass/opencompass), [promptfoo](https://github.com/promptfoo/promptfoo), [DeepEval](https://github.com/confident-ai/deepeval), [Ragas](https://github.com/explodinggradients/ragas), [HELM](https://github.com/stanford-crfm/helm). Kapalı referans: vendor eval suites. Gap: gerçek model koşusu, ayrı hidden tasks, grader güvenilirliği, mock/prod ayrımı.
- **Prompt-injection ve LLM red-team:** [garak](https://github.com/NVIDIA/garak), [PyRIT](https://github.com/Azure/PyRIT), [promptfoo](https://github.com/promptfoo/promptfoo), [Giskard](https://github.com/Giskard-AI/giskard), [OWASP GenAI project](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications). Kapalı referans: commercial AI red-team. Gap: web/PDF injection, tool abuse, data exfiltration ve policy bypass.
- **LLM traces/observability:** [Langfuse](https://github.com/langfuse/langfuse), [Arize Phoenix](https://github.com/Arize-ai/phoenix), [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector), [MLflow](https://github.com/mlflow/mlflow). Kapalı referans: hosted observability. Gap: per-task model/tool/cost/evidence trace; secret/PII redaction.
- **Synthetic data / labeling / dataset QA:** [Argilla](https://github.com/argilla-io/argilla), [DataTrove](https://github.com/huggingface/datatrove), [Dolma](https://github.com/allenai/dolma), [Cleanlab](https://github.com/cleanlab/cleanlab), [Label Studio](https://github.com/HumanSignal/label-studio), [FiftyOne](https://github.com/voxel51/fiftyone). Kapalı referans: paid data operations. Gap: provenance, license, PII, dedupe, label agreement, eval contamination.
- **Capability discovery ve plugin pazarı:** [MCP Registry](https://github.com/modelcontextprotocol/registry), [OpenSSF Scorecard](https://github.com/ossf/scorecard), [OSV Scanner](https://github.com/google/osv-scanner), [deps.dev](https://deps.dev/), [Hugging Face Hub](https://github.com/huggingface/huggingface_hub), [GitHub REST API](https://docs.github.com/en/rest). Kapalı referans: agent/plugin marketplace. Gap: signed manifest, source provenance, sandbox, license and trust tier.

## 17.2 Web, tarayıcı, işletim sistemi ve yazılım geliştirme

- **Web search/research:** [SearXNG](https://github.com/searxng/searxng), [Crawl4AI](https://github.com/unclecode/crawl4ai), [Firecrawl](https://github.com/firecrawl/firecrawl), [trafilatura](https://github.com/adbar/trafilatura), [Jina Reader](https://github.com/jina-ai/reader), [Scrapy](https://github.com/scrapy/scrapy). Kapalı referans: Perplexity/Deep Research/search APIs. Gap: freshness, claim-source support, citation precision, robots/ToS.
- **Crawling/change monitoring:** [Scrapy](https://github.com/scrapy/scrapy), [Crawlee](https://github.com/apify/crawlee), [Heritrix](https://github.com/internetarchive/heritrix3), [Apache Nutch](https://github.com/apache/nutch), [Colly](https://github.com/gocolly/colly). Gap: duplicate control, rate limits, site changes, crawl permission.
- **Browser agents:** [Browser Use](https://github.com/browser-use/browser-use), [Playwright](https://github.com/microsoft/playwright), [Stagehand](https://github.com/browserbase/stagehand), [Skyvern](https://github.com/Skyvern-AI/skyvern), [BrowserGym](https://github.com/ServiceNow/BrowserGym), [agent-browser](https://github.com/vercel-labs/agent-browser), [Selenium](https://github.com/SeleniumHQ/selenium). Kapalı referans: ChatGPT/Claude computer use, enterprise RPA. Gap: same-task success, unintended action, layout changes, injection resilience.
- **Desktop UI/OS automation:** [pyautogui](https://github.com/asweigart/pyautogui), [Robot Framework](https://github.com/robotframework/robotframework), [SikuliX](https://github.com/RaiMan/SikuliX1), [TagUI](https://github.com/aisingapore/TagUI), [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter). Gap: separate OS identity, screen trace, irreversible-action approval, OS-version robustness.
- **Mobile/device automation:** [Appium](https://github.com/appium/appium), [Maestro](https://github.com/mobile-dev-inc/maestro), [scrcpy](https://github.com/Genymobile/scrcpy), [AndroidViewClient](https://github.com/dtmilano/AndroidViewClient). Gap: emulator test, permission prompts, OTP/location/contact protection.
- **Coding agents:** [OpenCode](https://github.com/anomalyco/opencode), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Aider](https://github.com/Aider-AI/aider), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [Cline](https://github.com/cline/cline), [Roo Code](https://github.com/RooVetGit/Roo-Code), [Goose](https://github.com/block/goose), [Continue](https://github.com/continuedev/continue), [Tabby](https://github.com/TabbyML/tabby). Kapalı referans: Codex, Claude Code, Cursor, Copilot, Gemini CLI. Gap: private Aurora tasks, tests pass, regressions, cost/time, verified completion.
- **Code search/AST/language servers:** [tree-sitter](https://github.com/tree-sitter/tree-sitter), [ast-grep](https://github.com/ast-grep/ast-grep), [SCIP](https://github.com/sourcegraph/scip), [Universal Ctags](https://github.com/universal-ctags/ctags), [ripgrep](https://github.com/BurntSushi/ripgrep), [OpenGrok](https://github.com/oracle/opengrok). Gap: symbol accuracy, current-branch index, line-anchored answers.
- **Linters/static analysis/type checking:** [Semgrep](https://github.com/semgrep/semgrep), [Ruff](https://github.com/astral-sh/ruff), [ESLint](https://github.com/eslint/eslint), [Biome](https://github.com/biomejs/biome), [mypy](https://github.com/python/mypy), [Pyright](https://github.com/microsoft/pyright), [PMD](https://github.com/pmd/pmd), [SpotBugs](https://github.com/spotbugs/spotbugs). Gap: independent verifier, finding precision/recall, warning baseline.
- **Test generation/property/fuzz/mutation:** [pytest](https://github.com/pytest-dev/pytest), [Hypothesis](https://github.com/HypothesisWorks/hypothesis), [Jest](https://github.com/jestjs/jest), [Vitest](https://github.com/vitest-dev/vitest), [Playwright](https://github.com/microsoft/playwright), [Cypress](https://github.com/cypress-io/cypress), [Schemathesis](https://github.com/schemathesis/schemathesis), [Atheris](https://github.com/google/atheris). Gap: reproduce fail-before/fix-after, hidden regressions, flaky-rate, mutation score.
- **Code review and collaboration:** [Reviewdog](https://github.com/reviewdog/reviewdog), [Danger](https://github.com/danger/danger), [Gerrit](https://github.com/GerritCodeReview/gerrit), [Gitea](https://github.com/go-gitea/gitea), [GitLab](https://gitlab.com/gitlab-org/gitlab). Kapalı referans: commercial code review AI. Gap: finding precision, line evidence, patch acceptance.
- **Build system/reproducible builds:** [Bazel](https://github.com/bazelbuild/bazel), [Buck2](https://github.com/facebook/buck2), [Nix](https://github.com/NixOS/nix), [Earthly](https://github.com/earthly/earthly), [Dagger](https://github.com/dagger/dagger), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx). Gap: clean build, cache invalidation, artifact reproducibility.
- **CI/CD/release signing:** [Jenkins](https://github.com/jenkinsci/jenkins), [Woodpecker CI](https://github.com/woodpecker-ci/woodpecker), [Tekton](https://github.com/tektoncd/pipeline), [Argo CD](https://github.com/argoproj/argo-cd), [Flux](https://github.com/fluxcd/flux2), [Cosign](https://github.com/sigstore/cosign). Kapalı referans: hosted CI. Gap: signed artifacts, SBOM, canary and rollback rehearsal.
- **Infrastructure-as-code/policy:** [OpenTofu](https://github.com/opentofu/opentofu), [Ansible](https://github.com/ansible/ansible), [Pulumi](https://github.com/pulumi/pulumi), [Crossplane](https://github.com/crossplane/crossplane), [Kubernetes](https://github.com/kubernetes/kubernetes), [Helm](https://github.com/helm/helm), [OPA](https://github.com/open-policy-agent/opa), [Kyverno](https://github.com/kyverno/kyverno). Gap: least privilege, destructive plan approval, drift and rollback.
- **Sandbox/container/microVM:** [Podman](https://github.com/containers/podman), [containerd](https://github.com/containerd/containerd), [gVisor](https://github.com/google/gvisor), [Firecracker](https://github.com/firecracker-microvm/firecracker), [Kata Containers](https://github.com/kata-containers/kata-containers), [nsjail](https://github.com/google/nsjail), [bubblewrap](https://github.com/containers/bubblewrap). Gap: filesystem/network isolation, quota, escape suite, workspace cleanup.
- **Databases/SQL/query tuning:** [PostgreSQL](https://github.com/postgres/postgres), [SQLite](https://github.com/sqlite/sqlite), [DuckDB](https://github.com/duckdb/duckdb), [ClickHouse](https://github.com/ClickHouse/ClickHouse), [DBeaver](https://github.com/dbeaver/dbeaver), [SQLFluff](https://github.com/sqlfluff/sqlfluff), [pgFormatter](https://github.com/darold/pgFormatter). Gap: read-only default, query result match, transaction/rollback, no unauthorized write.
- **Package and dependency maintenance:** [Renovate](https://github.com/renovatebot/renovate), [OSV Scanner](https://github.com/google/osv-scanner), [pip-audit](https://github.com/pypa/pip-audit), [Syft](https://github.com/anchore/syft), [Grype](https://github.com/anchore/grype), [ScanCode](https://github.com/nexB/scancode-toolkit). Gap: CVE prioritization, lockfile integrity, transitive license, separate update PRs.
- **Cloud/platform operations:** [Kubernetes](https://github.com/kubernetes/kubernetes), [K3s](https://github.com/k3s-io/k3s), [Helm](https://github.com/helm/helm), [Argo CD](https://github.com/argoproj/argo-cd), [OpenTofu](https://github.com/opentofu/opentofu), [Ansible](https://github.com/ansible/ansible), [Cockpit](https://github.com/cockpit-project/cockpit). Gap: recoverability, permission boundaries, operational runbook validation.
- **Queues/event streaming:** [Apache Kafka](https://github.com/apache/kafka), [NATS](https://github.com/nats-io/nats-server), [RabbitMQ](https://github.com/rabbitmq/rabbitmq-server), [Apache Pulsar](https://github.com/apache/pulsar), [Celery](https://github.com/celery/celery), [BullMQ](https://github.com/taskforcesh/bullmq). Gap: at-least/exactly-once semantics, duplicate handling, backpressure and replay.

## 17.3 Doküman, bilgi, dil, ofis, yayıncılık ve iletişim

- **PDF parse/layout/math/tables:** [Docling](https://github.com/docling-project/docling), [Marker](https://github.com/VikParuchuri/marker), [MinerU](https://github.com/opendatalab/MinerU), [Unstructured](https://github.com/Unstructured-IO/unstructured), [PyMuPDF](https://github.com/pymupdf/PyMuPDF), [pdfplumber](https://github.com/jsvine/pdfplumber), [Apache Tika](https://github.com/apache/tika). Kapalı referans: Acrobat/Azure/Google/AWS document AI. Gap: reading order, formula/table accuracy, page provenance, malformed-file safety.
- **OCR/handwriting/historical script:** [Tesseract](https://github.com/tesseract-ocr/tesseract), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Surya](https://github.com/VikParuchuri/surya), [Kraken](https://github.com/mittagessen/kraken), [eScriptorium](https://github.com/Princeton-CDH/eScriptorium), [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF). Gap: CER/WER by script/language, skew/noise, uncertain-reading marking, page coordinates.
- **Office suites, DOCX/XLSX/PPTX:** [LibreOffice](https://github.com/LibreOffice/core), [ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer), [Pandoc](https://github.com/jgm/pandoc), [python-docx](https://github.com/python-openxml/python-docx), [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl), [PptxGenJS](https://github.com/gitbrent/PptxGenJS), [Quarto](https://github.com/quarto-dev/quarto-cli). Kapalı referans: Microsoft 365/Google Workspace AI. Gap: render-and-compare, spreadsheet formula values, editability, hyperlinks, accessibility.
- **Email, calendar, contacts:** [Thunderbird](https://github.com/thunderbird/thunderbird), [Radicale](https://github.com/Kozea/Radicale), [Baïkal](https://github.com/sabre-io/Baikal), [Nextcloud](https://github.com/nextcloud/server), [mailcow](https://github.com/mailcow/mailcow-dockerized), [Roundcube](https://github.com/roundcube/roundcubemail). Gap: draft-before-send, recipient/time zone validation, scope control, duplicate event prevention.
- **Personal knowledge/read-it-later/RSS:** [Joplin](https://github.com/laurent22/joplin), [Logseq](https://github.com/logseq/logseq), [TriliumNext](https://github.com/TriliumNext/Trilium), [SilverBullet](https://github.com/silverbulletmd/silverbullet), [Wallabag](https://github.com/wallabag/wallabag), [FreshRSS](https://github.com/FreshRSS/FreshRSS). Gap: import/export, sync conflict, source refs, deletion propagation and offline access.
- **Searchable docs and enterprise search:** [OpenSearch](https://github.com/opensearch-project/OpenSearch), [Apache Solr](https://github.com/apache/solr), [Meilisearch](https://github.com/meilisearch/meilisearch), [Typesense](https://github.com/typesense/typesense), [Tantivy](https://github.com/quickwit-oss/tantivy), [Zoekt](https://github.com/sourcegraph/zoekt). Gap: ACL leakage, recall, freshness, exact deletion and tenant isolation.
- **Translation and localization:** [Argos Translate](https://github.com/argosopentech/argos-translate), [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate), [Apertium](https://github.com/apertium/apertium), [Bergamot](https://github.com/browsermt/bergamot-translator), [Weblate](https://github.com/WeblateOrg/weblate), [Pontoon](https://github.com/mozilla/pontoon), [ICU](https://github.com/unicode-org/icu). Kapalı referans: DeepL/Google/Azure Translator. Gap: Turkish idioms, technical terminology, placeholder/plural correctness and locale formatting.
- **Linguistics/NLP/language processing:** [spaCy](https://github.com/explosion/spaCy), [Stanza](https://github.com/stanfordnlp/stanza), [NLTK](https://github.com/nltk/nltk), [Flair](https://github.com/flairNLP/flair), [fastText](https://github.com/facebookresearch/fastText), [UDPipe](https://github.com/ufal/udpipe), [Apertium](https://github.com/apertium/apertium). Gap: Turkish morphology, named-entity F1, dialect coverage, corpus provenance.
- **Historical sources/archive transcription:** [Kraken](https://github.com/mittagessen/kraken), [eScriptorium](https://github.com/Princeton-CDH/eScriptorium), [Tesseract](https://github.com/tesseract-ocr/tesseract), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Zotero](https://github.com/zotero/zotero), [BagIt](https://github.com/LibraryOfCongress/bagit-python). Gap: keep scan/page provenance, normalize only in a separate layer, historical-language CER and source citation.
- **Scientific literature/systematic review:** [GROBID](https://github.com/kermitt2/grobid), [PaperQA2](https://github.com/Future-House/paper-qa), [Zotero](https://github.com/zotero/zotero), [OpenAlex](https://github.com/ourresearch/openalex), [Crossref API](https://github.com/CrossRef/rest-api-doc), [Citation.js](https://github.com/citation-js/citation-js), [ASReview](https://github.com/asreview/asreview). Kapalı referans: Elicit/Scite/Deep Research. Gap: retrieval recall, inclusion criteria, citation verification, source claim support and full-text access terms.
- **Reference managers/bibliography/citation QA:** [Zotero](https://github.com/zotero/zotero), [JabRef](https://github.com/JabRef/jabref), [Pandoc](https://github.com/jgm/pandoc), [Quarto](https://github.com/quarto-dev/quarto-cli), [Typst](https://github.com/typst/typst), [Citation.js](https://github.com/citation-js/citation-js). Gap: no fabricated citation, DOI existence, reference-render validation, source passage support.
- **Knowledge extraction/provenance:** [GROBID](https://github.com/kermitt2/grobid), [Crossref REST API](https://github.com/CrossRef/rest-api-doc), [OpenAlex](https://github.com/ourresearch/openalex), [RDFLib](https://github.com/RDFLib/rdflib), [Haystack](https://github.com/deepset-ai/haystack), [OpenRefine](https://github.com/OpenRefine/OpenRefine). Gap: every claim cites exact version/span; citation existence is not proof that the claim is supported.
- **Presentations and diagramming:** [Mermaid](https://github.com/mermaid-js/mermaid), [draw.io](https://github.com/jgraph/drawio), [Graphviz](https://gitlab.com/graphviz/graphviz), [PlantUML](https://github.com/plantuml/plantuml), [PptxGenJS](https://github.com/gitbrent/PptxGenJS), [python-pptx](https://github.com/scanny/python-pptx), [Vega-Lite](https://github.com/vega/vega-lite). Kapalı referans: PowerPoint Copilot/Canva/Visio. Gap: rendered output, overflow, editable source, chart-data correctness and accessibility.
- **Publishing, typesetting, EPUB and typography:** [Scribus](https://github.com/scribusproject/scribus), [Pandoc](https://github.com/jgm/pandoc), [Typst](https://github.com/typst/typst), [LaTeX](https://www.latex-project.org/), [Calibre](https://github.com/kovidgoyal/calibre), [FontForge](https://github.com/fontforge/fontforge). Kapalı referans: InDesign and commercial layout products. Gap: pagination, font embedding, EPUB validation, print bleed and image/font rights.
- **Content management and site publishing:** [WordPress](https://github.com/WordPress/wordpress-develop), [Ghost](https://github.com/TryGhost/Ghost), [Strapi](https://github.com/strapi/strapi), [Hugo](https://github.com/gohugoio/hugo), [Astro](https://github.com/withastro/astro), [Docusaurus](https://github.com/facebook/docusaurus), [MkDocs](https://github.com/mkdocs/mkdocs). Gap: preview before publish, script sanitization, accessibility, broken links, provenance and image/font license.
- **Email infrastructure/newsletters:** [Postal](https://github.com/postalserver/postal), [listmonk](https://github.com/knadh/listmonk), [mailcow](https://github.com/mailcow/mailcow-dockerized), [Haraka](https://github.com/haraka/Haraka), [Rspamd](https://github.com/rspamd/rspamd), [Roundcube](https://github.com/roundcube/roundcubemail). Kapalı referans: SendGrid/Mailgun/SES. Gap: SPF/DKIM/DMARC, unsubscribe/suppression, complaints, deliverability and human approval for bulk sends.
- **Writing quality/style/creative writing:** [LanguageTool](https://github.com/languagetool-org/languagetool), [Vale](https://github.com/errata-ai/vale), [Proselint](https://github.com/amperser/proselint), [Pandoc](https://github.com/jgm/pandoc), [Quarto](https://github.com/quarto-dev/quarto-cli), [novelWriter](https://github.com/vkbo/novelWriter). Kapalı referans: commercial writing assistants. Gap: user style, factual source verification, originality/plagiarism and format constraints.
- **Podcast/media production:** [Audacity](https://github.com/audacity/audacity), [Ardour](https://github.com/Ardour/ardour), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [WhisperX](https://github.com/m-bain/whisperX), [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO), [MuseScore](https://github.com/musescore/MuseScore). Gap: transcript timestamps, loudness, speaker consent, source track and no missing audio segments.
- **Data conversion and preservation:** [Pandoc](https://github.com/jgm/pandoc), [LibreOffice](https://github.com/LibreOffice/core), [Apache Tika](https://github.com/apache/tika), [Calibre](https://github.com/kovidgoyal/calibre), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [ImageMagick](https://github.com/ImageMagick/ImageMagick), [Siegfried](https://github.com/richardlehane/siegfried), [Archivematica](https://github.com/artefactual/archivematica). Gap: preserve original, checksums, metadata, roundtrip validation and safe handling of malicious files.
- **Library/ebook/reading:** [Calibre](https://github.com/kovidgoyal/calibre), [Kavita](https://github.com/Kareadita/Kavita), [Komga](https://github.com/gotson/komga), [Zotero](https://github.com/zotero/zotero), [KOReader](https://github.com/koreader/koreader), [Joplin](https://github.com/laurent22/joplin). Gap: copyright-aware quote limits, metadata accuracy, source location, conversion integrity.
- **Forms and field data:** [ODK Collect](https://github.com/getodk/collect), [KoboToolbox](https://github.com/kobotoolbox/kobocat), [LimeSurvey](https://github.com/LimeSurvey/LimeSurvey), [Formbricks](https://github.com/formbricks/formbricks). Gap: consent, offline sync conflicts, validation logic, deletion and access.

## 17.4 Görsel, video, ses, 3D, tasarım ve oyun

- **Görsel üretimi/işleme/inpaint:** [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [Diffusers](https://github.com/huggingface/diffusers), [InvokeAI](https://github.com/invoke-ai/InvokeAI), [Krita AI Diffusion](https://github.com/Acly/krita-ai-diffusion), [GIMP](https://gitlab.gnome.org/GNOME/gimp), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), [rembg](https://github.com/danielgatis/rembg). Kapalı referans: proprietary image generation/editors. Gap: prompt adherence, localized edit, artifact count, identity/subject continuity where requested, VRAM, rights/license.
- **Vision/image QA/detection:** [OpenCV](https://github.com/opencv/opencv), [MMDetection](https://github.com/open-mmlab/mmdetection), [Detectron2](https://github.com/facebookresearch/detectron2), [FiftyOne](https://github.com/voxel51/fiftyone), [Supervision](https://github.com/roboflow/supervision), [GroundingDINO](https://github.com/IDEA-Research/GroundingDINO). Gap: precision/recall by class, out-of-domain handling, model/weight license.
- **Segmentation/tracking/pose:** [SAM 2](https://github.com/facebookresearch/sam2), [Segment Anything](https://github.com/facebookresearch/segment-anything), [GroundingDINO](https://github.com/IDEA-Research/GroundingDINO), [MMTracking](https://github.com/open-mmlab/mmtracking), [CVAT](https://github.com/cvat-ai/cvat), [MMPose](https://github.com/open-mmlab/mmpose), [MediaPipe](https://github.com/google-ai-edge/mediapipe). Gap: IoU/AP, temporal identity switches, camera/device shift and consent.
- **Video generation:** [Wan](https://github.com/Wan-Video/Wan2.2), [LTX-Video](https://github.com/Lightricks/LTX-Video), [CogVideo](https://github.com/THUDM/CogVideo), [Open-Sora](https://github.com/hpcaitech/Open-Sora), [AnimateDiff](https://github.com/guoyww/AnimateDiff), [RIFE](https://github.com/hzwer/ECCV2022-RIFE). Kapalı referans: commercial video generation. Gap: temporal coherence, object consistency, duration/resolution limits, frames/sec, GPU budget and model license.
- **Video editing/compositing/rendering:** [FFmpeg](https://github.com/FFmpeg/FFmpeg), [Kdenlive](https://github.com/KDE/kdenlive), [Shotcut](https://github.com/mltframework/shotcut), [Blender](https://github.com/blender/blender), [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO), [MoviePy](https://github.com/Zulko/moviepy), [Natron](https://github.com/NatronGitHub/Natron). Gap: editable timeline, audio sync, codec compatibility, frame drops, repeatable render.
- **Speech-to-text/transcription:** [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [WhisperX](https://github.com/m-bain/whisperX), [Vosk](https://github.com/alphacep/vosk-api), [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). Kapalı referans: speech APIs. Gap: WER/CER per language/accent, noise robustness, timestamp accuracy, streaming latency.
- **Diarization/VAD/speech align:** [pyannote.audio](https://github.com/pyannote/pyannote-audio), [Silero VAD](https://github.com/snakers4/silero-vad), [NVIDIA NeMo](https://github.com/NVIDIA/NeMo), [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Montreal Forced Aligner](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner). Gap: DER, overlap, word alignment and gated-model license.
- **Text-to-speech/voice:** [Piper](https://github.com/OHF-Voice/piper1-gpl), [Coqui TTS](https://github.com/coqui-ai/TTS), [MeloTTS](https://github.com/myshell-ai/MeloTTS), [OpenVoice](https://github.com/myshell-ai/OpenVoice), [Kokoro](https://github.com/hexgrad/kokoro). Kapalı referans: commercial TTS/voice. Gap: intelligibility, Turkish prosody, latency, speaker consent and per-voice license.
- **Music/audio editing/source separation:** [Demucs](https://github.com/facebookresearch/demucs), [UVR](https://github.com/Anjok07/ultimatevocalremovergui), [Essentia](https://github.com/MTG/essentia), [librosa](https://github.com/librosa/librosa), [Audacity](https://github.com/audacity/audacity), [LMMS](https://github.com/LMMS/lmms), [MuseScore](https://github.com/musescore/MuseScore). Gap: source separation, clipping, sync, model/data rights and generated audio disclosure.
- **3D reconstruction/NeRF/Gaussian splatting:** [COLMAP](https://github.com/colmap/colmap), [Meshroom](https://github.com/alicevision/meshroom), [Open3D](https://github.com/isl-org/Open3D), [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio), [Instant-NGP](https://github.com/NVlabs/instant-ngp), [Trimesh](https://github.com/mikedh/trimesh). Gap: reconstruction completeness, scale, mesh validity, GPU and source capture provenance.
- **3D assets, mesh, animation, interchange:** [Blender](https://github.com/blender/blender), [Assimp](https://github.com/assimp/assimp), [MeshLab](https://github.com/cnr-isti-vclab/meshlab), [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD), [OpenToonz](https://github.com/opentoonz/opentoonz), [Godot](https://github.com/godotengine/godot). Gap: rig/UV/animation, format roundtrip, render proof and asset license.
- **UI/UX/prototyping/design system:** [Penpot](https://github.com/penpot/penpot), [Excalidraw](https://github.com/excalidraw/excalidraw), [Storybook](https://github.com/storybookjs/storybook), [Tokens Studio](https://github.com/tokens-studio/figma), [Playwright](https://github.com/microsoft/playwright). Kapalı referans: Figma/Framer/Adobe product stack. Gap: buildable components, responsive layout, accessibility, visual regression.
- **Game engines:** [Godot](https://github.com/godotengine/godot), [Bevy](https://github.com/bevyengine/bevy), [O3DE](https://github.com/o3de/o3de), [GDevelop](https://github.com/4ian/GDevelop), [Defold](https://github.com/defold/defold), [Phaser](https://github.com/phaserjs/phaser), [Ren'Py](https://github.com/renpy/renpy), [LÖVE](https://github.com/love2d/love). Kapalı reference: Unreal/Unity. Gap: playable build, project export, input/state, smoke tests, FPS/memory, asset licensing.
- **Game testing/procedural levels/mods:** [Godot](https://github.com/godotengine/godot), [OpenRA](https://github.com/OpenRA/OpenRA), [Luanti](https://github.com/luanti-org/luanti), [Ren'Py](https://github.com/renpy/renpy), [Blender](https://github.com/blender/blender), [GUT](https://github.com/bitwes/Gut). Gap: level solvability, softlocks, reproducible seeds, crash and performance tests.
- **AR/VR/XR/spatial:** [OpenXR SDK](https://github.com/KhronosGroup/OpenXR-SDK), [Monado](https://github.com/Monado/monado), [Godot](https://github.com/godotengine/godot), [OpenBrush](https://github.com/icosa-foundation/open-brush), [OpenCV](https://github.com/opencv/opencv), [AprilTag](https://github.com/AprilRobotics/apriltag). Gap: tracking drift, latency, device compatibility and comfort.
- **3D scanning/point-cloud/LiDAR:** [PDAL](https://github.com/PDAL/PDAL), [Open3D](https://github.com/isl-org/Open3D), [CloudCompare](https://github.com/CloudCompare/CloudCompare), [PCL](https://github.com/PointCloudLibrary/pcl), [MeshLab](https://github.com/cnr-isti-vclab/meshlab). Gap: scale/coordinate accuracy, density, registration and noise resilience.
- **Design/image assets/library:** [ResourceSpace](https://github.com/resourcespace/resourcespace), [Piwigo](https://github.com/Piwigo/Piwigo), [Hydrus](https://github.com/hydrusnetwork/hydrus), [Immich](https://github.com/immich-app/immich), [digiKam](https://github.com/KDE/digikam), [ExifTool](https://github.com/exiftool/exiftool). Gap: duplicates, EXIF location privacy, rights/consent metadata and access scope.

## 17.5 Veri, istatistik, matematik, optimizasyon ve bilimsel hesaplama

- **Dataframe/analytics/large local datasets:** [pandas](https://github.com/pandas-dev/pandas), [Polars](https://github.com/pola-rs/polars), [DuckDB](https://github.com/duckdb/duckdb), [Dask](https://github.com/dask/dask), [Vaex](https://github.com/vaexio/vaex), [Apache Spark](https://github.com/apache/spark). Kapalı referans: Databricks/BigQuery/Snowflake. Gap: result correctness, type/NULL, memory, query plan, reproducibility.
- **ETL/data integration:** [dbt-core](https://github.com/dbt-labs/dbt-core), [Meltano](https://github.com/meltano/meltano), [dlt](https://github.com/dlt-hub/dlt), [Airbyte](https://github.com/airbytehq/airbyte), [Apache NiFi](https://github.com/apache/nifi), [DataHub](https://github.com/datahub-project/datahub). Gap: schema drift, lineage, duplicates, retry idempotency, licensing of enterprise connectors.
- **Streaming/event bus/queues:** [Apache Kafka](https://github.com/apache/kafka), [NATS](https://github.com/nats-io/nats-server), [RabbitMQ](https://github.com/rabbitmq/rabbitmq-server), [Apache Pulsar](https://github.com/apache/pulsar), [Celery](https://github.com/celery/celery), [BullMQ](https://github.com/taskforcesh/bullmq). Gap: delivery guarantees, ordering, replay, duplicate events, backpressure.
- **Notebook/experimentation:** [Jupyter](https://github.com/jupyter/notebook), [JupyterLab](https://github.com/jupyterlab/jupyterlab), [MLflow](https://github.com/mlflow/mlflow), [DVC](https://github.com/iterative/dvc), [Kedro](https://github.com/kedro-org/kedro), [Papermill](https://github.com/nteract/papermill). Gap: clean environment, reproducibility, notebook execution sandbox, dataset lineage.
- **BI/dashboard/metrics:** [Apache Superset](https://github.com/apache/superset), [Metabase](https://github.com/metabase/metabase), [Evidence](https://github.com/evidence-dev/evidence), [Lightdash](https://github.com/lightdash/lightdash), [Grafana](https://github.com/grafana/grafana), [Redash](https://github.com/getredash/redash). Kapalı referans: Power BI/Tableau/Looker AI. Gap: metric definitions, query correctness, permissions, data freshness and render QA.
- **Data quality/schema/lineage:** [Great Expectations](https://github.com/great-expectations/great_expectations), [Pandera](https://github.com/unionai-oss/pandera), [Deequ](https://github.com/awslabs/deequ), [OpenMetadata](https://github.com/open-metadata/OpenMetadata), [DataHub](https://github.com/datahub-project/datahub), [Frictionless](https://github.com/frictionlessdata/frictionless). Gap: anomaly precision, missed incidents, source lineage, contract testing.
- **Dataset versioning/discovery:** [Hugging Face Datasets](https://github.com/huggingface/datasets), [DVC](https://github.com/iterative/dvc), [DataLad](https://github.com/datalad/datalad), [Frictionless](https://github.com/frictionlessdata/frictionless), [CKAN](https://github.com/ckan/ckan), [OpenRefine](https://github.com/OpenRefine/OpenRefine). Gap: source/license per item, contamination, deduplication and schema correctness.
- **Statistics/forecasting:** [statsmodels](https://github.com/statsmodels/statsmodels), [scikit-learn](https://github.com/scikit-learn/scikit-learn), [PyMC](https://github.com/pymc-devs/pymc), [Stan](https://github.com/stan-dev/stan), [ArviZ](https://github.com/arviz-devs/arviz), [sktime](https://github.com/sktime/sktime), [Darts](https://github.com/unit8co/darts), [StatsForecast](https://github.com/Nixtla/statsforecast), [NeuralForecast](https://github.com/Nixtla/neuralforecast), [GluonTS](https://github.com/awslabs/gluonts). Kapalı referans: MATLAB/SAS/commercial forecasting. Gap: time split, leakage, calibration, uncertainty, naive baselines.
- **Causal inference/experiment design:** [DoWhy](https://github.com/py-why/dowhy), [EconML](https://github.com/py-why/EconML), [DoubleML](https://github.com/DoubleML/doubleml-for-py), [CausalML](https://github.com/uber/causalml), [PyMC](https://github.com/pymc-devs/pymc), [statsmodels](https://github.com/statsmodels/statsmodels). Gap: assumption disclosure, confounding, sensitivity analysis, causal-vs-correlational claims.
- **Symbolic mathematics/algebra:** [SymPy](https://github.com/sympy/sympy), [SageMath](https://github.com/sagemath/sage), [Maxima](https://github.com/calyau/maxima), [mpmath](https://github.com/mpmath/mpmath), [FLINT](https://github.com/flintlib/flint), [GNU Octave](https://github.com/gnu-octave/octave). Kapalı reference: Mathematica/Maple/Wolfram. Gap: exact symbolic results, numeric tolerances, units, edge cases.
- **Theorem proving/formal verification/SMT:** [Lean](https://github.com/leanprover/lean4), [Rocq/Coq](https://github.com/rocq-prover/rocq), [Isabelle](https://github.com/isabelle-prover/mirror-isabelle), [Z3](https://github.com/Z3Prover/z3), [cvc5](https://github.com/cvc5/cvc5), [Why3](https://github.com/why3/why3), [Dafny](https://github.com/dafny-lang/dafny), [Alloy](https://github.com/AlloyTools/org.alloytools.alloy). Gap: machine-checked proof artefacts, solver timeout, counterexample replay.
- **Optimization/operations research:** [OR-Tools](https://github.com/google/or-tools), [CVXPY](https://github.com/cvxpy/cvxpy), [Pyomo](https://github.com/Pyomo/pyomo), [JuMP](https://github.com/jump-dev/JuMP.jl), [HiGHS](https://github.com/ERGO-Code/HiGHS), [PuLP](https://github.com/coin-or/pulp), [Nevergrad](https://github.com/facebookresearch/nevergrad). Kapalı reference: Gurobi/CPLEX. Gap: objective/constraints explicit, feasible vs optimal reported honestly, bound/gap and solve time.
- **Hyperparameter/black-box optimization:** [Optuna](https://github.com/optuna/optuna), [Ray Tune](https://github.com/ray-project/ray), [Nevergrad](https://github.com/facebookresearch/nevergrad), [Ax](https://github.com/facebook/Ax), [SMAC3](https://github.com/automl/SMAC3). Gap: pre-defined budget, hold-out, reproducible trials and no evaluation leakage.
- **Deep learning frameworks:** [PyTorch](https://github.com/pytorch/pytorch), [JAX](https://github.com/jax-ml/jax), [Keras](https://github.com/keras-team/keras), [TensorFlow](https://github.com/tensorflow/tensorflow), [ONNX Runtime](https://github.com/microsoft/onnxruntime), [ExecuTorch](https://github.com/pytorch/executorch). Kapalı reference: model-lab internal stacks. Gap: reproducibility, accelerator compatibility, regression and deployment size.
- **Feature store/model serving/drift:** [Feast](https://github.com/feast-dev/feast), [BentoML](https://github.com/bentoml/BentoML), [KServe](https://github.com/kserve/kserve), [Seldon Core](https://github.com/SeldonIO/seldon-core), [MLflow](https://github.com/mlflow/mlflow), [Evidently](https://github.com/evidentlyai/evidently). Gap: train/serve skew, model registry, drift, rollback and p95 latency.
- **Recommendation/search ranking:** [RecBole](https://github.com/RUCAIBox/RecBole), [Microsoft Recommenders](https://github.com/recommenders-team/recommenders), [LensKit](https://github.com/lenskit/lkpy), [LightFM](https://github.com/lyst/lightfm), [NVIDIA Merlin](https://github.com/NVIDIA-Merlin/Merlin). Kapalı reference: retail/media recommenders. Gap: NDCG/recall, cold-start, diversity, subgroup metrics, consent.
- **Anomaly detection/fraud triage:** [PyOD](https://github.com/yzhao062/pyod), [River](https://github.com/online-ml/river), [Alibi Detect](https://github.com/SeldonIO/alibi-detect), [Evidently](https://github.com/evidentlyai/evidently), [scikit-learn](https://github.com/scikit-learn/scikit-learn). Kapalı reference: commercial fraud suites. Gap: realistic prevalence, false positive cost, drift and human appeal; anomaly is not proof of wrongdoing.
- **Computer science algorithms/graph theory:** [NetworkX](https://github.com/networkx/networkx), [igraph](https://github.com/igraph/igraph), [graph-tool](https://graph-tool.skewed.de/), [SciPy](https://github.com/scipy/scipy), [Rustworkx](https://github.com/Qiskit/rustworkx), [JGraphT](https://github.com/jgrapht/jgrapht). Gap: algorithmic correctness, complexity, randomized seeds, scale.
- **Quantum computing research/simulation:** [Qiskit](https://github.com/Qiskit/qiskit), [Cirq](https://github.com/quantumlib/Cirq), [PennyLane](https://github.com/PennyLaneAI/pennylane), [QuTiP](https://github.com/qutip/qutip), [Stim](https://github.com/quantumlib/Stim), [OpenFermion](https://github.com/quantumlib/OpenFermion). Kapalı reference: cloud quantum services. Gap: simulation size limits, device noise, real hardware-vs-simulation labeling.
- **Physics/PDE/scientific calculation:** [SciPy](https://github.com/scipy/scipy), [FEniCSx](https://github.com/FEniCS/dolfinx), [Firedrake](https://github.com/firedrakeproject/firedrake), [deal.II](https://github.com/dealii/dealii), [PETSc](https://github.com/petsc/petsc), [MOOSE](https://github.com/idaholab/moose), [ParaView](https://github.com/Kitware/ParaView). Kapalı reference: MATLAB/COMSOL. Gap: units, boundary conditions, solver convergence, analytical/benchmark solutions.
- **Engineering optimization and control:** [CasADi](https://github.com/casadi/casadi), [do-mpc](https://github.com/do-mpc/do-mpc), [ControlSystems.jl](https://github.com/JuliaControl/ControlSystems.jl), [python-control](https://github.com/python-control/python-control), [OpenModelica](https://github.com/OpenModelica/OpenModelica). Gap: stability, assumptions, simulation-real gap, human engineer review before deployment.

## 17.6 Dünya bilimleri, iklim, çevre, biyoloji, kimya ve sağlık

- **Astronomy/space:** [Astropy](https://github.com/astropy/astropy), [SunPy](https://github.com/sunpy/sunpy), [Skyfield](https://github.com/skyfielders/python-skyfield), [Stellarium](https://github.com/Stellarium/stellarium), [OpenSpace](https://github.com/OpenSpace/OpenSpace). Gap: authoritative ephemeris, time standards, coordinate conversion and scientific uncertainty.
- **Geology/geophysics/seismology:** [ObsPy](https://github.com/obspy/obspy), [GemPy](https://github.com/gempy-project/gempy), [SimPEG](https://github.com/simpeg/simpeg), [PyGMT](https://github.com/GenericMappingTools/pygmt), [Pyrocko](https://github.com/pyrocko/pyrocko), [QGIS](https://github.com/qgis/QGIS). Gap: CRS/units, inversion validation, coverage and uncertainty.
- **Oceanography/marine science:** [OceanParcels](https://github.com/OceanParcels/Parcels), [xarray](https://github.com/pydata/xarray), [PyCO2SYS](https://github.com/mvdh7/PyCO2SYS), [MITgcm](https://github.com/MITgcm/MITgcm), [GSW-Python](https://github.com/TEOS-10/GSW-Python). Gap: dataset source/time/depth, reproducibility, physical constraints.
- **Weather/climate modeling:** [xarray](https://github.com/pydata/xarray), [MetPy](https://github.com/Unidata/MetPy), [WRF](https://github.com/wrf-model/WRF), [Pangeo](https://github.com/pangeo-data/pangeo), [cfgrib](https://github.com/ecmwf/cfgrib), [ESMF](https://github.com/esmf-org/esmf). Kapalı reference: weather/climate services. Gap: valid-time, forecast skill, calibration and observed-vs-scenario separation.
- **GIS/spatial analysis:** [QGIS](https://github.com/qgis/QGIS), [PostGIS](https://github.com/postgis/postgis), [GeoPandas](https://github.com/geopandas/geopandas), [GDAL](https://github.com/OSGeo/gdal), [Shapely](https://github.com/shapely/shapely), [Rasterio](https://github.com/rasterio/rasterio), [GeoServer](https://github.com/geoserver/geoserver). Kapalı reference: ArcGIS/Mapbox. Gap: coordinate systems, topology, licenses and spatial result validation.
- **Maps/routing/logistics:** [OSRM](https://github.com/Project-OSRM/osrm-backend), [GraphHopper](https://github.com/graphhopper/graphhopper), [Valhalla](https://github.com/valhalla/valhalla), [openrouteservice](https://github.com/GIScience/openrouteservice), [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner), [OSMnx](https://github.com/gboeing/osmnx). Kapalı reference: Google Maps/HERE/TomTom. Gap: route feasibility, current traffic source, ETA validity, ODbL obligations.
- **Satellite/remote sensing/drone mapping:** [TorchGeo](https://github.com/torchgeo/torchgeo), [Raster Vision](https://github.com/azavea/raster-vision), [OpenDroneMap](https://github.com/OpenDroneMap/ODM), [eo-learn](https://github.com/sentinel-hub/eo-learn), [Orfeo ToolBox](https://github.com/orfeotoolbox/OTB), [PDAL](https://github.com/PDAL/PDAL). Gap: acquisition resolution/date, geolocation, cloud/haze shift and data license.
- **Agriculture/plant phenotyping/farm ops:** [farmOS](https://github.com/farmOS/farmOS), [PlantCV](https://github.com/danforthcenter/plantcv), [OpenDroneMap](https://github.com/OpenDroneMap/ODM), [QGIS](https://github.com/qgis/QGIS), [ODK](https://github.com/getodk/collect), [AgOpenGPS](https://github.com/AgOpenGPS-Official/AgOpenGPS). Gap: crop/region/stage-specific validation; recommendations advisory; device safety.
- **Ecology/biodiversity/acoustics:** [BirdNET-Analyzer](https://github.com/kahst/BirdNET-Analyzer), [pyinaturalist](https://github.com/pyinat/pyinaturalist), [GBIF API](https://github.com/gbif/gbif-api), [QGIS](https://github.com/qgis/QGIS), [OpenCV](https://github.com/opencv/opencv). Gap: per-species F1, geography/season bias, protected species locations and dataset permission.
- **Chemistry/cheminformatics:** [RDKit](https://github.com/rdkit/rdkit), [Open Babel](https://github.com/openbabel/openbabel), [DeepChem](https://github.com/deepchem/deepchem), [Mordred](https://github.com/mordred-descriptor/mordred), [OpenFF](https://github.com/openforcefield/openff-toolkit), [ASE](https://gitlab.com/ase/ase). Gap: molecular syntax/stereochemistry validity, source database version and chemistry expert review.
- **Molecular simulation/quantum chemistry/materials:** [GROMACS](https://github.com/gromacs/gromacs), [LAMMPS](https://github.com/lammps/lammps), [OpenMM](https://github.com/openmm/openmm), [CP2K](https://github.com/cp2k/cp2k), [Psi4](https://github.com/psi4/psi4), [NWChem](https://github.com/nwchemgit/nwchem), [pymatgen](https://github.com/materialsproject/pymatgen), [matminer](https://github.com/hackingmaterials/matminer), [phonopy](https://github.com/phonopy/phonopy). Gap: force field/method/basis/units, convergence, uncertainty, compute-vs-experiment distinctions.
- **Genomics/bioinformatics:** [Biopython](https://github.com/biopython/biopython), [Bioconductor](https://github.com/Bioconductor), [samtools](https://github.com/samtools/samtools), [bcftools](https://github.com/samtools/bcftools), [minimap2](https://github.com/lh3/minimap2), [Nextflow](https://github.com/nextflow-io/nextflow), [Snakemake](https://github.com/snakemake/snakemake), [Galaxy](https://github.com/galaxyproject/galaxy). Gap: reference genome, synthetic truth, genomic privacy, workflow reproducibility.
- **Single-cell/spatial omics:** [Scanpy](https://github.com/scverse/scanpy), [Seurat](https://github.com/satijalab/seurat), [scvi-tools](https://github.com/scverse/scvi-tools), [SpatialData](https://github.com/scverse/spatialdata), [nf-core](https://github.com/nf-core), [Cellpose](https://github.com/MouseLand/cellpose). Gap: normalization, batch correction, cell annotation and biological validation.
- **Proteomics/mass spec:** [OpenMS](https://github.com/OpenMS/OpenMS), [pyOpenMS](https://github.com/OpenMS/pyopenms), [matchms](https://github.com/matchms/matchms), [ms_deisotope](https://github.com/mobiusklein/ms_deisotope), [Biopython](https://github.com/biopython/biopython). Gap: database/version pinning, identification FDR and dataset-specific precision.
- **Protein structure/modeling:** [OpenFold](https://github.com/aqlaboratory/openfold), [ColabFold](https://github.com/sokrypton/ColabFold), [ESM](https://github.com/facebookresearch/esm), [RFdiffusion](https://github.com/RosettaCommons/RFdiffusion), [ProteinMPNN](https://github.com/dauparas/ProteinMPNN). Research-only track: model/weight/data license and biosafety review; no automatic wet lab execution; specialized restrictions apply.
- **Medical imaging/radiology:** [MONAI](https://github.com/Project-MONAI/MONAI), [3D Slicer](https://github.com/Slicer/Slicer), [OHIF](https://github.com/OHIF/Viewers), [Orthanc](https://github.com/orthanc-mirrors/orthanc), [SimpleITK](https://github.com/SimpleITK/SimpleITK), [ITK](https://github.com/InsightSoftwareConsortium/ITK). Kapalı reference: clinical imaging suites. Gap: DICOM de-identification, site/device shift, clinician approval, calibrated error.
- **Clinical data/health informatics:** [OpenMRS](https://github.com/openmrs/openmrs-core), [GNU Health](https://github.com/gnuhealth/gnuhealth), [OpenEMR](https://github.com/openemr/openemr), [HAPI FHIR](https://github.com/hapifhir/hapi-fhir), [Bahmni](https://github.com/Bahmni), [OHDSI](https://github.com/OHDSI). Gap: HIPAA/GDPR/local law depending jurisdiction, consent, audit and access control.
- **Clinical information/decision support:** [OpenFDA API](https://github.com/FDA/open.fda.gov), [RxNorm API](https://github.com/nlm-pds/rxnorm-api), [HAPI FHIR](https://github.com/hapifhir/hapi-fhir), [MONAI](https://github.com/Project-MONAI/MONAI). Kapalı reference: UpToDate/clinical support vendors. Gap: authoritative current citations, dose/context verification, no autonomous diagnosis or treatment.
- **Public health/epidemiology:** [EpiEstim](https://github.com/mrc-ide/EpiEstim), [EpiNow2](https://github.com/epiforecasts/EpiNow2), [PyMC](https://github.com/pymc-devs/pymc), [OHDSI](https://github.com/OHDSI), [R](https://github.com/wch/r-source). Gap: missingness, privacy, causal-vs-descriptive separation, uncertainty and expert interpretation.
- **Microscopy/pathology research:** [ImageJ/Fiji](https://github.com/imagej), [QuPath](https://github.com/qupath/qupath), [CellProfiler](https://github.com/CellProfiler/CellProfiler), [napari](https://github.com/napari/napari), [Bio-Formats](https://github.com/ome/bioformats), [Cellpose](https://github.com/MouseLand/cellpose). Gap: scale calibration, stain/site generalization and clinical claims restraint.
- **Lab notebooks/experiment reproducibility:** [eLabFTW](https://github.com/elabftw/elabftw), [openBIS](https://github.com/openBIS), [Galaxy](https://github.com/galaxyproject/galaxy), [Nextflow](https://github.com/nextflow-io/nextflow), [Snakemake](https://github.com/snakemake/snakemake), [DVC](https://github.com/iterative/dvc). Gap: experiment protocol/version, raw-data immutability, sample identity and audit.
- **Sustainability/LCA/climate accounting:** [Brightway](https://github.com/brightway-lca/brightway2), [openLCA modules](https://github.com/GreenDelta/olca-modules), [Activity Browser](https://github.com/LCA-ActivityBrowser/activity-browser), [xarray](https://github.com/pydata/xarray), [PyPSA](https://github.com/PyPSA/PyPSA). Gap: boundary/time/region, factor source, no unsupported “green” claims.


## 17.7 Hukuk, mevzuat, sözleşmeler, kamu politikası ve uyum

**Alt alanlar:** hukukî kaynak arama; emsal karar bulma; mevzuat değişikliği takibi; sözleşme inceleme; madde/taahhüt çıkarımı; riskli madde tespiti; yükümlülük matrisi; sözleşme karşılaştırma; gizli bilgi/redaksiyon; e-keşif ve belge sınıflandırma; dava dosyası zaman çizelgesi; delil/kanıt zinciri; fikrî mülkiyet ve patent ön araştırması; şirket politikası ve prosedür eşleştirme; KVKK/GDPR uyum iş akışları; regülasyon izleme; kamu ihalesi doküman analizi; vergi mevzuatı araştırması; hukukî yazım ve dilekçe taslağı; çok yargı alanlı karşılaştırma.

- **Açık kaynak/altyapı adayları:** [OpenContracts](https://github.com/Open-Source-Legal/OpenContracts), [LexNLP](https://github.com/LexPredict/lexpredict-lexnlp), [Blackstone](https://github.com/ICLRandD/Blackstone), [Eyecite](https://github.com/freelawproject/eyecite), [CourtListener](https://github.com/freelawproject/courtlistener), [RECAP](https://github.com/freelawproject/recap), [OpenFisca](https://github.com/openfisca/openfisca-core), [Docassemble](https://github.com/jhpyle/docassemble), [Accord Project](https://github.com/accordproject/accordproject), [Open Policy Agent](https://github.com/open-policy-agent/opa), [Presidio](https://github.com/microsoft/presidio), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Docling](https://github.com/docling-project/docling), [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF).
- **Kapalı referans sınıfı:** LexisNexis, Westlaw, vLex, Thomson Reuters CoCounsel, Harvey, Spellbook, Ironclad, Evisort, Luminance, Relativity, commercial e-discovery and legal research suites.
- **Gerçek fark analizi:** kaynak kapsamı ve güncellik; tam metin erişimi; emsalin yargı alanı ve bağlayıcılığı; alıntının iddiayı gerçekten desteklemesi; madde numarası ve sürüm doğruluğu; uzun sözleşmelerde recall; OCR doğruluğu; değişiklik izi; privilege/confidentiality controls.
- **Aurora bağlantısı:** read-only retrieval + exact paragraph/page citations by default. Any generated legal instrument is a draft; attorney approval is required. Never present generic retrieval as jurisdiction-specific legal advice. Türkiye için mevzuat, Resmî Gazete, KVKK, UYAP erişim koşulları ve veri kullanım hakları ayrıca doğrulanır; erişilemeyen kapalı kaynakların varmış gibi entegrasyonu yapılmaz.

## 17.8 Finans, muhasebe, vergi, bankacılık, sigorta ve risk

**Alt alanlar:** çift taraflı muhasebe; fatura/fiş/masraf okuma; hesap planı eşleme; banka hareketi sınıflandırma; mutabakat; nakit akışı; bütçe; FP&A; finansal tablo analizi; konsolidasyon; kur ve çoklu para birimi; alacak/borç yaşlandırma; vergi çalışma kâğıtları; bordro; faturalama/abonelik; fiyatlama; kredi riski; dolandırıcılık tespiti; AML/KYC iş akışı; sigorta poliçesi çıkarımı; talep/hasar dosyası triyajı; aktüerya; finansal zaman serisi; portföy risk analizi; piyasa verisi ve haber analizi; algoritmik işlem araştırması; ödeme mutabakatı; finansal denetim izi.

- **Açık kaynak/altyapı adayları:** [ERPNext](https://github.com/frappe/erpnext), [Odoo Community](https://github.com/odoo/odoo), [Tryton](https://github.com/tryton/tryton), [Ledger](https://github.com/ledger/ledger), [hledger](https://github.com/simonmichael/hledger), [Beancount](https://github.com/beancount/beancount), [GnuCash](https://github.com/Gnucash/gnucash), [Frappe HRMS](https://github.com/frappe/hrms), [Metabase](https://github.com/metabase/metabase), [Apache Superset](https://github.com/apache/superset), [Great Expectations](https://github.com/great-expectations/great_expectations), [Pandera](https://github.com/unionai-oss/pandera), [invoice2data](https://github.com/invoice-x/invoice2data), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [NeuralForecast](https://github.com/Nixtla/neuralforecast), [Darts](https://github.com/unit8co/darts), [PyPortfolioOpt](https://github.com/PyPortfolio/PyPortfolioOpt), [QuantLib](https://github.com/lballabio/QuantLib), [OpenBB](https://github.com/OpenBB-finance/OpenBB), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [OpenSanctions](https://github.com/opensanctions/opensanctions).
- **Kapalı referans sınıfı:** Bloomberg, FactSet, S&P Capital IQ, Moody's Analytics, QuickBooks, Xero, Sage, Workday Financials, Avalara, Stripe Radar, commercial fraud/AML and insurance platforms.
- **Gerçek fark analizi:** arithmetic correctness; source statement matching; accounting invariants; double-entry balance; tax jurisdiction/date; look-ahead/data leakage; out-of-sample forecasting; false-positive cost; audit trail; reconciled balances; explainable exceptions.
- **Aurora bağlantısı:** immutable draft ledger + explicit approval before money movement, filing or posting. Use deterministic calculators for arithmetic and rule engines for accounting invariants; an LLM may classify or explain but must not be the sole financial system of record. Model confidence never substitutes for reconciliation.

## 17.9 İşletme yönetimi, ERP, CRM, satış, müşteri hizmetleri ve e-ticaret

**Alt alanlar:** leads/accounts/contact management; sales pipeline; quote-to-cash; procurement-to-pay; inventory/WMS; warehouse picking; invoicing; customer support; ticket categorization/routing; knowledge-base answers; call-center summaries; contact-center quality; chatbot handoff; returns/RMA; e-commerce catalog enrichment; product feed; order tracking; subscriptions; marketplace operations; customer segmentation; churn; customer feedback/sentiment; service-level monitoring; field service; franchise operations; hotel/property management; restaurant POS; nonprofit case management; automotive dealer systems; healthcare/education vertical ERP; manufacturing planning; repair-shop workflows.

- **Açık kaynak/altyapı adayları:** [ERPNext](https://github.com/frappe/erpnext), [Odoo](https://github.com/odoo/odoo), [Dolibarr](https://github.com/Dolibarr/dolibarr), [Tryton](https://github.com/tryton/tryton), [SuiteCRM](https://github.com/salesagility/SuiteCRM), [EspoCRM](https://github.com/espocrm/espocrm), [Twenty](https://github.com/twentyhq/twenty), [Zammad](https://github.com/zammad/zammad), [FreeScout](https://github.com/freescout-helpdesk/freescout), [Chatwoot](https://github.com/chatwoot/chatwoot), [Saleor](https://github.com/saleor/saleor), [Medusa](https://github.com/medusajs/medusa), [Magento Open Source](https://github.com/magento/magento2), [Bagisto](https://github.com/bagisto/bagisto), [Vendure](https://github.com/vendure-ecommerce/vendure), [Pretix](https://github.com/pretix/pretix), [LimeSurvey](https://github.com/LimeSurvey/LimeSurvey), [Formbricks](https://github.com/formbricks/formbricks), [Frappe HRMS](https://github.com/frappe/hrms), [OpenBoxes](https://github.com/openboxes/openboxes).
- **Kapalı referans sınıfı:** Salesforce, HubSpot, Zendesk, Intercom, ServiceNow, SAP, Oracle NetSuite, Microsoft Dynamics 365, Shopify, Gorgias, Freshdesk, Genesys, NICE, commercetools.
- **Gerçek fark analizi:** workflow completion rather than pleasant text; correct record update; duplicate avoidance; entitlement/ACL; transactional integrity; idempotency; escalation quality; multichannel consistency; integration breadth; auditability; business-specific customization effort.
- **Aurora bağlantısı:** ERP/CRM operations must go through explicit API tool schemas and transaction boundaries. Read-only by default; write operations need preview/confirmation, idempotency keys, audit event, and rollback where possible. Do not embed credentials in prompts or repository.

## 17.10 İnsan kaynakları, yetenek yönetimi, proje, ürün ve ekip çalışması

**Alt alanlar:** job-description creation; recruitment pipeline; CV parsing; skills taxonomy; interview scheduling; interview rubric; employee onboarding/offboarding; internal policy Q&A; performance-review drafts; training plans; workforce planning; shift scheduling; timesheets; payroll handoff; project decomposition; sprint planning; issue triage; release planning; product requirements; customer interview synthesis; roadmap prioritization; OKR tracking; risk register; meeting notes/action extraction; asynchronous status reports; knowledge transfer; incident postmortems; resource leveling; contract/vendor lifecycle; document approvals.

- **Açık kaynak adayları:** [OpenProject](https://github.com/opf/openproject), [Plane](https://github.com/makeplane/plane), [Taiga](https://github.com/taigaio/taiga), [Focalboard](https://github.com/mattermost-community/focalboard), [Leantime](https://github.com/Leantime/leantime), [Mattermost](https://github.com/mattermost/mattermost), [Element](https://github.com/element-hq/element-web), [Zulip](https://github.com/zulip/zulip), [Jitsi Meet](https://github.com/jitsi/jitsi-meet), [Cal.com](https://github.com/calcom/cal.com), [Kimai](https://github.com/kimai/kimai), [Rallly](https://github.com/lukevella/rallly), [Frappe HRMS](https://github.com/frappe/hrms), [OpenCATS](https://github.com/opencats/OpenCATS), [WeKan](https://github.com/wekan/wekan), [Nextcloud](https://github.com/nextcloud/server), [HedgeDoc](https://github.com/hedgedoc/hedgedoc).
- **Kapalı referans sınıfı:** Jira/Confluence, Linear, Asana, Monday.com, ClickUp, Notion, Slack AI, Microsoft Teams/Copilot, Workday, Greenhouse, Lever, BambooHR.
- **Gerçek fark analizi:** task status from source of truth; issue links; deadline/time-zone correctness; evidence-based meeting action extraction; permissions; recruiting bias; HR privacy; schedule constraint satisfaction; human decision ownership.
- **Aurora bağlantısı:** integrate through narrow API adapters, never infer employee performance or make hiring decisions solely from opaque model scores. Require humans for high-impact employment decisions.

## 17.11 Eğitim, öğretim, sınav, öğretmenlik ve bireysel öğrenme

**Alt alanlar:** curriculum mapping; personalized tutoring; Socratic dialogue; lesson-plan generation; question generation; grading rubrics; essay feedback; code tutoring; math tutoring; language learning; spaced repetition; flashcards; prerequisite graphs; learning analytics; accessibility accommodations; LMS administration; attendance/grade import; exam item analysis; classroom simulation; teacher resource creation; academic integrity support; vocational training; professional certification prep; interactive simulations; child-safe experience; research skills and citation literacy.

- **Açık kaynak adayları:** [Moodle](https://github.com/moodle/moodle), [Open edX](https://github.com/openedx/edx-platform), [Canvas LMS](https://github.com/instructure/canvas-lms), [H5P](https://github.com/h5p/h5p-php-library), [Kolibri](https://github.com/learningequality/kolibri), [Oppia](https://github.com/oppia/oppia), [Anki](https://github.com/ankitects/anki), [OpenStax content](https://github.com/openstax), [Hypothesis](https://github.com/hypothesis), [Jupyter](https://github.com/jupyter/notebook), [JupyterLab](https://github.com/jupyterlab/jupyterlab), [CodeMirror](https://github.com/codemirror/dev), [Blockly](https://github.com/google/blockly), [Praat](https://github.com/praat/praat), [LanguageTool](https://github.com/languagetool-org/languagetool).
- **Kapalı referans sınıfı:** Khanmigo, Duolingo Max, Quizlet Q-Chat, Photomath, Wolfram tutoring tools, commercial LMS copilots, adaptive-learning platforms.
- **Gerçek fark analizi:** delayed retention rather than immediate satisfaction; answer correctness; misconception detection; pedagogical progression; accessibility; grade-level appropriateness; assessment integrity; teacher control; privacy of minors.
- **Aurora bağlantısı:** adapt explanation depth and examples, track mastery from task evidence not chat volume. In assessment contexts, distinguish tutor mode from exam mode and support disclosure/provenance policies set by the institution.

## 17.12 Erişilebilirlik, yardımcı teknoloji ve kişisel üretkenlik

**Alt alanlar:** screen-reader-friendly navigation; image alt text; chart description; caption/subtitle generation; live transcription; speech input/output; keyboard navigation; AAC support; dyslexia-friendly formatting; plain-language rewrite; cognitive accessibility; braille conversion; OCR for low vision; meeting accessibility; sign-language research support; color-contrast checks; accessible PDF/DOCX/PPTX checks; voice control; task prompts for executive-function support; multilingual accessibility.

- **Açık kaynak adayları:** [NVDA](https://github.com/nvaccess/nvda), [Orca](https://gitlab.gnome.org/GNOME/orca), [AccessKit](https://github.com/AccessKit/accesskit), [axe-core](https://github.com/dequelabs/axe-core), [Pa11y](https://github.com/pa11y/pa11y), [Lighthouse](https://github.com/GoogleChrome/lighthouse), [WAVE extension source](https://github.com/webaim), [Tesseract](https://github.com/tesseract-ocr/tesseract), [Whisper](https://github.com/openai/whisper), [Piper](https://github.com/rhasspy/piper), [Coqui TTS](https://github.com/coqui-ai/TTS), [OpenCC](https://github.com/BYVoid/OpenCC), [Aegisub](https://github.com/Aegisub/Aegisub), [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit), [LanguageTool](https://github.com/languagetool-org/languagetool).
- **Kapalı referans sınıfı:** Apple accessibility stack, Windows Narrator/Copilot, Google Live Transcribe, Seeing AI, Be My Eyes, commercial caption/translation services.
- **Gerçek fark analizi:** actual task completion by disabled users; WCAG conformance; caption WER; alt-text safety/relevance; latency; screen-reader semantics; user choice/control; no assumption that one user profile fits everyone.
- **Aurora bağlantısı:** accessibility as a cross-cutting service, not a single plug-in. Test with real assistive tech and disabled-user review where possible; don't advertise compliance merely from an automated scan.

## 17.13 Siber güvenlik, mavi takım, güvenli kod, gizlilik ve adli bilişim

**Yetkili ve savunma odaklı kapsam:** asset inventory; vulnerability triage; SBOM; dependency audit; secret scanning; SAST/DAST; API threat modeling; container/IaC security; phishing detection; SIEM/log triage; endpoint monitoring; incident timeline; memory/disk forensics; malware *analysis in isolated labs*; threat intelligence correlation; identity/access review; cloud security posture; privacy impact assessments; data loss prevention; certificate/TLS review; cryptographic configuration; backup integrity; patch planning; security documentation.

- **Açık kaynak adayları:** [OWASP ZAP](https://github.com/zaproxy/zaproxy), [Nmap](https://github.com/nmap/nmap), [Wireshark](https://github.com/wireshark/wireshark), [Suricata](https://github.com/OISF/suricata), [Zeek](https://github.com/zeek/zeek), [Wazuh](https://github.com/wazuh/wazuh), [Security Onion](https://github.com/Security-Onion-Solutions/securityonion), [Greenbone Community Edition](https://github.com/greenbone), [Trivy](https://github.com/aquasecurity/trivy), [Grype](https://github.com/anchore/grype), [Syft](https://github.com/anchore/syft), [Semgrep](https://github.com/semgrep/semgrep), [CodeQL queries](https://github.com/github/codeql), [Gitleaks](https://github.com/gitleaks/gitleaks), [TruffleHog](https://github.com/trufflesecurity/trufflehog), [Checkov](https://github.com/bridgecrewio/checkov), [OpenSCAP](https://github.com/OpenSCAP/openscap), [osquery](https://github.com/osquery/osquery), [Velociraptor](https://github.com/Velocidex/velociraptor), [Volatility 3](https://github.com/volatilityfoundation/volatility3), [Autopsy](https://github.com/sleuthkit/autopsy), [The Sleuth Kit](https://github.com/sleuthkit/sleuthkit), [MISP](https://github.com/MISP/MISP), [OpenCTI](https://github.com/OpenCTI-Platform/opencti), [MITRE Caldera](https://github.com/mitre/caldera), [Atomic Red Team](https://github.com/redcanaryco/atomic-red-team), [OWASP Threat Dragon](https://github.com/OWASP/threat-dragon), [Presidio](https://github.com/microsoft/presidio), [OpenBao](https://github.com/openbao/openbao), [step-ca](https://github.com/smallstep/certificates).
- **Kapalı referans sınıfı:** CrowdStrike, Microsoft Defender, Palo Alto Cortex, SentinelOne, Wiz, Snyk, Burp Suite Pro, Tenable, Splunk, Recorded Future, commercial DFIR suites.
- **Gerçek fark analizi:** precision/recall; verified-vulnerability rate; false-positive burden; time to triage; exploitability context; coverage; reproducibility; authorization boundaries; safe lab isolation; exact evidence and chain of custody.
- **Aurora bağlantısı:** passive analysis and authorized environments by default. Active scans, exploitation-like tests, changes to production security controls and containment actions require explicit scope, authorization and approval. Do not build stealth, credential theft, persistence or unauthorized access automation. Isolate malware and untrusted samples with network disabled and snapshots.

## 17.14 IT operasyonları, SRE, ağ yönetimi, observability ve servis sürekliliği

**Alt alanlar:** logs/metrics/traces; root-cause hypotheses; incident runbooks; alert deduplication; SLO/SLA analysis; capacity forecasts; network topology; DNS/TLS troubleshooting; packet capture interpretation; Linux/Windows administration; fleet inventory; patch management; config drift; service deployment; rollback; backup/restore; disaster recovery exercises; cost governance/FinOps; cloud resource right-sizing; Kubernetes diagnosis; on-call handoff; status page updates; postmortem drafting; service dependency graphs.

- **Açık kaynak adayları:** [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector), [Prometheus](https://github.com/prometheus/prometheus), [Grafana](https://github.com/grafana/grafana), [Loki](https://github.com/grafana/loki), [Tempo](https://github.com/grafana/tempo), [Mimir](https://github.com/grafana/mimir), [VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics), [SigNoz](https://github.com/SigNoz/signoz), [Jaeger](https://github.com/jaegertracing/jaeger), [Netdata](https://github.com/netdata/netdata), [Zabbix](https://github.com/zabbix/zabbix), [Nagios Core](https://github.com/NagiosEnterprises/nagioscore), [NetBox](https://github.com/netbox-community/netbox), [Netdisco](https://github.com/netdisco/netdisco), [Ansible](https://github.com/ansible/ansible), [Rundeck](https://github.com/rundeck/rundeck), [AWX](https://github.com/ansible/awx), [Restic](https://github.com/restic/restic), [Borg](https://github.com/borgbackup/borg), [Kopia](https://github.com/kopia/kopia), [MinIO](https://github.com/minio/minio), [Rclone](https://github.com/rclone/rclone), [OpenCost](https://github.com/opencost/opencost), [Cloud Custodian](https://github.com/cloud-custodian/cloud-custodian).
- **Kapalı referans sınıfı:** Datadog, New Relic, Dynatrace, Splunk Observability, PagerDuty AIOps, ServiceNow ITOM, proprietary cloud monitoring.
- **Gerçek fark analizi:** MTTR; incident localization top-k; action success; rollback correctness; alert noise reduction; no destructive change without permission; restore-test success; production drift and cost-impact accuracy.
- **Aurora bağlantısı:** observability data is untrusted input. Runbook execution needs allowlisted commands and approval gates for restart, deletion, firewall, scaling, and production changes.

## 17.15 Robotik, dronlar, ROS, gömülü sistemler, IoT ve fiziksel otomasyon

**Alt alanlar:** robot kinematiği; motion planning; SLAM; localization; computer vision; sensor fusion; robot simulation; manipulation; gripper control; warehouse mobile robots; autonomous vehicles *simulation/research*; drone mission planning; flight-stack configuration; embedded C/C++; RTOS; microcontroller flashing; digital twins; MQTT/OPC-UA; industrial telemetry; PLC monitoring; predictive maintenance; smart agriculture; edge inference; sensor calibration; industrial machine vision; safety interlocks; human-robot collaboration.

- **Açık kaynak adayları:** [ROS 2](https://github.com/ros2/ros2), [Navigation2](https://github.com/ros-navigation/navigation2), [MoveIt 2](https://github.com/moveit/moveit2), [Gazebo](https://github.com/gazebosim/gz-sim), [Webots](https://github.com/cyberbotics/webots), [CoppeliaSim educational API](https://github.com/CoppeliaRobotics), [Isaac ROS packages](https://github.com/NVIDIA-ISAAC-ROS), [Open-RMF](https://github.com/open-rmf/rmf), [PX4 Autopilot](https://github.com/PX4/PX4-Autopilot), [ArduPilot](https://github.com/ArduPilot/ardupilot), [MAVSDK](https://github.com/mavlink/MAVSDK), [MAVLink](https://github.com/mavlink/mavlink), [Micro-ROS](https://github.com/micro-ROS), [Zephyr RTOS](https://github.com/zephyrproject-rtos/zephyr), [FreeRTOS](https://github.com/FreeRTOS/FreeRTOS), [PlatformIO Core](https://github.com/platformio/platformio-core), [ESP-IDF](https://github.com/espressif/esp-idf), [Home Assistant](https://github.com/home-assistant/core), [Node-RED](https://github.com/node-red/node-red), [Eclipse Mosquitto](https://github.com/eclipse-mosquitto), [ThingsBoard](https://github.com/thingsboard/thingsboard), [OpenPLC](https://github.com/thiagoralves/OpenPLC_v3), [OPC UA open62541](https://github.com/open62541/open62541), [EdgeX Foundry](https://github.com/edgexfoundry/edgex-go), [OpenVINO](https://github.com/openvinotoolkit/openvino), [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM).
- **Kapalı referans sınıfı:** NVIDIA Isaac ecosystem, Boston Dynamics APIs, commercial robot-cell systems, proprietary autopilot/industrial automation suites, cloud IoT services.
- **Gerçek fark analizi:** simulation-to-real gap; latency/jitter; sensor dropouts; collision rate; localization error; emergency stop; stale-command rejection; fail-safe modes; firmware signing; hardware compatibility; electrical/mechanical safety.
- **Aurora bağlantısı:** begin simulation-only. Any physical action needs a safety controller independent of the language model, emergency stop, geofencing/limits and an operator confirmation boundary. Never allow free-form model text to directly command actuators.

## 17.16 Mimari, inşaat, CAD/BIM, mekanik, elektrik, üretim ve dijital imalat

**Alt alanlar:** 2D drafting; 3D parametric CAD; mechanical assemblies; sheet metal; CAM toolpaths; finite element simulation; CFD; topology optimization; 3D printing slicing; mesh cleanup; BIM model queries; IFC validation; clash detection; quantity takeoff; construction scheduling; cost estimating; structural analysis; circuit design; PCB routing; SPICE simulation; FPGA/HDL; photogrammetry; point clouds; metrology; manufacturing execution; CNC job preparation; quality inspection; reverse engineering; facility operations; building energy modeling.

- **Açık kaynak adayları:** [FreeCAD](https://github.com/FreeCAD/FreeCAD), [SolveSpace](https://github.com/solvespace/solvespace), [OpenSCAD](https://github.com/openscad/openscad), [BRL-CAD](https://github.com/BRL-CAD/brlcad), [LibreCAD](https://github.com/LibreCAD/LibreCAD), [KiCad](https://github.com/KiCad/kicad-source-mirror), [QElectroTech](https://github.com/qelectrotech/qelectrotech), [ngspice](https://github.com/ngspice/ngspice), [OpenROAD](https://github.com/The-OpenROAD-Project/OpenROAD), [Verilator](https://github.com/verilator/verilator), [Yosys](https://github.com/YosysHQ/yosys), [GHDL](https://github.com/ghdl/ghdl), [OpenEMS](https://github.com/thliebig/openEMS), [CalculiX](https://github.com/Dhondtguido/CalculiX), [Code_Aster](https://github.com/ehmoussi/code_aster), [OpenFOAM](https://github.com/OpenFOAM/OpenFOAM-dev), [Elmer FEM](https://github.com/ElmerCSC/elmerfem), [FreeCAD FEM](https://github.com/FreeCAD/FreeCAD), [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell), [Bonsai BIM](https://github.com/IfcOpenShell/IfcOpenShell), [BlenderBIM successor workflows](https://github.com/IfcOpenShell/IfcOpenShell), [IfcTester](https://github.com/IfcOpenShell/IfcOpenShell), [OpenSCAD](https://github.com/openscad/openscad), [PrusaSlicer](https://github.com/prusa3d/PrusaSlicer), [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer), [Cura](https://github.com/Ultimaker/Cura), [FreeCAD Path](https://github.com/FreeCAD/FreeCAD), [OpenDroneMap](https://github.com/OpenDroneMap/ODM), [CloudCompare](https://github.com/CloudCompare/CloudCompare).
- **Kapalı referans sınıfı:** AutoCAD, SolidWorks, CATIA, NX, Fusion, Revit, Archicad, ANSYS, Abaqus, COMSOL, Altium, Cadence, Synopsys, Mastercam, commercial BIM/CAM suites.
- **Gerçek fark analizi:** unit consistency; solver verification/validation; tolerances; geometry validity; mesh quality; convergence; DRC/DFM; IFC round-trip; code/plan version; standards applicability; engineer sign-off.
- **Aurora bağlantısı:** all calculations and manufacturing outputs need machine-readable parameters and validated constraints. The agent can draft or optimize but must not sign off structural/electrical safety, manufacture-ready toolpaths, or building-code compliance without qualified review.

## 17.17 Enerji, utilities, binalar, telecom ve endüstriyel süreçler

**Alt alanlar:** energy demand forecasting; load flow; power-system simulation; smart-grid monitoring; battery management research; solar/wind forecasting; renewable plant monitoring; energy procurement; building-management systems; HVAC tuning; digital building twins; water/wastewater operations; pipeline integrity; chemical process monitoring; refinery safety analysis; thermal management; data-center energy; telecom RAN optimization; network planning; spectrum analysis; satellite communications; network slicing; fiber inventory; maintenance scheduling; outage communication.

- **Açık kaynak adayları:** [PyPSA](https://github.com/PyPSA/PyPSA), [pandapower](https://github.com/e2nIEE/pandapower), [OpenDSS](https://github.com/dss-extensions/OpenDSSDirect.py), [GridLAB-D](https://github.com/gridlab-d/gridlab-d), [PowerModels.jl](https://github.com/lanl-ansi/PowerModels.jl), [Calliope](https://github.com/calliope-project/calliope), [oemof](https://github.com/oemof/oemof), [OpenEMS](https://github.com/OpenEMS/openems), [OpenModelica](https://github.com/OpenModelica/OpenModelica), [EnergyPlus](https://github.com/NREL/EnergyPlus), [Modelica Buildings](https://github.com/lbl-srg/modelica-buildings), [OpenPLC](https://github.com/thiagoralves/OpenPLC_v3), [Eclipse Kura](https://github.com/eclipse-kura/kura), [ThingsBoard](https://github.com/thingsboard/thingsboard), [OpenRemote](https://github.com/openremote/openremote), [Free5GC](https://github.com/free5gc/free5gc), [Open5GS](https://github.com/open5gs/open5gs), [srsRAN Project](https://github.com/srsran/srsRAN_Project), [OpenAirInterface](https://github.com/OPENAIRINTERFACE/openairinterface5g), [ns-3](https://github.com/nsnam/ns-3), [CORE emulator](https://github.com/coreemu/core), [OpenDaylight](https://github.com/opendaylight), [FRRouting](https://github.com/FRRouting/frr).
- **Kapalı referans sınıfı:** ETAP, DIgSILENT PowerFactory, AspenTech, AVEVA, Honeywell Forge, Siemens Grid Software, Schneider EcoStruxure, Ericsson/Nokia network planning tools, commercial BMS/EMS.
- **Gerçek fark analizi:** physics/engineering correctness; simulation model validity; forecast error; controller stability; protection coordination; operational safety; regulation; time-series quality; system telemetry freshness.
- **Aurora bağlantısı:** first connect read-only digital twins and historical data. Actual plant controls must require PLC safety interlocks and site authorization; model-generated instructions are never the only safeguard.

## 17.18 Ulaşım, otomotiv, havacılık, denizcilik ve lojistik

**Alt alanlar:** route/ETA; last-mile routing; fleet management; vehicle maintenance diagnosis; OBD-II data interpretation; parts search; charging networks; traffic analytics; public transport schedules; airline operations research; flight-planning support; airport resource scheduling; ship routing; port logistics; container tracking; rail scheduling; warehouse optimization; autonomous-system simulation; freight rate extraction; customs documentation; multimodal journey planning; travel itinerary; disruption re-planning; safety and compliance documentation.

- **Açık kaynak adayları:** [OpenStreetMap](https://github.com/openstreetmap/openstreetmap-website), [OSRM](https://github.com/Project-OSRM/osrm-backend), [Valhalla](https://github.com/valhalla/valhalla), [GraphHopper](https://github.com/graphhopper/graphhopper), [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner), [OpenRailwayMap](https://github.com/OpenRailwayMap/OpenRailwayMap), [OpenRailwayTools](https://github.com/railway-technology), [SUMO](https://github.com/eclipse-sumo/sumo), [CARLA](https://github.com/carla-simulator/carla), [Autoware](https://github.com/autowarefoundation/autoware), [Eclipse Kuksa](https://github.com/eclipse-kuksa), [openpilot](https://github.com/commaai/openpilot), [FlightGear](https://github.com/FlightGear/flightgear), [JSBSim](https://github.com/JSBSim-Team/jsbsim), [OpenCPN](https://github.com/OpenCPN/OpenCPN), [OpenSeaMap](https://github.com/OpenSeaMap), [Open Logistics Foundation](https://github.com/openlogisticsfoundation), [OR-Tools](https://github.com/google/or-tools), [VROOM](https://github.com/VROOM-Project/vroom), [OpenBoxes](https://github.com/openboxes/openboxes), [Traccar](https://github.com/traccar/traccar).
- **Kapalı referans sınıfı:** Google Maps, HERE, TomTom, Waze, Uber Freight, project44, Samsara, commercial airline/rail/ship planning systems.
- **Gerçek fark analizi:** map/traffic freshness; route feasibility; vehicle/road restrictions; ETA calibration; optimization constraints; safety margins; data attribution; live disruption handling; jurisdictional compliance.
- **Aurora bağlantısı:** distinguish route recommendation from vehicle control. Actual driving, aviation, rail or vessel control is safety-critical and cannot be entrusted to a general LLM. Use simulation, validated specialist software and human/regulated operator oversight.

## 17.19 Perakende, tedarik zinciri, satın alma ve fiyat/ürün zekâsı

**Alt alanlar:** SKU normalization; duplicate product matching; product taxonomy; catalog enrichment; product description localization; image-to-product matching; price monitoring; promotion planning; demand forecasting; inventory replenishment; stockout detection; warehouse picking; purchase-order extraction; supplier comparison; tender analysis; shipment ETA; return reason analysis; review insight synthesis; counterfeit-risk signals; retail planograms; assortment optimization; dynamic pricing research; marketplace listing quality; catalog feed validation; reverse logistics.

- **Açık kaynak adayları:** [Open Food Facts](https://github.com/openfoodfacts), [Product Matching Benchmark/data](https://github.com/anhaidgroup/deepmatcher), [DeepMatcher](https://github.com/anhaidgroup/deepmatcher), [Dedupe](https://github.com/dedupeio/dedupe), [Splink](https://github.com/moj-analytical-services/splink), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Saleor](https://github.com/saleor/saleor), [Medusa](https://github.com/medusajs/medusa), [Vendure](https://github.com/vendure-ecommerce/vendure), [ERPNext](https://github.com/frappe/erpnext), [OpenBoxes](https://github.com/openboxes/openboxes), [OR-Tools](https://github.com/google/or-tools), [VROOM](https://github.com/VROOM-Project/vroom), [NeuralForecast](https://github.com/Nixtla/neuralforecast), [LightGBM](https://github.com/microsoft/LightGBM), [XGBoost](https://github.com/dmlc/xgboost), [Prophet](https://github.com/facebook/prophet), [Metabase](https://github.com/metabase/metabase).
- **Kapalı referans sınıfı:** Amazon Seller tools, Shopify Sidekick, Salesforce Commerce, commercetools, Manhattan Associates, Blue Yonder, Coupa, SAP Ariba, commercial price-intelligence platforms.
- **Gerçek fark analizi:** SKU match precision; inventory stockout/overstock; forecast WAPE/MASE; leakage-free backtesting; product claim consistency; promotion margin; data freshness; lawful use of marketplace feeds and websites.
- **Aurora bağlantısı:** shopping and marketplace actions require current, source-linked data. Do not bypass rate limits, paywalls, access controls or site terms; use official APIs and licensed datasets first.

## 17.20 Pazarlama, satış, araştırma, reklam, marka ve içerik operasyonları

**Alt alanlar:** ICP/customer research; voice-of-customer; competitive research; SEO briefs; keyword clustering; technical SEO audits; content calendars; ad copy variants; campaign analytics; attribution modeling; landing-page QA; localization; brand consistency; email campaigns; social scheduling; influencer discovery; lead enrichment; account-based marketing; sales call preparation; quote/proposal draft; win/loss analysis; market sizing; survey analysis; A/B test design; conversion funnels; image/video variations; marketing asset governance; brand safety.

- **Açık kaynak adayları:** [Matomo](https://github.com/matomo-org/matomo), [Plausible](https://github.com/plausible/analytics), [Umami](https://github.com/umami-software/umami), [PostHog](https://github.com/PostHog/posthog), [Mautic](https://github.com/mautic/mautic), [Listmonk](https://github.com/knadh/listmonk), [Keila](https://github.com/pentacent/keila), [Twenty](https://github.com/twentyhq/twenty), [SuiteCRM](https://github.com/salesagility/SuiteCRM), [EspoCRM](https://github.com/espocrm/espocrm), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Scrapy](https://github.com/scrapy/scrapy), [Playwright](https://github.com/microsoft/playwright), [Metabase](https://github.com/metabase/metabase), [Apache Superset](https://github.com/apache/superset), [GrowthBook](https://github.com/growthbook/growthbook), [GrowthBook SDKs](https://github.com/growthbook/growthbook), [Plausible](https://github.com/plausible/analytics), [Penpot](https://github.com/penpot/penpot), [GIMP](https://github.com/GNOME/gimp), [Kdenlive](https://github.com/KDE/kdenlive), [Shotcut](https://github.com/mltframework/shotcut).
- **Kapalı referans sınıfı:** Adobe/Firefly, Canva, HubSpot, Marketo, Semrush, Ahrefs, Similarweb, Sprout Social, Hootsuite, Google Ads/Analytics, Meta Ads.
- **Gerçek fark analizi:** factuality; brand voice consistency; conversion vs vanity metrics; source attribution; randomized test validity; privacy/consent; platform policy; copyright and usage rights; no fake engagement or deceptive reviews.
- **Aurora bağlantısı:** generate proposals and drafts, but publishing/spend/targeting operations need approval budgets and platform-specific permissions. Track experimental outcomes instead of claiming generated content “will go viral.”

## 17.21 Tasarım, UX, grafik, fotoğraf, video, animasyon ve yaratıcı üretim

**Alt alanlar:** illustration; logo/brand systems; raster editing; vector drawing; image restoration/upscaling; background removal; relighting; inpainting/outpainting; product photography; text rendering; layout; UI prototyping; design tokens; wireframes; user research synthesis; usability-test analysis; video generation; editing; subtitles; color grading; motion graphics; compositing; 2D animation; 3D animation; rigging; sound design; music; podcast cleanup; voice-over; game assets; texture/material generation; procedural art; print prepress.

- **Açık kaynak adayları:** [Blender](https://github.com/blender/blender), [Krita](https://github.com/KDE/krita), [GIMP](https://github.com/GNOME/gimp), [Inkscape](https://github.com/inkscape/inkscape), [Penpot](https://github.com/penpot/penpot), [Pencil2D](https://github.com/pencil2d/pencil2d), [OpenToonz](https://github.com/opentoonz/opentoonz), [Kdenlive](https://github.com/KDE/kdenlive), [Shotcut](https://github.com/mltframework/shotcut), [Olive](https://github.com/olive-editor/olive), [Natron](https://github.com/NatronGitHub/Natron), [OBS Studio](https://github.com/obsproject/obs-studio), [Audacity](https://github.com/audacity/audacity), [Ardour](https://github.com/Ardour/ardour), [LMMS](https://github.com/LMMS/lmms), [OpenUtau](https://github.com/stakira/OpenUtau), [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [InvokeAI](https://github.com/invoke-ai/InvokeAI), [Fooocus](https://github.com/lllyasviel/Fooocus), [Krita AI Diffusion](https://github.com/Acly/krita-ai-diffusion), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), [GFPGAN](https://github.com/TencentARC/GFPGAN), [RIFE](https://github.com/megvii-research/ECCV2022-RIFE), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [Whisper](https://github.com/openai/whisper), [MMAudio](https://github.com/hkchengrex/MMAudio).
- **Kapalı referans sınıfı:** Adobe Creative Cloud/Firefly, Photoshop generative tools, Midjourney, DALL·E, Imagen, Runway, Pika, Sora, Kling, Suno, Udio, Canva, Figma, Premiere Pro, DaVinci Resolve Studio.
- **Gerçek fark analizi:** prompt adherence; text spelling; identity consistency where permitted; temporal consistency; artifact rate; editing controllability; output resolution; reproducible workflow; latency/cost; rights/consent; provenance/watermarking requirements.
- **Aurora bağlantısı:** define “generate” vs “edit provided asset” workflows. Keep source, prompt, seed, model/license and post-processing history. Voice/likeness replication needs consent; no claim that a model is best without side-by-side blind evaluation.

## 17.22 Oyun geliştirme, etkileşimli hikâye, simülasyon ve sanal dünyalar

**Alt alanlar:** game design documents; systems/balance design; level design; narrative branching; quest generation; NPC dialogue; 2D/3D asset generation; character rig/animation; procedural world generation; shader/material authoring; game code; editor scripting; playtesting agents; game QA; performance profiling; localization; modding tools; multiplayer server automation; telemetry analysis; crash triage; virtual economy simulation; tabletop/RPG GM assistance; educational simulation.

- **Açık kaynak adayları:** [Godot Engine](https://github.com/godotengine/godot), [Bevy](https://github.com/bevyengine/bevy), [O3DE](https://github.com/o3de/o3de), [Stride](https://github.com/stride3d/stride), [Defold](https://github.com/defold/defold), [GDevelop](https://github.com/4ian/GDevelop), [Ren'Py](https://github.com/renpy/renpy), [Twine](https://github.com/klembot/twinejs), [Ink](https://github.com/inkle/ink), [Blender](https://github.com/blender/blender), [Krita](https://github.com/KDE/krita), [Material Maker](https://github.com/RodZill4/material-maker), [TrenchBroom](https://github.com/TrenchBroom/TrenchBroom), [OpenXR](https://github.com/KhronosGroup/OpenXR-SDK), [GUT](https://github.com/bitwes/Gut), [GdUnit4](https://github.com/MikeSchulze/gdUnit4), [Playwright](https://github.com/microsoft/playwright), [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector), [SuperTuxKart](https://github.com/supertuxkart/stk-code) for testbed experiments.
- **Kapalı referans sınıfı:** Unreal Engine, Unity, Roblox Studio, proprietary game-agent playtesting platforms, commercial asset-generation suites.
- **Gerçek fark analizi:** build success; gameplay task completion; frame time; crash-free test runs; NPC consistency; multiplayer exploitability; balance; deterministic replay; platform licensing; generated-asset rights.
- **Aurora bağlantısı:** code/editor agent, asset-generation service, build runner and playtest worker are separate capabilities. Games must be launched in an isolated test environment with resource/network permissions constrained.

## 17.23 Ses, müzik, yayın, podcast ve konuşma sistemleri

**Alt alanlar:** speech recognition; language identification; speaker diarization; voice activity detection; speech enhancement; denoising; echo cancellation; TTS; voice conversion with consent; multilingual dubbing; subtitles; alignment; music generation; source separation; transcription correction; audio event classification; acoustic scene analysis; podcast edit; broadcast automation; live meeting summaries; sound effects; pronunciation coach; singing synthesis research.

- **Açık kaynak adayları:** [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [whisperX](https://github.com/m-bain/whisperX), [pyannote.audio](https://github.com/pyannote/pyannote-audio), [Silero VAD](https://github.com/snakers4/silero-vad), [Piper](https://github.com/rhasspy/piper), [Coqui TTS](https://github.com/coqui-ai/TTS), [Kokoro](https://github.com/hexgrad/kokoro), [MeloTTS](https://github.com/myshell-ai/MeloTTS), [OpenVoice](https://github.com/myshell-ai/OpenVoice), [RVC](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI), [Demucs](https://github.com/facebookresearch/demucs), [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui), [AudioSep](https://github.com/Audio-AGI/AudioSep), [Essentia](https://github.com/MTG/essentia), [ librosa](https://github.com/librosa/librosa), [Spleeter](https://github.com/deezer/spleeter), [MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner), [Audacity](https://github.com/audacity/audacity), [Ardour](https://github.com/Ardour/ardour), [JACK](https://github.com/jackaudio/jack2).
- **Kapalı referans sınıfı:** ElevenLabs, OpenAI audio, Google Speech, Azure Speech, Deepgram, AssemblyAI, Suno, Udio, Descript, Adobe Podcast.
- **Gerçek fark analizi:** WER/CER; diarization error rate; naturalness and intelligibility; accent coverage; latency; music prompt adherence; stem isolation artifacts; consent and voice rights; streaming stability.
- **Aurora bağlantısı:** choose ASR/TTS by language/accent/latency, not one global provider. Turkish speech needs dedicated tests for names, suffixes, code-switching, noisy microphones and regional accents.

## 17.24 Sosyal ağlar, topluluklar, forumlar ve federasyon

**Alt alanlar:** community moderation assistance; thread summarization; duplicate question detection; forum search; community knowledge-base; content scheduling; accessibility captions; toxicity triage; policy explanation; moderation queue; reputation/spam signals; consent-based social analytics; community CRM; federated identity; open protocol interoperability; personal data export.

- **Açık kaynak adayları:** [Mastodon](https://github.com/mastodon/mastodon), [Misskey](https://github.com/misskey-dev/misskey), [Pixelfed](https://github.com/pixelfed/pixelfed), [Lemmy](https://github.com/LemmyNet/lemmy), [Matrix Synapse](https://github.com/element-hq/synapse), [Element](https://github.com/element-hq/element-web), [Discourse](https://github.com/discourse/discourse), [NodeBB](https://github.com/NodeBB/NodeBB), [Flarum](https://github.com/flarum/flarum), [HumHub](https://github.com/humhub/humhub), [Matrix SDK](https://github.com/matrix-org), [ActivityPub](https://www.w3.org/TR/activitypub/), [Mautic](https://github.com/mautic/mautic), [Listmonk](https://github.com/knadh/listmonk), [OpenSocial](https://github.com/opensocial/opensocial).
- **Kapalı referans sınıfı:** Discord, Reddit, Slack communities, Facebook/Instagram/TikTok business tools, proprietary social-listening services.
- **Gerçek fark analizi:** moderation precision/recall; appeals; context sensitivity; language/dialect bias; privacy; platform API constraints; duplicate posts; accidental publishing; federation protocol compatibility.
- **Aurora bağlantısı:** no bulk unsolicited posting, deceptive engagement or circumvention of rate limits. Moderation decisions should remain appealable and human-overridable.

## 17.25 Kişisel finans, ev yaşamı, akıllı ev ve kişisel otomasyon

**Alt alanlar:** personal budget; transaction categorization; subscriptions; bill reminders; household inventory; shopping list; calendar/time management; travel planning; household energy; smart-home routines; device interoperability; media library; photo deduplication; home maintenance schedule; recipe planning; nutrition information; personal archive; family calendar; accessible reminders; local/offline assistant; device health.

- **Açık kaynak adayları:** [Home Assistant](https://github.com/home-assistant/core), [openHAB](https://github.com/openhab/openhab-core), [Node-RED](https://github.com/node-red/node-red), [ioBroker](https://github.com/ioBroker/ioBroker), [Domoticz](https://github.com/domoticz/domoticz), [Actual Budget](https://github.com/actualbudget/actual), [Firefly III](https://github.com/firefly-iii/firefly-iii), [Maybe Finance](https://github.com/maybe-finance/maybe), [Wallabag](https://github.com/wallabag/wallabag), [Immich](https://github.com/immich-app/immich), [PhotoPrism](https://github.com/photoprism/photoprism), [Jellyfin](https://github.com/jellyfin/jellyfin), [Navidrome](https://github.com/navidrome/navidrome), [Mealie](https://github.com/mealie-recipes/mealie), [Grocy](https://github.com/grocy/grocy), [Nextcloud](https://github.com/nextcloud/server), [Radicale](https://github.com/Kozea/Radicale), [KDE Connect](https://github.com/KDE/kdeconnect-kde), [Syncthing](https://github.com/syncthing/syncthing).
- **Kapalı referans sınıfı:** Apple/Google personal assistant stacks, Alexa, HomeKit, Google Home, YNAB, Monarch Money, Rocket Money, commercial smart-home hubs.
- **Gerçek fark analizi:** task success; false triggers; device state confirmation; offline reliability; transaction matching; time-zone handling; household member permissions; privacy; recovery from network failure.
- **Aurora bağlantısı:** homes contain sensitive data and physical side effects. Door locks, ovens, alarms, heating and cameras need separate authorization, explicit confirmation and robust local fallback.

## 17.26 Kamu hizmetleri, civic tech, açık veri ve acil durum bilgisi

**Alt alanlar:** public-service form completion; permit/benefit eligibility explanation; open-data search; legislative tracking; public consultation synthesis; budget analysis; public procurement; municipal service tickets; accessibility of government services; disaster information aggregation; humanitarian logistics; evacuation-information lookup; air-quality data; flood/fire risk data interpretation; public-health dashboards; records request drafting; civic participation; public transport; local government knowledge base.

- **Açık kaynak adayları:** [CKAN](https://github.com/ckan/ckan), [OpenFisca](https://github.com/openfisca/openfisca-core), [Decidim](https://github.com/decidim/decidim), [CONSUL Democracy](https://github.com/consuldemocracy/consuldemocracy), [OpenReferral](https://github.com/openreferral), [Open Data Kit](https://github.com/getodk/collect), [KoboToolbox](https://github.com/kobotoolbox/kobo), [DHIS2](https://github.com/dhis2/dhis2-core), [Sahana Eden](https://github.com/sahana/eden), [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner), [QGIS](https://github.com/qgis/QGIS), [OpenStreetMap](https://github.com/openstreetmap/openstreetmap-website), [Open311](https://www.open311.org/), [OpenContracting Data Standard](https://github.com/open-contracting/standard), [OpenSearch](https://github.com/opensearch-project/OpenSearch).
- **Kapalı referans sınıfı:** commercial government portals, Palantir Foundry, Bloomberg Government, proprietary emergency intelligence systems.
- **Gerçek fark analizi:** data freshness; legal eligibility accuracy; source provenance; public records privacy; vulnerable-population harm; outage tolerance; uncertainty and official instructions hierarchy.
- **Aurora bağlantısı:** official sources outrank social rumors; emergency instructions require dated, location-relevant authoritative evidence. Never impersonate a public official or submit a high-impact application without user review.

## 17.27 Ekonomi, sosyal bilimler, psikoloji araştırması ve politika analizi

**Alt alanlar:** literature synthesis; survey design; interview coding; thematic analysis; survey weighting; econometrics; causal inference; policy impact evaluation; public opinion analysis; demographic data; social network analysis; labor-market analysis; economic forecasting; qualitative coding; archival social research; experiment preregistration; replication planning; research ethics documentation; bias audits; evidence grading.

- **Açık kaynak adayları:** [R](https://github.com/wch/r-source), [Python/pandas](https://github.com/pandas-dev/pandas), [statsmodels](https://github.com/statsmodels/statsmodels), [PyMC](https://github.com/pymc-devs/pymc), [DoWhy](https://github.com/py-why/dowhy), [EconML](https://github.com/py-why/EconML), [CausalML](https://github.com/uber/causalml), [DoubleML](https://github.com/DoubleML/doubleml-for-py), [NetworkX](https://github.com/networkx/networkx), [igraph](https://github.com/igraph/igraph), [Gephi](https://github.com/gephi/gephi), [QualCoder](https://github.com/ccbogel/QualCoder), [Taguette](https://github.com/remram44/taguette), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [LimeSurvey](https://github.com/LimeSurvey/LimeSurvey), [ODK](https://github.com/getodk/collect), [JASP](https://github.com/jasp-stats/jasp-desktop), [jamovi](https://github.com/jamovi/jamovi), [PSPP](https://github.com/gnu-mirror-unofficial/pspp), [NetLogo](https://github.com/NetLogo/NetLogo).
- **Kapalı referans sınıfı:** Stata, SPSS, SAS, Qualtrics, NVivo, MAXQDA, commercial market/policy intelligence.
- **Gerçek fark analizi:** sampling and weighting; causal assumptions; confounding; missingness; preregistration; reproducibility; code/data provenance; uncertainty; correlation-vs-causation errors.
- **Aurora bağlantısı:** maintain a strict separation between empirical finding, interpretation and policy recommendation. Keep anonymization and research ethics gates in the workflow.

## 17.28 Arkeoloji, tarih, kültürel miras, müze, sanat tarihi ve arşiv

**Alt alanlar:** archival OCR/transcription; handwritten manuscripts; historical maps; place-name entity linking; chronology; provenance; artifact cataloging; epigraphy; paleography; manuscript collation; museum collection search; 3D heritage digitization; restoration planning; oral-history transcription; multilingual archive search; citation and archival reference generation; cultural-property metadata; conservation condition tracking.

- **Açık kaynak adayları:** [eScriptorium](https://github.com/Princeton-CDH/eScriptorium), [Kraken](https://github.com/mittagessen/kraken), [Transkribus research ecosystem](https://github.com/Transkribus), [Tesseract](https://github.com/tesseract-ocr/tesseract), [IIIF](https://github.com/IIIF), [Omeka S](https://github.com/omeka/omeka-s), [CollectiveAccess](https://github.com/collectiveaccess/providence), [Arches](https://github.com/archesproject/arches), [QGIS](https://github.com/qgis/QGIS), [Recogito](https://github.com/recogito/recogito), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Zotero](https://github.com/zotero/zotero), [InvenioRDM](https://github.com/inveniosoftware/invenio-app-rdm), [Tropy](https://github.com/tropy/tropy), [Meshroom](https://github.com/alicevision/meshroom), [Blender](https://github.com/blender/blender).
- **Kapalı referans sınıfı:** commercial digital archive, museum collection, cultural heritage conservation and manuscript recognition suites.
- **Gerçek fark analizi:** scan/page provenance; uncertainty marking; date conversion; place-name ambiguity; no silent normalization; conservation constraints; rights and culturally sensitive materials.
- **Aurora bağlantısı:** keep original transcription and normalized text side by side; every historical assertion must point to archival object, catalogue identifier and page/image location.

## 17.29 Spor, performans analizi, antrenman ve etkinlik operasyonları

**Alt alanlar:** match/video tagging; tactics diagrams; player tracking; pose estimation; performance dashboards; load monitoring; sports statistics; match schedules; tournament operations; officiating assistance research; e-sports analytics; event logistics; venue management; ticketing; broadcast overlays; practice planning; recovery education; adaptive exercise planning.

- **Açık kaynak adayları:** [OpenCV](https://github.com/opencv/opencv), [MMAction2](https://github.com/open-mmlab/mmaction2), [MMPose](https://github.com/open-mmlab/mmpose), [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX), [Sports2D](https://github.com/davidpagnon/Sports2D), [Kinovea](https://github.com/Kinovea/Kinovea), [OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose), [OpenTracks](https://github.com/OpenTracksApp/OpenTracks), [ActivityWatch](https://github.com/ActivityWatch/activitywatch), [Pretix](https://github.com/pretix/pretix), [Open Event Server](https://github.com/fossasia/open-event-server), [Scoreboard](https://github.com/jeffshee/scoreboard).
- **Kapalı referans sınıfı:** Hudl, Catapult, Stats Perform, Sportradar, SAP Sports One, commercial event ticketing and broadcast products.
- **Gerçek fark analizi:** tracking accuracy; camera angle and occlusion; valid ruleset/season; data rights; latency; measurement reliability; injury/health claims restraint.
- **Aurora bağlantısı:** separate entertainment predictions from evidence-based performance measurement. Use consent for biometric footage, especially minors; do not infer medical diagnosis from training data.

## 17.30 Yiyecek, tarif, restoran, konaklama ve turizm

**Alt alanlar:** recipe extraction; ingredient substitutions; pantry/inventory; meal scheduling; allergy-aware planning; food cost and nutrition estimate; menu translation; restaurant discovery; opening-hours verification; reservation workflow; hospitality booking orchestration; hotel room/inventory; itinerary; local transit; travel restrictions; visa-source lookup; route re-planning; accessibility needs; luggage/packing; event itinerary; review summarization; destination content; guest support.

- **Açık kaynak adayları:** [Mealie](https://github.com/mealie-recipes/mealie), [Tandoor Recipes](https://github.com/TandoorRecipes/recipes), [Grocy](https://github.com/grocy/grocy), [Open Food Facts](https://github.com/openfoodfacts), [QGIS](https://github.com/qgis/QGIS), [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner), [OSRM](https://github.com/Project-OSRM/osrm-backend), [Valhalla](https://github.com/valhalla/valhalla), [Pretix](https://github.com/pretix/pretix), [ERPNext hospitality capabilities](https://github.com/frappe/erpnext), [OpenStreetMap](https://github.com/openstreetmap/openstreetmap-website).
- **Kapalı referans sınıfı:** Google Travel/Maps, Booking.com, Expedia, Airbnb, Trip.com, OpenTable, Resy, commercial hotel/POS platforms.
- **Gerçek fark analizi:** date/time/country correctness; official hours and availability; reservation confirmation; allergy cross-contamination distinction; source recency; price and cancellation terms.
- **Aurora bağlantısı:** never claim a reservation or booking succeeded until the provider confirms it. Medical allergies require conservative filtering and explicit user verification; travel rules require current official sources.

## 17.31 Dil, çeviri, yerelleştirme ve özellikle Türkçe desteği

**Alt alanlar:** multilingual input/output; Turkish morphology; suffix harmony; named entities; technical glossary; subtitling; speech dialect coverage; code-switching; locale-sensitive numbers/dates/currency; right-to-left writing; terminology management; translation memory; UI string QA; pseudo-localization; transliteration; historical Turkish/Ottoman script research; formal/informal register; regional variants; accessibility/plain-language translation.

- **Açık kaynak adayları:** [Apertium](https://github.com/apertium/apertium), [Argos Translate](https://github.com/argosopentech/argos-translate), [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate), [Bergamot](https://github.com/browsermt/bergamot-translator), [NLLB models and tooling](https://github.com/facebookresearch/fairseq), [Marian](https://github.com/marian-nmt/marian), [OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT), [SentencePiece](https://github.com/google/sentencepiece), [spaCy](https://github.com/explosion/spaCy), [Stanza](https://github.com/stanfordnlp/stanza), [Zemberek NLP](https://github.com/ahmetaa/zemberek-nlp), [LanguageTool](https://github.com/languagetool-org/languagetool), [ICU](https://github.com/unicode-org/icu), [Weblate](https://github.com/WeblateOrg/weblate), [Pontoon](https://github.com/mozilla/pontoon), [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit), [MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner).
- **Kapalı referans sınıfı:** DeepL, Google Translate, Microsoft Translator, modern multilingual LLMs and enterprise localization suites.
- **Gerçek fark analizi:** COMET/BLEU/chrF plus human review; terminology; morphology; idioms; speech WER; name/entity preservation; placeholder integrity; regional appropriateness.
- **Aurora bağlantısı:** keep source and target, glossary, document context and review status; benchmark Turkish and code-switching separately rather than assuming English test results transfer.

## 17.32 Bilgi güveni, kaynak doğrulama, fact-checking ve epistemik kalite

**Alt alanlar:** claim extraction; citation retrieval; citation entailment; quotation verification; source authority ranking; version/date validation; contradictory source synthesis; data provenance; uncertainty expression; numerical cross-checking; live fact verification; hallucination detection; misinformation triage; scientific reproducibility; provenance manifests; calibrated abstention.

- **Açık kaynak adayları:** [ClaimBuster](https://github.com/ClaimBuster/ClaimBuster), [FEVER dataset tooling](https://github.com/fever), [GROBID](https://github.com/kermitt2/grobid), [Crossref API](https://github.com/CrossRef/rest-api-doc), [OpenAlex](https://github.com/ourresearch/openalex), [Wikidata Query Service](https://github.com/wikimedia/wikidata-query-rdf), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [RDFLib](https://github.com/RDFLib/rdflib), [Haystack](https://github.com/deepset-ai/haystack), [LlamaIndex](https://github.com/run-llama/llama_index), [Ragas](https://github.com/explodinggradients/ragas), [DeepEval](https://github.com/confident-ai/deepeval), [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai), [TruLens](https://github.com/truera/trulens), [promptfoo](https://github.com/promptfoo/promptfoo).
- **Kapalı referans sınıfı:** enterprise search/answer engines, fact-checking workflows, proprietary research agents and citation-check services.
- **Gerçek fark analizi:** claim-level precision; unsupported assertion rate; citation entailment; date freshness; source diversity; calibrated abstention; numeric reproducibility; ability to preserve disagreement.
- **Aurora bağlantısı:** citations must be bound to exact source spans/version where possible. Search relevance is not proof. If evidence is missing, mark unknown and request more source data rather than inventing.

## 17.33 Veri mühendisliği, analitik, BI, iş zekâsı ve data governance

**Alt alanlar:** ETL/ELT; batch/stream; orchestration; lakehouse; warehouse; data catalog; lineage; schema evolution; data contracts; quality checks; duplicate/entity resolution; privacy transformations; PII discovery; metadata management; self-service BI; natural-language-to-SQL; semantic layer; feature store; data observability; dashboard generation; metric consistency; row-level security; dataset documentation; synthetic test data.

- **Açık kaynak adayları:** [Apache Airflow](https://github.com/apache/airflow), [Dagster](https://github.com/dagster-io/dagster), [Prefect](https://github.com/PrefectHQ/prefect), [Kestra](https://github.com/kestra-io/kestra), [dbt Core](https://github.com/dbt-labs/dbt-core), [Meltano](https://github.com/meltano/meltano), [Airbyte](https://github.com/airbytehq/airbyte), [dlt](https://github.com/dlt-hub/dlt), [Singer](https://github.com/singer-io), [Apache Spark](https://github.com/apache/spark), [Apache Flink](https://github.com/apache/flink), [DuckDB](https://github.com/duckdb/duckdb), [Trino](https://github.com/trinodb/trino), [Iceberg](https://github.com/apache/iceberg), [Delta Lake](https://github.com/delta-io/delta), [Project Nessie](https://github.com/projectnessie/nessie), [OpenMetadata](https://github.com/open-metadata/OpenMetadata), [DataHub](https://github.com/datahub-project/datahub), [Marquez](https://github.com/MarquezProject/marquez), [OpenLineage](https://github.com/OpenLineage/OpenLineage), [Great Expectations](https://github.com/great-expectations/great_expectations), [Soda Core](https://github.com/sodadata/soda-core), [Pandera](https://github.com/unionai-oss/pandera), [Feast](https://github.com/feast-dev/feast), [Metabase](https://github.com/metabase/metabase), [Apache Superset](https://github.com/apache/superset), [Lightdash](https://github.com/lightdash/lightdash), [Evidence](https://github.com/evidence-dev/evidence).
- **Kapalı referans sınıfı:** Snowflake, Databricks, Tableau, Power BI, Looker, Alteryx, Fivetran, Informatica, Monte Carlo, Collibra.
- **Gerçek fark analizi:** data freshness; schema contracts; query correctness; lineage completeness; row-level access; quality violation recall; dashboard metric consistency; cost and job failure rate.
- **Aurora bağlantısı:** treat SQL as an executable action: default read-only, row/time/query-cost caps, query explain, exact result provenance, write approval and audit.

## 17.34 Yazılım testleri, kalite güvencesi ve ürün doğrulama nişleri

**Alt alanlar:** unit/integration/e2e; property-based testing; mutation testing; fuzzing; visual regression; accessibility testing; browser/device matrix; API contract testing; performance/load/soak; flaky test detection; test generation; requirement-to-test traceability; acceptance criteria; release validation; migration verification; backup/restore verification; localization QA; compatibility testing; chaos engineering; observability-based verification.

- **Açık kaynak adayları:** [Playwright](https://github.com/microsoft/playwright), [Cypress](https://github.com/cypress-io/cypress), [Vitest](https://github.com/vitest-dev/vitest), [Jest](https://github.com/jestjs/jest), [pytest](https://github.com/pytest-dev/pytest), [Hypothesis](https://github.com/HypothesisWorks/hypothesis), [fast-check](https://github.com/dubzzz/fast-check), [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js), [AFL++](https://github.com/AFLplusplus/AFLplusplus), [OSS-Fuzz](https://github.com/google/oss-fuzz), [Schemathesis](https://github.com/schemathesis/schemathesis), [Pact](https://github.com/pact-foundation/pact), [k6](https://github.com/grafana/k6), [Locust](https://github.com/locustio/locust), [JMeter](https://github.com/apache/jmeter), [Gatling](https://github.com/gatling/gatling), [Lighthouse](https://github.com/GoogleChrome/lighthouse), [axe-core](https://github.com/dequelabs/axe-core), [Percy alternative ecosystem](https://github.com/americanexpress/jest-image-snapshot), [Stryker](https://github.com/stryker-mutator/stryker-js), [PIT](https://github.com/hcoles/pitest), [Allure](https://github.com/allure-framework/allure2), [ReportPortal](https://github.com/reportportal/reportportal), [Keploy](https://github.com/keploy/keploy).
- **Kapalı referans sınıfı:** BrowserStack, Sauce Labs, mabl, Testim, Launchable, commercial fuzzing/testing platforms.
- **Gerçek fark analizi:** branch/line coverage is not enough; mutation score, escaped-defect rate, flake rate, reproducibility, traceability to requirements, test-oracle quality.
- **Aurora bağlantısı:** every module adapter ships with contract tests, integration tests, failure tests, resource limits and license metadata; model-generated code cannot self-certify.

## 17.35 Dil modeli altyapısı, açık ağırlıklı modeller, eğitim ve inference

**Alt alanlar:** model catalogue; weight/license provenance; inference engines; quantization; batching; KV-cache; speculative decoding; long-context retrieval; structured output; constrained decoding; fine-tuning; LoRA/QLoRA; distillation; eval harness; GPU scheduling; model routing; token/cost budget; offline operation; multimodal serving; model artifact signatures; unsafe model isolation; prompt cache.

- **Açık kaynak/altyapı adayları:** [Hugging Face Transformers](https://github.com/huggingface/transformers), [vLLM](https://github.com/vllm-project/vllm), [SGLang](https://github.com/sgl-project/sglang), [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://github.com/ollama/ollama), [MLX](https://github.com/ml-explore/mlx), [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM), [TGI](https://github.com/huggingface/text-generation-inference), [DeepSpeed](https://github.com/microsoft/DeepSpeed), [FSDP examples](https://github.com/pytorch/pytorch), [Axolotl](https://github.com/axolotl-ai-cloud/axolotl), [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory), [Unsloth](https://github.com/unslothai/unsloth), [PEFT](https://github.com/huggingface/peft), [TRL](https://github.com/huggingface/trl), [LitGPT](https://github.com/Lightning-AI/litgpt), [torchtune](https://github.com/pytorch/torchtune), [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF), [Axolotl](https://github.com/axolotl-ai-cloud/axolotl), [llm-awq](https://github.com/mit-han-lab/llm-awq), [GPTQModel](https://github.com/ModelCloud/GPTQModel), [bitsandbytes](https://github.com/bitsandbytes-foundation/bitsandbytes), [llama.cpp quantization docs](https://github.com/ggml-org/llama.cpp), [MLflow](https://github.com/mlflow/mlflow), [Weights & Biases local alternatives](https://github.com/clearml/clearml).
- **Kapalı referans sınıfı:** OpenAI, Anthropic, Google Gemini, xAI, commercial proprietary inference APIs, managed fine-tuning products.
- **Gerçek fark analizi:** same-task success; tokens/sec; time-to-first-token; context retrieval; memory/GPU; tool-call accuracy; instruction following; refusal calibration; model license and permitted applications; cost per verified completion.
- **Aurora bağlantısı:** model registry records exact artifact hash, quantization, tokenizer, template, hardware, license and eval version. Automatic model routing must optimize verified task success rather than model size or marketing claims.

## 17.36 Öğrenme, kişiselleştirme, tekrarlanabilir bellek ve güvenli self-improvement

**Alt alanlar:** episodic memory; semantic memory; procedural memory; user-preference profile; project memory; source-linked facts; task outcome archive; memory decay; contradiction resolution; feedback capture; skills library; successful-plan retrieval; failure clustering; eval-driven improvement; synthetic curriculum; offline replay; preference learning; fine-tune candidate curation; regression protection; capability gap detection; memory privacy/deletion.

- **Açık kaynak adayları:** [Mem0](https://github.com/mem0ai/mem0), [Letta](https://github.com/letta-ai/letta), [Zep/Graphiti](https://github.com/getzep/graphiti), [LangGraph](https://github.com/langchain-ai/langgraph), [Haystack](https://github.com/deepset-ai/haystack), [LlamaIndex](https://github.com/run-llama/llama_index), [Cognee](https://github.com/topoteretes/cognee), [Graphiti](https://github.com/getzep/graphiti), [Chroma](https://github.com/chroma-core/chroma), [Qdrant](https://github.com/qdrant/qdrant), [Weaviate](https://github.com/weaviate/weaviate), [Milvus](https://github.com/milvus-io/milvus), [LanceDB](https://github.com/lancedb/lancedb), [DVC](https://github.com/iterative/dvc), [Promptfoo](https://github.com/promptfoo/promptfoo), [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai), [Ragas](https://github.com/explodinggradients/ragas), [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF), [TRL](https://github.com/huggingface/trl).
- **Kapalı referans sınıfı:** managed enterprise memory, proprietary personalized assistants, agent-learning platforms and internal feedback loops in closed products.
- **Gerçek fark analizi:** future task improvement; correct memory retrieval; stale-memory suppression; user deletion; privacy leak rate; task transfer; no training on unconsented secrets; no self-reported “confidence gain” without external success metrics.
- **Aurora bağlantısı:** memories are typed, sourced, expiring and user-deletable. A successful run is not automatically reusable; first isolate task-specific details, credentials and accidental outcomes. Any automated training requires dataset review and held-out regression tests.

## 17.37 Donanım, işletim sistemleri, geliştirici araçları ve tersine mühendislik

**Alt alanlar:** operating system concepts; drivers; kernel logs; compiler toolchains; profiling; disassembly; debugger control; binary formats; reverse engineering for authorized software; firmware analysis; protocol decoding; virtualization; filesystem recovery; storage health; performance profiling; build systems; package managers; developer environment setup; reproducible environments; cross compilation; hardware test automation.

- **Açık kaynak adayları:** [Ghidra](https://github.com/NationalSecurityAgency/ghidra), [radare2](https://github.com/radareorg/radare2), [Cutter](https://github.com/rizinorg/cutter), [Rizin](https://github.com/rizinorg/rizin), [Frida](https://github.com/frida/frida), [LLDB](https://github.com/llvm/llvm-project), [GDB](https://sourceware.org/git/binutils-gdb.git), [Valgrind](https://sourceware.org/git/valgrind.git), [perf tools](https://github.com/torvalds/linux), [bpftrace](https://github.com/bpftrace/bpftrace), [BCC](https://github.com/iovisor/bcc), [QEMU](https://github.com/qemu/qemu), [KVM](https://github.com/torvalds/linux), [Firecracker](https://github.com/firecracker-microvm/firecracker), [Buildroot](https://github.com/buildroot/buildroot), [Yocto Project](https://git.yoctoproject.org/poky), [Nix](https://github.com/NixOS/nix), [Guix](https://git.savannah.gnu.org/git/guix.git), [Bazel](https://github.com/bazelbuild/bazel), [CMake](https://github.com/Kitware/CMake), [Meson](https://github.com/mesonbuild/meson), [LLVM](https://github.com/llvm/llvm-project), [GCC](https://gcc.gnu.org/git/gcc.git), [QEMU](https://github.com/qemu/qemu), [OpenOCD](https://github.com/openocd-org/openocd), [Renode](https://github.com/renode/renode).
- **Kapalı referans sınıfı:** IDA Pro, Binary Ninja, commercial profilers, proprietary hardware debugging suites.
- **Gerçek fark analizi:** exact binary/version; symbols; reproducible crash; testbed isolation; rights to inspect software; evidence linking; hardware/firmware-specific limitations.
- **Aurora bağlantısı:** reverse-engineering capability is limited to authorized files/labs and interoperability/debugging. No bypassing licensing, access controls or protection mechanisms for unauthorized purposes.

## 17.38 İletişim, çağrı merkezi, toplantılar ve kurumsal bilgi akışı

**Alt alanlar:** meeting live captions; speaker attribution; summary by role; action items; minutes; search meeting archive; support-ticket enrichment; call QA; agent coaching; translation; redaction; voice-of-customer; contact-center routing; knowledge retrieval; customer handoff; incident bridge notes; email prioritization; inbox triage; FAQ generation; compliance review.

- **Açık kaynak adayları:** [Jitsi Meet](https://github.com/jitsi/jitsi-meet), [BigBlueButton](https://github.com/bigbluebutton/bigbluebutton), [Element/Matrix](https://github.com/element-hq/element-web), [Zulip](https://github.com/zulip/zulip), [Mattermost](https://github.com/mattermost/mattermost), [Nextcloud Talk](https://github.com/nextcloud/spreed), [Zammad](https://github.com/zammad/zammad), [Chatwoot](https://github.com/chatwoot/chatwoot), [FreeScout](https://github.com/freescout-helpdesk/freescout), [Whisper](https://github.com/openai/whisper), [pyannote.audio](https://github.com/pyannote/pyannote-audio), [OpenSearch](https://github.com/opensearch-project/OpenSearch), [Memos](https://github.com/usememos/memos), [Outline](https://github.com/outline/outline).
- **Kapalı referans sınıfı:** Zoom AI Companion, Teams Copilot, Google Meet AI, Otter.ai, Fireflies, Gong, Salesforce Service Cloud Voice, Genesys Cloud.
- **Gerçek fark analizi:** transcript WER; speaker attribution; action extraction accuracy; latency; privacy/consent; false action creation; access scope; support handoff quality.
- **Aurora bağlantısı:** make recording/transcription visible and consent-controlled; distinguish “suggested action” from a committed task/calendar/CRM update.

## 17.39 Patent, standartlar, fikrî mülkiyet ve teknik bilgi araştırması

**Alt alanlar:** patent prior-art search; claim chart drafting; patent-family linking; patent classification; citation network; standards lookup; technical standard comparison; license compatibility; software component attribution; trademark watch; design prior art; invention disclosure drafting; scientific patent landscape; standards-based checklist creation.

- **Açık kaynak/altyapı adayları:** [Lens-like workflows must use licensed APIs](https://www.epo.org/searching-for-patents/technical/espacenet.html), [OpenAlex](https://github.com/ourresearch/openalex), [Crossref](https://github.com/CrossRef/rest-api-doc), [EPO OPS documentation](https://www.epo.org/en/searching-for-patents/data/web-services/ops), [Wikidata](https://github.com/wikimedia/wikidata-query-rdf), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [GROBID](https://github.com/kermitt2/grobid), [ScanCode Toolkit](https://github.com/nexB/scancode-toolkit), [ORT](https://github.com/oss-review-toolkit/ort), [REUSE](https://github.com/fsfe/reuse-tool), [ClearlyDefined](https://github.com/clearlydefined/clearlydefined).
- **Kapalı referans sınıfı:** Derwent Innovation, PatSnap, LexisNexis IP, commercial patent analytics and standards portals.
- **Gerçek fark analizi:** recall of relevant patent families; publication dates; claim-level evidence; jurisdiction; legal status; standards version; license provenance. Absence of search result is not evidence of novelty.
- **Aurora bağlantısı:** never certify novelty, patentability or freedom-to-operate without patent professional review and current authoritative records.

## 17.40 İK dışındaki insan uzmanlığı: koçluk, alışkanlık, bakım ve kişisel destek

**Alt alanlar:** goal breakdown; habit planning; reflective journaling; skill practice schedules; personal knowledge and project coaching; caregiver scheduling; routine and medication reminders; non-clinical stress-management education; accessible daily planning; personal crisis-resource lookup; language-practice partner; accountability check-ins; independent living support.

- **Açık kaynak/altyapı adayları:** [Habitica](https://github.com/HabitRPG/habitica), [Vikunja](https://github.com/go-vikunja/vikunja), [Super Productivity](https://github.com/johannesjo/super-productivity), [ActivityWatch](https://github.com/ActivityWatch/activitywatch), [Logseq](https://github.com/logseq/logseq), [Joplin](https://github.com/laurent22/joplin), [Memos](https://github.com/usememos/memos), [Nextcloud](https://github.com/nextcloud/server), [Home Assistant](https://github.com/home-assistant/core), [OpenTracks](https://github.com/OpenTracksApp/OpenTracks).
- **Kapalı referans sınıfı:** commercial coaching apps, wellness assistants, digital therapeutics and personal assistant stacks.
- **Gerçek fark analizi:** user-defined goals; nonjudgmental tone; adherence usefulness; no manipulative dependency; user control; data minimization; crisis escalation and professional boundaries.
- **Aurora bağlantısı:** no substitute for a licensed clinician or emergency service. Keep the user in control of reminders and stored routines; support deletion and portability.

## 17.41 İklim, afet, yangın, sel, acil durum ve dayanıklılık planlaması

**Alt alanlar:** hazard-data aggregation; flood/fire/heat risk maps; earthquake scenario data; infrastructure dependency mapping; emergency stock/inventory; evacuation information; shelter/resource mapping; disaster logistics; damage assessment from imagery; outage monitoring; business continuity; backup communications; recovery prioritization; crisis bulletin summarization.

- **Açık kaynak adayları:** [QGIS](https://github.com/qgis/QGIS), [GeoServer](https://github.com/geoserver/geoserver), [OpenStreetMap](https://github.com/openstreetmap/openstreetmap-website), [InaSAFE](https://github.com/inasafe/inasafe), [GDAL](https://github.com/OSGeo/gdal), [xarray](https://github.com/pydata/xarray), [OpenDroneMap](https://github.com/OpenDroneMap/ODM), [Sahana Eden](https://github.com/sahana/eden), [KoboToolbox](https://github.com/kobotoolbox/kobo), [ODK](https://github.com/getodk/collect), [SUMO](https://github.com/eclipse-sumo/sumo), [OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner).
- **Kapalı referans sınıfı:** national meteorological/disaster systems, commercial geospatial intelligence, emergency management platforms.
- **Gerçek fark analizi:** source time and location; false alarm vs missed event; map data coverage; official alert precedence; route hazard; vulnerable-user support; graceful degradation without internet.
- **Aurora bağlantısı:** use official emergency instructions as first priority and display timestamp/source. Do not generate fictional alerts or treat social-media reports as verified incidents.

## 17.42 Endüstriyel bakım, madencilik, petrol/gaz ve saha operasyonları

**Alt alanlar:** equipment manual retrieval; maintenance history; work-order creation; spare-parts matching; failure-mode analysis; predictive maintenance; inspection image triage; vibration/sensor analytics; field-service scheduling; geospatial asset management; mine planning research; process safety review; pipeline inspection reports; industrial control system inventory; permit-to-work documentation; maintenance shutdown planning.

- **Açık kaynak adayları:** [OpenMaint](https://github.com/openmaint/openmaint), [ERPNext](https://github.com/frappe/erpnext), [openMAINT/CMDBuild](https://github.com/ComuneFI/CMDBuild), [ThingsBoard](https://github.com/thingsboard/thingsboard), [Grafana](https://github.com/grafana/grafana), [InfluxDB](https://github.com/influxdata/influxdb), [TimescaleDB](https://github.com/timescale/timescaledb), [OpenPLC](https://github.com/thiagoralves/OpenPLC_v3), [OPC UA open62541](https://github.com/open62541/open62541), [OpenModelica](https://github.com/OpenModelica/OpenModelica), [Pyomo](https://github.com/Pyomo/pyomo), [OR-Tools](https://github.com/google/or-tools), [OpenFOAM](https://github.com/OpenFOAM/OpenFOAM-dev).
- **Kapalı referans sınıfı:** IBM Maximo, SAP EAM, AVEVA, AspenTech, Seeq, commercial predictive-maintenance suites.
- **Gerçek fark analizi:** false alarms; missed critical failures; sensor drift; maintenance-cost savings validated out-of-sample; safety procedures; asset identifiers; technician confirmation.
- **Aurora bağlantısı:** outputs are advisory; no unattended changes to industrial controls or work permits. Safety documentation must be site- and equipment-specific, versioned and approved.

## 17.43 Tedarik, sözleşme yönetimi, satın alma, lojistik ve vendor risk

**Alt alanlar:** RFP/RFQ analysis; tender response drafting; quote comparison; contract metadata; renewal watch; vendor onboarding; sanctions checks; vendor cybersecurity questionnaires; spend classification; purchase approval; supply risk; lead times; customs documents; shipping paperwork; invoice-to-PO matching; sustainability criteria; supplier performance; audit packet assembly.

- **Açık kaynak adayları:** [ERPNext](https://github.com/frappe/erpnext), [Odoo](https://github.com/odoo/odoo), [OpenBoxes](https://github.com/openboxes/openboxes), [OpenContracting](https://github.com/open-contracting/standard), [OpenSanctions](https://github.com/opensanctions/opensanctions), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Docling](https://github.com/docling-project/docling), [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF), [OpenSearch](https://github.com/opensearch-project/OpenSearch), [OR-Tools](https://github.com/google/or-tools), [Metabase](https://github.com/metabase/metabase), [ScanCode Toolkit](https://github.com/nexB/scancode-toolkit).
- **Kapalı referans sınıfı:** SAP Ariba, Coupa, Ivalua, Jaggaer, Ironclad, DocuSign CLM, commercial third-party risk platforms.
- **Gerçek fark analizi:** apples-to-apples total cost; contract clause coverage; vendor identity match; sanctions list freshness; quote validity; approval path correctness; no fabricated vendor quote.
- **Aurora bağlantısı:** supplier risk and sanctions matches need explainable evidence and false-positive handling. Buying/committing requires permission and explicit approval.

## 17.44 İklim ve çevre dışındaki hukukî/operasyonel uyum: kalite, standartlar, risk ve denetim

**Alt alanlar:** ISO control mapping; SOC 2 evidence collection; policy-to-control mapping; audit test plans; evidence request automation; risk registers; nonconformity reports; CAPA; change management; document control; quality management; internal controls; privacy inventories; data processing records; vendor questionnaires; regulatory change impact; model risk management; AI governance; records retention.

- **Açık kaynak adayları:** [Open Policy Agent](https://github.com/open-policy-agent/opa), [Kyverno](https://github.com/kyverno/kyverno), [InSpec](https://github.com/inspec/inspec), [OpenSCAP](https://github.com/OpenSCAP/openscap), [ComplianceAsCode](https://github.com/ComplianceAsCode/content), [MISP](https://github.com/MISP/MISP), [OpenGRC projects require case-by-case review](https://github.com/search?q=open+source+GRC&type=repositories), [Eramba](https://github.com/eramba/eramba), [Presidio](https://github.com/microsoft/presidio), [OpenMetadata](https://github.com/open-metadata/OpenMetadata), [OpenLineage](https://github.com/OpenLineage/OpenLineage), [Docassemble](https://github.com/jhpyle/docassemble), [OpenProject](https://github.com/opf/openproject).
- **Kapalı referans sınıfı:** Vanta, Drata, OneTrust, ServiceNow GRC, Archer, AuditBoard, commercial QMS/PLM compliance products.
- **Gerçek fark analizi:** evidence provenance; latest standard version; control applicability; false attestation rate; auditor reproducibility; control owner approval; evidence expiry; separation of duties.
- **Aurora bağlantısı:** never fabricate that a control is implemented because a policy document exists. Distinguish claimed, configured, tested and externally attested states.

## 17.45 Nadir/uzman alanlar için genişletilebilir katalog

Bu bölüm, “unutulan alan kalmasın” hedefi nedeniyle ayrıca tutulur. Bazıları için uzman açık kaynak ekosistemi, diğerlerine göre daha küçük olabilir; bunlar otomatik olarak güçlü yapay zekâ ürünü anlamına gelmez. Her niş için uzman yazılım ve veri kaynaklarını bir capability olarak bağlayıp Aurora'nın ana akışına eklemek gerekir.

- **Müzikoloji ve nota:** [MuseScore](https://github.com/musescore/MuseScore), [music21](https://github.com/cuthbertLab/music21), [LilyPond](https://git.savannah.gnu.org/git/lilypond.git), [Frescobaldi](https://github.com/frescobaldi/frescobaldi), [Essentia](https://github.com/MTG/essentia).
- **Jeodezi ve ölçüm:** [PROJ](https://github.com/OSGeo/PROJ), [GeographicLib](https://github.com/geographiclib/geographiclib), [GDAL](https://github.com/OSGeo/gdal), [PDAL](https://github.com/PDAL/PDAL), [QGIS](https://github.com/qgis/QGIS).
- **Dil belgeleme ve saha çalışması:** [ELAN](https://archive.mpi.nl/tla/elan), [FLEx ecosystem](https://software.sil.org/fieldworks/), [Praat](https://github.com/praat/praat), [SayMore](https://software.sil.org/saymore/), [Universal Dependencies](https://github.com/UniversalDependencies), [Wiktextract](https://github.com/tatuylonen/wiktextract).
- **Kütüphane kataloglama ve dijital emanet:** [Koha](https://github.com/Koha-Community/Koha), [DSpace](https://github.com/DSpace/DSpace), [InvenioRDM](https://github.com/inveniosoftware/invenio-app-rdm), [Omeka S](https://github.com/omeka/omeka-s), [Archivematica](https://github.com/artefactual/archivematica), [BagIt](https://github.com/LibraryOfCongress/bagit-python).
- **Belge imza ve arşiv:** [PDF.js](https://github.com/mozilla/pdf.js), [PDFium](https://pdfium.googlesource.com/pdfium/), [veraPDF](https://github.com/veraPDF/veraPDF-library), [LibreSign](https://github.com/LibreSign/libresign), [OpenPDF](https://github.com/LibrePDF/OpenPDF).
- **Hukuk dili ve dava veri bilimi:** [CourtListener](https://github.com/freelawproject/courtlistener), [Eyecite](https://github.com/freelawproject/eyecite), [LexNLP](https://github.com/LexPredict/lexpredict-lexnlp), [OpenContracts](https://github.com/Open-Source-Legal/OpenContracts).
- **Araştırma idaresi ve laboratuvar kalite:** [eLabFTW](https://github.com/elabftw/elabftw), [openBIS](https://github.com/openBIS), [REANA](https://github.com/reanahub/reana), [Renku](https://github.com/SwissDataScienceCenter/renku), [DVC](https://github.com/iterative/dvc).
- **Çeviri altyazı/dublaj:** [Whisper](https://github.com/openai/whisper), [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit), [Aegisub](https://github.com/Aegisub/Aegisub), [Argos Translate](https://github.com/argosopentech/argos-translate), [MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner).
- **İçe aktarma/format dönüşümü:** [Pandoc](https://github.com/jgm/pandoc), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [ImageMagick](https://github.com/ImageMagick/ImageMagick), [LibreOffice](https://github.com/LibreOffice/core), [Calibre](https://github.com/kovidgoyal/calibre), [Apache Tika](https://github.com/apache/tika), [Frictionless](https://github.com/frictionlessdata/frictionless-py).
- **Kişisel arama ve yerel veri:** [Recoll](https://github.com/abiword/recoll), [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx), [Docspell](https://github.com/eikek/docspell), [OpenSearch](https://github.com/opensearch-project/OpenSearch), [Meilisearch](https://github.com/meilisearch/meilisearch), [Typesense](https://github.com/typesense/typesense).
- **Bireysel üretkenlik ve otomasyon:** [ActivityWatch](https://github.com/ActivityWatch/activitywatch), [Espanso](https://github.com/espanso/espanso), [AutoKey](https://github.com/autokey/autokey), [AutoHotkey](https://github.com/AutoHotkey/AutoHotkey), [PowerToys](https://github.com/microsoft/PowerToys), [Keypirinha](https://github.com/Keypirinha/Keypirinha), [Hammerspoon](https://github.com/Hammerspoon/hammerspoon).
- **Bilim eğitimi ve simüle laboratuvar:** [Jupyter](https://github.com/jupyter/notebook), [PhET simulations](https://github.com/phetsims), [OpenModelica](https://github.com/OpenModelica/OpenModelica), [OpenFOAM](https://github.com/OpenFOAM/OpenFOAM-dev), [VPython](https://github.com/vpython/vpython), [Manim](https://github.com/ManimCommunity/manim).
- **Coğrafi ve meteorolojik veri:** [MetPy](https://github.com/Unidata/MetPy), [Iris](https://github.com/SciTools/iris), [xarray](https://github.com/pydata/xarray), [Pangeo](https://github.com/pangeo-data/pangeo), [GeoPandas](https://github.com/geopandas/geopandas), [OpenClimateFix](https://github.com/openclimatefix).
- **Bireysel web/publishing stack:** [Hugo](https://github.com/gohugoio/hugo), [Astro](https://github.com/withastro/astro), [Docusaurus](https://github.com/facebook/docusaurus), [VitePress](https://github.com/vuejs/vitepress), [Zola](https://github.com/getzola/zola), [Quartz](https://github.com/jackyzha0/quartz).
- **Kültür, yayın, arşiv ve varlık yönetimi:** [ResourceSpace](https://github.com/resourcespace/resourcespace), [Pimcore](https://github.com/pimcore/pimcore), [CollectiveAccess](https://github.com/collectiveaccess/providence), [Omeka S](https://github.com/omeka/omeka-s), [OpenRefine](https://github.com/OpenRefine/OpenRefine).

## 17.46 Ülkeler, yargı alanları, kurum kuralları ve yerel farklılıklar

Aurora “her alanda” iddiasını yalnızca yazılım kategorileriyle tamamlayamaz. Aynı beceri ülkeye, dile, sektöre, kuruma ve tarihe göre farklılaşır. Kapsam matrisi her yeteneğe şu eksenleri eklemelidir:

- **Dil:** Türkçe ve İngilizce başlangıç; ardından Arapça, İspanyolca, Fransızca, Almanca, Çince, Japonca, Korece, Hint dilleri ve gerçek talebe göre diğer diller; her dil için ayrı benchmark.
- **Yargı alanı:** ülke, eyalet/bölge, sektör, kamu/özel kurum, yürürlük tarihi, resmî kaynaklar ve yetki sınırları.
- **İşletim sistemi/donanım:** Windows, Linux, macOS; Android/iOS; x86_64/ARM; CPU/iGPU/NVIDIA/AMD/Apple Silicon; internetli ve çevrimdışı modlar.
- **Kurumsal boyut:** bireysel, küçük işletme, ekip, büyük kurum, kamu; multi-tenant ve veri izolasyonu.
- **Erişilebilirlik/kültür:** bölgesel yazım ve biçim, takvim, ölçü birimi, para birimi, engellilik ihtiyaçları, kültürel miras ve hassas veri.
- **Yaşam döngüsü:** taslak, sandbox denemesi, pilot, üretim, kullanımdan kaldırma ve veri silme.

Özellikle Türkiye için ayrı paket: Türkçe NLP/ASR/TTS; TL ve yerel sayı/tarih biçimleri; Türk mevzuatı için resmi kaynaklar; e-fatura/e-arşiv ve muhasebe entegrasyonlarının güncel koşulları; KVKK; yerel harita/ulaşım kaynakları; Türkçe teknik/akademik kaynak kalitesi. Her entegrasyonun güncel hukuki ve API kullanım koşulları uygulanmadan varsayılmamalıdır.

## 17.47 Bileşen kataloğu: kapsam dışı kalmaması için her satırın zorunlu alanları

Her niş, `capability-registry.yaml` veya benzeri makine tarafından okunabilir kayıtta şu alanlarla bulunmalı:

```yaml
id: document.pdf.table_extraction
name: PDF tablo çıkarımı
parents: [documents.pdf, data.extraction]
inputs: [pdf, url, local_file]
outputs: [csv, xlsx, json, provenance_map]
open_source_candidates:
  - name: Docling
    repo: https://github.com/docling-project/docling
    status: candidate
    license_verified_at: null
    model_weights_reviewed: false
closed_source_references: [Adobe Acrobat AI Assistant, Azure Document Intelligence, Google Document AI]
benchmark:
  dataset: aurora-pdf-table-v1
  metrics: [cell_accuracy, table_structure_f1, reading_order_accuracy, latency, cost]
risk: medium
integration: isolated_worker
permissions: [read_input, write_workspace]
requires_human_approval: false
status: not_evaluated
last_reviewed: null
```

Zorunlu statüler: `discovered`, `candidate`, `license-reviewed`, `sandbox-tested`, `benchmark-tested`, `integrated`, `verified`, `production`, `deprecated`. “Integrated” ile “verified” ve “production” asla eş anlamlı sayılmaz.

## 17.48 Açık kaynak adayı sıralama algoritması

Her aday 100 puan üzerinden değil, ayrıca **sert eleme kapıları** üzerinden değerlendirilir. Yasak/uygunsuz lisans, kötü niyet göstergesi, güvenlik açığı, bakımın terk edilmiş olması veya erişilemeyen ağırlıklar gibi durumlarda puan yüksek olsa bile aday elenir.

Önerilen ağırlıklandırma:

- Göreve özgü ölçülmüş kalite: **%30**.
- Güvenlik, gizlilik ve yetki ayrımı: **%15**.
- Lisans ve ticari/dağıtım uygunluğu: **%10**.
- Bakım, güvenlik düzeltmesi hızı ve topluluk: **%10**.
- Entegrasyon kolaylığı ve API istikrarı: **%10**.
- Donanım, gecikme, maliyet ve kaynak ihtiyacı: **%10**.
- Veri/çıktı kalitesi, izlenebilirlik ve format desteği: **%5**.
- Dokümantasyon, test kapsamı ve gözlemlenebilirlik: **%5**.
- Yerel dil, çoklu dil ve erişilebilirlik: **%5**.

Puan, açık benchmark sonuçları ile Aurora'nın kendi testlerini birleştirmeli. Github yıldız sayısı, sosyal medya ilgisi veya README'deki “state-of-the-art” ifadesi puanın yerine geçmez.

## 17.49 Kapalı kaynak fark analizinin standart şablonu

Her alan için aynı referans sınama süreci:

1. Kapalı kaynak referans(lar)ın tam ürün/sürüm ve erişim koşullarını kaydet.
2. Aynı görevleri aynı girdi ve aynı kabul kriterleriyle dene.
3. Kapalı sağlayıcı izin veriyorsa eşdeğer araç ve bağlam kullan; izin vermiyorsa farkı “karşılaştırma sınırlı” olarak işaretle.
4. Çıktıyı kör veya bağımsız hakemle değerlendir; ölçütleri önceden belirle.
5. Her başarısızlık için hata sınıfını yaz: model bilgisi, planlama, araç, entegrasyon, bağlam, değerlendirme, gecikme/maliyet, güvenlik veya UX.
6. Düzeltmeyi ilgili katmanda yap; “her şeyi başka modelle çözme” varsayımından kaçın.
7. Aynı test setinde overfit olmamak için gizli/holdout görevler kullan.
8. Tamamlanan görevin kalite, süre, maliyet ve güvenlik puanlarını birlikte karşılaştır.
9. Sonuçları sürüm, commit, model hash ve tarihle sakla.
10. Rakip ürün değiştiğinde benchmark'ı tekrar çalıştır.

**Çıktı tablosu:** `field | niche | task | reference_product/model | open_source_candidate | metric | Aurora baseline | reference result | measured gap | intervention | result after intervention | license/security gates | status`.

## 17.50 Alan keşfi: kapsamın zaman içinde genişlemesini otomatikleştirme

Sonsuz olabilecek niş listesini tek seferde tamamladığını iddia etmek yerine, Aurora içinde sürekli bir **Capability Discovery Pipeline** kurulmalı:

1. Kullanıcı istekleri, başarısız görevler ve sistemin “bu görevi güvenilir yapacak capability yok” dediği durumlar anonimleştirilmiş kategori kaydına dönüşür.
2. Görev ontolojisinde olmayan fiil/nesne/çıktı birleşimleri yeni aday alt alan olarak önerilir.
3. Web/GitHub/Papers with Code/Hugging Face/ModelScope/official tool registry gibi kaynaklardan adaylar araştırılır; repository, license, release, commit freshness, issue/security history kaydedilir.
4. Her aday doğrudan production'a bağlanmaz; önce code scanning, license policy, dependency audit, secret scan, SBOM, sandbox and network isolation yapılır.
5. Dokümantasyon, birim testleri, integration testleri, capability contract ve example task oluşturulur.
6. Önce challenge suite üzerinde karşılaştırılır; yalnızca baseline'ı anlamlı biçimde iyileştiriyorsa staged deployment'a alınır.
7. Geri alma (rollback) yolu oluşturulur; başarısız veya terk edilmiş aday kolayca çıkarılabilir.
8. Yeni nişin eklendiği tarih ve ölçümle birlikte coverage map güncellenir.
9. Aynı işi yapan araçlar birleştirilir; her nişe çok sayıda redundant dependency eklenmez.
10. Bir capability artık bakım görmüyorsa başka adayla değiştirilmesi ya da emekliye ayrılması için uyarı üretilir.

Bu süreç, “her olası alanı bugün tek tek yazmak”tan daha önemli: gelecekte ortaya çıkacak alanları fark eden ve güvenli biçimde entegre eden sistemi sağlar.

## 17.51 Geniş alan envanteri: hiçbir ana ailenin düşmemesi için çapraz kontrol

Aşağıdaki üst düzey gruplar, alan kataloğunun denetim kontrolüdür. Her biri altında yukarıdaki nişler ve gerektiğinde yeni alt alanlar bulunmalıdır:

1. Genel akıl yürütme, planlama ve karar verme.
2. Kodlama, yazılım mühendisliği, QA ve DevOps.
3. Web, arama, crawling, tarayıcı ve bilgisayar kullanımı.
4. Belgeler, PDF/OCR, ofis, e-posta ve takvim.
5. Bilgi yönetimi, arama, RAG ve kişisel bilgi sistemleri.
6. Veri mühendisliği, analitik, BI ve data governance.
7. Matematik, istatistik, optimizasyon ve formal yöntemler.
8. Bilimsel araştırma, yayın, kaynak ve tekrar üretilebilirlik.
9. Fizik, astronomi, jeoloji, coğrafya, iklim ve okyanus.
10. Biyoloji, kimya, genomik, protein, tıp araştırması ve sağlık bilişimi.
11. Klinik bilgi ve karar desteği; güvenlik ve profesyonel sınırlar.
12. Mühendislik, CAD/CAM/CAE, EDA, BIM ve üretim.
13. Enerji, çevre, utility, bina ve endüstri.
14. Robotik, gömülü sistem, IoT, drone ve fiziksel otomasyon.
15. Araçlar, ulaşım, havacılık, denizcilik ve lojistik.
16. Finans, muhasebe, vergi, bankacılık, sigorta ve risk.
17. Hukuk, mevzuat, patent, standart ve uyum.
18. İşletme, ERP, CRM, satış ve müşteri hizmeti.
19. Tedarik, satın alma, perakende, e-ticaret ve fiyatlama.
20. Pazarlama, reklam, marka, pazar araştırması ve sosyal medya.
21. İnsan kaynakları, yetenek, bordro, zaman ve personel planlama.
22. Proje, ürün, ekip, toplantı ve iş akışı yönetimi.
23. Eğitim, öğretim, sınav, koçluk ve meslekî gelişim.
24. Erişilebilirlik, yardımcı teknoloji ve insan-makine etkileşimi.
25. Görsel, fotoğraf, grafik, tasarım ve yaratıcı işler.
26. Video, ses, müzik, yayın ve konuşma.
27. 3D, animasyon, oyun, simülasyon, AR/VR/XR.
28. Dilbilim, çeviri, yerelleştirme ve çok dilli iletişim.
29. Tarih, arkeoloji, kültürel miras, müze, arşiv ve kütüphane.
30. Sosyal bilimler, ekonomi, kamu politikası ve survey research.
31. Spor, performans analizi, etkinlik ve rekreasyon.
32. Yemek, tarif, restoran, otel, turizm ve seyahat.
33. Ev, kişisel finans, kişisel üretkenlik ve akıllı ev.
34. Topluluk, forum, federasyon, işbirliği ve iletişim.
35. Kamu hizmetleri, civic tech, açık veri ve afet yönetimi.
36. Siber güvenlik, dijital adli bilişim, gizlilik ve kimlik.
37. SRE, ağ, sistem yönetimi, backup ve iş sürekliliği.
38. Donanım, OS, compiler, firmware, debug ve reverse engineering.
39. İçerik yayınlama, web/CMS, e-kitap, arşiv ve dijital koruma.
40. Model eğitimi, değerlendirmesi, inference, GPU/edge ve MLOps.
41. Bellek, kişiselleştirme, feedback learning ve güvenli self-improvement.
42. Bilinmeyen yetenek keşfi, plugin lifecycle ve entegrasyon otomasyonu.
43. Çoklu dil, çoklu ülke, yargı alanı ve sektör bağlamı.
44. Güvenlik, lisans, mahremiyet, maliyet, kullanıcı deneyimi ve ürün kalitesi — tüm yeteneklerin yatay gereksinimleri.

## 17.52 Bu belgenin kapsama sınırı ve “tamamlandı” ölçütü

Bu V2 sürümü, önceki 34 üst kategori listesini büyük ölçüde genişletir ve onlarca ilave alt alan ile yüzlerce aday araca yönlendirir. Buna rağmen **her evrensel nişi tek tek saydığını veya listedeki her adayın bugün en iyi seçenek olduğunu iddia etmez**. Bu iddia gerçekçi olmaz: alanlar değişir, projeler terk edilir, lisanslar/sürümler değişir ve yeni uzmanlıklar ortaya çıkar.

Kapsamı “tamamlandı” sayabilmek için her üst ailede:

- bilinen nişler kayıtlı olmalı;
- her nişin mevcut açık kaynak adayları araştırılmalı;
- varsa kapalı referanslar tanımlanmalı;
- ölçülebilir bir görev seti ve kabul koşulu olmalı;
- lisans/güvenlik/donanım kontrolü yapılmalı;
- eksik veya zayıf alan `not-covered` olarak görünür kalmalı;
- bilinmeyen ve yeni alanları ekleyen keşif pipeline'ı çalışmalı;
- hiçbir capability yalnızca entegrasyon yapılmış diye `verified` sayılmamalı.

**Bu planı nihai tek seferlik katalog değil, Aurora'nın kendi kendini kapsam açısından denetleyebileceği canlı capability kataloğunun başlangıç sürümü olarak kullan.**

## 17.53 Ek dikeyler: önceki listede yeterince ayrıntılandırılmayan uzmanlıklar

Bu ilave bölüm, geniş konu ailelerinin içinde kaybolan profesyonel alt alanları açıkça görünür kılmak için eklendi. Bu alanlar genel katalogdaki ilgili ailelere eklenir; bağımsız yetenek paketleri ve kendi kabul testleri olmalıdır.

### 17.53.1 Veterinerlik, hayvancılık ve hayvan refahı

- **Nişler:** veteriner klinik kayıtları; randevu ve klinik iş akışı; aşı/ilaç kayıtları; laboratuvar sonuçları; veteriner görüntüleme araştırması; bakım takvimi; hayvan barınağı ve sahiplendirme; sürü sağlığı; süt/verim ve üreme kayıtları; yem planı; çiftlik biyogüvenliği; hayvan kimliklendirme ve hareket kayıtları; hayvan refahı izleme; veteriner literatür arama; bulaşıcı hastalık gözetimi.
- **Açık kaynak adayları:** [OpenVPMS](https://github.com/openvpms/openvpms), [OpenVPM](https://github.com/evangauer/openvpm) *(erken aşama; üretim olgunluğu ayrıca kanıtlanmalı)*, [Yosemite Crew](https://github.com/YosemiteCrew/Yosemite-Crew) *(aktiflik, lisans ve tamlık kontrol edilmeli)*, [farmOS](https://github.com/farmOS/farmOS), [ERPNext](https://github.com/frappe/erpnext), [QGIS](https://github.com/qgis/QGIS), [Open Data Kit](https://github.com/getodk/collect), [OpenMRS](https://github.com/openmrs/openmrs-core) *(yalnızca tekrar kullanılabilir veri/iş akışı desenleri; insan sağlığı ürünü olarak tasarlanmıştır)*.
- **Kapalı referans:** ezyVet, IDEXX practice management/diagnostics, Covetrus, commercial herd-management and veterinary diagnostic systems.
- **Ölçüm:** kayıt doğruluğu; hayvan kimliği/ilaç doz alanı tutarlılığı; false alarm; klinik kullanıcının işini tamamlama oranı; saha bağlantı kesintisinde veri bütünlüğü.
- **Sınır:** veteriner tanı ve tedavi kararı profesyonel gözetimi gerektirir; model önerisi tıbbi kayıt olarak otomatik yazılmamalıdır.

### 17.53.2 Klinik araştırma, klinik çalışma ve farmakovijilans

- **Nişler:** protokol tasarımı desteği; çalışmaya katılım kriterleri; eCRF kurulum desteği; veri giriş kalite kontrolleri; trial master file; araştırma ziyaret takvimi; adverse event sınıflandırma desteği; literatür taraması; hasta bildirimi kodlama; CDISC veri biçimleri; çalışma sonlandırma ve audit-trail denetimi.
- **Açık kaynak adayları:** [OpenClinica](https://github.com/OpenClinica/OpenClinica), [REANA](https://github.com/reanahub/reana), [OpenMRS](https://github.com/openmrs/openmrs-core), [HAPI FHIR](https://github.com/hapifhir/hapi-fhir), [OHDSI](https://github.com/OHDSI), [Nextflow](https://github.com/nextflow-io/nextflow), [Snakemake](https://github.com/snakemake/snakemake), [Galaxy](https://github.com/galaxyproject/galaxy), [OpenTrials archive/code research](https://github.com/opentrials), [R](https://github.com/wch/r-source), [Bioconductor](https://github.com/Bioconductor).
- **Kapalı referans:** Medidata Rave, Veeva Vault Clinical, Oracle Clinical One, Florence eTMF, commercial pharmacovigilance platforms.
- **Ölçüm:** source-to-record traceability; missing/inconsistent field detection; locked data integrity; audit log correctness; role separation; CDISC validation; no unauthorized record mutation.
- **Sınır:** gerçek klinik çalışma, katılımcı verisi, e-imza ve regülasyon uyumluluğu ayrı doğrulanmalıdır. Deneysel depolar üretim veya regülasyon uygunluğu kanıtı sayılmaz.

### 17.53.3 İlaç, eczacılık, farmakoloji ve ilaç güvenliliği

- **Nişler:** ilaç monografı arama; etkileşim ve kontrendikasyon literatürü; ilaç güvenliliği sinyali; farmasötik kimya araştırması; doz bilgisi çıkarımı; ilaç katalog eşleme; ilaç etiket sürüm karşılaştırma; formulasyon/eksipiyan verisi; klinik araştırma sonuçları; ilaç tedarik/lot takibi; farmakovijilans vaka kodlama; ruhsat/etiket belgeleri.
- **Açık kaynak adayları:** [RDKit](https://github.com/rdkit/rdkit), [Open Babel](https://github.com/openbabel/openbabel), [DeepChem](https://github.com/deepchem/deepchem), [OpenMM](https://github.com/openmm/openmm), [Open Targets Platform](https://github.com/opentargets), [ChEMBL](https://github.com/chembl), [Biopython](https://github.com/biopython/biopython), [OpenFDA](https://github.com/FDA/open.fda.gov), [RxNorm API](https://github.com/nlm-pds/rxnorm-api), [openEHR tooling](https://github.com/ehrbase/ehrbase), [HAPI FHIR](https://github.com/hapifhir/hapi-fhir).
- **Kapalı referans:** DrugBank, Micromedex, Lexicomp, commercial pharmacovigilance and drug-discovery platforms.
- **Ölçüm:** source date; drug/ingredient identity match; unit/concentration; adverse event coding accuracy; known/unknown interaction handling; clinical reference agreement.
- **Sınır:** ilaç dozunu, etkileşimi veya tedavi kararını kaynak ve uzman doğrulaması olmadan üretime sokma. Model, klinik eczacıya/hekime doğrulanabilir bilgi hazırlayan araç olarak ele alınmalıdır.

### 17.53.4 Ormancılık, balıkçılık, su ürünleri ve toprak bilimi

- **Nişler:** tür ve habitat haritalama; orman envanteri; yangın riski; orman sağlığı; zararlı/hastalık görüntüleme; ağaç boyut/biokütle tahmini; balık stokları; su kalitesi; akuakültür yem ve sağlık takibi; balık göçü; deniz koruma alanı; toprak karbonu; erozyon; sulama; arazi kullanım değişimi; uydu/İHA analizi.
- **Açık kaynak adayları:** [QGIS](https://github.com/qgis/QGIS), [GDAL](https://github.com/OSGeo/gdal), [TorchGeo](https://github.com/torchgeo/torchgeo), [Orfeo ToolBox](https://github.com/orfeotoolbox/OTB), [PDAL](https://github.com/PDAL/PDAL), [OpenDroneMap](https://github.com/OpenDroneMap/ODM), [farmOS](https://github.com/farmOS/farmOS), [xarray](https://github.com/pydata/xarray), [Pangeo](https://github.com/pangeo-data/pangeo), [OpenForis](https://github.com/OpenForis), [Google Earth Engine community tooling](https://github.com/google/earthengine-community), [OBIS](https://github.com/iobis), [GBIF](https://github.com/gbif), [FishBase API/documentation](https://www.fishbase.se/), [OceanParcels](https://github.com/OceanParcels/Parcels).
- **Kapalı referans:** commercial forestry inventory, precision-ag, oceanographic prediction and satellite analytics.
- **Ölçüm:** species/crop precision-recall by region; map date/resolution; spatial bias; uncertainty; calibration against field samples; source and data-licence provenance.

### 17.53.5 Gıda bilimi, gıda güvenliği, beslenme ve üretim

- **Nişler:** food composition lookup; ingredient/allergen extraction; recipe normalization; nutritional estimates; food label review; traceability and batch/lot; HACCP checklist assistance; shelf-life modelling research; food manufacturing QA; recall and incident tracking; menu cost/availability; food-science literature; sensory research; fermentation process monitoring.
- **Açık kaynak adayları:** [Open Food Facts](https://github.com/openfoodfacts), [FoodOn ontology](https://github.com/FoodOntology/foodon), [Mealie](https://github.com/mealie-recipes/mealie), [Tandoor Recipes](https://github.com/TandoorRecipes/recipes), [Grocy](https://github.com/grocy/grocy), [ERPNext](https://github.com/frappe/erpnext), [QGIS](https://github.com/qgis/QGIS), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Great Expectations](https://github.com/great-expectations/great_expectations), [Open Food Facts taxonomy](https://github.com/openfoodfacts/openfoodfacts-server).
- **Kapalı referans:** commercial food composition systems, nutrition databases, food safety management and traceability platforms.
- **Ölçüm:** units and serving sizes; allergen recall; batch traceability; label version; dataset geography; source confidence; calculation reconciliation.
- **Sınır:** allergy-sensitive outputs are high risk; never infer “safe to eat” from absent ingredient text alone.

### 17.53.6 Gayrimenkul, şehir planlama, iç mekân ve mülk yönetimi

- **Nişler:** listing normalization; sale/rent comp extraction; property document QA; lease clauses; property maintenance; tenant request triage; facilities inventory; urban planning GIS; zoning-rule retrieval; 2D/3D space planning; occupancy and energy analysis; construction progress; quantity takeoff; investment scenario modelling; geographic accessibility.
- **Açık kaynak adayları:** [QGIS](https://github.com/qgis/QGIS), [PostGIS](https://github.com/postgis/postgis), [GeoServer](https://github.com/geoserver/geoserver), [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell), [FreeCAD](https://github.com/FreeCAD/FreeCAD), [Blender](https://github.com/blender/blender), [EnergyPlus](https://github.com/NREL/EnergyPlus), [OpenStudio](https://github.com/NREL/OpenStudio), [ERPNext](https://github.com/frappe/erpnext), [Odoo](https://github.com/odoo/odoo), [OpenMaint](https://github.com/openmaint/openmaint), [OpenProject](https://github.com/opf/openproject).
- **Kapalı referans:** CoStar, Reonomy, Zillow/Redfin data products, Autodesk Revit, Archicad, commercial property management tools.
- **Ölçüm:** address/parcel identity; zoning jurisdiction/date; price-data freshness; area units; comparable-property quality; IFC/geospatial consistency.
- **Sınır:** avoid guaranteeing price/returns or legal rights; regulatory/zoning and appraisal decisions require professional/local authority validation.

### 17.53.7 Moda, tekstil, kalıp, takı, el sanatları ve üretilebilir tasarım

- **Nişler:** sewing pattern design; grading across sizes; material/fabric inventory; textile repeat pattern; garment fit visualization; costume design; jewelry CAD; woodworking plans; laser/CNC craft files; packaging design; print-on-demand layouts; production BOM; repair/upcycling plans; color and material matching.
- **Açık kaynak adayları:** [Seamly2D](https://github.com/fashionfreedom/seamly2d), [Valentina](https://github.com/silisoftware/valentina), [FreeCAD](https://github.com/FreeCAD/FreeCAD), [Blender](https://github.com/blender/blender), [Inkscape](https://github.com/inkscape/inkscape), [GIMP](https://github.com/GNOME/gimp), [Krita](https://github.com/KDE/krita), [OpenSCAD](https://github.com/openscad/openscad), [KiCad](https://github.com/KiCad/kicad-source-mirror) *(yalnızca 2D/engineering toolchain patterns where appropriate)*, [PrusaSlicer](https://github.com/prusa3d/PrusaSlicer), [FreeCAD Path](https://github.com/FreeCAD/FreeCAD).
- **Kapalı referans:** CLO 3D, Browzwear, Adobe Illustrator, Optitex, commercial jewelry/CAD suites.
- **Ölçüm:** measurement-to-pattern tolerance; pattern grading consistency; cut material usage; export validity; scale/units; color-managed rendering; manufacturability review.

### 17.53.8 Gazetecilik, haber odası, araştırmacı gazetecilik ve medya doğrulama

- **Nişler:** interview transcription; source and claim verification; document leak triage; timeline reconstruction; public-record research; news archive search; data journalism; fact-checking; image/video provenance; geolocation; translation; newsroom assignment management; headline alternatives; corrections tracking; media bias audit; broadcast subtitling.
- **Açık kaynak adayları:** [Verify](https://github.com/guardian/verify), [InVID/WeVerify plugins](https://github.com/TrulyMedia), [ExifTool](https://github.com/exiftool/exiftool), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [Whisper](https://github.com/openai/whisper), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [DocumentCloud](https://github.com/documentcloud), [Aleph](https://github.com/alephdata/aleph), [Scrapy](https://github.com/scrapy/scrapy), [ArchiveBox](https://github.com/ArchiveBox/ArchiveBox), [MediaCMS](https://github.com/mediacms-io/mediacms), [Joomla](https://github.com/joomla/joomla-cms), [WordPress](https://github.com/WordPress/wordpress-develop).
- **Kapalı referans:** commercial media monitoring, newsroom systems, fact-checking services, digital investigation platforms.
- **Ölçüm:** claim support; image provenance; original-source trace; publication time vs event time; correction/uncertainty handling; source protection; no fabricated quote.
- **Aurora bağlantısı:** preserve original source, journalist notes and uncertainty. Do not expose confidential/source-identifying information to remote models without consent.

### 17.53.9 Felsefe, mantık, etik, din araştırmaları ve beşerî bilimler

- **Nişler:** philosophical literature search; argument maps; premise/conclusion extraction; fallacy detection; ethical framework comparison; formal logic; historical theology; comparative religion; primary text collation; translation comparison; moral dilemma analysis; debate preparation; conceptual genealogy; philosophy-of-science analysis; annotated bibliography.
- **Açık kaynak adayları:** [Lean](https://github.com/leanprover/lean4), [Isabelle](https://github.com/isabelle-prover/mirror-isabelle), [Coq](https://github.com/coq/coq), [Metamath](https://github.com/metamath), [Logseq](https://github.com/logseq/logseq), [Zotero](https://github.com/zotero/zotero), [GROBID](https://github.com/kermitt2/grobid), [JabRef](https://github.com/JabRef/jabref), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [Wikidata query engine](https://github.com/wikimedia/wikidata-query-rdf), [Tropy](https://github.com/tropy/tropy), [Recogito](https://github.com/recogito/recogito).
- **Kapalı referans:** academic databases, paid digital critical editions, commercial research assistants and humanities corpora.
- **Ölçüm:** argument reconstruction agreement; quotation/citation accuracy; distinguish interpretation from source; version/translation comparison; faithful representation of competing views.
- **Aurora bağlantısı:** do not present a contested interpretation as universally agreed. Attribute claims, represent intellectual traditions fairly and preserve context.

### 17.53.10 Etkinlik, konferans, organizasyon ve venue operasyonları

- **Nişler:** registration; ticketing; call-for-papers workflow; abstract review; schedule generation; session-room allocation; speaker management; event website; attendee communication; badge and check-in; travel/hospitality coordination; sponsorship inventory; accessibility; post-event feedback; replay/subtitle publication.
- **Açık kaynak adayları:** [Pretix](https://github.com/pretix/pretix), [Hi.Events](https://github.com/HiEventsDev/Hi.Events), [Open Event Server](https://github.com/fossasia/open-event-server), [Cal.com](https://github.com/calcom/cal.com), [Indico](https://github.com/indico/indico), [Pretalx](https://github.com/pretalx/pretalx), [Mobilizon](https://framagit.org/framasoft/mobilizon), [Jitsi Meet](https://github.com/jitsi/jitsi-meet), [BigBlueButton](https://github.com/bigbluebutton/bigbluebutton), [OpenProject](https://github.com/opf/openproject).
- **Kapalı referans:** Eventbrite, Cvent, Bizzabo, Splash, Hopin/RingCentral Events, commercial conference platforms.
- **Ölçüm:** no scheduling conflicts; capacity constraints; correct timezone; registration/payment state; access needs; no false “booking confirmed” status.

### 17.53.11 Bankacılık, kredi birlikleri, ödemeler ve açık bankacılık

- **Nişler:** account and ledger reconciliation; payments API integration; transaction categorization; bank statements; credit application document review; KYC/AML review support; payment anomaly triage; open-banking consent; statements and reporting; core-banking research; loan amortization; collections workflow; card/dispute case analysis.
- **Açık kaynak adayları:** [Apache Fineract](https://github.com/apache/fineract), [Mifos X](https://github.com/openMF/mifosx), [Mifos Mobile](https://github.com/openMF/mifos-mobile), [Kill Bill](https://github.com/killbill/killbill), [Hyperswitch](https://github.com/juspay/hyperswitch), [Lago](https://github.com/getlago/lago), [Formance](https://github.com/formancehq/ledger), [Moov](https://github.com/moov-io), [Open Banking UK Directory and standards](https://www.openbanking.org.uk/), [ERPNext](https://github.com/frappe/erpnext), [Ledger](https://github.com/ledger/ledger), [OpenSanctions](https://github.com/opensanctions/opensanctions).
- **Kapalı referans:** Temenos, Finastra, FIS, Fiserv, Stripe, Adyen, Plaid, commercial AML/fraud services.
- **Ölçüm:** balanced ledger; duplicate transaction rate; exact idempotency; fraud precision/recall; consent scope; regulatory compliance; auditability.
- **Sınır:** prototype repositories are not permission to run a bank. Production banking requires regulated infrastructure, audits and licensed operation; no autonomous money movement.

### 17.53.12 Kimlik, erişim, parola, secrets, zero-trust ve privacy engineering

- **Nişler:** SSO; OAuth/OIDC/SAML; identity lifecycle; role design; authorization review; privileged access management; secrets rotation; service identity; workload identity; consent management; data inventory; PII detection; data redaction; retention/deletion; encryption key lifecycle; certificate management; access reviews; privacy threat modeling.
- **Açık kaynak adayları:** [Keycloak](https://github.com/keycloak/keycloak), [Authentik](https://github.com/goauthentik/authentik), [ZITADEL](https://github.com/zitadel/zitadel), [Kanidm](https://github.com/kanidm/kanidm), [OpenBao](https://github.com/openbao/openbao), [Infisical](https://github.com/Infisical/infisical), [SOPS](https://github.com/getsops/sops), [age](https://github.com/FiloSottile/age), [step-ca](https://github.com/smallstep/certificates), [cert-manager](https://github.com/cert-manager/cert-manager), [Open Policy Agent](https://github.com/open-policy-agent/opa), [SpiceDB](https://github.com/authzed/spicedb), [OpenFGA](https://github.com/openfga/openfga), [Presidio](https://github.com/microsoft/presidio), [OpenSCAP](https://github.com/OpenSCAP/openscap), [Privacy Guides](https://github.com/privacyguides/privacyguides.org).
- **Kapalı referans:** Okta, Microsoft Entra, CyberArk, HashiCorp Vault Enterprise, OneTrust, commercial IAM/PAM systems.
- **Ölçüm:** unauthorized access blocked; privilege drift; secret exposure; revocation latency; cross-tenant leakage; deletion propagation; key/certificate lifecycle correctness.
- **Aurora bağlantısı:** identity/policy services must gate every tool call, not only login. Never give an LLM raw long-lived secrets; use short-lived delegated tokens and scoped credentials.

### 17.53.13 İş fikri, girişimcilik, strateji, danışmanlık ve profesyonel hizmetler

- **Nişler:** customer discovery; competitor landscape; business model canvas; financial scenario analysis; go-to-market plan; market-sizing assumptions; pitch deck drafts; due diligence; project portfolio; consultancy proposal; RFP response; KPI design; risk and assumptions register; strategy workshop notes; process mining; operating model; cost-benefit analysis; pricing and unit economics.
- **Açık kaynak adayları:** [Odoo](https://github.com/odoo/odoo), [ERPNext](https://github.com/frappe/erpnext), [Metabase](https://github.com/metabase/metabase), [Apache Superset](https://github.com/apache/superset), [OpenProject](https://github.com/opf/openproject), [Plane](https://github.com/makeplane/plane), [AFFiNE](https://github.com/toeverything/AFFiNE), [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy), [Penpot](https://github.com/penpot/penpot), [PptxGenJS](https://github.com/gitbrent/PptxGenJS), [Quarto](https://github.com/quarto-dev/quarto-cli), [LibreOffice](https://github.com/LibreOffice/core), [GrowthBook](https://github.com/growthbook/growthbook), [OpenRefine](https://github.com/OpenRefine/OpenRefine).
- **Kapalı referans:** Bain/BCG/McKinsey knowledge products, PitchBook, Gartner, Crunchbase Pro, enterprise planning/advisory SaaS.
- **Ölçüm:** assumption transparency; source-backed market claims; model sensitivity; unit-economics correctness; decision usefulness; scenario comparability; no made-up market-size figures.

### 17.53.14 Mesleki sağlık, iş güvenliği ve risk değerlendirmesi

- **Nişler:** safety-document extraction; task hazard analysis; checklist drafting; incident/near-miss classification; training-material generation; PPE inventory; safety audit evidence; chemical safety data sheet extraction; lockout/tagout records; ergonomics assessment support; risk matrix; maintenance permit workflow.
- **Açık kaynak adayları:** [OpenSCAP](https://github.com/OpenSCAP/openscap), [ERPNext](https://github.com/frappe/erpnext), [OpenProject](https://github.com/opf/openproject), [Docling](https://github.com/docling-project/docling), [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF), [OpenRefine](https://github.com/OpenRefine/OpenRefine), [QGIS](https://github.com/qgis/QGIS), [OpenRMF](https://github.com/open-rmf/rmf), [Sahana Eden](https://github.com/sahana/eden).
- **Kapalı referans:** EHS management suites, industrial safety platforms, commercial SDS and compliance systems.
- **Ölçüm:** hazard recall; control effectiveness evidence; latest standard/reference; false-negative cost; worksite-specific context; audit trail.
- **Sınır:** high-impact workplace safety decisions require competent-person review and local legal standards; model-generated checklists do not substitute for site inspection.

## 17.54 Model aileleri: açık kaynak yazılımı ile açık ağırlıklı AI modellerini ayrı katalogla

Uzman yazılımları tek başına yeterli değildir; birçok nişte algılama, sınıflandırma, üretim, sıralama ve dil modeli de gerekir. Her model ailesi, birden fazla uygulama kabiliyetiyle eşleştirilmelidir.

- **Genel dil/akıl yürütme:** açık ağırlıklı instruction/reasoning modelleri; çok dilli ve Türkçe modeller; küçük cihaz modelleri; uzun bağlam modelleri. Adaylar, güncel model kartları ve kullanım lisanslarıyla taranmalıdır; parametre sayısı veya benchmark sıralaması tek başına yeterli değildir.
- **Kodlama:** code-specialized LLM; repository-aware coding model; fill-in-middle; tool-call capable models; small local repair models. Ölçüt: repository task success, tests pass, patch size, regressions, cost per verified issue.
- **Embedding ve reranking:** multilingual dense embedding; sparse retrieval/BM25; cross-encoder reranker; late-interaction retriever; code embedding. Ölçüt: Recall@k, MRR/NDCG, language/field-specific performance and ACL filtering correctness.
- **Görsel anlama:** general VLM, OCR/document VLM, chart/table understanding, image segmentation, object detection, tracking, pose estimation, depth and optical flow. Ölçüt: task-specific accuracy, calibration and domain shift.
- **Görsel üretimi/düzenleme:** text-to-image; image-to-image; inpainting; control/pose/depth conditioning; upscaling; segmentation; text rendering; identity/consistency constraints. Ölçüt: prompt adherence, composition, legible text, editing stability, runtime/license.
- **Video:** text/image-to-video; video understanding; summarization; temporal action recognition; tracking; frame interpolation; denoising; dubbing/subtitles. Ölçüt: temporal consistency, subject preservation, flicker, duration/resolution, compute cost.
- **Ses:** ASR; speech translation; TTS; speaker diarization; VAD; speech separation; voice conversion; audio captioning; music generation; source separation. Ölçüt: WER, DER, intelligibility, latency, consent and voice rights.
- **3D/geometry:** text/image-to-3D; multiview reconstruction; mesh generation; texture generation; rigging and motion; neural rendering. Ölçüt: watertight/manifold geometry, topology, scale, texture seams, editable output and downstream tool compatibility.
- **Bilimsel/uzman modeller:** protein, molecule, weather, Earth observation, medical image, time-series forecasting, anomaly detection and physics-informed ML. Separate research models from clinically/industrially validated products.
- **Classifier/decision models:** entity matching, spam/fraud/risk, recommendation, anomaly, forecasting, ranking, OCR and document layout. Use calibrated models with explainable features and explicit data provenance.

**Model candidate sources:** [Hugging Face Model Hub](https://huggingface.co/models), [Hugging Face Transformers](https://github.com/huggingface/transformers), [Papers with Code](https://paperswithcode.com/), [OpenML](https://www.openml.org/), [ModelScope](https://modelscope.cn/), [GitHub](https://github.com/), official model cards and papers. Hub accessibility is not license clearance; each exact checkpoint must have artifact hash, license/terms, source lineage, safety review, required hardware and benchmark card.

## 17.55 Her alanın “hangi model + hangi araç + hangi veri + hangi doğrulayıcı” kombinasyonunu seçme kuralı

Her capability için aşağıdaki dört soru cevaplanmadan “tamamlandı” denmemelidir:

1. **Model:** hangi model/algoritma düşünme, çıkarım, algılama veya üretimi gerçekleştiriyor? Hangi görevler için test edildi?
2. **Araç/iş akışı:** hangi gerçek yazılım, API, fiziksel sistem simülatörü veya API adapter'i işi yürütüyor?
3. **Veri/kaynak:** hangi lisanslı ve güncel veri, belge, taksonomi, API veya kurumsal kaynak gerekiyor? Veri eksikse sistem nasıl davranıyor?
4. **Bağımsız doğrulama:** sonucu nasıl denetliyoruz? Unit test, domain verifier, human reviewer, schema check, scientific benchmark, image-diff, source citation or physical simulation?

Entegre bir capability, bu dört bileşenin dördü de kayıtlı ve ölçülmüşse `verified` olabilir. Gerçek kullanımdan gelen kalite, hata, güvenlik, geri alma ve operasyon kanıtı yoksa `production` sayılamaz.

## 17.56 13 Ekim 2026 itibarıyla ayrıca sınanacak model başlangıç listesi

Bu bölüm, genel alan kataloğunda “hangi modelle başlayalım?” boşluğu kalmaması için eklenmiştir. Listedeki hiçbir model her görevde en iyidir iddiasıyla verilmemiştir. Model sürümleri hızla değiştiğinden bu liste **aday havuzu**dur; Aurora'nın kendi benchmark'ı sonucu belirlemelidir. Resmî model kartı, ağırlık lisansı ve kullanılan quantization her indirmede yeniden kontrol edilmelidir.

### Genel amaçlı akıl yürütme / tool use / agentic görevler

- [Qwen3.8 resmi model ailesi](https://github.com/QwenLM/Qwen3.8) — boyuta göre farklı çalıştırma maliyetleri; örneğin 27B ve büyük MoE sürümleri ayrı benchmark edilmelidir.
- [DeepSeek-V4 model ailesi](https://huggingface.co/deepseek-ai) ve [model/serving kaynakları](https://github.com/deepseek-ai) — uzun bağlam, muhakeme ve kod görevlerini adaylaştır; her varyantın inference desteğini ve lisansını ayrı doğrula.
- [MiniMax-M3](https://github.com/MiniMax-AI/MiniMax-M3) — çok modlu ve uzun bağlam ajan görevleri için test adayı; resmi depo ve checkpoint koşullarını kontrol et.
- [Moonshot/Kimi model ailesi](https://huggingface.co/moonshotai) — uzun görev ve kodlama adayları; exact checkpoint license and inference support review required.
- [Gemma model ailesi](https://ai.google.dev/gemma) — yerel ve orta ölçekli deployment seçenekleri için; Gemma terms / acceptable use policies kontrol edilmelidir.
- [OpenAI gpt-oss ailesi](https://github.com/openai/gpt-oss) — yerel/açık ağırlıklı deployment aday havuzuna kat; exact checkpoint and implementation requirements verify.
- [Mistral modelleri](https://github.com/mistralai) — general, code, multilingual and small-model options; individual model cards and licenses differ.
- [GLM/Z.ai model ailesi](https://github.com/THUDM) — reasoning, code and agentic görevler için exact upstream model card bulunup doğrulanmalı.
- [Microsoft Phi ailesi](https://github.com/microsoft/phi-4) — düşük donanım/edge baseline'ları için; task-specific capability and license review.
- **Kapalı referans:** current Codex/ChatGPT, Claude/Claude Code, Gemini, Grok and relevant commercial model/API versions. Exact plan, toolset and test date must be recorded.

### Kodlama ve repository-level software engineering

- [Qwen3.8](https://github.com/QwenLM/Qwen3.8), [Qwen Coder ecosystem](https://github.com/QwenLM), [DeepSeek-Coder](https://github.com/deepseek-ai), [DeepSeek-V4](https://github.com/deepseek-ai), [Kimi/Moonshot model hub](https://huggingface.co/moonshotai), [MiniMax-M3](https://github.com/MiniMax-AI/MiniMax-M3), [gpt-oss](https://github.com/openai/gpt-oss), [CodeGemma / Gemma models](https://github.com/google-deepmind/gemma), [StarCoder2](https://github.com/bigcode-project/starcoder2), [CodeQwen](https://github.com/QwenLM), [WizardCoder](https://github.com/nlpxucan/WizardLM) as historical comparison if useful.
- **Tool harnesses to benchmark separately:** [OpenHands](https://github.com/OpenHands/OpenHands), [SWE-agent](https://github.com/SWE-agent/SWE-agent), [Aider](https://github.com/Aider-AI/aider), [OpenCode](https://github.com/anomalyco/opencode), [Cline](https://github.com/cline/cline), [Roo Code](https://github.com/RooCodeInc/Roo-Code), [Continue](https://github.com/continuedev/continue), [Goose](https://github.com/block/goose), [Plandex](https://github.com/plandex-ai/plandex), [Tabby](https://github.com/TabbyML/tabby).
- **Kapalı referans:** Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf and commercially hosted coding agents.
- **Kabul testi:** multi-file issue resolution; hidden tests; repo navigation; test execution; lint/type/build; no unrelated diff; correct tool use; recovery after one tool failure; total cost/time; user approval for destructive actions.

### Multimodal vision, image/video understanding and document intelligence

- [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL), [Qwen3.8 series](https://github.com/QwenLM/Qwen3.8), [InternVL](https://github.com/OpenGVLab/InternVL), [OpenGVLab model hub](https://github.com/OpenGVLab), [LLaVA](https://github.com/haotian-liu/LLaVA), [MiniCPM-V](https://github.com/OpenBMB/MiniCPM-o), [Molmo](https://github.com/allenai/molmo), [Florence-2](https://github.com/microsoft/Florence), [SAM 2](https://github.com/facebookresearch/sam2), [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO), [RT-DETR](https://github.com/lyuwenyu/RT-DETR), [YOLO family official project](https://github.com/ultralytics/ultralytics) (license implications review), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Surya](https://github.com/VikParuchuri/surya), [Docling](https://github.com/docling-project/docling).
- **Kapalı referans:** GPT/Gemini/Claude vision capabilities, commercial document AI, commercial video-understanding APIs.
- **Kabul testi:** chart/table/doc questions; screenshots; charts with misleading scales; tiny fonts; multi-page references; object localization; frame-level time references; OCR by Turkish/English/noisy scan.

### Embeddings, retrieval, multimodal search, reranking

- [Qwen3-Embedding and Qwen3-Reranker](https://github.com/QwenLM/Qwen3-Embedding) — multilingual retrieval/reranking candidate; exact variant, context limit and deployment cost benchmark.
- [Qwen3-VL-Embedding and Reranker](https://github.com/QwenLM/Qwen3-VL-Embedding) — text/image/screenshot/video retrieval experiments.
- [BAAI BGE family](https://github.com/FlagOpen/FlagEmbedding), [BGE-M3 documentation/code](https://github.com/FlagOpen/FlagEmbedding), [Sentence Transformers](https://github.com/UKPLab/sentence-transformers), [E5 models](https://github.com/microsoft/unilm), [Jina embeddings/models](https://github.com/jina-ai), [ColBERT](https://github.com/stanford-futuredata/ColBERT), [Splade](https://github.com/naver/splade), [FastEmbed](https://github.com/qdrant/fastembed), [RAGatouille](https://github.com/AnswerDotAI/RAGatouille).
- **Kapalı referans:** commercial vector/search APIs and built-in enterprise retrieval in major AI products.
- **Kabul testi:** Recall@5/10/50, nDCG/MRR, exact clause retrieval, Turkish suffix/diacritics, query rewriting, ACL leakage, stale/deleted document suppression, latency under load.

### Görsel üretim ve kontrollü görsel düzenleme

- [Qwen-Image official repo](https://github.com/QwenLM/Qwen-Image) — text rendering, image synthesis and editing; test current exact model/checkpoint.
- [FLUX.2 official inference](https://github.com/black-forest-labs/flux2) — model variants differ by terms; at time of research the 4B variant is listed as Apache 2.0 while some 9B/Dev variants have non-commercial or separate terms; do not treat one variant's license as applying to all.
- [Stable Diffusion/CompVis ecosystem](https://github.com/CompVis/stable-diffusion), [Diffusers](https://github.com/huggingface/diffusers), [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [InvokeAI](https://github.com/invoke-ai/InvokeAI), [Krita AI Diffusion](https://github.com/Acly/krita-ai-diffusion), [ControlNet](https://github.com/lllyasviel/ControlNet), [IP-Adapter](https://github.com/tencent-ailab/IP-Adapter), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), [LaMa](https://github.com/advimman/lama), [InSPyReNet](https://github.com/plemeri/InSPyReNet).
- **Kapalı referans:** Midjourney, DALL·E, Imagen, Adobe Firefly, commercial editing/generation platforms.
- **Kabul testi:** prompt adherence, text exactness, edit locality, subject consistency, hand/face details, typography/infographic correctness, speed, VRAM, commercial license compliance.

### Video üretimi

- [Lightricks LTX-2 / LTX-2.3](https://github.com/Lightricks/LTX-2) — synchronized audio-video, controls and workflows; check exact checkpoint license and version.
- [Wan2.2](https://github.com/Wan-Video/Wan2.2) — text/video-conditioned workflow candidates; exact model variant and license.
- [HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) — lightweight model candidate, but its community license has explicit territorial and acceptable-use terms; check whether Aurora's target use is permitted.
- [CogVideoX/CogKit](https://github.com/THUDM/CogKit) — 2B/5B checkpoints have different license conditions.
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [Diffusers](https://github.com/huggingface/diffusers), [FFmpeg](https://github.com/FFmpeg/FFmpeg), [RIFE](https://github.com/megvii-research/ECCV2022-RIFE), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN).
- **Kapalı referans:** Sora, Veo, Runway, Kling, Pika, Adobe Firefly video.
- **Kabul testi:** prompt/shot planning, temporal consistency, identity and costume persistence, camera motion, audio sync, frame rate, duration, editability, artifact severity and cost per accepted clip.

### 3D ve üç boyutlu dünya/asset üretimi

- [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2) — image-to-3D PBR/textured mesh candidate; official repo states MIT license while dependencies may use separate terms.
- [Tencent Hunyuan3D](https://github.com/Tencent-Hunyuan/Hunyuan3D-1) — model families/checkpoints and licenses must be examined individually.
- [TripoSR](https://github.com/VAST-AI-Research/TripoSR), [Stable Fast 3D](https://github.com/Stability-AI/stable-fast-3d), [InstantMesh](https://github.com/TencentARC/InstantMesh), [Open3D](https://github.com/isl-org/Open3D), [MeshLab](https://github.com/cnr-isti-vclab/meshlab), [Blender](https://github.com/blender/blender), [Meshroom](https://github.com/alicevision/meshroom), [COLMAP](https://github.com/colmap/colmap), [OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD), [glTF tools](https://github.com/KhronosGroup/glTF).
- **Kapalı referans:** Meshy, Tripo AI, Luma, Rodin/Hyper3D, commercial 3D creation suites.
- **Kabul testi:** closed/manifold geometry; polygon/texture budgets; dimensions and scale; topology; mesh editability; asset-license chain; export works in target game/CAD engine.

### Speech, ASR, TTS, alignment and audio

- [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) — current model family supports many languages/dialects according to the official README; independently measure Turkish accuracy and runtime.
- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) — speech generation and voice-design capabilities; consent/identity safeguards are required.
- [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [whisperX](https://github.com/m-bain/whisperX), [MMS](https://github.com/facebookresearch/fairseq), [Piper](https://github.com/rhasspy/piper), [Kokoro](https://github.com/hexgrad/kokoro), [MeloTTS](https://github.com/myshell-ai/MeloTTS), [pyannote.audio](https://github.com/pyannote/pyannote-audio), [Silero VAD](https://github.com/snakers4/silero-vad), [Montreal Forced Aligner](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner), [Demucs](https://github.com/facebookresearch/demucs), [Essentia](https://github.com/MTG/essentia).
- **Kapalı referans:** ElevenLabs, OpenAI Audio, Google/Azure speech, Deepgram, AssemblyAI, commercial music generation.
- **Kabul testi:** Turkish WER/CER, proper nouns, noisy-room robustness, streaming latency, speaker attribution, pronunciation, intelligibility, voice permission and model terms.

### Uzman bilim ve sağlık modelleri

- **Protein/biomolekül:** [OpenFold](https://github.com/biofold/openfold), [ESM](https://github.com/facebookresearch/esm), [ColabFold](https://github.com/sokrypton/ColabFold), [RFdiffusion](https://github.com/RosettaCommons/RFdiffusion), [ProteinMPNN](https://github.com/dauparas/ProteinMPNN).
- **Kimya/molekül:** [RDKit](https://github.com/rdkit/rdkit), [DeepChem](https://github.com/deepchem/deepchem), [Open Babel](https://github.com/openbabel/openbabel), [OpenMM](https://github.com/openmm/openmm), [GROMACS](https://github.com/gromacs/gromacs), [LAMMPS](https://github.com/lammps/lammps), [Psi4](https://github.com/psi4/psi4), [CP2K](https://github.com/cp2k/cp2k).
- **Tıp/görüntü:** [MONAI](https://github.com/Project-MONAI/MONAI), [3D Slicer](https://github.com/Slicer/Slicer), [OHIF](https://github.com/OHIF/Viewers), [nnU-Net](https://github.com/MIC-DKFZ/nnUNet), [TotalSegmentator](https://github.com/wasserth/TotalSegmentator), [MONAI Label](https://github.com/Project-MONAI/MONAILabel).
- **Hava/iklim:** [Pangu-Weather code/resources](https://github.com/198808xc/Pangu-Weather), [GraphCast](https://github.com/google-deepmind/graphcast), [Aurora weather model research](https://github.com/microsoft/aurora), [MetPy](https://github.com/Unidata/MetPy), [xarray](https://github.com/pydata/xarray). Each model's checkpoint terms, training data provenance and intended-use limits require specific review.
- **Kapalı referans:** commercial molecular design, medical AI, weather and scientific foundation models.
- **Kabul testi:** benchmark against ground-truth/experimental data; uncertainty/calibration; out-of-domain behaviour; reproducible environment; domain expert review. Research performance is not clinical/industrial authorization.

## 17.57 Kaynak ve güncellik notları

Adayların sürüm/performans iddiaları değiştiğinden her araştırma turunda resmî depo ve model kartı tercih edilmelidir. Bu sürümü güncellerken aşağıdaki güncel sayfalar doğrudan kontrol edildi; bunlar belirli model özellikleri ve lisans farklılıklarını doğrulamak için kaynak sağlar, tek başına “en iyi” sıralaması sağlamaz:

- [Qwen3.8 official repository and model list](https://github.com/QwenLM/Qwen3.8)
- [Qwen3-Embedding / reranker official repository](https://github.com/QwenLM/Qwen3-Embedding)
- [Qwen3-ASR official repository](https://github.com/QwenLM/Qwen3-ASR)
- [Qwen3-TTS official repository](https://github.com/QwenLM/Qwen3-TTS)
- [Qwen-Image official repository](https://github.com/QwenLM/Qwen-Image)
- [FLUX.2 official inference repository and variant licenses](https://github.com/black-forest-labs/flux2)
- [Wan2.2 official repository](https://github.com/Wan-Video/Wan2.2)
- [HunyuanVideo-1.5 official repository and community license](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5)
- [LTX-2 official repository](https://github.com/Lightricks/LTX-2)
- [Microsoft TRELLIS.2 official repository](https://github.com/microsoft/TRELLIS.2)
- [OpenClinica official repository](https://github.com/OpenClinica/OpenClinica)
- [Seamly2D fashion pattern software](https://github.com/fashionfreedom/seamly2d)
- [Hi.Events event management](https://github.com/HiEventsDev/Hi.Events)
- [A2A protocol specification](https://a2a-protocol.org/latest/) and [MCP specification/project](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [SWE-bench Verified](https://www.swebench.com/verified.html), [OSWorld](https://os-world.github.io/), and [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) as examples of task-specific evaluation resources.

When a secondary comparison blog reports a leaderboard or “best model” claim, do not copy it as truth. Record the claim as an observation, then test official checkpoints, exact license conditions and Aurora's representative tasks. Current model versions may have variants whose licenses, weights, inference requirements and commercial permission are different.
