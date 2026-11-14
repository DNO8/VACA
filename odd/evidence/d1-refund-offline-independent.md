# D1 refund offline verification

## Outcome and limits

Bounded offline T2 verification passed for candidate `c3087fca1ff832e85817b17afb3d3024d311d0ee`, relative to baseline identity `c062c2c77e5217d12e85407be50ee8ac7aa19ef5`.
This is not native review approval, publication, an updated APK, live-backend validation, or financial acceptance. Historical toolchain and backend-source proof debts remain separate.

## Evidence attribution

- Parent job 4: focused panel checks passed; full refund suite **60/60 passed**, exit 0; targeted analysis of `test/refund_command_coordination_test.dart` exited 0 with no issues.
- Independent reviewer `mwgpaj65-d-48ig`: inspected the eleven intended changed files and supporting code. A read-only Python check verified **153/153** snapshot lengths, SHA-256 hashes and Git blob hashes, exit 0, empty stderr.
- Reviewer-designed probes: **8 tests**, executed by the parent using the pinned Flutter 3.41.9 / Dart 3.11.5 runner against isolated state. Job 8 exited **0**, took **21.842673913 seconds**, reported **8/8 passed**, and produced empty stderr.
- Reviewer `mwgpfp6k-e-gmfq` read the execution receipts and both output streams, returning **PASS for bounded offline T2**, with no demonstrated blocker.
- Commit provenance and original-tree preservation are parent-attested. Independent design and adjudication do not mean the reviewer directly executed Flutter.

## Covered interactions

For both v1 and v2: mixed-case UTC admission; unchanged original/exported deadline strings; exact literal donation identity; malformed, calendar-overflow and non-UTC rejection with exact public error codes; durable hold reconstruction; rejected subsequent reservation in either lane without storage changes; and corrupt stored deadline rejection without rewriting storage.

The eight tests supplement, rather than replace, the parent protocol/concurrency/UI suite and targeted analyzer evidence.

## Retained preparation failure

Job 7 exited 1 in 0.7426185 seconds before tests because the isolated `.dart_tool/package_graph.json` was missing. This was a preparation failure, not behavioral RED. One deterministic correction added only the schema-validated metadata (41,210 bytes, 215 packages); no dependency installation or cache copy occurred. The original failed receipt remains preserved separately from the corrected run.

Earlier full-history preparation was denied by the sensitive-path guard. The successful route instead used only allowlisted committed public source inputs, no Git metadata/history, and existing pinned dependency roots. No protection was disabled.

## Reproducibility bindings

- Snapshot manifest SHA-256: `eb254d8546a25bd7f9dba4e8d10dcaf4cdc3eb332e6b266d8915ba09e4de1369`.
- Snapshot input bytes: 5,977,582 across 153 files.
- Durable test: `vaca_app/test/refund_deadline_independent_test.dart`.
- Test SHA-256: `c371a4af9730d139f4e7ad1da3d34ef41c76dcc562c58d0ddcc8a1712825d1de` (retained byte-for-byte from the executed probe).
- Package-graph SHA-256: `c22aae921d04901037dee534c1697a2a316646a081f3c181367ee100b674ce7c`.
- Both execution receipts report the original and isolated 153 input files unchanged.
- Local raw receipts: `/tmp/vaca-d1-refund-app-verify/results/independent*.json`, with corresponding stdout/stderr text files. These temporary files are not published artifacts.

Command form, from the isolated app root, under the parent's clean environment and pinned runner:

```sh
flutter test --no-pub --reporter expanded test/refund_deadline_independent_test.dart
```

No baseline reproduction, full-app build, live backend, device, ledger or financial journey was performed by this independent review. The v1 guide's older present-tense `UNEXECUTED` labels remain a historical-documentation advisory; this report and the remainder guide distinguish current observed results from earlier evidence.
