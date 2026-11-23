"""Public, synthetic checks for the new fixed B APK runner; never builds/signs."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).absolute().parent
SOURCE = 'd7e24f3e866833721ad6003ca1c86e825cfab0f2'


def load():
    spec = importlib.util.spec_from_file_location('b_apk_fixture', HERE/'d1-b-apk-build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FreshBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='b-apk-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.runner = load()

    def bundle(self, source=SOURCE, kind=tarfile.REGTYPE):
        body = b'// public synthetic input\n'
        name = 'vaca_app/lib/synthetic.dart'
        archive = self.root/'source.tar'
        with tarfile.open(archive, 'w') as stream:
            item = tarfile.TarInfo(name)
            item.mode = 0o644
            item.type = kind
            item.linkname = '/unrelated' if kind == tarfile.SYMTYPE else ''
            item.size = len(body) if kind == tarfile.REGTYPE else 0
            stream.addfile(item, io.BytesIO(body) if item.size else None)
        raw = archive.read_bytes()
        manifest = self.root/'manifest.json'
        manifest.write_text(json.dumps({
            'schema': 'vaca.d1.apk-public-source/v1', 'sourceCommit': source,
            'allowedExactPaths': [], 'allowedPrefixes': ['vaca_app/lib/'],
            'archiveSize': len(raw), 'archiveSha256': hashlib.sha256(raw).hexdigest(),
            'fileCount': 1, 'sourceBytes': len(body),
            'files': [{'path': name, 'mode': '100644', 'size': len(body),
                       'sha256': hashlib.sha256(body).hexdigest(),
                       'gitBlob': hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()}],
        }))
        return archive, manifest, hashlib.sha256(manifest.read_bytes()).hexdigest()

    def test_new_source_accepted_without_old_source_relabeling(self):
        archive, manifest, pin = self.bundle()
        result = self.runner.unpack_source(archive, manifest, self.root/'out', pin)
        self.assertEqual(result['sourceCommit'], SOURCE)
        self.assertEqual((self.root/'out/vaca_app/lib/synthetic.dart').read_bytes(), b'// public synthetic input\n')
        self.assertEqual(self.runner.SOURCE, SOURCE)

    def test_old_source_rejected_without_output(self):
        archive, manifest, pin = self.bundle(source='e7f870540bf8bd91df49de7869ca8f343689d9bd')
        before = (archive.read_bytes(), manifest.read_bytes())
        with self.assertRaises(ValueError):
            self.runner.unpack_source(archive, manifest, self.root/'out', pin)
        self.assertFalse((self.root/'out').exists())
        self.assertEqual(before, (archive.read_bytes(), manifest.read_bytes()))

    def test_archive_symlink_rejected_without_output(self):
        archive, manifest, pin = self.bundle(kind=tarfile.SYMTYPE)
        with self.assertRaises(ValueError):
            self.runner.unpack_source(archive, manifest, self.root/'out', pin)
        self.assertFalse((self.root/'out').exists())

    def test_wrong_manifest_pin_rejected_without_output(self):
        archive, manifest, _ = self.bundle()
        with self.assertRaises(ValueError):
            self.runner.unpack_source(archive, manifest, self.root/'out', '0'*64)
        self.assertFalse((self.root/'out').exists())

    def test_command_keeps_isolation_contract_and_advances_android_code(self):
        args = self.runner.command()
        for value in ('--build-name=0.1.0', '--build-number=2', '--no-pub',
                      '--target-platform=android-arm64', '--dart-define-from-file=/b3/config',
                      '--android-project-arg=kotlin.project.persistent.dir=/b3/state/kotlin'):
            self.assertEqual(args.count(value), 1)
        self.assertNotIn('--release', args)
        self.assertNotIn('unit-b3-kotlin-recovery', str(self.runner.ROOT))

    def test_descriptor_mismatch_creates_no_log(self):
        path = self.root/'synthetic-input'
        path.write_bytes(b'public')
        with path.open('rb') as handle:
            with self.assertRaises(ValueError):
                self.runner.capture(['/bin/true'], self.root/'log', descriptors=(handle.fileno(),))
        self.assertFalse((self.root/'log').exists())
        self.assertEqual(path.read_bytes(), b'public')

    def test_synthetic_rename_rejected_by_input_identity(self):
        config, signer = self.root/'config', self.root/'signer'
        config.write_text(json.dumps({key: self.runner.URL if key == 'SUPABASE_URL' else 'synthetic-public'
                                     for key in self.runner.KEYS}))
        signer.write_bytes(b'0'*2618)
        pin = hashlib.sha256(config.read_bytes()).hexdigest()
        # Renaming changes the open inode's ctime: the earlier identity guard wins.
        with self.assertRaisesRegex(ValueError, 'BAPK_INPUT_MUTATION'):
            with self.runner.open_inputs({'config': config, 'signer': signer}, pin):
                signer.rename(self.root/'retained-synthetic-input')
                signer.write_bytes(b'0'*2618)
        self.assertEqual(signer.read_bytes(), b'0'*2618)
        self.assertFalse((self.root/'build-invocation.json').exists())

    def test_existing_prepare_attempt_is_not_reopened(self):
        (self.root/'prepare-invocation.json').write_bytes(b'held-private-attempt')
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        self.assertEqual(self.runner.prepare('0'*64, root=self.root), 1)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})

    def test_existing_attempt_is_not_reopened(self):
        (self.root/'prepare.json').write_text('{"ready":true}')
        (self.root/'build-invocation.json').write_bytes(b'held-attempt')
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        self.assertEqual(self.runner.build('0'*64, root=self.root), 1)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})


if __name__ == '__main__':
    unittest.main()
