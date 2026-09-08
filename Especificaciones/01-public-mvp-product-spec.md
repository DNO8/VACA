# VACA Public Mobile Product — Permanent Specification

## Decision

VACA's public product is an Android and iOS offline-first incident-signaling application. The municipal BLE relay is an Android-only, feature-flagged capability for authorized deployments.

This specification is a permanent product baseline, independent of release dates or funding milestones. Delivery plans may stage its implementation but cannot redefine its safety, privacy, domain, or transport semantics.

The public application does not reproduce an official government assessment, determine aid eligibility, replace emergency telephone services, or claim that a report reached an authority until the application receives an authenticated server receipt.

## Document authority

For product and implementation conflicts, use this precedence:

1. Security, privacy, and safety invariants shared by `01-public-mvp-product-spec.md`, `02-hybrid-dtn-architecture.md` and `03-release-security-readiness.md`.
2. `flujo-app.md` for user-visible behavior and state transitions.
3. `modelo-datos-fibe.md` for the logical data model; its filename is retained only for compatibility.
4. `mesh-comunicaciones.md` for Android relay behavior under the normative DTN architecture.
5. `sistema-diseno-app.md` and `Markdowns/brandboard.md` for visual and content rules.
6. Dated handoffs and implementation backlogs for sequencing and release evidence only.

FIBE-oriented forms and Stellar-oriented aid flows are retired historical inputs. Do not expose FIBE names, modules, official codes, aid eligibility, tokenization, wallets, or official-assessment language in active source identifiers, UI copy, analytics, store metadata, or API contracts.

## Product outcomes

The public mobile product must allow a person to:

1. Prepare their identity and device before a disaster when connectivity exists.
2. Create a minimal incident signal without Internet.
3. Persist the signal and evidence locally before any transmission attempt.
4. Deliver the signal directly through Internet when available.
5. On pilot-enabled Android devices, relay a compact signal through BLE until a gateway can upload it.
6. See an honest delivery state and an authenticated receipt when the authorized server accepts the signal.
7. Update or cancel a previously created signal.
8. Delete their local data and request deletion of synchronized account data.

## Actors

| Actor | Responsibility |
| --- | --- |
| Public reporter | Creates a signal for themselves or an observed incident. |
| Prepared verified user | Completed KYC before the incident and holds an opaque signed credential. |
| Unverified reporter | May create safety-critical signals but receives a lower identity-assurance status. |
| Relay node | Stores and forwards encrypted bundles without reading their payload. |
| Municipal pilot gateway | Receives encrypted bundles and uploads them to the authorized server. |
| Authorized server | Authenticates, deduplicates, stores, acknowledges, and routes incident signals. |
| Institutional operator | Reviews signals using systems outside the public mobile application. |

## Scope

### Public Android and iOS

- First-run onboarding and explicit emergency disclaimer.
- Privacy notice and consent version capture.
- KYC adapter with a development implementation and a production configuration boundary.
- Passkey or platform-backed account authentication when configured.
- Unverified emergency path when identity verification is unavailable.
- Incident creation with category, location, people count, optional short note, and optional photo.
- Local encrypted persistence.
- Durable outbox and idempotent Internet synchronization.
- Delivery state, retry, update, cancel, and deletion flows.
- Celadon civic design system defined in `sistema-diseno-app.md`.
- Accessibility and reduced-motion support.
- Production-ready Android and iOS project structure, pending only external credentials explicitly listed in the release document.

### Municipal Android pilot

- Feature flag disabled by default in public builds.
- BLE discovery and authenticated peer session.
- One-hop transfer.
- Store-carry-forward after the origin leaves.
- Multi-hop relay across at least three pilot devices.
- Gateway advertisement and upload.
- Signed server receipt propagation.
- Compact incident bundles only; full-resolution media is not required over BLE.

### Explicitly out of scope

