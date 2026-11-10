// =====================================================================
// player.js – der "Abspieler": WAS passiert WANN?
// ---------------------------------------------------------------------
// Die Reise läuft als kleine Zustandsmaschine. Jede Etappe durchläuft
// diese Phasen:
//
//   ready ──▶ approach ──▶ flight ──▶ arrival ──▶ (nächste Etappe)
//   bereit    Kamera       Fahrzeug    kurze        …nach der letzten
//             fährt hin    bewegt sich Pause        Etappe: finale ──▶ done
//
//   arrived = nach einem Sprung zu einer einzelnen Etappe angekommen
//             (wartet, bis ▶ gedrückt wird)
//
// update(dt) wird bei jedem Bild aufgerufen (ca. 60× pro Sekunde) und
// schiebt die Zeit weiter – aber nur, solange state.running true ist.
// =====================================================================

import { angleBetween, clamp, easeInOutCubic, easeInOutSine, lerp, slerp } from './geo.js';

const TIMING = {
  flightBase: 2200, // ms Grunddauer pro Etappe
  flightPerKm: 0.55, // + ms pro Kilometer
  flightMin: 2600,
  flightMax: 8000,
  arrivalPause: 750, // ms Pause am Zielort
  finale: 2600, // ms Kamerafahrt zur Gesamtansicht am Ende
};

const FOLLOW_MIN_ALTITUDE = 0.7; // näher ran wird die Erd-Textur unscharf

export const SPEEDS = [1, 2, 4];

