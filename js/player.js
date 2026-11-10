// =====================================================================
// player.js – der "Abspieler": WAS passiert WANN?
// ---------------------------------------------------------------------
// Jede Etappe ist eine kleine Kamerafahrt in Phasen:
//
//   hold ─▶ rise ─▶ travel ─▶ descend ─▶ linger ─▶ (nächste Etappe: rise …)
//   am      raus-   Fahrzeug   am Ziel     kurz
//   Start   zoomen  fährt,     rein-       verweilen
//   (nur am         Linie      zoomen
//   Anfang)         wächst
//
// Auf dem Rückweg eines Ausflugs wird nicht angehalten: descend, linger
// und rise dauern dann 0 ms, das Fahrzeug fährt einfach durch.
// Bei Ausflügen bleibt die Kamera in der Region (siehe map.travelZoom).
//
// Dazu kommt "fly": eine freie Kamerafahrt, z. B. zum Start, nach einem
// Sprung, nach einer Pause (falls jemand die Karte bewegt hat) oder am Ende
// zur Gesamtansicht. Danach geht es mit der Phase "then" weiter.
//
// update(dt) wird bei jedem Bild aufgerufen (ca. 60× pro Sekunde) und
// schiebt die Zeit weiter – aber nur, solange state.running true ist.
// =====================================================================

import { angleBetween, clamp, easeInOutCubic, easeInOutSine, lerp, slerp } from './geo.js';

const TIMING = {
  hold: 1200, // ms Pause am Start-Ort
  linger: 1600, // ms Pause an einem Hauptort
  lingerSub: 1200, // ms Pause an einem Ausflugsziel
  zoomPerLevel: 230, // ms pro Zoomstufe beim Rein- und Rauszoomen
  zoomMin: 900,
  zoomMax: 2600,
  travelBase: 2000, // ms Grunddauer der Fahrt
  travelPerKm: 0.5, // + ms pro Kilometer
  travelMin: 2500,
  travelMax: 7500,
  flyMin: 900, // freie Kamerafahrten
  flyMax: 4000,
};

// Während der Fahrt ist die Kamera an den Enden etwas näher dran als in der Mitte.
const TRAVEL_ZOOM_IN = 0.6;

const SEQUENCE = ['hold', 'rise', 'travel', 'descend', 'linger'];

export const SPEEDS = [1, 2, 4];

