// =====================================================================
// geo.js – Mathe rund um die Erdkugel
// ---------------------------------------------------------------------
// Hier steckt nur reine Rechnerei, kein HTML und keine Karte.
// Koordinaten sind { lat, lng } in Grad:
//   lat = Breitengrad  (-90 Südpol … +90 Nordpol)
//   lng = Längengrad   (-180 … +180, positiv = östlich von Greenwich)
// Achtung: Kartenbibliotheken (und GeoJSON) schreiben Punkte als [lng, lat]
// – also Länge ZUERST. Das ist eine klassische Fehlerquelle.
// =====================================================================

export const EARTH_RADIUS_KM = 6371;
export const DEG = Math.PI / 180; // Umrechnung Grad → Bogenmaß

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

// Weiche Übergänge: langsam anfahren, langsam abbremsen.
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Breiten-/Längengrad → Punkt auf der Einheitskugel (x, y, z).
export function toVector(lat, lng) {
  const phi = lat * DEG;
  const lambda = lng * DEG;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

// Punkt im Raum → Breiten-/Längengrad.
export function toLatLng([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(clamp(z / r, -1, 1)) / DEG, lng: Math.atan2(y, x) / DEG };
}

// Winkel zwischen zwei Orten, vom Erdmittelpunkt aus gesehen (Bogenmaß).
// "Haversine-Formel" – rechnet auch bei sehr kurzen Strecken genau.
export function angleBetween(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Luftlinie in Kilometern.
export const distanceKm = (a, b) => angleBetween(a, b) * EARTH_RADIUS_KM;

// Punkt auf dem Großkreis zwischen a und b (t = 0 → a, t = 1 → b).
// Ein Großkreis ist die kürzeste Verbindung auf einer Kugel – so fliegen
// auch echte Flugzeuge. "slerp" = sphärische lineare Interpolation.
export function slerp(a, b, t) {
  const omega = angleBetween(a, b);
  if (omega < 1e-9) return { lat: a.lat, lng: a.lng };
  if (Math.PI - omega < 1e-6) b = { lat: b.lat, lng: b.lng + 0.01 }; // genau gegenüber
  const va = toVector(a.lat, a.lng);
  const vb = toVector(b.lat, b.lng);
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return toLatLng(va.map((v, i) => ka * v + kb * vb[i]));
}

// Kompass-Richtung von a nach b in Grad (0 = Norden, 90 = Osten).
export function bearing(a, b) {
  const phi1 = a.lat * DEG;
  const phi2 = b.lat * DEG;
  const dLambda = (b.lng - a.lng) * DEG;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

// Baut die Punkte einer Etappe entlang des Großkreises.
// bow > 0 biegt die Linie zusätzlich seitlich (Richtung Norden) aus –
// so sehen Flugrouten auf Karten typischerweise aus. bow = 0 → gerade.
// Ergebnis: [[lng, lat], …] im GeoJSON-Format.
export function buildRoutePoints(from, to, bow, segments) {
  const a = toVector(from.lat, from.lng);
  const b = toVector(to.lat, to.lng);
  const omega = angleBetween(from, to);

  // Senkrechte zur Strecke: das Kreuzprodukt a × b steht senkrecht auf der
  // Ebene des Großkreises. Wir drehen es so, dass es eher nach Norden zeigt.
  let side = normalize(cross(a, b));
  if (side[2] < 0) side = side.map((c) => -c);

  const maxOffset = Math.min(bow * omega, 5 * DEG); // höchstens 5° Ausbuchtung
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const g = slerp(from, to, t);
    const p = toVector(g.lat, g.lng);
    const offset = maxOffset * Math.sin(Math.PI * t);
    const moved = p.map((c, k) => Math.cos(offset) * c + Math.sin(offset) * side[k]);
    const { lat, lng } = toLatLng(moved);
    points.push([lng, lat]);
  }
  return unwrapLongitudes(points);
}

// Kreuzt eine Linie die Datumsgrenze (180°), springt die Länge von +179 auf
// -179. Karten würden dann einmal um die ganze Welt zeichnen. Deshalb zählen
// wir einfach weiter (…, 179, 181, …).
function unwrapLongitudes(points) {
  for (let i = 1; i < points.length; i++) {
    while (points[i][0] - points[i - 1][0] > 180) points[i][0] -= 360;
    while (points[i][0] - points[i - 1][0] < -180) points[i][0] += 360;
  }
  return points;
}

// Web-Mercator: die Projektion fast aller Online-Karten.
// [lng, lat] → [x, y] mit Werten 0…1 (ganze Welt = 1 × 1).
export function toMercator([lng, lat]) {
  const sinLat = Math.sin(clamp(lat, -85, 85) * DEG);
  return [lng / 360 + 0.5, 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)];
}

function fromMercator([x, y]) {
  return [(x - 0.5) * 360, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / DEG];
}

// Liefert eine Funktion at(f): Punkt bei Anteil f (0…1) der Streckenlänge,
// plus Fahrtrichtung. Die Länge wird wie in der Karte (Mercator) gemessen –
// so sitzt das Fahrzeug genau an der Spitze der wachsenden Linie.
export function createRouteSampler(points) {
  const merc = points.map(toMercator);
  const cumulative = [0];
  for (let i = 1; i < merc.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(merc[i][0] - merc[i - 1][0], merc[i][1] - merc[i - 1][1]));
  }
  const total = cumulative[cumulative.length - 1];

  return function at(fraction) {
    const target = clamp(fraction, 0, 1) * total;
    let lo = 0;
    let hi = merc.length - 1;
    while (hi - lo > 1) {
      // binäre Suche: in welchem Teilstück liegt target?
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    const segment = cumulative[hi] - cumulative[lo];
    const k = segment > 0 ? (target - cumulative[lo]) / segment : 0;
    const [lng, lat] = fromMercator([
      lerp(merc[lo][0], merc[hi][0], k),
      lerp(merc[lo][1], merc[hi][1], k),
    ]);
    const [lng1, lat1] = points[lo];
    const [lng2, lat2] = points[hi];
    return {
      lng,
      lat,
      heading: bearing({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }),
    };
  };
}

// Mittelpunkt mehrerer Orte (für die Übersichts-Ansicht).
export function centerOf(places) {
  const sum = [0, 0, 0];
  places.forEach(({ lat, lng }) => toVector(lat, lng).forEach((c, i) => (sum[i] += c)));
  if (Math.hypot(...sum) < 1e-9) return { lat: places[0].lat, lng: places[0].lng };
  return toLatLng(sum);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const len = Math.hypot(...v);
  return len < 1e-12 ? [0, 0, 1] : v.map((c) => c / len);
}