export function createPlayer(trip, view, onChange) {
  const legs = trip.legs;
  const state = {
    legIndex: 0, // aktuelle Etappe
    phase: 'ready',
    running: false, // läuft die Zeit gerade?
    autoContinue: false, // nach der Etappe automatisch weiter?
    speed: 1,
    elapsed: 0, // ms in der aktuellen Phase (approach, arrival, finale)
    flightTime: 0, // ms, die die aktuelle Etappe schon läuft
    transition: null, // Kamerafahrt: { from, duration, hop }
  };

  view.setVehicle(legs[0], 0);

  const changed = () => onChange && onChange();
  const currentLeg = () => legs[state.legIndex];

  // Wie lange dauert eine Etappe? Längere Strecken dauern länger.
  function flightDuration(leg) {
    if (leg.empty) return 400;
    return clamp(TIMING.flightBase + leg.km * TIMING.flightPerKm, TIMING.flightMin, TIMING.flightMax);
  }

  // Wo soll die Kamera sein, wenn das Fahrzeug bei Fortschritt p ist?
  // Direkt darüber – in der Mitte der Etappe etwas höher (Überblick).
  function followPov(leg, p) {
    const pos = leg.at(p);
    const altitude = view.fitAltitude(leg.angle / 2) * (0.8 + 0.2 * Math.sin(Math.PI * p));
    return { lat: pos.lat, lng: pos.lng, altitude: Math.max(FOLLOW_MIN_ALTITUDE, altitude) };
  }

  // Eine weiche Kamerafahrt von "from" zu einem Ziel vorbereiten.
  // Bei weiten Sprüngen fliegt die Kamera dabei kurz höher ("hop").
  function makeTransition(from, to, minDuration = 400) {
    const angle = angleBetween(from, to);
    const zoom = Math.abs(Math.log((1 + to.altitude) / (1 + from.altitude)));
    return {
      from,
      duration: clamp(500 + angle * 800 + zoom * 900, minDuration, 2600),
      hop: angle > 0.35 ? clamp(angle * 0.5, 0, 1.4) : 0,
    };
  }

  function mixPov(a, b, t, hop) {
    const ground = slerp(a, b, t);
    return {
      lat: ground.lat,
      lng: ground.lng,
      altitude: lerp(a.altitude, b.altitude, t) + hop * Math.sin(Math.PI * t),
    };
  }

  function beginApproach() {
    const leg = currentLeg();
    state.phase = 'approach';
    state.elapsed = 0;
    state.transition = makeTransition(view.getCamera(), followPov(leg, leg.progress));
  }

  // -----------------------------------------------------------------
  // Pro Bild aufgerufen
  // -----------------------------------------------------------------
  function update(dt) {
    if (!state.running) return;
    dt *= state.speed;
    const leg = currentLeg();

    switch (state.phase) {
      case 'approach': {
        state.elapsed += dt;
        const k = Math.min(1, state.elapsed / state.transition.duration);
        const target = followPov(leg, leg.progress);
        view.setCamera(mixPov(state.transition.from, target, easeInOutCubic(k), state.transition.hop));
        if (k >= 1) {
          state.phase = 'flight';
          changed();
        }
        break;
      }

      case 'flight': {
        state.flightTime += dt;
        const t = Math.min(1, state.flightTime / flightDuration(leg));
        const p = easeInOutSine(t); // sanft starten und landen
        view.setLegProgress(leg, p);
        view.setVehicle(leg, p);
        view.setCamera(followPov(leg, p));
        if (t >= 1) {
          state.phase = 'arrival';
          state.elapsed = 0;
          changed();
        }
        break;
      }

      case 'arrival': {
        state.elapsed += dt;
        if (state.elapsed >= TIMING.arrivalPause) {
          if (state.autoContinue) nextLeg();
          else {
            state.phase = 'arrived';
            state.running = false;
          }
          changed();
        }
        break;
      }

      case 'finale': {
        state.elapsed += dt;
        const k = Math.min(1, state.elapsed / state.transition.duration);
        view.setCamera(mixPov(state.transition.from, view.overviewPov(), easeInOutCubic(k), 0));
        if (k >= 1) {
          state.phase = 'done';
          state.running = false;
          changed();
        }
        break;
      }
    }
  }

  function nextLeg() {
    if (state.legIndex >= legs.length - 1) {
      // Letzte Etappe geschafft → zum Abschluss die ganze Route zeigen.
      state.phase = 'finale';
      state.elapsed = 0;
      state.transition = { from: view.getCamera(), duration: TIMING.finale, hop: 0 };
      return;
    }
    state.legIndex += 1;
    state.flightTime = 0;
    view.setVehicle(currentLeg(), 0);
    beginApproach();
  }

  function setAllProgress(fromIndex) {
    legs.forEach((leg, i) => view.setLegProgress(leg, i < fromIndex ? 1 : 0));
    state.legIndex = fromIndex;
    state.flightTime = 0;
    view.setVehicle(legs[fromIndex], 0);
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
    switch (state.phase) {
      case 'arrived':
        nextLeg();
        break;
      case 'finale':
        state.elapsed = 0;
        state.transition = { from: view.getCamera(), duration: TIMING.finale, hop: 0 };
        break;
      case 'arrival':
        break; // läuft einfach weiter
      default:
        // ready, approach oder flight: Kamera (zurück) zum Fahrzeug holen –
        // vielleicht hat jemand den Globus inzwischen gedreht.
        beginApproach();
    }
    changed();
  }

  function pause() {
    if (!state.running) return;
    state.running = false;
    changed();
  }

  const toggle = () => (state.running ? pause() : play());

  // Zu einer Etappe springen: Alles davor gilt als gereist, dann wird
  // diese eine Etappe gezeigt. Lief die Reise schon, geht es danach weiter.
  function jumpTo(index) {
    if (index < 0 || index >= legs.length) return;
    const keepPlaying = state.running && state.autoContinue;
    setAllProgress(index);
    state.running = true;
    state.autoContinue = keepPlaying;
    beginApproach();
    changed();
  }

  function reset() {
    state.running = false;
    state.autoContinue = false;
    setAllProgress(0);
    state.phase = 'ready';
    view.flyTo(view.overviewPov(), 1600);
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
      ...state,
      leg: currentLeg(),
      completed,
      reachedStop: completed, // Stopp-Index, bis zu dem man gekommen ist
      atStart: state.phase === 'ready' && completed === 0 && state.legIndex === 0 && !state.running,
      progress: progress(),
    };
  }

  return { update, play, pause, toggle, jumpTo, reset, cycleSpeed, info, progress };
}
