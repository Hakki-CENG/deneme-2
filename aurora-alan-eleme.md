# Aurora — 57 alan ailesi: aday eleme sonucu

**Tarih:** 2026-10-19 · **Kaynak:** master planı bölüm 17 (1056 repo) + bölüm 6 katalogu
**Ölçüm:** `tarama/aurora-aday-envanteri.csv` (1064 repo, shields.io)

## Eleme kuralları

Bu turda uygulanan kurallar **objektif** olanlardır. Hiçbiri "en iyi" kararı vermez.

| Kural | Karar | Gerekçe |
|---|---|---|
| Link ölü (`repo not found`) | **ELER** | Var olmayan proje entegre edilemez |
| Son commit 2024 veya öncesi | **ELER** | Bakımsız; CVE düzeltmesi ve sürüm desteği beklenemez |
| AGPL-3.0 | **ELER** | Ağ üzerinden kullanım bile kaynak paylaşımı doğurur; ayrı servis çalıştırmak kurtarmaz |
| Lisans belirsiz | **İNCELE** | "Yok" değil, "tespit edilemedi" — Gate A dosya bazında bakmadan kullanılamaz |
| Geri kalan | **KALIR** | Objektif engel yok; kalite kararı benchmark'a bırakıldı |

## Genel sonuç

| Karar | Atama |
|---|---:|
| KALIR | 1036 |
| INCELE | 362 |
| ELER | 211 |

Toplam 1609 atama (bir repo birden çok alanda geçebiliyor), 1056 benzersiz repo.

## Alan alan sonuç

