'use strict';

const byId = id => document.getElementById(id);
const norway = 'Europe/Oslo';
const dateFormat = new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: norway });
const fullDateFormat = new Intl.DateTimeFormat('nn-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: norway });
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
const isEmbedded = window.parent !== window;
document.documentElement.classList.toggle('match-embedded', isEmbedded);
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

const clubCrests = new Map([
  ['aker topphåndball', 'aker'],
  ['aksla', 'aksla'],
  ['alta', 'alta'],
  ['aure il', 'aure'],
  ['bergsøy', 'bergsoy'],
  ['blindheim', 'blindheim'],
  ['bodø', 'bodo'],
  ['bul', 'bossekop'],
  ['bækkelaget', 'baekkelaget'],
  ['charlottenlund', 'charlottenlund'],
  ['ellingsøy', 'ellingsoy'],
  ['elnesvågen', 'elnesvagen'],
  ['elverum', 'elverum'],
  ['fana', 'fana'],
  ['godøy', 'godoy'],
  ['harstad', 'harstad'],
  ['hk-72 sande', 'hk72-sande'],
  ['hødd', 'hodd'],
  ['isfjorden', 'isfjorden'],
  ['kristiansund', 'kristiansund'],
  ['kråkerøy', 'krakeroy'],
  ['kvæfjord', 'kvaefjord'],
  ['langevåg', 'langevag'],
  ['midsund', 'midsund'],
  ['molde', 'molde-hk'],
  ['molde hk', 'molde-hk'],
  ['mosjøen', 'mosjoen'],
  ['ntnui-ålesund', 'ntnuia'],
  ['randesund', 'randesund'],
  ['ranheim', 'ranheim'],
  ['rival', 'rival'],
  ['rollon', 'rollon'],
  ['sandnes', 'sandnes'],
  ['sif/hessa il', 'sif-hessa'],
  ['sk rival', 'rival'],
  ['ski', 'ski'],
  ['skogn', 'skogn'],
  ['skåla', 'skala'],
  ['spjelkavik', 'spjelkavik'],
  ['spjelkavik il', 'spjelkavik'],
  ['stranda', 'stranda'],
  ['strindheim', 'strindheim'],
  ['sula', 'sula'],
  ['sula sk', 'sula'],
  ['sykkylven', 'sykkylven'],
  ['tiller', 'tiller'],
  ['tingvoll idrettslag', 'tingvoll'],
  ['tromsø', 'tromso'],
  ['træff', 'traeff'],
  ['valder', 'valder'],
  ['vikhammer', 'vikhammer'],
  ['viking tif', 'viking-tif'],
  ['volda', 'volda'],
  ['åheim', 'aaheim'],
  ['åndalsnes', 'andalsnes'],
  ['ørsta', 'orsta'],
]);

function crestFiles(team) {
  if (team.club && data.clubs[team.club]) return [team.club];
  const name = team.name.toLowerCase().trim().replace(/\s+\d+$/, '').replace(/\s*\/\s*/g, '/');
  const club = clubCrests.get(name);
  if (club) return [club];
  const partners = name.split('/').map(part => clubCrests.get(part));
  return partners.every(Boolean) ? partners : [];
}

function crest(team) {
  const initials = team.name.split(/[^\p{L}]+/u).filter(Boolean).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const badge = node('span', team.club ? 'crest local-crest' : 'crest', initials);
  badge.setAttribute('aria-hidden', 'true');
  const files = crestFiles(team);
  if (!files.length) return badge;
  badge.textContent = '';
  badge.classList.toggle('crest-pair', files.length > 1);
  for (const file of files) {
    const img = node('img');
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      badge.classList.toggle('crest-pair', badge.childElementCount > 1);
      if (!badge.childElementCount) badge.textContent = initials;
    }, { once: true });
    badge.append(img);
    img.src = `assets/team-logos/${file}.png`;
  }
  return badge;
}

function duel(match, matchDialog = false) {
  const row = node('span', 'duel');
  const teamLabel = team => {
    const label = node('span', 'team');
    label.append(crest(team), node('span', '', team.name));
    return label;
  };
  const score = node('strong', 'feature-score', match.score?.join('–') || '–');
  if (matchDialog) {
    const result = node('span', 'dialog-result');
    result.append(node('span', 'dialog-result-label', match.walkover ? 'Walkover' : match.score ? 'Slutt' : 'Kommande'), score);
    const outcome = matchOutcome(match);
    if (outcome) result.append(outcomeBadge(outcome));
    row.append(teamLabel(match.home), result, teamLabel(match.away));
  } else {
    row.append(teamLabel(match.home), score, teamLabel(match.away));
  }
  return row;
}

function matchAction(outcome) {
  const side = node('span', 'match-side');
  if (outcome) side.append(outcomeBadge(outcome));
  const arrow = node('span', 'arrow', '›');
  arrow.setAttribute('aria-hidden', 'true');
  side.append(arrow);
  return side;
}

function matchButton(match) {
  const outcome = matchOutcome(match);
  const button = node('button', outcome ? `match match-${outcome[0]}` : 'match');
  button.type = 'button';
  button.addEventListener('click', () => openMatch(match));
  if (match.report) button.append(node('strong', 'match-headline', match.report.title));
  const info = node('span', 'match-info');
  info.append(node('strong', '', match.class), node('small', '', match.competition));
  if (!match.score && match.start) info.append(node('small', '', `Kl. ${match.start}`));
  const teams = node('span', 'match-teams');
  [match.home, match.away].forEach((team, i) => {
    const line = node('span', 'team-line');
    line.append(crest(team), node('span', '', team.name), node('strong', '', match.score?.[i] ?? ''));
    teams.append(line);
  });
  button.append(info, teams, matchAction(outcome));
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
  footer.append(node('span', '', latest.competition), matchAction(matchOutcome(latest)));
  button.append(heading);
  if (latest.report) button.append(node('strong', 'feature-headline', latest.report.title));
  button.append(duel(latest), footer);
  featured.append(button);
}

function tableBlock(id, name, open = false, highlights = data.trackedTeamIds) {
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
    if (highlights.includes(row.teamId)) tr.className = 'tracked';
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
  if (isEmbedded && parentOrigin) window.parent.postMessage({ source, type }, parentOrigin);
}

function openMatch(match) {
  const heading = node('header', 'dialog-head');
  const competition = node('p', 'dialog-competition');
  competition.append(node('strong', '', match.class), node('span', '', match.competition));
  const title = node('h2', '', matchHeadline(match));
  title.id = 'dialogTitle';
  const facts = node('ul', 'dialog-meta');
  const date = node(match.date ? 'time' : 'span', '', dateLabel(match.date, fullDateFormat));
  if (match.date) date.dateTime = match.date;
  const dateItem = node('li');
  dateItem.append(date);
  facts.append(dateItem);
  if (match.start) facts.append(node('li', '', match.start));
  if (match.venue) facts.append(node('li', '', match.venue));
  heading.append(competition, title, duel(match, true), facts);
  byId('dialogContent').replaceChildren(heading, ...matchTabs(match));
  byId('dialogContent').scrollTop = 0;
  dialog.showModal();
  document.documentElement.classList.add('match-modal-open');
  tellParent('match-open');
}

let pressedBackdrop = false;
dialog.addEventListener('pointerdown', event => {
  pressedBackdrop = event.target === dialog;
});
dialog.addEventListener('click', event => {
  if (pressedBackdrop && event.target === dialog) dialog.close();
  pressedBackdrop = false;
});
dialog.addEventListener('close', () => {
  pressedBackdrop = false;
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
