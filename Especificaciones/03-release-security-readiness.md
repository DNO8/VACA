# VACA Release and Security Readiness

## Purpose

This document defines the permanent security, privacy, packaging, and evidence gates for every VACA release. A dated milestone may select when to run these gates, but it cannot weaken or bypass them. Store approval and public availability cannot be guaranteed by engineering because review timing and account decisions are external.

The September 30, 2026 target belongs to the current execution handoff; it is not an architectural or policy boundary.

Two release products are distinct:

1. **Public application:** Android and iOS, Internet synchronization, no public BLE relay claim.
2. **Municipal pilot application:** Android-only flavor with feature-flagged BLE relay and certified gateway configuration.

A build is not “ready” if it still uses debug signing, mock production data, placeholder transport behavior, hard-coded secrets, misleading emergency claims, or unverified privacy disclosures.

## Release flavors

| Flavor | Platforms | Network | Distribution |
| --- | --- | --- | --- |
| `dev` | Android/iOS | Mock or development backend | Local development only |
| `public` | Android/iOS | HTTPS Internet adapter | Play/App Store submission |
| `municipalPilot` | Android | HTTPS + BLE relay | Closed Play track or managed pilot distribution |

The public flavor must compile without BLE gateway permissions and must not expose pilot-only screens or claims. The municipal flavor must show an explicit foreground-service notification while relaying.

## External inputs required from the team

Engineering must stop and report a typed blocker instead of inventing any missing value.

| Input | Owner | Required for |
| --- | --- | --- |
| Final legal publisher entity | Project team/legal | Store ownership, policies, contracts |
| Google Play Console organization/account | Project team | Android submission |
| Apple Developer organization/team | Project team | iOS signing and submission |
| Final Android application ID | Publisher | Stable Play identity |
| Final iOS bundle identifier | Publisher | Stable App Store identity |
| Android upload keystore or approved generation ceremony | Publisher/engineering | Signed AAB |
| Apple signing team and profiles | Publisher | Signed archive |
| Public privacy-policy URL | Foundation/legal | Both stores and onboarding |
| Public support URL and contact | Foundation | Store metadata |
| Approved emergency disclaimer | Foundation/legal/municipality | App and store copy |
| Approved consent and retention policy versions | Foundation/legal | Data processing |
| Production backend URL and public client configuration | Backend owner | Public sync |
| Backend signing public keys/trust roots | Backend owner | Receipt verification |
| KYC provider project credentials and webhook secrets | Identity owner | Production KYC |
| KYC data-processing agreement and approved disclosures | Foundation/legal | Production KYC |
| Municipal gateway certificates/trust roots | Municipality/pilot owner | BLE pilot |
| App name, subtitle, descriptions, category, screenshots | Product/brand | Store listing |
| macOS/Xcode build environment | Project team | iOS archive and validation |

Secrets must be delivered through an approved secret manager or CI environment, never committed to the repository or copied into documentation.

## Application security baseline

### Identity and session

- Separate identity proofing from authentication.
- Treat KYC as an external adapter with explicit provider boundaries.
- Store only opaque provider-independent subject references and signed credentials on-device.
- Use platform-backed key storage for private keys and session material.
- Support credential expiration and revocation.
- Never log KYC responses, document images, biometrics, access tokens, or private keys.
- Unverified P0/P1 capture remains available with stricter server-side anti-abuse controls.

### Local data

- Store application files in private application storage.
- Protect encryption keys with Android Keystore and iOS Keychain/Secure Enclave capabilities where available.
- Encrypt sensitive structured data or sensitive fields at rest using a reviewed approach compatible with both platforms.
- Ensure backups do not unintentionally export credentials or sensitive incident content.
- Delete temporary camera files after durable copy or failure cleanup.
- Implement user-visible local deletion.
- Validate behavior after uninstall/reinstall and device backup restore.

### Network

- HTTPS only in public and pilot production flavors.
- No certificate-validation bypasses.
- Verify signed server receipts using packaged, rotatable trust roots.
- Apply timeouts, bounded retries, exponential backoff, and jitter.
- Use idempotency keys for every incident event.
- Reject oversized responses and unexpected content types.
- Do not interpret link connectivity as server delivery.

### API and backend

The implementation may include a local reference backend or migrations, but production deployment requires owner-provided infrastructure.

Required controls:

