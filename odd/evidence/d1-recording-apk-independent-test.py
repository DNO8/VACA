"""Independent Unit A regressions: S1-S4; public synthetic inputs only."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

class IndependentUnitA(unittest.TestCase):
    def run_probe(self, name):
        here = Path(__file__).parent
        with tempfile.TemporaryDirectory(prefix='d1-independent-') as temporary:
            root = Path(temporary)
            for role in ('home', 'tmp', 'cache'):
                (root / role).mkdir()
            module = root / 'work/odd/evidence/d1-recording-apk-sandbox.py'
            module.parent.mkdir(parents=True)
            shutil.copyfile(here / 'd1-recording-apk-sandbox.py', module)
            script = root / 'independent.py'
            shutil.copyfile(here / name, script)
            env = dict(PATH='/usr/bin:/bin', HOME=str(root/'home'),
                       TMPDIR=str(root/'tmp'), NODE_COMPILE_CACHE=str(root/'cache'),
                       NO_UPDATE_NOTIFIER='1')
            result = subprocess.run(['/usr/bin/python3', '-B', str(script)],
                                    env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stderr, '')
            return result.stdout

    def test_layout_and_continuation(self):
        self.assertIn('INDEPENDENT_PASS assertions=31',
                      self.run_probe('d1-recording-apk-independent-probe.py'))

    def test_failure_and_binding(self):
        self.assertIn('FOLLOWUP_PASS assertions=13',
                      self.run_probe('d1-recording-apk-independent-followup.py'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
