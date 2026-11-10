// =====================================================================
// map.js – alles, was man auf der Karte SIEHT
// ---------------------------------------------------------------------
//  • die Karte selbst (Bibliothek MapLibre GL): von weit weg ein Globus,
//    beim Reinzoomen eine gestochen scharfe Karte aus Kacheln
//  • zwei Kartenstile: "Karte" (Straßenkarte) und "Satellit"
//  • die Linien der Etappen (gestrichelte Vorschau + leuchtende Linie)
//  • die Marker mit Stadtnamen (Beschriftungen weichen sich gegenseitig aus)
//  • das Fahrzeug, das die Route abfährt
//  • Kamera-Hilfen: Nahansicht eines Ortes, Zoomstufe für eine Etappe …
//
// Was wann passiert, entscheidet player.js – diese Datei zeichnet nur.
// =====================================================================

import { centerOf, clamp, toMercator } from './geo.js';

// ---- Kartenstile --------------------------------------------------------
export const MAP_STYLES = {
  karte: {
    name: 'Karte',
    // OpenFreeMap: kostenlose Straßenkarte ohne Anmeldung (Daten: OpenStreetMap)
    style: 'https://tiles.openfreemap.org/styles/liberty',
    preview: 'rgba(35, 45, 75, 0.6)', // Farbe der gestrichelten Vorschau
    casing: '#ffffff', // Rand um die gereiste Linie
    haloOpacity: 0.4,
  },
  satellit: {
    name: 'Satellit',
    style: {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Satellitenbilder © Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
    },
    preview: 'rgba(255, 255, 255, 0.75)',
    casing: 'rgba(8, 12, 28, 0.7)',
    haloOpacity: 0.65,
  },
};

// ---- Kamera ------------------------------------------------------------
// Zoomstufen: 0 = ganze Welt, 10 = Stadt mit Umland, 14 = Stadtviertel.
export const CAMERA = {
  cityZoom: 10, // Nahansicht eines Ortes (pro Ort änderbar: "zoom" in route.json)
  cityPitch: 45, // Neigung der Nahansicht in Grad (0 = senkrecht von oben)
  edgePadding: 60, // Rand in Pixeln, wenn eine Etappe ins Bild eingepasst wird
  minZoom: 0.5,
};

const LINE = { core: 3.5, casing: 7, halo: 14 }; // Linienbreiten in Pixeln
const LABEL_SIDES = ['right', 'left', 'top', 'bottom'];
const LABEL_GAP = 11; // Abstand Punkt ↔ Beschriftung in Pixeln
const DOT_RADIUS = 7;
const EMPTY = { type: 'FeatureCollection', features: [] };

