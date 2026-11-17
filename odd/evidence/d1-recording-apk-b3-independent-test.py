"""S2/S6/S18: public B3 overlay, identity and output boundaries; synthetic B2 only."""
import errno, hashlib, importlib.util, json, os, subprocess, unittest
from pathlib import Path
from unittest.mock import patch
S = Path(__file__).parent.parent
spec = importlib.util.spec_from_file_location('public_b3', S/'work/odd/evidence/d1-recording-apk-unit-b3.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def snapshot(root):
    return {str(p.relative_to(root)): (p.lstat().st_mode, digest(p) if p.is_file() and not p.is_symlink() else None)
            for p in root.rglob('*')}
class Boundaries(unittest.TestCase):
    def setUp(self):
        self.r = S/'focused'/self._testMethodName
        self.r.mkdir(mode=0o700)
        self.paths = dict(config=self.r/'config', signer=self.r/'signer')
        self.paths['config'].write_text(json.dumps({k:m.URL if k=='SUPABASE_URL' else 'PUBLIC' for k in m.KEYS}))
        self.paths['signer'].write_bytes(b'p'*2618)
        self.pin = digest(self.paths['config'])
    def test_descriptor_overlay_namespace(self):
        r = self.r
        names = list(m.b.OUTPUTS)+['vaca_app/android/'+n for n in ('gradlew','gradle/wrapper/gradle-wrapper.jar','gradle/wrapper/gradle-wrapper.properties')]+['vaca_app/input']
        for name in names:
            p=r/'source'/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_text('PUBLIC')
        for name in ('state','dart-tool','project-cache','generated','build','source/vaca_app/build','source/vaca_app/android/.gradle'):
            (r/name).mkdir(parents=True,exist_ok=True)
        for i in range(len(m.GENERATED)): (r/'generated'/str(i)).write_text('PUBLIC')
        (r/'launcher.sh').write_bytes((m.HERE/'d1-recording-apk-unit-b3-launcher.sh').read_bytes())
        (r/'projects.json').write_text('[":app"]')
        pins={n:m.b2.fingerprint(r/'source'/n) for n in names}
        before=snapshot(r/'source'); inputs={k:digest(p) for k,p in self.paths.items()}
        # This replaces ONLY the already-accepted B2 adapter, not the B3 overlay.
        base=['/usr/bin/bwrap','--die-with-parent','--unshare-net','--unshare-pid','--clearenv','--tmpfs','/']
        for p in ('/usr','/bin','/lib','/lib64'): base+=['--ro-bind',p,p]
        base+=['--proc','/proc','--dev','/dev','--ro-bind',str(r/'source'),'/app','--bind',str(r/'build'),'/app/vaca_app/build',
               '--ro-bind',str(r/'placeholder'),'/b2/public-placeholder','--chdir','/app/vaca_app/android']
        code="""import errno, pathlib, os
p=pathlib.Path
assert p('/b3/signer').read_bytes()==b'p'*2618
assert p('/b3/config').read_bytes()==CONFIG
for name in ['/b3/config','/b3/signer','/app/vaca_app/input','/app/vaca_app/forbidden','/app/vaca_app/.dart_tool/package_config.json','/b3/gradlew','/app/vaca_app/android/gradlew']:
    try: p(name).write_bytes(b'NO')
    except OSError as e: assert e.errno==errno.EROFS, (name,e.errno)
    else: raise AssertionError(name)
for name in WRITES:
    p(name).write_bytes(b'GENERATED'); assert p(name).read_bytes()==b'GENERATED'
assert set(x.split(':')[0].strip() for x in p('/proc/net/dev').read_text().splitlines()[2:])=={'lo'}
print('B3_DESCRIPTOR_RO_GENERATED_PASS')
"""
        writes=['/app/'+n for n in m.GENERATED]+['/app/vaca_app/.dart_tool/generated','/app/vaca_app/android/.gradle/cache','/app/vaca_app/build/output']
        with m.open_inputs(self.paths,self.pin) as (_, bindings), patch.object(m.b2,'plan',return_value=base.copy()):
            args=m.plan(r,bindings)
            self.assertNotIn('/b2/public-placeholder',args)
            prefix='CONFIG='+repr(self.paths['config'].read_bytes())+'; WRITES='+repr(writes)+'\n'
            command=args+['--','/usr/bin/python3','-B','-c',prefix+code]
            observed=m.capture(command,r/'capture',seconds=10,descriptors=tuple(m.descriptor(v) for v in bindings.values()))
            result=subprocess.CompletedProcess(command,observed['exit'],(r/'capture/stdout').read_bytes(),(r/'capture/stderr').read_bytes())
            self.assertEqual(observed,dict(exit=0,reason='ok'))
            (r/'namespace.json').write_text(json.dumps(dict(argv=args+['--','/usr/bin/python3','-B','-c',prefix+code],exit=result.returncode,stdout=result.stdout.decode(),stderr=result.stderr.decode()),indent=2))
            self.assertEqual((result.returncode,result.stdout,result.stderr),(0,b'B3_DESCRIPTOR_RO_GENERATED_PASS\n',b''))
        self.assertEqual(snapshot(r/'source'),before)
        self.assertEqual(m.source_state(r,pins),pins)
        self.assertEqual({k:digest(p) for k,p in self.paths.items()},inputs)
    def test_fd_inheritance_membership_rejects_without_outputs(self):
        before=snapshot(self.r)
        with m.open_inputs(self.paths,self.pin) as (_,bindings):
            fd=m.descriptor(bindings['signer'])
            args=['/usr/bin/bwrap','--ro-bind-fd',str(fd),'/signer']
            for inherited in ((),(fd,m.descriptor(bindings['config']))):
                with self.assertRaisesRegex(ValueError,'^B3_DESCRIPTOR_MEMBERSHIP$'):
                    m.capture(args,self.r/'rejected',descriptors=inherited)
                self.assertEqual(snapshot(self.r),before)
            with self.assertRaisesRegex(ValueError,'^B3_DESCRIPTOR_BINDING$'):
                m.descriptor('/proc/0/fd/'+str(fd))
        self.assertEqual(snapshot(self.r),before)
    def test_identity_substitution_and_rejected_inputs(self):
        before=snapshot(self.r)
        with self.assertRaisesRegex(ValueError,'^B3_CONFIG_PIN$'):
            with m.open_inputs(self.paths,'0'*64): self.fail('admitted')
        self.assertEqual(snapshot(self.r),before)
        with self.assertRaisesRegex(ValueError,'^B3_INPUT_MUTATION$'):
            with m.open_inputs(self.paths,self.pin) as (_,bindings):
                old=self.r/'retained'; self.paths['signer'].rename(old)
                self.paths['signer'].write_bytes(b'q'*2618)
                self.assertEqual(Path(bindings['signer']).read_bytes(),b'p'*2618)
        self.assertEqual((self.r/'retained').read_bytes(),b'p'*2618)
        self.assertEqual(self.paths['signer'].read_bytes(),b'q'*2618)
        self.assertEqual(digest(self.paths['config']),self.pin)
    def test_output_rejection_preserves_bytes_and_modes(self):
        apk=self.r/m.APK; apk.parent.mkdir(parents=True); apk.write_bytes(b'NOT_A_ZIP'); apk.chmod(0o640)
        before=snapshot(self.r)
        with self.assertRaisesRegex(ValueError,'^B3_APK_CONTAINER$'): m.artifact(self.r)
        self.assertEqual(snapshot(self.r),before)
        apk.write_bytes(b'PK\x03\x04PUBLIC'); os.link(apk,self.r/'shared')
        before=snapshot(self.r)
        with self.assertRaisesRegex(ValueError,'^B3_APK_TYPE_SIZE$'): m.artifact(self.r)
        self.assertEqual(snapshot(self.r),before)
        for n in ('dart-tool','generated','project-cache','home','android'): (self.r/n).mkdir(mode=0o700)
        (self.r/'build').chmod(0o700); (self.r/'generated/link').symlink_to(self.paths['signer'])
        before=snapshot(self.r)
        with self.assertRaisesRegex(ValueError,'^B3_OUTPUT_COUNT_LINK$'): m.output_state(self.r)
        self.assertEqual(snapshot(self.r),before)
if __name__=='__main__': unittest.main(verbosity=2)
