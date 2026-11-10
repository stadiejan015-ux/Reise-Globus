// =====================================================================
// globe.js – alles, was man auf dem Globus SIEHT
// ---------------------------------------------------------------------
//  • der 3D-Globus selbst (Bibliothek globe.gl)
//  • die Linien der Etappen (gestrichelte Vorschau + leuchtende Linie)
//  • die Marker mit Stadtnamen (Beschriftungen weichen sich gegenseitig aus)
//  • das Fahrzeug-Symbol, das über den Globus fliegt
//  • Hilfsfunktionen für die Kamera
//
// Was wann passiert, entscheidet player.js – diese Datei zeichnet nur.
// =====================================================================

import { angleBetween, centerOf, clamp, DEG, isBehindSphere } from './geo.js';

const TEXTURES = {
  earth: 'assets/earth-blue-marble.jpg', // Erdoberfläche (NASA Blue Marble)
  bump: 'assets/earth-topology.png', // Höhenrelief für leichte Schattierung
};

const LINE_WIDTH = { preview: 1.3, glow: 6.5, core: 2.2 }; // in Pixeln
const CAMERA_ALTITUDE = { min: 0.4, max: 4.5 }; // in Erdradien
const LABEL_SIDES = ['right', 'left', 'top', 'bottom'];
const LABEL_GAP = 11; // Abstand Punkt ↔ Beschriftung in Pixeln
const DOT_RADIUS = 7;

