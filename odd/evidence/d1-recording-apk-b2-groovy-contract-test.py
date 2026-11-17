"""S2/S14: exact scoped policy insertion; byte contract, not Gradle execution."""
import hashlib
import sys
from pathlib import Path
paths = [Path(argument) for argument in sys.argv[1:]]
assert len(paths) == 2, 'expected OLD_POLICY CURRENT_POLICY'
before = [path.read_bytes() for path in paths]
old, current = before
assert hashlib.sha256(old).hexdigest() == '0722098f8f3c8232e597805a918f92ec65b43f7f167e4d44d5e553bfe2b601b4'
branch = b"""(identity == flutterRoot && task.project.path == ':' && task.name in [
                'compileKotlin', 'compileJava', 'pluginDescriptors', 'processResources',
                'classes', 'jar', 'checkKotlinGradlePluginConfigurationErrors'])"""
assert old.count(branch) == 1, 'exact Flutter build/root-project conjunction required'
assert b'compileGroovy' not in old, 'unexpected prior admission'
replacement = branch.replace(b"'compileJava',", b"'compileJava', 'compileGroovy',")
assert current == old.replace(branch, replacement), 'only the scoped insertion may change'
assert current.count(b'compileGroovy') == 1, 'no other branch may gain admission'
assert [path.read_bytes() for path in paths] == before, 'policy inputs changed'
print('B2_SCOPED_COMPILE_GROOVY_BYTE_CONTRACT_PASS')