- Official government assessment forms or benefit determination.
- Automatic dispatch of police, ambulance, firefighters, drones, or municipal resources.
- iOS BLE multi-hop relay.
- Wi-Fi Direct, Wi-Fi Aware, LoRa, satellite, MQTT, and custom QUIC implementation.
- Full municipal dashboard.
- Stellar wallet, aid distribution, tokenization, Social Yield, or Proof of Aid.
- Video transfer over BLE.
- Background location tracking.
- Public display of exact incident coordinates.
- Automated trust or aid decisions based only on KYC, media, or geographic consensus.

## Safety language

The first run and signal confirmation screens must communicate, in clear neutral Spanish:

- VACA does not replace official emergency telephone numbers or services.
- A locally saved or relayed signal is not the same as institutional receipt.
- The user must use official channels whenever they are available and it is safe to do so.
- Delivery is shown as confirmed only after an authenticated server receipt.

Do not use fear-inducing language or imply guaranteed rescue.

## Incident categories and network priorities

User-facing categories and network priorities are related but not identical. The application derives the initial network priority from the selected category; users do not edit a raw priority number.

| Priority | User-facing purpose | Initial payload policy |
| --- | --- | --- |
| P0 | SOS / life at immediate risk | Send compact coordinates and status before media. |
| P1 | Urgent medical emergency | Send compact medical request before media. |
| P2 | Person location, missing person, or reunification | Send location and person summary. |
| P3 | Hazard, blocked access, or infrastructure damage | Send location, hazard type, and note. |
| P4 | Coordination or non-urgent information | Send compact text/status. |
| P5 | Bulk media transfer | Deferred; must never block P0–P4. |

Priority must be combined with expiration and fair scheduling so lower-priority messages are not starved indefinitely.

## Core flows

### Flow A — Prepared onboarding

1. User reads the purpose, limitations, and privacy notice.
2. User accepts the current consent version.
3. Application creates a platform-backed device/account key.
4. KYC is initiated only with network connectivity.
5. The backend stores the provider relationship and returns an opaque, signed, time-limited credential.
6. The application stores only the credential and opaque subject reference required for operation.
7. Raw document images, biometrics, and provider secrets are not stored by the mobile application.

### Flow B — Unverified emergency use

1. User cannot or does not complete KYC.
2. User acknowledges that identity is unverified.
3. User may create a safety signal.
4. The signal carries `identityAssurance = unverified` and stricter anti-abuse limits.
5. Lack of KYC must not prevent local capture of a P0/P1 signal.

### Flow C — Create incident offline

1. User selects one clear incident category.
2. Application attempts location capture and records accuracy.
3. User confirms or corrects the location through a simple map/manual fallback.
4. User enters the minimum additional information: people count and optional short note.
5. Optional photo is captured without delaying the initial P0/P1 save.
6. Application creates the incident and encrypted bundle transactionally.
7. UI immediately shows `savedLocally`.
8. Delivery attempts begin opportunistically.

### Flow D — Internet delivery

1. Connectivity becomes available.
2. Scheduler selects eligible bundles by priority, expiration, and age.
3. Internet adapter sends an idempotent batch over HTTPS.
4. Server validates authentication, signature, size, and schema.
5. Server returns an authenticated receipt per accepted bundle.
6. Application moves the signal to `receivedByServer` only after receipt verification.

### Flow E — Municipal BLE relay

1. Pilot-enabled Android nodes advertise minimal capabilities.
2. Peers authenticate and exchange compact inventories.
3. Missing eligible bundles are transferred according to priority and capacity.
4. Relay persists the encrypted bundle before acknowledging custody.
5. A gateway uploads the bundle through HTTPS.
6. Server receipt returns through available paths.
7. Origin and relays retain a bounded receipt/tombstone long enough to prevent duplicate propagation.

### Flow F — Update or cancel

1. User opens an active incident.
2. User records an update or cancellation as a new signed event referencing the incident.
3. Updates never mutate an already signed/transmitted bundle in place.
4. The server resolves the current incident state using event ordering and authorization rules.

## Data model

### IdentityProfile

| Field | Notes |
| --- | --- |
| `id` | Local UUID. |
| `opaqueSubjectId` | Nullable provider-independent backend reference. |
| `identityAssurance` | `unverified`, `verified`, `expired`, `revoked`. |
| `credential` | Signed opaque credential; never raw KYC data. |
| `credentialExpiresAt` | Nullable for unverified profiles. |
| `devicePublicKey` | Public key for request authentication. |
| `consentVersion` | Accepted policy version. |
| `createdAt`, `updatedAt` | Audit timestamps. |

