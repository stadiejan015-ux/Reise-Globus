# Reise-Globus

Eine Website, die deine Weltreise als Karten-Animation zeigt – von weit weg als 3D-Globus, beim Reinzoomen als gestochen scharfe Karte. Auf **Play** läuft jede Etappe wie in einem Reisevideo ab:

1. **Rauszoomen** vom Startort,
2. das Fahrzeug **fährt die Route ab**, die Kamera folgt und die Linie wächst mit,
3. am Ziel **reinzoomen** (leicht geneigt), Ortsname einblenden, kurz verweilen – dann weiter.

Bereits gereiste Etappen bleiben als leuchtende Linie stehen. **Ausflüge** von einem Ort aus (z. B. mit dem Auto nach Dubai und zurück) laufen als Unterpunkte mit – dabei bleibt die Kamera nah dran im Land.

- Karte per Finger verschieben (ein Finger), zoomen und drehen (zwei Finger)
- Zwei Kartenstile: **Karte** (Straßenkarte) und **Satellit** – Umschalter unten in der Leiste
- Marker antippen → kleine Karte mit Ort, Datum und Notiz
- Unten die Etappenleiste: antippen, um direkt zu einer Etappe zu springen
- Pro Etappe ein Verkehrsmittel (Flugzeug, Auto, Boot) mit eigenem Symbol und eigener Farbe
- Reine statische Website (HTML, CSS, JavaScript), kein Build-Schritt, läuft direkt auf GitHub Pages

Alle Reisedaten stehen in **`route.json`**. Um die Route zu ändern, musst du nur diese eine Datei bearbeiten.

---

## 1. Website online stellen (GitHub Pages)

Das geht komplett am iPad in Safari.

1. Öffne dein Repository auf github.com.
   *Tipp:* Wenn Menüpunkte fehlen, tippe in Safari auf **„aA“** (links in der Adressleiste) → **„Desktop-Website anfordern“**. Dann sieht GitHub aus wie am Computer.
2. Stelle sicher, dass der Code im Branch **`main`** liegt. (Falls er noch in einem anderen Branch liegt: Pull Request öffnen und mergen.)
3. Tippe oben auf **Settings** (Zahnrad).
4. Links im Menü auf **Pages**.
5. Unter **Build and deployment** → **Source**: **„Deploy from a branch“** wählen.
6. Unter **Branch**: **`main`** und Ordner **`/ (root)`** wählen → **Save**.
7. Ein bis zwei Minuten warten und die Pages-Seite neu laden. Oben steht dann:
   **„Your site is live at `https://DEIN-NAME.github.io/Reise-Globus/`“** – das ist deine Adresse.

Gut zu wissen:

- Mit einem kostenlosen GitHub-Konto muss das Repository **öffentlich (Public)** sein, damit Pages funktioniert.
- Ob das Veröffentlichen fertig ist, siehst du im Reiter **Actions** (grüner Haken = fertig).
- **Wie eine App:** Öffne die Seite in Safari → Teilen-Symbol → **„Zum Home-Bildschirm“**. Dann startet sie bildschirmfüllend mit eigenem Symbol.
- Direkt aus der Dateien-App geöffnet funktioniert die Seite **nicht** (der Browser blockiert dann das Laden von `route.json`). Nutze immer die GitHub-Pages-Adresse.
- Die Karte wird beim Zoomen stückweise („Kacheln“) aus dem Internet geladen. Ohne Internet geht es also nicht, und im Mobilfunknetz verbraucht ein kompletter Durchlauf einige Megabyte.

---

## 2. Etappen ändern (`route.json`)

### So bearbeitest du die Datei am iPad

1. Auf github.com im Repository die Datei **`route.json`** öffnen.
2. Auf den **Stift** (✏️ „Edit this file“) tippen.
3. Ändern.
4. Oben rechts **„Commit changes…“** → nochmal **„Commit changes“**.
5. Etwa 1 Minute warten, dann die Website neu laden.

### Aufbau

Die Datei enthält einen Titel und eine Liste von Stopps **in Reiserichtung**. Zwischen zwei aufeinanderfolgenden Stopps entsteht automatisch eine Etappe.

```json
{
  "titel": "Meine Weltreise",
  "stopps": [
    {
      "ort": "Konstanz",
      "land": "Deutschland",
      "lat": 47.6603,
      "lng": 9.1758,
      "verkehrsmittel": "",
      "datum": "",
      "notiz": ""
    },
    {
      "ort": "Abu Dhabi",
      "land": "Vereinigte Arabische Emirate",
      "lat": 24.4539,
      "lng": 54.3773,
      "verkehrsmittel": "flugzeug",
      "datum": "2026-03-01",
      "notiz": "Zwischenstopp, Moschee angeschaut"
    }
  ]
}
```

