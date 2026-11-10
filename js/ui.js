// =====================================================================
// ui.js – die Bedienoberfläche (normales HTML über der Karte)
// ---------------------------------------------------------------------
//  • Titel oben links
//  • Orts-Banner oben in der Mitte ("Bali · Indonesien"), wie im Reisevideo
//  • Leiste unten: Play/Pause, Status, Tempo, Kartenstil, Neustart,
//    Etappen und Ausflüge (als eingerückte Unterpunkte)
//  • Infokarte, wenn man einen Marker antippt
//  • kleine Hinweis-Meldungen ("Toasts")
// =====================================================================

import { TRANSPORT, UI_ICONS } from './transport.js';

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
  const mainPlaces = trip.places.filter((place) => !place.isSub).length;
  els.summary.textContent = [
    `${mainPlaces} Orte`,
    `${trip.mainLegCount} Etappen`,
    trip.excursionCount ? `${trip.excursionCount} ${trip.excursionCount === 1 ? 'Ausflug' : 'Ausflüge'}` : '',
    `${formatKm(trip.totalKm)}`,
  ].filter(Boolean).join(' · ');

  // ---- Buttons --------------------------------------------------------
  els.restart.innerHTML = UI_ICONS.restart;
  els.style.innerHTML = UI_ICONS.layers;
  els.play.addEventListener('click', handlers.onPlay);
  els.restart.addEventListener('click', handlers.onRestart);
  els.speed.addEventListener('click', handlers.onSpeed);
  els.style.addEventListener('click', handlers.onStyle);

  // ---- Leiste: ein Chip pro Abschnitt ---------------------------------
  // Hauptetappe: "3  Bali → Singapur"
  // Ausflug (als Unterpunkt, kleiner): "↳ Ausflug  Sihanoukville · Koh Rong"
  const chips = trip.segments.map((segment) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    if (segment.kind === 'main') {
      const leg = segment.legs[0];
      chip.className = 'leg';
      chip.style.setProperty('--leg-color', leg.transport.color);
      const date = formatDate(leg.to.date, shortDate);
      chip.innerHTML = `
        <span class="leg-num">${segment.number}</span>
        <span class="leg-text">
          <span class="leg-route"></span>
          <span class="leg-meta"><span class="leg-icon">${leg.transport.icon}</span><span class="leg-km"></span></span>
        </span>`;
      chip.querySelector('.leg-route').textContent = `${leg.from.name} → ${leg.to.name}`;
      chip.querySelector('.leg-km').textContent = [formatKm(leg.km), date].filter(Boolean).join(' · ');
      chip.setAttribute('aria-label', `Etappe ${segment.number}: ${leg.from.name} nach ${leg.to.name}, ${leg.transport.name}`);
    } else {
      // Verkehrsmittel des Ausflugs (ohne doppelte), z. B. Auto + Boot
      const transports = [...new Set(segment.subs.map((sub) => sub.transport))];
      const km = segment.legs.reduce((sum, leg) => sum + leg.km, 0);
      chip.className = 'leg is-excursion';
      chip.style.setProperty('--leg-color', segment.legs[0].transport.color);
      chip.innerHTML = `
        <span class="leg-num leg-sub-arrow">↳</span>
        <span class="leg-text">
          <span class="leg-kicker">Ausflug</span>
          <span class="leg-route"></span>
          <span class="leg-meta">${transports.map((t) => `<span class="leg-icon" style="--leg-color:${TRANSPORT[t].color}">${TRANSPORT[t].icon}</span>`).join('')}<span class="leg-km"></span></span>
        </span>`;
      chip.querySelector('.leg-route').textContent = segment.subs.map((sub) => sub.name).join(' · ');
      chip.querySelector('.leg-km').textContent = `${formatKm(km)} hin & zurück`;
      chip.setAttribute('aria-label', `Ausflug ab ${segment.base.name}: ${segment.subs.map((sub) => sub.name).join(', ')}`);
    }
    chip.addEventListener('click', () => handlers.onSegment(segment.index));
    els.legs.appendChild(chip);
    return chip;
  });

  // ---- Infokarte ------------------------------------------------------
  els.card.addEventListener('click', (event) => {
    if (event.target.closest('.card-close')) handlers.onCloseCard();
  });

  function openCard(place) {
    const lastIndex = trip.stops.length - 1;

    // Besuche als Hauptstopp (Konstanz z. B. zweimal: Start und Rückkehr)
    const visits = place.stops.map((stop) => {
      let label = `Stopp ${stop.index + 1} von ${trip.stops.length}`;
      if (stop.index === 0) label = 'Start der Reise';
      else if (stop.index === lastIndex) label = trip.isRoundTrip ? 'Rückkehr · Ziel der Reise' : 'Ziel der Reise';
      const previous = trip.stops[stop.index - 1];
      const arrival = stop.index > 0 ? arrivalLine(TRANSPORT[stop.transport], `aus ${previous.name}`) : '';
      const excursions = stop.subs.length
        ? `<p class="visit-row">${UI_ICONS.pin}<span>Ausflug: ${stop.subs
            .map((sub) => `<span class="inline-icon" style="--leg-color:${TRANSPORT[sub.transport].color}">${TRANSPORT[sub.transport].icon}</span>${escapeHtml(sub.name)}`)
            .join(' → ')} und zurück</span></p>`
        : '';
      return `
        <section class="visit">
          <h3 class="visit-label">${escapeHtml(label)}</h3>
          ${arrival}
          ${dateRow(stop.date)}
          ${noteRow(stop.note)}
          ${excursions}
        </section>`;
    });

    // Besuche als Ausflugsziel: Datum gilt vom Hauptort ("im Land")
    const subVisits = place.subVisits.map((sub) => {
      const route = [sub.parent, ...sub.parent.subs];
      const previous = route[route.indexOf(sub) - 1];
      return `
        <section class="visit">
          <h3 class="visit-label">Ausflug ab ${escapeHtml(sub.parent.name)}</h3>
          ${arrivalLine(TRANSPORT[sub.transport], `aus ${previous.name}`)}
          ${dateRow(sub.date || sub.parent.date, !sub.date)}
          ${noteRow(sub.note)}
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
      ${visits.join('')}${subVisits.join('')}`;
    els.card.hidden = false;
    // Animation neu starten, auch wenn die Karte schon offen war
    els.card.classList.remove('is-open');
    void els.card.offsetWidth;
    els.card.classList.add('is-open');
  }

  function arrivalLine(transport, text) {
    return `<p class="visit-arrival" style="--leg-color:${transport.color}">
        <span class="leg-icon">${transport.icon}</span>
        ${escapeHtml(transport.name)} ${escapeHtml(text)}
      </p>`;
  }

  function dateRow(value, fromParent = false) {
    const date = formatDate(value, longDate);
    if (!date) return `<p class="visit-row">${UI_ICONS.calendar}<span class="muted">Noch kein Datum</span></p>`;
    return `<p class="visit-row">${UI_ICONS.calendar}<span>${escapeHtml(date)}${fromParent ? ' <span class="muted">(Aufenthalt)</span>' : ''}</span></p>`;
  }

  function noteRow(note) {
    return `<p class="visit-row">${UI_ICONS.note}${
      note ? `<span class="note">${escapeHtml(note)}</span>` : '<span class="muted">Noch keine Notiz</span>'
    }</p>`;
  }

  function closeCard() {
    els.card.hidden = true;
    els.card.classList.remove('is-open');
  }

  // ---- Zustand anzeigen ----------------------------------------------
  let lastActive = -1;

  function render(info) {
    const { phase, shownPhase, running, leg, segment, speed, atStart, pausesHere } = info;

    // Play-Button
    const icon = running ? 'pause' : phase === 'done' ? 'restart' : 'play';
    els.play.innerHTML = UI_ICONS[icon];
    els.play.setAttribute('aria-label', running ? 'Pause' : phase === 'done' ? 'Nochmal abspielen' : 'Abspielen');
    els.speed.textContent = `${speed}×`;

    // Statuszeilen
    const isExcursion = segment.kind === 'excursion';
    const step = isExcursion ? 'Ausflug' : `Etappe ${segment.number}/${trip.mainLegCount}`;
    const arriving = ['descend', 'linger', 'arrived'].includes(shownPhase) && pausesHere;
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
    } else if (arriving) {
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
      const seg = trip.segments[i];
      chip.classList.toggle('is-done', seg.legs.every((l) => l.progress >= 1));
      chip.classList.toggle('is-active', seg === segment && !atStart && shownPhase !== 'done');
    });

    // Orts-Banner: beim Start den Startort, bei jedem Halt das Ziel zeigen
    if (phase === 'hold') showBanner(leg.from);
    else if (['descend', 'linger', 'arrived'].includes(phase) && pausesHere) showBanner(leg.to);
    else showBanner(null);

    if (segment.index !== lastActive) {
      lastActive = segment.index;
      scrollChipIntoView(chips[segment.index]);
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
    // Ausflugsziele: "Ausflug ab Phnom Penh", sonst Land und Datum
    const date = formatDate(stop.date, longDate);
    const sub = stop.isSub ? `Ausflug ab ${stop.parent.name}` : [stop.country, date].filter(Boolean).join(' · ');
    els.banner.innerHTML = '<span class="banner-title"></span><span class="banner-sub"></span>';
    els.banner.querySelector('.banner-title').textContent = stop.name;
    els.banner.querySelector('.banner-sub').textContent = sub;
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
