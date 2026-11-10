// =====================================================================
// ui.js – die Bedienoberfläche (normales HTML über der Karte)
// ---------------------------------------------------------------------
//  • Titel oben links
//  • Orts-Banner oben in der Mitte ("Bali · Indonesien"), wie im Reisevideo
//  • Leiste unten: Play/Pause, Status, Tempo, Kartenstil, Neustart, Etappen
//  • Infokarte, wenn man einen Marker antippt
//  • kleine Hinweis-Meldungen ("Toasts")
// =====================================================================

import { UI_ICONS } from './transport.js';

const numberFormat = new Intl.NumberFormat('de-DE');
const longDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

export function createUI(trip, handlers) {
  const $ = (selector) => document.querySelector(selector);
  const els = {
    title: $('#trip-title'),
    summary: $('#trip-summary'),
    hud: $('#hud'),
    panel: $('#panel'),
    play: $('#btn-play'),
    restart: $('#btn-restart'),
    speed: $('#btn-speed'),
    style: $('#btn-style'),
    banner: $('#banner'),
    statusTop: $('#status-top'),
    statusMain: $('#status-main'),
    progress: $('#progress-bar'),
    legs: $('#legs'),
    card: $('#card'),
    toasts: $('#toasts'),
  };

  // ---- Titel & Zusammenfassung --------------------------------------
  els.title.textContent = trip.title;
  document.title = trip.title;
  els.summary.textContent = [
    `${trip.places.length} Orte`,
    `${trip.legs.length} Etappen`,
    `${formatKm(trip.totalKm)}`,
    trip.isRoundTrip ? 'Rundreise' : '',
  ].filter(Boolean).join(' · ');

  // ---- Buttons --------------------------------------------------------
  els.restart.innerHTML = UI_ICONS.restart;
  els.style.innerHTML = UI_ICONS.layers;
  els.play.addEventListener('click', handlers.onPlay);
  els.restart.addEventListener('click', handlers.onRestart);
  els.speed.addEventListener('click', handlers.onSpeed);
  els.style.addEventListener('click', handlers.onStyle);

  // ---- Etappen-Chips ---------------------------------------------------
  const chips = trip.legs.map((leg) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'leg';
    chip.style.setProperty('--leg-color', leg.transport.color);
    const date = formatDate(leg.to.date, shortDate);
    chip.innerHTML = `
      <span class="leg-num">${leg.index + 1}</span>
      <span class="leg-text">
        <span class="leg-route"></span>
        <span class="leg-meta"><span class="leg-icon">${leg.transport.icon}</span><span class="leg-km"></span></span>
      </span>`;
    chip.querySelector('.leg-route').textContent = `${leg.from.name} → ${leg.to.name}`;
    chip.querySelector('.leg-km').textContent = [formatKm(leg.km), date].filter(Boolean).join(' · ');
    chip.setAttribute('aria-label', `Etappe ${leg.index + 1}: ${leg.from.name} nach ${leg.to.name}, ${leg.transport.name}`);
    chip.addEventListener('click', () => handlers.onLeg(leg.index));
    els.legs.appendChild(chip);
    return chip;
  });

  // ---- Infokarte ------------------------------------------------------
  els.card.addEventListener('click', (event) => {
    if (event.target.closest('.card-close')) handlers.onCloseCard();
  });

  function openCard(place) {
    const lastIndex = trip.stops.length - 1;
    const visits = place.stops.map((stop) => {
      let label = `Stopp ${stop.index + 1} von ${trip.stops.length}`;
      if (stop.index === 0) label = 'Start der Reise';
      else if (stop.index === lastIndex) label = trip.isRoundTrip ? 'Rückkehr · Ziel der Reise' : 'Ziel der Reise';

      const previous = trip.stops[stop.index - 1];
      const transport = stop.index > 0 ? trip.legs[stop.index - 1].transport : null;
      const arrival = transport
        ? `<p class="visit-arrival" style="--leg-color:${transport.color}">
             <span class="leg-icon">${transport.icon}</span>
             ${escapeHtml(transport.name)} aus ${escapeHtml(previous.name)}
           </p>`
        : '';

      const date = formatDate(stop.date, longDate);
      return `
        <section class="visit">
          <h3 class="visit-label">${escapeHtml(label)}</h3>
          ${arrival}
          <p class="visit-row">${UI_ICONS.calendar}
            ${date ? `<span>${escapeHtml(date)}</span>` : '<span class="muted">Noch kein Datum</span>'}
          </p>
          <p class="visit-row">${UI_ICONS.note}
            ${stop.note ? `<span class="note">${escapeHtml(stop.note)}</span>` : '<span class="muted">Noch keine Notiz</span>'}
          </p>
        </section>`;
    });

    els.card.innerHTML = `
      <button type="button" class="card-close" aria-label="Schließen">${UI_ICONS.close}</button>
      <header class="card-head">
        <span class="card-pin">${UI_ICONS.pin}</span>
        <div>
          <h2 class="card-title">${escapeHtml(place.name)}</h2>
          ${place.country ? `<p class="card-sub">${escapeHtml(place.country)}</p>` : ''}
        </div>
      </header>
      ${visits.join('')}`;
    els.card.hidden = false;
    // Animation neu starten, auch wenn die Karte schon offen war
    els.card.classList.remove('is-open');
    void els.card.offsetWidth;
    els.card.classList.add('is-open');
  }

  function closeCard() {
    els.card.hidden = true;
    els.card.classList.remove('is-open');
  }

  // ---- Zustand anzeigen ----------------------------------------------
  let lastActive = -1;

  function render(info) {
    const { phase, running, leg, legIndex, speed } = info;
    const total = trip.legs.length;

    // Play-Button
    const icon = running ? 'pause' : phase === 'done' ? 'restart' : 'play';
    els.play.innerHTML = UI_ICONS[icon];
    els.play.setAttribute('aria-label', running ? 'Pause' : phase === 'done' ? 'Nochmal abspielen' : 'Abspielen');
    els.speed.textContent = `${speed}×`;

    // Statuszeilen
    const { atStart, shownPhase } = info;
    const step = `Etappe ${legIndex + 1}/${total}`;
    let top = step;
    let main = `${leg.from.name} → ${leg.to.name}`;
    if (atStart) {
      top = 'Bereit';
      main = 'Tippe auf Play';
    } else if (shownPhase === 'done') {
      top = 'Reise abgeschlossen';
      main = trip.isRoundTrip ? `Wieder in ${leg.to.name}` : `Angekommen in ${leg.to.name}`;
    } else if (shownPhase === 'hold') {
      top = `${step} · Start`;
      main = leg.from.name;
    } else if (['descend', 'linger', 'arrived'].includes(shownPhase)) {
      top = `${step} · Ankunft`;
      main = leg.to.name;
    }
    if (!running && !atStart && phase !== 'done' && phase !== 'arrived') {
      top = `Pausiert · ${step}`;
    }
    els.statusTop.textContent = top;
    els.statusMain.textContent = main;

    // Chips
    chips.forEach((chip, i) => {
      chip.classList.toggle('is-done', trip.legs[i].progress >= 1);
      chip.classList.toggle('is-active', i === legIndex && !atStart && shownPhase !== 'done');
    });
    // Orts-Banner: beim Start den Startort, bei der Ankunft das Ziel zeigen
    if (phase === 'hold') showBanner(leg.from);
    else if (['descend', 'linger', 'arrived'].includes(phase)) showBanner(leg.to);
    else showBanner(null);

    if (legIndex !== lastActive) {
      lastActive = legIndex;
      scrollChipIntoView(chips[legIndex]);
    }
  }

  let bannerStop = null;
  function showBanner(stop) {
    if (stop === bannerStop) return;
    bannerStop = stop;
    if (!stop) {
      els.banner.classList.remove('is-visible');
      return;
    }
    const date = formatDate(stop.date, longDate);
    els.banner.innerHTML = '<span class="banner-title"></span><span class="banner-sub"></span>';
    els.banner.querySelector('.banner-title').textContent = stop.name;
    els.banner.querySelector('.banner-sub').textContent = [stop.country, date].filter(Boolean).join(' · ');
    els.banner.classList.remove('is-visible');
    void els.banner.offsetWidth; // Einblend-Animation neu starten
    els.banner.classList.add('is-visible');
  }

  function setStyleName(name) {
    els.style.setAttribute('aria-label', `Kartenstil wechseln (gerade: ${name})`);
    els.style.title = `Kartenstil: ${name}`;
  }

  function scrollChipIntoView(chip) {
    const bar = els.legs;
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  let lastProgress = -1;
  function setProgress(fraction) {
    if (Math.abs(fraction - lastProgress) < 0.0005) return;
    lastProgress = fraction;
    els.progress.style.transform = `scaleX(${fraction.toFixed(4)})`;
  }

  // ---- Hinweise -------------------------------------------------------
  function toast(message, ms = 7000) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    el.addEventListener('click', () => el.remove());
    els.toasts.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // Wie viel Platz belegen Titel und Leiste? (damit die Kartenmitte im freien Bereich liegt)
  function insets() {
    const panelRect = els.panel.getBoundingClientRect();
    const hudRect = els.hud.getBoundingClientRect();
    return {
      top: Math.max(0, hudRect.bottom),
      bottom: Math.max(0, window.innerHeight - panelRect.top),
    };
  }

  return { render, setProgress, openCard, closeCard, toast, insets, setStyleName };
}

// ---------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------

function formatKm(km) {
  return `${numberFormat.format(Math.round(km / 10) * 10)} km`;
}

// "2026-03-14" → "14. März 2026". Anderer Text wird so angezeigt, wie er ist.
export function formatDate(value, format) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? value : format.format(date);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
