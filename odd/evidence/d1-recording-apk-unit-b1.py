"""One-shot public B1 preparation; run once via parent background tool after fixtures.
Creates unit-b1, then checks namespace, Dart version and offline frozen pub get.
Existing directory, first failure, timeout or unexpected source output means STOP.
No resume/retry, private inputs, Gradle/APK, downloads or lock bypass.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time

sys.dont_write_bytecode = True
HERE = Path(__file__).absolute().parent
HELPER_PIN = '131486e8dd0acd180e94b0f4a4bbb6e494c4007f2eafab9d0b70e8fe3c67abf7'
HELPER = HERE/'d1-recording-apk-sandbox.py'
if any(p.is_symlink() for p in (HELPER, *HELPER.parents)) or hashlib.sha256(HELPER.read_bytes()).hexdigest() != HELPER_PIN:
    raise ValueError('closed helper pin')
spec = importlib.util.spec_from_file_location('accepted_public_library', HELPER)
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
B = a.T/'unit-b1'
TOOL_PIN = '47398f373e4384171d9be969361dd27d7a1bf94436aa09beac8a5565716739d2'
ADMISSION_PIN = '907d14a3e496282c0a4dd88a42c6a9b52d4e303e4d593041cff63eff6d84c96a'
PLAN_PIN = 'a7e80dd64a01a83555c34adfe09abeb066420cc2b2a66e94b1cf960ff4deca14'
ARCHIVE_PIN = '4bd248d7a778519b923f9486c686ba365dec7a4821c13859176a4258d7c9251e'
WRAPPERS = ('gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar')
OUTPUTS = ('vaca_app/.dart_tool/package_config.json', 'vaca_app/.dart_tool/package_graph.json',
           'vaca_app/.dart_tool/version', 'vaca_app/.flutter-plugins-dependencies',
           'vaca_app/android/local.properties',
           'vaca_app/android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java')

def pinned(path, expected):
    path = a.checked(path)
    a.require(path.is_file() and path.stat().st_size <= 64*1024*1024, 'nonregular/oversize input: '+path.name)
    data = path.read_bytes()
    a.require(hashlib.sha256(data).hexdigest() == expected, 'input pin: '+path.name)
    return data

def inputs():
    pins = {HELPER: HELPER_PIN, a.T/'public-source-manifest.json': a.PIN,
            a.T/'public-source.tar': ARCHIVE_PIN, a.L16_DIR/'admission.json': ADMISSION_PIN,
            a.L16_DIR/'mount-plan.json': PLAN_PIN,
            a.F/'packages/flutter_tools/.dart_tool/package_config.json': TOOL_PIN}
    pins.update({a.W/name: pin for name, pin in a.L16_PINS.items()})
    for path, pin in pins.items():
        pinned(path, pin)
    proof_path = a.checked(a.L16_DIR/'progress-00746.json')
    a.require(proof_path.is_file() and proof_path.stat().st_size < 65536, 'closed proof type/size')
    proof = json.loads(proof_path.read_text())
    a.require(proof['ready'] is True and proof['probed'] is True and proof['verified'] == 47284
              and proof['admission'] == ADMISSION_PIN and proof['plan'] == PLAN_PIN, 'closed proof incomplete')
    admission = json.loads((a.L16_DIR/'admission.json').read_text())
    a.require(admission['helperSha256'] == HELPER_PIN and admission['sourceCommit'] == a.COMMIT
              and admission['sourceManifestSha256'] == a.PIN, 'handoff binding')
    state = json.loads((a.W/a.L16_STATE).read_text())
    records = {dest: record for (_, dest), record in zip(state['files'], state['copied'])}
    selected = ['dart-sdk/bin/dart', 'flutter_tools.snapshot', 'flutter.version.json']
    selected += ['artifacts/gradle_wrapper/'+name for name in WRAPPERS]
    for name in selected:
        path = a.W/'flutter-cache'/name
        a.require(str(path) in records, 'missing selected cache input: '+name)
        record = records[str(path)]
        a.require(stat.S_ISREG(a.checked(path).stat().st_mode) and path.stat().st_nlink == 1, 'nonregular/shared selected input')
        pinned(path, record['sha256'])
        a.require(stat.S_IMODE(path.stat().st_mode) == record['mode'], 'selected input mode')
        pins[path] = record['sha256']
    metadata = json.loads((a.W/'flutter-cache/flutter.version.json').read_text())
    a.require(metadata['frameworkVersion'] == metadata['flutterVersion'] == '3.41.9'
              and metadata['dartSdkVersion'] == '3.11.5', 'SDK version')
    version = a.checked(a.W/'version')
    a.require(version.is_file() and version.read_bytes() == b'3.41.9\n', 'version overlay')
    pins[version] = hashlib.sha256(b'3.41.9\n').hexdigest()
    a.tool_roots()  # Validate only manifest-selected public tool roots, never discover home files.
    return {str(path): pin for path, pin in pins.items()}

def boundary(source, manifest, generated):
    original = {row['path']: row for row in manifest['files']}
    allowed = set(original) | set(OUTPUTS) | set(generated)
    dirs = {str(p) for name in allowed for p in Path(name).parents if str(p) != '.'}
    seen, outputs = set(), {}
    for count, path in enumerate(source.rglob('*')):
        a.require(count < 2048, 'source output count limit')
        a.require(not path.is_symlink(), 'symlink output')
        name = str(path.relative_to(source))
        if path.is_dir():
            a.require(name in dirs, 'unclassified output directory')
            continue
        a.require(path.is_file() and name in allowed, 'unclassified output')
        row = dict(sha256=a.digest(path), mode=stat.S_IMODE(path.stat().st_mode))
        if name in original:
            expected = original[name]
            a.require(row == dict(sha256=expected['sha256'], mode=int(expected['mode'], 8) & 0o777), 'pinned source changed')
            seen.add(name)
        else:
            a.require(path.stat().st_nlink == 1, 'shared generated output')
            a.require(name not in generated or row == generated[name], 'wrapper changed')
            outputs[name] = row
    a.require(seen == original.keys(), 'missing pinned source')
    return outputs

def wrappers(source, manifest, templates):
    tracked = {r['path'] for r in manifest['files']}
    generated = {}
    for name, template in templates.items():
        dest = source/'vaca_app/android'/name
        relative = str(dest.relative_to(source))
        if relative not in tracked:
            record = a.copy_public(template, dest)
            generated[relative] = {k: record[k] for k in ('sha256', 'mode')}
    return generated

def plan(root, sdk=a.F):
    a.require(a.checked(root) == a.checked(B) and not root.is_relative_to(a.W), 'B1 mount scope')
    args = a.mount_plan(sdk=sdk, owned=a.W, view=root/'sdk-view')
    temporary = [i for i, token in enumerate(args) if token == '--tmpfs' and args[i+1] == '/tmp']
    a.require(len(temporary) == 1, 'tmp mount mismatch')
    i = temporary[0]
    args[i:i+2] = ['--bind', str(a.checked(root/'tmp')), '/tmp']
    replacements = {str(a.W/name): str(a.checked(root/name)) for name in ('source', 'home', 'android')}
    expected = {str(a.W/'source'): '/app', str(a.W/'home'): '/owned/home', str(a.W/'android'): '/owned/android'}
    found = set()
    for i, token in enumerate(args):
        if token == '--bind' and args[i+1] in replacements:
            old = args[i+1]
            a.require(args[i+2] == expected[old] and old not in found, 'bind replacement mismatch')
            args[i+1] = replacements[old]
            found.add(old)
    a.require(found == replacements.keys(), 'missing owned bind')
    a.require(not any(str(a.W/'source') == arg for arg in args), 'closed source exposed')
    return args+['--chdir', '/app/vaca_app']

def commands():
    dart = str(a.F/'bin/cache/dart-sdk/bin/dart')
    return dict(smoke=[dart, '--version'], pub=[dart, '--packages='+str(a.F/'packages/flutter_tools/.dart_tool/package_config.json'),
                str(a.F/'bin/cache/flutter_tools.snapshot'), '--suppress-analytics', '--no-version-check',
                'pub', 'get', '--offline', '--enforce-lockfile', '--no-example'])

def capture(argv, folder, seconds=300, cap=1024*1024):
    folder.mkdir()
    a.create(folder/'argv.json', json.dumps(argv).encode())
    a.create(folder/'stdout', b'')
    a.create(folder/'stderr', b'')
    result, process, total = dict(exit=-1, reason='launch'), None, 0
    deadline = time.monotonic()+seconds
    try:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={'PATH': '/usr/bin:/bin'}, start_new_session=True)
        with selectors.DefaultSelector() as selector, (folder/'stdout').open('ab') as out, (folder/'stderr').open('ab') as err:
            for pipe, target in ((process.stdout, out), (process.stderr, err)):
                selector.register(pipe, selectors.EVENT_READ, target)
            while selector.get_map():
                remaining = deadline-time.monotonic()
                if remaining <= 0:
                    result['reason'] = 'timeout'
                    break
                for key, _ in selector.select(min(.1, remaining)):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    key.data.write(block[:max(0, cap-total)])
                    total += len(block)
                    if total > cap:
                        result['reason'] = 'output cap'
                        break
                if total > cap:
                    break
            if result['reason'] == 'launch':
                try:
                    result['exit'] = process.wait(timeout=max(.001, deadline-time.monotonic()))
                    result['reason'] = 'ok' if result['exit'] == 0 else 'nonzero'
                except subprocess.TimeoutExpired:
                    result['reason'] = 'timeout'
    finally:
        if process is not None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            result['exit'] = process.wait()
            process.stdout.close()
            process.stderr.close()
        a.create(folder/'result.json', json.dumps(result).encode())
        a.create(folder/'exit', str(result['exit']).encode())
    return result

def main():
    if a.checked(B).exists():
        print('B1 refused: invocation already exists', file=sys.stderr)
        return 1
    try:
        bindings = inputs()  # Every rejection here precedes B1 state creation.
    except (ValueError, OSError, KeyError) as error:
        print('B1 refused: '+str(error), file=sys.stderr)
        return 1
    B.mkdir(mode=0o700)
    receipt = dict(helper=HELPER_PIN, runner=a.digest(Path(__file__)), sourceCommit=a.COMMIT, inputs=bindings, phases=[], ready=False)
    source, manifest, generated = B/'source', None, {}
    try:
        with (B/'lock').open('xb') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            manifest = a.unpack(a.T/'public-source.tar', a.T/'public-source-manifest.json', source, a.PIN)
            generated = wrappers(source, manifest, {name: a.W/'flutter-cache/artifacts/gradle_wrapper'/name for name in WRAPPERS})
            for name in ('home', 'android', 'tmp'):
                (B/name).mkdir()
            args = plan(B)
            a.create(B/'mount-plan.json', json.dumps(args, indent=2).encode())
            namespace = f'''import os,pathlib,fcntl
p=pathlib.Path
assert os.readlink('/proc/self/ns/net') != {os.readlink('/proc/self/ns/net')!r}
assert not p({str(a.W/'fixture/public-marker')!r}).exists()
assert not list(p('/owned/android').iterdir()) and os.getpid()<=2
assert os.environ['HOME']=='/owned/home' and 'FLUTTER_ALREADY_LOCKED' not in os.environ
mounts=p('/proc/self/mountinfo').read_text().splitlines()
for root in {[str(a.F), str(a.F/'bin'), str(a.F/'packages'), str(a.J), str(a.A)]!r}:
    assert any(line.split()[4]==root and 'ro' in line.split()[5].split(',') for line in mounts)
with open({str(a.F/'bin/cache/lockfile')!r}, 'r+') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
for root in ['/owned/home','/owned/android','/tmp']:
    (p(root)/'public-b1-marker').write_text('public')
print('B1_NAMESPACE_PASS')
'''
            for phase, argv in [('namespace', ['/usr/bin/python3', '-I', '-c', namespace]), *commands().items()]:
                evidence = dict(phase=phase, before=boundary(source, manifest, generated))
                receipt['phases'].append(evidence)
                result = capture(args+['--', *argv], B/phase, seconds=300 if phase == 'pub' else 15)
                evidence.update(result=result, after=boundary(source, manifest, generated))
                a.create(B/(phase+'-boundary.json'), json.dumps(evidence).encode())
                a.require(result['reason'] == 'ok', phase+' failed: '+result['reason'])
                if phase == 'smoke':
                    a.require(b'Dart SDK version: 3.11.5' in (B/phase/'stdout').read_bytes(), 'Dart version mismatch')
            a.require(inputs() == bindings, 'input bindings changed')
            receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__+': '+str(error)
    finally:
        if manifest is not None:
            try:
                receipt['postSource'] = boundary(source, manifest, generated)
            except (ValueError, OSError) as error:
                receipt.update(ready=False, postSourceError=str(error))
        a.create(B/'receipt.json', json.dumps(receipt, indent=2).encode())
    print('B1 PASS' if receipt['ready'] else 'B1 FAIL; see unit-b1/receipt.json')
    return 0 if receipt['ready'] else 1

if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    def deadline(*_):
        raise TimeoutError('B1 invocation deadline; STOP')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(420)
    sys.exit(main())
