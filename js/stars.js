// =====================================================================
// stars.js – Sternenhimmel im Hintergrund
// ---------------------------------------------------------------------
// Die Sterne werden einmal auf ein <canvas> gemalt (statt eines großen
// Bildes). Das ist gestochen scharf auf Retina-Displays und kostet beim
// Drehen des Globus keine Rechenzeit.
// =====================================================================

export function drawStars(canvas) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const random = seededRandom(20240607); // immer derselbe Himmel
  const count = Math.round((width * height) / 1600);
  const tints = ['255,255,255', '200,220,255', '255,236,210', '210,200,255'];

  for (let i = 0; i < count; i++) {
    const x = random() * width;
    const y = random() * height;
    const size = Math.pow(random(), 4) * 1.5 + 0.3; // viele kleine, wenige große
    const alpha = 0.25 + random() * 0.7;
    ctx.fillStyle = `rgba(${tints[Math.floor(random() * tints.length)]},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Ein paar helle Sterne bekommen einen kleinen Schimmer.
    if (size > 1.35) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
      glow.addColorStop(0, `rgba(200,220,255,${(alpha * 0.35).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, size * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Zufallszahlen, die bei jedem Laden gleich sind (damit der Himmel nicht springt).
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
