"""Public B3 API/namespace tests; never open the real configuration or signer."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('b3_public_test', HERE/'d1-recording-apk-unit-b3.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PublicGates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root/'config.json'
        self.signer = self.root/'public-signer'
        self.config.write_text(json.dumps({key: m.URL if key == 'SUPABASE_URL' else 'PUBLIC_FIXTURE' for key in m.KEYS}))
        self.signer.write_bytes(b'PUBLIC' + b'x' * 2612)
        self.paths = {'config': self.config, 'signer': self.signer}
        self.pin = hashlib.sha256(self.config.read_bytes()).hexdigest()

    def test_valid_inputs_bound_to_open_descriptors_and_preserved(self):
        before = {key: path.read_bytes() for key, path in self.paths.items()}
        with m.open_inputs(self.paths, self.pin) as (records, bindings):
            self.assertEqual(set(records), {'config', 'signer'})
            for key in self.paths:
                self.assertEqual(Path(bindings[key]).read_bytes(), before[key])
                self.assertEqual(records[key]['sha256'], hashlib.sha256(before[key]).hexdigest())
                self.assertNotIn('PUBLIC_FIXTURE', json.dumps(records))
        self.assertEqual(before, {key: path.read_bytes() for key, path in self.paths.items()})

    def test_wrong_hash_rejects_without_outputs(self):
        before = sorted(self.root.iterdir())
        with self.assertRaises(ValueError):
            with m.open_inputs(self.paths, '0'*64):
                self.fail('invalid input admitted')
        self.assertEqual(sorted(self.root.iterdir()), before)

    def test_wrong_schema_even_when_hash_matches(self):
        self.config.write_text('{"unexpected":"DO_NOT_DISCLOSE"}')
        pin = hashlib.sha256(self.config.read_bytes()).hexdigest()
        with self.assertRaises(ValueError) as error:
            with m.open_inputs(self.paths, pin):
                self.fail('invalid schema admitted')
        self.assertNotIn('DO_NOT_DISCLOSE', str(error.exception))

    def test_links_and_wrong_sizes_refuse(self):
        for kind in ('symlink', 'hardlink', 'short'):
            with self.subTest(kind=kind):
                candidate = self.root/kind
                if kind == 'symlink': candidate.symlink_to(self.signer)
                elif kind == 'hardlink': os.link(self.signer, candidate)
                else: candidate.write_bytes(b'short')
                try:
                    with self.assertRaises(ValueError):
                        with m.open_inputs(dict(self.paths, signer=candidate), self.pin):
                            self.fail('invalid signer admitted')
                finally:
                    candidate.unlink()

    def test_mutation_is_detected_after_use(self):
        with self.assertRaises(ValueError):
            with m.open_inputs(self.paths, self.pin):
                self.signer.write_bytes(b'y'*2618)

    def test_path_substitution_does_not_change_descriptor_and_is_rejected(self):
        with self.assertRaises(ValueError):
            with m.open_inputs(self.paths, self.pin) as (_, bindings):
                original = self.signer.read_bytes()
                self.signer.rename(self.root/'old')
                self.signer.write_bytes(b'z'*2618)
                self.assertEqual(Path(bindings['signer']).read_bytes(), original)

    def test_exact_replacement_refuses_missing_and_duplicate_bindings(self):
        old = ['--ro-bind', 'old', '/target']
        for args in ([], old+old):
            saved = args.copy()
            with self.assertRaises(ValueError): m.replace(args, old, ['--ro-bind', 'new', '/target'])
            self.assertEqual(args, saved)
        args = old.copy()
        m.replace(args, old, ['--ro-bind', 'new', '/target'])
        self.assertEqual(args, ['--ro-bind', 'new', '/target'])

    def test_original_source_membership_and_mutation(self):
        source = self.root/'source'
        (source/'vaca_app/android/.gradle').mkdir(parents=True)
        (source/'vaca_app/build').mkdir()
        file = source/'vaca_app/input'
        file.write_text('PUBLIC')
        pins = {'vaca_app/input': m.b2.fingerprint(file)}
        self.assertEqual(m.source_state(self.root, pins), pins)
        file.write_text('changed')
        with self.assertRaises(ValueError): m.source_state(self.root, pins)
        file.write_text('PUBLIC')
        (source/'vaca_app/extra').write_text('unexpected')
        with self.assertRaises(ValueError): m.source_state(self.root, pins)

    def test_protected_output_rejects_links_and_large_artifact(self):
        (self.root/'build/app/outputs/flutter-apk').mkdir(parents=True)
        apk = self.root/m.APK
        apk.write_bytes(b'PK\x03\x04PUBLIC')
        result = m.artifact(self.root, maximum=64)
        self.assertEqual(result['size'], apk.stat().st_size)
        self.assertEqual(apk.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ValueError): m.artifact(self.root, maximum=2)
        apk.rename(apk.with_suffix('.saved'))
        apk.symlink_to(apk.with_suffix('.saved'))
        with self.assertRaises(ValueError): m.artifact(self.root)

    def test_existing_context_refuses_before_private_access(self):
        self.assertEqual(m.ROOT, m.a.T/'unit-b3-variant-recovery')
        with patch.object(m, 'ROOT', self.root), patch.object(m, 'open_inputs') as private:
            self.assertEqual(m.prepare(), 1)
            private.assert_not_called()

    def test_no_build_before_ready_receipt_or_second_invocation(self):
        with patch.object(m, 'ROOT', self.root), patch.object(m, 'open_inputs') as private:
            self.assertEqual(m.build(), 1)
            private.assert_not_called()
            self.assertFalse((self.root/'build-invocation.json').exists())

    def test_build_command_preserves_pinned_flavor_and_no_pub(self):
        command = m.command()
        self.assertIn('--no-pub', command)
        self.assertEqual(command[command.index('--flavor')+1], 'dev')
        self.assertIn('--target-platform=android-arm64', command)
        self.assertIn('--dart-define-from-file=/b3/config', command)
        self.assertNotIn('--offline', command)

    def test_launcher_first_failure_stops_all_further_jvm_attempts(self):
        for name in ('state', 'original'):
            (self.root/name).mkdir()
        # The executed production launcher is unchanged; only namespace paths differ.
        (self.root/'original/gradlew').write_text(
            '#!/usr/bin/env bash\n'
            'function splitJvmOpts() {\n    JVM_OPTS=("$@")\n}\n'
            'splitJvmOpts ORIGINAL_FAILURE\n'
            'printf "%s\\n" "${JVM_OPTS[@]}" >&2\nexit 7\n'
        )
        args = ['/usr/bin/bwrap', '--unshare-net', '--unshare-pid', '--die-with-parent', '--clearenv',
                '--tmpfs', '/', '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin',
                '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev',
                '--setenv', 'PATH', '/usr/bin:/bin', '--bind', str(self.root/'state'), '/b3/state',
                '--ro-bind', str(self.root/'original/gradlew'), '/b3/gradlew',
                '--ro-bind', str(HERE/'d1-recording-apk-unit-b3-launcher.sh'), '/launcher.sh',
                '--', '/bin/sh', '/launcher.sh']
        wrong = subprocess.run(args+['clean'], capture_output=True, timeout=10)
        self.assertEqual((wrong.returncode, wrong.stdout, wrong.stderr), (1, b'', b'B3_REJECT_REQUEST\n'))
        self.assertEqual(list((self.root/'state').iterdir()), [])
        first = subprocess.run(args+['assembleDevDebug'], capture_output=True, timeout=10)
        self.assertEqual((first.returncode, first.stdout, first.stderr), (7, b'', b'ORIGINAL_FAILURE\n'))
        before = sorted(p.name for p in (self.root/'state').iterdir())
        second = subprocess.run(args+['assembleDevDebug'], capture_output=True, timeout=10)
        self.assertEqual((second.returncode, second.stdout, second.stderr), (1, b'', b'B3_REJECT_RETRY\n'))
        self.assertEqual(sorted(p.name for p in (self.root/'state').iterdir()), before)

if __name__ == '__main__':
    unittest.main()
