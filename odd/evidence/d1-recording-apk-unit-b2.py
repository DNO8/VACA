"""One-shot B2 PUBLIC GREEN: tiny offline root/included fixture, then final app model.
Parent background execution only; no private input, app build, signing or bootstrap.
RED and failed GREEN remain immutable/STOPPED; no runtime replay is authorized.
"""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).absolute().parent
B1_PIN = 'f2803df56640636561b4a310281703821bdda53e53a2837a1883cf9c0617cb63'
HELPER_PIN = '131486e8dd0acd180e94b0f4a4bbb6e494c4007f2eafab9d0b70e8fe3c67abf7'
for name, pin in [('d1-recording-apk-sandbox.py', HELPER_PIN), ('d1-recording-apk-unit-b1.py', B1_PIN)]:
    path = HERE/name
    if any(p.is_symlink() for p in (path, *path.parents)) or hashlib.sha256(path.read_bytes()).hexdigest() != pin:
        raise ValueError('closed library pin: '+name)
spec = importlib.util.spec_from_file_location('accepted_b1_library', HERE/'d1-recording-apk-unit-b1.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
a = b.a
RED = a.T/'unit-b2-fixtures/red'
GREEN = a.T/'unit-b2-fixtures/local-green'
AGP = {'gradle': '3f71d6d3bf4226a2c83131fe28980842f834b84375f04bf124cb00ab72506ea2',
       'gradle-api': '46feb75bb1288bbd46534d770ec5debd01e9dce23a158afe3175fddf2684f008',
       'builder-model': '2dac329a5c2ca619984c27bc0a18b16f556ffd5b10ac5b5095e86ce28a245807'}
DIST = 'wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj'
GRADLE = DIST+'/gradle-8.14'
SELECTED = ('gradle/'+DIST+'/gradle-8.14-all.zip.ok', *('gradle/'+GRADLE+'/'+name for name in
            ('bin/gradle', 'lib/gradle-gradle-cli-main-8.14.jar', 'lib/gradle-launcher-8.14.jar',
             'lib/plugins/gradle-wrapper-main-8.14.jar', 'init.d/readme.txt')),
            *('flutter-cache/artifacts/gradle_wrapper/'+name for name in b.WRAPPERS))
FILES = {'settings.gradle': "rootProject.name='b2-root'\nincludeBuild('included') { name = 'b2-included' }\n",
         'build.gradle': "tasks.register('b2PublicReport') { dependsOn(gradle.includedBuild('b2-included').task(':b2PublicReport')) }\n",
         'included/settings.gradle': "rootProject.name='b2-included'\n",
         'included/build.gradle': "tasks.register('b2PublicReport') { doLast { println('B2_PUBLIC_INCLUDED_REPORT') } }\n",
         'gradle/wrapper/gradle-wrapper.properties': 'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.14-all.zip\n'}
JVM = '-Xmx1024m -XX:MaxMetaspaceSize=384m -XX:ReservedCodeCacheSize=128m -XX:-HeapDumpOnOutOfMemoryError'

def entries(path, expected):
    path = a.checked(path)
    a.require(path.is_dir(), 'missing public directory: '+path.name)
    names = set()
    with os.scandir(path) as directory:
        for index, item in enumerate(directory):
            a.require(index < len(expected), 'unexpected init input')
            names.add(item.name)
    a.require(names == set(expected), 'unexpected init input')

def fingerprint(path):
    path = a.checked(path)
    st = path.stat()
    a.require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1, 'nonregular/shared public input')
    return dict(sha256=a.digest(path), mode=stat.S_IMODE(st.st_mode))

def selected_inputs(owned, state):
    records = {dest: record for (_, dest), record in zip(state['files'], state['copied'])}
    ambient = [owned/'gradle'/name for name in ('init.gradle', 'init.gradle.kts', 'gradle.properties')]
    for path in [*ambient, owned/'gradle'/GRADLE/'gradle.properties']:
        a.require(not a.checked(path).exists(), 'unexpected ambient Gradle input: '+path.name)
    init = a.checked(owned/'gradle/init.d')
    if init.exists():
        entries(init, ())  # Metadata only; never read unexpected init or properties contents.
    entries(owned/'gradle'/GRADLE/'init.d', ('readme.txt',))
    pins = {}
    for name in SELECTED:
        path = owned/name
        a.require(str(path) in records, 'selected cache record missing')
        record = records[str(path)]
        pins[str(path)] = fingerprint(path)
        a.require(pins[str(path)] == {key: record[key] for key in ('sha256', 'mode')}, 'selected cache pin/mode')
    return pins

