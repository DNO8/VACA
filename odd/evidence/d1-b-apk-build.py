"""Fixed new B APK: public seed, private preparation, then one bounded build.
Reuses accepted B2 mount primitives and unchanged B3 policy/launcher; never
imports/runs B3 or mutates historical contexts. Each phase is create-only.
"""
import argparse
import io
import tarfile
import shutil
from pathlib import PurePosixPath
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
    raise ValueError('BAPK_LIBRARY_PIN')
spec = importlib.util.spec_from_file_location('accepted_b2_library', LIBRARY)
b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b2)
b, a = b2.b, b2.a
SOURCE = 'd7e24f3e866833721ad6003ca1c86e825cfab0f2'
SOURCE_PIN = '5fb1a2f10f8069877e58d8536b52c865f2a9febcd313f3b5d865ccb19f1c64b4'
INPUTS = HERE.parents[1]/'.tooling/d1-b-apk-inputs-d7e24f3'
ROOT = HERE.parents[1]/'.tooling/d1-b-apk-d7e24f3-code2'
CACHE = Path('/home/danilo/projects/vaca-d1-apk-delivery-isolated/.tooling/d1-recording-apk/unit-a')
CACHE_STATE_PIN = 'b4ddd71517b92b20d35eec38c029c39c3e423294f23aaa5342b97f2725898913'
EXTRA = dict(zip(('android-'+arch+'-'+mode for arch in ('arm', 'arm64', 'x64') for mode in ('profile', 'release')), (
    '6e3f15a53f0a259351338e726dbda22ac88e8868758b7feb72cf2fe3c19bf23d',
    '3b9a5d8de6858908864a990d98cdeaf89ba87e4e0917772965f3ebace9b6be02',
    '3911bdf379f67ed7c2892e6e3216ce2a31d9323511da59334f1c5e468182d16b',
    '8da0f8379874849d86aac25afad3bc5bb7eb610536646c5d9bc175b104944e81',
    'e8ff1ed46da20cc94a8e86e2b393a394e4b1ca2ae8eb1d045e5ca06ecc938d19',
    '50d68116209a4fa1554d0bd2aee88aae0e5834779cbd7f973b1de77930cb460d')))

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
    a.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 65536, 'BAPK_INPUT_TYPE_SIZE')
    handle.seek(0)
    data = handle.read(65537)
    a.require(len(data) == info.st_size, 'BAPK_INPUT_CHANGED')
    record = {key: getattr(info, 'st_'+key) for key in ('dev', 'ino', 'mode', 'size', 'mtime_ns', 'ctime_ns')}
    return dict(record, sha256=hashlib.sha256(data).hexdigest()), data