- Authenticated endpoints.
- Idempotent create/update/cancel ingestion.
- Strict schema and size validation.
- Per-identity/device/IP rate limits.
- Private media storage.
- Signed upload authorization or equivalent least-privilege mechanism.
- KYC webhook signature verification.
- Replay protection.
- Signed server receipts bound to message ID and payload hash.
- Audit events without plaintext sensitive payloads.
- Role-based access for exact coordinates and media.
- Deletion workflow and retention enforcement.
- Database authorization policies tested against cross-user access.

### BLE municipal pilot

- Disabled by default.
- Android foreground service required.
- No plaintext incident payload or exact location in advertising.
- Authenticated peer sessions.
- Certified gateway beacons.
- Hard limits for payload, fragments, peers, retries, storage, and copy budget.
- Battery-aware duty cycling.
- User-visible stop control.
- No public gateway mode.
- Security events use codes without sensitive bundle dumps.

## Privacy data inventory

The release owner must approve the final inventory before store submission.

| Data | Purpose | Storage | Sharing | Default retention decision required |
| --- | --- | --- | --- | --- |
| Opaque identity reference | Account and anti-abuse | Device/backend | KYC mapping backend only | Yes |
| KYC verification status | Identity assurance | Device/backend | Authorized backend | Yes |
| Device public key | Authentication | Device/backend | Authorized backend | Yes |
| Exact location | Incident response | Encrypted device/backend | Authorized operators | Yes |
| Location accuracy/source | Evidence quality | Encrypted device/backend | Authorized operators | Yes |
| Incident category/note | Coordination | Encrypted device/backend | Authorized operators | Yes |
| People count | Prioritization | Encrypted device/backend | Authorized operators | Yes |
| Photo/thumbnail | Optional evidence | Private device/storage | Authorized operators | Yes |
| Delivery metadata | Reliability/audit | Device/backend | Operations | Yes |
| BLE encounter telemetry | Pilot diagnostics | Device/backend aggregate | Pilot operations | Yes |
| Crash diagnostics | Reliability | Diagnostics provider if approved | Engineering | Yes |

Do not mark data as anonymous merely because it is hashed. Exact location, incident content, photos, and linkable identifiers remain personal or potentially sensitive.

## User controls

The public application must provide:

- Privacy notice before collection.
- Consent version record.
- Location and camera permission rationale before OS prompts.
- Functional fallback when optional permissions are denied.
- View of local active incidents.
- Cancel/update capability.
- Local data deletion.
- Account deletion request entry point when accounts exist.
- Support contact.
- Clear distinction between local save, relay custody, server receipt, and institutional acknowledgment.

## Emergency-safety review

The following are release blockers:

- UI states or store copy implying guaranteed rescue.
- Calling a local save “sent”.
- Calling gateway custody “received by municipality”.
- Hiding that official emergency channels should be used when available.
- Blocking local P0/P1 capture on KYC, photo, GPS, or Internet.
- Delaying compact P0/P1 enqueue until photo processing completes.
- Automatically dispatching a drone or emergency resource.
- Determining eligibility for public benefits.

## Android release checklist

The implementation agent must verify current official Google Play requirements at execution time rather than relying on hard-coded policy dates in this document.

### Project and build

- [ ] Final application ID configured before first production upload.
- [ ] Release build does not use debug signing.
- [ ] Upload key is outside source control.
- [ ] Play App Signing decision documented.
- [ ] Android App Bundle builds successfully.
- [ ] Version code/name strategy defined.
- [ ] Current required target API verified and configured.
- [ ] Release minification/resource shrinking evaluated and smoke-tested.
- [ ] Native debug symbols and mapping artifacts retained when applicable.
- [ ] No development endpoints or test keys in release artifact.

### Permissions

- [ ] Camera requested only at capture.
- [ ] Foreground location requested only when needed; no background location in the public application.
- [ ] Bluetooth permissions excluded from `public` if not used.
- [ ] Pilot Bluetooth scan/connect/advertise permissions have rationale and runtime handling.
- [ ] Foreground-service type and notification comply with current Android requirements.
- [ ] Denied and permanently denied states are tested.

### Play listing and declarations

- [ ] Privacy policy URL reachable publicly.
- [ ] Data Safety answers match actual behavior and SDKs.
- [ ] Account deletion requirements satisfied when an account exists.
- [ ] Content rating completed honestly.
- [ ] Ads declaration accurate; the public application should contain no ads.
- [ ] App access/reviewer instructions provided if verification gates content.
- [ ] Screenshots show public behavior, not unreleased municipal features.
- [ ] Emergency disclaimer appears in listing and app where legally approved.

## iOS release checklist

The implementation agent must verify current official Apple requirements at execution time.

### Project and build