### Incident

| Field | Notes |
| --- | --- |
| `id` | UUID generated locally. |
| `reporterProfileId` | Local identity relationship. |
| `category` | Domain category, not an official assessment code. |
| `priority` | Derived P0–P4 priority. |
| `peopleCount` | Optional bounded integer. |
| `shortNote` | Optional and length-limited. |
| `latitude`, `longitude`, `accuracyMeters` | Nullable with manual fallback metadata. |
| `locationSource` | `gps`, `manual`, `unavailable`. |
| `createdAt`, `updatedAt` | Device timestamps. |
| `status` | Local product state. |
| `identityAssurance` | Snapshot at creation. |

### IncidentEvent

Append-only events: `created`, `updated`, `cancelled`, `receiptAttached`. Each event has its own ID, timestamp, signer, and signature.

### Attachment

| Field | Notes |
| --- | --- |
| `id` | UUID. |
| `incidentId` | Parent incident. |
| `kind` | `photo`, `thumbnail`, future types. |
| `localPath` | Private application storage. |
| `sha256` | Content integrity. |
| `sizeBytes` | Enforced before enqueue. |
| `capturedAt` | Capture time with source metadata. |
| `syncStatus` | Independent media state. |

### Bundle and delivery records

Defined normatively in `02-hybrid-dtn-architecture.md`. Do not use domain table snapshots as the transport protocol.

## State machines

### Incident state

```text
draft
  → savedLocally
  → queued
  → relaying | uploading
  → receivedByServer
  → acknowledgedInstitutionally (future integration)

savedLocally | queued | relaying | uploading
  → cancelledLocally
  → cancellationQueued
  → cancellationReceived

any non-terminal state
  → expired
  → failedRetryable
```

`receivedByServer` and `acknowledgedInstitutionally` are deliberately separate.

### Identity state

```text
unverified → verificationPending → verified
verified → expired | revoked
expired → verificationPending → verified
```

## Non-functional requirements

### Reliability

- Every signal is persisted before transmission.
- Repeated transmission does not create duplicate server incidents.
- Process death and device restart do not lose queued bundles.
- Expired bundles are not propagated, but remain visible according to retention policy.
- A server receipt is cryptographically verifiable and bound to the bundle ID and payload hash.

### Security and privacy

- No secrets committed to source control.
- No raw RUT, identity document, biometric, or KYC provider response stored in application logs.
- Exact location and payload are end-to-end encrypted for authorized recipients.
- Relay nodes cannot decrypt incident content.
- Logs use opaque IDs and redact tokens, paths, coordinates, notes, and media metadata.
- Local sensitive data uses platform-backed key protection and encrypted storage where supported.

### Performance

- P0/P1 compact bundle creation must not wait for photo processing.
- Media processing runs outside the UI frame path.
- BLE inventories are compact and bounded.
- Queue size, attachment size, retries, and peer sessions have hard limits.

### Accessibility

- All primary actions have text labels and semantic descriptions.
- No state depends exclusively on color.
- Text scaling to 200% does not block the primary action.
- Reduced-motion preferences are respected.
- Touch targets are at least 48×48 dp.

## Product acceptance criteria

- Android and iOS applications launch and complete the public incident flow.
- A signal can be created in airplane mode, survives restart, and later syncs through HTTPS.
- Duplicate upload attempts result in one server incident.
- UI never displays server receipt before cryptographic receipt verification.
- P0/P1 save and enqueue do not depend on media completion.
- An unverified user can save a P0/P1 signal.
- A verified test user receives and uses an opaque credential without mobile storage of raw KYC data.
- Android municipal build relays an encrypted compact bundle origin → relay → gateway.
- Relay and gateway cannot decrypt the payload in an automated test.
- iOS builds without the BLE pilot feature and retains the same domain/DTN interfaces.
- Store-facing metadata and UI contain no official-assessment branding or claims.