@contextmanager
def open_inputs(paths=PRIVATE, config_pin=CONFIG_PIN):
    a.require(set(paths) == {'config', 'signer'}, 'BAPK_INPUT_MEMBERSHIP')
    with ExitStack() as stack:
        handles, records = {}, {}
        for name, path in paths.items():
            path = a.checked(path)
            handle = stack.enter_context(os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb'))
            record, data = file_record(handle)
            if name == 'config':
                a.require(record['sha256'] == config_pin, 'BAPK_CONFIG_PIN')
                document = json.loads(data)
                a.require(isinstance(document, dict) and set(document) == KEYS and
                          all(isinstance(v, str) and 0 < len(v) <= 8192 for v in document.values()) and
                          document['SUPABASE_URL'] == URL, 'BAPK_CONFIG_SCHEMA')
            else:
                a.require(record['size'] == 2618, 'BAPK_SIGNER_SIZE')
            handles[name], records[name] = handle, record
        try:
            yield records, {name: f'/proc/{os.getpid()}/fd/{handle.fileno()}' for name, handle in handles.items()}
        finally:
            for name, handle in handles.items():
                current, _ = file_record(handle)
                a.require(current == records[name], 'BAPK_INPUT_MUTATION')
                with a.checked(paths[name]).open('rb') as check:
                    a.require(file_record(check)[0] == records[name], 'BAPK_INPUT_SUBSTITUTION')


def replace(args, old, new):
    matches = [i for i in range(len(args)-len(old)+1) if args[i:i+len(old)] == old]
    a.require(len(matches) == 1, 'BAPK_BIND_MEMBERSHIP')
    i = matches[0]
    args[i:i+len(old)] = new


def source_state(root, pins):
    dirs = SCAFFOLDS | {str(p) for name in set(pins) | SCAFFOLDS for p in Path(name).parents if str(p) != '.'}
    expected, seen = set(pins) | dirs, set()
    for count, path in enumerate((root/'source').rglob('*')):
        name = str(path.relative_to(root/'source'))
        a.require(count < 2048 and not path.is_symlink() and name in expected, 'BAPK_SOURCE_MEMBERSHIP')
        a.require(path.is_file() if name in pins else path.is_dir(), 'BAPK_SOURCE_TYPE')
        seen.add(name)
    a.require(seen == expected, 'BAPK_SOURCE_MISSING')
    actual = {name: b2.fingerprint(root/'source'/name) for name in pins}
    a.require(actual == pins, 'BAPK_SOURCE_CHANGED')
    return actual


def controls(root):
    names = ('init.d/policy.gradle', 'launcher.sh', 'projects.json')
    result = {name: b2.fingerprint(root/name) for name in names}
    for name in ('d1-b-apk-build.py', 'd1-recording-apk-unit-b2.py',
                 'd1-recording-apk-unit-b1.py', 'd1-recording-apk-sandbox.py',
                 'd1-recording-apk-unit-b3-policy.gradle',
                 'd1-recording-apk-unit-b3-launcher.sh'):
        result[name] = b2.fingerprint(HERE/name)
    return result


def descriptor(binding):
    number = int(Path(binding).name)
    a.require(number >= 3 and binding == f'/proc/{os.getpid()}/fd/{number}', 'BAPK_DESCRIPTOR_BINDING')
    os.fstat(number)
    return number


def capture(argv, folder, seconds=300, cap=1048576, descriptors=()):
    # B1's bounded capture semantics, with explicit inheritance only for native FD mounts.
    mounts = {int(argv[i+1]) for i, token in enumerate(argv) if token == '--ro-bind-fd'}
    a.require(set(descriptors) == mounts, 'BAPK_DESCRIPTOR_MEMBERSHIP')
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
              'BAPK_CERTIFICATE_IDENTITY')
    return CERT_PIN


def plan(root, bindings):
    args = b2.plan(root, sdk=a.F, owned=root/'owned', policy=True, app=True)
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
            '--build-name=0.1.0', '--build-number=2',
            '--dart-define-from-file=/b3/config', '--target-platform=android-arm64',
            '--android-project-arg=org.gradle.java.installations.paths='+str(a.J),
            '--android-project-arg=org.gradle.java.installations.auto-download=false',
            '--android-project-arg=org.gradle.java.installations.auto-detect=false',
            '--android-project-arg=kotlin.compiler.execution.strategy=in-process',
            '--android-project-arg=kotlin.project.persistent.dir=/b3/state/kotlin']


def artifact(root, maximum=512*1024*1024):
    path = a.checked(root/APK)
    info = path.stat()
    a.require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 4 <= info.st_size <= maximum, 'BAPK_APK_TYPE_SIZE')
    with path.open('rb') as stream:
        a.require(stream.read(4) == b'PK\x03\x04', 'BAPK_APK_CONTAINER')
    path.chmod(0o600)
    return dict(path=APK, sha256=a.digest(path), size=info.st_size)