| Feld | Bedeutung | Beispiel |
|---|---|---|
| `ort` | Name des Ortes, steht am Marker | `"Bali"` |
| `land` | Land (optional), steht in der Infokarte | `"Indonesien"` |
| `lat` | Breitengrad: **Nord positiv, Süd negativ** | `-8.65` |
| `lng` | Längengrad: **Ost positiv, West negativ** | `115.2167` |
| `verkehrsmittel` | Womit du **zu diesem Ort** reist: `"flugzeug"`, `"auto"` oder `"boot"`. Beim ersten Stopp egal (leer lassen). | `"boot"` |
| `datum` | Ankunftsdatum. Am besten als `JJJJ-MM-TT`, dann wird daraus „14. März 2026“. Freier Text geht auch, z. B. `"Mitte März"`. | `"2026-03-14"` |
| `notiz` | Beliebiger Text. Einen Zeilenumbruch schreibst du als `\n`. | `"Roller gemietet.\nTraumhaft!"` |
| `zoom` | **Optional.** Wie nah die Kamera an diesen Ort heranzoomt. Standard ist `10` (Stadt mit Umland). Kleiner = weiter weg (z. B. `8` für eine ganze Insel), größer = näher dran (z. B. `12` für ein Stadtviertel). Feld einfach weglassen, wenn der Standard passt. | `8.5` |

| `unterpunkte` | **Optional.** Ausflüge von diesem Ort aus – siehe unten. | |

**Rundreise:** Der letzte Stopp ist wieder Konstanz. Orte mit gleichem Namen an (fast) derselben Stelle bekommen nur **einen** Marker. Die Infokarte zeigt dann beide Besuche (Start und Rückkehr).

### Ausflüge (Unterpunkte)

Von einem Ort aus einen Abstecher machen und wieder zurückkommen – z. B. von Phnom Penh mit dem Auto nach Sihanoukville, mit dem Boot nach Koh Rong und denselben Weg zurück:

```json
{
  "ort": "Phnom Penh",
  "land": "Kambodscha",
  "lat": 11.5564,
  "lng": 104.9282,
  "verkehrsmittel": "flugzeug",
  "datum": "2026-04-02",
  "notiz": "",
  "unterpunkte": [
    { "ort": "Sihanoukville", "lat": 10.6093, "lng": 103.5296, "verkehrsmittel": "auto", "notiz": "" },
    { "ort": "Koh Rong", "lat": 10.7167, "lng": 103.25, "verkehrsmittel": "boot", "notiz": "" }
  ]
}
```

So funktioniert es:

- Die Unterpunkte werden **der Reihe nach** angefahren, danach geht es **automatisch denselben Weg zurück** zum Hauptort (mit denselben Verkehrsmitteln). Den Rückweg schreibst du also nicht extra hin.
- `verkehrsmittel` bei einem Unterpunkt = womit du **dorthin** kommst. Lässt du es weg, gilt `"auto"`.
- **Datum nur beim Hauptort:** Das Datum von Phnom Penh gilt für den ganzen Aufenthalt im Land. Unterpunkte brauchen kein Datum.
- Bei Ausflügen bleibt die Kamera in der Region (z. B. ganz Kambodscha im Bild) statt bis zum Globus rauszuzoomen. An jedem Ausflugsziel wird kurz reingezoomt, auf dem Rückweg fährt das Fahrzeug ohne Halt durch.
- In der Leiste unten erscheint jeder Ausflug als eigener, eingerückter Eintrag „↳ Ausflug“ direkt nach der Etappe zum Hauptort. Antippen spielt den ganzen Ausflug ab.
- Auf dem Globus (weit rausgezoomt) sind Ausflugsziele ausgeblendet, damit sie nicht über dem Hauptort liegen. Beim Reinzoomen erscheinen sie als kleinere Punkte.
- Hat der Ort keine Ausflüge, das Feld `unterpunkte` einfach weglassen.

### Häufige Änderungen

**Datum und Notiz eintragen** – einfach zwischen die Anführungszeichen schreiben:

```json
"datum": "2026-03-14",
"notiz": "Reisterrassen in Ubud"
```

**Verkehrsmittel ändern** – z. B. mit der Fähre statt dem Flugzeug nach Phuket:

```json
"verkehrsmittel": "boot"
```

Flugzeug-Etappen werden als geschwungener Bogen gezeichnet (wie auf Flugkarten), Auto und Boot als gerade Linie.

**Näher ran oder weiter weg** – z. B. damit ganz Bali ins Bild passt, im Bali-Block eine Zeile ergänzen (Komma nicht vergessen):

```json
"notiz": "",
"zoom": 8.5
```

