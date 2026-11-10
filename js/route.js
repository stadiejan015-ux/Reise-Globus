// =====================================================================
// route.js – route.json laden, prüfen und in Etappen umrechnen
// ---------------------------------------------------------------------
// Ergebnis von loadTrip():
//   title     – Titel der Reise
//   stops     – die Hauptstopps in Reihenfolge (wie in route.json), jeder
//               mit seinen Unterpunkten (stop.subs)
//   legs      – alle Etappen in Reiseordnung, auch die der Ausflüge
//   segments  – Abschnitte für die Leiste unten: eine Hauptetappe ODER ein
//               ganzer Ausflug (hin und zurück)
//   places    – Orte für die Marker (ein Ort, der mehrmals vorkommt –
//               z. B. Konstanz als Start und Ziel – bekommt nur EINEN Marker)
//   warnings  – Hinweise zu kleinen Problemen in route.json
// =====================================================================

import {
  angleBetween,
  buildRoutePoints,
  clamp,
  createRouteSampler,
  DEG,
  distanceKm,
  toMercator,
} from './geo.js';
import { TRANSPORT, resolveTransportKey } from './transport.js';

// Ein Fehler, den wir der Person verständlich anzeigen können.
export class RouteError extends Error {
  constructor(message, hint = '') {
    super(message);
    this.hint = hint;
  }
}

const JSON_HINT =
  'Häufige Ursachen: ein fehlendes Komma zwischen zwei Stopps, ein Komma nach dem ' +
  'letzten Eintrag oder typografische Anführungszeichen („ “) statt normaler (").';

export async function loadTrip(url) {
  let response;
  try {
    // "no-cache": Nach einer Änderung an route.json wird immer die neue Version geholt.
    response = await fetch(url, { cache: 'no-cache' });
  } catch (err) {
    throw new RouteError(
      'route.json konnte nicht geladen werden.',
      'Die Seite muss über einen Webserver laufen (z. B. GitHub Pages). Direkt als Datei geöffnet klappt es nicht.'
    );
  }
  if (!response.ok) {
    throw new RouteError(`route.json wurde nicht gefunden (Fehler ${response.status}).`);
  }
  const data = parseJson(await response.text());
  return buildTrip(data);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    // Die iPad-Tastatur ersetzt " gern durch „ oder “. Wir versuchen eine Reparatur.
    try {
      const repaired = JSON.parse(text.replace(/[“”„‟]/g, '"'));
      console.warn('route.json: typografische Anführungszeichen wurden automatisch ersetzt.');
      return repaired;
    } catch {
      const guess = guessJsonProblem(text);
      throw new RouteError(
        guess ? `route.json enthält einen Tippfehler: ${guess}` : `route.json enthält einen Tippfehler (${err.message}).`,
        JSON_HINT
      );
    }
  }
}

// Safari nennt bei JSON-Fehlern keine Zeilennummer. Wir suchen selbst nach
// den typischen Fehlern und sagen, in welcher Zeile sie ungefähr stecken.
function guessJsonProblem(text) {
  const checks = [
    [/\}\s*\{/, 'Zwischen zwei Stopps fehlt ein Komma'],
    [/(["\d]|true|false|null)[ \t]*\r?\n\s*"/, 'Am Ende einer Zeile fehlt ein Komma'],
    [/,\s*[}\]]/, 'Nach dem letzten Eintrag steht ein Komma zu viel'],
  ];
  for (const [pattern, message] of checks) {
    const match = pattern.exec(text);
    if (match) {
      const line = text.slice(0, match.index + 1).split('\n').length;
      return `${message} (ungefähr Zeile ${line}).`;
    }
  }
  return '';
}

