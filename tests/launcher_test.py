import argparse
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('launch', ROOT / 'scripts/launch.py')
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class LauncherTests(unittest.TestCase):
    def test_port_is_explicit_and_bounded(self):
        self.assertEqual(launch.parse_port('8777'), 8777)
        for value in ['0', '65536', 'invalid', '8765;exit']:
            with self.assertRaises(argparse.ArgumentTypeError):
                launch.parse_port(value)

    @patch('builtins.print')
    @patch.object(launch.subprocess, 'run')
    def test_uses_current_python_absolute_script_and_same_port(self, run, output):
        run.return_value.returncode = 0
        self.assertEqual(launch.main(['--port', '8777']), 0)
        command = run.call_args.args[0]
        self.assertEqual(command, [sys.executable, '-B', str(ROOT / 'scripts/serve.py'), '--port', '8777', '--open'])
        self.assertEqual(run.call_args.kwargs['cwd'], ROOT)

    @patch('builtins.print')
    @patch('builtins.input', return_value='')
    @patch.object(launch.subprocess, 'run')
    def test_default_port_and_server_failure_propagate(self, run, prompt, output):
        run.return_value.returncode = 1
        self.assertEqual(launch.main(['--no-browser']), 1)
        self.assertEqual(run.call_args.args[0][-2:], ['--port', '8765'])
        self.assertNotIn('--open', run.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
