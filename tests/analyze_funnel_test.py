import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'analyze_funnel.py'


def sample(session, variant, end_ms):
    names = ['onboarding_view', 'route_selected', 'input_completed', 'first_artifact_ready', 'first_value_completed']
    return [{'session_id': session, 'variant': variant, 'event_name': name, 'ts_ms': ts}
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


if __name__ == '__main__':
    unittest.main()
