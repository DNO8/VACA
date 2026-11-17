import contextlib,hashlib,importlib.util,io,json,os,unittest
from pathlib import Path
from unittest.mock import patch
S=Path(__file__).parent
sp=importlib.util.spec_from_file_location('b1',S/'work/odd/evidence/d1-recording-apk-unit-b1.py');b=importlib.util.module_from_spec(sp);sp.loader.exec_module(b)
class Admission(unittest.TestCase):
 def test_admission_semantics_and_prestate_refusal(self):
  root=S/'admission-fixture';root.mkdir();work=root/'closed';closed=root/'receipts';sdk=root/'sdk';run=root/'invocation'
  digest=lambda data:hashlib.sha256(data).hexdigest()
  data={root/'public-source-manifest.json':b'{}',root/'public-source.tar':b'archive',closed/'mount-plan.json':b'[]'}
  tool=sdk/'packages/flutter_tools/.dart_tool/package_config.json'
  data[tool]=json.dumps({'packages':[{'name':'flutter_tools','rootUri':'../'}]}).encode()
  manifest_pin=digest(data[root/'public-source-manifest.json'])
  data[closed/'admission.json']=json.dumps({'helperSha256':b.HELPER_PIN,'sourceCommit':b.a.COMMIT,'sourceManifestSha256':manifest_pin}).encode()
  files=[];records=[]
  for name in ['dart-sdk/bin/dart','flutter_tools.snapshot','flutter.version.json']+['artifacts/gradle_wrapper/'+n for n in b.WRAPPERS]:
   p=work/'flutter-cache'/name;body=json.dumps({'frameworkVersion':'3.41.9','flutterVersion':'3.41.9','dartSdkVersion':'3.11.5'}).encode() if name=='flutter.version.json' else b'public-input'
   data[p]=body;files.append(['public-origin',str(p)]);records.append({'sha256':digest(body),'mode':0o644})
  data[work/b.a.L16_STATE]=json.dumps({'files':files,'copied':records}).encode();data[work/'version']=b'3.41.9\n'
  data[closed/'progress-00746.json']=json.dumps({'ready':True,'probed':True,'verified':47284,'admission':digest(data[closed/'admission.json']),'plan':digest(data[closed/'mount-plan.json'])}).encode()
  for p,body in data.items():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body);p.chmod(0o644)
  patches=[(b,'B',run),(b.a,'T',root),(b.a,'W',work),(b.a,'F',sdk),(b.a,'L16_DIR',closed),(b.a,'PIN',manifest_pin),(b,'ARCHIVE_PIN',digest(data[root/'public-source.tar'])),(b,'TOOL_PIN',digest(data[tool])),(b,'ADMISSION_PIN',digest(data[closed/'admission.json'])),(b,'PLAN_PIN',digest(data[closed/'mount-plan.json'])),(b.a,'L16_PINS',{b.a.L16_STATE:digest(data[work/b.a.L16_STATE])})]
  def snap():return {str(p):digest(p.read_bytes()) for p in root.rglob('*') if p.is_file()}
  def refused(message):
   before=snap();out,err=io.StringIO(),io.StringIO()
   with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):self.assertEqual(b.main(),1)
   self.assertEqual((out.getvalue(),err.getvalue()),('',message+'\n'));self.assertFalse(run.exists());self.assertEqual(snap(),before)
  with contextlib.ExitStack() as stack:
   for obj,key,value in patches:stack.enter_context(patch.object(obj,key,value))
   bindings=b.inputs();self.assertIn(str(tool),bindings)
   tool.write_bytes(b'changed');refused('B1 refused: input pin: package_config.json');tool.write_bytes(data[tool])
   selected=work/'flutter-cache/dart-sdk/bin/dart';os.link(selected,root/'hardlink');refused('B1 refused: nonregular/shared selected input');(root/'hardlink').unlink()
   selected.chmod(0o755);refused('B1 refused: selected input mode');selected.chmod(0o644)
   tool.write_text(json.dumps({'packages':[{'name':'public','rootUri':(root/'outside-public').as_uri()}]}))
   with patch.object(b,'TOOL_PIN',b.a.digest(tool)):refused('B1 refused: tool dependency root')
if __name__=='__main__':unittest.main(verbosity=2)
