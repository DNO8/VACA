"""B3 fixed prepare/build gates. Run only after parent verification/authority checks.
prepare checks the two previously authorized inputs without copying/disclosing them.
build requires that receipt, refuses another invocation, and never installs an APK.
"""
import argparse
from contextlib import contextmanager, ExitStack
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import signal
import stat
import sys
import selectors
import subprocess
import time

sys.dont_write_bytecode = True
HERE = Path(__file__).absolute().parent
B2_PIN = '492e3057c8621760d991b001af0dc5b2575a8d9d9e695baa667ab2f3abd35364'
LIBRARY = HERE/'d1-recording-apk-unit-b2.py'
if any(p.is_symlink() for p in (LIBRARY, *LIBRARY.parents)) or hashlib.sha256(LIBRARY.read_bytes()).hexdigest() != B2_PIN:
    raise ValueError('B3_LIBRARY_PIN')
spec = importlib.util.spec_from_file_location('accepted_b2_library', LIBRARY)
b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b2)
b, a = b2.b, b2.a
ROOT = a.T/'unit-b3-offline-recovery'
PRIVATE = {'config': a.F.parent/'d1-client-public-config.json',
           'signer': a.F.parent/'d1-android-home/android/debug.keystore'}
CONFIG_PIN = 'cd97e32ef1744e702c33e8249da01e70b85768d6c306ec62cad7e12e11d8ce89'
CERT_PIN = '3fee367d1c6a658958e18ef44e6c532cbaba163aadbca3bf7b6d9e06b545b2da'
KEYS = {'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SERVER_BUNDLE_PUBLIC_KEY', 'SERVER_RECEIPT_PUBLIC_KEY'}
URL = 'https://tgqxxnldwiqisopiclmk.supabase.co'
APK = 'build/app/outputs/flutter-apk/app-dev-debug.apk'
GENERATED = tuple(name for name in b.OUTPUTS if '/.dart_tool/' not in name)
SCAFFOLDS = {'vaca_app/build', 'vaca_app/android/.gradle'}


def file_record(handle):
    info = os.fstat(handle.fileno())
    a.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 65536, 'B3_INPUT_TYPE_SIZE')
    handle.seek(0)
    data = handle.read(65537)
    a.require(len(data) == info.st_size, 'B3_INPUT_CHANGED')
    record = {key: getattr(info, 'st_'+key) for key in ('dev', 'ino', 'mode', 'size', 'mtime_ns', 'ctime_ns')}
    return dict(record, sha256=hashlib.sha256(data).hexdigest()), data


