# Třídní sociometrie

Otevřená, čistě klientská webová aplikace pro **sociometricko-ratingové hodnocení školních tříd** (dimenze *Vliv* a *Sympatie* na škále 1–5). Navržená s důrazem na soukromí žáků (GDPR), rychlé přepisování z papírových archů a snadné nasazení na **GitHub Pages** i zcela offline použití.

> **Ochrana soukromí:** Veškeré výpočty, grafy i šifrování probíhají **100 % lokálně v prohlížeči**. Aplikace nemá žádný backend, žádné externí CDN ani analytiku – data žáků nikdy neopustí počítač psychologa.

> **Upozornění k metodice:** Jedná se o nezávislý open-source nástroj postavený na obecně známých vědeckých principech sociometricko-ratingové analýzy. Neobsahuje licencované testové normy ani texty komerční metody SORAD (*Hogrefe – Testcentrum*).

---

## Hlavní funkce

1. **Třída a žáci** – správa seznamu žáků (včetně hromadného vložení z Excelu/Wordu), volitelné rozlišení pohlaví (`○` / `□`), přepínač **Anonymní režim** (`Ž01`, `Ž02`…) pro bezpečnou prezentaci výsledků učitelům.
2. **Rychlé zadávání dat** – dva režimy:
   - *Přepis po archu žáka* (po stisku klávesy `1`–`5` kurzor automaticky skočí na další pole + volitelné slovní komentáře),
   - *Barevná matice každý s každým* s navigací šipkami + **CSV import/export** pro český Excel.
3. **Analýza klimatu a rizik** – individuální a třídní indexy vlivu a obliby, rozptyl (SD), koheze třídy, automatická detekce přátelských skupinek (**klik** pomocí algoritmu Bron–Kerbosch), izolovaných žáků bez vzájemných sympatií a rizikových signálů.
4. **Interaktivní grafy a sociogramy:**
   - **2D poziční graf (Vliv × Obliba)** se 4 kvadranty (přepínatelná hranice: pevný střed `3,00` nebo průměr třídy),
   - **Orbitální sociogram** (nejvlivnější v centru, okraj na vnějších kruzích) a **Silový sociogram** (shlukuje kliky, uzly lze přetahovat myší), filtrování sympatií/antipatií, kliknutí pro zvýraznění vazeb jednoho žáka, export do **SVG i PNG**.
5. **Bezpečné ukládání a tiskový PDF report** – ukládání do lokálního `.json` nebo **heslem šifrovaného `.socioenc` (AES-256-GCM + PBKDF2)**, vyčištění paměti prohlížeče jedním kliknutím a čistě formátovaný tiskový/PDF report.

---

## Jak aplikaci spustit

### 1. Okamžitě lokálně (bez instalace)
Stačí stáhnout repozitář a otevřít soubor `index.html` přímo v prohlížeči, případně spustit lehký lokální server:
```bash
python3 -m http.server 8080
```
a otevřít `http://localhost:8080`. *(Pro funkci šifrování `.socioenc` přes Web Crypto API je vyžadováno `https://` nebo `http://localhost`.)*

### 2. Nasazení zdarma na GitHub Pages
Projekt neobsahuje žádný build krok a má připravený workflow `.github/workflows/pages.yml`:
1. Vytvořte nový repozitář na GitHubu (např. `tridni-sociometrie`).
2. Nahrajte soubory do větve `main`:
   ```bash
   git remote add origin https://github.com/<vase-jmeno>/tridni-sociometrie.git
   git push -u origin main
   ```
3. V nastavení repozitáře přejděte na **Settings → Pages → Build and deployment → Source** a vyberte **GitHub Actions**.
4. Během minuty bude aplikace dostupná na `https://<vase-jmeno>.github.io/tridni-sociometrie/`.

---

## Testy (volitelné)
Výpočetní jádro má jednotkové testy bez závislostí (vyžaduje Node.js 18+):
```bash
node --test test/engine.test.js
```

## Struktura projektu
```text
├── index.html                 # Hlavní stránka aplikace
├── css/styles.css             # Responzivní a tiskové styly (@media print)
├── js/
│   ├── engine.js              # Výpočetní jádro (indexy, kvadranty, kliky, CSV)
│   ├── crypto.js              # Web Crypto API šifrování (AES-256-GCM)
│   ├── sampleData.js          # Ukázková syntetická třída 8.B (14 žáků)
│   ├── charts.js              # 2D poziční graf + SVG/PNG export
│   ├── sociogram.js           # Orbitální a silový SVG sociogram
│   └── app.js                 # Uživatelské rozhraní a správa stavu
├── test/engine.test.js        # Jednotkové testy výpočetního jádra
└── .github/workflows/pages.yml # Automatické nasazení na GitHub Pages
```