def output_state(root):
    count, size = 0, 0
    for name in ('build', 'dart-tool', 'generated', 'project-cache', 'state', 'owned'):
        a.require(not (root/name).is_symlink() and (root/name).stat().st_mode & 0o077 == 0, 'BAPK_OUTPUT_ROOT_MODE')
        for path in (root/name).rglob('*'):
            count += 1
            info = path.lstat()
            a.require(count <= 200000 and not path.is_symlink(), 'BAPK_OUTPUT_COUNT_LINK')
            a.require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), 'BAPK_OUTPUT_TYPE')
            if path.is_file(): size += info.st_size
            a.require(size <= 8*1024**3, 'BAPK_OUTPUT_BYTES')
    for name in ('home', 'android', 'state', 'owned/home', 'owned/android'):
        a.require(not list((root/name).rglob('*.keystore')), 'BAPK_UNEXPECTED_SIGNER')
    return dict(entries=count, bytes=size)


def unpack_source(archive, manifest, destination, pin):
    a.require(a.checked(manifest).stat().st_size <= 1024*1024, 'manifest size')
    raw = a.checked(manifest).read_bytes()
    a.require(hashlib.sha256(raw).hexdigest() == pin, 'manifest pin')
    m = json.loads(raw)
    a.require(m['schema'] == 'vaca.d1.apk-public-source/v1' and m['sourceCommit'] == SOURCE, 'source/schema')
    a.require(a.checked(archive).stat().st_size <= 64*1024*1024, 'archive size')
    data = a.checked(archive).read_bytes()
    a.require(len(data) == m['archiveSize'] and hashlib.sha256(data).hexdigest() == m['archiveSha256'], 'archive pin')
    a.require(0 < m['fileCount'] <= 2048 and 0 <= m['sourceBytes'] <= 64*1024*1024, 'source bounds')
    rows = {r['path']: r for r in m['files']}
    a.require(len(rows) == len(m['files']) == m['fileCount'], 'duplicate/count')
    a.require(sum(r['size'] for r in rows.values()) == m['sourceBytes'], 'source bytes')
    payload = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar:
            name = member.name
            parts = PurePosixPath(name).parts
            a.require(not name.startswith('/') and str(PurePosixPath(name)) == name and '..' not in parts, 'archive path')
            a.require(all(not p.startswith('.') for p in parts) or name == 'vaca_app/.metadata', 'dot path')
            a.require(name in m['allowedExactPaths'] or any(name.startswith(p) for p in m['allowedPrefixes']), 'allowlist')
            a.require(member.isfile() and name in rows and name not in payload, 'archive type/membership')
            row = rows[name]
            a.require(row['mode'] in ('100644', '100755') and member.mode == int(row['mode'], 8) & 0o777, 'mode')
            a.require(member.size == row['size'] and 0 <= member.size <= m['sourceBytes'], 'member size')
            body = tar.extractfile(member).read()
            a.require(len(body) == row['size'] and hashlib.sha256(body).hexdigest() == row['sha256'], 'content hash')
            a.require(hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest() == row['gitBlob'], 'blob hash')
            payload[name] = body
    a.require(payload.keys() == rows.keys(), 'missing members')
    a.checked(destination).mkdir(mode=0o700)
    for name, body in payload.items():
        a.create(destination/name, body)
        (destination/name).chmod(int(rows[name]['mode'], 8) & 0o777)
    return m


