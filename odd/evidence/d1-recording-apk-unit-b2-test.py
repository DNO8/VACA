"""Finite public fixture checks only: never Java, Gradle, SDK or closed CLI."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('b2', Path(__file__).with_name('d1-recording-apk-unit-b2.py'))
b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b2)

class RedPreparation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='b2-public-', dir='/tmp')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.owned, self.run = self.root/'owned', self.root/'red'
        self.run.mkdir()
        self.templates = self.owned/'flutter-cache/artifacts/gradle_wrapper'
        self.state = dict(files=[], copied=[])
        for name in b2.SELECTED:
            path = self.owned/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(('public '+name).encode())
            path.chmod(0o755 if name.endswith(('gradlew', '/gradle')) else 0o644)
            record = b2.fingerprint(path)
            self.state['files'].append(['unused-public-original', str(path)])
            self.state['copied'].append(record)
        self.sdk = self.root/'sdk'  # Pure adapter argument, never mounted or executed.

    def test_only_root_offline_assertion_counts_as_red(self):
        result = dict(exit=1, reason='nonzero')
        stdout = 'B2_OFFLINE root=/app offline=false\n'
        stderr = '> B2_ROOT_OFFLINE_REQUIRED: offline=false before settings\n'
        before = {'settings.gradle': {'sha256': 'public', 'mode': 420}}
        self.assertTrue(b2.expected_red(result, stdout, stderr, before, before))
        actual = 'B2_ROOT_OFFLINE_REQUIRED: offline=false before settings\n'
        self.assertTrue(b2.expected_red(result, stdout, actual, before, before))
        cases = [(dict(exit=0, reason='ok'), stdout, stderr, before),
                 (result, '', 'missing cached distribution\n', before),
                 (dict(exit=-9, reason='timeout'), stdout, stderr, before),
                 (dict(exit=1, reason='output cap'), stdout, stderr, before),
                 (result, stdout, stderr, {}),
                 (dict(exit=2, reason='nonzero'), stdout, actual, before),
                 (result, stdout, 'unrelated failure\n', before),
                 (result, stdout, actual+stderr, before),
                 (result, 'B2_OFFLINE root=/app/included offline=false\n', stderr, before)]
        for outcome, out, err, after in cases:
            with self.subTest(outcome=outcome, stdout=out, after=after):
                self.assertFalse(b2.expected_red(outcome, out, err, before, after))

    def test_green_command_uses_policy_not_cli_assertion(self):
        args = b2.command()
        self.assertNotIn('--init-script=/b2/assert.gradle', args)
        self.assertNotIn('--offline', args)
        self.assertIn('-Porg.gradle.java.installations.paths='+str(b2.a.J), args)

    def test_selected_pins_and_ambient_metadata_refusal(self):
        pins = b2.selected_inputs(self.owned, self.state)
        self.assertEqual(len(pins), 9)
        path = self.owned/b2.SELECTED[0]
        path.chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'pin/mode'):
            b2.selected_inputs(self.owned, self.state)
        path.chmod(0o644)
        (self.owned/'gradle/gradle.properties').write_text('public-canary-not-to-read')
        before = b2.fingerprint(self.owned/'gradle/gradle.properties')
        with mock.patch.object(Path, 'open', side_effect=AssertionError('unexpected content read')):
            with self.assertRaisesRegex(ValueError, 'ambient Gradle input'):
                b2.selected_inputs(self.owned, self.state)
        self.assertEqual(b2.fingerprint(self.owned/'gradle/gradle.properties'), before)

    def test_unexpected_distribution_init_is_not_read(self):
        path = self.owned/'gradle'/b2.GRADLE/'init.d/unexpected.gradle'
        path.write_text('public canary')
        with mock.patch.object(Path, 'open', side_effect=AssertionError('unexpected content read')):
            with self.assertRaisesRegex(ValueError, 'unexpected init input'):
                b2.selected_inputs(self.owned, self.state)
        self.assertEqual(path.read_text(), 'public canary')

    def test_distribution_properties_are_refused_without_read(self):
        path = self.owned/'gradle'/b2.GRADLE/'gradle.properties'
        path.write_text('public canary not to inherit')
        with mock.patch.object(Path, 'open', side_effect=AssertionError('unexpected content read')):
            with self.assertRaisesRegex(ValueError, 'ambient Gradle input'):
                b2.selected_inputs(self.owned, self.state)
        self.assertEqual(path.read_text(), 'public canary not to inherit')

    def test_fixture_inputs_are_independent_and_hashed(self):
        before = b2.prepare(self.run, self.templates)
        self.assertEqual(len(before), 9)
        self.assertEqual(before, b2.snapshot(self.run))
        for name in b2.b.WRAPPERS:
            self.assertEqual(b2.fingerprint(self.templates/name), b2.fingerprint(self.run/'source'/name))
            self.assertNotEqual((self.templates/name).stat().st_ino, (self.run/'source'/name).stat().st_ino)
        script = (self.run/'assert.gradle').read_text()
        self.assertIn('gradle.beforeSettings', script)
        self.assertNotIn('setOffline', script)
        (self.run/'source/settings.gradle').chmod(0o600)
        self.assertNotEqual(before, b2.snapshot(self.run))

    def test_fixture_include_identity_is_explicit_and_matches_lookup(self):
        b2.prepare(self.run, self.templates)
        settings = (self.run/'source/settings.gradle').read_text()
        build = (self.run/'source/build.gradle').read_text()
        include = re.search(r"includeBuild\('included'\)\s*\{\s*name\s*=\s*'([^']+)'\s*\}", settings)
        lookup = re.search(r"includedBuild\('([^']+)'\)", build)
        self.assertIsNotNone(include, 'include identity must be explicit, not inferred from rootProject.name')
        self.assertIsNotNone(lookup)
        self.assertEqual(include.group(1), lookup.group(1))
        self.assertEqual(include.group(1), 'b2-included')

    def test_fixture_report_output_writable_but_source_readonly(self):
        before = b2.prepare(self.run, self.templates)
        base = b2.a.base_plan()+[token for name, dest in [('source', '/app'), ('home', '/owned/home'), ('android', '/owned/android')]
                              for token in ['--bind', str(self.owned/name), dest]]
        with mock.patch.object(b2.a, 'mount_plan', return_value=base):
            args = b2.plan(self.run, owned=self.owned)
        code = '''import errno,pathlib
p=pathlib.Path
report=p('/app/build/reports/problems/public.txt')
report.parent.mkdir(parents=True)
report.write_text('PUBLIC_OUTPUT')
assert report.read_text()=='PUBLIC_OUTPUT'
for target in ['/app/settings.gradle','/app/forbidden.txt']:
    try:
        p(target).write_text('must be rejected')
    except OSError as error:
        assert error.errno==errno.EROFS
    else:
        raise AssertionError('source became writable')
print('B2_PUBLIC_OUTPUT_AND_READONLY_PASS')
'''
        result = subprocess.run(args+['--', '/usr/bin/python3', '-I', '-c', code], env={'PATH': '/usr/bin:/bin'},
                                capture_output=True, text=True, timeout=10)
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, 'B2_PUBLIC_OUTPUT_AND_READONLY_PASS\n', ''))
        self.assertEqual((self.run/'build/reports/problems/public.txt').read_text(), 'PUBLIC_OUTPUT')
        self.assertEqual(before, b2.snapshot(self.run))
        self.assertEqual(list((self.run/'source/build').iterdir()), [])

    def test_adapter_structure_without_namespace_execution(self):
        b2.prepare(self.run, self.templates)
        base = b2.a.base_plan()+[token for name, dest in [('source', '/app'), ('home', '/owned/home'), ('android', '/owned/android')]
                              for token in ['--bind', str(self.owned/name), dest]]
        with mock.patch.object(b2.a, 'mount_plan', return_value=base.copy()):
            args = b2.plan(self.run, sdk=self.sdk, owned=self.owned, packages=[])
        for name in ('source', 'home', 'android'):
            self.assertNotIn(str(self.owned/name), args)
            self.assertIn(str(self.run/name), args)
        self.assertIn('--unshare-net', args)
        self.assertIn('--clearenv', args)
        self.assertIn(str(self.run/'tmp'), args)
        with mock.patch.object(b2.a, 'mount_plan', return_value=base.copy()):
            app = b2.plan(self.run, owned=self.owned, policy=True, app=True)
        self.assertIn(str(self.run/'build'), app)
        self.assertIn('/b2/public-placeholder', app)
        self.assertNotIn('/b2/assert.gradle', app)
        self.assertEqual(app[-2:], ['--chdir', '/app/vaca_app/android'])
        self.assertEqual(app[app.index(str(self.run/'source'))-1], '--ro-bind')

    def test_adapter_refuses_missing_duplicate_or_redirected_binds(self):
        base = ['--tmpfs', '/tmp']
        base += [token for name, dest in [('source', '/app'), ('home', '/owned/home'), ('android', '/owned/android')]
                 for token in ['--bind', str(self.owned/name), dest]]
        for args in [base[:-3], base+base[-3:], [arg if arg != '/app' else '/wrong' for arg in base], base+['--tmpfs', '/tmp']]:
            with self.subTest(args=args), mock.patch.object(b2.a, 'mount_plan', return_value=args):
                with self.assertRaisesRegex(ValueError, 'mismatch'):
                    b2.plan(self.run, owned=self.owned)

    def proof_output(self, app):
        return ('B2_OFFLINE app=/app/vaca_app/android offline=true\nB2_OFFLINE flutter='+str(b2.a.F/'packages/flutter_tools/gradle')+
                ' offline=true\nB2_MODEL variant=devDebug applicationId=cl.vaca.app.dev signingConfig=debug storeFile=/b2/public-placeholder\n') if app else (
                'B2_OFFLINE root=/app offline=true\nB2_OFFLINE included=/app/included offline=true\nB2_PUBLIC_INCLUDED_REPORT\n')

    def test_exact_offline_and_final_model_output(self):
        for app in (False, True):
            text = self.proof_output(app)
            b2.green_output(app, text)
            for bad in (text+text, text.replace('offline=true', 'offline=false'), text.replace('cl.vaca.app.dev', 'wrong'),
                        text.replace('signingConfig=debug', 'signingConfig=release'), text.replace('/b2/public-placeholder', '/wrong')):
                if bad != text:
                    with self.assertRaisesRegex(ValueError, 'proof'):
                        b2.green_output(app, bad)
        policy = (Path(b2.__file__).parent/'d1-recording-apk-unit-b2-policy.gradle').read_text()
        self.assertEqual(policy.splitlines()[0], 'gradle.startParameter.setOffline(true)')
        for token in ('plugins.withId', 'finalizeDsl', 'getApplicationVariants()', 'getSigningConfig()', 'getStoreFile()?.canonicalFile',
                      "task.project.path == ':'", "task.path == ':app:b2PublicModel'"):
            self.assertIn(token, policy)
        self.assertNotIn('import com.android', policy)

    def test_compile_groovy_exact_flutter_root_source_contract(self):
        # Textual contract only: this does not execute or simulate Gradle's graph.
        policy = Path(b2.__file__).with_name('d1-recording-apk-unit-b2-policy.gradle').read_bytes()
        guard = b"""        def allowed = (identity == appRoot && task.path == ':app:b2PublicModel') ||
            (identity in ['/app', '/app/included'] && task.path == ':b2PublicReport') ||
            (identity == flutterRoot && task.project.path == ':' && task.name in [
                'compileKotlin', 'compileJava', 'compileGroovy', 'pluginDescriptors', 'processResources',
                'classes', 'jar', 'checkKotlinGradlePluginConfigurationErrors'])
        if (!allowed) throw new GradleException("B2_REJECT_TASK: ${identity} ${task.path}")
