"""S20: actual selected Bash wrapper, public fake Java; no JVM/SDK execution."""
import hashlib, json, subprocess
from pathlib import Path
S = Path(__file__).parent
state, record, java = S/'state', S/'record', S/'java/bin/java'
state.mkdir(); record.mkdir(); java.parent.mkdir(parents=True)
java.write_text("#!/usr/bin/python3 -B\nimport json,sys\nfrom pathlib import Path\nPath('/record/argv.json').write_text(json.dumps(sys.argv[1:]))\nprint('PUBLIC_JAVA_REACHED')\nprint('PUBLIC_ORIGINAL_FAILURE',file=sys.stderr)\nsys.exit(7)\n")
java.chmod(0o700)
inputs = [S/'launcher.sh', *sorted(p for p in (S/'original').rglob('*') if p.is_file())]
def snapshot(paths):
    return {str(p): dict(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                       mode=p.stat().st_mode, size=p.stat().st_size) for p in paths}
before = snapshot(inputs)
base = ['/usr/bin/bwrap','--die-with-parent','--unshare-net','--unshare-pid',
        '--clearenv','--tmpfs','/']
for name in ('/usr','/bin','/lib','/lib64'):
    base += ['--ro-bind',name,name]
base += ['--proc','/proc','--dev','/dev','--tmpfs','/tmp',
         '--setenv','PATH','/usr/bin:/bin','--setenv','JAVA_HOME','/fake-java',
         '--setenv','HOME','/tmp','--setenv','TMPDIR','/tmp',
         '--setenv','JAVA_OPTS','-Dpublic.java="hello world"',
         '--setenv','GRADLE_OPTS','-Dpublic.gradle=fixture',
         '--ro-bind',str(java.parent.parent),'/fake-java',
         '--bind',str(state),'/b3/state','--bind',str(record),'/record',
         '--ro-bind',str(S/'launcher.sh'),'/launcher.sh',
         '--ro-bind',str(S/'original/gradlew'),'/b3/gradlew',
         '--ro-bind',str(S/'original/gradle'),'/b3/gradle',
         '--','/bin/sh','/launcher.sh']
observed = []
def run(arguments):
    result = subprocess.run(base+arguments,capture_output=True,timeout=10)
    assert len(result.stdout)+len(result.stderr)<=1048576
    observed.append(dict(argv=base+arguments,exit=result.returncode,
                         stdout=result.stdout.decode(),stderr=result.stderr.decode()))
    (S/'namespace-results.json').write_text(json.dumps(observed,indent=2))
    return result.returncode, result.stdout, result.stderr
assert run(['clean']) == (1,b'',b'B3_REJECT_REQUEST\n')
assert list(state.iterdir()) == [] and list(record.iterdir()) == []
arguments = ['--console=plain','assembleDevDebug','-Ppublic=two words']
assert run(arguments) == (7,b'PUBLIC_JAVA_REACHED\n',b'PUBLIC_ORIGINAL_FAILURE\n')
expected = ['-Dpublic.java=hello world','-Dpublic.gradle=fixture',
            '-Dorg.gradle.appname=gradlew','-classpath',
            '/b3/gradle/wrapper/gradle-wrapper.jar',
            'org.gradle.wrapper.GradleWrapperMain',*arguments]
assert json.loads((record/'argv.json').read_text()) == expected
assert [p.name for p in state.iterdir()] == ['attempt']
assert (state/'attempt').is_dir() and list((state/'attempt').iterdir()) == []
assert [p.name for p in record.iterdir()] == ['argv.json']
record_before = snapshot([record/'argv.json'])
state_before = {str(p.relative_to(state)):p.stat() for p in state.rglob('*')}
assert run(arguments) == (1,b'',b'B3_REJECT_RETRY\n')
assert snapshot([record/'argv.json']) == record_before
assert {str(p.relative_to(state)):p.stat() for p in state.rglob('*')} == state_before
assert [p.name for p in record.iterdir()] == ['argv.json']
assert snapshot(inputs) == before
(S/'input-preservation.json').write_text(json.dumps(before,indent=2))
print('S20_ORIGINAL_BASH_WRAPPER_DISPATCH_PASS cases=3')
