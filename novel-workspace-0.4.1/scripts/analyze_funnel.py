#!/usr/bin/env python3
"""Offline, session-based 0.4.1 measurement. No uploads or statistical uplift claims."""
import json
import math
import statistics
import sys
from pathlib import Path

VERSION = '0.4.1'
SCENARIOS = ('starter', 'character', 'outline', 'migration', 'world', 'timeline', 'clues', 'research')
STEPS = ('onboarding_view', 'route_selected', 'input_completed', 'first_artifact_ready', 'first_value_completed', 'deep_interaction')


def load_files(folder):
    events, seen = [], {}
    for path in sorted(Path(folder).glob('*.json')):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f'{path.name}: cannot read event export') from error
        if not isinstance(data, dict) or not isinstance(data.get('events'), list):
            raise ValueError(f'{path.name}: expected an object with an events array')
        for event in data['events']:
            if not isinstance(event, dict):
                continue
            ts = event.get('ts_ms')
            if (not isinstance(event.get('id'), str) or not event['id']
                    or not isinstance(event.get('session_id'), str) or not event['session_id']
                    or isinstance(ts, bool) or not isinstance(ts, (int, float)) or not math.isfinite(ts) or ts < 0
                    or not isinstance(event.get('event_name'), str)
                    or not isinstance(event.get('props', {}), dict)):
                raise ValueError(f'{path.name}: invalid event schema; use a fresh 0.4.1 export')
            if event['id'] in seen:
                if seen[event['id']] != event:
                    raise ValueError(f'{path.name}: conflicting duplicate event ID')
                continue
            seen[event['id']] = event
            events.append(event)
    return events


def group_sessions(events):
    sessions = {}
    for event in sorted(events, key=lambda item: item['ts_ms']):
        if event.get('funnel_version') == VERSION:
            sessions.setdefault(event['session_id'], []).append(event)
    # Partial retained sessions cannot supply reliable denominators or elapsed times.
    return {sid: rows for sid, rows in sessions.items() if first_event(rows, 'onboarding_view')
            and len({row.get('variant') for row in rows}) == 1
            and rows[0].get('variant') in ('control', 'treatment')}


def first_event(events, name):
    return next((event for event in events if event['event_name'] == name), None)


def session_route(events):
    delivered = first_event(events, 'first_artifact_ready')
    if delivered:
        return delivered.get('route')
    selected = [e for e in events if e['event_name'] == 'route_selected']
    return (selected[-1] if selected else first_event(events, 'onboarding_view') or {}).get('route')


def median_duration(sessions, end_event):
    durations = []
    for events in sessions.values():
        start, end = first_event(events, 'onboarding_view'), first_event(events, end_event)
        if start and end and end['ts_ms'] >= start['ts_ms']:
            durations.append((end['ts_ms'] - start['ts_ms']) / 1000)
    return statistics.median(durations) if durations else None


def open_intent_metrics(sessions):
    rows = [events for events in sessions.values() if session_route(events) == 'new_story']
    result = dict(sessions=len(rows), natural_language=0, template=0, blank=0, no_submission=0)
    for events in rows:
        submitted = next((e for e in events if e['event_name'] in ('intent_submitted', 'input_completed')
                          and e.get('route') == 'new_story' and e.get('props', {}).get('source') == 'onboarding'), None)
        mode = (submitted or {}).get('entry_mode')
        # Natural language and templates require an actual intent submission, never a selection click.
        if submitted and submitted['event_name'] == 'intent_submitted' and mode in ('natural_language', 'template'):
            result[mode] += 1
        elif submitted and mode == 'blank':
            result['blank'] += 1
        else:
            result['no_submission'] += 1
    return result


def scenario_metrics(sessions):
    result = {scenario: dict(impression=0, selected=0, intent_submitted=0, first_value=0) for scenario in SCENARIOS}
    for events in sessions.values():
        # One exposure/click per session per scenario; order is checked by event position.
        exposures, clicks = {}, {}
        for i, event in enumerate(events):
            sid = event.get('props', {}).get('scenario_id')
            if sid not in result:
                continue
            if event['event_name'] == 'scenario_impression':
                exposures.setdefault(sid, i)
            elif event['event_name'] == 'scenario_selected' and sid in exposures:
                clicks[sid] = i
        for sid in exposures:
            result[sid]['impression'] += 1
        for sid in clicks:
            result[sid]['selected'] += 1
        # Last selected visible card before the first submitted intent gets downstream credit.
        submit_index = next((i for i, e in enumerate(events) if e['event_name'] == 'intent_submitted'), None)
        if submit_index is None:
            continue
        prior = [(i, e) for i, e in enumerate(events[:submit_index]) if e['event_name'] == 'scenario_selected']
        if not prior:
            continue
        click_index, click = prior[-1]
        sid = click.get('props', {}).get('scenario_id')
        submitted = events[submit_index]
        if sid not in exposures or exposures[sid] >= click_index or submitted.get('props', {}).get('scenario_id') != sid:
            continue
        result[sid]['intent_submitted'] += 1
        if any(e['event_name'] == 'first_value_completed' for e in events[submit_index + 1:]):
            result[sid]['first_value'] += 1
    return result


def percent(numerator, denominator):
    return f'{numerator / denominator * 100:.1f}%' if denominator else 'n/a'


def report(label, sessions):
    print(f'\n[{label}] sessions: {len(sessions)}')
    for step in STEPS:
        count = sum(first_event(events, step) is not None for events in sessions.values())
        print(f'{step:26s} {count:4d}  {percent(count, len(sessions)):>6s}')
    for name, event in (('median TTFA (s)', 'first_artifact_ready'), ('median TTFV (s)', 'first_value_completed')):
        value = median_duration(sessions, event)
        print(f'{name}: {value:.1f}' if value is not None else f'{name}: n/a')
    metrics = open_intent_metrics(sessions)
    print(f'Open Intent | Route: new_story | sessions: {metrics["sessions"]}')
    for mode in ('natural_language', 'template', 'blank', 'no_submission'):
        print(f'  {mode}: {metrics[mode]} / {metrics["sessions"]} ({percent(metrics[mode], metrics["sessions"])})')
    print('Scenario Performance | unique session/scenario; last selection attribution')
    for sid, counts in scenario_metrics(sessions).items():
        print(f'  {sid}: impression={counts["impression"]} selected={counts["selected"]} '
              f'intent_submitted={counts["intent_submitted"]} first_value={counts["first_value"]} '
              f'CTR={percent(counts["selected"], counts["impression"])} '
              f'value_conversion={percent(counts["first_value"], counts["selected"])}')


def main(folder):
    events = load_files(folder)
    sessions = group_sessions(events)
    included = sum(len(rows) for rows in sessions.values())
    print(f'Measurement version: {VERSION}; excluded legacy/incomplete/mixed events: {len(events) - included}')
    print('Descriptive local sessions, not unique people or causal uplift. No real-user status inferred.')
    report('all', sessions)
    for variant in ('control', 'treatment'):
        subset = {sid: rows for sid, rows in sessions.items() if rows[0].get('variant') == variant}
        report(variant, subset)
        for route in ('new_story', 'migrate_existing'):
            report(f'{variant}/{route}', {sid: rows for sid, rows in subset.items() if session_route(rows) == route})


if __name__ == '__main__':
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else '.')
    except ValueError as error:
        raise SystemExit(str(error)) from error
