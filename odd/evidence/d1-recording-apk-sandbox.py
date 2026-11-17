"""Public-only bounded stages: roots, index (until indexed), copy (until copied),
verify (until verified), probe, verify again. Each stage has a 25-second deadline;
index/copy/verify additionally limit each batch. Any failure stops continuation.
Use a background execution tool for real inputs; never runs SDKs. prepare is retired.
L16 only: mount-l16 admits the pinned job-70 failure once; verify-l16 performs
mandatory bounded post-probe integrity batches. Old failed stages remain STOPPED.
"""
import argparse
import contextlib
import copy
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import sys
import stat
import subprocess
import tarfile
import time
from urllib.parse import unquote, urlparse

COMMIT = 'e7f870540bf8bd91df49de7869ca8f343689d9bd'
PIN = '1ea29b61bd3cb3048c51203eddca1034a4c91e4174175739a83d36c326a8aea0'
I = Path(__file__).absolute().parents[2]
P = Path('/home/danilo/projects/vaca-d1-t5b-proof')
F = P/'.tooling/flutter'
T = I/'.tooling/d1-recording-apk'
W = T/'unit-a'
J = P/'.tooling/jdk/temurin-17.0.21+9'
A = P/'.tooling/android-sdk'
L16_DIR = T/'unit-a-l16'
L16_FAIL = 'run-1794872731741353145'
L16_GOOD = 'run-1794872729991001080'
L16_STATE = 'state-01771.json'
L16_COUNTS = (1773, 1772, 47284)
L16_OLD_HELPER = '5f5b99ad94db4165012a252a80130afb9544a7abd06a429c6e7d9202e412832a'
L16_ERROR = "bwrap: Can't create file at /home/danilo/projects/vaca-d1-t5b-proof/.tooling/flutter/version: Read-only file system\nValueError: namespace probe exit=1\n"
L16_PINS = {
    L16_STATE: 'b4ddd71517b92b20d35eec38c029c39c3e423294f23aaa5342b97f2725898913',
    'mount-plan.json': 'f3f4429a6658bec704f35cf22f3f0db8679cc19f584e9eaafa71ec64b8093bef',
    'source-receipt.json': '13dc9839f6a37d8bb20bf5abb6cf6145fcca6b66b960e0b99b1c0dfc450d4939',
    L16_FAIL+'/stdout': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    L16_FAIL+'/stderr': '40e412102be6f5d3a859395e8dd30cb35506392f7ed8f1f4ff47bc508b97e59c',
    L16_FAIL+'/exit': '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
    L16_FAIL+'/binding': 'f1b1f3d67637b592620f195ee7d1ae636713ec8c67a3d875a61b4ebaffb17c77',
    L16_GOOD+'/stdout': '9fc7283aa9849abee1ca0656acbb702c88b9aac72b8c7471d935643a808c37b9',
    L16_GOOD+'/stderr': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    L16_GOOD+'/exit': '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
    L16_GOOD+'/binding': '1c61713b7c276dd34dcd7d6b01ff459627ec098c1316b3174090c41cf20a94f8',
}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def checked(path):
    path = Path(path).absolute()
    require('..' not in path.parts, 'path traversal')
    require(not any(p.is_symlink() for p in (path, *path.parents)), 'symlink: '+str(path))
    return path