def seed_cache(root):
    owned = root/'owned'
    owned.mkdir(mode=0o700)
    state = json.loads(b.pinned(CACHE/'state-01771.json', CACHE_STATE_PIN))
    a.require(len(state['files']) == len(state['copied']) == 47284, 'BAPK_CACHE_COUNT')
    a.require(shutil.disk_usage(root).free >= 9*1024**3, 'BAPK_CAPACITY')
    records = {}
    for (_, destination), expected in zip(state['files'], state['copied']):
        source = a.checked(destination)
        a.require(source.is_relative_to(CACHE), 'BAPK_CACHE_SCOPE')
        relative = source.relative_to(CACHE)
        a.require(relative.parts[0] in ('flutter-cache', 'flutter-gradle', 'pub', 'gradle'), 'BAPK_CACHE_ROOT')
        before = b2.fingerprint(source)
        a.require(before == {key: expected[key] for key in ('sha256', 'mode')}, 'BAPK_CACHE_INPUT')
        a.copy_public(source, owned/relative)
        a.require(b2.fingerprint(owned/relative) == before, 'BAPK_CACHE_COPY')
        records[str(relative)] = before
    for name, pin in EXTRA.items():
        relative = 'flutter-cache/artifacts/engine/'+name+'/linux-x64/gen_snapshot'
        a.require(a.digest(CACHE/relative) == pin, 'BAPK_ENGINE_PIN')
        a.copy_public(CACHE/relative, owned/relative)
        records[relative] = b2.fingerprint(owned/relative)
    for name in ('source', 'home', 'android', 'fixture'):
        (owned/name).mkdir(mode=0o700)
    a.create(owned/'fixture/public-marker', b'public\n')
    a.create(owned/'version', b'3.41.9\n')
    records['version'] = b2.fingerprint(owned/'version')
    a.create(root/'cache-manifest.json', json.dumps(records, sort_keys=True).encode())
    return a.digest(root/'cache-manifest.json')


def cache_inputs(root, pin):
    records = json.loads(b.pinned(root/'cache-manifest.json', pin))
    owned = root/'owned'
    # Match the existing B2 public-input boundary without its historical receipts.
    state = dict(files=[('', str(owned/name)) for name in records], copied=list(records.values()))
    selected = b2.selected_inputs(owned, state)
    names = ['flutter-cache/'+name for name in ('dart-sdk/bin/dart', 'flutter_tools.snapshot', 'flutter.version.json')]
    names += ['version']+['flutter-cache/artifacts/engine/'+name+'/linux-x64/gen_snapshot' for name in EXTRA]
    for artifact, expected in b2.AGP.items():
        matches = [name for name in records if name.startswith('gradle/caches/modules-2/files-2.1/com.android.tools.build/'+artifact+'/8.11.1/') and name.endswith('/'+artifact+'-8.11.1.jar')]
        a.require(len(matches) == 1 and records[matches[0]]['sha256'] == expected, 'BAPK_AGP_PIN')
        names += matches
    for name in names:
        actual = b2.fingerprint(owned/name)
        a.require(actual == records[name], 'BAPK_SELECTED_CACHE_CHANGED')
        selected[name] = actual
    b.pinned(a.F/'packages/flutter_tools/.dart_tool/package_config.json', b.TOOL_PIN)
    metadata = json.loads((owned/'flutter-cache/flutter.version.json').read_text())
    a.require(metadata['frameworkVersion'] == metadata['flutterVersion'] == '3.41.9' and metadata['dartSdkVersion'] == '3.11.5', 'BAPK_SDK_VERSION')
    return selected


def public_inputs(root):
    seed = json.loads((root/'seed.json').read_text())
    a.require(seed.get('ready') is True and seed['sourceCommit'] == SOURCE and seed['sourceManifest'] == SOURCE_PIN, 'BAPK_SEED_BINDING')
    b.pinned(INPUTS/'source-manifest.json', SOURCE_PIN)
    return dict(seed=a.digest(root/'seed.json'), cache=cache_inputs(root, seed['cacheManifest']))


