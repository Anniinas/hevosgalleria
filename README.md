# Hevosgalleriat

Kilpailukuvien galleriat ja kuvahaku: hae kuvia lajin, vuoden, rodun, värin, sukupuolen, askellajin tai hevosen nimen mukaan.

- **Kuvat** ovat Azure Blob Storagessa (`originals/` ja `thumbs/`), eivät tässä repossa.
- **Tiedot** (ryhmittely, askellajit, hevosten tiedot) ovat tässä repossa JSON-tiedostoina.
- **Sivusto** (`site/`) on staattinen ja julkaistaan Azure Static Web Appsiin GitHub Actionsilla: https://galleria.tallinurkka.eu

Kuvat: Tilli (VRL-00406), lisenssi [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.fi).

## Rakenne

```
data/
  galleries/<id>.json   yksi galleria: perustiedot ja hevosrivit kuvineen
  horses.json           kaikki hevoset: rotu, väri, sukupuoli, syntymävuosi, Heppa-tiedot
scripts/
  build-catalog.mjs     tarkistaa datan ja tekee site/data/catalog.json:n
  heppa.mjs             hakee hevosten tiedot Hippoksen Heppa-rekisteristä
  make_thumbs.py        tekee pikkukuvat (480 px)
  add-gallery.mjs       lisää uuden gallerian ryhmittelystä (assignments.tsv + horses.json)
  upload-images.mjs     lataa kuvat Blob Storageen (Azure CLI)
  orientation.mjs       merkitsee pystykuvat (ajetaan pikkukuvien teon yhteydessä)
  import-legacy.mjs     tuo vanhan galleriakansion data.js:n tähän muotoon
  dev-server.mjs        paikallinen testipalvelin
site/                   julkaistava sivusto (index, galleria, haku)
```

### Gallerian tiedosto

```json
{
  "id": "2014-05-25-lannenratsastus-hyvinkaa",
  "title": "Lännenratsastus, Hyvinkää",
  "date": "2014-05-25",
  "discipline": "Lännenratsastus",
  "place": "Hyvinkää",
  "cover": "DSC03491.jpg",
  "credit": "Tilli (VRL-00406)",
  "entries": [
    {
      "horse": "jr-sunstar",
      "number": "28",
      "colorDesc": "kuvista tehty värikuvaus",
      "notes": "tunnistusperusteet",
      "images": [
        ["DSC03261.jpg","r"],
        ["DSC03448.jpg","k","v"]
      ]
    }
  ]
}
```

Kolmas kenttä `"v"` tarkoittaa pystykuvaa (merkitään automaattisesti).

Askellajit: `t` tölt, `r` ravi, `k` käynti, `l` laukka, `h` hyppy, `p` passi, `-` lähikuva.

`horse` viittaa `horses.json`:n avaimeen. Nimetyn hevosen avain on nimestä tehty tunnus (`jr-sunstar`),
joten sama hevonen yhdistyy automaattisesti, vaikka se olisi monessa galleriassa.
Tunnistamattoman hevosen avain on `<gallerian-id>-<kirjain>`.

### Korjauksia

- **Kuva väärällä hevosella:** siirrä rivi `["DSC…","r"]` oikean hevosen `images`-listaan.
- **Väärä askellaji:** muuta kirjain.
- **Hevosen nimi selvisi:** lisää `horses.json`:iin uusi hevonen, vaihda gallerian `horse`-viittaus ja aja `npm run heppa -- --apply <avain>`.

Aja korjausten jälkeen `npm run check`, joka kertoo virheet (puuttuvat tai tuplakuvat, tuntemattomat koodit).

## Paikallinen käyttö

Tarvitaan Node 20+, Python + Pillow (`python -m pip install pillow`) ja Azure CLI (`az login`).

1. Kopioi `local-sources.example.json` → `local-sources.json` ja täytä kuvakansioiden polut (tiedosto ei mene repoon).
2. `npm run serve` → http://localhost:8080 (kuvat näytetään suoraan omalta koneelta).

## Uuden gallerian lisääminen

Kuvat sijoitetaan kansioon `<imagesRoot>/<vuosi>/<VVVV-KK-PP Laji, Paikka>/` ja galleria saa tunnuksen
`VVVV-KK-PP-laji-paikka` (pienet kirjaimet, ääkköset ä→a, ö→o, å→a).

1. Ryhmittele kuvat `horse-gallery`-taidolla, jolloin syntyvät `assignments.tsv` ja `horses.json`.
2. Lisää galleria:
   ```
   npm run add -- --id 2015-06-14-esteratsastus-ypaja --dir "2015/2015-06-14 Esteratsastus, Ypäjä" --title "Esteratsastus, Ypäjä" --discipline Esteratsastus --place Ypäjä --cover DSC01234.jpg --assignments assignments.tsv --horses horses.json
   ```
   Skripti tarkistaa, että jokainen kansion kuva on ryhmittelyssä täsmälleen kerran, ja lisää gallerian
   myös `local-sources.json`:iin. Jo rekisterissä oleva nimetty hevonen yhdistetään automaattisesti.
3. Täydennä ja tarkista:
   ```
   npm run heppa                 # näyttää löydökset
   npm run heppa -- --apply      # tallentaa varmat osumat
   npm run thumbs -- <id>        # pikkukuvat + pystykuvien merkintä
   npm run check
   npm run serve                 # esikatselu http://localhost:8080
   ```
4. Lataa kuvat ja julkaise:
   ```
   npm run upload -- <id>        # vaatii az login
   git add -A && git commit -m "Uusi galleria: …" && git push
   ```

## Azure-asetukset (kerran)

### Kuvat: Blob Storage

1. Tee tilille `tilliphotogallery` säiliö `images`, jonka julkinen käyttötaso on **Blob** (anonyymi lukuoikeus tiedostoihin).
2. `npm run upload -- --all` (tilin avain haetaan Azure CLI:llä, joten erillistä roolia ei tarvita).

Sivusto käyttää kuvaosoitetta, joka on määritelty tiedostossa `site/config.js`.

### Sivusto: Static Web Apps

1. Azure-portaalissa: **Create → Static Web App**, Free-taso, deployment source **Other**.
2. Kopioi luodun sovelluksen **Manage deployment token**.
3. GitHubissa: repo → Settings → Secrets and variables → Actions → uusi salaisuus `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. Pushaa `main`-haaraan, jolloin Actions kokoaa hakemiston ja julkaisee `site/`-kansion.
