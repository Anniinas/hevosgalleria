# Hevosgalleriat

Kilpailukuvien galleriat ja kuvahaku: hae kuvia lajin, vuoden, rodun, värin, sukupuolen, askellajin tai hevosen nimen mukaan.

- **Kuvat** ovat Azure Blob Storagessa (`originals/` ja `thumbs/`), eivät tässä repossa.
- **Tiedot** (ryhmittely, askellajit, hevosten tiedot) ovat tässä repossa JSON-tiedostoina.
- **Sivusto** (`site/`) on staattinen ja julkaistaan Azure Static Web Appsiin GitHub Actionsilla.

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
  upload-images.mjs     lataa kuvat Blob Storageen (AzCopy)
  import-legacy.mjs     tuo galleriakansion data.js:n tähän muotoon
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
        ["DSC03263.jpg","k"]
      ]
    }
  ]
}
```

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

Tarvitaan Node 20+, Python + Pillow (`python -m pip install pillow`) ja AzCopy (`winget install Microsoft.Azure.AZCopy.10`).

1. Kopioi `local-sources.example.json` → `local-sources.json` ja täytä kuvakansioiden polut (tiedosto ei mene repoon).
2. `npm run serve` → http://localhost:8080 (kuvat näytetään suoraan omalta koneelta).

## Uuden gallerian lisääminen

1. Ryhmittele kuvat `horse-gallery`-taidolla, jolloin kuvakansioon syntyy `data.js`.
2. Lisää galleria `local-sources.json`:iin:
   ```json
   "2015-06-14-esteratsastus-ypaja": {
     "dir": "2015/2015-06-14 Esteratsastus, Ypäjä",
     "title": "Esteratsastus, Ypäjä", "discipline": "Esteratsastus", "place": "Ypäjä", "cover": "DSC01234.jpg"
   }
   ```
3. Aja:
   ```
   node scripts/import-legacy.mjs 2015-06-14-esteratsastus-ypaja
   npm run heppa                       # näyttää löydökset
   npm run heppa -- --apply            # tallentaa varmat osumat
   npm run thumbs -- 2015-06-14-esteratsastus-ypaja
   npm run check
   npm run upload -- --account tilliphotogallery 2015-06-14-esteratsastus-ypaja
   ```
4. Commitoi ja pushaa, jolloin sivusto päivittyy automaattisesti.

## Azure-asetukset (kerran)

### Kuvat: Blob Storage

1. Tee tilille `tilliphotogallery` säiliö `images`, jonka julkinen käyttötaso on **Blob** (anonyymi lukuoikeus tiedostoihin).
2. Anna itsellesi tilin **Access Control (IAM)** -näkymässä rooli **Storage Blob Data Contributor**, jotta
   `azcopy login` + lataus toimii. Vaihtoehtoisesti tee säiliölle SAS-tunnus kirjoitusoikeudella ja anna se
   `--sas`-parametrina (älä tallenna sitä repoon).
3. `npm run upload -- --account tilliphotogallery`

Sivusto käyttää kuvaosoitetta, joka on määritelty tiedostossa `site/config.js`.

### Sivusto: Static Web Apps

1. Azure-portaalissa: **Create → Static Web App**, Free-taso, deployment source **Other**.
2. Kopioi luodun sovelluksen **Manage deployment token**.
3. GitHubissa: repo → Settings → Secrets and variables → Actions → uusi salaisuus `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. Pushaa `main`-haaraan, jolloin Actions kokoaa hakemiston ja julkaisee `site/`-kansion.
