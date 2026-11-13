"""Refresh public fixtures, results and standings from the NHF website."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from html.parser import HTMLParser
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from match_details import refresh_matches

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.handball.no'
OSLO = ZoneInfo('Europe/Oslo')
DATA = ROOT / 'data' / 'handball.json'
STATE = ROOT / 'data' / 'sync-state.json'
DETAILS = ROOT / 'data' / 'match-details.json'


class StandingsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.table = None
        self.is_tournament = False

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == 'table-main' and ':data' in props:
            self.table = json.loads(props[':data'])
        if tag in {'accordion-fixtures', 'accordion-tournament-fixtures'}:
            self.is_tournament = True


def get(path, params=None):
    query = '?' + urlencode(params) if params else ''
    request = Request(BASE + path + query, headers={
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Bygdebladet/1.0 (+https://bygdebladet.com/)'
    })
    for attempt in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                return response.read().decode('utf-8')
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def fixtures(team_id, season_id):
    response = json.loads(get('/api/AjaxData/TerminListeForTeam', {
        'id': team_id, 'seasonId': season_id, 'width': 1440
    }))
    rows = response.get('matches')
    if rows is None and 'ingen kamper' not in response.get('noMatchesText', '').lower():
        raise ValueError(f'Uventa svar for lag {team_id}')
    return rows or []


def competition_fixtures(competition_id):
    response = json.loads(get('/api/AjaxData/TerminlisteForTournament', {
        'id': competition_id, 'typeId': 'Serie', 'width': 1440
    }))
    rows = response.get('matches')
    if not isinstance(rows, list) or not rows:
        raise ValueError(f'Tom eller ugyldig terminliste for turnering {competition_id}')
    return rows


def standings(competition_id):
    parser = StandingsParser()
    parser.feed(get('/system/kamper/turnering/', {'turnid': competition_id}))
    table = parser.table
    if table is None:
        if parser.is_tournament:
            return None
        raise ValueError(f'Ugyldig turneringsside for {competition_id}')
    if table.get('tournamentId') != int(competition_id) or table.get('failed'):
        raise ValueError(f'Ugyldig tabell for {competition_id}')
    return [{
        'position': row['position'], 'teamId': row.get('orgIdTeam') or row.get('orgId'),
        'name': name.strip(), 'played': row['matches'],
        'wins': row['victories'], 'draws': row['draws'], 'losses': row['losses'],
        'goalsFor': row['goalsScored'], 'goalsAgainst': row['goalsConceeded'],
        'points': row['totalPoints']
    } for row in table['teamResults']
        if not row.get('isWithdrawn') and row.get('position') is not None
        and (name := row.get('teamName') or row.get('orgName')) and name.strip()]


def normalize(rows, config):
    games = {}
    tracked = config['teams']
    for row in rows:
        if row.get('seasonId') != config['seasonId'] or row.get('isReservation'):
            continue
        local = [tracked[str(row[side + 'TeamId'])] for side in ('home', 'away')
                 if str(row[side + 'TeamId']) in tracked]
        if not local:
            continue
        score = None
        if row.get('publicResult') and all(type(row.get(k)) is int and row[k] >= 0 for k in ('goalsHome', 'goalsAway')):
            score = [row['goalsHome'], row['goalsAway']]
        status = 'cancelled' if row.get('cancelled') else 'postponed' if row.get('postponed') else 'played' if score is not None else 'scheduled'
        home = team(row, 'home', tracked)
        away = team(row, 'away', tracked)
        games[row['matchId']] = {
            'id': row['matchId'], 'competitionId': row['tournamentId'],
            'competition': row['tournamentName'].strip(), 'class': local[0]['class'],
            'date': row['matchDate'][:10] if row.get('matchDate') else None,
            'start': clock(row.get('matchStartTime')) if row.get('matchDate') else None,
            'end': clock(row.get('matchEndTime')), 'venue': row.get('venueUnitName') or row.get('activityAreaName') or '',
            'home': home, 'away': away, 'status': status,
            'score': score if status == 'played' else None,
            'walkover': bool(row.get('hometeamWalkover') or row.get('awayteamWalkover'))
        }
    return games


def clock(value):
    if type(value) is not int or value < 0 or value >= 2400 or value % 100 > 59:
        return None
    return f'{value // 100:02}:{value % 100:02}'


def team(row, side, tracked):
    team_id = row[side + 'TeamId']
    entry = tracked.get(str(team_id), {})
    name = (row.get(side + 'TeamDisplayName') or row.get(side + 'TeamName') or 'Uavklart').strip()
    if entry.get('club') == 'vestnes-varfjell':
        name = name.replace('Vestnes/Varfjell', 'Vestnes Varfjell')
    return {'id': team_id, 'name': name, 'club': entry.get('club'), 'partners': entry.get('partners', [])}


def due(game, now):
    if game['status'] != 'scheduled' or not game['date'] or not game['start']:
        return False
    start = datetime.fromisoformat(game['date'] + 'T' + game['start']).replace(tzinfo=OSLO)
    end = datetime.fromisoformat(game['date'] + 'T' + game['end']).replace(tzinfo=OSLO) if game['end'] else start + timedelta(minutes=75)
    if end < start:
        end += timedelta(days=1)
    return end + timedelta(minutes=15) <= now <= end + timedelta(hours=4)


def read(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    tmp.replace(path)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--force', action='store_true', help='Refresh all tracked teams and tables')
    args = cli.parse_args()
    config = read(ROOT / 'config' / 'teams.json', {})
    old = read(DATA, {})
    state = read(STATE, {})
    now = datetime.now(OSLO)
    old_details = read(DETAILS, {})
    full = args.force or not old or old['season'] != config['season'] or state.get('fullDate') != now.date().isoformat()
    games = {m['id']: m for m in old.get('matches', [])}
    tables = old.get('tables', {})
    with ThreadPoolExecutor(max_workers=3) as pool:
        if full:
            team_rows = list(pool.map(lambda team_id: fixtures(team_id, config['seasonId']), config['teams']))
            new_games = normalize((m for rows in team_rows for m in rows), config)
            if not new_games:
                raise ValueError('Ingen kampar frå NHF for dei valde laga')
            if any(not rows for rows in team_rows):
                print('Eitt eller fleire lag har ei tom terminliste hos NHF.')
            ids = sorted({str(m['competitionId']) for m in new_games.values()})
            tables = dict(zip(ids, pool.map(standings, ids)))
            games = new_games
            state['fullDate'] = now.date().isoformat()
        else:
            ids = sorted({str(m['competitionId']) for m in games.values() if due(m, now)})
            for competition_id, rows in zip(ids, pool.map(competition_fixtures, ids)):
                updates = normalize(rows, config)
                if not updates:
                    raise ValueError(f'Ingen lokale kampar i turnering {competition_id}')
                games.update(updates)
            tables.update(zip(ids, pool.map(standings, ids)))
        details = refresh_matches(games, old_details, get, pool, now, daily=full, force=args.force)
    if details != old_details or not DETAILS.exists():
        save(DETAILS, details)
    payload = {
        'season': config['season'], 'clubs': config['clubs'], 'trackedTeamIds': [int(t) for t in config['teams']],
        'matches': sorted(games.values(), key=lambda m: (m['date'] or '9999-12-31', m['start'] or '24:00', m['id'])),
        'tables': tables
    }
    if payload != {k: v for k, v in old.items() if k != 'updatedAt'}:
        save(DATA, {**payload, 'updatedAt': now.isoformat(timespec='minutes')})
    save(STATE, state)
    print(f'{len(games)} lokale kampar, {len(ids)} oppdaterte turneringar og {len(details)} kampdetaljar.')


if __name__ == '__main__':
    main()
