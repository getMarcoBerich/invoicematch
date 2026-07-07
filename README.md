# Uparivanje računa

Web aplikacija za usporedbu izdanih računa s bankovnim uplatama iz Excel datoteka. Radi u pregledniku — podaci se spremaju lokalno (IndexedDB), bez servera.

## Značajke

- Uvoz Excel datoteka u KARTICA formatu (računi i bankovne uplate jedan pored drugog)
- Automatsko uparivanje prema iznosu, klijentu, broju računa u opisu uplate i blizini datuma
- Filtriranje po datumu, klijentu, iznosu, statusu uparivanja i pouzdanosti
- Ručno povezivanje neuparenih računa i uplata
- Promjena pogrešnih automatskih uparivanja s audit zapisom
- Izvoz rezultata u CSV
- Trajno spremanje sesija u pregledniku (IndexedDB)

## Zahtjevi

- Node.js 18+ (za razvoj i build)
- Moderni preglednik

## Lokalno pokretanje

```bash
npm install
npm run dev
```

Otvorite [http://localhost:3000](http://localhost:3000).

Produkcijski preview statičkog builda:

```bash
npm run build
npm run start
```

## GitHub Pages

1. Pushaj repozitorij na GitHub.
2. U **Settings → Pages → Build and deployment** odaberi **GitHub Actions** kao izvor.
3. Push na `main` pokreće workflow koji builda statičku stranicu i objavljuje je.

Aplikacija će biti dostupna na:

`https://<korisnik>.github.io/<repo>/`

Primjer: `https://marco.github.io/invoicematch/`

### Napomena o podacima

Podaci (sesije, uparivanja, ključevi platioca) spremaju se **u pregledniku** na uređaju koji koristiš. Nisu na GitHubu niti na serveru — svaki korisnik ima vlastitu lokalnu bazu.

## Korištenje

1. Učitaj `.xlsx` datoteku s KARTICA rasporedom:
   - **Stupci A–H:** Broj, Datum, Klijent, Osnovica, PDV, TOTAL (računi)
   - **Stupci K–N:** Datum, iznos, Klijent, opis plaćanja (bankovne uplate)
2. Pregledaj sažetak uvoza i otvori radni prostor.
3. Pokreni automatsko uparivanje, pregledavaj uparene i neuparene zapise.
4. Ručno poveži neuparene stavke ili promijeni pogrešna uparivanja.
5. Po završetku izvezi rezultate u CSV.

U korijenu projekta nalazi se primjer datoteke `za json.xlsx`.

## Skripte

| Naredba | Opis |
|---------|------|
| `npm run dev` | Pokretanje razvojnog servera |
| `npm run build` | Statički build u `out/` |
| `npm run start` | Lokalni preview builda |
| `npm run test` | Pokretanje unit testova |
| `npm run lint` | Pokretanje ESLint-a |

## Logika uparivanja

Automatsko uparivanje koristi ponderirani rezultat (prag: 75%):

| Signal | Težina |
|--------|--------|
| Točan iznos | 40 |
| Broj računa u opisu uplate | 35 |
| Sličnost imena klijenata | 20 |
| Blizina datuma | 5 |

Uparivanja se dodjeljuju pohlepno prema najvišoj pouzdanosti. Ručna uparivanja i promjene uvijek se spremaju s 100% pouzdanosti i audit zapisom.
