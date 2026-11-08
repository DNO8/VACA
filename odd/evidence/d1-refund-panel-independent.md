# Standalone refund panel: one independent source/static review
Task mw7vwct4-13-kjds, gentle-ai-verify, direct grant allow_refund_panel_and_one_static_review (memory610, featureS2/L1), consumed by this ONE completed launch in /home/danilo/projects/vaca-d1-t5b-proof. No review rerun or extension authorized. Source candidate c013d17c0c1bb01153db4e45c625565a8ec92ea5 vs ca20ed6256ddbc11786eecffd3df0733a7aa661f; passive HEAD940057b5fec869ad48e5f3bcf776f714b6a3e7e2. Functional tests remain explicitly deferred.

## Reviewer report (verbatim)
## Verdict: no concrete candidate-caused blocker found in static scope

Reviewed only source candidate `c013d17c0c1bb01153db4e45c625565a8ec92ea5` against `ca20ed6256ddbc11786eecffd3df0733a7aa661f`, with current documentation and required existing dependencies. The candidate is **382 additions across four paths**.

### Spec verdicts

- **S1 — Met within documentation/static scope.** `odd/tasks/d1-refund-panel.md:6` and Log L1 explicitly distinguish the peer’s completed map/enqueued proposal from an active writer. Neither simultaneous coding nor transferred financial ownership is claimed.

- **S2 — Met within panel source/static scope.** The panel requires the existing immutable `RefundScope`; it introduces no identity generation, backend/core/D3/provider changes or current-screen mounting. Requests occur only through explicit gestures and the existing consumer (`vaca_app/lib/features/refund/presentation/refund_panel.dart:9–14,34–69,130–145`). There is no eager request, polling, automatic reconcile or retry. The exact candidate diff changes only the panel, its written cases, guide and feature document.

- **S3 — Met within panel source/static scope.**
  - Action visibility and dispatch guards use **filtered consumer `safeActions`**, not raw DTO actions (`refund_panel.dart:34–37,92,135–144`).
  - Refund requires explicit confirmation, followed by the existing `requestRefund(scope)` path (`:42–69`). That unchanged consumer performs fresh status, durable reservation and one-use dispatch; a recorded attempt instead takes status-only recovery (`data/refund_client.dart:41–53`).
  - Errors retain an unknown hold and fixed public text, without exposing private exception details (`refund_panel.dart:71–80,93,110–112`). The consumer removes financial actions on error and suppresses refund after a recorded first post.
  - Original gross/deadline and nullable accounting are displayed without arithmetic or deadline-based release (`:114–129`). Whole-donation settlement remains dependent on the existing validated domain state; its parser requires known totals, zero remainder and claimed-plus-refunded equal to gross.
  - Scope changes increment a generation and clear prior presentation facts (`:24–31`). Both confirmations and responses check that generation (`:62,70,76,82`), covering A→B→A rather than identity equality alone. Commands capture the original scope before awaiting; already-dispatched operations are neither canceled nor replanned.

- **S4 — Met for evidence labeling/static delivery.** All four widget case definitions remain **UNEXECUTED**. Their source contains observable action-list, storage and UI assertions for cold/error hold; cancellation/confirmation and recorded-first-post suppression; gross10/remaining9/null accounting and explicit reconciliation; and stale-response/stale-confirmation A→B→A behavior (`vaca_app/test/refund_panel_test.dart:54–194`). These are assertions written in source, **not observed passing effects**.

App integration, functional execution, backend handoff/C3 and financial acceptance are **out of scope**, not silently passed or missing panel implementation.

### Evidence integrity

Current HEAD observed: `940057b5fec869ad48e5f3bcf776f714b6a3e7e2`.

Both current files match the passive capture’s hashes and the independently hashed candidate `git show` bytes:

| File | SHA-256 |
|---|---|
| `vaca_app/lib/features/refund/presentation/refund_panel.dart` | `b244fd60e6d71b76eae719b1c2f04ccda12590865c494357046aabbcb0d8a726` |
| `vaca_app/test/refund_panel_test.dart` | `b8d0d095077ac73531d3c492845ac3f917001d42bbf84505a513d6684426a554` |

Direct current-versus-candidate `cmp` returned **0 for both files**. Candidate→HEAD contains only two passive evidence captures and the feature’s added Log L6; no panel/test/guide drift. Pre- and post-review `git status --short` were both empty.

### Assessment and limitations

The captures honestly preserve formatter exit 0 and targeted-analyzer exit 0 with **33 INFO notices**, not “clean analysis.” I did not rerun either.

The assessment capture records **one unassessable native ASSESS**, candidate null/outcome unknown, caused by the then-untracked passive JSON despite `committedOnly`. Packaging evidence distinguishes the successful source commit from the subsequent failed clean-worktree assertion. No retry, native approval, `reviewDue` or continuation is inferred.

**Blockers:** none identified in this bounded static review.  
**Advisory:** the captured style notices remain; they are not runtime evidence or a financial-safety finding.

### Commands actually run

Using the full SHAs above as `BASE` and `CANDIDATE` for brevity:

- `git status --short` — before and after
- `git rev-parse HEAD`
- `git diff --stat BASE CANDIDATE`
- `git diff BASE CANDIDATE --`
- `git diff --stat CANDIDATE HEAD`
- `git diff --name-status CANDIDATE HEAD`
- `sha256sum` on the two new Dart files
- `git show CANDIDATE:<path> | sha256sum` for each
- `cmp <path> <(git show CANDIDATE:<path>)` for each, with printed exit codes

Other inspection used read-only file reads, including the whole feature and normative context.

**No writes, scratch copies, delegation, source execution, tests, analyzer/compiler/formatter execution, app/browser execution, network operations or native lifecycle invocation occurred. No RED/GREEN, rendered-UI, runtime, operational, financial or native acceptance is claimed.**

## Parent spot-check (observed after report, exit0)
Repeated the reported sha256sum command on both source files, then independently compared current bytes to capture hashes and source-candidate git-show bytes: 2/2 match. Compared all637 original tracked path modes/types/blobIDs from f30257826528e316476f4484a1bbdce58d26f8cd to currentHEAD: unchanged637/637. Pre-close worktree clean. No source/test execution or compiler/analyzer rerun. No source changes after reviewer verdict. Preserve the earlier packaging exit1 and native-unassessable result in the separate assessment capture; they are not approval.