def digest(path):
    with checked(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def create(path, data):
    path = checked(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(data)

def unpack(archive, manifest, destination, pin):
    raw = checked(manifest).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == pin, 'manifest pin')
    m = json.loads(raw)
    require(m['schema'] == 'vaca.d1.apk-public-source/v1' and m['sourceCommit'] == COMMIT, 'source/schema')
    data = checked(archive).read_bytes()
    require(len(data) == m['archiveSize'] and hashlib.sha256(data).hexdigest() == m['archiveSha256'], 'archive pin')
    rows = {r['path']: r for r in m['files']}
    require(len(rows) == len(m['files']) == m['fileCount'], 'duplicate/count')
    require(sum(r['size'] for r in rows.values()) == m['sourceBytes'], 'source bytes')
    payload = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar:
            name = member.name
            parts = PurePosixPath(name).parts
            require(not name.startswith('/') and str(PurePosixPath(name)) == name and '..' not in parts, 'archive path')
            require(all(not p.startswith('.') for p in parts) or name == 'vaca_app/.metadata', 'dot path')
            require(name in m['allowedExactPaths'] or any(name.startswith(p) for p in m['allowedPrefixes']), 'allowlist')
            require(member.isfile() and name in rows and name not in payload, 'archive type/membership')
            row = rows[name]
            require(row['mode'] in ('100644', '100755') and member.mode == int(row['mode'], 8) & 0o777, 'mode')
            body = tar.extractfile(member).read()
            require(len(body) == row['size'] and hashlib.sha256(body).hexdigest() == row['sha256'], 'content hash')
            require(hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest() == row['gitBlob'], 'blob hash')
            payload[name] = body
    require(payload.keys() == rows.keys(), 'missing members')
    checked(destination).mkdir(mode=0o700)
    for name, body in payload.items():
        create(destination/name, body)
        (destination/name).chmod(int(rows[name]['mode'], 8) & 0o777)
    return m

def verify_source(root, manifest):
    rows = manifest['files']
    expected = {r['path'] for r in rows}
    expected |= {str(p) for r in rows for p in PurePosixPath(r['path']).parents if str(p) != '.'}
    actual = set()
    for p in checked(root).rglob('*'):
        require(not p.is_symlink(), 'symlink in source')
        actual.add(str(p.relative_to(root)))
    require(actual == expected, 'unexpected source')
    for row in rows:
        path = checked(root/row['path'])
        require(path.is_file(), 'nonregular source')
        require(digest(path) == row['sha256'] and stat.S_IMODE(path.stat().st_mode) == int(row['mode'], 8) & 0o777, 'source changed')

def copy_input(src, dst):
    src, dst = checked(src), checked(dst)
    require(src.is_file() and not dst.exists(), 'copy input/destination')
    before = src.stat()
    require(before.st_size <= 512*1024*1024, 'copy requires smaller bounded input: '+str(src))
    return before

def copy_public(src, dst):
    before = copy_input(src, dst)
    expected = digest(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with src.open('rb') as inp, dst.open('xb') as out:
        while block := inp.read(8*1024*1024):
            out.write(block)
    dst.chmod(stat.S_IMODE(before.st_mode) & 0o777)
    after = src.stat()
    require((before.st_size, before.st_mtime_ns, before.st_ino) == (after.st_size, after.st_mtime_ns, after.st_ino), 'input changed')
    require(digest(dst) == expected and dst.stat().st_ino != after.st_ino, 'copy integrity')
    return dict(sha256=expected, size=before.st_size, mtime_ns=before.st_mtime_ns, inode=before.st_ino, mode=stat.S_IMODE(before.st_mode))

def cache_roots():
    roots = []
    def add(src, dst):
        require(checked(src).exists(), 'missing public input: '+str(src))
        roots.append((src, W/dst))
    cache = F/'bin/cache'
    for name in ('dart-sdk pkg/sky_engine pkg/flutter_gpu flutter_tools.snapshot flutter_tools.stamp engine.realm engine.stamp engine-dart-sdk.stamp engine_stamp.json engine_stamp.stamp flutter.version.json flutter_sdk.stamp android-sdk.stamp android-internal-build-artifacts.stamp font-subset.stamp gradle_wrapper.stamp material_fonts.stamp artifacts/gradle_wrapper artifacts/material_fonts artifacts/engine/common artifacts/engine/linux-x64 artifacts/engine/android-arm artifacts/engine/android-arm64 artifacts/engine/android-x64').split():
        add(cache/name, 'flutter-cache/'+name)
    add(F/'packages/flutter_tools/gradle', 'flutter-gradle')
    pub = F/'.pub-cache'
    lock = (W/'source/vaca_app/pubspec.lock').read_text()
    for name, block in re.findall(r'^  (\w+):\n(.*?)(?=^  \w+:|^sdks:)', lock, re.M | re.S):
        if '    source: hosted\n' not in block:
            require('    source: sdk\n' in block or (name == 'camera_android_camerax' and 'path: "packages/camera_android_camerax"' in block and 'relative: true' in block), 'unsupported dependency')
            continue
        version = re.search(r'^    version: "([\w.+-]+)"$', block, re.M).group(1)
        sha = re.search(r'sha256: "?([a-f0-9]{64})', block).group(1)
        require('url: "https://pub.dev"' in block, 'unsupported host')
        folder = name+'-'+version
        hashpath = pub/('hosted-hashes/pub.dev/'+folder+'.sha256')
        require(checked(hashpath).read_text().strip() == sha, 'hosted hash: '+folder)
        for rel in ('hosted/pub.dev/'+folder, 'hosted-hashes/pub.dev/'+folder+'.sha256', 'hosted/pub.dev/.cache/'+name+'-versions.json'):
            add(pub/rel, 'pub/'+rel)
    gradle = P/'.tooling/gradle-home'
    for rel in ('caches/modules-2/files-2.1', 'caches/modules-2/metadata-2.107'):
        add(gradle/rel, 'gradle/'+rel)
    wrapper = 'wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/'
    for name in ('gradle-8.14', 'gradle-8.14-all.zip.ok'):
        add(gradle/(wrapper+name), 'gradle/'+wrapper+name)
    return [[str(src), str(dst)] for src, dst in roots]

def index_batch(state, limit=64, directory_limit=4096):
    queue, files = list(state['queue']), list(state['files'])
    for _ in range(min(limit, len(queue))):
        src, dst = map(Path, queue.pop(0))
        checked(src)
        require(src.exists(), 'missing public input: '+str(src))
        if src.is_dir():
            with os.scandir(src) as entries:
                for count, entry in enumerate(entries):
                    require(count < directory_limit, 'directory entry limit')
                    mode = entry.stat(follow_symlinks=False).st_mode
                    require(not stat.S_ISLNK(mode), 'symlink cache input')
                    require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), 'nonregular cache input')
                    if src.is_relative_to(F/'packages/flutter_tools/gradle') and entry.name in ('.gradle', 'build', '.kotlin'):
                        continue
                    pair = [str(src/entry.name), str(dst/entry.name)]
                    (queue if stat.S_ISDIR(mode) else files).append(pair)
        else:
            require(src.is_file(), 'nonregular cache input')
            files.append([str(src), str(dst)])
    require(len({d for _, d in files}) == len(files), 'duplicate cache target')
    return dict(state, queue=queue, files=files)

