// =====================================================================
// transport.js – Verkehrsmittel und Icons
// ---------------------------------------------------------------------
// Jedes Verkehrsmittel hat:
//   name     – Anzeigename
//   color    – Akzentfarbe (Etappenleiste, Infokarte)
//   glow     – Farbe des breiten "Leucht-Saums" der gereisten Linie
//   core     – Farbe des hellen Kerns der Linie
//   arc      – true: Bogen hoch über dem Globus (Flug)
//              false: flach an der Oberfläche (Auto, Boot)
//   vehicle  – SVG von oben gesehen, Spitze zeigt nach oben. Es wird
//              automatisch in Fahrtrichtung gedreht.
//   icon     – kleines Symbol für Leiste und Karte
//
// Neues Verkehrsmittel (z. B. Zug)? Einfach unten einen weiteren Eintrag
// "zug: { … }" anlegen und in route.json "verkehrsmittel": "zug" schreiben.
// =====================================================================

const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${inner}</svg>`;

// --- Fahrzeuge (Draufsicht, Spitze nach oben) -------------------------

const PLANE_PATH =
  'M12 1.6c.9 0 1.6.9 1.6 2.1v5.6l7.9 4.7c.3.2.5.5.5.9v1.4c0 .4-.4.7-.8.6l-7.6-2.3v4.9' +
  'l2.1 1.6c.2.1.3.3.3.5v1.2c0 .3-.3.5-.6.4L12 22.1l-3.4 1.1c-.3.1-.6-.1-.6-.4v-1.2' +
  'c0-.2.1-.4.3-.5l2.1-1.6v-4.9l-7.6 2.3c-.4.1-.8-.2-.8-.6v-1.4c0-.4.2-.7.5-.9l7.9-4.7' +
  'V3.7c0-1.2.7-2.1 1.6-2.1z';

const VEHICLE_PLANE = svg(`<path fill="currentColor" d="${PLANE_PATH}"/>`);

const VEHICLE_CAR = svg(`
  <rect x="5.6" y="8.4" width="1.6" height="1.3" rx=".6" fill="currentColor"/>
  <rect x="16.8" y="8.4" width="1.6" height="1.3" rx=".6" fill="currentColor"/>
  <rect x="7" y="2" width="10" height="20" rx="4" fill="currentColor"/>
  <path d="M8.3 8.8Q12 7.3 15.7 8.8L14.8 11.4Q12 10.6 9.2 11.4Z" fill="#0b1020" opacity=".75"/>
  <path d="M9.2 16.6Q12 17.3 14.8 16.6L15.4 18.8Q12 19.9 8.6 18.8Z" fill="#0b1020" opacity=".75"/>
  <rect x="8.2" y="2.7" width="2.1" height="1.1" rx=".5" fill="#fff4c2"/>
  <rect x="13.7" y="2.7" width="2.1" height="1.1" rx=".5" fill="#fff4c2"/>`);

const VEHICLE_BOAT = svg(`
  <path d="M12 1.5C15 4 17 8 17 12.5V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7.5C7 8 9 4 12 1.5Z" fill="currentColor"/>
  <rect x="9.3" y="11" width="5.4" height="6.6" rx="1.2" fill="#0b1020" opacity=".7"/>
  <path d="M12 4.6V9" stroke="#0b1020" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round"/>`);

// --- Kleine Symbole (Seitenansicht) -----------------------------------

const ICON_PLANE = svg(`<path fill="currentColor" d="${PLANE_PATH}" transform="rotate(90 12 12)"/>`);

