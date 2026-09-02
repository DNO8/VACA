# VACA Hybrid DTN Architecture

## Decision

VACA uses a transport-independent Delay-Tolerant Networking layer. BLE is the first offline convergence adapter for the Android municipal pilot. Internet over HTTPS is the required public transport for Android and iOS. Wi-Fi Direct, Wi-Fi Aware, LoRa, satellite, MQTT, and specialized QUIC transports remain future adapters.

Do not implement or describe the system as Bluetooth SIG Mesh. The pilot is a custom, application-level DTN using BLE discovery and authenticated store-carry-forward relay.

## Architectural goals

- Persist before send.
- Continue operating through intermittent connectivity.
- Treat relay devices and gateways as untrusted for payload confidentiality.
- Use one canonical bundle format across links.
- Allow multiple links to be active without duplicating server records.
- Prioritize compact life-safety signals over media.
- Bound battery, storage, bandwidth, and connection usage.
- Keep iOS compatible with the bundle and Internet layers even though BLE relay is initially Android-only.

## Layer model

```text
Flutter application
  ├─ Identity and consent
  ├─ Incident domain
  ├─ User-visible delivery state
  └─ Attachment capture
          │
          ▼
DTN application boundary
  ├─ Canonical bundle codec
  ├─ Durable origin outbox
  ├─ Receipt verifier
  ├─ Priority scheduler
  └─ Link orchestration
          │
          ├─────────────────────────────┐
          ▼                             ▼
InternetLinkAdapter                AndroidRelayEngine
  └─ HTTPS batch upload              ├─ BLE discovery
                                     ├─ authenticated sessions
                                     ├─ durable relay cache
                                     ├─ inventory exchange
                                     ├─ spray-and-wait routing
                                     ├─ gateway selection
                                     └─ foreground service
```

The Android native engine owns timing-sensitive BLE discovery, connection management, relay routing, hop limits, peer replay protection, and relay-cache persistence. Flutter receives high-level events only. Domain entities remain in Drift and are not exposed to relay peers.

## Component responsibilities

### Flutter application layer

- Creates and updates incidents.
- Produces the minimal domain payload.
- Captures photos and creates thumbnails.
- Requests encryption/signing through an application security service.
- Persists origin bundles before handing them to any link.
- Shows honest delivery states.
- Verifies signed server receipts.
- Reconciles delivery events from Internet and Android BLE paths.

### DTN coordinator

Define a transport-independent Dart interface:

```dart
abstract interface class DtnCoordinator {
  Future<void> start();
  Future<void> stop();
  Future<EnqueueResult> enqueue(Bundle bundle);
  Stream<BundleEvent> get events;
  Stream<NetworkSnapshot> get network;
}
```

It coordinates origin bundles and link adapters. It must support more than one active link; do not use a provider that selects exactly one `Transport` implementation.

### Link adapter

```dart
abstract interface class LinkAdapter {
  String get id;
  LinkCapabilities get capabilities;
  Future<void> start();
  Future<void> stop();
  Future<TransferResult> offer(BundleReference bundle);
  Stream<LinkEvent> get events;
  Stream<LinkHealth> get health;
}
```

`LinkCapabilities` includes:

- Maximum practical payload size.
- MTU or chunk size.
- Discovery support.
- Broadcast/unicast support.
- Background capability.
- Relative energy cost.
- Relative bandwidth.
- Metered/unmetered state when known.
- Supported bundle protocol versions.

### AndroidRelayEngine

Implement in Kotlin behind MethodChannel/EventChannel or a typed platform interface. It must be self-contained for BLE network behavior and expose only high-level operations:

```text
start(config)
stop()
importBundle(encryptedBytes, metadata)
removeOriginBundle(bundleId)
networkSnapshot()

Events:
PeerObserved
PeerLost
BundleStored
BundleForwarded
GatewayObserved
ServerReceiptObserved
NetworkHealthChanged
SecurityViolation
```

The engine does not receive raw KYC data, RUT, unencrypted note, exact unencrypted location, or unencrypted media.

### InternetLinkAdapter

