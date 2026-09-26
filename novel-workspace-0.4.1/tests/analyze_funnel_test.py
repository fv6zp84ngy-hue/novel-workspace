import json
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'analyze_funnel.py'
spec = importlib.util.spec_from_file_location('analyze_funnel', SCRIPT)
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


def sample(session, variant, end_ms):
    names = ['onboarding_view', 'route_selected', 'input_completed', 'first_artifact_ready', 'first_value_completed']
    return [{'id': f'{session}-{name}', 'session_id': session, 'variant': variant, 'event_name': name, 'ts_ms': ts, 'funnel_version': '0.4.1', 'route':'new_story'}
            for name, ts in zip(names, [1000, 1100, 1200, 1500, end_ms])]


class FunnelReportTests(unittest.TestCase):
    def test_summarizes_all_and_variants_with_median_durations(self):
        with tempfile.TemporaryDirectory() as folder:
            exports = [sample('c1', 'control', 3100), sample('t1', 'treatment', 2100)]
            for index, events in enumerate(exports):
                Path(folder, f'{index}.json').write_text(json.dumps({'schema_version': 1, 'events': events}), encoding='utf-8')
            result = subprocess.run([sys.executable, str(SCRIPT), folder], check=True, capture_output=True, text=True)
            self.assertIn('[all] sessions: 2', result.stdout)
            self.assertIn('[control] sessions: 1', result.stdout)
            self.assertIn('[treatment] sessions: 1', result.stdout)
            self.assertIn('median TTFA (s): 0.5', result.stdout)
            self.assertIn('median TTFV (s): 1.6', result.stdout)

    def test_reports_empty_folder_without_division_error(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(SCRIPT), folder], check=True, capture_output=True, text=True)
            self.assertIn('[all] sessions: 0', result.stdout)
            self.assertIn('median TTFV (s): n/a', result.stdout)

    def test_rejects_malformed_export_with_filename(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'bad.json').write_text('{not json', encoding='utf-8')
            result = subprocess.run([sys.executable, str(SCRIPT), folder], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('bad.json', result.stderr)

    def test_open_intent_uses_new_story_only_and_submission_not_selection(self):
        def row(name, mode, route='new_story'):
            return dict(event_name=name, entry_mode=mode, route=route, props={'source':'onboarding'})
        sessions = {
            'natural': [row('intent_submitted', 'natural_language'), row('first_artifact_ready', None)],
            'template': [row('intent_submitted', 'template'), row('first_artifact_ready', None)],
            'abandon': [row('route_selected', None), row('entry_mode_selected', 'natural_language')],
            'migrate': [row('first_artifact_ready', None, 'migrate_existing')],
        }
        metrics = analysis.open_intent_metrics(sessions)
        self.assertEqual(metrics, dict(sessions=3, natural_language=1, template=1, blank=0, no_submission=1))

    def test_scenarios_deduplicate_and_attribute_to_last_selection_before_submission(self):
        def row(name, scenario=None):
            return dict(event_name=name, props={'scenario_id':scenario})
        rows = [row('scenario_impression','character'),row('scenario_impression','character'),
                row('scenario_selected','character'),row('scenario_selected','character'),
                row('scenario_impression','outline'),row('scenario_selected','outline'),
                row('intent_submitted','outline'),row('first_value_completed')]
        metrics = analysis.scenario_metrics({'s':rows})
        self.assertEqual(metrics['character'],dict(impression=1,selected=1,intent_submitted=0,first_value=0))
        self.assertEqual(metrics['outline'],dict(impression=1,selected=1,intent_submitted=1,first_value=1))
        # A click without an earlier exposure and a value before submission get no credit.
        rows = [row('scenario_selected','character'),row('first_value_completed'),row('intent_submitted','character')]
        self.assertEqual(analysis.scenario_metrics({'s':rows})['character']['first_value'],0)

    def test_duplicate_exports_are_idempotent_and_conflicting_ids_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            events=sample('one','control',3100)
            for filename in ['a.json','b.json']:
                Path(folder,filename).write_text(json.dumps({'events':events}))
            self.assertEqual(len(analysis.load_files(folder)),len(events))
            events[0]['ts_ms']=2000
            Path(folder,'b.json').write_text(json.dumps({'events':events}))
            with self.assertRaisesRegex(ValueError,'conflicting duplicate'):
                analysis.load_files(folder)

    def test_excludes_legacy_partial_and_mixed_variant_sessions(self):
        rows=sample('ok','control',3100)
        legacy=[{**e,'funnel_version':'0.4.0'} for e in sample('old','control',3100)]
        partial=sample('partial','control',3100)[1:]
        mixed=sample('mixed','control',3100)
        mixed[-1]['variant']='treatment'
        self.assertEqual(list(analysis.group_sessions(rows+legacy+partial+mixed)),['ok'])

    def test_invalid_timestamp_is_not_silently_counted(self):
        with tempfile.TemporaryDirectory() as folder:
            for timestamp in [True, float('nan'), -1]:
                events=sample('one','control',3100)
                events[0]['ts_ms']=timestamp
                Path(folder,'bad.json').write_text(json.dumps({'events':events}))
                with self.assertRaisesRegex(ValueError,'invalid event schema'):
                    analysis.load_files(folder)


if __name__ == '__main__':
    unittest.main()