@contextmanager
def open_inputs(paths=PRIVATE, config_pin=CONFIG_PIN):
    a.require(set(paths) == {'config', 'signer'}, 'B3_INPUT_MEMBERSHIP')
    with ExitStack() as stack:
        handles, records = {}, {}
        for name, path in paths.items():
            path = a.checked(path)
            handle = stack.enter_context(os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb'))
            record, data = file_record(handle)
            if name == 'config':
                a.require(record['sha256'] == config_pin, 'B3_CONFIG_PIN')
                document = json.loads(data)
                a.require(isinstance(document, dict) and set(document) == KEYS and
                          all(isinstance(v, str) and 0 < len(v) <= 8192 for v in document.values()) and
                          document['SUPABASE_URL'] == URL, 'B3_CONFIG_SCHEMA')
            else:
                a.require(record['size'] == 2618, 'B3_SIGNER_SIZE')
            handles[name], records[name] = handle, record
        try:
            yield records, {name: f'/proc/{os.getpid()}/fd/{handle.fileno()}' for name, handle in handles.items()}
        finally:
            for name, handle in handles.items():
                current, _ = file_record(handle)
                a.require(current == records[name], 'B3_INPUT_MUTATION')
                with a.checked(paths[name]).open('rb') as check:
                    a.require(file_record(check)[0] == records[name], 'B3_INPUT_SUBSTITUTION')


def replace(args, old, new):
    matches = [i for i in range(len(args)-len(old)+1) if args[i:i+len(old)] == old]
    a.require(len(matches) == 1, 'B3_BIND_MEMBERSHIP')
    i = matches[0]
    args[i:i+len(old)] = new


def source_state(root, pins):
    dirs = SCAFFOLDS | {str(p) for name in set(pins) | SCAFFOLDS for p in Path(name).parents if str(p) != '.'}
    expected, seen = set(pins) | dirs, set()
    for count, path in enumerate((root/'source').rglob('*')):
        name = str(path.relative_to(root/'source'))
        a.require(count < 2048 and not path.is_symlink() and name in expected, 'B3_SOURCE_MEMBERSHIP')
        a.require(path.is_file() if name in pins else path.is_dir(), 'B3_SOURCE_TYPE')
        seen.add(name)
    a.require(seen == expected, 'B3_SOURCE_MISSING')
    actual = {name: b2.fingerprint(root/'source'/name) for name in pins}
    a.require(actual == pins, 'B3_SOURCE_CHANGED')
    return actual


def controls(root):
    names = ('init.d/policy.gradle', 'launcher.sh', 'projects.json')
    result = {name: b2.fingerprint(root/name) for name in names}
    for name in ('d1-recording-apk-unit-b3.py', 'd1-recording-apk-unit-b3-policy.gradle',
                 'd1-recording-apk-unit-b3-launcher.sh'):
        result[name] = b2.fingerprint(HERE/name)
    return result


def descriptor(binding):
    number = int(Path(binding).name)
    a.require(number >= 3 and binding == f'/proc/{os.getpid()}/fd/{number}', 'B3_DESCRIPTOR_BINDING')
    os.fstat(number)
    return number


def capture(argv, folder, seconds=300, cap=1048576, descriptors=()):
    # B1's bounded capture semantics, with explicit inheritance only for native FD mounts.
    mounts = {int(argv[i+1]) for i, token in enumerate(argv) if token == '--ro-bind-fd'}
    a.require(set(descriptors) == mounts, 'B3_DESCRIPTOR_MEMBERSHIP')
    folder.mkdir()
    a.create(folder/'argv.json', json.dumps(argv).encode())
    a.create(folder/'stdout', b'')
    a.create(folder/'stderr', b'')
    result, process, total = dict(exit=-1, reason='launch'), None, 0
    deadline = time.monotonic()+seconds
    try:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={'PATH': '/usr/bin:/bin'}, start_new_session=True, pass_fds=tuple(descriptors))
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


def certificate(root, signer):
    args = ['/usr/bin/bwrap', '--die-with-parent', '--unshare-all', '--clearenv', '--tmpfs', '/',
            '--proc', '/proc', '--dev', '/dev', '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
            '--ro-bind', '/lib64', '/lib64', '--ro-bind', str(a.J), '/jdk', '--ro-bind-fd', str(descriptor(signer)), '/signer',
            '--tmpfs', '/tmp', '--setenv', 'HOME', '/tmp', '--', '/jdk/bin/keytool', '-J-Duser.home=/tmp',
            '-exportcert', '-alias', 'androiddebugkey', '-storepass', 'android', '-keystore', '/signer']
    result = capture(args, root/'certificate', seconds=30, cap=65536, descriptors=(descriptor(signer),))
    a.require(result == dict(exit=0, reason='ok') and a.digest(root/'certificate/stdout') == CERT_PIN,
              'B3_CERTIFICATE_IDENTITY')
    return CERT_PIN


