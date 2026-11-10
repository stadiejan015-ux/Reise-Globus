// =====================================================================
// route.js – route.json laden, prüfen und in Etappen umrechnen
// ---------------------------------------------------------------------
// Ergebnis von loadTrip():
//   title     – Titel der Reise
//   stops     – alle Stopps in Reihenfolge (wie in route.json)
//   legs      – Etappen: immer von einem Stopp zum nächsten
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

    let transport = resolveTransportKey(raw.verkehrsmittel);
    if (index > 0 && !transport) {
      if (raw.verkehrsmittel) {
        warnings.push(
          `${label} (${name}): Verkehrsmittel „${raw.verkehrsmittel}“ kenne ich nicht – ich nehme Flugzeug. ` +
            `Möglich sind: ${Object.keys(TRANSPORT).join(', ')}.`
        );
      }
      transport = 'flugzeug';
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
      index,
      name,
      country: String(raw.land || '').trim(),
      lat,
      lng,
      zoom,
      transport, // womit man HIERHER reist (beim ersten Stopp egal)
      date: String(raw.datum || '').trim(),
      note: String(raw.notiz || '').trim(),
    };
  });

  // ---- Etappen berechnen ---------------------------------------------
  const legs = [];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    const transport = TRANSPORT[to.transport];
    const angle = angleBetween(from, to); // Bogenmaß
    const km = distanceKm(from, to);

    if (km < 1) {
      warnings.push(`Stopp ${i} und ${i + 1} liegen am selben Ort – diese Etappe wird übersprungen.`);
    }

    // Flüge biegen sich als Bogen aus, Auto und Boot fahren gerade.
    // Ein Punkt pro halbem Grad sorgt für eine glatte Kurve.
    const segments = Math.round(clamp((angle / DEG) * 2, 32, 360));
    const points = buildRoutePoints(from, to, transport.bow, segments);
    const merc = points.map(toMercator);

    legs.push({
      index: i - 1,
      from,
      to,
      transportKey: to.transport,
      transport,
      angle,
      km,
      empty: km < 1,
      points, // [[lng, lat], …] für die Karte
      at: createRouteSampler(points), // at(0…1) → Position + Fahrtrichtung
      // Ausdehnung in Mercator-Koordinaten (0…1), um die Zoomstufe zu berechnen
      extent: {
        minX: Math.min(...merc.map((m) => m[0])),
        maxX: Math.max(...merc.map((m) => m[0])),
        minY: Math.min(...merc.map((m) => m[1])),
        maxY: Math.max(...merc.map((m) => m[1])),
      },
      progress: 0, // 0 = noch nicht gereist, 1 = fertig
    });
  }

  // ---- Orte für die Marker (doppelte zusammenfassen) -----------------
  const places = [];
  stops.forEach((stop) => {
    let place = places.find(
      (p) => p.name.toLowerCase() === stop.name.toLowerCase() && distanceKm(p, stop) < 25
    );
    if (!place) {
      place = { name: stop.name, country: stop.country, lat: stop.lat, lng: stop.lng, stops: [] };
      places.push(place);
    }
    place.stops.push(stop);
    stop.place = place;
  });

  return {
    title: String((data && data.titel) || 'Meine Weltreise'),
    stops,
    legs,
    places,
    totalKm: legs.reduce((sum, leg) => sum + leg.km, 0),
    isRoundTrip: stops[0].place === stops[stops.length - 1].place,
    warnings,
  };
}
