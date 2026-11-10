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
  linger: 1600, // ms Pause am Ziel-Ort
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
    legIndex: 0, // aktuelle Etappe
    phase: 'ready', // ready | fly | hold | rise | travel | descend | linger | arrived | done
    time: 0, // ms in der aktuellen Phase
    running: false, // läuft die Zeit gerade?
    autoContinue: false, // nach der Etappe automatisch weiter?
    speed: 1,
    fly: null, // freie Kamerafahrt: { from, target, duration, topZoom, then, thenTime }
  };

  view.setVehicle(legs[0], 0);

  const changed = () => onChange && onChange();
  const currentLeg = () => legs[state.legIndex];

  // ---- Dauer der Phasen --------------------------------------------
  function zoomDuration(levels) {
    return clamp(Math.abs(levels) * TIMING.zoomPerLevel, TIMING.zoomMin, TIMING.zoomMax);
  }

  function phaseDuration(phase, leg) {
    switch (phase) {
      case 'hold':
        return TIMING.hold;
      case 'rise':
        return zoomDuration(view.cityCamera(leg.from).zoom - view.travelZoom(leg));
      case 'travel':
        if (leg.empty) return 300;
        return clamp(TIMING.travelBase + leg.km * TIMING.travelPerKm, TIMING.travelMin, TIMING.travelMax);
      case 'descend':
        return zoomDuration(view.cityCamera(leg.to).zoom - view.travelZoom(leg));
      default: // linger
        return TIMING.linger;
    }
  }

  // ---- Wo ist die Kamera in Phase "phase" bei Anteil k (0…1)? ---------
  function cameraAt(phase, leg, k) {
    const travelZoom = view.travelZoom(leg);
    if (phase === 'hold') return view.cityCamera(leg.from);
    if (phase === 'linger') return view.cityCamera(leg.to);

    if (phase === 'rise' || phase === 'descend') {
      // Zoomen über dem Ort: rise = raus, descend = rein (rückwärts gerechnet)
      const city = view.cityCamera(phase === 'rise' ? leg.from : leg.to);
      const e = easeInOutCubic(phase === 'rise' ? k : 1 - k);
      return {
        center: city.center,
        zoom: lerp(city.zoom, travelZoom + TRAVEL_ZOOM_IN, e),
        pitch: lerp(city.pitch, 0, e),
        bearing: 0,
      };
    }

    // travel: Kamera folgt dem Fahrzeug
    const p = vehicleProgress('travel', k);
    const pos = leg.at(p);
    return {
      center: [pos.lng, pos.lat],
      zoom: travelZoom + TRAVEL_ZOOM_IN * (1 - Math.sin(Math.PI * p)),
      pitch: 0,
      bearing: 0,
    };
  }

  // Wie weit ist das Fahrzeug? (0 = Start, 1 = Ziel)
  function vehicleProgress(phase, k) {
    if (phase === 'travel') return easeInOutSine(k); // sanft anfahren und bremsen
    return phase === 'descend' || phase === 'linger' ? 1 : 0;
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

    const leg = currentLeg();
    const k = Math.min(1, state.time / phaseDuration(state.phase, leg));
    const p = vehicleProgress(state.phase, k);
    view.setCamera(cameraAt(state.phase, leg, k));
    view.setLegProgress(leg, p);
    view.setVehicle(leg, p);
    if (k >= 1) nextPhase();
    return state.running;
  }

  function nextPhase() {
    const i = SEQUENCE.indexOf(state.phase);
    if (i < SEQUENCE.length - 1) {
      state.phase = SEQUENCE[i + 1];
      state.time = 0;
    } else if (!state.autoContinue) {
      state.phase = 'arrived'; // nach einem Sprung: am Ziel stehen bleiben
      state.running = false;
    } else if (state.legIndex >= legs.length - 1) {
      startFly(() => view.overviewCamera(), 'done'); // Ende: ganze Route zeigen
    } else {
      state.legIndex += 1; // weiter mit der nächsten Etappe
      state.phase = 'rise';
      state.time = 0;
      view.setVehicle(currentLeg(), 0);
    }
    changed();
  }

  function setAllProgress(fromIndex) {
    legs.forEach((leg, i) => view.setLegProgress(leg, i < fromIndex ? 1 : 0));
    state.legIndex = fromIndex;
    view.setVehicle(legs[fromIndex], 0);
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
      startFly(() => view.cityCamera(leg.from), 'hold');
    } else if (state.phase === 'arrived') {
      // Nach einem Sprung angekommen → mit der nächsten Etappe weitermachen.
      if (state.legIndex >= legs.length - 1) {
        startFly(() => view.overviewCamera(), 'done');
      } else {
        state.legIndex += 1;
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
      const k = Math.min(1, time / phaseDuration(phase, leg));
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

  // Zu einer Etappe springen: Alles davor gilt als gereist, dann wird diese
  // eine Etappe gezeigt. Lief die Reise schon, geht es danach weiter.
  function jumpTo(index) {
    if (index < 0 || index >= legs.length) return;
    const keepPlaying = state.running && state.autoContinue;
    setAllProgress(index);
    state.running = true;
    state.autoContinue = keepPlaying;
    startFly(() => view.cityCamera(legs[index].from), 'hold');
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
    const completed = legs.filter((leg) => leg.progress >= 1).length;
    return {
      legIndex: state.legIndex,
      phase: state.phase,
      // Während einer freien Kamerafahrt zählt die Phase, die danach kommt.
      shownPhase: state.phase === 'fly' ? state.fly.then : state.phase,
      running: state.running,
      speed: state.speed,
      leg: currentLeg(),
      completed,
      reachedStop: completed, // Stopp-Index, bis zu dem man gekommen ist
      atStart: state.phase === 'ready' && completed === 0 && state.legIndex === 0 && !state.running,
      progress: progress(),
    };
  }

  return { update, play, pause, toggle, jumpTo, reset, cycleSpeed, info, progress };
}

// [lng, lat] → { lat, lng }
const lngLat = ([lng, lat]) => ({ lat, lng });

// Kompasswinkel auf -180…180 bringen, damit die Kamera den kurzen Weg dreht.
const shortBearing = (b) => ((((b + 180) % 360) + 360) % 360) - 180;