| Alan | Ad | Aday | KALIR | İNCELE | ELER |
|---|---|---:|---:|---:|---:|
| 17.1 | AI çekirdeği, modeller, ajanlar, bellek ve değerlendir | 94 | 81 | 12 | 1 |
| 17.2 | Web, tarayıcı, işletim sistemi ve yazılım geliştirme | 109 | 89 | 15 | 5 |
| 17.3 | Doküman, bilgi, dil, ofis, yayıncılık ve iletişim | 102 | 63 | 22 | 17 |
| 17.4 | Görsel, video, ses, 3D, tasarım ve oyun | 92 | 53 | 24 | 15 |
| 17.5 | Veri, istatistik, matematik, optimizasyon ve bilimsel  | 119 | 81 | 34 | 4 |
| 17.6 | Dünya bilimleri, iklim, çevre, biyoloji, kimya ve sağl | 108 | 69 | 30 | 9 |
| 17.7 | Hukuk, mevzuat, sözleşmeler, kamu politikası ve uyum | 14 | 8 | 2 | 4 |
| 17.8 | Finans, muhasebe, vergi, bankacılık, sigorta ve risk | 21 | 14 | 7 | 0 |
| 17.9 | İşletme yönetimi, ERP, CRM, satış, müşteri hizmetleri  | 20 | 7 | 9 | 4 |
| 17.10 | İnsan kaynakları, yetenek yönetimi, proje, ürün ve eki | 17 | 6 | 3 | 8 |
| 17.11 | Eğitim, öğretim, sınav, öğretmenlik ve bireysel öğrenm | 13 | 8 | 3 | 2 |
| 17.12 | Erişilebilirlik, yardımcı teknoloji ve kişisel üretken | 13 | 10 | 1 | 2 |
| 17.13 | Siber güvenlik, mavi takım, güvenli kod, gizlilik ve a | 29 | 17 | 10 | 2 |
| 17.14 | IT operasyonları, SRE, ağ yönetimi, observability ve s | 24 | 15 | 3 | 6 |
| 17.15 | Robotik, dronlar, ROS, gömülü sistemler, IoT ve fiziks | 22 | 17 | 5 | 0 |
| 17.16 | Mimari, inşaat, CAD/BIM, mekanik, elektrik, üretim ve  | 23 | 10 | 6 | 7 |
| 17.17 | Enerji, utilities, binalar, telecom ve endüstriyel sür | 22 | 7 | 10 | 5 |
| 17.18 | Ulaşım, otomotiv, havacılık, denizcilik ve lojistik | 17 | 15 | 2 | 0 |
| 17.19 | Perakende, tedarik zinciri, satın alma ve fiyat/ürün z | 16 | 12 | 3 | 1 |
| 17.20 | Pazarlama, satış, araştırma, reklam, marka ve içerik o | 20 | 9 | 6 | 5 |
| 17.21 | Tasarım, UX, grafik, fotoğraf, video, animasyon ve yar | 26 | 15 | 6 | 5 |
| 17.22 | Oyun geliştirme, etkileşimli hikâye, simülasyon ve san | 19 | 12 | 7 | 0 |
| 17.23 | Ses, müzik, yayın, podcast ve konuşma sistemleri | 22 | 15 | 2 | 5 |
| 17.24 | Sosyal ağlar, topluluklar, forumlar ve federasyon | 13 | 3 | 2 | 8 |
| 17.25 | Kişisel finans, ev yaşamı, akıllı ev ve kişisel otomas | 19 | 12 | 2 | 5 |
| 17.26 | Kamu hizmetleri, civic tech, açık veri ve acil durum b | 13 | 5 | 4 | 4 |
| 17.27 | Ekonomi, sosyal bilimler, psikoloji araştırması ve pol | 20 | 11 | 7 | 2 |
| 17.28 | Arkeoloji, tarih, kültürel miras, müze, sanat tarihi v | 14 | 7 | 4 | 3 |
| 17.29 | Spor, performans analizi, antrenman ve etkinlik operas | 12 | 8 | 1 | 3 |
| 17.30 | Yiyecek, tarif, restoran, konaklama ve turizm | 10 | 5 | 4 | 1 |
| 17.31 | Dil, çeviri, yerelleştirme ve özellikle Türkçe desteği | 17 | 11 | 3 | 3 |
| 17.32 | Bilgi güveni, kaynak doğrulama, fact-checking ve epist | 14 | 10 | 1 | 3 |
| 17.33 | Veri mühendisliği, analitik, BI, iş zekâsı ve data gov | 27 | 23 | 4 | 0 |
| 17.34 | Yazılım testleri, kalite güvencesi ve ürün doğrulama n | 24 | 21 | 1 | 2 |
| 17.35 | Dil modeli altyapısı, açık ağırlıklı modeller, eğitim  | 23 | 20 | 3 | 0 |
| 17.36 | Öğrenme, kişiselleştirme, tekrarlanabilir bellek ve gü | 18 | 17 | 1 | 0 |
| 17.37 | Donanım, işletim sistemleri, geliştirici araçları ve t | 18 | 10 | 8 | 0 |
| 17.38 | İletişim, çağrı merkezi, toplantılar ve kurumsal bilgi | 14 | 7 | 3 | 4 |
| 17.39 | Patent, standartlar, fikrî mülkiyet ve teknik bilgi ar | 9 | 4 | 3 | 2 |
| 17.40 | İK dışındaki insan uzmanlığı: koçluk, alışkanlık, bakı | 10 | 5 | 2 | 3 |
| 17.41 | İklim, afet, yangın, sel, acil durum ve dayanıklılık p | 12 | 6 | 4 | 2 |
| 17.42 | Endüstriyel bakım, madencilik, petrol/gaz ve saha oper | 13 | 5 | 5 | 3 |
| 17.43 | Tedarik, sözleşme yönetimi, satın alma, lojistik ve ve | 12 | 8 | 4 | 0 |
| 17.44 | İklim ve çevre dışındaki hukukî/operasyonel uyum: kali | 12 | 8 | 2 | 2 |
| 17.45 | Nadir/uzman alanlar için genişletilebilir katalog | 74 | 46 | 17 | 11 |
| 17.47 | Bileşen kataloğu: kapsam dışı kalmaması için her satır | 1 | 1 | 0 | 0 |
| 17.53 | Ek dikeyler: önceki listede yeterince ayrıntılandırılm | 124 | 70 | 31 | 23 |
| 17.54 | Model aileleri: açık kaynak yazılımı ile açık ağırlıkl | 1 | 1 | 0 | 0 |
| 17.56 | 13 Ekim 2026 itibarıyla ayrıca sınanacak model başlang | 108 | 70 | 19 | 19 |
| 17.57 | Kaynak ve güncellik notları | 15 | 9 | 5 | 1 |

## İlk dalga için ayrıntı

Planın ilk dalgası: eval, browser/OS, kod, doküman, model inference, web retrieval, telemetry, retrieval. Bunlar aşağıdaki alanlarda.