**Stopp hinzufügen** – einen kompletten Block `{ … }` kopieren, an der richtigen Stelle der Reihenfolge einfügen und anpassen. Wichtig: Zwischen zwei Blöcken steht ein Komma, nach dem letzten Block keins.

**Stopp entfernen** – den ganzen Block `{ … }` samt dem Komma davor oder danach löschen.

### Koordinaten herausfinden

- **Apple Karten:** Lange auf den Ort tippen → Stecknadel → nach oben wischen. Dort stehen die Koordinaten (z. B. `8,65° S, 115,22° O`). **Süd** und **West** werden negativ: `"lat": -8.65`, `"lng": 115.22`.
- **Google Maps:** Lange auf den Ort tippen. Oben erscheinen Zahlen wie `-8.6500, 115.2167` → erste Zahl ist `lat`, zweite `lng`.
- In JSON immer einen **Punkt** als Dezimaltrennzeichen verwenden, kein Komma: `47.66`, nicht `47,66`.

### Wenn etwas nicht stimmt

Die Website zeigt bei Fehlern in `route.json` eine Meldung mit Hinweis auf die Zeile. Die häufigsten Ursachen:

- **Fehlendes Komma** zwischen zwei Stopps (`}` gefolgt von `{`) oder am Ende einer Zeile.
- **Ein Komma zu viel** nach dem letzten Eintrag (vor `}` oder `]`).
- **Typografische Anführungszeichen** `„ “` statt `"`: Die iPad-Tastatur ersetzt sie gern automatisch. Die Website repariert das meistens selbst. Dauerhaft abschalten kannst du es unter *Einstellungen → Allgemein → Tastatur → Intelligente Interpunktion*.
- Unbekanntes Verkehrsmittel (z. B. `"zug"`): Die Seite zeigt einen Hinweis und nimmt das Flugzeug.

---

## 3. Bedienung

| Aktion | So geht's |
|---|---|
| Reise abspielen / pausieren | großer runder Button unten links |
| Karte bewegen / zoomen | ein Finger ziehen / zwei Finger auseinander. Während die Reise läuft, pausiert sie dabei automatisch; Play holt die Kamera zurück. |
| Kartenstil wechseln | Button mit den gestapelten Ebenen (Karte ↔ Satellit). Die Wahl wird gemerkt. |
| Zu einer Etappe springen | Etappe in der Leiste unten antippen (Leiste ist seitlich wischbar). Eingerückte Einträge „↳ Ausflug“ spielen einen ganzen Ausflug ab. |
| Infos zu einem Ort | Marker antippen; Schließen mit × oder Tippen auf die Karte |
| Tempo | Button `1×` → `2×` → `4×` |
| Von vorne | Button mit dem Kreispfeil |
| Tastatur (iPad mit Tastatur) | Leertaste = Play/Pause, ← / → = vorige/nächste Etappe, Esc = Karte schließen |

---

## 4. So ist der Code aufgebaut

```
index.html         Gerüst der Seite: Ebenen (Sterne, Karte, Leiste) – lädt js/app.js
style.css          Aussehen (Farben stehen ganz oben als Variablen)
route.json         deine Reisedaten
assets/            App-Symbol
js/
  app.js           Startpunkt: lädt MapLibre vom CDN, liest die Route, verbindet die Teile
  route.js         liest und prüft route.json, berechnet Etappen und Ausflüge
  geo.js           Mathe auf der Kugel: Entfernung, Großkreis, Bogen, Mercator
  transport.js     Verkehrsmittel: Namen, Farben, Symbole
  map.js           alles Sichtbare: Karte, Linien, Marker, Fahrzeug, Kamera-Hilfen
  player.js        der Ablauf der Animation (Play, Pause, Springen …)
  ui.js            Bedienleiste, Orts-Banner, Etappen-Chips, Infokarte, Hinweise
  stars.js         Sternenhimmel um den Globus
```

### Wie die Teile zusammenspielen

```
route.json ──► route.js ──► trip  (Stopps, Etappen, Orte)
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
        map.js  ◄──────── player.js ◄──────────  ui.js
   (zeichnet nur)    (entscheidet, WAS WANN    (Buttons melden
                      passiert)                 „Play“, „Etappe 3“ …)
```

