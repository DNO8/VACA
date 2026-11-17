# D1 runtime package: local proof, not deployment

The selected public runtime payload is prepared and independently inspected. No runtime was deployed, no SQL was replayed, and automation remains unactivated. Hosted dependency-lock enforcement and callable file-backed transport remain open delivery gates.

## Selected artifact

| Binding | Observed value |
| --- | --- |
| Production source | `2f0cf0978c5399c41c17ee748e75a04438932765` |
| Public fixture candidate | `c361b0f026e7e1d29e13d7af1314ad6843a7f6d2` |
| Payload | 92 files; 962,993 UTF-8 JSON bytes |
| Payload SHA-256 | `8a79b03d2b636f424ff87ae29d70e6f342e2595b064b59c8baf6df403e0a22dd` |
| Entry | `supabase/functions/d1-custody/deployment-index.ts` |
| Explicit import map | `supabase/deno.json` |
| JWT verification | `true` |

The five project-scoped arguments are `name`, `entrypoint_path`, `import_map_path`, `verify_jwt`, and `files`. No `project_id` argument is supplied. All 90 custody TypeScript files and the original config/lock are included byte-for-byte; tests, documentation, private configuration and Git metadata are excluded. Inclusion of experimental modules does not select or execute their entrypoints.

Local evidence directory: `.tooling/d1-backend/tmp/runtime-package-4bgpswp1/` (not committed or uploaded). It contains `payload.json`, `manifest.json`, `before.json`, `invocation.json`, `graph.stdout`, `graph.stderr`, `result.json`, `dependency-validation.json`, the decoded `package/`, and retained `independent-probe.py`.

## Observed checks

- Parent job6: exit 0, approximately one second. Every selected file matched the original source commit, approved fixture commit and current public source. HEAD, index, status and three modified tracked-file hashes were preserved at that checkpoint.
- Installed Deno 2.6.8 inspected the package using `info --json --no-remote --deny-import --frozen`, explicit config/lock and a `bwrap --unshare-net` namespace. The entrypoint was not executed. No historical runtime suite was rerun.
- Structural graph validation: exit 0; 94 modules consisting of 90 local modules, two Node builtins and two npm roots; 411 code edges and 47 type edges. All local modules are shipped. All 73 resolved npm package identities exist in the supplied lock with integrity fields. No graph errors or recorded dynamic edges were found.
- Independent verifier `mwk37qvp-d-35ub`: required preparer succeeded only on the approved public two-commit fixture, 100 files / 1,043,268 bytes. Four independent probe groups passed, including decoding, candidate/source-manifest byte binding, configuration/cutoff preservation, root reachability and artifact preservation. S1/S2/S4/S5 met for packaging; S9 met for preservation only; S3/S6/S7/S8 belong to other units.
- Independent history: initial four groups passed; adding a reachability assertion exposed verifier-only `FileExistsError` on a repeated decoded-directory creation (exit 1). The verifier corrected it to `mkdir(exist_ok=True)` and the final four groups passed (exit 0). The failure is retained, not a product defect or a new cutoff failure.
- Parent retained the exact returned snapshot-specific probe outside ordinary test discovery. The parent did not replay that independent probe or rerun Deno after verification; its own graph-validation command had already passed.

This is data-artifact construction with unchanged application source, so meaningful verification is byte preservation and independent decoding, not a fabricated RED/GREEN behavior change.

## Limits and next delivery gates

`graph.stderr` is nonempty: it contains a registry `Download` diagnostic. Network namespace isolation prevents external connectivity; it does not establish absence of attempted resolution. npm CommonJS/optional-native runtime branches and computed loading are not exhaustively proven by this graph.

The [official MCP implementation at revision 9092ab9](https://github.com/supabase/mcp/blob/9092ab9055509fcdfbedcb75edf02d9412feed37/packages/mcp-server-supabase/src/platform/api-platform.ts) uploads supplied strings and forwards deployment metadata. It does not itself resolve dependencies or enforce the lock. The hosted revision and server treatment of full config, lock format 5 and frozen enforcement remain unverified. Explicit nested `import_map_path` avoids the client's existing-function fallback and root-filename heuristic; it does not establish those server guarantees.

The [published server-side function-size limit](https://supabase.com/docs/guides/functions/limits) is 5 MB after bundling, not a proven JSON ingress limit. The 962,993-byte source request is not the size of a resolved dependency bundle.

Next: expose the already-authorized supported file-backed transport and establish hosted dependency reproducibility before runtime delivery/readback. Keep the HTTP window open until explicit release. SQL047a/048–053/055–058 are already delivered and must not be replayed; 054 remains excluded. No secrets, enrollment, scheduler, APK, funds or native review authority changed.

Tracking: [recording readiness](../tasks/d1-recording-readiness.md), T3b. Existing [cutoff verification](d1-automatic-confirmation-cutoff-independent.md) remains separately complete.
