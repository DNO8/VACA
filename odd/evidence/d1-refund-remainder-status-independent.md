# D1 remainder status: independent static report

Reviewer: `gentle-ai-verify`, task `mw9iaema-1c-kism`. One fresh human-authorized read-only review in the owned clone. The full returned report follows; no functional or native approval is inferred.

## Combined final static verdict

**No concrete candidate-caused blockers found in T1–T3. S1–S6 are met within the explicitly authorized static-review scope. Runtime behavior remains unverified and functional cases remain UNEXECUTED.**

This was one combined, read-only review of the two dependent source units in the exact authorized clone. I read the whole feature document, including L1–L8, the four new files, the authorized shared helpers/context, documentation and captured evidence. I did not use historical review results as candidate verification.

### Verdict per specification item

| Item | Verdict | Candidate evidence |
|---|---|---|
| **S1** | **Met — static scope** | Additive owned-client implementation, using existing scope/storage capabilities. The source-unit change inventory contains only the four new Dart files, feature guide and task tracking. No backend source import or backend SOW comparison was performed. |
| **S2** | **Met — static consistency** | `vaca_app/lib/features/refund/domain/refund_remainder_status.dart:39–56` requires exactly 13 root keys, integer version 2 and original TESTNET scope. Donation gross is validated directly, not reduced or converted through v1 (`:87–109`). Payment-lane `claimableBalanceId` must be null (`:117–124`). Nullable settlement entries remain null; no missing fact becomes zero (`:126–135`). |
| **S3** | **Met — static consistency** | Positive uint64 operation ID, hash, public donor key, asset and positive gross validation appear at `refund_remainder_status.dart:87–109`; exact refund shape/positive bounded amount at `:117–124`; nonnegative bounded settlement and complete settled accounting at `:126–147`. Exact state/verification/reason/ordered-action tuples are enforced at `:57–70` and defined at `:195–209`. Pending/observed/failed require a refund object (`:110–116`). Original deadline text and donation facts are frozen and compared, not renewed (`:71–86`, `:149–161`, `:177–185`). |
| **S4** | **Met — static consistency** | `vaca_app/lib/features/refund/data/refund_remainder_status_client.dart:135–172` constructs a fresh status-only v2 proof with the exact ten envelope keys after signature insertion. It reads the existing personal-wallet storage capability only during explicit invocation. Sorted compact top-level JSON excludes signature; SHA256 covers the exact `Stellar Signed Message:\n` UTF8 prefix plus JSON; the digest is signed and a verified 64-byte signature is canonical-base64 encoded. The sole POST route is at `:80–84`. No v1 signer relabeling is used. |
| **S5** | **Met — static consistency** | `refund_remainder_status_client.dart:61–69,118–119` rejects foreign previous scope before wallet/transport effects and requires unchanged donation/deadline afterward. Redirects are disabled (`:38–42`); network cancellation, stream timeout and 16KiB response limit are present (`:79–105`). JSON media type and no-store are required (`:85–99`). Exact one-key errors must match HTTP status; all valid DTO states require HTTP 200 (`:107–117`, `:177–185`). Failures return sanitized local unknown with no DTO or financial actions (`:15–24`, `:121–130`). There is no financial/reconcile dispatch API, retry, polling, journal write, new UUID, amount/destination input or route activation. |
| **S6** | **Met — review/deferral policy** | New tests explicitly identify themselves as unexecuted source scenarios. Captured analysis reports **0 errors, 0 warnings, 47 INFO**, not clean analysis. I ran no tests, SDK, analyzer, formatter, signing, application, network or SQL operations. Authorized pre/post git status output was identical. Shared existing helpers and contextual v1 files show no diff from baseline. |

### Tests: assertion review, not execution

- `vaca_app/test/refund_remainder_status_test.dart:19–150` asserts the eight state tuples; original gross10; nullable facts; claim1/refund9 settlement; beneficiary-only settlement with null refund; included failure preserving9; v1 rejection; Payment CB-null; incomplete/contradictory terminal accounting rejection; missing pending refund; ordered actions; scope/deadline; exact monetary bounds; and immutable/detached facts.
- `vaca_app/test/refund_remainder_client_test.dart:34–188` asserts cold construction, exact route/envelope/proof verification, one request, no storage writes, sanitized unknown failures, duplicate JSON rejection, no-store/status rejection, exact error mappings including **503 `remainder_unavailable`**, and previous deadline/scope protection.
- These assertions are consistent with the reviewed rules. They **do not establish runtime success**, exhaustive boundary coverage, RED/GREEN, financial safety or backend acceptance.

### Candidate identity and capture consistency

Observed **current bytes = captured hashes = committed bytes**, all four:

| File under `vaca_app/` | SHA256 |
|---|---|
| `lib/features/refund/domain/refund_remainder_status.dart` | `26aa5c86e872531130b624014a40df15a75d7dd8b7ffd91cfada4de58e430f81` |
| `test/refund_remainder_status_test.dart` | `4017aecd5e31d36ae9c44b639a204f499e527f2375c7b877d1679ffe43c50d87` |
| `lib/features/refund/data/refund_remainder_status_client.dart` | `04beaeebcf046ef417092c2beda1a6d652398a975c6b770d2e83718c2f29740a` |
| `test/refund_remainder_client_test.dart` | `6ca2f77bfe0fa69cc93ad1d5be912b254850eb51ee8aabc4cc8284906424d467` |

DTO/test committed bytes were checked at `c4411dc`; consumer/test at `bde3c11`.

Read-only command forms executed:
- `git status --short` before and after.
- `git diff --stat 1c2ad36… --` the authorized feature/new-test paths.
- `git show --stat --oneline` for both source-unit commits.
- `sha256sum` on the four current files.
- `git show <unit-commit>:<file> | sha256sum` for each corresponding committed file.
- `git diff 1c2ad36… --` the six authorized existing helper/context paths: **empty**.
- `git diff 5b746eb… bde3c11… --name-status`: four new Dart files plus task/guide changes.

UnitA shows 363 added lines. UnitB shows 382 insertions and one deletion, consistent with its recorded **383 authored diff lines**.

### Boundaries and handoff

- **Blockers:** none identified.
- Captured formatter/analyzer invocations and outputs were **read, not rerun**.
- `odd/evidence/d1-refund-remainder-status.json` still says independent review “NOT RUN”; that accurately predates this handoff and should not be mistaken for the present review result.
- No files were written; no scratch directories were created; no peer roots, secrets or live storage were accessed.
- No additional regression-test proposal is attached: no new defect was identified, and additional functional probes were explicitly deferred.
- This verdict establishes **static consistency only**. It is **not native review, operational safety approval, functional acceptance or whole-D1 completion**.
