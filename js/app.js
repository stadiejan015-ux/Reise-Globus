// =====================================================================
// app.js – der Startpunkt: lädt alles und verbindet die Teile
// ---------------------------------------------------------------------
//   route.js   → liest route.json und berechnet die Etappen
//   map.js     → zeichnet Karte, Linien, Marker und Fahrzeug
//   player.js  → steuert die Animation (Play, Pause, Springen …)
//   ui.js      → Buttons, Etappenleiste, Infokarte
//   stars.js   → Sternenhimmel um den Globus
// =====================================================================

import { loadTrip, RouteError } from './route.js';
import { createMapView, MAP_STYLES } from './map.js';
import { createPlayer } from './player.js';
import { createUI } from './ui.js';
import { drawStars } from './stars.js';

// Kartenbibliothek MapLibre GL (feste Version). Falls das erste CDN einmal
// nicht erreichbar ist, nehmen wir das zweite.
const MAPLIBRE_URLS = [
  'https://cdn.jsdelivr.net/npm/maplibre-gl@6.15.0/dist/maplibre-gl.mjs',
  'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs',
];

const STYLE_STORAGE_KEY = 'reise-globus-kartenstil';

start().catch(showError);

async function start() {
  const starsCanvas = document.getElementById('stars');
  drawStars(starsCanvas);

  const trip = await loadTrip('route.json');
  const maplibregl = await loadMapLibre();

  let player = null;
  let selectedPlace = null;

  // --- Oberfläche ---------------------------------------------------
  const ui = createUI(trip, {
    onPlay: () => player.toggle(),
    onRestart: () => player.reset(),
    onSpeed: () => player.cycleSpeed(),
    onStyle: () => switchStyle(),
    onLeg: (index) => player.jumpTo(index),
    onCloseCard: () => selectPlace(null),
  });

  // --- Karte --------------------------------------------------------
  const view = createMapView(maplibregl, document.getElementById('map'), trip, {
    initialStyle: readSavedStyle(),
    onReady: () => {
      document.getElementById('loading').classList.add('is-done');
      showFirstVisitTip(ui);
    },
    // Bei jedem Bild, solange die Reise läuft. Rückgabe: weiterlaufen?
    onFrame: (dt) => {
      const keepGoing = player.update(dt);
      ui.setProgress(player.progress());
      return keepGoing;
    },
    onMarkerTap: (place) => selectPlace(place === selectedPlace ? null : place),
    onMapTap: () => selectPlace(null),
    // Wer selbst die Karte verschiebt oder zoomt, übernimmt die Kamera → Pause.
    onUserCamera: () => player && player.pause(),
    onStyleProblem: (failed, next) => ui.toast(`Der Kartenstil „${failed}“ lädt gerade nicht – ich zeige „${next}“.`),
  });
  ui.setStyleName(MAP_STYLES[view.getStyle()].name);

  // --- Animation ----------------------------------------------------
  player = createPlayer(trip, view, refresh);

  function selectPlace(place) {
    selectedPlace = place;
    if (place) ui.openCard(place);
    else ui.closeCard();
    refresh();
  }

  function switchStyle() {
    const next = view.getStyle() === 'karte' ? 'satellit' : 'karte';
    view.setStyle(next);
    ui.setStyleName(MAP_STYLES[next].name);
    ui.toast(`Kartenstil: ${MAP_STYLES[next].name}`, 1800);
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, next);
    } catch {
      // Speichern nicht möglich (privater Modus) – dann eben nicht merken.
    }
  }

  // Wird bei jeder Zustandsänderung aufgerufen: Oberfläche + Marker anpassen.
  function refresh() {
    const info = player.info();
    ui.render(info);
    ui.setProgress(info.progress);
    if (info.running) view.startLoop(); // Bild-für-Bild-Schleife anwerfen

    const { leg, shownPhase } = info;
    const traveling = ['rise', 'travel'].includes(shownPhase);
    let activePlaces = [leg.to.place];
    if (info.atStart || shownPhase === 'done') activePlaces = [];
    else if (shownPhase === 'hold') activePlaces = [leg.from.place];
    else if (traveling) activePlaces = [leg.from.place, leg.to.place];

    view.refreshMarkers({
      reachedStop: info.reachedStop,
      activePlaces,
      targetPlace: traveling ? leg.to.place : null,
      selectedPlace,
    });
  }

  // --- Layout ---------------------------------------------------------
  // Titel oben und Leiste unten verdecken einen Teil der Karte. Die Karte
  // bekommt diese Ränder mitgeteilt, damit ihre Mitte im freien Bereich liegt.
  function layout() {
    const { top, bottom } = ui.insets();
    view.setInsets(top, bottom);
    document.documentElement.style.setProperty('--panel-space', `${Math.round(bottom)}px`);
    document.documentElement.style.setProperty('--banner-top', `${Math.round(top) + 10}px`);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layout();
      drawStars(starsCanvas);
    }, 120);
  });
  if (window.ResizeObserver) new ResizeObserver(layout).observe(document.getElementById('panel'));

  layout();
  view.setCamera(view.overviewCamera());
  refresh();

  // --- Tastatur (z. B. iPad mit Tastatur) -----------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const info = player.info();
    if (e.key === ' ') {
      e.preventDefault();
      player.toggle();
    } else if (e.key === 'ArrowRight') {
      player.jumpTo(Math.min(trip.legs.length - 1, info.atStart ? 0 : info.legIndex + 1));
    } else if (e.key === 'ArrowLeft') {
      player.jumpTo(Math.max(0, info.legIndex - 1));
    } else if (e.key === 'Escape') {
      selectPlace(null);
    }
  });

  // Safari: Pinch-Zoom der ganzen Seite verhindern (die Karte zoomt selbst).
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  trip.warnings.forEach((warning) => ui.toast(warning, 10000));
}

// Lädt MapLibre GL – notfalls vom zweiten CDN.
async function loadMapLibre() {
  for (const url of MAPLIBRE_URLS) {
    try {
      return await import(url);
    } catch (error) {
      console.warn(`MapLibre von ${url} nicht geladen:`, error);
    }
  }
  throw new Error('Die Kartenbibliothek MapLibre konnte nicht geladen werden. Besteht eine Internetverbindung?');
}

function readSavedStyle() {
  try {
    return localStorage.getItem(STYLE_STORAGE_KEY) || 'karte';
  } catch {
    return 'karte';
  }
}

// Beim allerersten Besuch einen kurzen Bedienungs-Tipp zeigen.
function showFirstVisitTip(ui) {
  try {
    if (localStorage.getItem('reise-globus-tipp')) return;
    localStorage.setItem('reise-globus-tipp', '1');
  } catch {
    // Privater Modus o. Ä.: Tipp dann einfach jedes Mal zeigen.
  }
  ui.toast('Tipp: Tippe auf einen Ort für Details. Über die Leiste unten springst du zu jeder Etappe.', 8000);
}

function showError(error) {
  console.error(error);
  document.getElementById('loading').classList.add('is-done');
  const box = document.getElementById('error');
  const isRouteError = error instanceof RouteError;
  box.innerHTML = `
    <h2>${isRouteError ? 'Problem mit route.json' : 'Da ist etwas schiefgelaufen'}</h2>
    <p class="error-message"></p>
    <p class="error-hint"></p>`;
  box.querySelector('.error-message').textContent = error.message;
  box.querySelector('.error-hint').textContent = isRouteError
    ? error.hint
    : 'Lade die Seite neu. Hilft das nicht: Unterstützt der Browser WebGL? (Safari auf iPad/iPhone kann das.)';
  box.hidden = false;
}