def inputs():
    pins = {b.B/'receipt.json': '23ba47dabc2ccdac5589d0d92e0077090e7ee401dc574dc33c6a325e35e71c99',
            b.B/'mount-plan.json': '77bf589ef2287d15ed3246b6e36847efb728f2cff4d761f49cfae3dc500cbe80',
            a.W/a.L16_STATE: a.L16_PINS[a.L16_STATE],
            a.F/'packages/flutter_tools/.dart_tool/package_config.json': b.TOOL_PIN}
    payload = {str(path): b.pinned(path, pin) for path, pin in pins.items()}
    proof = json.loads(payload[str(b.B/'receipt.json')])
    a.require(proof['ready'] is True and proof['sourceCommit'] == a.COMMIT
              and [p['phase'] for p in proof['phases']] == ['namespace', 'smoke', 'pub']
              and all(p['result'] == dict(exit=0, reason='ok') for p in proof['phases'])
              and proof['postSource'] == proof['phases'][-1]['after'] and len(proof['postSource']) == 9, 'B1 handoff')
    state = json.loads(payload[str(a.W/a.L16_STATE)])
    selected = selected_inputs(a.W, state)
    for name, pin in AGP.items():
        matches = [(Path(dest), record) for (_, dest), record in zip(state['files'], state['copied'])
                   if Path(dest).is_relative_to(a.W/'gradle/caches/modules-2/files-2.1/com.android.tools.build'/name/'8.11.1')
                   and Path(dest).name == name+'-8.11.1.jar']
        a.require(len(matches) == 1, 'AGP artifact membership')
        path, record = matches[0]
        selected[str(path)] = fingerprint(path)
        a.require(selected[str(path)] == dict(sha256=pin, mode=record['mode']), 'AGP pin/mode')
    return dict(handoff={str(path): pin for path, pin in pins.items()}, selected=selected)


def prepare(root, templates):
    for name in ('source', 'home', 'android', 'tmp', 'init.d', 'build'):
        (root/name).mkdir(mode=0o700)
    for name, body in FILES.items():
        a.create(root/'source'/name, body.encode())
    (root/'source/build').mkdir(mode=0o700)
    for name in b.WRAPPERS:
        a.copy_public(templates/name, root/'source'/name)
    a.copy_public(HERE/'d1-recording-apk-unit-b2.gradle', root/'assert.gradle')
    return snapshot(root)

def policy_inputs(root):
    entries(root/'init.d', ('policy.gradle',))
    return {name: fingerprint(root/name) for name in ('init.d/policy.gradle', 'placeholder')}

def snapshot(root, policy=False):
    if not policy:
        entries(root/'init.d', ())
    pins = {name: fingerprint(root/name) for name in
            ['assert.gradle', *('source/'+name for name in [*FILES, *b.WRAPPERS])]}
    return dict(pins, **policy_inputs(root)) if policy else pins

def public_source(root, generated, previous):
    names = set(b.OUTPUTS) | {'vaca_app/android/'+name for name in b.WRAPPERS}
    a.require(set(generated) == names, 'B1 generated membership/presence')
    a.require({name: fingerprint(previous/name) for name in names} == generated, 'B1 generated pin/mode')
    manifest = a.unpack(a.T/'public-source.tar', a.T/'public-source-manifest.json', root/'source', a.PIN)
    pins = {row['path']: dict(sha256=row['sha256'], mode=int(row['mode'], 8) & 0o777) for row in manifest['files']}
    a.require(not names.intersection(pins) and 'vaca_app/android/key.properties' not in pins, 'public source membership')
    for name in names:
        a.copy_public(previous/name, root/'source'/name)
    (root/'source/vaca_app/build').mkdir()
    return dict(pins, **generated)

def source_state(root, pins):
    expected = set(pins) | {str(p) for name in pins for p in Path(name).parents if str(p) != '.'} | {'vaca_app/build'}
    seen = set()
    for index, path in enumerate((root/'source').rglob('*')):
        a.require(index < 2048 and not path.is_symlink(), 'source type/count')
        name = str(path.relative_to(root/'source'))
        a.require(name in expected and (path.is_dir() if name not in pins else path.is_file()), 'source membership/type')
        seen.add(name)
    a.require(seen == expected, 'missing source')
    actual = {name: fingerprint(root/'source'/name) for name in pins}
    a.require(actual == pins, 'source pin/mode')
    return dict(source=actual, controls=policy_inputs(root))

def plan(root, sdk=None, owned=None, packages=None, policy=False, app=False):
    sdk, owned = sdk or a.F, owned or a.W
    root = a.checked(root)
    a.require(not root.is_relative_to(owned) and not root.is_relative_to(b.B), 'closed root scope')
    args = a.mount_plan(sdk=sdk, owned=owned, view=root/'sdk-view', packages=packages)
    replacements = [('source', '/app'), ('home', '/owned/home'), ('android', '/owned/android')]
    for name, destination in replacements:
        hits = [i for i, token in enumerate(args) if token == '--bind' and args[i+1] == str(owned/name)]
        a.require(len(hits) == 1 and args[hits[0]+2] == destination, 'owned bind mismatch: '+name)
        index = hits[0]
        args[index:index+3] = ['--ro-bind' if name == 'source' else '--bind', str(root/name), destination]
    hits = [i for i, token in enumerate(args) if token == '--tmpfs' and args[i+1] == '/tmp']
    a.require(len(hits) == 1, 'tmp bind mismatch')
    index = hits[0]
    args[index:index+2] = ['--bind', str(root/'tmp'), '/tmp']
    a.require(not any(str(owned/name) in args for name, _ in replacements), 'closed input exposed')
    args += ['--ro-bind', str(root/'init.d'), '/owned/gradle/init.d',
             '--ro-bind', str(owned/'gradle'/GRADLE), '/owned/gradle/'+GRADLE]
    args += ['--ro-bind', str(root/('placeholder' if policy else 'assert.gradle')),
             '/b2/public-placeholder' if policy else '/b2/assert.gradle']
    args += ['--bind', str(root/'build'), '/app/vaca_app/build' if app else '/app/build']
    return args+['--chdir', '/app/vaca_app/android' if app else '/app']