def tool_roots():
    manifest = F/'packages/flutter_tools/.dart_tool/package_config.json'
    roots = []
    for package in json.loads(checked(manifest).read_text())['packages']:
        if package['name'] == 'flutter_tools':
            require(package['rootUri'] == '../', 'tool root')
            continue
        uri = urlparse(package['rootUri'])
        path = checked(Path(unquote(uri.path)))
        require(uri.scheme == 'file' and not uri.netloc and path.parent == F/'.pub-cache/hosted/pub.dev' and path.is_dir(), 'tool dependency root')
        roots.append(path)
    return roots

def base_plan():
    args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-net', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--clearenv', '--cap-drop', 'ALL']
    for path in ('/usr', '/etc/ld.so.cache', '/etc/fonts'):
        args += ['--ro-bind', path, path]
    for name in ('bin', 'lib', 'lib64'):
        args += ['--symlink', 'usr/'+name, '/'+name]
    return args + ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp']

def mount_plan(sdk=F, owned=W, view=None, packages=None):
    view = checked(view if view is not None else owned/'sdk-view')
    require(not view.is_relative_to(sdk) and not sdk.is_relative_to(view), 'SDK view scope')
    packages = tool_roots() if packages is None else packages
    components = [checked(sdk/name) for name in ('bin', 'packages', '.git')]
    require(all(p.is_dir() for p in components), 'missing public SDK component')
    for path in packages:
        require(checked(path).is_dir() and path.parent == sdk/'.pub-cache/hosted/pub.dev', 'tool dependency root')
    view.mkdir(mode=0o700)
    for rel in ['bin', 'packages', '.git', '.pub-cache']+[str(p.relative_to(sdk)) for p in packages]:
        (view/rel).mkdir(parents=True, exist_ok=True)
    create(view/'version', b'')
    args = base_plan()+['--ro-bind', str(view), str(F)]
    for path in components+packages:
        args += ['--ro-bind', str(path), str(F/path.relative_to(sdk))]
    for path in (J, A):
        args += ['--ro-bind', str(checked(path)), str(path)]
    for name, dest in [('flutter-cache', F/'bin/cache'), ('flutter-gradle', F/'packages/flutter_tools/gradle'), ('source', Path('/app')), ('home', Path('/owned/home')), ('pub', Path('/owned/pub')), ('gradle', Path('/owned/gradle')), ('android', Path('/owned/android'))]:
        args += ['--bind', str(checked(owned/name)), str(dest)]
    args += ['--ro-bind', str(owned/'version'), str(F/'version'), '--ro-bind', str(owned/'fixture'), '/readonly-fixture']
    env = dict(HOME='/owned/home', JAVA_HOME=str(J), ANDROID_HOME=str(A), ANDROID_SDK_ROOT=str(A), ANDROID_USER_HOME='/owned/android', GRADLE_USER_HOME='/owned/gradle', PUB_CACHE='/owned/pub', FLUTTER_ROOT=str(F), XDG_CACHE_HOME='/owned/home/cache', XDG_CONFIG_HOME='/owned/home/config', XDG_DATA_HOME='/owned/home/data', TMPDIR='/tmp', PATH=str(J/'bin')+':/usr/bin:/bin', JAVA_TOOL_OPTIONS='-Duser.home=/owned/home', LANG='C.UTF-8')
    for key, value in env.items():
        args += ['--setenv', key, value]
    return args