"""
        self.assertIn(guard, policy,
                      'Exact Flutter-root/root-project only; same-name app/other-build/subproject and app assemble/package/sign must reject')
        self.assertEqual(policy.count(b"'compileGroovy'"), 1)
        normalized = policy.replace(b"'compileJava', 'compileGroovy',", b"'compileJava',")
        self.assertEqual(hashlib.sha256(normalized).hexdigest(),
                         '0722098f8f3c8232e597805a918f92ec65b43f7f167e4d44d5e553bfe2b601b4')

    def test_all_nine_generated_inputs_required_before_copy(self):
        previous = self.root/'prior-public'
        names = set(b2.b.OUTPUTS) | {'vaca_app/android/'+name for name in b2.b.WRAPPERS}
        for name in names:
            b2.a.create(previous/name, name.encode())
        generated = {name: b2.fingerprint(previous/name) for name in names}
        with mock.patch.object(b2.a, 'unpack', side_effect=AssertionError('must validate first')):
            missing = dict(generated); missing.pop('vaca_app/android/gradlew')
            with self.assertRaisesRegex(ValueError, 'presence'):
                b2.public_source(self.run, missing, previous)
            (previous/'vaca_app/android/gradlew').chmod(0o600)
            with self.assertRaisesRegex(ValueError, 'pin/mode'):
                b2.public_source(self.run, generated, previous)
        self.assertFalse((self.run/'source').exists())
        (previous/'vaca_app/android/gradlew').chmod(0o644)
        def unpack(_archive, _manifest, destination, _pin):
            path = destination/'vaca_app/public.txt'
            b2.a.create(path, b'original public fixture')
            return {'files': [dict(path='vaca_app/public.txt', sha256=b2.a.digest(path), mode='100644')]}
        with mock.patch.object(b2.a, 'unpack', side_effect=unpack):
            pins = b2.public_source(self.run, generated, previous)
        b2.a.copy_public(Path(b2.__file__).with_name('d1-recording-apk-unit-b2-policy.gradle'), self.run/'init.d/policy.gradle')
        b2.a.create(self.run/'placeholder', b'public fixture')
        self.assertEqual(len(b2.source_state(self.run, pins)['source']), 10)
        (self.run/'source/vaca_app/public.txt').write_text('mutation')
        with self.assertRaisesRegex(ValueError, 'pin/mode'):
            b2.source_state(self.run, pins)

    def exercise_run(self, fail):
        invocation, attempts = self.root/'one-shot', []
        accepted_capture, prepare = b2.b.capture, b2.prepare
        def capture(args, folder, seconds):
            app = args[-1] == ':app:b2PublicModel'
            attempts.append(app)
            self.assertEqual(seconds, 300 if app else 60)
            self.assertNotIn('--offline', args)
            self.assertIn('-Dorg.gradle.jvmargs='+b2.JVM, args)
            text, error = self.proof_output(app), 'unrelated setup failure\n' if fail else ''
            code = 'import sys; print('+repr(text)+',end=""); sys.stderr.write('+repr(error)+'); sys.exit('+str(int(fail))+')'
            return accepted_capture(['/usr/bin/python3', '-I', '-c', code], folder, seconds=5)
        def public_source(context, *_):
            path = context/'source/vaca_app/public.txt'
            b2.a.create(path, b'public')
            (context/'source/vaca_app/build').mkdir()
            return {'vaca_app/public.txt': b2.fingerprint(path)}
        out = io.StringIO()
        handoff = {'handoff': {str(b2.b.B/'receipt.json'): 'public'}}
        with mock.patch.object(b2, 'inputs', return_value=handoff), mock.patch.object(b2.b, 'pinned', return_value=b'{"postSource": {}}'), \
             mock.patch.object(b2, 'prepare', side_effect=lambda context, _: prepare(context, self.templates)), \
             mock.patch.object(b2, 'public_source', side_effect=public_source), mock.patch.object(b2, 'plan', return_value=['fixture-plan']), \
             mock.patch.object(b2.b, 'capture', side_effect=capture), contextlib.redirect_stdout(out):
            self.assertEqual(b2.run_green(invocation), int(fail))
        receipt = json.loads((invocation/'receipt.json').read_text())
        self.assertEqual(receipt['ready'], not fail)
        self.assertEqual(attempts, [False] if fail else [False, True])
        for phase in receipt['phases']:
            self.assertEqual(phase['before'], phase['after'])
            self.assertEqual(phase['result'], dict(exit=int(fail), reason='nonzero' if fail else 'ok'))
        self.assertEqual((invocation/'fixture/gradle/stderr').read_text(), 'unrelated setup failure\n' if fail else '')
        frozen, err = (invocation/'receipt.json').read_bytes(), io.StringIO()
        with mock.patch.object(b2, 'inputs', side_effect=AssertionError('must not admit again')), contextlib.redirect_stderr(err):
            self.assertEqual(b2.run_green(invocation), 1)
        self.assertEqual((invocation/'receipt.json').read_bytes(), frozen)
        self.assertEqual(err.getvalue(), 'B2 refused: GREEN invocation already exists; STOP\n')
        self.assertEqual(out.getvalue(), 'B2 STOP; see GREEN receipt.json\n' if fail else 'B2 PUBLIC GREEN PASS\n')

    def test_public_process_and_one_shot_receipt(self):
        self.exercise_run(False)

    def test_first_failure_preserved_and_app_not_attempted(self):
        self.exercise_run(True)

    def test_admission_failure_stops_before_preparation(self):
        invocation = self.root/'bad-admission'
        out = io.StringIO()
        with mock.patch.object(b2, 'inputs', side_effect=ValueError('fixture pin')), \
             mock.patch.object(b2, 'prepare', side_effect=AssertionError('must not prepare')), contextlib.redirect_stdout(out):
            self.assertEqual(b2.run_green(invocation), 1)
        receipt = json.loads((invocation/'receipt.json').read_text())
        self.assertEqual(receipt['failure'], 'ValueError: fixture pin')
        self.assertFalse(receipt['ready'])
        self.assertFalse((invocation/'fixture').exists())
        self.assertEqual(out.getvalue(), 'B2 STOP; see GREEN receipt.json\n')

if __name__ == '__main__':
    unittest.main(verbosity=2)
