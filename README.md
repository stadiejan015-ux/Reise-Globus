# Reise-Globus

Eine Website, die deine Weltreise auf einem drehbaren 3D-Globus zeigt. Auf **Play** fliegt ein Flugzeug Etappe für Etappe die Route ab, die Kamera folgt, und bereits gereiste Etappen bleiben als leuchtende Linie stehen.

- Globus per Finger drehen (ein Finger) und zoomen (zwei Finger)
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

**Rundreise:** Der letzte Stopp ist wieder Konstanz. Orte mit gleichem Namen an (fast) derselben Stelle bekommen nur **einen** Marker. Die Infokarte zeigt dann beide Besuche (Start und Rückkehr).

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

Flugzeug-Etappen werden als hoher Bogen über dem Globus gezeichnet, Auto und Boot fahren flach an der Oberfläche.

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
| Globus drehen / zoomen | ein Finger ziehen / zwei Finger auseinander. Während die Reise läuft, pausiert sie dabei automatisch; Play holt die Kamera zurück. |
| Zu einer Etappe springen | Etappe in der Leiste unten antippen (Leiste ist seitlich wischbar) |
| Infos zu einem Ort | Marker antippen; Schließen mit × oder Tippen auf den Globus |
| Tempo | Button `1×` → `2×` → `4×` |
| Von vorne | Button mit dem Kreispfeil |
| Tastatur (iPad mit Tastatur) | Leertaste = Play/Pause, ← / → = vorige/nächste Etappe, Esc = Karte schließen |

---

## 4. So ist der Code aufgebaut

```
index.html         Gerüst der Seite: Ebenen (Sterne, Globus, Fahrzeug, Leiste),
                   lädt globe.gl vom CDN und dann js/app.js
style.css          Aussehen (Farben stehen ganz oben als Variablen)
route.json         deine Reisedaten
assets/            Erd-Textur, Höhenrelief, App-Symbol
js/
  app.js           Startpunkt: lädt alles und verbindet die Teile
  route.js         liest und prüft route.json, berechnet die Etappen
  geo.js           Mathe auf der Kugel: Entfernung, Großkreis, Bogen
  transport.js     Verkehrsmittel: Namen, Farben, Symbole
  globe.js         alles Sichtbare auf dem Globus: Linien, Marker, Fahrzeug, Kamera
  player.js        der Ablauf der Animation (Play, Pause, Springen …)
  ui.js            Bedienleiste, Etappen-Chips, Infokarte, Hinweise
  stars.js         Sternenhimmel im Hintergrund
```

### Wie die Teile zusammenspielen

```
route.json ──► route.js ──► trip  (Stopps, Etappen, Orte)
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
      globe.js  ◄──────── player.js ◄──────────  ui.js
   (zeichnet nur)    (entscheidet, WAS WANN    (Buttons melden
                      passiert)                 „Play“, „Etappe 3“ …)
```

- **Daten getrennt vom Code:** `route.js` macht aus `route.json` ein Objekt `trip`. Jede Etappe bekommt dabei schon ihre fertige Bogen-Kurve (Liste von Punkten mit Breite, Länge, Höhe).
- **Zeichnen getrennt vom Ablauf:** `globe.js` weiß nicht, ob die Reise läuft. Es bietet nur Befehle wie „Kamera hierhin“, „Fahrzeug bei 40 % von Etappe 3“, „Etappe 2 zu 100 % gereist“.
- **Der Ablauf als Zustandsmaschine:** `player.js` kennt für jede Etappe die Phasen `ready → approach → flight → arrival` (bereit → Kamera fährt hin → Fahrzeug fliegt → kurze Pause am Ziel). Die Buttons in `ui.js` rufen nur `play()`, `pause()` oder `jumpTo(3)` auf.

### Was bei jedem Bild passiert (ca. 60-mal pro Sekunde)

1. three.js (in globe.gl enthalten) ist kurz davor, ein Bild zu zeichnen, und ruft `scene.onBeforeRender` auf.
2. `app.js` gibt die vergangene Zeit an `player.update(dt)` weiter.
3. Der Player schiebt die Zeit weiter, rechnet den Fortschritt der Etappe aus (mit sanftem Anfahren und Abbremsen) und sagt `globe.js`, wo Kamera und Fahrzeug jetzt sind.
4. `globe.js` aktualisiert Linie, Fahrzeug und Beschriftungen, dann zeichnet three.js das Bild.

### Drei Tricks, die du im Code findest

- **Großkreis-Bogen** (`geo.js`): Die kürzeste Verbindung auf einer Kugel ist ein Großkreis. Wir berechnen Punkte darauf mit „slerp“ und heben sie mit einer Sinuskurve an, so entsteht der Flugbogen.
- **Linie „freilegen“** (`globe.js`): Statt die leuchtende Linie bei jedem Bild neu zu bauen, ist sie als gestrichelte Linie mit genau *einem* Strich angelegt. Dessen Länge entspricht dem Fortschritt. Das ist auf iPhone und iPad sehr sparsam.
- **Beschriftungen weichen aus** (`globe.js`, `layoutLabels`): In Südostasien liegen viele Orte dicht beieinander. Jede Beschriftung probiert rechts, links, oben und unten; passt nichts, wird sie ausgeblendet, bis du näher heranzoomst. Wichtige Orte (aktuelle Etappe, angetippter Ort) kommen zuerst dran.

### Selbst anpassen

| Was | Wo |
|---|---|
| Farben der Seite | `style.css`, ganz oben (`:root`) |
| Farben und Symbole der Verkehrsmittel | `js/transport.js` |
| Neues Verkehrsmittel (z. B. Zug) | in `js/transport.js` einen Eintrag `zug: { … }` nach dem Muster der anderen anlegen, dann `"verkehrsmittel": "zug"` in `route.json` |
| Tempo der Animation | `js/player.js`, Block `TIMING` |
| Linienbreiten | `js/globe.js`, `LINE_WIDTH` |
| Erd-Bild | Datei in `assets/` austauschen und den Pfad in `js/globe.js` (`TEXTURES`) anpassen |

---

## Technik und Danke

- [globe.gl](https://github.com/vasturiano/globe.gl) (Version 2.46.2, über das CDN jsDelivr) – baut auf [three.js](https://threejs.org) auf.
- Erd-Textur „Blue Marble“ und Höhenrelief stammen von der NASA, in der Aufbereitung aus den Beispielen von [three-globe](https://github.com/vasturiano/three-globe) (MIT-Lizenz).
- Für flüssiges Laufen auf iPhone/iPad: keine 3D-Trefferabfragen, Linien werden nicht pro Bild neu gebaut, Sterne werden nur einmal gemalt, und die Pixeldichte ist auf 2 begrenzt.