export function buildTrip(data) {
  const warnings = [];
  const rawStops = Array.isArray(data) ? data : data && data.stopps;

  if (!Array.isArray(rawStops) || rawStops.length < 2) {
    throw new RouteError(
      'In route.json braucht es eine Liste "stopps" mit mindestens zwei Orten.'
    );
  }

  // ---- Stopps prüfen --------------------------------------------------
  const stops = rawStops.map((raw, index) => {
    const label = `Stopp ${index + 1}`;
    const stop = readPoint(raw, label, index > 0 ? 'flugzeug' : null, warnings);
    stop.index = index;
    stop.isSub = false;
    stop.subs = readSubPoints(raw.unterpunkte, stop, label, warnings);
    return stop;
  });

  // ---- Etappen berechnen ---------------------------------------------
  // Hauptetappen verbinden die Stopps. Hat ein Stopp Unterpunkte, kommt
  // danach ein Ausflug: hin zu den Unterpunkten und auf demselben Weg zurück.
  //   Phnom Penh → Sihanoukville → Koh Rong → Sihanoukville → Phnom Penh
  // Jede Etappe merkt sich, ob am Ziel angehalten und reingezoomt wird
  // (toPause). Auf dem Rückweg fährt sie einfach durch.
  const legs = [];
  const segments = []; // für die Leiste unten: Hauptetappe oder ganzer Ausflug

  function addLeg(from, to, transportKey, extra) {
    const transport = TRANSPORT[transportKey];
    const angle = angleBetween(from, to); // Bogenmaß
    const km = distanceKm(from, to);
    if (km < 1) warnings.push(`${from.name} und ${to.name} liegen am selben Ort – diese Etappe wird übersprungen.`);

    // Flüge biegen sich als Bogen aus, Auto und Boot fahren gerade.
    // Ein Punkt pro halbem Grad (mindestens 32) sorgt für eine glatte Linie.
    const steps = Math.round(clamp((angle / DEG) * 2, 32, 360));
    const points = buildRoutePoints(from, to, transport.bow, steps);
    const leg = {
      index: legs.length,
      from,
      to,
      transportKey,
      transport,
      angle,
      km,
      empty: km < 1,
      points, // [[lng, lat], …] für die Karte
      at: createRouteSampler(points), // at(0…1) → Position + Fahrtrichtung
      extent: extentOf(points), // Ausdehnung in Mercator-Koordinaten (für den Zoom)
      progress: 0, // 0 = noch nicht gereist, 1 = fertig
      toPause: true, // am Ziel anhalten und reinzoomen?
      ...extra,
    };
    legs.push(leg);
    return leg;
  }

  stops.forEach((stop, i) => {
    if (i > 0) {
      const leg = addLeg(stops[i - 1], stop, stop.transport, { isExcursion: false });
      const segment = { index: segments.length, kind: 'main', number: i, legs: [leg] };
      leg.segment = segment;
      segments.push(segment);
    }
    if (stop.subs.length) {
      const route = [stop, ...stop.subs];
      const tripLegs = [];
      // hin …
      for (let k = 1; k < route.length; k++) {
        tripLegs.push(addLeg(route[k - 1], route[k], route[k].transport, { isExcursion: true }));
      }
      // … und denselben Weg zurück (gleiche Verkehrsmittel, ohne Halt)
      for (let k = route.length - 1; k > 0; k--) {
        tripLegs.push(addLeg(route[k], route[k - 1], route[k].transport, { isExcursion: true, toPause: false }));
      }
      // Alle Etappen eines Ausflugs teilen sich einen Kartenausschnitt
      // ("Region"), damit die Kamera im Land bleibt.
      const region = mergeExtents(tripLegs.map((leg) => leg.extent));
      const segment = { index: segments.length, kind: 'excursion', base: stop, subs: stop.subs, legs: tripLegs };
      tripLegs.forEach((leg) => {
        leg.region = region;
        leg.segment = segment;
      });
      segments.push(segment);
    }
  });

  if (!legs.length) throw new RouteError('In route.json braucht es mindestens zwei Stopps.');
  legs[legs.length - 1].toPause = true; // ganz am Ende immer anhalten

  // ---- Orte für die Marker (doppelte zusammenfassen) -----------------
  const places = [];
  const allPoints = stops.flatMap((stop) => [stop, ...stop.subs]);
  allPoints.forEach((point) => {
    let place = places.find(
      (p) => p.name.toLowerCase() === point.name.toLowerCase() && distanceKm(p, point) < 25
    );
    if (!place) {
      place = { name: point.name, country: point.country, lat: point.lat, lng: point.lng, stops: [], subVisits: [] };
      places.push(place);
    }
    if (point.isSub) place.subVisits.push(point);
    else place.stops.push(point);
    point.place = place;
  });
  places.forEach((place) => (place.isSub = place.stops.length === 0));

  return {
    title: String((data && data.titel) || 'Meine Weltreise'),
    stops,
    legs,
    segments,
    places,
    mainLegCount: stops.length - 1,
    excursionCount: segments.filter((s) => s.kind === 'excursion').length,
    totalKm: legs.reduce((sum, leg) => sum + leg.km, 0),
    isRoundTrip: stops[0].place === stops[stops.length - 1].place,
    warnings,
  };
}

