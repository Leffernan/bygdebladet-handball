"""Extract the public match report, events and team sheets from NHF match pages."""

from datetime import timedelta
from html import unescape
from html.parser import HTMLParser
import json
import re

SIDES = ('home', 'away')
PLAYER_STATS = ('spillerMaal', 'sjuMeterMaal', 'advarsel', 'toMinutter',
                'diskvalifikasjon', 'diskvalifikasjonMedRapport')
TEAM_STATS = ('sevenMeterGoals', 'warnings', 'twoMinutes', 'disqualifications',
              'disqualificationsWithReport')
EVENT_SIDES = {'hometeam-event': 'home', 'awayteam-event': 'away'}


class MatchParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.info = {}
        self.header = {}
        self.periods = {}
        self.overview = {}

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == 'match-info':
            keys = ('match-id', 'home-team-id', 'away-team-id', 'match-events',
                    'home-players', 'away-players', 'team-report')
            self.info = {key: json.loads(props.get(':' + key, 'null')) for key in keys}
        elif tag in ('match-header', 'period-results', 'match-overview'):
            value = json.loads(props.get(':model', 'null')) or {}
            setattr(self, {'match-header': 'header', 'period-results': 'periods',
                           'match-overview': 'overview'}[tag], value)


def plain(value):
    return unescape(re.sub(r'<[^>]+>', '', value or '')).strip()


def count(value):
    return value if type(value) is int and value >= 0 else None


def lineup(rows):
    players = []
    for row in rows or []:
        name = plain(row.get('fullName')) or ' '.join(filter(None, (row.get('firstName'), row.get('lastName'))))
        if not name:
            continue
        normal, seven, *other = [count(row.get(key)) for key in PLAYER_STATS]
        total = count(row.get('goals'))
        # NHF's player columns separate open-play and seven-metre goals.
        if normal is not None and seven is not None:
            total = normal + seven
        players.append({'number': count(row.get('shirtNo')), 'name': name,
                        'stats': [total, seven, *other]})
    return sorted(players, key=lambda player: (player['number'] is None, player['number'] or 0, player['name']))


def events_for(rows):
    events = []
    for row in rows or []:
        label = plain(row.get('text')).rstrip('!')
        if not label:
            continue
        score = re.fullmatch(r'(\d+)\s*[-–:]\s*(\d+)', plain(row.get('score')))
        events.append({'period': plain(str(row.get('period') or '')), 'time': plain(row.get('time')),
                       'side': EVENT_SIDES.get(row.get('eventCssClass')), 'label': label,
                       'name': plain(row.get('name')), 'score': list(map(int, score.groups())) if score else None})
    return events


def parse_match(markup, match):
    parser = MatchParser()
    parser.feed(markup)
    info = parser.info
    if info.get('match-id') != match['id'] or any(info.get(side + '-team-id') != match[side]['id'] for side in SIDES):
        raise ValueError('Kampsida har andre kamp- eller lag-ID-ar enn terminlista')
    if parser.header.get('center', {}).get('type') != 'score' or [parser.header.get(side, {}).get('score') for side in SIDES] != match['score']:
        raise ValueError('Kampsida og terminlista viser ulike sluttresultat')

    half = None
    period_goals = [parser.periods.get(side, {}).get('goalsByPeriod') for side in SIDES]
    if all(isinstance(goals, list) and len(goals) >= 2 and all(count(g) is not None for g in goals) for goals in period_goals):
        if [sum(goals) for goals in period_goals] == match['score']:
            half = [goals[0] for goals in period_goals]

    events = events_for(info.get('match-events'))
    scoring = [event['score'] for event in events if event['score'] is not None]
    verified = bool(scoring and scoring[-1] == match['score'])
    report = info.get('team-report') or {}
    return {'score': match['score'], 'half': half, 'events': events, 'timelineComplete': verified,
            'lineups': {side: lineup(info.get(side + '-players')) for side in SIDES},
            'teamStats': {side: [count((report.get(side) or {}).get(key)) for key in TEAM_STATS] for side in SIDES},
            'spectators': count(parser.overview.get('spectators'))}


def refresh_matches(games, existing, fetch, pool, now, daily=False, force=False):
    played = {str(m['id']): m for m in games.values() if m['status'] == 'played' and not m['walkover']}
    details = {key: value for key, value in existing.items() if key in played and value['score'] == played[key]['score']}
    candidates = [match for key, match in played.items() if key not in details or
                  (daily and match['date'] and match['date'] >= (now.date() - timedelta(days=2)).isoformat())]
    candidates.sort(key=lambda match: (match['date'] or '', match['id']), reverse=True)
    if not force:
        candidates = candidates[:12]

    def load(match):
        try:
            return parse_match(fetch('/system/kamper/kamp/', {'matchid': match['id']}), match)
        except (OSError, ValueError) as error:
            print(f"Kampdetaljar {match['id']}: {error}")
            return None

    for match, result in zip(candidates, pool.map(load, candidates)):
        if result is not None:
            details[str(match['id'])] = result
    return dict(sorted(details.items()))
