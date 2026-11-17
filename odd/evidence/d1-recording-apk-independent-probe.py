import contextlib, copy, hashlib, importlib.util, io, json, os, subprocess, tarfile
from pathlib import Path
R=Path(__file__).parent
spec=importlib.util.spec_from_file_location('candidate',R/'work/odd/evidence/d1-recording-apk-sandbox.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
passed=0
def check(ok):
 global passed
 assert ok
 passed+=1
def snapshot(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
def call(action):
 out,err=io.StringIO(),io.StringIO()
 with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err): rc=m.l16_main(action)
 return rc,out.getvalue(),err.getvalue()
def rejected(action,message,roots):
 before=[snapshot(p) for p in roots]
 check(call(action)==(1,'','ValueError: '+message+'\n'))
 check(before==[snapshot(p) for p in roots])
def fixture(label):
 root=R/label; root.mkdir(); m.T=root; m.W=root/'unit-a'; m.W.mkdir(); m.L16_DIR=root/'unit-a-l16'; sdk=root/'sdk'
 for d in ('bin/cache','packages/flutter_tools/gradle','.git','.pub-cache/hosted/pub.dev/demo-1'): (sdk/d).mkdir(parents=True)
 for d in ('flutter-cache','flutter-gradle','source','home','pub','gradle','android','fixture'): (m.W/d).mkdir()
 for attr in ('J','A'):
  dest=root/attr; dest.mkdir(); setattr(m,attr,dest)
 m.create(m.W/'preparation.lock',b'')
 body=b'public source\n'; path='vaca_app/lib/main.dart'; row=dict(path=path,size=len(body),mode='100644',sha256=hashlib.sha256(body).hexdigest(),gitBlob=hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest())
 with tarfile.open(root/'public-source.tar','w') as tar:
  member=tarfile.TarInfo(path); member.size=len(body); member.mode=0o644; tar.addfile(member,io.BytesIO(body))
 manifest=dict(schema='vaca.d1.apk-public-source/v1',sourceCommit=m.COMMIT,files=[row],fileCount=1,sourceBytes=len(body),allowedExactPaths=[path],allowedPrefixes=[],archiveSize=(root/'public-source.tar').stat().st_size,archiveSha256=m.digest(root/'public-source.tar'))
 (root/'public-source-manifest.json').write_text(json.dumps(manifest)); m.PIN=m.digest(root/'public-source-manifest.json')
 m.create(m.W/'source'/path,body)
 original=root/'metadata'; original.write_text(json.dumps(dict(frameworkVersion='3.41.9',flutterVersion='3.41.9')))
 dst=m.W/'flutter-cache/flutter.version.json'; record=m.copy_public(original,dst)
 state=dict(queue=[],files=[[str(original),str(dst)]],copied=[record],verified=1,probed=False)
 m.create(m.W/m.L16_STATE,json.dumps(state).encode())
 for name,b in [('version',b'3.41.9\n'),('fixture/public-marker',b'public\n'),('flutter-cache/lockfile',b''),('mount-plan.json',b'[]'),('source-receipt.json',json.dumps(dict(sourceCommit=m.COMMIT,manifestSha256=m.PIN)).encode())]: m.create(m.W/name,b)
 for name,rc,err,action,out in [(m.L16_FAIL,'1',m.L16_ERROR,'probe',''),(m.L16_GOOD,'0','','verify',json.dumps(dict(stage='verify',pending=0,files=1,copied=1,verified=1,probed=False,ready=False)))]:
  for n,b in [('exit',rc),('stderr',err),('stdout',out),('binding',action+' '+m.L16_OLD_HELPER+'\n')]: m.create(m.W/name/n,b.encode())
 m.L16_COUNTS=(2,1,1); m.L16_PINS={name:m.digest(m.W/name) for name in m.L16_PINS}
 m.tool_roots=lambda:[sdk/'.pub-cache/hosted/pub.dev/demo-1']
 production=m.mount_plan
 # Redirect source roots only; preserve the production assembler and absolute F destination.
 m.mount_plan=lambda **kw:production(sdk=sdk,owned=m.W,**kw)
 return root,sdk,state
# Baseline mount-layout causality, no old runner or actual SDK.
root,sdk,state=fixture('baseline')
before=snapshot(root)
plan=m.base_plan()+['--ro-bind',str(sdk),str(m.F),'--ro-bind',str(m.W/'version'),str(m.F/'version'),'--','/usr/bin/true']
r=subprocess.run(plan,capture_output=True,text=True,timeout=10)
check((r.returncode,r.stdout,r.stderr)==(1,'',"bwrap: Can't create file at "+str(m.F/ 'version')+": Read-only file system\n"))
check(snapshot(root)==before)
print('BASELINE_ABSENT_VERSION: exit=1 exact bwrap stderr; bytes preserved')
# Use actual mount assembly twice, including own network/PID/env/hidden-host fixture probe.
for exists in (False,True):
 # Restore assembler after fixture's redirection before creating next fixture.
 if exists: m.mount_plan=production
 else: production=m.mount_plan.__closure__[0].cell_contents if False else None
 # Avoid capturing a redirected assembler from previous fixture.
 spec2=importlib.util.spec_from_file_location('fresh',Path(m.__file__)); fresh=importlib.util.module_from_spec(spec2); spec2.loader.exec_module(fresh); m.mount_plan=fresh.mount_plan
 # Fresh function globals must reference m, so retrieve original by re-executing definition in m globals.
 exec(compile(Path(m.__file__).read_text().split("if __name__ == '__main__':")[0],m.__file__,'exec'),m.__dict__)
 root,sdk,state=fixture('existing' if exists else 'absent')
 if exists: (sdk/'version').write_text('parent version\n')
 before=snapshot(sdk); source_before=snapshot(m.W/'source'); plan=m.mount_plan(view=root/'view')
 ro=[m.F,m.F/'bin',m.F/'packages',m.F/'.git',m.J,m.A,Path('/readonly-fixture')]; rw=[m.F/'bin/cache',m.F/'packages/flutter_tools/gradle']
 r=m.namespace_probe(plan,m.W/'fixture/public-marker',ro,rw)
 check((r.returncode,r.stdout,r.stderr)==(0,'PUBLIC_NAMESPACE_PASS\n',''))
 code='from pathlib import Path\nimport errno\nF=Path('+repr(str(m.F))+')\nassert (F/"version").read_text()=="3.41.9\\n"\nfor p in [F/"denied",F/"bin/denied",F/"packages/denied",F/".git/denied"]:\n try: p.write_text("no")\n except OSError as e: assert e.errno==errno.EROFS\n else: raise AssertionError("writable SDK")\nprint("ROOT_COMPONENT_RO_PASS")'
 r=subprocess.run(plan+['--','/usr/bin/python3','-I','-c',code],capture_output=True,text=True,timeout=10)
 check((r.returncode,r.stdout,r.stderr)==(0,'ROOT_COMPONENT_RO_PASS\n',''))
 check(snapshot(sdk)==before and snapshot(m.W/'source')==source_before)
 print('SDK_'+str(exists)+': PUBLIC_NAMESPACE_PASS ROOT_COMPONENT_RO_PASS exit=0 stderr=empty')
# New tiny context. Real mount-l16 and verify-l16, never the real T path.
exec(compile(Path(m.__file__).read_text().split("if __name__ == '__main__':")[0],m.__file__,'exec'),m.__dict__)
root,sdk,state=fixture('continuation'); old=snapshot(m.W)
# Unknown failure not admitted even if receipt pins are updated.
p=m.W/m.L16_FAIL/'stderr'; saved=p.read_bytes(); p.write_bytes(b'unknown failure\n'); m.L16_PINS[m.L16_FAIL+'/stderr']=m.digest(p)
rejected('mount-l16','unexpected predecessor failure',[m.W]); check(not m.L16_DIR.exists()); p.write_bytes(saved); m.L16_PINS[m.L16_FAIL+'/stderr']=m.digest(p)
# Source edit, incomplete state, receipt mismatch reject without mutations.
p=m.W/'source/vaca_app/lib/main.dart'; saved=p.read_bytes(); p.write_bytes(b'changed')
rejected('mount-l16','source changed',[m.W]); p.write_bytes(saved)
p=m.W/m.L16_STATE; saved=p.read_bytes(); v=json.loads(saved); v['verified']=0; p.write_text(json.dumps(v)); m.L16_PINS[m.L16_STATE]=m.digest(p)
rejected('mount-l16','incomplete predecessor',[m.W]); p.write_bytes(saved); m.L16_PINS[m.L16_STATE]=m.digest(p)
p=m.W/m.L16_FAIL/'exit'; p.write_bytes(b'0'); rejected('mount-l16','predecessor binding: '+m.L16_FAIL+'/exit',[m.W]); p.write_bytes(b'1')
rc,out,err=call('mount-l16'); check(rc==0 and err=='' and out.startswith('PUBLIC_NAMESPACE_PASS\n')); proof=json.loads((m.L16_DIR/'progress-00000.json').read_text()); check(proof['verified']==0 and not proof['ready']); check(snapshot(m.W/'source')=={'vaca_app/lib/main.dart':hashlib.sha256(b'public source\n').hexdigest()})
rejected('mount-l16','L16 already attempted',[m.W,m.L16_DIR])
rc,out,err=call('verify-l16'); check(rc==0 and err==''); check(json.loads(out)['ready'] is True); check(json.loads((m.L16_DIR/'progress-00001.json').read_text())['verified']==1)
rejected('verify-l16','L16 already verified',[m.W,m.L16_DIR])
check(all(m.digest(m.W/n)==pin for n,pin in m.L16_PINS.items()))
# Retain a failure receipt and prove a repeat cannot progress.
(m.L16_DIR/'run-z').mkdir(); (m.L16_DIR/'run-z/exit').write_text('1')
rejected('verify-l16','L16 failed/incomplete run; STOP',[m.W,m.L16_DIR])
# Legacy guard is still a STOP, exercised via CLI on a fully tiny copied module.
legacy=R/'legacy'; (legacy/'.tooling/d1-recording-apk/unit-a/run-0').mkdir(parents=True); (legacy/'.tooling/d1-recording-apk/unit-a/run-0/exit').write_text('1'); script=legacy/'odd/evidence/d1-recording-apk-sandbox.py'; script.parent.mkdir(parents=True); script.write_bytes(Path(m.__file__).read_bytes())
r=subprocess.run(['/usr/bin/python3','-B',str(script),'probe'],capture_output=True,text=True,timeout=10)
check((r.returncode,r.stdout,r.stderr)==(1,'','ValueError: previous stage failed; STOP\n'))
print('L16: real tiny mount+postcheck PASS; exact rejection text/exit + hash preservation PASS; legacy STOP PASS')
print('INDEPENDENT_PASS assertions='+str(passed))