- **Daten getrennt vom Code:** `route.js` macht aus `route.json` ein Objekt `trip`. Jede Etappe bekommt dabei schon ihre fertige Linie (Liste von Punkten `[Länge, Breite]`). Ausflüge werden dabei zu ganz normalen Etappen (hin und zurück) – sie bekommen nur zwei Extras: eine gemeinsame „Region“ für den Kartenausschnitt und auf dem Rückweg `toPause: false` (nicht anhalten). Für die Leiste fasst `route.js` die Etappen zu Abschnitten (`segments`) zusammen: eine Hauptetappe oder ein ganzer Ausflug.
- **Zeichnen getrennt vom Ablauf:** `map.js` weiß nicht, ob die Reise läuft. Es bietet nur Befehle wie „Kamera hierhin“, „Fahrzeug bei 40 % von Etappe 3“, „Nahansicht von Bali“.
- **Der Ablauf als Zustandsmaschine:** `player.js` kennt für jede Etappe die Phasen `hold → rise → travel → descend → linger` (am Start verweilen → rauszoomen → fahren → am Ziel reinzoomen → verweilen). Für jede Phase gibt es eine Formel, wo die Kamera bei 0 %, 50 % oder 100 % der Phase steht. Wird an einem Ort nicht angehalten (Rückweg eines Ausflugs), dauern `descend`, `linger` und `rise` einfach 0 ms. Die Buttons in `ui.js` rufen nur `play()`, `pause()` oder `jumpTo(3)` auf.

### Was bei jedem Bild passiert (ca. 60-mal pro Sekunde)

1. MapLibre ist kurz davor, ein Bild zu zeichnen, und ruft unsere Funktion `frame()` in `map.js` auf.
2. `app.js` gibt die vergangene Zeit an `player.update(dt)` weiter.
3. Der Player schiebt die Zeit weiter, rechnet aus, in welcher Phase welche Kamera dran ist, und sagt `map.js`, wo Kamera und Fahrzeug jetzt sind.
4. `map.js` färbt die wachsende Linie ein Stück weiter, ordnet die Beschriftungen, dann zeichnet MapLibre das Bild.

### Vier Tricks, die du im Code findest

- **Großkreis mit Schwung** (`geo.js`): Die kürzeste Verbindung auf einer Kugel ist ein Großkreis. Wir berechnen Punkte darauf mit „slerp“. Für Flüge schieben wir die Mitte der Strecke zusätzlich etwas zur Seite – so entsteht der typische Flugbogen.
- **Wachsende Linie ohne Neubau** (`map.js`): Die aktuelle Etappe hat einen Farbverlauf entlang der Linie (`line-gradient`): bis zum Fortschritt farbig, danach durchsichtig. Bei jedem Bild wird nur diese eine Zahl geändert – das ist auf iPhone und iPad sehr sparsam.
- **Kamera als Formel** (`player.js`, `cameraAt`): Rein- und Rauszoomen ist nichts anderes als „Zoomstufe von 10 nach 3 überblenden“, mit einer sanften Kurve (`easeInOutCubic`). Die Zoomstufe für eine Etappe berechnet `map.js` so, dass die ganze Strecke ins Bild passt.
- **Beschriftungen weichen aus** (`map.js`, `layoutLabels`): In Südostasien liegen viele Orte dicht beieinander. Jede Beschriftung probiert rechts, links, oben und unten; passt nichts, wird sie ausgeblendet, bis du näher heranzoomst. Wichtige Orte (aktuelle Etappe, angetippter Ort) kommen zuerst dran.

### Selbst anpassen

| Was | Wo |
|---|---|
| Farben der Seite | `style.css`, ganz oben (`:root`) |
| Farben und Symbole der Verkehrsmittel | `js/transport.js` |
| Neues Verkehrsmittel (z. B. Zug) | in `js/transport.js` einen Eintrag `zug: { … }` nach dem Muster der anderen anlegen, dann `"verkehrsmittel": "zug"` in `route.json` |
| Tempo, Pausen an den Orten | `js/player.js`, Block `TIMING` |
| Standard-Zoom und Neigung der Nahansicht | `js/map.js`, Block `CAMERA` |
| Linienbreiten | `js/map.js`, `LINE` |
| Kartenstile (z. B. einen anderen Stil von OpenFreeMap) | `js/map.js`, Block `MAP_STYLES` |

---

## Technik und Danke

- [MapLibre GL JS](https://maplibre.org) (Version 6.15.0, über das CDN jsDelivr) – zeichnet Karte und Globus.
- Kartenstil **Karte**: [OpenFreeMap](https://openfreemap.org) (kostenlos, ohne Anmeldung) mit Daten von © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkenden.
- Kartenstil **Satellit**: Satellitenbilder von Esri (World Imagery). Gedacht für private, nicht-kommerzielle Nutzung.
- Die Quellenangaben stehen auf der Seite hinter dem kleinen (i) oben rechts – bitte drin lassen, das verlangen die Kartenanbieter.
- Für flüssiges Laufen auf iPhone/iPad: Die Animation rechnet direkt vor jedem Bild der Karte, Linien werden nicht neu gebaut, Sterne werden nur einmal gemalt, und die Pixeldichte ist auf 2 begrenzt.