export function createGlobeView(container, trip, callbacks) {
  const view = {
    width: window.innerWidth,
    height: window.innerHeight,
    insetTop: 0, // verdeckter Bereich oben (Titel)
    insetBottom: 0, // verdeckter Bereich unten (Etappenleiste)
  };
  let introDone = false; // Einflug-Animation des Globus vorbei?
  let labelsDirty = true; // Beschriftungen neu anordnen?

  // ---------------------------------------------------------------
  // 1) Der Globus
  // ---------------------------------------------------------------
  const globe = new Globe(container, { animateIn: true })
    .width(view.width)
    .height(view.height)
    .backgroundColor('rgba(0,0,0,0)') // durchsichtig → Sternenhimmel dahinter
    .globeImageUrl(TEXTURES.earth)
    .bumpImageUrl(TEXTURES.bump)
    .showAtmosphere(true)
    .atmosphereColor('#62b4ff')
    .atmosphereAltitude(0.17)
    // Wir brauchen keine Maus-/Touch-Treffer auf 3D-Objekten (Marker sind HTML).
    // Abschalten spart auf iPhone/iPad spürbar Rechenzeit.
    .enablePointerInteraction(false)
    .onGlobeReady(() => {
      // globe.gl lässt den Globus kurz hereindrehen; danach Fahrzeug zeigen.
      setTimeout(() => (introDone = true), 1300);
      callbacks.onReady && callbacks.onReady();
    });

  const camera = globe.camera();
  const globeRadius = globe.getGlobeRadius();

  // ---------------------------------------------------------------
  // 2) Linien der Etappen
  // ---------------------------------------------------------------
  // Pro Etappe drei Linien übereinander (gezeichnet in dieser Reihenfolge):
  //   preview – dünn, gestrichelt: die geplante Route
  //   glow    – breiter farbiger Saum   ┐ zusammen ergibt das
  //   core    – heller, schmaler Kern   ┘ die "leuchtende" Linie
  // glow und core werden mit einem Trick nur bis zum Fortschritt der Etappe
  // gezeichnet: Wir machen sie "gestrichelt" mit genau EINEM Strich, dessen
  // Länge dem Fortschritt entspricht (0 = nichts, 0.5 = halbe Strecke).
  const lines = [];
  trip.legs.forEach((leg) => {
    leg.lines = [];
    if (leg.empty) return;
    const dash = clamp(0.6 / (leg.angle / DEG), 0.004, 0.25); // Strichlänge ≈ 0,6°
    leg.lines.push(
      { leg, kind: 'preview', order: 1, points: leg.points, color: 'rgba(255,255,255,0.34)', width: LINE_WIDTH.preview, dash },
      { leg, kind: 'glow', order: 2, points: leg.points, color: leg.transport.glow, width: LINE_WIDTH.glow },
      { leg, kind: 'core', order: 3, points: leg.points, color: leg.transport.core, width: LINE_WIDTH.core }
    );
    lines.push(...leg.lines);
  });

  globe
    .pathsData(lines)
    .pathPoints('points')
    .pathPointLat((p) => p[0])
    .pathPointLng((p) => p[1])
    .pathPointAlt((p) => p[2])
    .pathColor('color')
    .pathStroke('width')
    .pathDashLength((line) => (line.kind === 'preview' ? line.dash : 1))
    .pathDashGap((line) => (line.kind === 'preview' ? line.dash : 2))
    .pathDashInitialGap(0)
    .pathTransitionDuration(0);

  const setLegProgress = (leg, p) => (leg.progress = p);

  // globe.gl merkt sich an jedem Linien-Eintrag das zugehörige 3D-Objekt
  // (Eigenschaft __threeObjPath). Darüber stellen wir bei jedem Bild direkt
  // ein, wie viel von der Linie zu sehen ist – viel schneller, als die
  // Linie jedes Mal neu aufzubauen.
  function updateLines() {
    for (const line of lines) {
      const group = line.__threeObjPath;
      const obj = group && group.children[0];
      if (!obj || !obj.material) continue; // noch nicht erzeugt
      const material = obj.material;

      // Feste Zeichenreihenfolge statt Tiefen-Vergleich: verhindert Flimmern,
      // wenn die drei Linien fast an derselben Stelle liegen.
      obj.renderOrder = line.order;
      material.transparent = true;
      material.depthWrite = false;

      // Linienbreite in Pixeln braucht die aktuelle Bildschirmgröße
      // (ändert sich z. B. beim Drehen des iPads).
      if (material.resolution.x !== view.width || material.resolution.y !== view.height) {
        material.resolution.set(view.width, view.height);
      }

      if (line.kind === 'preview') continue;
      const p = line.leg.progress;
      obj.visible = p > 0;
      material.dashed = p < 1; // fertige Etappen: durchgehende, runde Linie
      material.dashSize = p;
    }
  }

  // ---------------------------------------------------------------
  // 3) Marker mit Stadtnamen
  // ---------------------------------------------------------------
  trip.places.forEach((place) => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', place.name);
    el.innerHTML = '<span class="marker-dot"></span><span class="marker-label"></span>';
    el.querySelector('.marker-label').textContent = place.name;
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onMarkerTap && callbacks.onMarkerTap(place);
    });
    place.el = el;
    place.labelEl = el.querySelector('.marker-label');
    place.side = ''; // wird von layoutLabels() gesetzt
    place.visible = true;
    place.priority = 0;
    el.__place = place;
  });

  globe
    .htmlElementsData(trip.places)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.002)
    .htmlElement((place) => place.el)
    .htmlTransitionDuration(0)
    // Marker auf der Rückseite des Globus ausblenden (statt sie zu entfernen).
    .htmlElementVisibilityModifier((el, isVisible) => {
      el.classList.toggle('is-behind', !isVisible);
      if (el.__place) el.__place.visible = isVisible;
      labelsDirty = true;
    });

  // Zustand der Marker setzen (besucht, aktiv, ausgewählt).
  function refreshMarkers({ reachedStop, activePlaces = [], targetPlace = null, selectedPlace = null }) {
    trip.places.forEach((place) => {
      const visited = place.stops.some((s) => s.index <= reachedStop);
      const active = activePlaces.includes(place);
      const selected = place === selectedPlace;
      place.el.classList.toggle('is-visited', visited);
      place.el.classList.toggle('is-active', active);
      place.el.classList.toggle('is-target', place === targetPlace);
      place.el.classList.toggle('is-selected', selected);
      // Wer zuerst einen Platz für seine Beschriftung bekommt:
      place.priority = (selected ? 1000 : 0) + (active ? 500 : 0) - place.stops[0].index;
    });
    labelsDirty = true;
  }

  // Beschriftungen so platzieren, dass sie sich nicht überlappen.
  // Jede Beschriftung probiert rechts, links, oben, unten – passt nichts,
  // wird sie versteckt (der Punkt bleibt antippbar). Wichtige Orte zuerst.
  function layoutLabels() {
    const taken = []; // bereits belegte Rechtecke auf dem Bildschirm
    const items = [];

    for (const place of trip.places) {
      if (!place.visible) continue;
      if (!place.labelW) {
        place.labelW = place.labelEl.offsetWidth; // einmal messen
        place.labelH = place.labelEl.offsetHeight;
        if (!place.labelW) {
          labelsDirty = true; // noch nicht im Dokument → beim nächsten Bild nochmal
          continue;
        }
      }
      const { x, y } = globe.getScreenCoords(place.lat, place.lng, 0.002);
      items.push({ place, x, y });
      taken.push({ x1: x - DOT_RADIUS, y1: y - DOT_RADIUS, x2: x + DOT_RADIUS, y2: y + DOT_RADIUS });
    }

    items.sort((a, b) => b.place.priority - a.place.priority);

    for (const { place, x, y } of items) {
      let chosen = 'none';
      // Die bisherige Seite zuerst probieren – das verhindert Flackern.
      const order = LABEL_SIDES.includes(place.side) ? [place.side, ...LABEL_SIDES] : LABEL_SIDES;
      for (const side of order) {
        const box = labelBox(side, x, y, place.labelW, place.labelH);
        const onScreen = box.x1 > 4 && box.x2 < view.width - 4 &&
          box.y1 > view.insetTop && box.y2 < view.height - view.insetBottom;
        if (onScreen && !taken.some((t) => overlaps(t, box))) {
          chosen = side;
          taken.push(box);
          break;
        }
      }
      if (chosen !== place.side) {
        place.side = chosen;
        place.el.dataset.side = chosen;
      }
    }
    trip.places.forEach((place) => {
      if (!place.visible && place.side !== 'none') {
        place.side = 'none';
        place.el.dataset.side = 'none';
      }
    });
  }

  // ---------------------------------------------------------------
  // 4) Das Fahrzeug (HTML-Element über dem Globus)
  // ---------------------------------------------------------------
  const vehicleEl = document.getElementById('vehicle');
  const vehicle = { leg: null, progress: 0, kind: null, heading: 0 };

  function setVehicle(leg, progress) {
    vehicle.leg = leg;
    vehicle.progress = progress;
  }

  function updateVehicle() {
    const { leg, progress } = vehicle;
    if (!leg || !introDone) {
      vehicleEl.classList.add('is-hidden');
      return;
    }
    if (vehicle.kind !== leg.transportKey) {
      vehicle.kind = leg.transportKey;
      vehicleEl.innerHTML = leg.transport.vehicle;
      vehicleEl.style.setProperty('--vehicle-glow', leg.transport.glow);
    }

    const pos = leg.at(progress);
    const screen = globe.getScreenCoords(pos.lat, pos.lng, pos.alt);

    // Fahrtrichtung: zwei Punkte kurz davor und danach auf den Bildschirm
    // projizieren und den Winkel dazwischen nehmen.
    const before = leg.at(Math.max(0, progress - 0.015));
    const after = leg.at(Math.min(1, progress + 0.015));
    const a = globe.getScreenCoords(before.lat, before.lng, before.alt);
    const b = globe.getScreenCoords(after.lat, after.lng, after.alt);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
      const target = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2; // Icon zeigt nach oben
      vehicle.heading += shortestAngle(target - vehicle.heading) * 0.35; // sanft nachdrehen
    }

    const hidden = isBehindSphere(globe.getCoords(pos.lat, pos.lng, pos.alt), camera.position, globeRadius);
    vehicleEl.classList.toggle('is-hidden', hidden || leg.empty);
    vehicleEl.style.transform =
      `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0) rotate(${vehicle.heading.toFixed(3)}rad)`;
  }

  // ---------------------------------------------------------------
  // 5) Kamera
  // ---------------------------------------------------------------
  // "Point of View" = { lat, lng, altitude }: Die Kamera schwebt in der Höhe
  // altitude (in Erdradien) über lat/lng und schaut auf die Erdmitte.
  function setCamera(pov) {
    globe.pointOfView(pov);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(); // sofort übernehmen – wir sind mitten im Zeichnen
  }

  const getCamera = () => globe.pointOfView();

  // Weicher Kameraflug mit globe.gl (für "Von vorne" ohne laufende Reise).
  const flyTo = (pov, ms) => globe.pointOfView(pov, ms);

  // Wie hoch muss die Kamera sein, damit ein Gebiet mit dem Radius
  // halfAngle (Bogenmaß, vom Erdmittelpunkt gemessen) ganz ins Bild passt?
  // Geometrie: Ein Punkt im Winkel θ erscheint unter dem Blickwinkel α mit
  //   tan α = sin θ / (d − cos θ)   →   d = cos θ + sin θ / tan α
  // (d = Abstand der Kamera vom Erdmittelpunkt in Erdradien).
  function fitAltitude(halfAngle) {
    const tanFov = Math.tan((camera.fov / 2) * DEG);
    const freeHeight = Math.max(120, view.height - view.insetTop - view.insetBottom);
    const tanVertical = tanFov * (freeHeight / view.height);
    const tanHorizontal = tanFov * (view.width / view.height);
    const tanAlpha = Math.min(tanVertical, tanHorizontal) * 0.85; // etwas Rand lassen
    const theta = Math.min(halfAngle, 85 * DEG);
    const distance = Math.cos(theta) + Math.sin(theta) / tanAlpha;
    return clamp(distance - 1, CAMERA_ALTITUDE.min, CAMERA_ALTITUDE.max);
  }

  // Ansicht, in der die ganze Reise zu sehen ist.
  function overviewPov() {
    const center = centerOf(trip.stops);
    const radius = Math.max(...trip.stops.map((s) => angleBetween(center, s)));
    return { lat: center.lat, lng: center.lng, altitude: fitAltitude(radius + 4 * DEG) };
  }

  // ---------------------------------------------------------------
  // 6) Größe & freie Fläche
  // ---------------------------------------------------------------
  function resize() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    globe.width(view.width).height(view.height);
    labelsDirty = true;
  }

  // Oben und unten liegen Bedienelemente über dem Globus. Wir schieben den
  // Globus in die Mitte der freien Fläche dazwischen.
  function setInsets(top, bottom) {
    view.insetTop = top;
    view.insetBottom = bottom;
    globe.globeOffset([0, (top - bottom) / 2]);
    labelsDirty = true;
  }

  // ---------------------------------------------------------------
  // 7) Touch: Ziehen/Zoomen erkennen, Antippen erkennen
  // ---------------------------------------------------------------
  const canvas = globe.renderer().domElement;
  const pointers = new Map();
  let dragged = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (pointers.size === 0) dragged = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) userMovesCamera(); // zwei Finger = Zoomen
  });
  canvas.addEventListener('pointermove', (e) => {
    const start = pointers.get(e.pointerId);
    if (start && !dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
      userMovesCamera();
    }
  });
  const pointerEnd = (e) => {
    const wasDown = pointers.delete(e.pointerId);
    if (wasDown && pointers.size === 0 && !dragged && e.type === 'pointerup') {
      callbacks.onGlobeTap && callbacks.onGlobeTap();
    }
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', () => userMovesCamera(), { passive: true });

  function userMovesCamera() {
    dragged = true;
    callbacks.onUserCamera && callbacks.onUserCamera();
  }

  // ---------------------------------------------------------------
  // 8) Bild-für-Bild-Schleife
  // ---------------------------------------------------------------
  // three.js ruft scene.onBeforeRender direkt vor jedem Bild auf. Hier
  // bewegen wir Kamera, Linie und Fahrzeug – so passt alles im selben
  // Bild exakt zusammen.
  let lastTime = performance.now();
  let lastCameraKey = '';

  globe.scene().onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min(now - lastTime, 60); // nach Tab-Wechsel keine Riesensprünge
    lastTime = now;

    callbacks.onFrame && callbacks.onFrame(dt);

    updateVehicle();

    const p = camera.position;
    const cameraKey = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}`;
    if (labelsDirty || cameraKey !== lastCameraKey) {
      lastCameraKey = cameraKey;
      labelsDirty = false;
      layoutLabels();
    }

    updateLines();
  };

  return {
    globe,
    setLegProgress,
    setVehicle,
    refreshMarkers,
    setCamera,
    getCamera,
    flyTo,
    fitAltitude,
    overviewPov,
    resize,
    setInsets,
  };
}

// ---------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------

function shortestAngle(delta) {
  return Math.atan2(Math.sin(delta), Math.cos(delta)); // auf -π…π bringen
}

function labelBox(side, x, y, w, h) {
  switch (side) {
    case 'left':
      return { x1: x - LABEL_GAP - w, y1: y - h / 2, x2: x - LABEL_GAP, y2: y + h / 2 };
    case 'top':
      return { x1: x - w / 2, y1: y - LABEL_GAP - h, x2: x + w / 2, y2: y - LABEL_GAP };
    case 'bottom':
      return { x1: x - w / 2, y1: y + LABEL_GAP, x2: x + w / 2, y2: y + LABEL_GAP + h };
    default: // right
      return { x1: x + LABEL_GAP, y1: y - h / 2, x2: x + LABEL_GAP + w, y2: y + h / 2 };
  }
}

function overlaps(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}