export function createPlayer(trip, view, onChange) {
  const legs = trip.legs;
  const state = {
    legIndex: 0, // aktuelle Etappe (in der Liste ALLER Etappen)
    phase: 'ready', // ready | fly | hold | rise | travel | descend | linger | arrived | done
    time: 0, // ms in der aktuellen Phase
    running: false, // läuft die Zeit gerade?
    autoContinue: false, // nach dem Abschnitt automatisch weiter?
    fresh: true, // Etappe neu begonnen (Start/Sprung) → von der Nahansicht aus starten
    speed: 1,
    fly: null, // freie Kamerafahrt: { from, target, duration, topZoom, then, thenTime }
  };

  view.setVehicle(legs[0], 0);

  const changed = () => onChange && onChange();
  const currentLeg = () => legs[state.legIndex];
  const isLastOfSegment = (leg) => leg.segment.legs[leg.segment.legs.length - 1] === leg;

  // Wird am Ziel dieser Etappe angehalten und reingezoomt?
  // (Nach einem Sprung immer am Ende des Abschnitts.)
  const pausesAtEnd = (leg) => leg.toPause || (!state.autoContinue && isLastOfSegment(leg));
  // Beginnt diese Etappe in der Nahansicht ihres Startorts?
  const startsAtCity = (leg) => state.fresh || leg.index === 0 || legs[leg.index - 1].toPause;

  // ---- Kamera-Einstellungen ------------------------------------------
  // Kamera während der Fahrt bei Fortschritt p: folgt dem Fahrzeug.
  function travelCamera(leg, p) {
    const pos = leg.at(p);
    return {
      center: [pos.lng, pos.lat],
      zoom: view.travelZoom(leg) + TRAVEL_ZOOM_IN * (1 - Math.sin(Math.PI * p)),
      pitch: 0,
      bearing: 0,
    };
  }

  const startCamera = (leg) =>
    startsAtCity(leg) ? view.cityCamera(leg.from) : travelCamera(legs[leg.index - 1], 1);
  const endCamera = (leg) => (pausesAtEnd(leg) ? view.cityCamera(leg.to) : travelCamera(leg, 1));

  // Zwei Einstellungen am selben Ort überblenden (nur Zoom und Neigung ändern sich).
  const blend = (a, b, e) => ({
    center: a.center,
    zoom: lerp(a.zoom, b.zoom, e),
    pitch: lerp(a.pitch, b.pitch, e),
    bearing: 0,
  });

  // Wo ist die Kamera in Phase "phase" bei Anteil k (0…1)?
  function cameraAt(phase, leg, k) {
    switch (phase) {
      case 'hold':
        return startCamera(leg);
      case 'rise':
        return blend(startCamera(leg), travelCamera(leg, 0), easeInOutCubic(k));
      case 'travel':
        return travelCamera(leg, vehicleProgress('travel', k));
      case 'descend':
        return blend(travelCamera(leg, 1), endCamera(leg), easeInOutCubic(k));
      default: // linger
        return endCamera(leg);
    }
  }

  // Wie weit ist das Fahrzeug? (0 = Start, 1 = Ziel)
  function vehicleProgress(phase, k) {
    if (phase === 'travel') return easeInOutSine(k); // sanft anfahren und bremsen
    return phase === 'descend' || phase === 'linger' ? 1 : 0;
  }

  // ---- Dauer der Phasen --------------------------------------------
  // Je größer der Zoom-Unterschied, desto länger. Kein Unterschied → 0 ms.
  function zoomDuration(a, b) {
    const levels = Math.abs(a.zoom - b.zoom) + Math.abs(a.pitch - b.pitch) / 30;
    return levels < 0.05 ? 0 : clamp(levels * TIMING.zoomPerLevel, TIMING.zoomMin, TIMING.zoomMax);
  }

  function phaseDuration(phase, leg) {
    switch (phase) {
      case 'hold':
        return TIMING.hold;
      case 'rise':
        return zoomDuration(startCamera(leg), travelCamera(leg, 0));
      case 'travel':
        if (leg.empty) return 300;
        return clamp(TIMING.travelBase + leg.km * TIMING.travelPerKm, TIMING.travelMin, TIMING.travelMax);
      case 'descend':
        return zoomDuration(travelCamera(leg, 1), endCamera(leg));
      default: // linger
        if (!pausesAtEnd(leg)) return 0;
        return leg.to.isSub ? TIMING.lingerSub : TIMING.linger;
    }
  }

  // ---- Freie Kamerafahrt ("fly") --------------------------------------
  // Ähnlich wie ein Flugzeug: erst hochziehen (rauszoomen), dann rüber,
  // dann wieder runter. topZoom = höchster Punkt der Fahrt.
  function startFly(target, then, thenTime = 0) {
    const from = view.getCamera();
    const to = target();
    const topZoom = Math.min(from.zoom, to.zoom, view.zoomToShow(from.center, to.center) - 0.2);
    const climb = from.zoom - topZoom + (to.zoom - topZoom);
    const angle = angleBetween(lngLat(from.center), lngLat(to.center));
    const nothingToDo =
      angle < 1e-5 && Math.abs(from.zoom - to.zoom) < 0.02 && Math.abs(from.pitch - to.pitch) < 0.5;

    state.phase = 'fly';
    state.time = 0;
    state.fly = {
      from,
      target,
      topZoom,
      then,
      thenTime,
      duration: nothingToDo ? 1 : clamp(600 + climb * 170 + angle * 700, TIMING.flyMin, TIMING.flyMax),
    };
  }

  function flyCamera(fly, k) {
    const to = fly.target();
    const e = easeInOutCubic(k);
    const ground = slerp(lngLat(fly.from.center), lngLat(to.center), e);
    const lowest = Math.min(fly.from.zoom, to.zoom);
    return {
      center: [ground.lng, ground.lat],
      zoom: lerp(fly.from.zoom, to.zoom, e) - (lowest - fly.topZoom) * Math.sin(Math.PI * k),
      pitch: lerp(fly.from.pitch, to.pitch, e),
      bearing: lerp(shortBearing(fly.from.bearing), to.bearing, e),
    };
  }

  // -----------------------------------------------------------------
  // Pro Bild aufgerufen. Rückgabe: Soll es weiterlaufen?
  // -----------------------------------------------------------------
  function update(dt) {
    if (!state.running) return false;
    state.time += dt * state.speed;

    if (state.phase === 'fly') {
      const k = Math.min(1, state.time / state.fly.duration);
      view.setCamera(flyCamera(state.fly, k));
      if (k >= 1) {
        const { then, thenTime } = state.fly;
        state.fly = null;
        if (then === 'done') {
          state.phase = 'done';
          state.running = false;
        } else {
          state.phase = then;
          state.time = thenTime;
        }
        changed();
      }
      return state.running;
    }

    // Phasen mit 0 ms (Durchfahrt) werden im selben Bild übersprungen.
    for (let guard = 0; guard < 8; guard++) {
      const leg = currentLeg();
      const duration = phaseDuration(state.phase, leg);
      const k = duration > 0 ? Math.min(1, state.time / duration) : 1;
      const p = vehicleProgress(state.phase, k);
      view.setCamera(cameraAt(state.phase, leg, k));
      view.setLegProgress(leg, p);
      view.setVehicle(leg, p);
      if (k < 1) break;
      nextPhase();
      if (!SEQUENCE.includes(state.phase)) break; // angekommen, fertig oder Kamerafahrt
    }
    return state.running;
  }

  function nextPhase() {
    const i = SEQUENCE.indexOf(state.phase);
    const leg = currentLeg();
    if (i < SEQUENCE.length - 1) {
      state.phase = SEQUENCE[i + 1];
      state.time = 0;
    } else if (!state.autoContinue && isLastOfSegment(leg)) {
      state.phase = 'arrived'; // nach einem Sprung: am Ende des Abschnitts stehen bleiben
      state.running = false;
    } else if (state.legIndex >= legs.length - 1) {
      startFly(() => view.overviewCamera(), 'done'); // Ende: ganze Route zeigen
    } else {
      state.legIndex += 1; // weiter mit der nächsten Etappe
      state.fresh = false;
      state.phase = 'rise';
      state.time = 0;
      view.setVehicle(currentLeg(), 0);
    }
    changed();
  }

  function setAllProgress(fromLegIndex) {
    legs.forEach((leg, i) => view.setLegProgress(leg, i < fromLegIndex ? 1 : 0));
    state.legIndex = fromLegIndex;
    state.fresh = true;
    view.setVehicle(legs[fromLegIndex], 0);
    view.syncRoute();
  }

  // -----------------------------------------------------------------
  // Steuerung von außen (Buttons, Etappenleiste, Touch)
  // -----------------------------------------------------------------
  function play() {
    if (state.phase === 'done') {
      setAllProgress(0);
      state.phase = 'ready';
    }
    state.running = true;
    state.autoContinue = true;
    const leg = currentLeg();

    if (state.phase === 'ready') {
      state.fresh = true;
      startFly(() => view.cityCamera(leg.from), 'hold');
    } else if (state.phase === 'arrived') {
      // Nach einem Sprung angekommen → mit der nächsten Etappe weitermachen.
      if (state.legIndex >= legs.length - 1) {
        startFly(() => view.overviewCamera(), 'done');
      } else {
        state.legIndex += 1;
        state.fresh = true; // die Kamera steht ja in der Nahansicht
        view.setVehicle(currentLeg(), 0);
        startFly(() => cameraAt('rise', currentLeg(), 0), 'rise');
      }
    } else if (state.phase === 'fly') {
      const { target, then, thenTime } = state.fly;
      startFly(target, then, thenTime); // neu starten – vielleicht wurde die Karte bewegt
    } else {
      // Mitten in einer Phase: Kamera (zurück) an die richtige Stelle holen.
      const phase = state.phase;
      const time = state.time;
      const duration = phaseDuration(phase, leg);
      const k = duration > 0 ? Math.min(1, time / duration) : 1;
      startFly(() => cameraAt(phase, leg, k), phase, time);
    }
    changed();
  }

  function pause() {
    if (!state.running) return;
    state.running = false;
    changed();
  }

  const toggle = () => (state.running ? pause() : play());

  // Zu einem Abschnitt springen (Hauptetappe oder Ausflug): Alles davor gilt
  // als gereist, dann wird dieser Abschnitt gezeigt. Lief die Reise schon,
  // geht es danach weiter.
  function jumpTo(segmentIndex) {
    const segment = trip.segments[segmentIndex];
    if (!segment) return;
    const first = segment.legs[0].index;
    const keepPlaying = state.running && state.autoContinue;
    setAllProgress(first);
    state.running = true;
    state.autoContinue = keepPlaying;
    startFly(() => view.cityCamera(legs[first].from), 'hold');
    changed();
  }

  function reset() {
    state.running = false;
    state.autoContinue = false;
    state.fly = null;
    setAllProgress(0);
    state.phase = 'ready';
    view.flyTo(view.overviewCamera(), 2200);
    changed();
  }

  function cycleSpeed() {
    state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
    changed();
  }

  // Gesamtfortschritt der Reise (0…1) für den Balken oben in der Leiste.
  const progress = () => legs.reduce((sum, leg) => sum + leg.progress, 0) / legs.length;

  // Zusammenfassung für die Oberfläche.
  function info() {
    const leg = currentLeg();
    // Besuchte Orte: der Start plus jedes Ziel einer fertigen Etappe
    const visitedPlaces = new Set([legs[0].from.place]);
    legs.forEach((l) => l.progress >= 1 && visitedPlaces.add(l.to.place));
    return {
      legIndex: state.legIndex,
      leg,
      segment: leg.segment,
      phase: state.phase,
      // Während einer freien Kamerafahrt zählt die Phase, die danach kommt.
      shownPhase: state.phase === 'fly' ? state.fly.then : state.phase,
      running: state.running,
      speed: state.speed,
      pausesHere: pausesAtEnd(leg), // wird am Ziel dieser Etappe angehalten?
      visitedPlaces,
      atStart: state.phase === 'ready' && state.legIndex === 0 && progress() === 0 && !state.running,
      progress: progress(),
    };
  }

  return { update, play, pause, toggle, jumpTo, reset, cycleSpeed, info, progress };
}

// [lng, lat] → { lat, lng }
const lngLat = ([lng, lat]) => ({ lat, lng });

// Kompasswinkel auf -180…180 bringen, damit die Kamera den kurzen Weg dreht.
const shortBearing = (b) => ((((b + 180) % 360) + 360) % 360) - 180;
