# Aurora — 1064 repo aday envanteri: ölçüm sonuçları

**Tarih:** 2026-10-19 · **Kaynak:** `AURORA_TUM_ALANLAR_V2_KAPSAMLI_MASTER_PLANI` içindeki tüm benzersiz `github.com/org/repo` bağlantıları
**Yöntem:** shields.io rozetleri (GitHub API saatte 60 istekle sınırlı; 1064 repo × 4 metrik = 4256 istek = 71 saat kota olurdu)
**Ham veri:** `tarama/aurora-aday-envanteri.csv` (1064 satır) · `tarama/results.jsonl`

---

## Bu ölçüm neyi kanıtlar, neyi kanıtlamaz

**Kanıtlar:** proje canlı mı, lisansı ne, ana dili ne, ne kadar güncel, link hâlâ geçerli mi.

**Kanıtlamaz:** projenin **iyi** olup olmadığını. Kalite benchmark ister; plan bunu kendisi yasaklıyor (*"GitHub yıldızı, demo videosu veya README iddiasına göre 'en iyi' kararı verme"*). Yıldız sayısını bu yüzden **karar ölçütü olarak kullanmadım**, yalnızca bağlam olarak tuttum.

---

## 1. Canlılık — katalog beklenenden çok daha diri

| Son commit | Repo |
|---|---:|
| Bu hafta | **674** |
| Bu yıl | 258 |
| 2025 | 50 |
| 2024 | 26 |
| 2023 ve öncesi | 24 |
| **Link ölü** (`repo not found`) | **32** |

**Düzeltme:** ilk analizimde 514 repo "bilinmiyor" çıkmıştı. Bu **benim sınıflandırma hatamdı** — shields.io göreli tarih veriyor (`"last friday"`, `"october"`) ve yılı içinde bulunulan yılsa yazmıyor. Doğru okununca katalog **%63 oranında bu hafta commit almış** durumda. Durgun olan yalnızca **50 repo**.

**32 ölü link** `tarama/risk-*` dosyalarında değil, CSV'de `staleness=gone` olarak işaretli.

---

## 2. Lisans — asıl eleme burada olacak

| Sınıf | Repo | Anlamı |
|---|---:|---|
| **İzin verici** (Apache-2.0 305 · MIT 185 · BSD-3 55) | **545** | Aurora'ya bağlanabilir, yükümlülük attribution ile sınırlı |
| **Copyleft** | **220** | AGPL-3.0 **71** · GPL-3.0 63 · GPL-2.0 36 · MPL-2.0 18 · LGPL-3.0 13 · LGPL-2.1 11 |
| **Lisans belirsiz** | **247** | 220 "not identifiable by github" + 27 "not specified" |
| Ölü | 32 | — |

**En kritik bulgu: 71 repo AGPL-3.0.** AGPL en güçlü copyleft'tir — **ağ üzerinden kullanım bile** kaynak paylaşım yükümlülüğü doğurur. Yani bir AGPL aracı "ayrı servis olarak çalıştırıp API'sini çağırmak" bile yükümlülükten kurtarmaz. Bu, planın *"büyük Python/GPU uygulamalarını ayrı servis olarak çalıştır"* stratejisinin **AGPL için işe yaramadığı** anlamına gelir.

Örnekler: `AFLplusplus/AFLplusplus`, `AppFlowy-IO/AppFlowy`, `LibreTranslate/LibreTranslate`, `MISP/MISP`, `LexPredict/lexpredict-lexnlp`.

**247 lisans-belirsiz repo ayrı bir kategori.** "Lisansı yok" ile "GitHub tespit edemedi" aynı şey değil — ikincisi alt dizinlerde farklı lisans olabilir demek. Gate A bunu dosya bazında kontrol etmeyi gerektiriyor ve haklı.

---

## 3. Dil — mimariyi belirleyen asıl sayı

| Dil | Repo |
|---|---:|
| **Python** | **381** |
| C++ | 131 |
| **TypeScript** | **80** |
| Go | 77 |
| Java | 69 |
| C | 50 |
| PHP | 35 |
| Rust | 33 |
| **JavaScript** | **32** |

**TS + JS = 112. Python = 381. Oran 1 : 3.4.**

Aurora TypeScript/Node. Yani **katalogdaki adayların büyük çoğunluğu Aurora'nın process'i içinde çalışamaz.** Bu bir sorun değil — planın tam olarak öngördüğü şey: *"Büyük Python/GPU uygulamalarını ayrı servis veya işçi olarak çalıştır."*

Ama somut sonucu var: **her Python adayı bir subprocess/servis adaptörü + health check + timeout + egress politikası demek.** 381 aday için bu, 381 ayrı süreç yönetimi yüzeyi. İlk dalgada birkaç tane seçmenin gerçek sebebi bu.

---

## 4. Bu ölçümün eleme gücü

Objektif olarak **elenen**:

| Sebep | Sayı |
|---|---:|
| Link ölü | 32 |
| 2024 veya daha eski (bakımsız) | 50 |
| AGPL-3.0 (ağ kullanımı bile yükümlülük doğurur) | 71 |
| Lisans belirsiz (dosya bazında incelenmeden kullanılamaz) | 247 |

Bu dört küme örtüşüyor. **Birleşimi hesapladım, tahmin etmedim:**

| | Repo |
|---|---:|
| Elenen (dört kümenin birleşimi) | **382** |
| **Kalan** | **682** |
| Kalanların izin verici lisanslı olanları | **532** |

Kalan 532'nin dili: **python 245 · go 54 · typescript 46 · java 41 · c++ 40 · rust 25**

Yani ilk turda katalog üçte bir oranında küçülüyor ve geriye **532 somut aday** kalıyor.

**Eleme kararı verilmeyen:** hangisinin "en iyi" olduğu. O benchmark ister.

---

## 5. Dürüst sınırlar

1. **Kalite ölçülmedi.** Hiçbir aday çalıştırılmadı. Bu sandbox'ta 1 GB RAM / 2 çekirdek / GPU yok.
2. **Lisans tespiti GitHub'ın otomatik tespitine dayanıyor.** Alt dizin lisansları, model ağırlığı lisansları ve ticari kullanım şartları **dosya bazında** incelenmedi — Gate A'nın işi bu ve henüz yapılmadı.
3. **`stars` alanı kaba** (`"91k"`, `"1.4k"` gibi shields.io biçiminde) ve karar için kullanılmadı.
4. **42 repo için dil tespit edilemedi** (rozet `label="language"` döndü).
5. **CVE / güvenlik taraması yapılmadı.** Gate A bunu istiyor; burada çalışan bir tarayıcı kurulmadı.