### 17.1 — AI çekirdeği, modeller, ajanlar, bellek ve değerlendirme

94 aday · **81 kalır** · 1 elenir · 12 lisansı belirsiz

Kalanların dili: python 52 · go 7 · java 6 · rust 5 · typescript 4 · c++ 2

**Elenenler:**
- `en/rest` — link olu

### 17.2 — Web, tarayıcı, işletim sistemi ve yazılım geliştirme

109 aday · **89 kalır** · 5 elenir · 15 lisansı belirsiz

Kalanların dili: go 26 · typescript 15 · python 14 · rust 12 · java 10 · c++ 4

**Elenenler:**
- `searxng/searxng` — AGPL
- `firecrawl/firecrawl` — AGPL
- `Skyvern-AI/skyvern` — AGPL
- `asweigart/pyautogui` — durgun (june 2023)
- `renovatebot/renovate` — AGPL

### 17.3 — Doküman, bilgi, dil, ofis, yayıncılık ve iletişim

102 aday · **63 kalır** · 17 elenir · 22 lisansı belirsiz

Kalanların dili: python 23 · java 8 · c++ 6 · typescript 6 · javascript 5 · php 4

**Elenenler:**
- `pymupdf/PyMuPDF` — AGPL
- `Princeton-CDH/eScriptorium` — link olu
- `ONLYOFFICE/DocumentServer` — AGPL
- `thunderbird/thunderbird` — link olu
- `nextcloud/server` — AGPL
- `logseq/logseq` — AGPL
- `TriliumNext/Trilium` — AGPL
- `FreshRSS/FreshRSS` — AGPL
- `LibreTranslate/LibreTranslate` — AGPL
- `browsermt/bergamot-translator` — durgun (may 2024)
- `facebookresearch/fastText` — durgun (march 2024)
- `ourresearch/openalex` — durgun (february 2023)
- `CrossRef/rest-api-doc` — durgun (september 2024)
- `scanny/python-pptx` — durgun (august 2024)
- …ve 3 tane daha

### 17.5 — Veri, istatistik, matematik, optimizasyon ve bilimsel hesaplama

119 aday · **81 kalır** · 4 elenir · 34 lisansı belirsiz

Kalanların dili: python 45 · c++ 13 · java 5 · typescript 4 · rust 3 · scala 2

**Elenenler:**
- `grafana/grafana` — AGPL
- `frictionlessdata/frictionless` — link olu
- `why3/why3` — link olu
- `lyst/lightfm` — durgun (april 2023)

### 17.33 — Veri mühendisliği, analitik, BI, iş zekâsı ve data governance

27 aday · **23 kalır** · 0 elenir · 4 lisansı belirsiz

Kalanların dili: python 10 · java 7 · scala 2 · typescript 2 · rust 1 · c++ 1

### 17.35 — Dil modeli altyapısı, açık ağırlıklı modeller, eğitim ve inference

23 aday · **20 kalır** · 0 elenir · 3 lisansı belirsiz

Kalanların dili: python 17 · c++ 2 · go 1

---

## Planın kendi ilk/ikinci dalga adayları ölçüme karşı

En değerli kontrol bu: plan "şunları önce dene" diyor, peki ölçüm ne diyor?

### İlk dalga (plan bölüm 7, 1–8)

| # | Aday | Lisans | Dil | Son commit | Durum |
|---|---|---|---|---|---|
| 1 | `UKGovernmentBEIS/inspect_ai` | MIT | python | today | ✅ |
| 2 | `microsoft/playwright` | Apache-2.0 | typescript | today | ✅ |
| 2 | `browser-use/browser-use` | MIT | python | last saturday | ✅ |
| 3 | `anomalyco/opencode` | MIT | typescript | today | ✅ |
| 3 | `All-Hands-AI/OpenHands` | MIT | typescript | today | ✅ |
| 3 | `Aider-AI/aider` | Apache-2.0 | python | **may** | ⚠️ **~5 ay durgun** |
| 4 | `docling-project/docling` | MIT | python | today | ✅ |
| 4 | `PaddlePaddle/PaddleOCR` | Apache-2.0 | python | september | ✅ |
| 4 | `tesseract-ocr/tesseract` | Apache-2.0 | c++ | today | ✅ |
| 5 | `ollama/ollama` | MIT | go | today | ✅ |
| 5 | `ggml-org/llama.cpp` | MIT | c++ | today | ✅ |
| 5 | `vllm-project/vllm` | Apache-2.0 | python | today | ✅ |
| 5 | `sgl-project/sglang` | Apache-2.0 | python | today | ✅ |
| 6 | `searxng/searxng` | **AGPL-3.0** | python | october | ❌ **BLOCKER** |
| 6 | `unclecode/crawl4ai` | Apache-2.0 | python | last thursday | ✅ |
| 7 | `open-telemetry/opentelemetry-collector` | Apache-2.0 | go | last friday | ✅ |
| 7 | `langfuse/langfuse` | **belirsiz** | typescript | today | ⚠️ dosya bazında incelenmeli |
| 8 | `qdrant/qdrant` | Apache-2.0 | rust | october | ✅ |
| 8 | `pgvector/pgvector` | **belirsiz** | c | october | ⚠️ dosya bazında incelenmeli |