def namespace_probe(args, hidden, readonly, mutable=()):
    code = '''import os, pathlib, errno
p = pathlib.Path
assert os.readlink('/proc/self/ns/net') != HOST_NET
assert 'D1_PUBLIC_AMBIENT_MARKER' not in os.environ
assert not p(HIDDEN_MARKER).exists()
assert list(p('/owned/android').iterdir()) == []
assert set(line.split(':')[0].strip() for line in p('/proc/net/dev').read_text().splitlines()[2:]) == {'lo'}
assert os.getpid() <= 2
assert os.environ['HOME'] == '/owned/home'
assert not p('/readonly-fixture/rejected').exists()
assert p('/readonly-fixture/public-marker').read_text() == 'public\\n'
try:
    p('/readonly-fixture/rejected').write_text('no')
except OSError as e:
    assert e.errno == errno.EROFS
else:
    raise AssertionError('readonly fixture writable')
for path in ['/owned/home', '/owned/pub', '/owned/gradle', '/owned/android', '/tmp']:
    (p(path)/'public-probe').write_text('public')
mounts = p('/proc/self/mountinfo').read_text()
for root in READONLY:
    assert any(line.split()[4] == root and 'ro' in line.split()[5].split(',') for line in mounts.splitlines())
for root in MUTABLE:
    assert any(line.split()[4] == root and 'rw' in line.split()[5].split(',') for line in mounts.splitlines())
    with (p(root)/'unit-a-public-probe').open('x') as proof: proof.write('public')
print('PUBLIC_NAMESPACE_PASS')
'''
    prefix = f'HOST_NET={os.readlink("/proc/self/ns/net")!r}\nHIDDEN_MARKER={str(hidden)!r}\nREADONLY={list(map(str, readonly))!r}\nMUTABLE={list(map(str, mutable))!r}\n'
    return subprocess.run(args+['--', '/usr/bin/python3', '-I', '-c', prefix+code], env={'PATH': '/usr/bin:/bin', 'D1_PUBLIC_AMBIENT_MARKER': 'public'}, capture_output=True, text=True, timeout=10)