def plan(root, bindings):
    args = b2.plan(root, policy=True, app=True)
    replace(args, ['--ro-bind', str(root/'placeholder'), '/b2/public-placeholder'],
            ['--ro-bind-fd', str(descriptor(bindings['signer'])), '/b3/signer'])
    replace(args, ['--chdir', '/app/vaca_app/android'], ['--chdir', '/app/vaca_app'])
    args += ['--ro-bind-fd', str(descriptor(bindings['config'])), '/b3/config', '--ro-bind', str(root/'projects.json'), '/b3/projects.json',
             '--bind', str(root/'state'), '/b3/state', '--bind', str(root/'dart-tool'), '/app/vaca_app/.dart_tool',
             '--bind', str(root/'project-cache'), '/app/vaca_app/android/.gradle']
    for name in b.OUTPUTS[:3]:
        args += ['--ro-bind', str(root/'source'/name), '/app/'+name]
    for index, name in enumerate(GENERATED):
        args += ['--bind', str(root/'generated'/str(index)), '/app/'+name]
    for name in ('gradlew', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties'):
        args += ['--ro-bind', str(root/'source/vaca_app/android'/name), '/b3/'+name]
    args += ['--ro-bind', str(root/'launcher.sh'), '/app/vaca_app/android/gradlew']
    options = ['-Dorg.gradle.jvmargs='+b2.JVM, '-Dorg.gradle.daemon=false', '-Dorg.gradle.parallel=false',
               '-Dorg.gradle.workers.max=1', '-Dorg.gradle.configuration-cache=false']
    return args+['--setenv', 'GRADLE_OPTS', shlex.join(options)]


def command():
    return [str(a.F/'bin/cache/dart-sdk/bin/dart'),
            '--packages='+str(a.F/'packages/flutter_tools/.dart_tool/package_config.json'),
            str(a.F/'bin/cache/flutter_tools.snapshot'), '--suppress-analytics', '--no-version-check',
            'build', 'apk', '--debug', '--flavor', 'dev', '--no-pub', '--dart-define=FLAVOR=dev',
            '--dart-define-from-file=/b3/config', '--target-platform=android-arm64',
            '--android-project-arg=org.gradle.java.installations.paths='+str(a.J),
            '--android-project-arg=org.gradle.java.installations.auto-download=false',
            '--android-project-arg=org.gradle.java.installations.auto-detect=false',
            '--android-project-arg=kotlin.compiler.execution.strategy=in-process']


def artifact(root, maximum=512*1024*1024):
    path = a.checked(root/APK)
    info = path.stat()
    a.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 4 <= info.st_size <= maximum, 'B3_APK_TYPE_SIZE')
    with path.open('rb') as stream:
        a.require(stream.read(4) == b'PK\x03\x04', 'B3_APK_CONTAINER')
    path.chmod(0o600)
    return dict(path=APK, sha256=a.digest(path), size=info.st_size)


def output_state(root):
    count, size = 0, 0
    for name in ('build', 'dart-tool', 'generated', 'project-cache'):
        a.require((root/name).stat().st_mode & 0o077 == 0, 'B3_OUTPUT_ROOT_MODE')
        for path in (root/name).rglob('*'):
            count += 1
            info = path.lstat()
            a.require(count <= 200000 and not path.is_symlink(), 'B3_OUTPUT_COUNT_LINK')
            a.require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), 'B3_OUTPUT_TYPE')
            if path.is_file(): size += info.st_size
            a.require(size <= 8*1024**3, 'B3_OUTPUT_BYTES')
    for name in ('home', 'android'):
        a.require(not list((root/name).rglob('*.keystore')), 'B3_UNEXPECTED_SIGNER')
    return dict(entries=count, bytes=size)


def prepare():
    root = a.checked(ROOT)
    if root.exists(): return 1
    old_mask = os.umask(0o077)
    receipt = dict(ready=False, sourceCommit=a.COMMIT)
    try:
        receipt['publicInputs'] = dict(b1=b.inputs(), b2=b2.inputs())
        root.mkdir(mode=0o700)
        for name in ('home', 'android', 'tmp', 'init.d', 'build', 'dart-tool', 'project-cache', 'generated', 'state'):
            (root/name).mkdir(mode=0o700)
        proof = json.loads((b.B/'receipt.json').read_bytes())
        receipt['source'] = b2.public_source(root, proof['postSource'], b.B/'source')
        (root/'source/vaca_app/android/.gradle').mkdir(mode=0o700)
        for name in b.OUTPUTS[:3]: a.copy_public(root/'source'/name, root/'dart-tool'/Path(name).name)
        for index, name in enumerate(GENERATED): a.copy_public(root/'source'/name, root/'generated'/str(index))
        a.copy_public(HERE/'d1-recording-apk-unit-b3-policy.gradle', root/'init.d/policy.gradle')
        a.copy_public(HERE/'d1-recording-apk-unit-b3-launcher.sh', root/'launcher.sh')
        (root/'launcher.sh').chmod(0o700)
        metadata = json.loads((root/'source/vaca_app/.flutter-plugins-dependencies').read_bytes())
        names = [entry['name'] for entry in metadata['plugins']['android']]
        a.require(len(names) == len(set(names)) and all(name.replace('_', '').isalnum() for name in names), 'B3_PLUGIN_NAMES')
        a.create(root/'projects.json', json.dumps([':app', *sorted(':'+name for name in names)]).encode())
        receipt['controls'] = controls(root)
        source_state(root, receipt['source'])
        with open_inputs() as (records, bindings):
            receipt['privateInputs'] = records
            receipt['certificate'] = certificate(root, bindings['signer'])
        source_state(root, receipt['source'])
        a.require(controls(root) == receipt['controls'], 'B3_CONTROL_CHANGED')
        a.require(dict(b1=b.inputs(), b2=b2.inputs()) == receipt['publicInputs'], 'B3_PUBLIC_INPUT_CHANGED')
        receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__  # Never disclose input values or raw parser diagnostics.
    finally:
        if root.exists(): a.create(root/'prepare.json', json.dumps(receipt, indent=2).encode())
        os.umask(old_mask)
    return 0 if receipt['ready'] else 1