- Uses HTTPS first.
- Uploads idempotent batches.
- Supports resumable attachment upload when the backend supports it.
- Uses bounded exponential backoff with jitter.
- Distinguishes network availability from confirmed Internet reachability.
- Treats captive portals and transport connection as degraded until the authorized endpoint is reachable.

MQTT and custom QUIC are not MVP requirements. HTTP/3 may be adopted by the standard networking stack without changing the application contract.

## Canonical bundle

Use a deterministic compact binary representation suitable for signing and BLE fragmentation. Canonical CBOR is preferred if a maintained, reviewed implementation is available for every required runtime. Do not create a custom parser without tests and strict bounds.

### Header

| Field | Type | Purpose |
| --- | --- | --- |
| `protocolVersion` | unsigned integer | Codec and behavior version. |
| `messageId` | 128-bit random identifier | Global deduplication key. |
| `incidentId` | 128-bit identifier | Groups create/update/cancel events. |
| `eventType` | enum | `created`, `updated`, `cancelled`, `receipt`. |
| `originCredentialRef` | opaque bytes | Event-scoped pseudonymous credential reference. |
| `destination` | logical destination | Authorized server or direct recipient. |
| `messageType` | enum | SOS, medical, person, hazard, coordination, control, receipt. |
| `priority` | P0–P5 | Network scheduling class. |
| `createdAt` | timestamp | Untrusted source timestamp for context. |
| `expiresAt` | timestamp | Operational expiration. |
| `hopLimit` | unsigned integer | Decremented by each relay. |
| `payloadLength` | unsigned integer | Strict allocation bound. |
| `payloadHash` | 32 bytes | Hash of ciphertext payload. |
| `fragmentIndex` | unsigned integer | Fragment position. |
| `fragmentCount` | unsigned integer | Total bounded fragments. |
| `keyId` | opaque identifier | Encryption key version. |
| `nonce` | bytes | AEAD nonce. |
| `signature` | bytes | Origin signature over canonical protected fields. |

`expiresAt` and `hopLimit` are independent. A bundle is ineligible when either expires. Relays must not trust `createdAt` as an authoritative clock.

### Encrypted payload

The payload contains only the domain information needed by the authorized recipient:

- Category and subcategory.
- Exact location and accuracy.
- People count.
- Optional short note.
- Identity-assurance claim.
- Attachment manifest.
- Update/cancellation relationship.

The network-visible header must not contain exact coordinates, names, document numbers, raw KYC identifiers, or plaintext notes.

### Attachment policy

- P0/P1 compact payload is created and enqueued before photo processing.
- Generate a bounded thumbnail as an independent attachment bundle.
- Full-resolution photo is P5 and cannot block P0–P4.
- Video is local/Internet-only and outside the BLE pilot.
- Attachments use content hashes and resumable chunks.
- Operational evidence remains unfiltered; visual design filters apply only to brand imagery.

## Persistence

Replace transport fields embedded in the domain sync queue with protocol-specific tables. A migration must preserve any existing development data when practical; destructive reset is allowed only for non-production development databases and must be explicit.

### OriginBundle

```text
id
incidentId
eventId
priority
canonicalHeader
ciphertextPath or ciphertextBytes
payloadHash
expiresAt
state
createdAt
lastAttemptAt
serverReceiptId nullable
```

### RelayBundle

Native Android durable cache:

```text
messageId
protectedHeader
ciphertextPath or ciphertextBytes
payloadHash
priority
expiresAt
hopLimitRemaining
copyBudget
receivedFromPeer
receivedAt
lastForwardedAt
```

### DeliveryAttempt

```text
id
messageId
linkId
peerIdHash nullable
startedAt
finishedAt nullable
outcome
bytesTransferred
errorCode nullable
```

### ServerReceipt

```text
receiptId
messageId
payloadHash
serverReceivedAt
serverKeyId
signature
verifiedAt
```

### Tombstone

Retain a bounded tombstone after verified delivery to suppress duplicate propagation. Tombstone retention must be longer than the normal encounter/retry window but bounded by policy.

## BLE control plane

### Discovery advertisement

Advertise only compact, coarse information:

```text
protocolVersion
ephemeralNodeId
capabilityBits
batteryClass
queuePriorityBitmap
gatewayScoreBucket
gatewayBeaconSequence
advertisementSignature
```

