"""Heap-only correction: synthetic planning and public Java/Groovy probes."""
import importlib.util
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
EXPECTED = '-Xmx1536m -XX:MaxMetaspaceSize=384m -XX:ReservedCodeCacheSize=128m -XX:-HeapDumpOnOutOfMemoryError'


class HeapCorrection(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('heap_candidate', HERE/'d1-b-apk-build.py')
        self.r = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.r)
        self.temp = tempfile.TemporaryDirectory(prefix='b-apk-heap-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_environment_uses_local_heap_without_mutating_library(self):
        before = self.r.b2.JVM
        skeleton = ['--ro-bind', str(self.root/'placeholder'), '/b2/public-placeholder',
                    '--chdir', '/app/vaca_app/android']
        with (self.root/'config').open('w+b') as config, (self.root/'signer').open('w+b') as signer:
            bindings = {name: f'/proc/{os.getpid()}/fd/{handle.fileno()}'
                        for name, handle in [('config', config), ('signer', signer)]}
            with patch.object(self.r.b2, 'plan', return_value=skeleton):
                args = self.r.plan(self.root, bindings)
        options = [args[i+2] for i in range(len(args)-2)
                   if args[i:i+2] == ['--setenv', 'GRADLE_OPTS']]
        self.assertEqual(len(options), 1)
        heap = [value for value in shlex.split(options[0]) if value.startswith('-Dorg.gradle.jvmargs=')]
        self.assertEqual(heap, ['-Dorg.gradle.jvmargs='+EXPECTED])
        self.assertEqual(self.r.b2.JVM, before)
        self.assertTrue(before.startswith('-Xmx1024m '))

    def test_command_and_context_are_fixed(self):
        heap = [value for value in self.r.command()
                if value.startswith('--android-project-arg=org.gradle.jvmargs=')]
        self.assertEqual(heap, ['--android-project-arg=org.gradle.jvmargs='+EXPECTED])
        self.assertEqual(self.r.ROOT.name, 'd1-b-apk-d7e24f3-code2-heap1536')
        self.assertEqual(self.r.SOURCE, 'd7e24f3e866833721ad6003ca1c86e825cfab0f2')

    def test_actual_vm_policy(self):
        policy = HERE/'d1-b-apk-heap-policy.gradle'
        self.assertTrue(policy.is_file(), 'new runtime heap policy required')
        lib = self.r.CACHE/'gradle/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/lib'
        jars = list(lib.glob('groovy-[0-9]*.jar'))
        self.assertEqual(len(jars), 1, 'one admitted public Groovy core required')
        java = self.root/'HeapProbe.java'
        java.write_text('''import java.nio.file.*;
import groovy.lang.GroovyShell;
class HeapProbe {
  public static void main(String[] args) throws Exception {
    String stub = "class GradleException extends RuntimeException { GradleException(String message) { super(message) } }\\n";
    try { new GroovyShell().evaluate(stub + Files.readString(Path.of(args[0]))); }
    catch (Throwable error) {
      if (String.valueOf(error.getMessage()).contains("BAPK_REJECT_HEAP")) {
        System.err.println("BAPK_REJECT_HEAP"); System.exit(23);
      }
      System.err.println(error.getClass().getName()); System.exit(24);
    }
  }
}
''')
        cases = [('accepted', EXPECTED), ('small', EXPECTED.replace('1536m', '1024m')),
                 ('large', EXPECTED.replace('1536m', '2048m')),
                 ('metaspace', EXPECTED.replace('384m', '512m')),
                 ('codecache', EXPECTED.replace('128m', '64m')),
                 ('heapdump', EXPECTED.replace('-HeapDump', '+HeapDump')),
                 ('duplicate', '-Xmx1024m '+EXPECTED)]
        for label, options in cases:
            with self.subTest(case=label):
                result = subprocess.run(
                    [str(self.r.a.J/'bin/java'), *shlex.split(options), '--class-path', str(jars[0]), str(java), str(policy)],
                    cwd=self.root, env={'PATH': '/usr/bin:/bin', 'HOME': str(self.root), 'TMPDIR': str(self.root)},
                    capture_output=True, timeout=10)
                self.assertEqual(result.returncode, 0 if label == 'accepted' else 23)
                self.assertEqual(result.stdout, b'BAPK_HEAP 1610612736\n' if label == 'accepted' else b'')
                self.assertEqual(result.stderr, b'' if label == 'accepted' else b'BAPK_REJECT_HEAP\n')
        self.assertEqual(list(self.root.glob('*.hprof')), [])


if __name__ == '__main__':
    unittest.main()
