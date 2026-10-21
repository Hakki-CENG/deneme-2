import io

p = "aurora-vnext-faz-takibi.md"
s = io.open(p, encoding="utf-8").read()

old_row = "| **FAZ 6** | **Coding Expert** — 1/4 tanım + dış-karar kuralı ✅ · 2/4 kural doğrulama yolunda ✅ · **3/4 eksik yetenekler (profiler/debugger/review/CI) ← SIRADAKİ** | 🟡 | `69eb44d` `0caf5c2` |"
assert s.count(old_row) == 1, "row anchor"
new_row = (
    "| FAZ 6 | Coding Expert — 1/4 tanım + dış-karar kuralı · 2/4 kural doğrulama yolunda · "
    "3/4 built-in'ler erişilebilir + boşluklar adlandırıldı | ✅ | `69eb44d` `0caf5c2` `baab1cb` |\n"
    "| **FAZ 7** | Coding Expert Arena — **sandbox'ta win/draw/loss üretilemez** (GPU yok, rakip ajan yok); "
    "mekanizma kurulabilir, sayı uydurulmayacak ← **SIRADAKİ** | — | — |"
)
s = s.replace(old_row, new_row, 1)

old_h = "### FAZ 6 — Coding Expert 🟡 (2/4 kapandı)"
assert s.count(old_h) == 1, "header anchor"
s = s.replace(old_h, "### FAZ 6 — Coding Expert ✅ (3/4 kapandı, kalan boşluklar adlandırıldı)", 1)

old_open = """**FAZ 6 için açık kalan:** hiçbir şey gerçek bir dağıtım için `codingExpert()`
kurmuyor, yani kural canlı ama yalnızca expert'ı kaydeden bir çağıran üzerinden
erişilebilir; ve 1/4'te ölçülen eksik yetenekler (profiler, debugger, code
review, `git.ci.status` ötesi CI/PR) **hâlâ eksik**."""
assert s.count(old_open) == 1, "open anchor"

new_open = """**3/4 (`baab1cb`)** — 1/4 tanımı yazdı, 2/4 kuralı bağladı, ama **hiçbir şey
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
ile PR-oluşturma capability'leri **bildirim değil, boşluk** olarak kalıyor."""

s = s.replace(old_open, new_open, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("tracker updated")