// Liest einen Ort (Stopp oder Unterpunkt) aus route.json und prüft ihn.
function readPoint(raw, label, defaultTransport, warnings) {
  if (!raw || typeof raw !== 'object') {
    throw new RouteError(`${label} ist kein gültiger Eintrag.`);
  }
  const name = String(raw.ort || '').trim();
  if (!name) throw new RouteError(`${label}: Das Feld "ort" fehlt oder ist leer.`);

  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (raw.lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RouteError(`${label} (${name}): "lat" muss eine Zahl zwischen -90 und 90 sein.`);
  }
  if (raw.lng === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RouteError(`${label} (${name}): "lng" muss eine Zahl zwischen -180 und 180 sein.`);
  }

  // Womit man HIERHER reist (beim allerersten Stopp egal)
  let transport = resolveTransportKey(raw.verkehrsmittel);
  if (!transport && defaultTransport) {
    if (raw.verkehrsmittel) {
      warnings.push(
        `${label} (${name}): Verkehrsmittel „${raw.verkehrsmittel}“ kenne ich nicht – ich nehme ${TRANSPORT[defaultTransport].name}. ` +
          `Möglich sind: ${Object.keys(TRANSPORT).join(', ')}.`
      );
    }
    transport = defaultTransport;
  }

  // Optional: eigene Zoomstufe für die Nahansicht (z. B. 8 = weiter weg, 12 = näher dran)
  let zoom = null;
  if (raw.zoom !== undefined && raw.zoom !== '') {
    zoom = Number(raw.zoom);
    if (!Number.isFinite(zoom) || zoom < 2 || zoom > 16) {
      warnings.push(`${label} (${name}): "zoom" sollte eine Zahl zwischen 2 und 16 sein – ich nehme den Standard.`);
      zoom = null;
    }
  }

  return {
    name,
    country: String(raw.land || '').trim(),
    lat,
    lng,
    zoom,
    transport,
    date: String(raw.datum || '').trim(),
    note: String(raw.notiz || '').trim(),
  };
}

// Liest die Unterpunkte (Ausflüge) eines Stopps.
function readSubPoints(list, parent, label, warnings) {
  if (list === undefined || list === null || list === '') return [];
  if (!Array.isArray(list)) {
    warnings.push(`${label} (${parent.name}): "unterpunkte" muss eine Liste [ … ] sein – ich ignoriere sie.`);
    return [];
  }
  return list.map((raw, j) => {
    const sub = readPoint(raw, `${label} (${parent.name}), Unterpunkt ${j + 1}`, 'auto', warnings);
    sub.isSub = true;
    sub.parent = parent;
    sub.country = sub.country || parent.country;
    sub.subs = [];
    return sub;
  });
}

// Ausdehnung einer Linie in Mercator-Koordinaten (0…1).
function extentOf(points) {
  const merc = points.map(toMercator);
  return {
    minX: Math.min(...merc.map((m) => m[0])),
    maxX: Math.max(...merc.map((m) => m[0])),
    minY: Math.min(...merc.map((m) => m[1])),
    maxY: Math.max(...merc.map((m) => m[1])),
  };
}

function mergeExtents(extents) {
  return {
    minX: Math.min(...extents.map((e) => e.minX)),
    maxX: Math.max(...extents.map((e) => e.maxX)),
    minY: Math.min(...extents.map((e) => e.minY)),
    maxY: Math.max(...extents.map((e) => e.maxY)),
  };
}