def fixture_probe(root):
    create(root/'public-marker', b'public\n')
    args = base_plan()+['--ro-bind', str(root), '/readonly-fixture', '--tmpfs', '/owned', '--setenv', 'HOME', '/owned/home']
    for name in ('home', 'pub', 'gradle', 'android'):
        args += ['--dir', '/owned/'+name]
    result = namespace_probe(args, root/'public-marker', ['/readonly-fixture'])
    require((root/'public-marker').read_bytes() == b'public\n' and not (root/'rejected').exists(), 'fixture changed')
    return result

def source_check():
    manifest = T/'public-source-manifest.json'
    require(digest(manifest) == PIN, 'manifest pin')
    m = json.loads(manifest.read_text())
    require(digest(T/'public-source.tar') == m['archiveSha256'], 'archive pin')
    verify_source(W/'source', m)

def stage(action, state):
    state = copy.deepcopy(state)
    if action == 'roots':
        require(not state, 'roots already recorded')
        return dict(queue=cache_roots(), files=[], copied=[], verified=0, probed=False)
    require(bool(state), 'roots not recorded')
    if action == 'index':
        require(bool(state['queue']), 'already indexed')
        return index_batch(state)
    require(not state['queue'], 'inventory incomplete')
    if action in ('copy', 'verify'):
        start = len(state['copied']) if action == 'copy' else state['verified']
        require(action == 'copy' or len(state['copied']) == len(state['files']), 'copies incomplete')
        batch = state['files'][start:start+64]
        require(bool(batch), 'stage already complete')
        sizes = []
        for src, dst in batch:
            require(checked(src).is_file() and checked(dst).is_relative_to(W), 'invalid copy input/scope')
            sizes.append((copy_input(src, dst) if action == 'copy' else checked(src).stat()).st_size)
        selected, total = [], 0
        for pair, size in zip(batch, sizes):
            if selected and total+size > 128*1024*1024:
                break
            selected.append(pair)
            total += size
        for src, dst in selected:
            src, dst = Path(src), Path(dst)
            if action == 'copy':
                state['copied'].append(copy_public(src, dst))
            else:
                record = state['copied'][state['verified']]
                st = checked(src).stat()
                require((st.st_size, st.st_mtime_ns, st.st_ino, stat.S_IMODE(st.st_mode)) == tuple(record[k] for k in ('size', 'mtime_ns', 'inode', 'mode')), 'original metadata changed')
                require(digest(src) == digest(dst) == record['sha256'], 'cache hash changed')
                require(stat.S_IMODE(dst.stat().st_mode) == record['mode'], 'copy mode changed')
                state['verified'] += 1
        return state
    require(state['verified'] == len(state['files']) == len(state['copied']) and not state['probed'], 'probe prerequisites')
    for name in ('home', 'android', 'fixture'):
        checked(W/name).mkdir(exist_ok=True)
    metadata = json.loads((W/'flutter-cache/flutter.version.json').read_text())
    require(metadata['frameworkVersion'] == metadata['flutterVersion'] == '3.41.9', 'SDK version')
    create(W/'version', (metadata['frameworkVersion']+'\n').encode())
    create(W/'fixture/public-marker', b'public\n')
    create(W/'flutter-cache/lockfile', b'')
    plan = mount_plan()
    create(W/'mount-plan.json', json.dumps(plan, indent=2).encode())
    result = namespace_probe(plan, W/'fixture/public-marker', [F, J, A, Path('/readonly-fixture')])
    print(result.stdout, end='')
    print(result.stderr, end='', file=sys.stderr)
    require(result.returncode == 0, 'namespace probe exit='+str(result.returncode))
    return dict(state, probed=True, verified=0)

