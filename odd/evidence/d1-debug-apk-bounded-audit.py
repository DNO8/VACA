#!/usr/bin/env python3
"""B4/S1-S2 read-only debug APK audit; never execute either build recipe.
Usage: python3 audit.py ROOT PAYLOADROOT
PAYLOADROOT contains snapshot.json: copied/external relative path lists and
files[path]={bytes,sha256,mtime_ns,mode}, made by the isolated preparation.
ROOT supplies read-only originals, including the uncopied old APK and Git HEAD.
No extraction, config reads, credentials, app/module execution or network.
"""
import ast
import hashlib
import json
import pathlib
import stat
import sys
import zipfile
import zlib

A = 'supabase/.temp/d1-configured-apk-20261112T043627Z'
BASE = 'supabase/.temp/d1-gradle-apk-after-cache/build_once.py'
APK = 'vaca_app/build/app/outputs/flutter-apk/app-dev-debug.apk'
REPORT = 'vaca_app/android/build/reports/problems/problems-report.html'
CAPS = '.tooling/gradle-home/gradle.properties'
NEW_SHA = '68fe86cea342356a2375f4db2c06a132173331b3f04f8ef339d0b47eeeead957'
OLD_SHA = '29798bbc7863eb29c43d065cef9bd1ece814aa60ec73287d557bbea3dee7ad8c'
REPORT_SHA = '15e7a8d0a982538437f0a696650a1cdfdc99eff8c29512f02b831379462c02fe'
BASE_SHA = 'a831dd59399113fa26b4e4b273d5901fa5b988e91fe0462b02aa8acb976e0e84'
DERIVED_SHA = '1f91ae4d51b48d5f25106c11cfb89a31bfe35c2379978452a1937c75fa559673'
CHUNK = 1024 * 1024
LIMIT = 2 * 1024**3

def require(ok, message):
    if not ok:
        raise AssertionError(message)

def fingerprint(p):
    s = p.lstat()
    require(stat.S_ISREG(s.st_mode), 'not regular: ' + str(p))
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(CHUNK), b''):
            h.update(b)
    require((lambda t: (t.st_dev, t.st_ino, t.st_size, t.st_mtime_ns, t.st_ctime_ns, t.st_mode))(p.lstat()) == (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode), 'changed while hashing: ' + str(p))
    return dict(bytes=s.st_size, sha256=h.hexdigest(),
                mtime_ns=s.st_mtime_ns, mode=stat.S_IMODE(s.st_mode))

def head(root):
    g = root / '.git'
    if g.is_file():
        text = g.read_text().strip()
        require(text.startswith('gitdir: '), 'invalid gitdir')
        g = (root / text[8:]).resolve()
    h = (g / 'HEAD').read_text().strip()
    if h.startswith('ref: '):
        ref = h[5:]
        p = g / ref
        if p.is_file():
            return p.read_text().strip()
        common = g
        if (g / 'commondir').is_file():
            common = (g / (g / 'commondir').read_text().strip()).resolve()
        p = common / ref
        if p.is_file():
            return p.read_text().strip()
        for line in (common / 'packed-refs').read_text().splitlines():
            if line.endswith(' ' + ref):
                return line.split()[0]
        raise AssertionError('unresolved HEAD')
    return h

def safe_relative(name):
    parts = name.rstrip('/').split('/')
    return (bool(name) and not name.startswith('/') and
            '\\' not in name and '\x00' not in name and
            all(p not in ('', '.', '..') and ':' not in p for p in parts))

