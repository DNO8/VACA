"""Worker-authored synthetic S4 regressions; no SDK/build/private input.
Portable extraction from mwtemwdl-l-uxo0. Interruption fixture raises once;
the extracted suite requires its own observed execution, not inherited PASS.
"""
import ast
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent


class IndependentControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="b-control-independent-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        spec = importlib.util.spec_from_file_location(
            "independent_candidate", HERE / "d1-b-apk-build.py")
        self.r = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.r)

    @staticmethod
    def sha(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def snapshot(self):
        return {
            str(p.relative_to(self.root)): self.sha(p)
            for p in self.root.rglob("*")
            if p.is_file() and not p.is_symlink()
        }

    def private_fixture(self):
        config, signer = self.root / "config", self.root / "signer"
        config.write_text(json.dumps({
            key: self.r.URL if key == "SUPABASE_URL" else "public"
            for key in self.r.KEYS
        }))
        signer.write_bytes(b"0" * 2618)
        return {"config": config, "signer": signer}, self.sha(config)

    def bundle(self, source=None, symlink=False):
        body, name = b"x", "vaca_app/lib/probe.dart"
        archive, manifest = self.root / "a.tar", self.root / "m.json"
        with tarfile.open(archive, "w") as tar:
            member = tarfile.TarInfo(name)
            member.mode, member.size = 0o644, 1
            if symlink:
                member.type = tarfile.SYMTYPE
                member.linkname, member.size = "/outside", 0
            tar.addfile(member, io.BytesIO(body) if member.size else None)
        manifest.write_text(json.dumps({
            "schema": "vaca.d1.apk-public-source/v1",
            "sourceCommit": source or self.r.SOURCE,
            "archiveSize": archive.stat().st_size,
            "archiveSha256": self.sha(archive),
            "fileCount": 1, "sourceBytes": 1,
            "allowedExactPaths": [name], "allowedPrefixes": [],
            "files": [{
                "path": name, "mode": "100644", "size": 1,
                "sha256": hashlib.sha256(body).hexdigest(),
                "gitBlob": hashlib.sha1(b"blob 1\0" + body).hexdigest(),
            }],
        }))
        return archive, manifest

    def test_source_admission_and_immutable_membership(self):
        """S4: admitted source cannot change or gain generated members."""
        archive, manifest = self.bundle()
        destination = self.root / "source"
        m = self.r.unpack_source(archive, manifest, destination, self.sha(manifest))
        pins = {row["path"]: {"sha256": row["sha256"],
                "mode": int(row["mode"], 8) & 0o777} for row in m["files"]}
        for name in self.r.SCAFFOLDS:
            (destination / name).mkdir(parents=True, mode=0o700)
        self.assertEqual(self.r.source_state(self.root, pins), pins)
        path = destination / m["files"][0]["path"]
        path.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "^BAPK_SOURCE_CHANGED$"):
            self.r.source_state(self.root, pins)
        path.write_bytes(b"x")
        (destination / "vaca_app/unknown-generated").write_bytes(b"x")
        with self.assertRaisesRegex(ValueError, "^BAPK_SOURCE_MEMBERSHIP$"):
            self.r.source_state(self.root, pins)

    def test_wrong_source_rejected_without_mutation(self):
        archive, manifest = self.bundle(source="e7f870540bf8bd91df49de7869ca8f343689d9bd")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "^source/schema$"):
            self.r.unpack_source(archive, manifest, self.root / "out", self.sha(manifest))
        self.assertFalse((self.root / "out").exists())
        self.assertEqual(before, self.snapshot())

    def test_symlink_archive_rejected_without_mutation(self):
        archive, manifest = self.bundle(symlink=True)
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "^archive type/membership$"):
            self.r.unpack_source(archive, manifest, self.root / "out", self.sha(manifest))
        self.assertFalse((self.root / "out").exists())
        self.assertEqual(before, self.snapshot())

    def test_corrupt_archive_rejected_without_mutation(self):
        archive, manifest = self.bundle()
        archive.write_bytes(archive.read_bytes() + b"X")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "^archive pin$"):
            self.r.unpack_source(archive, manifest, self.root / "out", self.sha(manifest))
        self.assertFalse((self.root / "out").exists())
        self.assertEqual(before, self.snapshot())

    def test_private_descriptor_identity(self):
        paths, pin = self.private_fixture()
        before = self.snapshot()
        with self.r.open_inputs(paths, pin) as (_, bindings):
            for binding in bindings.values():
                fd = self.r.descriptor(binding)
                self.assertEqual(fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE, os.O_RDONLY)
        self.assertEqual(before, self.snapshot())
        os.link(paths["signer"], self.root / "duplicate")
        with self.assertRaisesRegex(ValueError, "^BAPK_INPUT_TYPE_SIZE$"):
            with self.r.open_inputs(paths, pin):
                self.fail("shared input admitted")
        (self.root / "duplicate").unlink()
        with self.assertRaisesRegex(ValueError, "^BAPK_INPUT_MUTATION$"):
            with self.r.open_inputs(paths, pin):
                paths["signer"].write_bytes(b"1" * 2618)

    def test_capture_inherits_only_declared_mount_descriptors(self):
        path = self.root / "input"
        path.write_bytes(b"public")
        with path.open("rb") as handle:
            fd = handle.fileno()
            with self.assertRaisesRegex(ValueError, "^BAPK_DESCRIPTOR_MEMBERSHIP$"):
                self.r.capture(["/bin/true"], self.root / "bad", descriptors=(fd,))
            self.assertFalse((self.root / "bad").exists())
            code = ("import os,sys; n=int(sys.argv[2]); "
                    "print(os.read(n,6).decode()); print(os.get_inheritable(n))")
            result = self.r.capture(
                ["/usr/bin/python3", "-I", "-c", code, "--ro-bind-fd", str(fd)],
                self.root / "ok", seconds=3, descriptors=(fd,))
        self.assertEqual(result, {"exit": 0, "reason": "ok"})
        self.assertEqual((self.root / "ok/stdout").read_bytes(), b"public\nTrue\n")
        self.assertEqual((self.root / "ok/stderr").read_bytes(), b"")

    def test_capture_limits(self):
        result = self.r.capture(
            ["/usr/bin/python3", "-I", "-c", "import time; time.sleep(5)"],
            self.root / "timeout", seconds=.1)
        self.assertEqual(result, {"exit": -9, "reason": "timeout"})
        result = self.r.capture(
            ["/usr/bin/python3", "-I", "-c", 'print("x"*20000)'],
            self.root / "cap", seconds=3, cap=32)
        self.assertEqual(result["reason"], "output cap")
        self.assertEqual((self.root / "cap/stdout").stat().st_size, 32)

    def test_prepare_interruption_is_not_replayable(self):
        seed = {"ready": True, "source": {}, "controls": {}}
        path = self.root / "seed.json"
        path.write_text(json.dumps(seed))

        def interrupt(root):
            self.assertTrue((root / "prepare-invocation.json").is_file())
            raise KeyboardInterrupt()

        with patch.object(self.r, "public_inputs", interrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.r.prepare(self.sha(path), root=self.root)
        self.assertFalse(json.loads((self.root / "prepare.json").read_text())["ready"])
        before = self.snapshot()
        self.assertEqual(self.r.prepare("0" * 64, root=self.root), 1)
        self.assertEqual(before, self.snapshot())

    def test_build_interruption_is_not_replayable(self):
        """Corrected fixture: interrupt once, allow final boundary gates."""
        prepared = {"ready": True, "source": {}, "controls": {}, "publicInputs": {}}
        path = self.root / "prepare.json"
        path.write_text(json.dumps(prepared))
        pin, calls = self.sha(path), []

        def interrupt_once(root):
            self.assertTrue((root / "build-invocation.json").is_file())
            calls.append(root)
            if len(calls) == 1:
                raise KeyboardInterrupt()
            return {}

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(self.r, "controls", interrupt_once))
            for name in ("source_state", "public_inputs", "output_state"):
                stack.enter_context(patch.object(self.r, name, lambda *args: {}))
            with self.assertRaises(KeyboardInterrupt):
                self.r.build(pin, root=self.root)
        self.assertFalse(json.loads((self.root / "build.json").read_text())["ready"])
        before = self.snapshot()
        self.assertEqual(self.r.build(pin, root=self.root), 1)
        self.assertEqual(before, self.snapshot())

    def test_output_gate_and_fixed_command(self):
        for name in ("build", "dart-tool", "generated", "project-cache", "state", "owned"):
            (self.root / name).mkdir(mode=0o700)
        self.assertEqual(self.r.output_state(self.root), {"entries": 0, "bytes": 0})
        (self.root / "build/foreign").symlink_to(self.root / "state")
        with self.assertRaisesRegex(ValueError, "^BAPK_OUTPUT_COUNT_LINK$"):
            self.r.output_state(self.root)
        command = self.r.command()
        for argument in (
            "--build-number=2", "--build-name=0.1.0", "--target-platform=android-arm64",
            "--no-pub", "--dart-define-from-file=/b3/config",
            "--android-project-arg=kotlin.project.persistent.dir=/b3/state/kotlin",
        ):
            self.assertEqual(command.count(argument), 1)
        self.assertEqual(command[command.index("--flavor") + 1], "dev")
        self.assertIn("--debug", command)
        compile(ast.parse((HERE / "d1-b-apk-build.py").read_text()),
                str(HERE / "d1-b-apk-build.py"), "exec")


if __name__ == "__main__":
    unittest.main()
