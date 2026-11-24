const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

test("Deno config tasks do not grant environment access directly", () => {
  const { tasks } = JSON.parse(readFileSync(join(__dirname, "..", "deno.json"), "utf8"));
  const envGrant = /(?:^|[\s"'`;&|()])(?:--allow-(?:env|all)|-[a-z]*A[a-z]*)(?=$|[=\s"'`;&|()])/;
  const grantingTasks = Object.entries(tasks)
    .filter(([, task]) => envGrant.test(typeof task === "string" ? task : task.command))
    .map(([name]) => name);
  assert.deepEqual(grantingTasks, [], "Environment access belongs in the isolated runner only");
});
