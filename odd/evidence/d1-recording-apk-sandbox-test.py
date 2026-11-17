"""Public fixtures only; no SDK, Git, network, or private-input access."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sandbox', Path(__file__).with_name('d1-recording-apk-sandbox.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class Boundaries(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='d1-public-fixture-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def bundle(self, change=None, kind=tarfile.REGTYPE):
        data = b'public fixture\n'
        row = dict(path='vaca_app/lib/main.dart', size=len(data), mode='100644',
                   sha256=hashlib.sha256(data).hexdigest(),
                   gitBlob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest())
        manifest = dict(schema='vaca.d1.apk-public-source/v1', sourceCommit=s.COMMIT,
                        allowedPrefixes=['vaca_app/lib/'], allowedExactPaths=[], files=[row],
                        fileCount=1, sourceBytes=len(data))
        if change:
            change(manifest)
        archive = self.root/'public.tar'
        with tarfile.open(archive, 'w') as out:
            member = tarfile.TarInfo(manifest['files'][0]['path'])
            member.size, member.mode, member.type = len(data), 0o644, kind
            member.linkname = 'public-target'
            out.addfile(member, io.BytesIO(data))
        manifest.update(archiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest(), archiveSize=archive.stat().st_size)
        path = self.root/'manifest.json'
        path.write_text(json.dumps(manifest))
        return archive, path, self.root/'source', hashlib.sha256(path.read_bytes()).hexdigest()

    def test_archive_rejections_leave_destination_absent(self):
        changes = [lambda m: m.update(sourceCommit='wrong'), lambda m: m.update(schema='wrong'),
                   lambda m: m.update(fileCount=2), lambda m: m.update(sourceBytes=0),
                   lambda m: m['files'].append(copy.deepcopy(m['files'][0]))]
        for field, value in [('path', '../outside'), ('path', '/outside'), ('path', 'vaca_app/lib/./a'),
                             ('path', 'vaca_app/other'), ('sha256', '0'*64), ('gitBlob', '0'*40), ('mode', '120000')]:
            changes.append(lambda m, f=field, v=value: m['files'][0].update({f: v}))
        for change in changes:
            with self.subTest(change=change):
                args = self.bundle(change)
                with self.assertRaises(ValueError):
                    s.unpack(*args)
                self.assertFalse(args[2].exists())
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind):
                args = self.bundle(kind=kind)
                with self.assertRaises(ValueError):
                    s.unpack(*args)
                self.assertFalse(args[2].exists())

    def test_pins_and_preservation(self):
        args = self.bundle()
        with self.assertRaises(ValueError):
            s.unpack(*args[:3], '0'*64)
        args[0].write_bytes(args[0].read_bytes()+b'changed')
        with self.assertRaises(ValueError):
            s.unpack(*args)
        args = self.bundle()
        s.unpack(*args)
        s.verify_source(args[2], json.loads(args[1].read_text()))
        (args[2]/'vaca_app/lib/main.dart').write_text('changed')
        with self.assertRaises(ValueError):
            s.verify_source(args[2], json.loads(args[1].read_text()))

    def test_path_guards_and_copy(self):
        src, dst = self.root/'public', self.root/'copy'
        src.write_text('public')
        dst.symlink_to(src)
        with self.assertRaises(ValueError):
            s.copy_public(src, dst)
        self.assertEqual(src.read_text(), 'public')
        with self.assertRaises(ValueError):
            s.copy_public(dst, self.root/'other')
        s.copy_public(src, self.root/'valid')
        self.assertEqual((self.root/'valid').read_bytes(), src.read_bytes())
        self.assertNotEqual((self.root/'valid').stat().st_ino, src.stat().st_ino)

    def test_unexpected_source_nodes_preserve_state(self):
        for kind in ('directory', 'symlink'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as tmp:
                args = self.bundle()
                root = Path(tmp)/'source'
                s.unpack(args[0], args[1], root, args[3])
                extra = root/'vaca_app/lib/unexpected'
                extra.mkdir() if kind == 'directory' else extra.symlink_to(root/'vaca_app/lib')
                before = (root/'vaca_app/lib/main.dart').read_bytes()
                with self.assertRaisesRegex(ValueError, 'unexpected source|symlink'):
                    s.verify_source(root, json.loads(args[1].read_text()))
                self.assertEqual((root/'vaca_app/lib/main.dart').read_bytes(), before)
                self.assertTrue(extra.is_symlink() if kind == 'symlink' else extra.is_dir())

    def test_bounded_index_and_rejected_cache_nodes(self):
        root = self.root/'cache'
        root.mkdir()
        (root/'sub').mkdir()
        (root/'sub/public').write_text('public')
        state = dict(queue=[[str(root), str(self.root/'out')]], files=[])
        before = copy.deepcopy(state)
        next_state = s.index_batch(state, limit=1)
        self.assertEqual(state, before)
        self.assertEqual(len(next_state['queue']), 1)
        self.assertEqual(next_state['files'], [])
        final = s.index_batch(next_state, limit=1)
        self.assertFalse(final['queue'])
        self.assertEqual(len(final['files']), 1)
        for kind in ('link', 'fifo'):
            bad = root/kind
            bad.symlink_to(root/'sub/public') if kind == 'link' else __import__('os').mkfifo(bad)
            with self.assertRaisesRegex(ValueError, 'symlink|nonregular'):
                s.index_batch(dict(queue=[[str(bad), str(self.root/'out')]], files=[]))
            self.assertEqual(state, before)
            self.assertFalse((self.root/'out').exists())
        with self.assertRaisesRegex(ValueError, 'missing public input'):
            s.index_batch(dict(queue=[[str(root/'missing'), str(self.root/'out')]], files=[]))
        with self.assertRaisesRegex(ValueError, 'directory entry limit'):
            s.index_batch(state, directory_limit=0)

    def test_copy_batch_preflight_and_cache_preservation(self):
        from unittest.mock import patch
        good, huge = self.root/'good', self.root/'huge'
        good.write_text('public')
        with huge.open('wb') as f:
            f.truncate(512*1024*1024+1)
        state = dict(queue=[], files=[[str(good), str(self.root/'out/a')], [str(huge), str(self.root/'out/b')]], copied=[], verified=0, probed=False)
        before = copy.deepcopy(state)
        with patch.object(s, 'W', self.root):
            with self.assertRaisesRegex(ValueError, 'smaller bounded input'):
                s.stage('copy', state)
            self.assertEqual(state, before)
            self.assertFalse((self.root/'out').exists())
            state['files'] = state['files'][:1]
            copied = s.stage('copy', state)
            self.assertEqual(good.read_text(), 'public')
            (self.root/'out/a').write_text('mutated')
            before = copy.deepcopy(copied)
            with self.assertRaisesRegex(ValueError, 'cache hash changed'):
                s.stage('verify', copied)
            self.assertEqual(copied, before)
            self.assertEqual(good.read_text(), 'public')

    def test_nonregular_source_rejected_before_read(self):
        from unittest.mock import patch
        fifo = self.root/'public-fifo'
        __import__('os').mkfifo(fifo)
        manifest = dict(files=[dict(path='public-fifo', sha256='0'*64, mode='100644')])
        with patch.object(s, 'digest', side_effect=AssertionError('must not read FIFO')):
            with self.assertRaisesRegex(ValueError, 'nonregular source'):
                s.verify_source(self.root, manifest)
        self.assertTrue(fifo.exists())

    def test_public_namespace(self):
        result = s.fixture_probe(self.root)
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, 'PUBLIC_NAMESPACE_PASS\n', ''))

    def test_real_mount_assembly_version_layout(self):
        from unittest.mock import patch
        import subprocess
        for version_exists in (False, True):
            with self.subTest(version_exists=version_exists), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                sdk, owned = root/'sdk', root/'owned'
                for path in ('bin/cache', 'packages/flutter_tools/gradle', '.git', '.pub-cache/hosted/pub.dev/public-1'):
                    (sdk/path).mkdir(parents=True)
                for name in ('flutter-cache', 'flutter-gradle', 'source', 'home', 'pub', 'gradle', 'android', 'fixture'):
                    (owned/name).mkdir(parents=True)
                (sdk/'bin/public-component').write_text('public')
                (owned/'source/public-source').write_text('unchanged')
                (owned/'version').write_text('3.41.9\n')
                (owned/'fixture/public-marker').write_text('public\n')
                if version_exists:
                    (sdk/'version').write_text('original\n')
                before = {str(p.relative_to(sdk)): p.read_bytes() for p in sdk.rglob('*') if p.is_file()}
                with patch.object(s, 'J', root/'jdk'), patch.object(s, 'A', root/'android-sdk'):
                    s.J.mkdir()
                    s.A.mkdir()
                    plan = s.mount_plan(sdk=sdk, owned=owned, view=root/'view', packages=[sdk/'.pub-cache/hosted/pub.dev/public-1'])
                    code = '''import pathlib, errno
p=pathlib.Path
assert (F/'version').read_text() == '3.41.9\\n'
assert (F/'bin/public-component').read_text() == 'public'
for target in (F/'root-denial', F/'bin/component-denial'):
    try: target.write_text('no')
    except OSError as e: assert e.errno == errno.EROFS
    else: raise AssertionError('SDK writable')
for target in (F/'bin/cache/proof', F/'packages/flutter_tools/gradle/proof', p('/owned/pub/proof')):
    target.write_text('owned')
assert p('/app/public-source').read_text() == 'unchanged'
mounts=p('/proc/self/mountinfo').read_text().splitlines()
for target in (F, F/'bin', F/'packages', F/'.git'):
    assert any(line.split()[4] == str(target) and 'ro' in line.split()[5].split(',') for line in mounts)
print('SDK_LAYOUT_PASS')
'''
                    result = subprocess.run(plan+['--', '/usr/bin/python3', '-I', '-c', 'from pathlib import Path\nF=Path('+repr(str(s.F))+')\n'+code], capture_output=True, text=True, env={'PATH': '/usr/bin:/bin'}, timeout=10)
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, 'SDK_LAYOUT_PASS\n', ''))
                self.assertEqual(before, {str(p.relative_to(sdk)): p.read_bytes() for p in sdk.rglob('*') if p.is_file()})
                self.assertEqual((owned/'source/public-source').read_text(), 'unchanged')

    def l16_fixture(self):
        from unittest.mock import patch
        archive, manifest, _, pin = self.bundle()
        work, target = self.root/'unit-a', self.root/'unit-a-l16'
        work.mkdir()
        s.create(work/'preparation.lock', b'')
        s.create(self.root/'public-source.tar', archive.read_bytes())
        s.create(self.root/'public-source-manifest.json', manifest.read_bytes())
        s.unpack(archive, manifest, work/'source', pin)
        origin = self.root/'public-metadata.json'
        origin.write_text(json.dumps(dict(frameworkVersion='3.41.9', flutterVersion='3.41.9')))
        dest = work/'flutter-cache/flutter.version.json'
        record = s.copy_public(origin, dest)
        state = dict(queue=[], files=[[str(origin), str(dest)]], copied=[record], verified=1, probed=False)
        s.create(work/s.L16_STATE, json.dumps(state).encode())
        for name, body in [('version', b'3.41.9\n'), ('fixture/public-marker', b'public\n'), ('flutter-cache/lockfile', b''), ('mount-plan.json', b'[]'), ('source-receipt.json', json.dumps(dict(sourceCommit=s.COMMIT, manifestSha256=pin)).encode())]:
            s.create(work/name, body)
        for run, exitcode, error, action in [(s.L16_FAIL, '1', s.L16_ERROR, 'probe'), (s.L16_GOOD, '0', '', 'verify')]:
            output = json.dumps(dict(stage='verify', pending=0, files=1, copied=1, verified=1, probed=False, ready=False))+'\n' if action == 'verify' else ''
            for name, body in [('exit', exitcode), ('stderr', error), ('stdout', output), ('binding', action+' '+s.L16_OLD_HELPER+'\n')]:
                s.create(work/run/name, body.encode())
        pins = {name: s.digest(work/name) for name in s.L16_PINS}
        for name, value in [('W', work), ('T', self.root), ('L16_DIR', target), ('PIN', pin), ('L16_PINS', pins), ('L16_COUNTS', (2, 1, 1))]:
            context = patch.object(s, name, value)
            context.start()
            self.addCleanup(context.stop)
        return work, target, pins

    def test_l16_exact_handoff_and_second_admission(self):
        work, target, _ = self.l16_fixture()
        before = {str(p): p.read_bytes() for p in work.rglob('*') if p.is_file()}
        state = s.open_l16()
        self.assertEqual(state['verified'], 1)
        admission = json.loads((target/'admission.json').read_text())
        self.assertEqual(admission['grant'], 'L16')
        self.assertEqual(admission['predecessor'], s.L16_FAIL)
        self.assertEqual(admission['stateSha256'], s.digest(work/s.L16_STATE))
        with self.assertRaisesRegex(ValueError, 'L16 already attempted'):
            s.open_l16()
        self.assertEqual(before, {str(p): p.read_bytes() for p in work.rglob('*') if p.is_file()})

    def test_l16_rejections_do_not_create_context(self):
        work, target, pins = self.l16_fixture()
        original = (work/s.L16_STATE).read_bytes()
        for change in [dict(queue=[['pending', 'pending']]), dict(verified=0), dict(copied=[]), dict(probed=True)]:
            state = json.loads(original)
            state.update(change)
            (work/s.L16_STATE).write_text(json.dumps(state))
            pins[s.L16_STATE] = s.digest(work/s.L16_STATE)
            before = (work/s.L16_STATE).read_bytes()
            with self.assertRaisesRegex(ValueError, 'incomplete predecessor'):
                s.open_l16()
            self.assertFalse(target.exists())
            self.assertEqual((work/s.L16_STATE).read_bytes(), before)
        (work/s.L16_STATE).write_bytes(original)
        pins[s.L16_STATE] = s.digest(work/s.L16_STATE)
        for name in [s.L16_FAIL+'/stderr', 'source-receipt.json', 'version']:
            path = work/name
            body = path.read_bytes()
            path.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                s.open_l16()
            self.assertFalse(target.exists())
            self.assertEqual(path.read_bytes(), b'changed')
            path.write_bytes(body)
        from unittest.mock import patch
        with patch.dict(pins, {'missing-receipt': '0'*64}):
            with self.assertRaisesRegex(ValueError, 'missing predecessor receipt'):
                s.open_l16()
        with patch.object(s, 'PIN', '0'*64):
            with self.assertRaisesRegex(ValueError, 'manifest pin'):
                s.open_l16()
        self.assertFalse(target.exists())
        (work/'run-unexpected').mkdir()
        with self.assertRaisesRegex(ValueError, 'predecessor history'):
            s.open_l16()
        self.assertFalse(target.exists())

    def test_l16_postcheck_required_and_failure_stops(self):
        from unittest.mock import patch
        from contextlib import redirect_stdout, redirect_stderr
        from subprocess import CompletedProcess
        work, target, _ = self.l16_fixture()
        before = {str(p): p.read_bytes() for p in work.rglob('*') if p.is_file()}
        with patch.object(s, 'mount_plan', return_value=[]), patch.object(s, 'namespace_probe', return_value=CompletedProcess([], 0, 'PUBLIC_NAMESPACE_PASS\n', '')), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(s.l16_main('mount-l16'), 0)
        proof = json.loads((target/'progress-00000.json').read_text())
        self.assertEqual((proof['verified'], proof['ready']), (0, False))
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(s.l16_main('verify-l16'), 0)
        self.assertTrue(json.loads((target/'progress-00001.json').read_text())['ready'])
        self.assertEqual(before, {str(p): p.read_bytes() for p in work.rglob('*') if p.is_file()})
        # A separate public-context failure must not be ignored by verification.
        s.create(target/'run-unexpected/exit', b'1')
        snapshot = {str(p): p.read_bytes() for p in target.rglob('*') if p.is_file()}
        error = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(error):
            self.assertEqual(s.l16_main('verify-l16'), 1)
        self.assertIn('L16 failed/incomplete run; STOP', error.getvalue())
        self.assertEqual(snapshot, {str(p): p.read_bytes() for p in target.rglob('*') if p.is_file()})

    def test_help_describes_bounded_stages(self):
        import subprocess
        result = subprocess.run(['python3', '-B', str(Path(s.__file__)), '--help'], capture_output=True, text=True)
        self.assertEqual((result.returncode, result.stderr), (0, ''))
        self.assertNotIn('Run prepare repeatedly', result.stdout)
        self.assertIn('{roots,index,copy,verify,probe,mount-l16,verify-l16}', result.stdout)

if __name__ == '__main__':
    unittest.main(verbosity=2)