- [ ] Flutter iOS platform created and committed.
- [ ] Final bundle identifier configured.
- [ ] Apple development team/signing configured outside source secrets.
- [ ] Supported iOS deployment target chosen and documented.
- [ ] Release archive builds on current approved Xcode environment.
- [ ] App Store validation passes.
- [ ] Version/build-number strategy defined.
- [ ] Public iOS build excludes BLE relay and gateway mode.
- [ ] No development endpoint or test key in archive.

### Privacy and capabilities

- [ ] Camera usage description is specific and truthful.
- [ ] Location-when-in-use description is specific and truthful.
- [ ] Bluetooth description/capability omitted if public iOS build does not use it.
- [ ] Required privacy manifest files exist and include applicable SDK declarations.
- [ ] App Privacy answers match actual collection and sharing.
- [ ] Keychain/data-protection capabilities configured as needed.
- [ ] Export compliance/cryptography questions answered with project owner input.
- [ ] Account deletion flow exists when accounts are created.

### App Store listing

- [ ] Privacy and support URLs reachable.
- [ ] App review notes explain KYC test access or provide an approved test path.
- [ ] Screenshots match the public flavor.
- [ ] No claim of official emergency-service affiliation without written authorization.
- [ ] Description distinguishes signal receipt from institutional response.

## Accessibility and UX verification

- [ ] Text scaling at 200% on core screens.
- [ ] TalkBack and VoiceOver labels for primary controls.
- [ ] Minimum 48×48 dp touch targets.
- [ ] Color-independent status communication.
- [ ] Reduced motion behavior.
- [ ] Outdoor/low-contrast visual check.
- [ ] Keyboard and focus behavior where applicable.
- [ ] Spanish copy review for clarity under stress.
- [ ] Celadon textures and gradients absent behind critical content.

## Test matrix

At minimum, record device/OS and exact result for:

| Scenario | Android public | iOS public | Android pilot |
| --- | ---: | ---: | ---: |
| Fresh install and onboarding | Required | Required | Required |
| Offline incident creation | Required | Required | Required |
| Process death/restart persistence | Required | Required | Required |
| HTTPS retry and dedupe | Required | Required | Required |
| Camera denied | Required | Required | Required |
| Location denied/disabled | Required | Required | Required |
| KYC unavailable | Required | Required | Required |
| Account/local deletion | Required | Required | Required |
| P0/P1 enqueue before media | Required | Required | Required |
| BLE origin→relay→gateway | N/A | N/A | Required |
| Locked/background relay | N/A | N/A | Required |
| Low battery behavior | N/A | N/A | Required |
| Fake gateway rejection | N/A | N/A | Required |

## CI and artifact requirements

Required checks:

- Formatting check.
- Static analysis.
- Unit tests.
- Widget tests.
- Integration tests where supported.
- Android public AAB build.
- Android municipal pilot build.
- iOS unsigned build in general CI when possible; signed archive in authorized macOS environment.
- Secret scan.
- Dependency/license inventory.
- Generated-code consistency check.

Artifacts must include:

- Build identifier and Git commit.
- Test report.
- Android AAB and symbols/mapping where applicable.
- Municipal pilot artifact distributed only through approved closed channel.
- iOS archive/export output from authorized environment.
- Store metadata package.
- Privacy data inventory and final owner approvals.
- Known limitations and rollback instructions.

## Go/no-go gates

### Public submission gate

All must be true:

- Core acceptance criteria in `01-public-mvp-product-spec.md` pass.
- No debug signing or mock production endpoint.
- Privacy policy, support, consent, and deletion paths exist.
- Store declarations match runtime behavior.
- No unresolved critical/high security defect.
- Emergency-safety review passes.
- Accessibility core flow passes.
- External publisher/signing inputs are present.

### Municipal pilot gate

All public technical gates that apply, plus:

- Municipality approves pilot scope and devices.
- Gateway trust roots are configured.
- BLE security and battery scenarios pass on real devices.
- Foreground-service behavior is disclosed.
- Pilot feature is inaccessible in public flavor.
- Incident payload remains confidential from relays and gateway.

## Definition of release-ready

The engineering agent may state:

- **Code complete:** implementation and automated checks pass without external publishing credentials.
- **Submission ready:** signed artifacts, policies, metadata, and portal declarations are complete.
- **Submitted:** artifacts were uploaded by an authorized account holder.
- **Published:** store review approved and listing is public.

The agent must never collapse these states into “done”. If external inputs are missing, report the exact blocker and leave deterministic verification instructions.
