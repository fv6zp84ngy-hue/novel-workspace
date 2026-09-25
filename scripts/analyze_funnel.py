#!/usr/bin/env python3
"""Summarize locally exported Novel Workspace funnel events without network access."""
import json
import statistics
import sys
from pathlib import Path

STEPS = (
    'onboarding_view', 'route_selected', 'input_completed',
    'first_artifact_ready', 'first_value_completed', 'deep_interaction',
)


def load_files(folder):
    events = []
    for path in sorted(Path(folder).glob('*.json')):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f'{path}: cannot read event export: {error}') from error
        if not isinstance(data, dict) or not isinstance(data.get('events'), list):
            raise ValueError(f'{path}: expected an object with an events array')
        for event in data['events']:
            if not isinstance(event, dict):
                continue
            if isinstance(event.get('session_id'), str) and isinstance(event.get('ts_ms'), (int, float)) and isinstance(event.get('event_name'), str):
                events.append(event)
    return events


def group_sessions(events):
    sessions = {}
    for event in sorted(events, key=lambda item: item['ts_ms']):
        sessions.setdefault(event['session_id'], []).append(event)
    return sessions


def first_event(events, name):
    return next((event for event in events if event['event_name'] == name), None)


def median_duration(sessions, end_event):
    durations = []
    for events in sessions.values():
        start, end = first_event(events, 'onboarding_view'), first_event(events, end_event)
        if start and end and end['ts_ms'] >= start['ts_ms']:
            durations.append((end['ts_ms'] - start['ts_ms']) / 1000)
    return statistics.median(durations) if durations else None


def report(label, sessions):
    print(f'\n[{label}] sessions: {len(sessions)}')
    for step in STEPS:
        count = sum(first_event(events, step) is not None for events in sessions.values())
        rate = count / len(sessions) * 100 if sessions else 0
        print(f'{step:26s} {count:4d}  {rate:6.1f}%')
    for name, event in (('median TTFA (s)', 'first_artifact_ready'), ('median TTFV (s)', 'first_value_completed')):
        value = median_duration(sessions, event)
        print(f'{name}: {value:.1f}' if value is not None else f'{name}: n/a')


def main(folder):
    sessions = group_sessions(load_files(folder))
    report('all', sessions)
    for variant in ('control', 'treatment'):
        subset = {session_id: events for session_id, events in sessions.items()
                  if next((event.get('variant') for event in events if event.get('variant')), 'unknown') == variant}
        if subset:
            report(variant, subset)


if __name__ == '__main__':
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else '.')
    except ValueError as error:
        raise SystemExit(str(error)) from error
