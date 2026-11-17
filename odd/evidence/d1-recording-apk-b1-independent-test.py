"""Durable B1 independent probes; public fixtures only, never the real SDK runner."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

class IndependentB1(unittest.TestCase):
    def run_probe(self, name, count):
        here = Path(__file__).parent
        with tempfile.TemporaryDirectory(prefix='b1-independent-') as temporary:
            root = Path(temporary)
            for role in ('home', 'tmp', 'cache'):
                (root/role).mkdir()
            evidence = root/'work/odd/evidence'
            evidence.mkdir(parents=True)
            for module in ('d1-recording-apk-unit-b1.py', 'd1-recording-apk-sandbox.py'):
                shutil.copyfile(here/module, evidence/module)
            script = root/('admission-test.py' if count == 1 else 'independent-test.py')
            shutil.copyfile(here/name, script)
            env = dict(PATH='/usr/bin:/bin', HOME=str(root/'home'),
                       TMPDIR=str(root/'tmp'), XDG_CACHE_HOME=str(root/'cache'))
            result = subprocess.run(['/usr/bin/python3', '-B', str(script)], cwd=root,
                                    env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
            self.assertEqual(result.stdout, '')
            self.assertRegex(result.stderr, rf'\nRan {count} tests? in [0-9.]+s\n\nOK\n\Z')

    def test_public_preparation_guards(self):
        self.run_probe('d1-recording-apk-b1-independent-probe.py', 5)

    def test_public_admission_guards(self):
        self.run_probe('d1-recording-apk-b1-independent-admission.py', 1)

if __name__ == '__main__':
    unittest.main(verbosity=2)
