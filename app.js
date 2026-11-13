'use strict';

const byId = id => document.getElementById(id);
const norway = 'Europe/Oslo';
const dateFormat = new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: norway });
const shortDate = new Intl.DateTimeFormat('nn-NO', { day: 'numeric', month: 'short', timeZone: norway });
const updatedFormat = new Intl.DateTimeFormat('nn-NO', { dateStyle: 'short', timeStyle: 'short', timeZone: norway });
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: norway }).format(new Date());
const clubSelect = byId('clubFilter');
const classSelect = byId('classFilter');
const content = byId('content');
const status = byId('status');
const dialog = byId('matchDialog');
const views = [...document.querySelectorAll('[data-view]')];
const source = 'bygdebladet-lokalhandball-v1';
const newspaperOrigins = new Set(['https://bygdebladet.com', 'https://www.bygdebladet.com']);
const parentOrigin = (() => {
  try {
    const origin = new URL(document.referrer).origin;
    return newspaperOrigins.has(origin) ? origin : null;
  } catch {
    return null;
  }
})();
let data;
let view = 'results';

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function dateLabel(date, format = dateFormat) {
  return date ? format.format(new Date(`${date}T12:00:00+01:00`)) : 'Tid ikkje fastsett';
}

function link(label, path, className) {
  const el = node('a', className, label);
  el.href = `https://www.handball.no/system/kamper/${path}`;
  el.target = '_blank';
  el.rel = 'noopener';
  return el;
}

function crest(team) {
  const initials = team.name.split(/[^\p{L}]+/u).filter(Boolean).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const badge = node('span', 'crest', initials);
  badge.setAttribute('aria-hidden', 'true');
  if (team.club && data.clubs[team.club]) {
    const img = node('img');
    img.alt = '';
    img.src = `assets/team-logos/${team.club}.png`;
    img.addEventListener('error', () => { badge.textContent = initials; }, { once: true });
    badge.replaceChildren(img);
  }
  return badge;
}

function duel(match) {
  const row = node('span', 'duel');
  const teamLabel = team => {
    const label = node('span', 'team');
    label.append(crest(team), node('span', '', team.name));
    return label;
  };
  row.append(teamLabel(match.home), node('strong', 'feature-score', match.score?.join('–') || '–'), teamLabel(match.away));
  return row;
}

function matchButton(match) {
  const button = node('button', 'match');
  button.type = 'button';
  button.addEventListener('click', () => openMatch(match));
  const info = node('span', 'match-info');
  info.append(node('strong', '', match.class), node('small', '', match.competition));
  if (!match.score && match.start) info.append(node('small', '', `Kl. ${match.start}`));
  const teams = node('span', 'match-teams');
  [match.home, match.away].forEach((team, i) => {
    const line = node('span', 'team-line');
    line.append(crest(team), node('span', '', team.name), node('strong', '', match.score?.[i] ?? ''));
    teams.append(line);
  });
  const arrow = node('span', 'arrow', '›');
  arrow.setAttribute('aria-hidden', 'true');
  button.append(info, teams, arrow);
  return button;
}

function showFeatured() {
  const featured = byId('featured');
  const latest = data.matches.findLast(match => match.status === 'played');
  if (!latest) {
    featured.hidden = true;
    return;
  }
  const button = node('button', 'feature-card');
  button.type = 'button';
  button.addEventListener('click', () => openMatch(latest));
  const heading = node('span', 'feature-head');
  const date = node('time', '', dateLabel(latest.date, shortDate));
  if (latest.date) date.dateTime = latest.date;
  heading.append(node('strong', '', 'Siste resultat'), date);
  const footer = node('span', 'feature-foot');
  footer.append(node('span', '', latest.competition), node('span', '', 'Sjå kampen ›'));
  button.append(heading, duel(latest), footer);
  featured.append(button);
}

function tableBlock(id, name, open = false) {
  const rows = data.tables[String(id)];
  if (!rows?.length) return null;
  const block = node('details', 'standing');
  block.open = open;
  block.append(node('summary', '', name));
  const scroll = node('div', 'table-scroll');
  const table = node('table');
  table.setAttribute('aria-label', name);
  const head = table.createTHead().insertRow();
  ['#', 'Lag', 'K', 'S', 'U', 'T', 'Mål', 'P'].forEach(label => {
    const cell = node('th', '', label);
    cell.scope = 'col';
    head.append(cell);
  });
  const body = table.createTBody();
  rows.forEach(row => {
    const tr = body.insertRow();
    if (data.trackedTeamIds.includes(row.teamId)) tr.className = 'tracked';
    const goals = row.goalsFor == null || row.goalsAgainst == null ? '–' : `${row.goalsFor}–${row.goalsAgainst}`;
    [row.position, row.name, row.played, row.wins, row.draws, row.losses, goals, row.points].forEach(value => {
      tr.append(node('td', '', value ?? '–'));
    });
  });
  scroll.append(table);
  block.append(scroll, link('Offisiell tabell hos NHF ↗', `turnering/?turnid=${id}`, 'standing-source'));
  return block;
}

