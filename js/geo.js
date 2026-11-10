// =====================================================================
// geo.js – Mathe rund um die Erdkugel
// ---------------------------------------------------------------------
// Hier steckt nur reine Rechnerei, kein HTML und kein Globus.
// Koordinaten sind immer { lat, lng } in Grad:
//   lat = Breitengrad  (-90 Südpol … +90 Nordpol)
//   lng = Längengrad   (-180 … +180, positiv = östlich von Greenwich)
// Höhen ("alt") werden wie bei globe.gl in Erdradien angegeben:
//   alt 0 = Erdoberfläche, alt 1 = ein Erdradius (~6371 km) darüber.
// =====================================================================

export const EARTH_RADIUS_KM = 6371;
export const DEG = Math.PI / 180; // Umrechnung Grad → Bogenmaß

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

// Weiche Übergänge: langsam anfahren, langsam abbremsen.
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Breiten-/Längengrad → Punkt im Raum (x, y, z).
// radius 1 = Erdoberfläche. Für einen Punkt in der Höhe alt: radius = 1 + alt.
export function toVector(lat, lng, radius = 1) {
  const phi = lat * DEG;
  const lambda = lng * DEG;
  return [
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
  ];
}

// Punkt im Raum → Breiten-/Längengrad (+ Abstand zum Erdmittelpunkt).
export function toLatLng([x, y, z]) {
  const radius = Math.hypot(x, y, z);
  return {
    lat: Math.asin(clamp(z / radius, -1, 1)) / DEG,
    lng: Math.atan2(y, x) / DEG,
    radius,
  };
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
  // Genau gegenüberliegende Punkte haben unendlich viele kürzeste Wege –
  // dann schubsen wir b minimal zur Seite, damit es eindeutig wird.
  if (Math.PI - omega < 1e-6) b = { lat: b.lat, lng: b.lng + 0.01 };

  const va = toVector(a.lat, a.lng);
  const vb = toVector(b.lat, b.lng);
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  const { lat, lng } = toLatLng(va.map((v, i) => ka * v + kb * vb[i]));
  return { lat, lng };
}

// Baut die Punkte einer Etappe: entlang des Großkreises, mit einem Bogen
// nach oben (Sinuskurve). peak = höchste Stelle in Erdradien (0 = flach).
// Ergebnis: [[lat, lng, alt], …] – genau das Format, das globe.gl will.
export function buildArcPoints(from, to, peak, segments, baseAltitude = 0.004) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const { lat, lng } = slerp(from, to, t);
    points.push([lat, lng, baseAltitude + peak * Math.sin(Math.PI * t)]);
  }
  return points;
}

// Liefert eine Funktion at(f), die den Punkt bei Anteil f (0…1) der echten
// Streckenlänge zurückgibt. Wichtig: globe.gl misst gestrichelte Linien
// ebenfalls nach Streckenlänge – so sitzt das Flugzeug immer genau an der
// Spitze der leuchtenden Linie.
export function createPathSampler(points) {
  const vectors = points.map(([lat, lng, alt]) => toVector(lat, lng, 1 + alt));
  const cumulative = [0];
  for (let i = 1; i < vectors.length; i++) {
    cumulative.push(cumulative[i - 1] + distance3d(vectors[i - 1], vectors[i]));
  }
  const total = cumulative[cumulative.length - 1];

  return function at(fraction) {
    const target = clamp(fraction, 0, 1) * total;
    // Binäre Suche: in welchem Teilstück liegt target?
    let lo = 0;
    let hi = vectors.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    const segment = cumulative[hi] - cumulative[lo];
    const k = segment > 0 ? (target - cumulative[lo]) / segment : 0;
    const v = vectors[lo].map((c, i) => c + (vectors[hi][i] - c) * k);
    const { lat, lng, radius } = toLatLng(v);
    return { lat, lng, alt: radius - 1 };
  };
}

// Mittelpunkt mehrerer Orte (für die Übersichts-Ansicht).
export function centerOf(places) {
  const sum = [0, 0, 0];
  places.forEach(({ lat, lng }) => {
    toVector(lat, lng).forEach((c, i) => (sum[i] += c));
  });
  if (Math.hypot(...sum) < 1e-9) return { lat: places[0].lat, lng: places[0].lng };
  const { lat, lng } = toLatLng(sum);
  return { lat, lng };
}

// Ist Punkt p aus Sicht der Kamera hinter der Kugel (Radius r) versteckt?
// Idee: Wir schicken einen Strahl von der Kamera zum Punkt. Trifft er
// unterwegs die Kugel, ist der Punkt verdeckt.
export function isBehindSphere(p, camera, r) {
  const d = [p.x - camera.x, p.y - camera.y, p.z - camera.z];
  const c = [camera.x, camera.y, camera.z];
  const A = dot(d, d);
  const B = 2 * dot(c, d);
  const C = dot(c, c) - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return false; // Strahl verfehlt die Kugel
  const s = (-B - Math.sqrt(disc)) / (2 * A); // erster Treffer (0 = Kamera, 1 = Punkt)
  return s > 0 && s < 0.999;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distance3d(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
