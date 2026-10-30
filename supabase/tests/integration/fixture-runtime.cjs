const path = require("node:path");
const os = require("node:os");

function resolveFixtureRuntime({ platform = process.platform, env = process.env, tmpdir = os.tmpdir() } = {}) {
  if (platform === "linux") {
    if (!env.D1_TOOL_ROOT || !path.posix.isAbsolute(env.D1_TOOL_ROOT)) {
      throw new Error("Linux fixtures require an absolute D1_TOOL_ROOT.");
    }
    return {
      launcher: path.posix.join(env.D1_TOOL_ROOT, "run-isolated.cjs"),
      temp: env.TMPDIR || tmpdir,
      env: {},
      // The Linux launcher fixes PGHOST/PGDATABASE and rejects CLI overrides.
      connectionArgs: [],
    };
  }
  const root = env.D1_TOOL_ROOT ||
    "C:\\Users\\Danilo\\.config\\opencode\\integrations\\vaca-d1-toolchain";
  return {
    launcher: path.win32.join(root, "run-isolated.cjs"),
    temp: "C:\\Users\\Danilo\\AppData\\Local\\Temp\\opencode",
    env: Object.fromEntries(["SystemRoot", "WINDIR", "COMSPEC"].map((k) => [k, env[k]])),
    connectionArgs: ["-h", "127.0.0.1", "-d", "postgres"],
  };
}

module.exports = { resolveFixtureRuntime };
