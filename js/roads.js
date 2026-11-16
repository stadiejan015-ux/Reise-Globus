// =====================================================================
// roads.js – Straßenverlauf für Auto-Etappen
// ---------------------------------------------------------------------
// Auto-Etappen sollen echten Straßen folgen statt einer geraden Linie.
// Dafür fragt der Browser einen kostenlosen Routing-Dienst, der aus
// OpenStreetMap-Daten den Weg berechnet (dieselbe Technik, die
// openstreetmap.org für "Route berechnen" nutzt).
//
//  • Hin- und Rückweg nutzen dieselbe Route → nur eine Anfrage pro Strecke.
//  • Das Ergebnis wird im Browser gespeichert. Beim nächsten Öffnen wird
//    nicht mehr gefragt (erst wieder, wenn sich Koordinaten ändern).
//  • Klappt die Abfrage nicht (offline, Dienst nicht erreichbar, keine
//    Straße vorhanden), bleibt es bei der geraden Linie.
// =====================================================================

// Zwei Dienste mit derselben Schnittstelle (OSRM). Der zweite springt ein,
// wenn der erste nicht antwortet.
const SERVICES = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/',
];
const TIMEOUT_MS = 5000; // höchstens so lange auf eine Antwort warten
const BUDGET_MS = 8000; // insgesamt nie länger als das (sonst hängt der Ladebildschirm)
const CACHE_KEY = 'reise-globus-strassen-v1';

// Schlüssel für eine Strecke – für Hin- und Rückweg gleich.
const pointKey = (p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
const pairKey = (a, b) => [pointKey(a), pointKey(b)].sort().join(';');

// Holt die Straßenrouten für eine Liste von Strecken [[von, nach], …].
// Ergebnis: { getRoad(von, nach) → { points, km } | null, failed: [...] }
export async function loadRoadRoutes(pairs) {
  const cache = readCache();
  const routes = new Map(); // pairKey → { from: pointKey, points, km }
  const failed = [];
  const tried = new Set();
  const deadline = performance.now() + BUDGET_MS;

  for (const [a, b] of pairs) {
    const key = pairKey(a, b);
    if (tried.has(key)) continue; // z. B. der Rückweg derselben Strecke
    tried.add(key);
    if (cache[key]) {
      routes.set(key, cache[key]);
      continue;
    }
    // nacheinander fragen – schont die kostenlosen Dienste
    const route = performance.now() < deadline ? await requestRoute(a, b, deadline) : null;
    if (route) {
      routes.set(key, route);
      cache[key] = route;
    } else {
      failed.push(`${a.name} ⇄ ${b.name}`);
    }
  }
  writeCache(cache);

  // Route in der richtigen Richtung liefern (Rückweg = umgedreht).
  function getRoad(from, to) {
    const route = routes.get(pairKey(from, to));
    if (!route) return null;
    const points = route.from === pointKey(from) ? route.points : [...route.points].reverse();
    return { points, km: route.km };
  }

  return { getRoad, failed };
}

async function requestRoute(a, b, deadline) {
  for (const base of SERVICES) {
    const timeLeft = deadline - performance.now();
    if (timeLeft <= 0) break;
    const url = `${base}${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, timeLeft));
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;
      const data = await response.json();
      const route = data && data.code === 'Ok' && data.routes && data.routes[0];
      const coords = route && route.geometry && route.geometry.coordinates;
      if (!coords || coords.length < 2) continue; // z. B. "NoRoute": keine Straße
      return {
        from: pointKey(a),
        points: simplify(coords, 0.0004), // ~40 m Genauigkeit reicht für die Karte
        km: route.distance / 1000,
      };
    } catch (error) {
      console.warn('Straßenroute nicht geladen:', url, error);
    }
  }
  return null;
}

// Douglas-Peucker: lässt Punkte weg, die kaum von der Linie abweichen.
// Aus ein paar tausend Straßenpunkten werden so wenige hundert.
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Abstand eines Punktes zu einer Strecke, in Grad (Länge mit cos(Breite) gestaucht).
function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const k = Math.cos((py * Math.PI) / 180);
  const dx = (bx - ax) * k;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? (((px - ax) * k) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot((px - ax) * k - t * dx, py - ay - t * dy);
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Speichern nicht möglich (privater Modus) – dann wird beim nächsten Mal neu gefragt.
  }
}
