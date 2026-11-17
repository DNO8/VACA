import contextlib,hashlib,importlib.util,io,json,os,stat,sys,unittest
from pathlib import Path
from unittest.mock import patch
S=Path(__file__).parent
spec=importlib.util.spec_from_file_location('b1',S/'work/odd/evidence/d1-recording-apk-unit-b1.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
def snapshot(root):
 return {str(p.relative_to(root)):(p.lstat().st_mode, p.read_bytes() if p.is_file() and not p.is_symlink() else None) for p in root.rglob('*')}
class Independent(unittest.TestCase):
 def setUp(self):
  self.r=S/self._testMethodName;self.r.mkdir()
 def source(self):
  root=self.r/'source';p=root/'vaca_app/pubspec.lock';b.a.create(p,b'pinned');p.chmod(0o644)
  return root,{'files':[{'path':'vaca_app/pubspec.lock','sha256':b.a.digest(p),'mode':'100644'}]}
 def test_boundary_observable_rejections(self):
  root,m=self.source();original=root/'vaca_app/pubspec.lock'
  self.assertEqual(b.boundary(root,m,{}),{})
  original.chmod(0o755);before=snapshot(root)
  with self.assertRaisesRegex(ValueError,'^pinned source changed$'):b.boundary(root,m,{})
  self.assertEqual(snapshot(root),before);original.chmod(0o644)
  unknown=root/'vaca_app/.dart_tool/not-approved';b.a.create(unknown,b'public');before=snapshot(root)
  with self.assertRaisesRegex(ValueError,'^unclassified output$'):b.boundary(root,m,{})
  self.assertEqual(snapshot(root),before);unknown.unlink()
  output=root/b.OUTPUTS[0];outside=self.r/'public';outside.write_bytes(b'public');os.link(outside,output);before=snapshot(root)
  with self.assertRaisesRegex(ValueError,'^shared generated output$'):b.boundary(root,m,{})
  self.assertEqual(snapshot(root),before);self.assertEqual(outside.read_bytes(),b'public');output.unlink()
  output.symlink_to(outside);before=snapshot(root)
  with self.assertRaisesRegex(ValueError,'^symlink output$'):b.boundary(root,m,{})
  self.assertEqual(snapshot(root),before)
 def test_wrappers_are_pinned_after_generation(self):
  root,m=self.source();template=self.r/'template';template.write_bytes(b'public-wrapper');template.chmod(0o755)
  generated=b.wrappers(root,m,{'gradlew':template});dest=root/'vaca_app/android/gradlew'
  self.assertEqual(dest.read_bytes(),b'public-wrapper');self.assertEqual(stat.S_IMODE(dest.stat().st_mode),0o755)
  dest.write_bytes(b'changed');before=snapshot(root)
  with self.assertRaisesRegex(ValueError,'^wrapper changed$'):b.boundary(root,m,generated)
  self.assertEqual(snapshot(root),before);self.assertEqual(template.read_bytes(),b'public-wrapper')
 def test_prestate_and_one_shot_observable(self):
  run=self.r/'run';out,err=io.StringIO(),io.StringIO()
  with patch.object(b,'B',run),patch.object(b,'inputs',side_effect=ValueError('input pin: public')),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
   self.assertEqual(b.main(),1)
  self.assertFalse(run.exists());self.assertEqual((out.getvalue(),err.getvalue()),('','B1 refused: input pin: public\n'))
  run.mkdir();(run/'receipt.json').write_bytes(b'failed historical receipt');before=snapshot(run);out,err=io.StringIO(),io.StringIO()
  with patch.object(b,'B',run),patch.object(b,'inputs',side_effect=AssertionError('must not admit')),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
   self.assertEqual(b.main(),1)
  self.assertEqual((out.getvalue(),err.getvalue()),('','B1 refused: invocation already exists\n'));self.assertEqual(snapshot(run),before)
 def test_exact_cap_and_both_streams(self):
  cases=[('exact',"import os;os.write(1,b'1234');os.write(2,b'5678')",8,'ok',0,b'1234',b'5678'),('overflow',"import os;os.write(2,b'x'*9)",8,'output cap',None,b'',b'x'*8),('fail',"import os;os.write(1,b'out');os.write(2,b'err');raise SystemExit(19)",100,'nonzero',19,b'out',b'err')]
  for name,code,cap,reason,exit,out,err in cases:
   folder=self.r/name;res=b.capture([sys.executable,'-I','-c',code],folder,seconds=2,cap=cap)
   self.assertEqual(res['reason'],reason)
   if exit is not None:self.assertEqual(res['exit'],exit)
   self.assertEqual((folder/'stdout').read_bytes(),out);self.assertEqual((folder/'stderr').read_bytes(),err)
   self.assertEqual(json.loads((folder/'result.json').read_text()),res);self.assertEqual((folder/'exit').read_text(),str(res['exit']))
 def test_public_namespace_same_plan(self):
  sdk=self.r/'sdk';old=self.r/'closed';run=self.r/'run'
  for rel in ['bin/cache','packages/flutter_tools/gradle','.git']:(sdk/rel).mkdir(parents=True)
  for rel in ['source','home','android','pub','gradle','flutter-cache','flutter-gradle','fixture']:(old/rel).mkdir(parents=True)
  b.a.create(old/'source/closed-marker',b'closed-public');b.a.create(old/'fixture/public-marker',b'public');b.a.create(old/'version',b'3.41.9\n');b.a.create(old/'flutter-cache/lockfile',b'')
  for rel in ['source/vaca_app','home','android','tmp']:(run/rel).mkdir(parents=True)
  b.a.create(run/'source/vaca_app/new-marker',b'new-public');hidden=self.r/'host-marker';hidden.write_bytes(b'host-public')
  before=snapshot(old/'source')
  with patch.object(b,'B',run),patch.object(b.a,'W',old),patch.object(b.a,'J',sdk),patch.object(b.a,'A',sdk),patch.object(b.a,'tool_roots',return_value=[]):args=b.plan(run,sdk=sdk)
  self.assertNotIn(str(old/'source'),args);self.assertNotIn('FLUTTER_ALREADY_LOCKED',args)
  code="""import os,pathlib,errno,fcntl
p=pathlib.Path
assert p('/app/vaca_app/new-marker').read_bytes()==b'new-public'
assert not p('/app/closed-marker').exists()
assert not p(HIDDEN).exists()
assert os.environ['HOME']=='/owned/home' and 'HOST_SENTINEL' not in os.environ
assert os.readlink('/proc/self/ns/net')!=NET
assert set(line.split(':')[0].strip() for line in p('/proc/net/dev').read_text().splitlines()[2:])=={'lo'}
assert 'FLUTTER_ALREADY_LOCKED' not in os.environ
with open(LOCK,'r+') as f:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:p('/readonly-fixture/no').write_text('no')
except OSError as e:assert e.errno==errno.EROFS
else:raise AssertionError('read-only write accepted')
for root in ['/owned/home','/owned/android','/tmp']:(p(root)/'independent-marker').write_text('public')
print('INDEPENDENT_B1_NAMESPACE_PASS')
"""
  code=f'HIDDEN={str(hidden)!r}\nNET={os.readlink("/proc/self/ns/net")!r}\nLOCK={str(b.a.F/"bin/cache/lockfile")!r}\n'+code
  result=b.capture(args+['--','/usr/bin/python3','-I','-c',code],self.r/'probe',seconds=3)
  self.assertEqual(result,{'exit':0,'reason':'ok'});self.assertEqual((self.r/'probe/stdout').read_bytes(),b'INDEPENDENT_B1_NAMESPACE_PASS\n');self.assertEqual((self.r/'probe/stderr').read_bytes(),b'')
  for rel in ['home','android','tmp']:self.assertEqual((run/rel/'independent-marker').read_bytes(),b'public')
  self.assertEqual(snapshot(old/'source'),before);self.assertFalse((old/'fixture/no').exists());self.assertEqual(hidden.read_bytes(),b'host-public')
  self.assertEqual(b.commands()['pub'][-5:],['pub','get','--offline','--enforce-lockfile','--no-example'])
if __name__=='__main__':unittest.main(verbosity=2)