Do not advertise exact queue size, exact battery percentage, full neighbor graph, identity, coordinates, or incident IDs.

### Peer state

Maintain locally:

```text
ephemeralNodeId
lastSeen
linkQuality
supportedVersions
capabilities
batteryClass
queueSummary
gatewayScore
gatewayFreshness
securityState
backoffUntil
```

RSSI is `linkQuality`, not physical distance.

### Session sequence

1. Observe compatible advertisement.
2. Apply battery, rate, and backoff policy.
3. Establish authenticated encrypted session.
4. Exchange bounded inventory summaries.
5. Request missing eligible bundle IDs.
6. Transfer header first and validate bounds/signature before payload allocation.
7. Transfer chunks with resumable offsets.
8. Persist completely before sending custody acknowledgment.
9. Update local encounter and scheduling state.
10. Close idle session quickly.

## Routing policy

Use priority-aware spray-and-wait with a gateway gradient. Do not implement unbounded epidemic flooding.

A bundle is offered when the peer:

- Does not already advertise/confirm possession.
- Supports the protocol version.
- Has capacity for the priority class.
- Has a fresher or better gateway score, or the local copy budget allows redundancy.
- Is not in security or congestion backoff.

Copy budgets are configuration values and must have hard maxima. P0/P1 may receive more redundancy than P2–P5, but all classes use bounded storage and transmission.

### Gateway score

A gateway beacon includes:

- Institution-issued gateway certificate reference.
- Last successful authorized-server reachability time.
- Monotonic beacon sequence.
- Load bucket.
- Hop estimate.
- Expiration.
- Signature.

Peers derive a local score from freshness, hop estimate, load, link quality, and battery class. Never accept an unsigned `internetAvailable` claim.

### Gateway anti-stampede

- Randomized backoff and jitter.
- Maximum concurrent sessions.
- Gateway-advertised capacity slots.
- Inventory before payload.
- Gateway requests missing IDs rather than accepting unsolicited bulk transfer.
- Per-peer quotas.
- Hysteresis before switching gateways.
- Priority-weighted fair scheduling with aging.
- Temporary nearby relays may aggregate bundles before connecting to the gateway.

## Delivery semantics

Different events must remain distinct:

| Event | Meaning |
| --- | --- |
| `storedLocally` | Origin persisted the bundle. |
| `custodyAccepted` | A relay persisted a valid encrypted copy. |
| `forwarded` | A link transfer completed. |
| `gatewayAccepted` | Certified gateway persisted the copy; not server delivery. |
| `serverReceiptVerified` | Authorized server signed receipt matches message ID and payload hash. |
| `institutionAcknowledged` | Future institutional workflow accepted/reviewed the incident. |

Only `serverReceiptVerified` permits UI text equivalent to “received by VACA”. Only `institutionAcknowledged` permits institutional acknowledgment language.

## Security architecture

### Trust boundaries

- Origin device may be compromised.
- Relay devices are untrusted.
- A discovered gateway is untrusted until certificate and beacon validation.
- Network links are hostile.
- Authorized server trust roots are packaged and rotatable through signed configuration.
- KYC proves identity assurance, not truth, presence, urgency, or aid eligibility.

### End-to-end protection

- Generate a random content-encryption key per payload.
- Encrypt payload with an authenticated encryption primitive from a reviewed library.
- Encrypt/wrap the content key for the authorized recipient.
- Sign canonical protected header fields and ciphertext hash using an event-scoped pseudonymous origin key.
- Verify payload hash, AEAD authentication, credential validity, and signature at the authorized server.
- Gateway and relays do not receive decryption keys.

Do not implement cryptographic primitives manually. The implementation agent must select maintained libraries, document the selected algorithms and versions, and add known-answer/round-trip/tamper tests.

### Hop-by-hop session protection

Use an authenticated key agreement suitable for BLE sessions, such as a reviewed Noise implementation or equivalent platform-supported construction. This is separate from end-to-end payload encryption.

### Credential model

- KYC relationship stays on the backend.
- Mobile receives an opaque signed credential.
- Mesh uses a rotating event-scoped pseudonym/key.
- Relays may validate admission without learning the civil identity.
- Unverified P0/P1 messages use a separate bounded admission path.

