'use strict';

const matchDetails = () => {
  let request;
  return () => {
    request ??= fetch('data/match-details.json', { cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).catch(error => {
      request = null;
      throw error;
    });
    return request;
  };
};
const loadMatchDetails = matchDetails();
const statLabels = [
  ['M', 'Mål totalt'], ['7M', '7-metermål'], ['A', 'Åtvaring (gult kort)'],
  ['2', 'To minutt'], ['D', 'Diskvalifikasjon (raudt kort)'], ['R', 'Diskvalifikasjon med rapport']
];
const photoForm = 'https://tally.so/r/RWMgXj';

function matchOutcome(match) {
  if (!match.score) return null;
  const localHome = Boolean(match.home.club);
  const localAway = Boolean(match.away.club);
  if (localHome && localAway) return ['derby', 'Lokalderby'];
  if (!localHome && !localAway) return null;
  const difference = (match.score[0] - match.score[1]) * (localHome ? 1 : -1);
  return difference > 0 ? ['win', 'Siger'] : difference < 0 ? ['loss', 'Tap'] : ['draw', 'Uavgjort'];
}

function outcomeBadge(outcome) {
  return node('span', `outcome outcome-${outcome[0]}`, outcome[1]);
}

function detailSection(title) {
  const section = node('section', 'match-section');
  section.append(node('h3', '', title));
  return section;
}

function standingsPanel(match) {
  const section = detailSection('Tabell');
  section.append(tableBlock(match.competitionId, match.competition, true, [match.home.id, match.away.id]) ||
    node('p', 'match-note', 'NHF har ingen tabell for denne turneringa.'));
  return section;
}

function reportPanel(match, details, pending) {
  const panel = node('div');
  const report = detailSection('Kampreferat');
  if (!match.score) {
    report.append(node('p', 'match-note', 'Kampen er ikkje ferdigspelt.'));
  } else {
    const [homeScore, awayScore] = match.score;
    const result = match.score.join('–');
    const home = match.home.name;
    const away = match.away.name;
    let lead = `${home} og ${away} spelte ${result}.`;
    if (homeScore !== awayScore) {
      const [winner, loser, score] = homeScore > awayScore ? [home, away, result] : [away, home, `${awayScore}–${homeScore}`];
      lead = `${winner} vann ${score} mot ${loser}.`;
    }
    if (match.walkover) lead = `NHF har registrert kampen mellom ${home} og ${away} som walkover med resultat ${result}.`;
    const article = node('article', 'match-report');
    article.append(node('p', 'report-lead', lead));
    if (details?.half) {
      const [a, b] = details.half;
      article.append(node('p', '', a === b ? `Det stod ${a}–${b} til pause.` :
        a > b ? `${home} leia ${a}–${b} til pause.` : `${away} leia ${b}–${a} til pause.`));
    }
    const scorers = ['home', 'away'].flatMap(side => {
      const players = details?.lineups[side] || [];
      const goals = players.map(player => player.stats[0]);
      const teamScore = match.score[side === 'home' ? 0 : 1];
      if (goals.some(goal => goal == null) || goals.reduce((total, goal) => total + goal, 0) !== teamScore) return [];
      const highest = Math.max(0, ...goals);
      if (!highest) return [];
      const names = players.filter(player => player.stats[0] === highest).map(player => player.name);
      return [`${names.join(', ')} scora ${highest} mål ${names.length > 1 ? 'kvar ' : ''}for ${match[side].name}.`];
    });
    if (scorers.length) article.append(node('p', '', scorers.join(' ')));
    article.append(node('p', 'match-note', 'Referatet er laga på grunnlag av dei registrerte kampdataa frå NHF.'));
    report.append(article);
  }
  const timeline = timelineSection(match, details, pending);
  const facts = detailSection('Kampfakta');
  const list = node('dl', 'match-facts');
  const values = [
    ['Turnering', match.competition], ['Tid', [dateLabel(match.date), match.start && `kl. ${match.start}`].filter(Boolean).join(' · ')],
    ['Hall', match.venue], ['Pause', details?.half?.join('–')], ['Tilskodarar', details?.spectators]
  ];
  for (const [label, value] of values) {
    if (value == null || value === '') continue;
    const item = node('div');
    item.append(node('dt', '', label), node('dd', '', value));
    list.append(item);
  }
  facts.append(list, link('Sjå kampen hos NHF ↗', `kamp/?matchid=${match.id}`, 'nhf-link'));
  panel.append(report);
  if (match.score) panel.append(photoPanel(match));
  panel.append(timeline, facts);
  return panel;
}

function timelineSection(match, details, pending) {
  const section = detailSection('Kampforløp');
  const events = details?.events || [];
  if (!events.length) {
    section.append(node('p', 'match-note', pending ? 'Hentar kampforløpet …' : match.score ?
      'Det er ikkje publisert eit detaljert kampforløp for denne kampen.' : 'Kampforløpet kjem når NHF har publisert hendingane.'));
    return section;
  }
  if (!details.timelineComplete) section.append(node('p', 'match-note', 'Kampforløpet hos NHF er ufullstendig.'));
  const timeline = node('div', 'match-timeline');
  const sides = node('div', 'timeline-sides');
  sides.append(node('strong', '', match.home.name), node('strong', '', match.away.name));
  timeline.append(sides);
  let period;
  for (const event of events) {
    if (period !== event.period && event.period) {
      period = event.period;
      timeline.append(node('h4', 'timeline-period', /^\d+$/.test(period) ? `${period}. omgang` : period));
    }
    const row = node('div', `timeline-row timeline-${event.side || 'neutral'}`);
    const clock = node('span', 'timeline-clock', event.time || '–');
    const eventCard = node('div', 'timeline-event');
    eventCard.append(node('strong', '', event.label === 'Advarsel' ? 'Åtvaring' : event.label === '2 minutter' ? 'To minutt' : event.label === 'Rødt kort' ? 'Raudt kort' : event.label));
    if (event.name) eventCard.append(node('span', 'timeline-player', event.name));
    if (event.score) eventCard.append(node('b', 'timeline-score', event.score.join('–')));
    row.append(clock, eventCard);
    timeline.append(row);
  }
  section.append(timeline);
  return section;
}

function lineupPanel(match, details, pending) {
  const section = detailSection('Lagoppstillingar');
  const hasData = ['home', 'away'].some(side => details?.lineups[side]?.length || details?.teamStats[side]?.some(value => value != null));
  if (!hasData) {
    section.append(node('p', 'match-note', pending ? 'Hentar lagoppstillingane …' : 'NHF har ikkje publisert lagoppstillingane for denne kampen.'));
    return section;
  }
  const legend = node('ul', 'stats-legend');
  for (const [short, label] of statLabels) {
    const item = node('li');
    item.append(node('strong', '', short), document.createTextNode(` ${label}`));
    legend.append(item);
  }
  const grid = node('div', 'lineups-grid');
  for (const side of ['home', 'away']) grid.append(lineupCard(match, side, details));
  section.append(legend, grid);
  return section;
}

function lineupCard(match, side, details) {
  const players = details.lineups[side];
  const stats = details.teamStats[side];
  const card = node('section', 'lineup-card');
  const heading = node('h4', `lineup-heading lineup-${side}`);
  heading.append(crest(match[side]), node('span', '', match[side].name));
  card.append(heading);
  if (!players.length) card.append(node('p', 'match-note', 'Spelarlista er ikkje publisert.'));
  if (!players.length && !stats.some(value => value != null)) return card;
  const table = node('table', 'lineup-table');
  table.setAttribute('aria-label', `Lagoppstilling for ${match[side].name}`);
  const head = table.createTHead().insertRow();
  for (const [short, label] of [['Nr.', 'Draktnummer'], ['Spelar', 'Spelar'], ...statLabels]) {
    const th = node('th', '', short);
    th.scope = 'col';
    th.title = label;
    head.append(th);
  }
  const body = table.createTBody();
  for (const player of players) {
    const row = body.insertRow();
    row.append(node('td', '', player.number ?? '–'), node('td', 'player-name', player.name));
    for (const value of player.stats) row.append(node('td', '', value === 0 ? '' : value ?? '–'));
  }
  const sum = table.createTFoot().insertRow();
  const title = node('th', '', 'Sum');
  title.colSpan = 2;
  title.scope = 'row';
  sum.append(title);
  const totals = [match.score?.[side === 'home' ? 0 : 1], ...stats];
  for (let i = 0; i < totals.length; i++) {
    const values = players.map(player => player.stats[i]);
    const fromPlayers = values.length && values.every(value => value != null) ? values.reduce((a, b) => a + b, 0) : null;
    sum.append(node('td', '', totals[i] ?? fromPlayers ?? '–'));
  }
  const wrap = node('div', 'table-scroll');
  wrap.append(table);
  card.append(wrap);
  return card;
}

function photoPanel(match) {
  const section = detailSection('Bilde frå kampen');
  section.append(node('p', '', 'Har du bilde frå kampen? Send dei til redaksjonen.'));
  const url = new URL(photoForm);
  url.search = new URLSearchParams({ matchId: match.id, match: `${match.home.name} – ${match.away.name}`, matchDate: match.date || '' });
  const button = node('a', 'photo-submit', 'Send inn kampbilde ↗');
  button.href = url.href;
  button.target = '_blank';
  button.rel = 'noopener';
  section.append(button);
  return section;
}

function matchTabs(match) {
  let details;
  let pending = Boolean(match.score && !match.walkover);
  let active = 0;
  const labels = ['Rapport', 'Tabell', 'Lag'];
  const tablist = node('div', 'match-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Kampdetaljar');
  const panels = labels.map((label, i) => {
    const panel = node('div', 'dialog-body');
    panel.id = `match-panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `match-tab-${i}`);
    panel.tabIndex = 0;
    return panel;
  });
  const buttons = labels.map((label, i) => {
    const tab = node('button', 'match-tab', label);
    tab.type = 'button';
    tab.id = `match-tab-${i}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      const targets = { ArrowLeft: (i + 2) % 3, ArrowRight: (i + 1) % 3, Home: 0, End: 2 };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      select(targets[event.key]);
      buttons[targets[event.key]].focus();
    });
    return tab;
  });
  function select(index) {
    active = index;
    buttons.forEach((button, i) => {
      button.tabIndex = i === active ? 0 : -1;
      button.setAttribute('aria-selected', String(i === active));
      panels[i].hidden = i !== active;
    });
  }
  function renderDetails() {
    panels[0].replaceChildren(reportPanel(match, details, pending));
    panels[2].replaceChildren(lineupPanel(match, details, pending));
  }
  tablist.append(...buttons);
  renderDetails();
  panels[1].append(standingsPanel(match));
  select(0);
  if (pending) {
    loadMatchDetails().then(all => {
      const candidate = all[match.id];
      if (candidate?.score.join() === match.score.join()) details = candidate;
    }).catch(console.error).finally(() => {
      pending = false;
      renderDetails();
    });
  }
  return [tablist, ...panels];
}
