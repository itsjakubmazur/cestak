# Cestovní příkaz – Generátor 🏸

Webová aplikace pro snadné vyplňování cestovních výkazů s automatickým generováním PDF.

## Funkce

### ✅ Implementováno (v1)
- **Dva typy formulářů**: Klubový cestovní příkaz (extraliga/turnaje) a Svazový ČBaS (dvoustranný)
- **Správa úseků cesty**: Přidávání, odebírání, libovolný počet úseků
- **Automatické vyhledávání km**: Přes Mapy.cz API (geocoding + odhad vzdálenosti) s fallback tabulkou českých měst
- **Přirážka na pojíždění**: Konfigurovatelné procento navíc k nalezeným km
- **Zaokrouhlování na 5 km**: Automaticky, žádná podezřelá čísla
- **Oblíbené trasy**: Uložení často jezdených tras, rychlé vložení
- **Historie výkazů**: Ukládání konceptů, duplikování starých výkazů
- **Profil**: Uložení osobních údajů jako výchozí
- **Generování PDF**: Export cestovního příkazu do PDF (jsPDF)
- **PWA**: Offline podpora přes Service Worker
- **Responzivní design**: Funguje na mobilu i desktopu
- **localStorage**: Vše uloženo lokálně v prohlížeči

### 🚧 K vylepšení v Claude Code
- [ ] Přesné PDF rozložení podle Excel předloh (pixel-perfect)
- [ ] Čeština v PDF (vlastní font s diakritikou)
- [ ] Routing API pro přesné km (Mapy.cz / Google Maps routing)
- [ ] Automatický výpočet stravného podle délky cesty
- [ ] Zahraniční stravné sazby
- [ ] Výpočet spotřeby (kWh pro Teslu / l benzín)
- [ ] Více vozidel s různými sazbami
- [ ] Export do CSV
- [ ] Tisk přímo z prohlížeče (print stylesheet)
- [ ] Přesný dvoustranný ČBaS formulář
- [ ] Podpis prstem na mobilu

## Technologie

- Vanilla HTML/CSS/JS (žádný framework)
- jsPDF pro generování PDF
- Mapy.cz Suggest API pro geocoding
- localStorage pro persistenci
- Service Worker pro offline režim

## Struktura

```
cestak/
├── index.html      # Hlavní stránka
├── style.css       # Styly (dark theme)
├── app.js          # Veškerá logika
├── sw.js           # Service Worker (PWA)
├── manifest.json   # PWA manifest
└── README.md       # Tento soubor
```

## Spuštění

Stačí otevřít `index.html` v prohlížeči nebo hostovat na GitHub Pages:

```bash
# Lokální server
python3 -m http.server 8000
# Otevřít http://localhost:8000
```

## Předlohy

Aplikace generuje PDF podle dvou Excel předloh:
1. **Klubový cestovní příkaz** – jeden list, cestovní příkaz + vyúčtování
2. **Svazový ČBaS cestovní příkaz** – dva listy (Cestovní příkaz + Vyúčtování pracovní cesty)

## Sazba za km

Výchozí sazba: **4,50 Kč/km** (vlastní auto, konfigurovatelné).
Formule v Excelu: `=km * sazba` (odpovídá `=H30*$Q$13` z předlohy).

## Licence

Soukromý projekt.
