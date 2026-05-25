# Orania op die kaart

Statiese webapp (Lys + interaktiewe kaart) vir besighede in Orania wat **Lightning**-betalings aanvaar, met Ora (Ф) bedrae, LUD-21 faktuur via Lightning-adres, en ’n afsonderlike **fooitjie**-vloei.

## Jou posisie op die kaart

Tik die **◎**-knoppie regs onder op die kaart. As jy toestemming gee, wys ’n blou punt **Jy is hier** (en ’n ligte sirkel vir GPS-akkuraatheid). Die kaart fokus een keer op jou posisie; tik weer om weer te sentreer. GPS vereis **https** (of `localhost`).

## Wat’s binne

- `index.html` – skaal
- `assets/styles.css` – lig / donker tema
- `assets/app.js` – kaart, lys, laai, pop-up-laaie, modals
- `assets/lud21.js` + `assets/qrcode.min.js` – wisselkoers, faktuur, QR
- `data/besighede.json` – alle besighede (maklik te wysig)
- `assets/logos/` – aflaaibare kentekens (lêername verwys in `logoLêer`)

## Plaaslike ontwikkeling

Kies 'n lêerbediener in die lêer `kaart/` (sodat `fetch('data/besighede.json')` kan werk), bv.:

```bash
cd kaart
python3 -m http.server 8080
```

Open dan `http://127.0.0.1:8080/`.

## GitHub Pages

1. Druk die inhoud van `kaart/` na 'n aparte repo, of stel `kaart` as die wortel lêer van jou Pages-tak (`main` / `gh-pages` / `docs`).
2. Sorg dat `index.html` in die wortel is (soos nou).
3. In repo-instellings: **Settings → Pages →** kies die bron lêer / tak.

> Die app roep 'n prysvoer (`price-feed.dev.fedibtc.com`) en elke LSP se `.well-known/lnurlp` aan. Dit werk net oor **https** op jou live domein (nie oor `file://` nie).

## Nuwe besigheid by `data/besighede.json`

Elke item kan bv. so lyk (veld `koördinate` gebruik `ö` in die sleutel na aan die plan-spesifikasie):

```json
{
  "id": "my-id",
  "naam": "My Winkel",
  "kategorie": "Winkel",
  "ikoon": "winkel",
  "kleur": "#3b82f6",
  "koördinate": { "lat": -29.819, "lng": 24.412 },
  "logoLêer": "my-logo.png",
  "beskrywing": "Kort beskrywing in Afrikaans.",
  "fisieseAdres": "Straat, Orania 8752",
  "foon": "000 000 0000",
  "epos": "kontak@voorbeeld.co.za",
  "webwerf": "https://voorbeeld.co.za",
  "webwerf2": "https://tweede-skakel.co.za",
  "bedryfsure": "Ma–Vr 08:00–17:00",
  "betaalLightningAdres": "winkel@domein",
  "fooitjieLightningAdres": "fooi@domein"
}
```

- **epos** (opsioneel): e-posadres; wys in die laai as `mailto:`-skakel; weglaat of `""` vir geen
- **ikoon** (keuse): `koffie` | `restaurant` | `winkel` | `kroeg` | `juwele` | `verblyf` | `dienste` | `argitektuur` | `organisasie` | `toep` | `gas` (anders: emoji in `ikoonEmoji` indien jy dit verkies)
- **logoLêer**: lêernaam in `assets/logos/` (bv. `logo.png`) of `null` om die ikoon te gebruik
- **webwerf** / **webwerf2**: opsionele skakels (tweedes bv. hotel by dieselfde plek)
- **Ora (Ф)**: 1 Ф = 1 ZAR (sats word uit BTC/ZAR bereken)
- **Lightning**: laat `betaalLightningAdres` en `fooitjieLightningAdres` leeg tot jy hulle invul; leë waardes grys die onderskeie knoppies uit

## Lêerlisensie

Projekkode: gebruik vry in jou eie Orania- / gemeenskapsprojek, tensy anders aangedui.