export function createMapView(maplibregl, container, trip, callbacks) {
  let styleKey = callbacks.initialStyle in MAP_STYLES ? callbacks.initialStyle : 'karte';
  const insets = { top: 0, bottom: 0 };

  // ---------------------------------------------------------------
  // 1) Die Karte
  // ---------------------------------------------------------------
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLES[styleKey].style,
    center: [trip.stops[0].lng, trip.stops[0].lat],
    zoom: 1.5,
    // Höchstens doppelte Pixeldichte: auf dem iPhone (3×) spart das viel Rechenzeit.
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    attributionControl: false,
    maxPitch: 70,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

  // Jedes Mal, wenn ein Kartenstil fertig geladen ist (auch nach dem Umschalten),
  // kommen Globus-Ansicht, Atmosphäre und unsere Linien dazu.
  let styleReady = false;
  map.on('style.load', () => {
    styleReady = true;
    clearTimeout(styleWatchdog);
    map.setProjection({ type: 'globe' });
    map.setSky({
      'sky-color': '#0c1530',
      'horizon-color': '#6fb2ff',
      'fog-color': '#ffffff',
      // Leuchtender Rand um den Globus, beim Reinzoomen ausgeblendet
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    });
    addRouteLayers();
  });

  // Ladebildschirm ausblenden, sobald die Karte steht – spätestens aber
  // ein paar Sekunden nach dem Stil, falls Kacheln sehr langsam laden.
  let readyFired = false;
  function ready() {
    if (readyFired) return;
    readyFired = true;
    callbacks.onReady && callbacks.onReady();
  }
  map.once('load', ready);
  map.once('style.load', () => setTimeout(ready, 5000));

  // Der Quellenhinweis (Pflicht) soll nur als kleines (i) erscheinen.
  const collapseAttribution = () => {
    const attribution = container.querySelector('.maplibregl-ctrl-attrib');
    if (attribution) attribution.classList.remove('maplibregl-compact-show');
  };
  map.on('load', collapseAttribution);
  map.on('style.load', () => setTimeout(collapseAttribution, 0));

  // Lädt ein Kartenstil nicht (Server nicht erreichbar), wechseln wir zum anderen.
  let styleWatchdog = null;
  function watchStyle() {
    clearTimeout(styleWatchdog);
    styleWatchdog = setTimeout(() => {
      if (styleReady) return;
      const other = styleKey === 'karte' ? 'satellit' : 'karte';
      callbacks.onStyleProblem && callbacks.onStyleProblem(MAP_STYLES[styleKey].name, MAP_STYLES[other].name);
      setStyle(other);
    }, 9000);
  }
  watchStyle();

  function setStyle(key) {
    if (!MAP_STYLES[key] || key === styleKey) return;
    styleKey = key;
    styleReady = false;
    routeState.doneKey = null;
    routeState.current = undefined;
    map.setStyle(MAP_STYLES[key].style, { diff: false });
    watchStyle();
  }

  // ---------------------------------------------------------------
  // 2) Linien der Etappen
  // ---------------------------------------------------------------
  // Drei Quellen (GeoJSON):
  //   route-all     – alle Etappen, gestrichelt als Vorschau
  //   route-done    – fertig gereiste Etappen
  //   route-current – die Etappe, die gerade gefahren wird
  // Die aktuelle Etappe wird mit einem Farbverlauf entlang der Linie
  // ("line-gradient") nur bis zum Fortschritt eingefärbt, der Rest ist
  // durchsichtig. So wächst die Linie, ohne dass wir sie neu bauen müssen.
  const routeState = { doneKey: null, current: undefined, progress: -1 };

  const legFeature = (leg) => ({
    type: 'Feature',
    properties: { color: leg.transport.color, glow: leg.transport.glow },
    geometry: { type: 'LineString', coordinates: leg.points },
  });
  const collection = (legs) => ({ type: 'FeatureCollection', features: legs.map(legFeature) });
  const drawableLegs = trip.legs.filter((leg) => !leg.empty);

  function addRouteLayers() {
    const theme = MAP_STYLES[styleKey];
    const round = { 'line-cap': 'round', 'line-join': 'round' };

    map.addSource('route-all', { type: 'geojson', data: collection(drawableLegs) });
    map.addSource('route-done', { type: 'geojson', data: EMPTY });
    map.addSource('route-current', { type: 'geojson', data: EMPTY, lineMetrics: true });

    map.addLayer({
      id: 'route-preview',
      type: 'line',
      source: 'route-all',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': theme.preview, 'line-width': 2, 'line-dasharray': [1.6, 1.8] },
    });
    // Fertige Etappen: weicher Leucht-Saum, Rand, farbiger Kern
    map.addLayer({
      id: 'done-halo', type: 'line', source: 'route-done', layout: round,
      paint: { 'line-color': ['get', 'glow'], 'line-width': LINE.halo, 'line-blur': 9, 'line-opacity': theme.haloOpacity },
    });
    map.addLayer({
      id: 'done-casing', type: 'line', source: 'route-done', layout: round,
      paint: { 'line-color': theme.casing, 'line-width': LINE.casing },
    });
    map.addLayer({
      id: 'done-core', type: 'line', source: 'route-done', layout: round,
      paint: { 'line-color': ['get', 'color'], 'line-width': LINE.core },
    });
    // Aktuelle Etappe: dieselben drei Ebenen, aber mit Farbverlauf
    map.addLayer({
      id: 'current-halo', type: 'line', source: 'route-current', layout: round,
      paint: { 'line-gradient': reveal('#000', 0), 'line-width': LINE.halo, 'line-blur': 9, 'line-opacity': theme.haloOpacity },
    });
    map.addLayer({
      id: 'current-casing', type: 'line', source: 'route-current', layout: round,
      paint: { 'line-gradient': reveal('#000', 0), 'line-width': LINE.casing },
    });
    map.addLayer({
      id: 'current-core', type: 'line', source: 'route-current', layout: round,
      paint: { 'line-gradient': reveal('#000', 0), 'line-width': LINE.core },
    });

    syncRoute(true);
  }

  // Farbverlauf entlang der Linie: bis "progress" farbig, danach durchsichtig.
  function reveal(color, progress) {
    return ['step', ['line-progress'], color, Math.max(progress, 1e-6), 'rgba(0,0,0,0)'];
  }

  const setLegProgress = (leg, p) => (leg.progress = p);

  // Bringt die Karte auf den Stand von leg.progress. Wird bei jedem Bild
  // aufgerufen, ändert aber nur etwas, wenn sich auch etwas getan hat.
  function syncRoute(force = false) {
    if (!styleReady || !map.getSource('route-done')) return;
    const theme = MAP_STYLES[styleKey];

    const done = drawableLegs.filter((leg) => leg.progress >= 1);
    const doneKey = done.map((leg) => leg.index).join(',');
    if (force || doneKey !== routeState.doneKey) {
      routeState.doneKey = doneKey;
      map.getSource('route-done').setData(collection(done));
    }

    const current = drawableLegs.find((leg) => leg.progress > 0 && leg.progress < 1) || null;
    if (force || current !== routeState.current) {
      routeState.current = current;
      routeState.progress = -1;
      map.getSource('route-current').setData(current ? collection([current]) : EMPTY);
    }

    if (current && Math.abs(current.progress - routeState.progress) > 0.0005) {
      const p = current.progress;
      routeState.progress = p;
      map.setPaintProperty('current-halo', 'line-gradient', reveal(current.transport.glow, p));
      map.setPaintProperty('current-casing', 'line-gradient', reveal(theme.casing, p));
      map.setPaintProperty('current-core', 'line-gradient', reveal(current.transport.color, p));
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
    el.addEventListener('click', () => callbacks.onMarkerTap && callbacks.onMarkerTap(place));
    place.el = el;
    place.labelEl = el.querySelector('.marker-label');
    place.side = ''; // wird von layoutLabels() gesetzt
    place.priority = 0;
    // Marker auf der Rückseite des Globus werden ausgeblendet ("covered").
    place.marker = new maplibregl.Marker({ element: el, anchor: 'center', opacityWhenCovered: '0' })
      .setLngLat([place.lng, place.lat])
      .addTo(map);
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
    requestLabelLayout();
  }

  // Beschriftungen so platzieren, dass sie sich nicht überlappen.
  // Jede Beschriftung probiert rechts, links, oben, unten – passt nichts,
  // wird sie versteckt (der Punkt bleibt antippbar). Wichtige Orte zuerst.
  function layoutLabels() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const taken = []; // bereits belegte Rechtecke auf dem Bildschirm
    const items = [];

    for (const place of trip.places) {
      const covered = place.el.classList.contains('maplibregl-marker-covered');
      if (covered) {
        setSide(place, 'none');
        continue;
      }
      if (!place.labelW) {
        place.labelW = place.labelEl.offsetWidth; // einmal messen
        place.labelH = place.labelEl.offsetHeight;
        if (!place.labelW) continue;
      }
      const { x, y } = map.project([place.lng, place.lat]);
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
        const onScreen = box.x1 > 4 && box.x2 < width - 4 && box.y1 > insets.top && box.y2 < height - insets.bottom;
        if (onScreen && !taken.some((t) => overlaps(t, box))) {
          chosen = side;
          taken.push(box);
          break;
        }
      }
      setSide(place, chosen);
    }
  }

  function setSide(place, side) {
    if (place.side === side) return;
    place.side = side;
    place.el.dataset.side = side;
  }

  // Wenn jemand selbst die Karte bewegt, Beschriftungen einmal pro Bild neu ordnen.
  let labelFrame = null;
  function requestLabelLayout() {
    if (labelFrame || looping) return;
    labelFrame = requestAnimationFrame(() => {
      labelFrame = null;
      layoutLabels();
    });
  }
  map.on('move', requestLabelLayout);
  map.on('resize', requestLabelLayout);

  // ---------------------------------------------------------------
  // 4) Das Fahrzeug
  // ---------------------------------------------------------------
  const vehicleEl = document.createElement('div');
  vehicleEl.className = 'vehicle';
  vehicleEl.setAttribute('aria-hidden', 'true');
  // rotationAlignment "map": Drehung bezieht sich auf Norden der Karte –
  // so zeigt das Fahrzeug immer in Fahrtrichtung, auch wenn die Karte gedreht ist.
  const vehicleMarker = new maplibregl.Marker({
    element: vehicleEl,
    anchor: 'center',
    rotationAlignment: 'map',
    pitchAlignment: 'map',
    opacityWhenCovered: '0',
  })
    .setLngLat([trip.stops[0].lng, trip.stops[0].lat])
    .addTo(map);
  let vehicleKind = null;

  function setVehicle(leg, progress) {
    if (vehicleKind !== leg.transportKey) {
      vehicleKind = leg.transportKey;
      vehicleEl.innerHTML = leg.transport.vehicle;
      vehicleEl.style.setProperty('--vehicle-color', leg.transport.color);
    }
    const pos = leg.at(progress);
    vehicleMarker.setLngLat([pos.lng, pos.lat]).setRotation(pos.heading);
    vehicleEl.classList.toggle('is-hidden', leg.empty);
  }

  // ---------------------------------------------------------------
  // 5) Kamera
  // ---------------------------------------------------------------
  // Eine Kamera-Einstellung ist { center: [lng, lat], zoom, pitch, bearing }.
  function setCamera(camera) {
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: camera.pitch || 0,
      bearing: camera.bearing || 0,
    });
  }

  function getCamera() {
    const c = map.getCenter();
    return { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
  }

  // Nahansicht eines Ortes. Auf kleinen Bildschirmen etwas weiter weg,
  // damit iPhone und iPad ungefähr gleich viel Umgebung zeigen.
  function cityZoom(stop) {
    const base = stop.zoom != null ? stop.zoom : CAMERA.cityZoom;
    const size = Math.max(200, Math.min(container.clientWidth, container.clientHeight - insets.top - insets.bottom));
    return base + Math.log2(size / 700);
  }
  const cityCamera = (stop) => ({ center: [stop.lng, stop.lat], zoom: cityZoom(stop), pitch: CAMERA.cityPitch, bearing: 0 });

  // Bei welcher Zoomstufe passt ein Gebiet (in Mercator-Koordinaten 0…1)
  // in den freien Bereich des Bildschirms? Die ganze Welt ist bei Zoom z
  // genau 512 · 2^z Pixel breit.
  function zoomToFit(extent) {
    const freeWidth = Math.max(80, container.clientWidth - 2 * CAMERA.edgePadding);
    const freeHeight = Math.max(80, container.clientHeight - insets.top - insets.bottom - 2 * CAMERA.edgePadding);
    const w = Math.max(extent.maxX - extent.minX, 1e-7);
    const h = Math.max(extent.maxY - extent.minY, 1e-7);
    return Math.log2(Math.min(freeWidth / (w * 512), freeHeight / (h * 512)));
  }

  // Zoomstufe, bei der der ganze Globus die freie Fläche ausfüllt.
  // (Der Globus ist bei Zoom z etwa 163 · 2^z Pixel groß: Weltbreite 512 · 2^z / π.)
  function globeZoom() {
    const freeWidth = container.clientWidth;
    const freeHeight = container.clientHeight - insets.top - insets.bottom;
    return Math.log2((0.9 * Math.max(120, Math.min(freeWidth, freeHeight))) / (512 / Math.PI));
  }

  // Zoomstufe, in der eine ganze Etappe zu sehen ist – aber nie weiter weg,
  // als dass der Globus die freie Fläche ausfüllt.
  function travelZoom(leg) {
    const closest = Math.min(cityZoom(leg.from), cityZoom(leg.to)) - 1.5;
    const zoom = Math.max(zoomToFit(leg.extent), globeZoom());
    return clamp(zoom, CAMERA.minZoom, Math.max(CAMERA.minZoom, closest));
  }

  // Zoomstufe, in der zwei Kamera-Mittelpunkte gleichzeitig zu sehen sind.
  function zoomToShow(a, b) {
    const pa = toMercator(a);
    const pb = toMercator([nearLng(b[0], a[0]), b[1]]);
    return zoomToFit({
      minX: Math.min(pa[0], pb[0]), maxX: Math.max(pa[0], pb[0]),
      minY: Math.min(pa[1], pb[1]), maxY: Math.max(pa[1], pb[1]),
    });
  }

  // Ansicht, in der die ganze Reise zu sehen ist (meist als Globus).
  function overviewCamera() {
    const center = centerOf(trip.stops);
    const merc = trip.stops.map((s) => toMercator([nearLng(s.lng, center.lng), s.lat]));
    const zoom = zoomToFit({
      minX: Math.min(...merc.map((m) => m[0])), maxX: Math.max(...merc.map((m) => m[0])),
      minY: Math.min(...merc.map((m) => m[1])), maxY: Math.max(...merc.map((m) => m[1])),
    });
    const fit = Math.max(zoom - 0.3, globeZoom());
    return { center: [center.lng, center.lat], zoom: clamp(fit, CAMERA.minZoom, 4), pitch: 0, bearing: 0 };
  }

  // Weicher Kameraflug der Bibliothek (für "Von vorne", wenn nichts läuft).
  const flyTo = (camera, ms) => map.flyTo({ ...camera, duration: ms, essential: true });

  // Oben und unten liegen Bedienelemente über der Karte. Mit "padding"
  // rückt die Kartenmitte in die Mitte der freien Fläche dazwischen.
  function setInsets(top, bottom) {
    insets.top = top;
    insets.bottom = bottom;
    map.setPadding({ top, bottom, left: 0, right: 0 });
    requestLabelLayout();
  }

  // ---------------------------------------------------------------
  // 6) Touch: selbst bewegen erkennen, Antippen erkennen
  // ---------------------------------------------------------------
  // Solange ein Finger auf der Karte liegt, hält die Animation an ("touching").
  // Sonst würde unsere Kamerasteuerung die Geste sofort wieder abbrechen.
  // Wird dann gezogen oder gezoomt, pausiert die Reise; bei einem kurzen
  // Antippen läuft sie einfach weiter.
  const canvasContainer = map.getCanvasContainer();
  const pointers = new Map();
  let touching = false;

  canvasContainer.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.marker')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touching = true;
    if (pointers.size > 1) userMovesCamera(); // zwei Finger = zoomen/drehen
  });
  canvasContainer.addEventListener('pointermove', (e) => {
    const start = pointers.get(e.pointerId);
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) userMovesCamera();
  });
  const pointerEnd = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) touching = false;
  };
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  canvasContainer.addEventListener('wheel', () => userMovesCamera(), { passive: true });

  function userMovesCamera() {
    callbacks.onUserCamera && callbacks.onUserCamera();
  }

  // Ereignisse mit "originalEvent" kommen von einem Finger (oder der Maus),
  // nicht von unserer eigenen Kamerasteuerung.
  ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((type) => {
    map.on(type, (e) => {
      if (e.originalEvent) userMovesCamera();
    });
  });
  map.on('click', (e) => {
    const target = e.originalEvent && e.originalEvent.target;
    if (target && target.closest && target.closest('.marker')) return; // Marker selbst
    callbacks.onMapTap && callbacks.onMapTap();
  });

  // ---------------------------------------------------------------
  // 7) Bild-für-Bild-Schleife (nur solange die Reise läuft)
  // ---------------------------------------------------------------
  // map._requestRenderFrame lässt uns direkt vor dem Zeichnen jedes Bildes
  // rechnen – genau so animiert MapLibre auch selbst seine Kamera. Damit
  // passen Kamera, Linie und Fahrzeug im selben Bild exakt zusammen.
  let looping = false;
  let lastTime = 0;

  function startLoop() {
    if (looping) return;
    looping = true;
    lastTime = performance.now();
    scheduleFrame();
  }

  function scheduleFrame() {
    if (typeof map._requestRenderFrame === 'function') map._requestRenderFrame(frame);
    else requestAnimationFrame(frame);
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(now - lastTime, 60); // nach Tab-Wechsel keine Riesensprünge
    lastTime = now;
    // Finger auf der Karte → Zeit anhalten (siehe Abschnitt 6)
    const keepGoing = touching ? true : callbacks.onFrame ? callbacks.onFrame(dt) : false;
    syncRoute();
    layoutLabels();
    if (keepGoing) scheduleFrame();
    else looping = false;
  }

  return {
    map,
    setLegProgress,
    syncRoute,
    setVehicle,
    refreshMarkers,
    setCamera,
    getCamera,
    cityCamera,
    travelZoom,
    zoomToShow,
    overviewCamera,
    flyTo,
    setInsets,
    setStyle,
    getStyle: () => styleKey,
    startLoop,
  };
}

// ---------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------

// Länge so verschieben (±360°), dass sie möglichst nah an "ref" liegt.
function nearLng(lng, ref) {
  while (lng - ref > 180) lng -= 360;
  while (lng - ref < -180) lng += 360;
  return lng;
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