def seed():
    root = a.checked(ROOT)
    if root.exists(): return 1
    old_mask = os.umask(0o077)
    receipt = dict(ready=False, sourceCommit=SOURCE, sourceManifest=SOURCE_PIN)
    root.mkdir(mode=0o700)
    try:
        receipt['cacheManifest'] = seed_cache(root)
        manifest = unpack_source(INPUTS/'source.tar', INPUTS/'source-manifest.json', root/'source', SOURCE_PIN)
        for name in ('home', 'android', 'tmp', 'init.d', 'build', 'dart-tool', 'project-cache', 'generated', 'state'):
            (root/name).mkdir(mode=0o700)
        wrappers = b.wrappers(root/'source', manifest, {name: root/'owned/flutter-cache/artifacts/gradle_wrapper'/name for name in b.WRAPPERS})
        args = a.mount_plan(sdk=a.F, owned=root/'owned', view=root/'public-sdk-view')
        replace(args, ['--bind', str(root/'owned/source'), '/app'], ['--bind', str(root/'source'), '/app'])
        args += ['--chdir', '/app/vaca_app', '--', str(a.F/'bin/cache/dart-sdk/bin/dart'),
                 '--packages='+str(a.F/'packages/flutter_tools/.dart_tool/package_config.json'),
                 str(a.F/'bin/cache/flutter_tools.snapshot'), '--suppress-analytics', '--no-version-check',
                 'pub', 'get', '--offline', '--enforce-lockfile', '--no-example']
        receipt['pub'] = capture(args, root/'public-pub', seconds=180)
        a.require(receipt['pub'] == dict(exit=0, reason='ok'), 'BAPK_PUBLIC_PUB_FAILED')
        generated = b.boundary(root/'source', manifest, wrappers)
        a.require(set(generated) == set(b.OUTPUTS) | set(wrappers), 'BAPK_GENERATED_MEMBERSHIP')
        pins = {row['path']: dict(sha256=row['sha256'], mode=int(row['mode'], 8)&0o777) for row in manifest['files']}
        receipt['source'] = dict(pins, **generated)
        for name in SCAFFOLDS: (root/'source'/name).mkdir(mode=0o700)
        for name in b.OUTPUTS[:3]: a.copy_public(root/'source'/name, root/'dart-tool'/Path(name).name)
        for index, name in enumerate(GENERATED): a.copy_public(root/'source'/name, root/'generated'/str(index))
        a.copy_public(HERE/'d1-recording-apk-unit-b3-policy.gradle', root/'init.d/policy.gradle')
        a.copy_public(HERE/'d1-recording-apk-unit-b3-launcher.sh', root/'launcher.sh')
        (root/'launcher.sh').chmod(0o700)
        plugins = json.loads((root/'source/vaca_app/.flutter-plugins-dependencies').read_text())
        names = [entry['name'] for entry in plugins['plugins']['android']]
        a.require(len(names) == len(set(names)) and all(name.replace('_', '').isalnum() for name in names), 'BAPK_PLUGIN_NAMES')
        a.create(root/'projects.json', json.dumps([':app', *sorted(':'+name for name in names)]).encode())
        receipt['controls'] = controls(root)
        receipt['selected'] = cache_inputs(root, receipt['cacheManifest'])
        source_state(root, receipt['source'])
        receipt['ready'] = True
    except Exception as error:
        receipt.update(failure=type(error).__name__, publicFailureCode=str(error)[:200])
    finally:
        a.create(root/'seed.json', json.dumps(receipt, indent=2).encode())
        os.umask(old_mask)
    return 0 if receipt['ready'] else 1


def prepare(seed_sha, root=ROOT):
    root = a.checked(root)
    if (root/'prepare.json').exists() or (root/'prepare-invocation.json').exists(): return 1
    seed = json.loads(b.pinned(root/'seed.json', seed_sha))
    if seed.get('ready') is not True: return 1
    old_mask = os.umask(0o077)
    receipt = dict(ready=False, sourceCommit=SOURCE, seed=seed_sha, source=seed['source'])
    # Claim before opening either input; an interrupted attempt is not replayable.
    a.create(root/'prepare-invocation.json', json.dumps(dict(seed=seed_sha, sourceCommit=SOURCE)).encode())
    try:
        receipt['publicInputs'] = public_inputs(root)
        receipt['controls'] = controls(root)
        a.require(receipt['controls'] == seed['controls'], 'BAPK_CONTROL_CHANGED')
        source_state(root, receipt['source'])
        with open_inputs() as (records, bindings):
            receipt['privateInputs'] = records
            receipt['certificate'] = certificate(root, bindings['signer'])
        source_state(root, receipt['source'])
        a.require(controls(root) == receipt['controls'], 'BAPK_CONTROL_CHANGED')
        a.require(public_inputs(root) == receipt['publicInputs'], 'BAPK_PUBLIC_INPUT_CHANGED')
        receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__
    finally:
        a.create(root/'prepare.json', json.dumps(receipt, indent=2).encode())
        os.umask(old_mask)
    return 0 if receipt['ready'] else 1

