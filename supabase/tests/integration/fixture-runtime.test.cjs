const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveFixtureRuntime } = require("./fixture-runtime.cjs");

const ambient = {
  HOME: "/unrelated-home", PATH: "/unrelated-bin", PGHOST: "remote.invalid",
  PGDATABASE: "live", PGPASSWORD: "synthetic-only", PGSERVICE: "ambient",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-only", DENO_DIR: "/ambient-cache",
  SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", COMSPEC: "cmd.exe",
};

test("Windows retains its default root, temp, connection arguments and isolated environment", () => {
  assert.deepEqual(resolveFixtureRuntime({ platform: "win32", env: ambient }), {
    launcher: "C:\\Users\\Danilo\\.config\\opencode\\integrations\\vaca-d1-toolchain\\run-isolated.cjs",
    temp: "C:\\Users\\Danilo\\AppData\\Local\\Temp\\opencode",
    env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", COMSPEC: "cmd.exe" },
    connectionArgs: ["-h", "127.0.0.1", "-d", "postgres"],
  });
});

test("Windows keeps the explicit tool-root override without inheriting credentials", () => {
  const runtime = resolveFixtureRuntime({ platform: "win32", env: { ...ambient, D1_TOOL_ROOT: "D:\\tools" } });
  assert.equal(runtime.launcher, "D:\\tools\\run-isolated.cjs");
  assert.deepEqual(Object.keys(runtime.env), ["SystemRoot", "WINDIR", "COMSPEC"]);
});

test("Linux uses an explicit absolute root and TMPDIR without forwarding ambient state", () => {
  assert.deepEqual(resolveFixtureRuntime({ platform: "linux", env: { ...ambient, D1_TOOL_ROOT: "/isolated/tools", TMPDIR: "/external/temp" } }), {
    launcher: "/isolated/tools/run-isolated.cjs", temp: "/external/temp", env: {}, connectionArgs: [],
  });
});

test("Linux falls back to the supplied os.tmpdir result", () => {
  const runtime = resolveFixtureRuntime({ platform: "linux", env: { D1_TOOL_ROOT: "/tools" }, tmpdir: "/system/temp" });
  assert.equal(runtime.temp, "/system/temp");
});

for (const root of [undefined, "", "relative/tools", "C:\\tools"]) {
  test(`Linux rejects a missing or nonabsolute root: ${JSON.stringify(root)}`, () => {
    const env = { ...ambient, D1_TOOL_ROOT: root };
    const before = JSON.stringify(env);
    assert.throws(() => resolveFixtureRuntime({ platform: "linux", env }), {
      name: "Error", message: "Linux fixtures require an absolute D1_TOOL_ROOT.",
    });
    assert.equal(JSON.stringify(env), before);
  });
}