const ICON_CAR = svg(`<path fill="currentColor" d="M5.2 10.2 6.8 6.1A2 2 0 0 1 8.7 4.8h6.6a2 2 0 0 1 1.9 1.3l1.6 4.1A2.5 2.5 0 0 1 20.5 12.6V17a1 1 0 0 1-1 1h-.8v1.2a1.3 1.3 0 0 1-2.6 0V18H7.9v1.2a1.3 1.3 0 0 1-2.6 0V18h-.8a1 1 0 0 1-1-1v-4.4a2.5 2.5 0 0 1 1.7-2.4Zm2-.3h9.6l-1.2-3.1a.6.6 0 0 0-.5-.4H8.9a.6.6 0 0 0-.5.4L7.2 9.9ZM7 15.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Zm10 0a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/>`);

const ICON_BOAT = svg(`<path fill="currentColor" d="M11 2.5a1 1 0 0 1 2 0V4h3a1.5 1.5 0 0 1 1.5 1.5v3.6l2 .7a1 1 0 0 1 .6 1.3L18 17.2c-1.1-.2-2.1-.8-2.8-1.6a1.2 1.2 0 0 0-1.8 0 3.6 3.6 0 0 1-2.8 1.3 3.6 3.6 0 0 1-2.8-1.3 1.2 1.2 0 0 0-1.8 0c-.6.7-1.4 1.2-2.3 1.5L2.9 11.1a1 1 0 0 1 .6-1.3l2-.7V5.5A1.5 1.5 0 0 1 7 4h4V2.5ZM7.5 6v2.4l4.2-1.5a1 1 0 0 1 .6 0l4.2 1.5V6h-9ZM3 20.2c1.4 0 2.6-.5 3.6-1.3 2 1.7 4.8 1.7 6.8 0 1 .8 2.2 1.3 3.6 1.3h1a1 1 0 1 1 0 2h-1a7.3 7.3 0 0 1-3.6-1 7.5 7.5 0 0 1-6.8 0 7.3 7.3 0 0 1-3.6 1H2a1 1 0 1 1 0-2h1Z"/>`);

// --- Die Verkehrsmittel ----------------------------------------------

export const TRANSPORT = {
  flugzeug: {
    name: 'Flugzeug',
    color: '#ffb347',
    glow: '#f0821c',
    core: '#fff3d6',
    arc: true,
    vehicle: VEHICLE_PLANE,
    icon: ICON_PLANE,
  },
  auto: {
    name: 'Auto',
    color: '#6fdc8c',
    glow: '#25a552',
    core: '#e8ffee',
    arc: false,
    vehicle: VEHICLE_CAR,
    icon: ICON_CAR,
  },
  boot: {
    name: 'Boot',
    color: '#5ac8fa',
    glow: '#1b86d1',
    core: '#e4f6ff',
    arc: false,
    vehicle: VEHICLE_BOAT,
    icon: ICON_BOAT,
  },
};

// Andere Schreibweisen, die auch verstanden werden.
const ALIASES = {
  flug: 'flugzeug',
  flieger: 'flugzeug',
  schiff: 'boot',
  faehre: 'boot',
  fähre: 'boot',
  wagen: 'auto',
  mietwagen: 'auto',
};

// Wandelt den Text aus route.json in einen gültigen Schlüssel um.
// Gibt null zurück, wenn das Verkehrsmittel unbekannt ist.
export function resolveTransportKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (TRANSPORT[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

// --- Bedien-Symbole ---------------------------------------------------

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const UI_ICONS = {
  play: svg('<path fill="currentColor" d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.4-6.4a1 1 0 0 0 0-1.8L9.5 4.7A1 1 0 0 0 8 5.6Z"/>'),
  pause: svg('<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>'),
  restart: svg(`<path ${stroke} d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path ${stroke} d="M4.5 4.5v4h4"/>`),
  close: svg(`<path ${stroke} d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  calendar: svg(`<rect ${stroke} x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path ${stroke} d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`),
  note: svg(`<path ${stroke} d="M6 3.8h8.5L18 7.3v12.9H6z"/><path ${stroke} d="M9 11h6M9 14.5h6M9 18h3.5"/>`),
  pin: svg(`<path ${stroke} d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle ${stroke} cx="12" cy="10" r="2.3"/>`),
};
