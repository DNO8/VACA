# D1 refund-account recovery: independent boundary evidence

## Outcome

Scoped PASS for inert T2g candidate `4bfab0233a9ed83e189d56ad8b412b764e9f4450`, against baseline `7810f91d8abfe55a58d570e2086237d57dc19b97`. Independent verifier continuation `mwie9w4i-8-a078` reproduced no blocker. This is not complete automatic-refund, financial, deployment, or native-review approval.

## Observed checks

- Same verifier resumed after explicit human authorization of `/var/tmp/vaca-d1-verify`. One successful preparation, zero corrections, one independent probe execution.
- Deno 2.6.8: exit 0, **3 passed / 0 failed**, reported total 84ms. Stderr contains the ANSI-formatted typecheck notification; it is not empty.
- Fourteen allowed reads, seven mutation/unknown-name rejections before callback, captured receiver/method and pending-call argument isolation, hostile inputs without getter hooks, and thrown forged403 sanitized to exact503.
- Synthetic normalized binding success, 17 rejected binding variants with byte-preserved JSON inputs, captured observer scope across await, lookup-scope mismatch, and null-candidate stop without account-provider invocation or retry. Total 36 expected rejection calls.
- S5/S6 met within this additive isolated unit; S7 met within inert capability scope; S11 met within normalized evidence scope. Other feature requirements remain outside this unit.
- 45 public files matched committed candidate inputs; 2,184 dependency regular files contained no links/special files. All 2,229 original input hashes and initial/final Git status were unchanged.
- Required allocation-rounded regular-file payload: 176,263,168 bytes. Available: 987,995,787,264 bytes and 66,556,584 free inodes.
- Parent adopted the exact [executed probe](../../supabase/tests/unit/refund-account-independent-probe.test.ts), verified its hash and all three candidate source files against the commit, then ran the adopted probe once: exit 0, **3 passed / 0 failed**, 90ms; typechecking succeeded. No writer or historical suite replay.

## Reproduction and identity

From `supabase`, use the configured isolated Deno 2.6.8 binary with a clean environment, local HOME/TMPDIR/DENO_DIR/NODE_COMPILE_CACHE and updates disabled:

```sh
deno test --cached-only --frozen --allow-env --deny-net tests/unit/refund-account-independent-probe.test.ts
```

| Input | SHA-256 |
| --- | --- |
| Recovery module | `97ad499b4f13f4d56071e455907aa0a5f74fa53fe94845d29573d12c71e02986` |
| Deno binary | `8b254e08be2565f608a06bfde3f62f3aabbf8994712f0078c7a7f24bc8c46676` |
| Exact independent probe | `7538c9ce1d89735dbd3cdce8964a71968877285059c4e7879728e12eae121fa5` |

Scratch retained at `/var/tmp/vaca-d1-verify/v-6qi6pi6t`, including copied inputs/cache, `pins.json`, `status.txt`, `stdout.txt`, `stderr.txt` and probe source. No cleanup performed. Raw scratch artifacts are not committed or guaranteed portable; the exact executed probe is retained in the repository.

## Failures and limits retained

The earlier independent `/tmp` preflight had 175,321,088 available bytes versus 176,263,168 required: **zero scratch/setup/probes/tests**, not a candidate defect or a pass. Initial writer TS2322 fixture error, TS2307-only RED with zero executed assertions, and inaccurate 232-versus-231-line copy preflight remain recorded in the [feature log](../tasks/d1-automatic-refunds.md). Writer/parent eight focused passes are separate evidence.

The synthetic `manageData` XDR control deliberately demonstrates that binding is **not financial authority**. No full successful asynchronous observer, real authentication, ledger provenance, financial eligibility, persistent-store behavior, executor or activation is proved. Rejection preservation checks concern in-memory JSON bytes and callback counters. No existing production implementation changed, SQL executed, network used, installation performed, signing authority configured, deployment made or funds moved. Baseline lacks this module; no copied-source defect is automatically classified as pre-existing.
