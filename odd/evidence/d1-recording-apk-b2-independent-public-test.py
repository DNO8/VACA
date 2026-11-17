"""Independent B2 public guards (S2/S10/S11; S1/S6/S9 public scope only)."""
import contextlib, importlib.util, io, json, os, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('b2', Path(__file__).with_name('d1-recording-apk-unit-b2.py'))
b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b2)
CLEAN = dict(PATH='/usr/bin:/bin', HOME='/home', TMPDIR='/tmp', NODE_COMPILE_CACHE='/var/cache', NO_UPDATE_NOTIFIER='1')
def tree(root):
    return {str(p.relative_to(root)): b2.fingerprint(p) for p in root.rglob('*') if p.is_file() and not p.is_symlink()}
class IndependentPublic(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='independent-', dir=os.environ['TMPDIR']))
    def test_classifier(self):
        result, before = dict(exit=1, reason='nonzero'), {'public': {'sha256': 'fixed', 'mode': 420}}
        out, err = 'B2_OFFLINE root=/app offline=false\n', 'B2_ROOT_OFFLINE_REQUIRED: offline=false before settings\n'
        self.assertTrue(b2.expected_red(result, out, err, before, before))
        cases = [(dict(exit=-9, reason='timeout'), out, err, before), (dict(exit=1, reason='output cap'), out, err, before),
                 (dict(exit=2, reason='nonzero'), out, err, before), (result, out, 'unrelated failure\n', before),
                 (result, out*2, err, before), (result, out, err*2, before), (result, out, err, {}),
                 (result, out.replace('/app ', '/elsewhere '), err, before)]
        for args in cases:
            self.assertFalse(b2.expected_red(*args[:3], before, args[3]))
        self.assertEqual(before, {'public': {'sha256': 'fixed', 'mode': 420}})
    def test_generated_admission(self):
        prior, target = self.root/'prior', self.root/'target'
        names = set(b2.b.OUTPUTS) | {'vaca_app/android/'+n for n in b2.b.WRAPPERS}
        for name in names:
            b2.a.create(prior/name, b'PUBLIC_GENERATED')
        pins = {n: b2.fingerprint(prior/n) for n in names}
        name = 'vaca_app/android/gradlew'
        for defect, message in [('membership', 'B1 generated membership/presence'), ('hash', 'B1 generated pin/mode'),
                                ('mode', 'B1 generated pin/mode'), ('type', 'nonregular/shared public input')]:
            supplied = dict(pins)
            if defect == 'membership': supplied.pop(name)
            if defect == 'hash': supplied[name] = dict(pins[name], sha256='0'*64)
            if defect == 'mode': supplied[name] = dict(pins[name], mode=0)
            if defect == 'type': (prior/name).unlink(); (prior/name).mkdir()
            before = tree(prior)
            with patch.object(b2.a, 'unpack', side_effect=AssertionError('must not reach archive')):
                with self.assertRaisesRegex(ValueError, '^'+message+'$'):
                    b2.public_source(target, supplied, prior)
            self.assertEqual(tree(prior), before)
            self.assertFalse(target.exists())
    def fixture(self):
        context, templates = self.root/'fixture', self.root/'templates'
        context.mkdir()
        for name in b2.b.WRAPPERS: b2.a.create(templates/name, b'PUBLIC_WRAPPER')
        b2.prepare(context, templates)
        return context
    def test_real_readonly_output_namespace(self):
        context, owned = self.fixture(), self.root/'owned'
        (owned/'gradle'/b2.GRADLE).mkdir(parents=True)
        base = b2.a.base_plan()+[v for n,d in [('source','/app'),('home','/owned/home'),('android','/owned/android')]
                                for v in ['--bind',str(owned/n),d]]
        with patch.object(b2.a, 'mount_plan', return_value=base): args = b2.plan(context, owned=owned)
        before = tree(context/'source')
        code = """import errno, pathlib
p=pathlib.Path
for target in ['/app/settings.gradle','/app/new.txt']:
    try: p(target).write_text('NO')
    except OSError as e: assert e.errno==errno.EROFS
    else: raise AssertionError('source writable')
p('/app/build/public.txt').write_text('PUBLIC')
assert p('/app/build/public.txt').read_text()=='PUBLIC'
assert {x.split(':')[0].strip() for x in p('/proc/net/dev').read_text().splitlines()[2:]}=={'lo'}
print('INDEPENDENT_READONLY_OUTPUT_PASS')
"""
        envargs = [v for k,val in CLEAN.items() for v in [k+'='+val]]
        r = subprocess.run(args+['--','/usr/bin/env','-i',*envargs,'python3','-B','-c',code], env=CLEAN, capture_output=True, text=True, timeout=5)
        print(json.dumps(dict(probe='namespace', exit=r.returncode, stdout=r.stdout, stderr=r.stderr)))
        self.assertEqual((r.returncode,r.stdout,r.stderr),(0,'INDEPENDENT_READONLY_OUTPUT_PASS\n',''))
        self.assertEqual(tree(context/'source'), before)
        self.assertEqual((context/'build/public.txt').read_bytes(), b'PUBLIC')
        self.assertEqual(list((context/'source/build').iterdir()), [])
    def test_first_failure_stops_before_app(self):
        context, attempts, output = self.fixture(), [], io.StringIO()
        root, capture = self.root/'run', b2.b.capture
        def synthetic(args, folder, seconds):
            attempts.append(args)
            return capture(['/usr/bin/env','-i',*[k+'='+v for k,v in CLEAN.items()],'/usr/bin/python3','-B','-c',
                            "import sys; print('PUBLIC_FAIL'); sys.stderr.write('PUBLIC_ERROR\\n'); sys.exit(3)"], folder, seconds=3)
        with patch.object(b2, 'inputs', return_value={'handoff': {str(b2.b.B/'receipt.json'): 'fixture'}}), \
             patch.object(b2.b, 'pinned', return_value=b'{"postSource":{}}'), patch.object(b2, 'plan', return_value=['public-only']), \
             patch.object(b2, 'prepare', side_effect=lambda c,t: b2.prepare_fixture(c,t)), \
             patch.object(b2, 'public_source', side_effect=AssertionError('app must not start')), \
             patch.object(b2.b, 'capture', side_effect=synthetic), contextlib.redirect_stdout(output):
            rc = b2.run_green(root)
        receipt = json.loads((root/'receipt.json').read_bytes())
        self.assertEqual((rc,output.getvalue()),(1,'B2 STOP; see GREEN receipt.json\n'))
        self.assertEqual(len(attempts), 1)
        self.assertEqual([p['phase'] for p in receipt['phases']], ['fixture'])
        phase = receipt['phases'][0]
        self.assertEqual(phase['result'],dict(exit=3,reason='nonzero'))
        self.assertEqual(phase['before'],phase['after'])
        self.assertFalse(receipt['ready'])
        out, err = (root/'fixture/gradle/stdout').read_text(), (root/'fixture/gradle/stderr').read_text()
        print(json.dumps(dict(probe='first-failure',exit=rc,stdout=output.getvalue(),child=phase['result'],child_stdout=out,child_stderr=err)))
        self.assertEqual((out,err),('PUBLIC_FAIL\n','PUBLIC_ERROR\n'))
        frozen, rejected = tree(root), io.StringIO()
        with contextlib.redirect_stderr(rejected): self.assertEqual(b2.run_green(root),1)
        self.assertEqual(rejected.getvalue(),'B2 refused: GREEN invocation already exists; STOP\n')
        self.assertEqual(tree(root),frozen)
original_prepare = b2.prepare
# Resolve only synthetic wrapper templates prepared by this test, never real inputs.
def prepare_fixture(c,t):
    templates = c.parents[1]/'templates'
    return original_prepare(c,templates)
b2.prepare_fixture = prepare_fixture
if __name__ == '__main__': unittest.main(verbosity=2)