def command(app=False):
    return ['/app/vaca_app/android/gradlew' if app else '/app/gradlew', '--no-daemon', '--no-configuration-cache',
            '--no-parallel', '--max-workers=1', '--console=plain', '--project-cache-dir=/tmp/project-cache',
            '-Dorg.gradle.jvmargs='+JVM, '-Porg.gradle.java.installations.paths='+str(a.J),
            '-Porg.gradle.java.installations.auto-download=false', '-Porg.gradle.java.installations.auto-detect=false',
            '-Pkotlin.compiler.execution.strategy=in-process', ':app:b2PublicModel' if app else 'b2PublicReport']

def expected_red(result, stdout, stderr, before, after):
    return (result == dict(exit=1, reason='nonzero') and bool(before) and before == after
            and stdout.splitlines().count('B2_OFFLINE root=/app offline=false') == 1
            and sum(stderr.splitlines().count(prefix+'B2_ROOT_OFFLINE_REQUIRED: offline=false before settings')
                    for prefix in ('', '> ')) == 1)

def green_output(app, stdout):
    lines = stdout.splitlines()
    identities = [('app', '/app/vaca_app/android'), ('flutter', str(a.F/'packages/flutter_tools/gradle'))] if app else [('root', '/app'), ('included', '/app/included')]
    expected = ['B2_OFFLINE '+role+'='+path+' offline=true' for role, path in identities]
    expected += ['B2_MODEL variant=devDebug applicationId=cl.vaca.app.dev signingConfig=debug storeFile=/b2/public-placeholder' if app else 'B2_PUBLIC_INCLUDED_REPORT']
    a.require(all(lines.count(line) == 1 for line in expected), 'missing/duplicate offline/model proof')
    a.require([line for line in lines if line.startswith('B2_')] == expected, 'unexpected proof/identity/order')

def run_green(root):
    root = a.checked(root)
    if root.exists():
        print('B2 refused: GREEN invocation already exists; STOP', file=sys.stderr)
        return 1
    root.mkdir(mode=0o700, parents=True)
    receipt, checks = dict(ready=False, runner=a.digest(Path(__file__)), phases=[]), []
    try:
        with (root/'lock').open('xb') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt['inputs'] = inputs()
            proof = json.loads(b.pinned(b.B/'receipt.json', receipt['inputs']['handoff'][str(b.B/'receipt.json')]))
            for phase, app in [('fixture', False), ('app', True)]:
                context = root/phase
                context.mkdir(mode=0o700)
                if app:
                    for name in ('home', 'android', 'tmp', 'init.d', 'build'):
                        (context/name).mkdir(mode=0o700)
                    pins = public_source(context, proof['postSource'], b.B/'source')
                else:
                    prepare(context, a.W/'flutter-cache/artifacts/gradle_wrapper')
                a.copy_public(HERE/'d1-recording-apk-unit-b2-policy.gradle', context/'init.d/policy.gradle')
                a.create(context/'placeholder', b'PUBLIC B2 INERT NON-KEYSTORE\n')
                check = (lambda context=context, pins=pins: source_state(context, pins)) if app else (lambda context=context: snapshot(context, True))
                evidence = dict(phase=phase, before=check())
                receipt['phases'].append(evidence)
                checks.append((check, evidence))
                args = plan(context, policy=True, app=app)+['--', *command(app)]
                a.create(context/'mount-plan.json', json.dumps(args, indent=2).encode())
                result = b.capture(args, context/'gradle', seconds=300 if app else 60)
                evidence.update(result=result, after=check())
                a.require(result == dict(exit=0, reason='ok') and evidence['before'] == evidence['after'], phase+' process/boundary failure')
                green_output(app, (context/'gradle/stdout').read_text())
                a.require(inputs() == receipt['inputs'], 'admitted inputs changed')
            receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__+': '+str(error)
    finally:
        for check, evidence in checks:
            try:
                evidence['after'] = check()
                a.require(evidence['before'] == evidence['after'], 'public input mutation')
            except Exception as error:
                receipt.update(ready=False, boundaryFailure=str(error))
        a.create(root/'receipt.json', json.dumps(receipt, indent=2).encode())
    print('B2 PUBLIC GREEN PASS' if receipt['ready'] else 'B2 STOP; see GREEN receipt.json')
    return 0 if receipt['ready'] else 1

if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    def deadline(*_):
        raise TimeoutError('B2 GREEN deadline; STOP')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(420)
    sys.exit(run_green(GREEN))
