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

root,sdk,state=fixture('postfailure-corrected')
# Reject forged progress bindings before any append or writes.
rc,out,err=call('mount-l16'); check(rc==0 and err=='' and out.startswith('PUBLIC_NAMESPACE_PASS\n'))
p=m.L16_DIR/'progress-00000.json'; original=p.read_bytes(); proof=json.loads(original); proof['previous']='unbound'; p.write_text(json.dumps(proof))
rejected('verify-l16','L16 proof binding',[m.W,m.L16_DIR]); p.write_bytes(original)
# Changed copy fails postcheck; previous progress/source/predecessor stay byte-identical.
p=root/'metadata'; p.write_bytes(p.read_bytes()+b' ')
source=snapshot(m.W/'source'); old={n:m.digest(m.W/n) for n in m.L16_PINS}; progress=snapshot(m.L16_DIR)
rc,out,err=call('verify-l16'); check((rc,out,err)==(1,'','ValueError: original metadata changed\n'))
check(snapshot(m.W/'source')==source); check(all(m.digest(m.W/n)==v for n,v in old.items()))
check((m.L16_DIR/'progress-00000.json').read_bytes()==original and not (m.L16_DIR/'progress-00001.json').exists())
runs=sorted(m.L16_DIR.glob('run-*')); check(len(runs)==2 and (runs[-1]/'exit').read_text()=='1' and (runs[-1]/'stderr').read_text()==err)
rejected('verify-l16','L16 failed/incomplete run; STOP',[m.W,m.L16_DIR])
# Explicit source receipt binding error with correctly re-pinned public receipt.
# Restore original production assembler before next fixture.
exec(compile(Path(m.__file__).read_text().split("if __name__ == '__main__':")[0],m.__file__,'exec'),m.__dict__)
root,sdk,state=fixture('receiptbinding-corrected'); p=m.W/'source-receipt.json'; v=json.loads(p.read_text()); v['sourceCommit']='wrong'; p.write_text(json.dumps(v)); m.L16_PINS['source-receipt.json']=m.digest(p)
rejected('mount-l16','source binding',[m.W]); check(not m.L16_DIR.exists())
print('FOLLOWUP_PASS assertions='+str(passed)+' exact_errors=proof_binding,original_metadata_changed,failure_STOP,source_binding preserved=true')
