"""Write short Nynorsk match reports using verified NHF scores and events."""

from collections import Counter
import re

SIDES = ('home', 'away')
NUMBERS = ('null', 'eitt', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve', 'tolv')


def number(value):
    return NUMBERS[value] if 0 <= value < len(NUMBERS) else str(value)


def result(score):
    return '–'.join(map(str, score))


def player_name(name):
    name = (name or '').strip()
    if re.search(r'ukjen[dt]|skjult|personinfo|tilgjengeleg|tilgjengelig', name, re.I):
        return ''
    return name if re.search(r'[^\W\d_]', name) else ''


def goal_sequence(details, score):
    """Accept chronology only when each goal advances the correct team's tally."""
    current = [0, 0]
    previous = (0, 0, 0)
    goals = []
    for event in details.get('events') or []:
        if not re.match(r'^(?:mål\b|7[ -]?meter.*mål)', event.get('label', ''), re.I):
            continue
        clock = re.fullmatch(r'(\d+):([0-5]\d)', event.get('time') or '')
        side = event.get('side')
        period = str(event.get('period') or '')
        if side not in SIDES or not clock or not period.isdecimal():
            return []
        stamp = (int(period), int(clock[1]), int(clock[2]))
        if stamp < previous:
            return []
        previous = stamp
        current[SIDES.index(side)] += 1
        if event.get('score') != current:
            return []
        goals.append(event)
    return goals if current == score else []


def halftime(details, goals, score):
    half = details.get('half')
    if (isinstance(half, list) and len(half) == 2 and
            all(type(n) is int and 0 <= n <= end for n, end in zip(half, score))):
        return half
    if {str(event['period']) for event in goals} >= {'1', '2'}:
        first = Counter(event['side'] for event in goals if str(event['period']) == '1')
        return [first[side] for side in SIDES]
    return None


def scoring_leaders(details, goals, side, team_score):
    rows = (details.get('lineups') or {}).get(side) or []
    player_goals = [(player_name(player.get('name')), (player.get('stats') or [None])[0]) for player in rows]
    if (player_goals and all(name and type(count) is int and count >= 0 for name, count in player_goals)
            and sum(count for _, count in player_goals) == team_score):
        counts = Counter({name: count for name, count in player_goals})
    else:
        counts = Counter(player_name(event.get('name')) for event in goals if event['side'] == side)
        counts.pop('', None)
    if not counts:
        return [], 0
    top = max(counts.values())
    return [name for name, count in counts.items() if count == top], top


def longest_run(goals, side):
    best = 0
    run = 0
    for event in goals:
        run = run + 1 if event['side'] == side else 0
        best = max(best, run)
    return best


def generate(match, details):
    score = match.get('score')
    if match['status'] != 'played' or score is None or match.get('walkover'):
        return None
    if details.get('score') != score:
        details = {}
    goals = goal_sequence(details, score)
    half = halftime(details, goals, score)
    teams = [match[side]['name'] for side in SIDES]
    leaders = [scoring_leaders(details, goals, side, score[i]) for i, side in enumerate(SIDES)]
    winner = None if score[0] == score[1] else int(score[1] > score[0])
    if winner is None:
        title = f'{teams[0]} og {teams[1]} spelte {result(score)}'
        lead = title + '.'
    else:
        other = 1 - winner
        winning, losing = teams[winner], teams[other]
        winning_score = result([score[winner], score[other]])
        title = f'{winning} vann {winning_score} mot {losing}'
        lead = title + '.'

    paragraphs = []
    if half is not None:
        if half[0] == half[1]:
            paragraphs.append(f'Det stod {result(half)} til pause.')
        else:
            leading = int(half[1] > half[0])
            paragraphs.append(f'{teams[leading]} leia {result([half[leading], half[1 - leading]])} til pause.')

    if winner is not None:
        names, top = leaders[winner]
        turned = half is not None and half[winner] < half[other]
        last_goal_decided = (len(goals) >= 2 and score[winner] - score[other] == 1 and
                             goals[-1]['side'] == SIDES[winner] and goals[-2]['score'][0] == goals[-2]['score'][1])
        run = longest_run(goals, SIDES[winner])
        if turned:
            title = f'{winning} snudde kampen etter pause'
        elif last_goal_decided:
            title = f'Siste mål sikra sigeren for {winning}'
        elif len(names) == 1 and top >= 5:
            title = f'{number(top).capitalize()} mål av {names[0]} då {winning} vann'
        elif run >= 5:
            title = f'{winning} skåra {number(run)} mål på rad mot {losing}'

        if last_goal_decided:
            last = goals[-1]
            period = int(last['period'])
            when = f"etter {last['time']} i {period}. omgang" if period in (1, 2) else f"ved {last['time']} på kampuret"
            paragraphs.append(f'Vinnarmålet kom {when}, då {winning} gjekk opp i {winning_score}.')
        elif run >= 5:
            paragraphs.append(f'{winning} skåra {number(run)} mål på rad i løpet av kampen.')

    scoring = []
    for i, (names, top) in enumerate(leaders):
        if top < 3:
            continue
        named = ' og '.join(filter(None, (', '.join(names[:-1]), names[-1])))
        each = ' kvar' if len(names) > 1 else ''
        scoring.append(f'{named} skåra {number(top)} mål{each} for {teams[i]}.')
    if scoring:
        paragraphs.append(' '.join(scoring))
    return {'title': title, 'lead': lead, 'paragraphs': paragraphs}