def l16_handoff():
    runs, states = sorted(W.glob('run-*')), sorted(W.glob('state-*.json'))
    nruns, nstates, count = L16_COUNTS
    require(len(runs) == nruns and [p.name for p in runs[-2:]] == [L16_GOOD, L16_FAIL], 'predecessor history')
    require(len(states) == nstates and states[-1].name == L16_STATE, 'predecessor state history')
    for name, pin in L16_PINS.items():
        require(checked(W/name).is_file(), 'missing predecessor receipt: '+name)
        require(digest(W/name) == pin, 'predecessor binding: '+name)
    require(all(checked(p/'exit').is_file() for p in runs), 'missing predecessor receipt')
    require([p.name for p in runs if (p/'exit').read_text() != '0'] == [L16_FAIL], 'ambiguous predecessor failure')
    require((W/L16_FAIL/'stderr').read_text() == L16_ERROR, 'unexpected predecessor failure')
    state = json.loads((W/L16_STATE).read_text())
    require(not state['queue'] and not state['probed'] and state['verified'] == len(state['files']) == len(state['copied']) == count, 'incomplete predecessor')
    expected = dict(stage='verify', pending=0, files=count, copied=count, verified=count, probed=False, ready=False)
    require(json.loads((W/L16_GOOD/'stdout').read_text()) == expected, 'incomplete predecessor receipt')
    source_check()
    receipt = json.loads((W/'source-receipt.json').read_text())
    require(receipt['sourceCommit'] == COMMIT and receipt['manifestSha256'] == PIN, 'source binding')
    metadata = W/'flutter-cache/flutter.version.json'
    records = [record for (_, dest), record in zip(state['files'], state['copied']) if dest == str(metadata)]
    require(len(records) == 1 and digest(metadata) == records[0]['sha256'], 'version cache binding')
    version = json.loads(metadata.read_text())
    require(version['frameworkVersion'] == version['flutterVersion'] == '3.41.9', 'SDK version')
    for name, body in [('version', b'3.41.9\n'), ('fixture/public-marker', b'public\n'), ('flutter-cache/lockfile', b'')]:
        path = checked(W/name)
        require(path.is_file() and path.stat().st_nlink == 1 and path.read_bytes() == body, 'derived input changed: '+name)
    binding = dict(grant='L16', predecessor=L16_FAIL, lastSuccessfulRun=L16_GOOD, state=L16_STATE,
                   stateSha256=L16_PINS[L16_STATE], cacheFiles=count, sourceCommit=COMMIT,
                   sourceManifestSha256=PIN, predecessorPins=dict(L16_PINS), helperSha256=digest(Path(__file__)))
    return state, binding

def open_l16():
    require(not checked(L16_DIR).exists(), 'L16 already attempted')
    state, binding = l16_handoff()
    L16_DIR.mkdir(mode=0o700)
    create(L16_DIR/'admission.json', json.dumps(binding, sort_keys=True).encode())
    return state

def write_run(run, action, stdout, stderr, exitcode):
    for name, text in [('stdout', stdout), ('stderr', stderr), ('exit', str(exitcode)), ('binding', action+' '+digest(Path(__file__))+'\n')]:
        create(run/name, text.encode())

