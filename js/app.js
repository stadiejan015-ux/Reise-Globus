// =====================================================================
// app.js – der Startpunkt: lädt alles und verbindet die Teile
// ---------------------------------------------------------------------
//   route.js   → liest route.json und berechnet die Etappen
//   globe.js   → zeichnet Globus, Linien, Marker und Fahrzeug
//   player.js  → steuert die Animation (Play, Pause, Springen …)
//   ui.js      → Buttons, Etappenleiste, Infokarte
//   stars.js   → Sternenhimmel
// =====================================================================

import { loadTrip, RouteError } from './route.js';
import { createGlobeView } from './globe.js';
import { createPlayer } from './player.js';
import { createUI } from './ui.js';
import { drawStars } from './stars.js';

// Falls das CDN jsDelivr einmal nicht erreichbar ist, nehmen wir unpkg.
const GLOBE_FALLBACK_URL = 'https://unpkg.com/globe.gl@2.46.2/dist/globe.gl.min.js';

start().catch(showError);

async function start() {
  const starsCanvas = document.getElementById('stars');
  drawStars(starsCanvas);

  const trip = await loadTrip('route.json');
  await ensureGlobeLibrary();

  let player = null;
  let selectedPlace = null;

  // --- Oberfläche ---------------------------------------------------
  const ui = createUI(trip, {
    onPlay: () => player.toggle(),
    onRestart: () => player.reset(),
    onSpeed: () => player.cycleSpeed(),
    onLeg: (index) => player.jumpTo(index),
    onCloseCard: () => selectPlace(null),
  });

  // --- Globus -------------------------------------------------------
  const view = createGlobeView(document.getElementById('globe'), trip, {
    onReady: () => {
      document.getElementById('loading').classList.add('is-done');
      showFirstVisitTip(ui);
    },
    onFrame: (dt) => {
      if (!player) return;
      player.update(dt);
      ui.setProgress(player.progress());
    },
    onMarkerTap: (place) => selectPlace(place === selectedPlace ? null : place),
    onGlobeTap: () => selectPlace(null),
    // Wer selbst am Globus dreht oder zoomt, übernimmt die Kamera → Pause.
    onUserCamera: () => player && player.pause(),
  });

  // --- Animation ----------------------------------------------------
  player = createPlayer(trip, view, refresh);

  function selectPlace(place) {
    selectedPlace = place;
    if (place) ui.openCard(place);
    else ui.closeCard();
    refresh();
  }

  // Wird bei jeder Zustandsänderung aufgerufen: Oberfläche + Marker anpassen.
  function refresh() {
    const info = player.info();
    ui.render(info);

    const { leg, phase } = info;
    const flying = phase === 'approach' || phase === 'flight';
    view.refreshMarkers({
      reachedStop: info.reachedStop,
      activePlaces: info.atStart ? [] : flying ? [leg.from.place, leg.to.place] : [leg.to.place],
      targetPlace: flying ? leg.to.place : null,
      selectedPlace,
    });
  }

  // --- Größe & Layout -------------------------------------------------
  function layout() {
    view.resize();
    const { top, bottom } = ui.insets();
    view.setInsets(top, bottom);
    document.documentElement.style.setProperty('--panel-space', `${Math.round(bottom)}px`);
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
  view.setCamera(view.overviewPov());
  refresh();

  // --- Tastatur (z. B. iPad mit Tastatur) -----------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const info = player.info();
    if (e.key === ' ') {
      e.preventDefault();
      player.toggle();
    } else if (e.key === 'ArrowRight') {
      player.jumpTo(Math.min(trip.legs.length - 1, info.legIndex + (info.phase === 'ready' ? 0 : 1)));
    } else if (e.key === 'ArrowLeft') {
      player.jumpTo(Math.max(0, info.legIndex - 1));
    } else if (e.key === 'Escape') {
      selectPlace(null);
    }
  });

  // Safari: Pinch-Zoom der ganzen Seite verhindern (der Globus zoomt selbst).
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  trip.warnings.forEach((warning) => ui.toast(warning, 10000));
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

// Lädt globe.gl notfalls von einem zweiten CDN nach.
async function ensureGlobeLibrary() {
  if (window.Globe) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GLOBE_FALLBACK_URL;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Die Globus-Bibliothek globe.gl konnte nicht geladen werden. Besteht eine Internetverbindung?'));
    document.head.appendChild(script);
  });
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