def main():
    require(len(sys.argv) == 3, 'usage: audit.py ROOT PAYLOADROOT')
    root, payload = map(lambda p: pathlib.Path(p).resolve(), sys.argv[1:])
    m = json.loads((payload / 'snapshot.json').read_text())
    copied, external = m['copied'], m['external']
    require(len(set(copied + external)) == len(copied + external), 'manifest duplicate')
    require(all(safe_relative(p) for p in copied + external), 'unsafe manifest path')
    require(set(m['files']) == set(copied + external), 'incomplete manifest')
    def sources():
        return {p: fingerprint(root / p) for p in copied + external}
    def copies():
        return {p: fingerprint(payload / p) for p in copied}
    before = sources()
    require(before == m['files'], 'source differs from preparation')
    pb = copies()
    require(pb == {p: before[p] for p in copied}, 'payload differs from source')
    initial_head = head(root)
    print('PASS initial source/copy hashes and metadata; old backup streamed read-only', flush=True)
    try:
        def load(p):
            return json.loads((payload / A / p).read_text())
        pre, inv, res = map(load, ['preparation.json', 'invocation.json', 'result.json'])
        def identity(p, size, digest):
            require(before[p]['bytes'] == size and before[p]['sha256'] == digest,
                    'identity mismatch: ' + p)
        identity(APK, 191140891, NEW_SHA)
        identity(A + '/preserved/app-dev-debug.apk', 161968472, OLD_SHA)
        for p in [REPORT, A + '/preserved/problems-report.html']:
            identity(p, 147132, REPORT_SHA)
        require(before[BASE]['sha256'] == BASE_SHA, 'baseline recipe identity')
        require(before[A + '/build_once.py']['sha256'] == DERIVED_SHA, 'derived identity')
        base = (payload / BASE).read_text()
        derived = (payload / A / 'build_once.py').read_text()
        old = "'--dart-define=FLAVOR=dev', '--target-platform=android-arm64'"
        new = "'--dart-define=FLAVOR=dev', '--dart-define-from-file=' + str(root / '.tooling/d1-client-public-config.json'), '--target-platform=android-arm64'"
        oldmeta = "'backendConfiguration': 'Not supplied'"
        newmeta = "'backendConfiguration': 'Supplied by ignored local file path; no runtime/gateway proof'"
        require(base.count(old) == base.count(oldmeta) == 1, 'substitution uniqueness')
        require(derived == base.replace(old, new).replace(oldmeta, newmeta), 'exact two substitutions')
        ast.parse(base)
        ast.parse(derived)
        require(pre['historicalRunnerSha256'] == BASE_SHA and
                pre['derivedRunnerSha256'] == DERIVED_SHA, 'preparation recipe hashes')
        require(pre['deadlineSeconds'] == 1200 and pre['automaticRetries'] == 0 and
                pre['configContentsReadByPreparation'] is False and pre['buildLaunched'] is False,
                'preparation boundaries')
        expected_backups = [(APK, A + '/preserved/app-dev-debug.apk', 161968472, OLD_SHA),
                            (REPORT, A + '/preserved/problems-report.html', 147132, REPORT_SHA)]
        require(pre['preserved'] == [dict(path=p, backup=b, bytes=n, sha256=h)
                                   for p,b,n,h in expected_backups], 'backup receipt identities')
        require(all(res[k] == v for k,v in inv.items()), 'invocation/result common fields')
        require(inv['head'] == initial_head, 'receipt/current source HEAD')
        argv = inv['argv']
        # Derive the original root from the recorded executable, never execute it.
        suffix = '/.tooling/flutter/bin/cache/dart-sdk/bin/dart'
        require(argv[0].endswith(suffix), 'dart path')
        recorded_root = argv[0][:-len(suffix)]
        require(recorded_root.startswith('/'), 'absolute recorded root')
        require(argv == [recorded_root + suffix,
                recorded_root + '/.tooling/flutter/bin/cache/flutter_tools.snapshot',
                '--suppress-analytics', 'build', 'apk', '--debug', '--flavor', 'dev',
                '--no-pub', '--dart-define=FLAVOR=dev',
                '--dart-define-from-file=' + recorded_root + '/.tooling/d1-client-public-config.json',
                '--target-platform=android-arm64'], 'exact configured dev/debug arm64 argv')
        inputs = ['vaca_app/' + p for p in ['pubspec.yaml', 'pubspec.lock',
                  '.dart_tool/package_config.json', 'android/gradle.properties',
                  'android/gradle/wrapper/gradle-wrapper.properties']]
        expected = {p: before[p]['sha256'] for p in inputs}
        require(inv['inputHashesBefore'] == res['inputHashesAfter'] == expected, 'five live input hashes')
        require(inv['localGradleLimitsSha256'] == before[CAPS]['sha256'], 'caps hash receipt')
        limits = dict(line.split('=', 1) for line in (payload / CAPS).read_text().splitlines()
                      if line and not line.startswith('#'))
        require(limits == {'org.gradle.jvmargs': '-Xmx1024m -XX:MaxMetaspaceSize=384m -XX:ReservedCodeCacheSize=128m',
                          'org.gradle.workers.max': '1', 'org.gradle.parallel': 'false',
                          'org.gradle.daemon': 'false', 'kotlin.compiler.execution.strategy': 'in-process'}, 'caps values')
        require(inv['timeoutSeconds'] == 1200 and 0 <= res['seconds'] < 1200 and
                res['exit'] == res['childExit'] == 0 and not res.get('timeout', False) and
                res['retryAnnouncementObserved'] is False, 'zero exit/deadline/no retry')
        require(inv['retryPolicy'] == 'Stop process group at Flutter retry announcement; no relaunch' and
                inv['deadlineBasis'] == 'wall clock, checked during waits and after exit', 'deadline/retry policy')
        require(inv['testsExecuted'] == inv['deviceActions'] == 0 and
                inv['independentToolchainIntegrity'] == 'Prior missing proof retained' and
                inv['backendConfiguration'] == 'Supplied by ignored local file path; no runtime/gateway proof' and
                res['dependencyAndProjectInputsUnchanged'] is True and
                res['localGradleLimitsUnchanged'] is True, 'scope/unchanged receipts')
        require(res['artifacts'] == [dict(path=APK, bytes=191140891, sha256=NEW_SHA)], 'artifact receipt')
        print('PASS recipe AST/exact two substitutions; receipts, five live hashes, caps, backup/report identity', flush=True)
        with zipfile.ZipFile(payload / APK) as z:
            entries = z.infolist()
            names = [e.filename for e in entries]
            require(len(names) == len(set(names)), 'duplicate ZIP entry')
            total = 0
            for e in entries:
                require(safe_relative(e.filename) and e.orig_filename == e.filename, 'unsafe ZIP path')
                require(not e.flag_bits & (1 | 64), 'encrypted ZIP entry')
                require(e.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'unsupported compression')
                mode = e.external_attr >> 16
                require(stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR), 'special ZIP entry')
                require(0 <= e.file_size <= 512 * 1024**2 and
                        0 <= e.compress_size <= before[APK]['bytes'], 'unsafe ZIP entry size')
                total += e.file_size
                require(total <= LIMIT, 'ZIP total exceeds 2GiB')
            native = {n for n in names if n.startswith('lib/') and n.endswith('.so')}
            abis = {n.split('/')[1] for n in native}
            # The hash-pinned historical APK is the native-packaging baseline,
            # not an assertion of compatibility on every vendor-library ABI.
            with zipfile.ZipFile(root / A / 'preserved/app-dev-debug.apk') as historical:
                baseline_native = {n for n in historical.namelist()
                                   if n.startswith('lib/') and n.endswith('.so')}
            engines = {n for n in native if n.endswith('/libflutter.so')}
            require(native == baseline_native, 'native library inventory differs from pinned baseline')
            require(engines == {'lib/arm64-v8a/libflutter.so'}, 'Flutter engine is not exclusively arm64')
            counts = {abi: sum(n.startswith('lib/' + abi + '/') for n in native)
                      for abi in sorted(abis)}
            print('PASS ABI inventory matches pinned historical APK; Flutter engine arm64-only; '
                  'vendor ABI compatibility NOT established: ' +
                  json.dumps(dict(abis=sorted(abis), counts=counts,
                                  engines=sorted(engines), native_paths=sorted(native)),
                             sort_keys=True), flush=True)
            required = ['AndroidManifest.xml', 'lib/arm64-v8a/libflutter.so',
                        'assets/flutter_assets/kernel_blob.bin']
            require(all(n in names and z.getinfo(n).file_size > 0 for n in required),
                    'missing debug manifest/engine/kernel payload')
            actual_total = 0
            for e in entries:
                count = crc = 0
                with z.open(e) as f:
                    for b in iter(lambda: f.read(CHUNK), b''):
                        count += len(b)
                        actual_total += len(b)
                        require(count <= e.file_size and actual_total <= LIMIT, 'stream size overrun')
                        crc = zlib.crc32(b, crc)
                require(count == e.file_size and crc & 0xffffffff == e.CRC, 'ZIP size/CRC mismatch')
            require(actual_total == total, 'ZIP total mismatch')
            print('PASS debug manifest/arm64-engine/kernel payload, ZIP safety/full streamed CRC: entries=%d inflated_bytes=%d' %
                  (len(entries), actual_total), flush=True)
    finally:
        require(sources() == before, 'FINAL SOURCE MUTATION')
        require(copies() == pb, 'FINAL PAYLOAD MUTATION')
        require(head(root) == initial_head, 'FINAL HEAD MUTATION')
        print('PASS final source/payload bytes, SHA256, mtime, mode and HEAD unchanged; old backup rehashed', flush=True)
    print('PASS B4 independent artifact audit only; parent exact-body spot-check still required', flush=True)

if __name__ == '__main__':
    main()