def l16_main(action):
    run, stdout, stderr, exitcode = None, io.StringIO(), io.StringIO(), 0
    def expired(*_):
        raise TimeoutError('L16 deadline exceeded; STOP, no retry')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(25)
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), checked(W/'preparation.lock').open('r') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if action == 'mount-l16':
                state = open_l16()
                progress, previous = [], None
            else:
                state, binding = l16_handoff()
                require(checked(L16_DIR/'admission.json').is_file(), 'L16 not admitted')
                require(json.loads((L16_DIR/'admission.json').read_text()) == binding, 'L16 admission binding')
                runs = sorted(L16_DIR.glob('run-*'))
                require(bool(runs) and all(checked(p/'exit').is_file() and (p/'exit').read_text() == '0' for p in runs), 'L16 failed/incomplete run; STOP')
                progress = sorted(L16_DIR.glob('progress-*.json'))
                require(bool(progress), 'L16 probe missing')
                previous, verified = None, 0
                for index, path in enumerate(progress):
                    require(path.name == 'progress-%05d.json' % index, 'L16 progress gap')
                    proof = json.loads(checked(path).read_text())
                    require(proof['previous'] == previous and proof['admission'] == digest(L16_DIR/'admission.json') and proof['plan'] == digest(L16_DIR/'mount-plan.json'), 'L16 proof binding')
                    require(proof['probed'] and (proof['verified'] == 0 if index == 0 else verified < proof['verified'] <= verified+64), 'L16 verification gap')
                    previous, verified = digest(path), proof['verified']
                require(verified < len(state['files']), 'L16 already verified')
                state.update(probed=True, verified=verified)
            run = L16_DIR/('run-'+str(time.time_ns()))
            run.mkdir()
            if action == 'mount-l16':
                plan = mount_plan(view=L16_DIR/'sdk-view')
                create(L16_DIR/'mount-plan.json', json.dumps(plan, indent=2).encode())
                result = namespace_probe(plan, W/'fixture/public-marker', [F, F/'bin', F/'packages', F/'.git', J, A, Path('/readonly-fixture')], [F/'bin/cache', F/'packages/flutter_tools/gradle'])
                print(result.stdout, end='')
                print(result.stderr, end='', file=sys.stderr)
                require(result.returncode == 0, 'L16 namespace exit='+str(result.returncode))
                state.update(probed=True, verified=0)
            else:
                state = stage('verify', state)
            source_check()
            proof = dict(previous=previous, admission=digest(L16_DIR/'admission.json'), plan=digest(L16_DIR/'mount-plan.json'), probed=True, verified=state['verified'], ready=state['verified'] == len(state['files']))
            create(L16_DIR/('progress-%05d.json' % len(progress)), json.dumps(proof, sort_keys=True).encode())
            print(json.dumps(dict(stage=action, files=len(state['files']), **proof)))
    except Exception as error:
        exitcode = 1
        stderr.write(type(error).__name__+': '+str(error)+'\n')
    finally:
        signal.alarm(0)
    if run is not None:
        write_run(run, action, stdout.getvalue(), stderr.getvalue(), exitcode)
    print(stdout.getvalue(), end='')
    print(stderr.getvalue(), end='', file=sys.stderr)
    return exitcode

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['roots', 'index', 'copy', 'verify', 'probe', 'mount-l16', 'verify-l16'])
    action = parser.parse_args().action
    if action in ('mount-l16', 'verify-l16'):
        sys.exit(l16_main(action))
    checked(W).mkdir(mode=0o700, parents=True, exist_ok=True)
    run = W/('run-'+str(time.time_ns()))
    run.mkdir()
    stdout, stderr, exitcode = io.StringIO(), io.StringIO(), 0
    def expired(*_):
        raise TimeoutError('stage deadline exceeded; STOP, no automatic retry')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(25)
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), checked(W/'preparation.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            require(all(checked(p).read_text() == '0' for p in W.glob('run-*/exit')), 'previous stage failed; STOP')
            source_check()
            snapshots = sorted(W.glob('state-*.json'))
            state = json.loads(checked(snapshots[-1]).read_text()) if snapshots else {}
            state = stage(action, state)
            source_check()
            create(W/('state-%05d.json' % len(snapshots)), json.dumps(state).encode())
            print(json.dumps(dict(stage=action, pending=len(state['queue']), files=len(state['files']), copied=len(state['copied']), verified=state['verified'], probed=state['probed'], ready=state['probed'] and state['verified'] == len(state['files']))))
    except Exception as error:
        exitcode = 1
        stderr.write(type(error).__name__+': '+str(error)+'\n')
    finally:
        signal.alarm(0)
    write_run(run, action, stdout.getvalue(), stderr.getvalue(), exitcode)
    print(stdout.getvalue(), end='')
    print(stderr.getvalue(), end='', file=sys.stderr)
    sys.exit(exitcode)