function tellParent(type) {
  if (window.parent !== window && parentOrigin) window.parent.postMessage({ source, type }, parentOrigin);
}

function openMatch(match) {
  const heading = node('header', 'dialog-head');
  const title = node('h2', '', match.competition);
  title.id = 'dialogTitle';
  heading.append(title, duel(match));
  const body = node('div', 'dialog-body');
  body.append(node('p', '', [dateLabel(match.date), match.start && `kl. ${match.start}`, match.venue].filter(Boolean).join(' · ')));
  if (match.walkover) body.append(node('p', '', 'Walkover'));
  body.append(node('p'));
  body.lastElementChild.append(link('Sjå kampen hos NHF ↗', `kamp/?matchid=${match.id}`, 'nhf-link'));
  const standings = tableBlock(match.competitionId, 'Tabell');
  if (standings) body.append(standings);
  byId('dialogContent').replaceChildren(heading, body);
  dialog.showModal();
  document.documentElement.classList.add('match-modal-open');
  tellParent('match-open');
}

dialog.addEventListener('close', () => {
  document.documentElement.classList.remove('match-modal-open', 'match-embedded-fullscreen');
  tellParent('match-close');
});
window.addEventListener('message', event => {
  if (dialog.open && event.source === window.parent && event.origin === parentOrigin &&
      event.data?.source === source && event.data.type === 'match-activated') {
    document.documentElement.classList.add('match-embedded-fullscreen');
  }
});

function filtered() {
  return data.matches.filter(match => {
    const club = clubSelect.value;
    const clubs = [match.home, match.away].flatMap(team => [team.club, ...team.partners]);
    return (!club || clubs.includes(club)) && (!classSelect.value || match.class === classSelect.value);
  });
}

function render() {
  if (!data) return;
  content.replaceChildren();
  status.hidden = true;
  const matches = filtered();
  if (view === 'tables') {
    const tournaments = new Map(matches.map(match => [match.competitionId, match.competition]));
    const blocks = [...tournaments].sort((a, b) => a[1].localeCompare(b[1], 'nn')).map(([id, name]) => tableBlock(id, name)).filter(Boolean);
    content.append(...blocks);
    if (blocks.length === 1) blocks[0].open = true;
    if (!blocks.length) showStatus('Ingen offisielle tabellar for dette utvalet.');
    return;
  }
  const selected = view === 'results'
    ? matches.filter(match => match.status === 'played').reverse()
    : matches.filter(match => match.status === 'scheduled' && (!match.date || match.date >= today));
  if (!selected.length) {
    showStatus(view === 'results' ? 'Ingen resultat for dette utvalet.' : 'Ingen kommande kampar for dette utvalet.');
    return;
  }
  const fragment = document.createDocumentFragment();
  let previousDate;
  selected.forEach(match => {
    if (previousDate !== match.date) {
      fragment.append(node('h3', 'date-heading', dateLabel(match.date)));
      previousDate = match.date;
    }
    fragment.append(matchButton(match));
  });
  content.append(fragment);
}

function showStatus(text) {
  status.textContent = text;
  status.hidden = false;
}

views.forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view;
  views.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
clubSelect.addEventListener('change', render);
classSelect.addEventListener('change', render);

fetch('data/handball.json').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(result => {
  data = result;
  byId('season').textContent = `Sesongen ${data.season}`;
  byId('lastUpdated').textContent = `Oppdatert ${updatedFormat.format(new Date(data.updatedAt))}`;
  Object.entries(data.clubs).forEach(([id, club]) => clubSelect.add(new Option(club.name, id)));
  [...new Set(data.matches.map(match => match.class))].sort().forEach(label => classSelect.add(new Option(label, label)));
  showFeatured();
  render();
}).catch(error => {
  console.error(error);
  byId('featured').hidden = true;
  showStatus('Kampdata er mellombels utilgjengelege. Prøv å laste sida på nytt.');
});