def build(prepared_sha=None, root=ROOT):
    root = a.checked(root)
    preparation = a.checked(root/'prepare.json')
    if not preparation.is_file() or (root/'build-invocation.json').exists(): return 1
    if prepared_sha is None or a.digest(preparation) != prepared_sha: return 1
    prepared = json.loads(b.pinned(preparation, prepared_sha))
    if prepared.get('ready') is not True: return 1
    old_mask = os.umask(0o077)
    receipt = dict(ready=False, preparation=a.digest(root/'prepare.json'))
    a.create(root/'build-invocation.json', json.dumps(dict(command=command(), seconds=1800, cap=1048576)).encode())
    try:
        a.require(controls(root) == prepared['controls'], 'BAPK_CONTROL_CHANGED')
        a.require(public_inputs(root) == prepared['publicInputs'], 'BAPK_PUBLIC_INPUT_CHANGED')
        source_state(root, prepared['source'])
        a.require(not any((root/'state').iterdir()) and not any((root/'build').iterdir()), 'BAPK_NOT_FRESH')
        with open_inputs() as (records, bindings):
            a.require(records == prepared['privateInputs'] and prepared['certificate'] == CERT_PIN, 'BAPK_PRIVATE_INPUT_CHANGED')
            args = plan(root, bindings)+['--', *command()]
            a.create(root/'mount-plan.json', json.dumps(args, indent=2).encode())
            receipt['result'] = capture(args, root/'compile', seconds=1800, cap=1048576,
                                        descriptors=tuple(descriptor(value) for value in bindings.values()))
            a.require(receipt['result'] == dict(exit=0, reason='ok'), 'BAPK_BUILD_FAILED')
            lines = (root/'compile/stdout').read_text(errors='replace').splitlines()
            a.require(lines.count('B3_FINAL devDebug cl.vaca.app.dev debug /b3/signer') == 1, 'BAPK_FINAL_MODEL')
            a.require((root/'state/attempt').is_dir(), 'BAPK_NO_GRADLE_ATTEMPT')
            receipt['artifact'] = artifact(root)
        receipt['ready'] = True
    except Exception as error:
        receipt['failure'] = type(error).__name__
    finally:
        try:
            source_state(root, prepared['source'])
            a.require(controls(root) == prepared['controls'], 'BAPK_CONTROL_CHANGED')
            a.require(public_inputs(root) == prepared['publicInputs'], 'BAPK_PUBLIC_INPUT_CHANGED')
            receipt['outputs'] = output_state(root)
        except Exception as error:
            receipt.update(ready=False, boundaryFailure=type(error).__name__)
        a.create(root/'build.json', json.dumps(receipt, indent=2).encode())
        os.umask(old_mask)
    return 0 if receipt['ready'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('seed', 'prepare', 'build'), help='fixed one-shot phases; no retry or alternate root')
    parser.add_argument('--seed-sha', help='prepare only: parent-observed accepted public seed receipt SHA-256')
    parser.add_argument('--prepared-sha', help='build only: parent-observed accepted private preparation receipt SHA-256')
    options = parser.parse_args()
    if (options.phase == 'prepare') != bool(options.seed_sha) or (options.phase == 'build') != bool(options.prepared_sha):
        parser.error('prepare alone requires --seed-sha; build alone requires --prepared-sha')
    def deadline(*_): raise TimeoutError('BAPK_DEADLINE')
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm({'seed': 600, 'prepare': 90, 'build': 1900}[options.phase])
    result = seed() if options.phase == 'seed' else prepare(options.seed_sha) if options.phase == 'prepare' else build(options.prepared_sha)
    print('BAPK '+options.phase.upper()+(' PASS' if result == 0 else ' STOP; inspect protected receipt'))
    sys.exit(result)