def build(prepared_sha=None):
    root = a.checked(ROOT)
    preparation = a.checked(root/'prepare.json')
    if not preparation.is_file() or (root/'build-invocation.json').exists(): return 1
    if prepared_sha is None or a.digest(preparation) != prepared_sha: return 1
    prepared = json.loads(b.pinned(preparation, prepared_sha))
    if prepared.get('ready') is not True: return 1
    old_mask = os.umask(0o077)
    receipt = dict(ready=False, preparation=a.digest(root/'prepare.json'))
    a.create(root/'build-invocation.json', json.dumps(dict(command=command(), seconds=1800, cap=1048576)).encode())
    try:
        a.require(controls(root) == prepared['controls'], 'B3_CONTROL_CHANGED')
        a.require(dict(b1=b.inputs(), b2=b2.inputs()) == prepared['publicInputs'], 'B3_PUBLIC_INPUT_CHANGED')
        source_state(root, prepared['source'])
        a.require(not any((root/'state').iterdir()) and not any((root/'build').iterdir()), 'B3_NOT_FRESH')
        with open_inputs() as (records, bindings):
            a.require(records == prepared['privateInputs'] and prepared['certificate'] == CERT_PIN, 'B3_PRIVATE_INPUT_CHANGED')
            args = plan(root, bindings)+['--', *command()]
            a.create(root/'mount-plan.json', json.dumps(args, indent=2).encode())
            receipt['result'] = capture(args, root/'compile', seconds=1800, cap=1048576,
                                        descriptors=tuple(descriptor(value) for value in bindings.values()))
            a.require(receipt['result'] == dict(exit=0, reason='ok'), 'B3_BUILD_FAILED')
            lines = (root/'compile/stdout').read_text(errors='replace').splitlines()
            a.require(lines.count('B3_FINAL devDebug cl.vaca.app.dev debug /b3/signer') == 1, 'B3_FINAL_MODEL')
            a.require((root/'state/attempt').is_dir(), 'B3_NO_GRADLE_ATTEMPT')
            receipt['artifact'] = artifact(root)
        receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__
    finally:
        try:
            source_state(root, prepared['source'])
            a.require(controls(root) == prepared['controls'], 'B3_CONTROL_CHANGED')
            a.require(dict(b1=b.inputs(), b2=b2.inputs()) == prepared['publicInputs'], 'B3_PUBLIC_INPUT_CHANGED')
            receipt['outputs'] = output_state(root)
        except Exception as error:
            receipt.update(ready=False, boundaryFailure=type(error).__name__)
        a.create(root/'build.json', json.dumps(receipt, indent=2).encode())
        os.umask(old_mask)
    return 0 if receipt['ready'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('prepare', 'build'), help='fixed one-shot phase; no retry or alternate-root option')
    parser.add_argument('--prepared-sha', help='required for build: parent-observed SHA-256 of the accepted prepare receipt')
    options = parser.parse_args()
    phase = options.phase
    if (phase == 'build') != bool(options.prepared_sha): parser.error('build alone requires --prepared-sha')
    def deadline(*_): raise TimeoutError('B3_DEADLINE')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(90 if phase == 'prepare' else 1900)
    result = prepare() if phase == 'prepare' else build(options.prepared_sha)
    print('B3 '+phase.upper()+(' PASS' if result == 0 else ' STOP; inspect protected receipt'))
    sys.exit(result)