### İkinci dalga (9–15)

| # | Aday | Lisans | Dil | Son commit | Durum |
|---|---|---|---|---|---|
| 10 | `openai/whisper` | MIT | python | august | ✅ |
| 10 | `SYSTRAN/faster-whisper` | MIT | python | last friday | ✅ |
| 11 | `coqui-ai/TTS` | **MPL-2.0** | python | **february 2024** | ❌ **durgun + copyleft** |
| 12 | `comfyanonymous/ComfyUI` | **GPL-3.0** | python | yesterday | ⚠️ copyleft |
| 13 | `LibreOffice/core` | **GPL-3.0** | c++ | september | ⚠️ copyleft (beklenen) |
| 14 | `duckdb/duckdb` | MIT | c++ | today | ✅ |
| 14 | `pola-rs/polars` | MIT | rust | today | ✅ |
| 15 | `temporalio/temporal` | MIT | go | yesterday | ✅ |

### Bundan çıkan dört somut sonuç

**1. SearXNG kullanılamaz (plan #6).** AGPL-3.0. Web retrieval için planın diğer
adayı `crawl4ai` Apache-2.0 ve canlı — **yerine o geçer.** Bu bir tercih değil,
lisans zorunluluğu: AGPL ağ üzerinden kullanımda bile kaynak paylaşımı doğurur
ve "ayrı servis olarak çalıştır" bunu çözmez.

**2. Aider ilk dalgadan düşmeli (plan #3).** Son commit Mayıs 2026, ~5 ay önce.
Plan "OpenCode veya OpenHands veya Aider'dan birini seç" diyor; ölçüm ikisini
canlı gösteriyor, Aider'ı göstermiyor. **OpenCode veya OpenHands** — ikisi de
MIT, TypeScript, bugün commit almış. TypeScript olmaları ayrıca önemli: Aurora
da TypeScript, yani entegrasyon maliyeti Python bir ajandan düşük.

**3. Coqui TTS ölü (plan #11).** MPL-2.0 ve son commit Şubat 2024. Yerel TTS için
**yeni bir aday aranmalı** — planın seçtiği proje bakımsız.

**4. ComfyUI ve LibreOffice GPL-3.0.** İkisi de copyleft. ComfyUI ayrı worker
olarak çalıştırılabilir ama GPL yükümlülüğü dağıtım anında doğar; LibreOffice
için bu zaten bilinen ve kabul edilen bir durum. **Karar: bunlar ancak ürün
dağıtım modeli netleştikten sonra eklenebilir.**

### Dürüst notlar

- `langfuse` ve `pgvector` için "lisans belirsiz" = **GitHub otomatik tespit
  edemedi**, "lisansı yok" değil. pgvector'ın gerçekte PostgreSQL lisansıyla
  geldiği bilinir ama bunu **burada doğrulamadım**; Gate A'nın dosya bazında
  kontrolü gerekiyor.
- `comfyanonymous/ComfyUI` planın link listesinde **yok**, yalnızca adıyla
  geçiyor. Ölçümü ben ayrıca yaptım.
- Plan `inspect_ai`'yi `UKGovernmentBEIS` altında veriyor; ilk denememde
  `inspect-ai/inspect_ai` diye aradım ve "ölçülemedi" çıktı. **Repo yok değildi,
  benim yolum yanlıştı.**
