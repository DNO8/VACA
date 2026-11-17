"""B1 glue fixtures only; no real SDK or closed-stage execution."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('b1', Path(__file__).with_name('d1-recording-apk-unit-b1.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

def stat_mode(path):
    return path.stat().st_mode & 0o777

class PublicPreparation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='b1-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run = self.root/'invocation'

    def test_input_pin_rejects_before_writes(self):
        src = self.root/'public'
        src.write_bytes(b'public')
        before = src.read_bytes()
        with self.assertRaisesRegex(ValueError, '^input pin: public$'):
            b.pinned(src, '0'*64)
        self.assertEqual(src.read_bytes(), before)
        self.assertFalse(self.run.exists())
        self.assertEqual(b.pinned(src, hashlib.sha256(before).hexdigest()), before)

    def test_closed_handoff_and_selected_inputs(self):
        root, sdk = self.root, self.root/'sdk'
        work, closed = root/'unit-a', root/'unit-a-l16'
        for attr, value in [('T', root), ('W', work), ('F', sdk), ('L16_DIR', closed)]:
            ctx = patch.object(b.a, attr, value)
            ctx.start()
            self.addCleanup(ctx.stop)
        contents = {root/'public-source-manifest.json': b'{}', root/'public-source.tar': b'archive',
                    sdk/'packages/flutter_tools/.dart_tool/package_config.json': b'{}',
                    closed/'admission.json': json.dumps(dict(helperSha256=b.HELPER_PIN, sourceCommit=b.a.COMMIT, sourceManifestSha256='manifest')).encode(),
                    closed/'mount-plan.json': b'[]'}
        names = ['dart-sdk/bin/dart', 'flutter_tools.snapshot', 'flutter.version.json']+['artifacts/gradle_wrapper/'+n for n in b.WRAPPERS]
        records, files = [], []
        for name in names:
            path = work/'flutter-cache'/name
            data = json.dumps(dict(frameworkVersion='3.41.9', flutterVersion='3.41.9', dartSdkVersion='3.11.5')).encode() if name == 'flutter.version.json' else b'public'
            b.a.create(path, data)
            files.append(['public-origin', str(path)])
            records.append(dict(sha256=b.a.digest(path), mode=stat_mode(path)))
        contents[work/b.a.L16_STATE] = json.dumps(dict(files=files, copied=records)).encode()
        for path, data in contents.items():
            b.a.create(path, data)
        hashes = {p: b.a.digest(p) for p in contents}
        for obj, attr, value in [(b, 'ARCHIVE_PIN', hashes[root/'public-source.tar']), (b.a, 'PIN', hashes[root/'public-source-manifest.json']), (b, 'TOOL_PIN', hashes[sdk/'packages/flutter_tools/.dart_tool/package_config.json']), (b, 'ADMISSION_PIN', hashes[closed/'admission.json']), (b, 'PLAN_PIN', hashes[closed/'mount-plan.json']), (b.a, 'L16_PINS', {b.a.L16_STATE: hashes[work/b.a.L16_STATE]})]:
            ctx = patch.object(obj, attr, value)
            ctx.start()
            self.addCleanup(ctx.stop)
        admission = json.loads(contents[closed/'admission.json'])
        # Admission pin and content must agree, not just progress counters.
        admission['sourceManifestSha256'] = b.a.PIN
        (closed/'admission.json').write_text(json.dumps(admission))
        ctx = patch.object(b, 'ADMISSION_PIN', b.a.digest(closed/'admission.json'))
        ctx.start()
        self.addCleanup(ctx.stop)
        b.a.create(work/'version', b'3.41.9\n')
        proof = dict(ready=True, probed=True, verified=47284, admission=b.ADMISSION_PIN, plan=b.PLAN_PIN)
        b.a.create(closed/'progress-00746.json', json.dumps(proof).encode())
        with patch.object(b.a, 'tool_roots', return_value=[]):
            self.assertIn(str(work/'flutter-cache/dart-sdk/bin/dart'), b.inputs())
            proof['ready'] = False
            (closed/'progress-00746.json').write_text(json.dumps(proof))
            with self.assertRaisesRegex(ValueError, 'closed proof incomplete'):
                b.inputs()
            self.assertFalse(self.run.exists())
            proof['ready'] = True
            (closed/'progress-00746.json').write_text(json.dumps(proof))
            (work/'flutter-cache/dart-sdk/bin/dart').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'input pin: dart'):
                b.inputs()
            self.assertFalse(self.run.exists())

    def source(self):
        source = self.run/'source'
        p = source/'vaca_app/pubspec.lock'
        b.a.create(p, b'pinned')
        p.chmod(0o644)
        manifest = dict(files=[dict(path='vaca_app/pubspec.lock', sha256=b.a.digest(p), mode='100644')])
        return source, manifest

    def test_source_generated_boundary(self):
        source, manifest = self.source()
        self.assertEqual(b.boundary(source, manifest, {}), {})
        p = source/'vaca_app/.dart_tool/package_config.json'
        b.a.create(p, b'{}')
        self.assertEqual(b.boundary(source, manifest, {})[str(p.relative_to(source))]['sha256'], b.a.digest(p))
        for change, message in [('pinned', 'pinned source changed'), ('unknown', 'unclassified output'), ('symlink', 'symlink')]:
            with self.subTest(change=change):
                if change == 'pinned':
                    (source/'vaca_app/pubspec.lock').write_bytes(b'changed')
                elif change == 'unknown':
                    b.a.create(source/'vaca_app/unexpected', b'public')
                else:
                    (source/'vaca_app/unexpected').unlink()
                    p.unlink()
                    p.symlink_to(source/'vaca_app/pubspec.lock')
                before = (source/'vaca_app/pubspec.lock').read_bytes()
                with self.assertRaisesRegex(ValueError, message):
                    b.boundary(source, manifest, {})
                self.assertEqual((source/'vaca_app/pubspec.lock').read_bytes(), before)
                (source/'vaca_app/pubspec.lock').write_bytes(b'pinned')

    def test_wrappers_preserve_tracked_inputs(self):
        source, manifest = self.source()
        wrapper = self.root/'gradlew'
        wrapper.write_bytes(b'public wrapper')
        wrapper.chmod(0o755)
        generated = b.wrappers(source, manifest, {'gradlew': wrapper})
        self.assertEqual((source/'vaca_app/android/gradlew').read_bytes(), wrapper.read_bytes())
        self.assertEqual((source/'vaca_app/pubspec.lock').read_bytes(), b'pinned')
        self.assertEqual(len(b.boundary(source, manifest, generated)), 1)

    def test_plan_uses_same_assembler_and_scoped_replacements(self):
        sdk, old = self.root/'sdk', self.root/'old'
        for rel in ('bin/cache', 'packages/flutter_tools/gradle', '.git'):
            (sdk/rel).mkdir(parents=True)
        for name in ('source', 'home', 'android', 'pub', 'gradle', 'flutter-cache', 'flutter-gradle', 'fixture'):
            (old/name).mkdir(parents=True)
        b.a.create(old/'fixture/public-marker', b'public\n')
        b.a.create(old/'version', b'3.41.9\n')
        b.a.create(old/'flutter-cache/lockfile', b'')
        for name in ('source', 'home', 'android', 'tmp'):
            (self.run/name).mkdir(parents=True)
        (self.run/'source/vaca_app').mkdir()
        with patch.object(b, 'B', self.run), patch.object(b.a, 'W', old), patch.object(b.a, 'J', sdk), patch.object(b.a, 'A', sdk), patch.object(b.a, 'tool_roots', return_value=[]):
            plan = b.plan(self.run, sdk=sdk)
        self.assertIn('--clearenv', plan)
        self.assertIn('--unshare-net', plan)
        self.assertIn('--die-with-parent', plan)
        self.assertNotIn('FLUTTER_ALREADY_LOCKED', plan)
        binds = {plan[i+2]: plan[i+1] for i, token in enumerate(plan) if token == '--bind'}
        self.assertEqual(binds['/app'], str(self.run/'source'))
        self.assertEqual(binds['/owned/home'], str(self.run/'home'))
        self.assertEqual(binds['/owned/android'], str(self.run/'android'))
        self.assertEqual(binds['/owned/pub'], str(old/'pub'))
        self.assertEqual(binds['/tmp'], str(self.run/'tmp'))
        code = f"import os,pathlib,fcntl; assert os.environ['HOME']=='/owned/home'; assert 'B1_AMBIENT' not in os.environ; assert os.readlink('/proc/self/ns/net') != {os.readlink('/proc/self/ns/net')!r}; f=open({str(b.a.F/'bin/cache/lockfile')!r},'r+'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); assert not list(pathlib.Path('/owned/android').iterdir()); print('PUBLIC_B1_PLAN_PASS')"
        result = b.capture(plan+['--', '/usr/bin/python3', '-I', '-c', code], self.run/'probe', seconds=2)
        self.assertEqual(result, dict(exit=0, reason='ok'))
        self.assertEqual((self.run/'probe/stdout').read_bytes(), b'PUBLIC_B1_PLAN_PASS\n')
        self.assertEqual((self.run/'probe/stderr').read_bytes(), b'')
        argv = b.commands()['pub']
        self.assertEqual(argv[-5:], ['pub', 'get', '--offline', '--enforce-lockfile', '--no-example'])
        self.assertTrue(argv[1].startswith('--packages='))

    def test_launch_failure_keeps_empty_logs(self):
        folder = self.root/'missing-launch'
        with self.assertRaises(FileNotFoundError):
            b.capture([str(self.root/'missing-public-executable')], folder)
        self.assertEqual((folder/'stdout').read_bytes(), b'')
        self.assertEqual((folder/'stderr').read_bytes(), b'')
        self.assertEqual((folder/'exit').read_text(), '-1')

    def test_generated_hardlinks_reject(self):
        source, manifest = self.source()
        outside = self.root/'public-origin'
        outside.write_bytes(b'public')
        dest = source/'vaca_app/.dart_tool/package_config.json'
        dest.parent.mkdir()
        os.link(outside, dest)
        with self.assertRaisesRegex(ValueError, 'shared generated output'):
            b.boundary(source, manifest, {})
        self.assertEqual(outside.read_bytes(), b'public')

    def test_timeout_kills_public_process_tree(self):
        import select
        code = "import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(5)']); print(p.pid,flush=True); time.sleep(5)"
        result = b.capture([sys.executable, '-I', '-c', code], self.root/'tree', seconds=.15)
        self.assertEqual(result['reason'], 'timeout')
        pid = int((self.root/'tree/stdout').read_text())
        try:
            fd = os.pidfd_open(pid)
        except ProcessLookupError:
            return
        try:
            self.assertEqual(select.select([fd], [], [], 2)[0], [fd])
        finally:
            os.close(fd)

    def test_first_failure_preserves_phase_receipts_and_stops(self):
        manifest = dict(files=[dict(path='vaca_app/pubspec.lock', sha256=hashlib.sha256(b'pinned').hexdigest(), mode='100644')])
        def unpack(archive, manifest_path, source, pin):
            b.a.create(source/'vaca_app/pubspec.lock', b'pinned')
            (source/'vaca_app/pubspec.lock').chmod(0o644)
            return manifest
        calls, real_capture = [], b.capture
        def capture(argv, folder, seconds):
            calls.append(folder.name)
            return real_capture([sys.executable, '-I', '-c', "import sys; sys.exit(7)" if folder.name == 'smoke' else "print('B1_NAMESPACE_PASS')"], folder, seconds=2)
        with patch.object(b, 'B', self.run), patch.object(b, 'inputs', return_value={'public': 'pin'}), patch.object(b.a, 'unpack', side_effect=unpack), patch.object(b, 'wrappers', return_value={}), patch.object(b, 'plan', return_value=[]), patch.object(b, 'capture', side_effect=capture), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(b.main(), 1)
        self.assertEqual(calls, ['namespace', 'smoke'])
        self.assertEqual(out.getvalue(), 'B1 FAIL; see unit-b1/receipt.json\n')
        receipt = json.loads((self.run/'receipt.json').read_text())
        self.assertFalse(receipt['ready'])
        self.assertEqual([r['result']['exit'] for r in receipt['phases']], [0, 7])
        self.assertIn('postSource', receipt)
        self.assertTrue((self.run/'namespace/result.json').exists())
        self.assertFalse((self.run/'pub').exists())
        before = (self.run/'receipt.json').read_bytes()
        with patch.object(b, 'B', self.run), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(b.main(), 1)
        self.assertEqual((self.run/'receipt.json').read_bytes(), before)

    def test_bounded_process_receipts_and_one_shot(self):
        for name, code, seconds, cap, reason, output, error in [
            ('ok', "print('public')", 2, 1000, 'ok', b'public\n', b''),
            ('exit', "import sys; print('public-error', file=sys.stderr); sys.exit(7)", 2, 1000, 'nonzero', b'', b'public-error\n'),
            ('cap', "print('x'*10000)", 2, 100, 'output cap', None, None),
            ('timeout', 'import time; time.sleep(5)', .05, 1000, 'timeout', b'', b'')]:
            with self.subTest(name=name):
                folder = self.root/name
                receipt = b.capture([sys.executable, '-I', '-c', code], folder, seconds=seconds, cap=cap)
                self.assertEqual(receipt['reason'], reason)
                if reason == 'ok':
                    self.assertEqual(receipt['exit'], 0)
                elif reason == 'nonzero':
                    self.assertEqual(receipt['exit'], 7)
                self.assertEqual(json.loads((folder/'result.json').read_text()), receipt)
                if output is not None:
                    self.assertEqual((folder/'stdout').read_bytes(), output)
                    self.assertEqual((folder/'stderr').read_bytes(), error)
                if reason == 'output cap':
                    self.assertEqual((folder/'stdout').read_bytes(), b'x'*cap)
                    self.assertEqual((folder/'stderr').read_bytes(), b'')
                before = (folder/'result.json').read_bytes()
                with self.assertRaises(FileExistsError):
                    b.capture([sys.executable, '-c', 'pass'], folder)
                self.assertEqual((folder/'result.json').read_bytes(), before)
        self.run.mkdir()
        out, err = io.StringIO(), io.StringIO()
        with patch.object(b, 'B', self.run), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(b.main(), 1)
        self.assertEqual((out.getvalue(), err.getvalue()), ('', 'B1 refused: invocation already exists\n'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