### Threat controls

| Threat | Required control |
| --- | --- |
| Node impersonation | Authenticated ephemeral keys and credential validation. |
| Fake gateway | Institution certificate, signed expiring beacon. |
| Replay | Message ID cache, nonce, sequence, expiration. |
| Duplicate storm | Inventory exchange, dedupe cache, tombstones, bounded copy budget. |
| Spam/Sybil | Credential quotas, unverified-channel limits, server-side abuse detection. |
| P0 abuse | Per-credential limits and weighted fairness; never trust priority as truth. |
| Battery exhaustion | Duty cycling, cheap admission checks, session quotas, user-visible foreground service. |
| Storage exhaustion | Per-origin quota, global cap, expiration, priority-aware eviction. |
| Oversized allocation | Header-first validation, hard size/fragment limits. |
| Malicious relay drop | Multiple bounded copies and signed server receipt requirement. |
| Payload modification | AEAD, content hash, origin signature. |
| Traffic analysis | Minimize metadata; acknowledge that size/timing remain observable. |

## Battery and lifecycle

### Android pilot

- BLE relay runs only through a visible foreground service with clear stop control.
- Duty cycle adapts to battery class and charging state.
- Low battery disables bulk relay before critical compact relay.
- Thermal and OS restrictions are treated as degraded state.
- Reboot and process-death recovery are tested.

### iOS public app

- Uses the same bundle codec, origin outbox, receipt verification, and HTTPS adapter.
- BLE multi-hop relay is compiled out or disabled.
- No UI claims that iOS participates in the municipal relay network.

## Configuration and feature flags

```text
DTN_ENABLED=true
INTERNET_LINK_ENABLED=true
BLE_RELAY_ENABLED=false by default
MUNICIPAL_GATEWAY_MODE=false by default
FULL_MEDIA_OVER_BLE=false
MAX_BUNDLE_BYTES=<bounded configured value>
MAX_RELAY_STORAGE_BYTES=<bounded configured value>
```

Production flags must come from signed configuration or build flavor. Do not expose a public toggle that enables uncertified gateway mode.

Recommended flavors:

- `dev`: mock backend, test keys, verbose non-sensitive diagnostics.
- `public`: Internet only, production policies, no gateway mode.
- `municipalPilot`: Internet + Android BLE relay, approved trust roots and pilot configuration.

## Observability

Record operational metrics without payload or precise identity:

- Link availability duration.
- Peer encounters.
- Bundle counts by priority and state.
- Transfer latency and bytes.
- Duplicate suppression count.
- Battery impact sampling.
- Gateway reachability.
- Receipt latency.
- Protocol/security error codes.

Never log exact coordinates, plaintext messages, media paths, KYC responses, credentials, keys, or unredacted bundle bytes.

## Required tests

### Unit

- Canonical encode/decode.
- Version rejection.
- Signature and receipt verification.
- Ciphertext tamper rejection.
- Expiration and hop-limit rules.
- Priority scheduling and aging.
- Copy budget.
- Dedupe and tombstone behavior.
- Size and fragment bounds.

### Integration

- Origin persistence survives restart.
- Repeated Internet uploads create one server record.
- Origin → relay → gateway using three Android devices or deterministic harness.
- Origin disappears after relay custody.
- Malicious relay cannot decrypt payload.
- Fake gateway beacon is rejected.
- Gateway stampede simulation respects capacity.
- Signed receipt propagates and reconciles state.

### Runtime field scenarios

- Airplane mode with Bluetooth enabled.
- App foreground and background with visible foreground service.
- Locked device.
- Gateway loses and regains Internet.
- Duplicate encounter loops.
- Low battery relay policy.
- Process kill and restart.
- Mixed pilot and non-pilot app flavors.

## Pilot completion criteria

The BLE municipal pilot is complete only when:

- A compact encrypted bundle traverses origin → relay → certified gateway.
- The origin may leave after relay custody without losing delivery.
- Duplicate routes produce one server record.
- Relay and gateway cannot decrypt the incident payload.
- Invalid signatures, expired bundles, oversized bundles, and fake gateway beacons are rejected.
- A signed server receipt returns and updates the origin state.
- Foreground-service and battery behavior are documented from real Android devices.
