export const maxBundleBytes = 128 * 1024;

export type IngestValidationInput = {
  messageId: string;
  incidentId: string;
  eventTypeIndex: number;
  createdAtMs: number;
  expiresAtMs: number;
  payloadLength: number;
  ciphertextLength: number;
  payload: {
    categoryIndex: number;
    priorityIndex: number;
    peopleCount?: number;
    shortNote?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    locationSourceIndex: number;
    identityAssuranceIndex: number;
    attachmentManifest: Array<{
      contentHash: string;
      sizeBytes: number;
      kindIndex: number;
    }>;
  };
  nowMs?: number;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Hex = /^[0-9a-f]{64}$/i;

export function validateIngest(input: IngestValidationInput): string | null {
  if (!uuid.test(input.messageId) || !uuid.test(input.incidentId)) {
    return "invalid_id";
  }
  if (
    !Number.isInteger(input.eventTypeIndex) || input.eventTypeIndex < 0 ||
    input.eventTypeIndex > 2
  ) {
    return "invalid_event_type";
  }
  if (
    !Number.isInteger(input.payloadLength) ||
    input.payloadLength !== input.ciphertextLength
  ) {
    return "invalid_payload_length";
  }
  const now = input.nowMs ?? Date.now();
  if (
    !Number.isSafeInteger(input.createdAtMs) ||
    !Number.isSafeInteger(input.expiresAtMs) ||
    input.expiresAtMs <= now ||
    input.expiresAtMs <= input.createdAtMs ||
    input.expiresAtMs - input.createdAtMs > 7 * 24 * 60 * 60 * 1000
  ) {
    return "invalid_expiration";
  }
  const payload = input.payload;
  if (
    !Number.isInteger(payload.categoryIndex) ||
    payload.categoryIndex < 0 ||
    payload.categoryIndex > 4 ||
    !Number.isInteger(payload.priorityIndex) ||
    payload.priorityIndex !== payload.categoryIndex
  ) {
    return "invalid_category_priority";
  }
  if (
    !Number.isInteger(payload.locationSourceIndex) ||
    payload.locationSourceIndex < 0 ||
    payload.locationSourceIndex > 2 ||
    !Number.isInteger(payload.identityAssuranceIndex) ||
    payload.identityAssuranceIndex < 0 ||
    payload.identityAssuranceIndex > 3
  ) {
    return "invalid_domain_state";
  }
  if (
    payload.peopleCount != null &&
    (!Number.isInteger(payload.peopleCount) || payload.peopleCount < 0 ||
      payload.peopleCount > 100000)
  ) {
    return "invalid_people_count";
  }
  if (payload.shortNote != null && payload.shortNote.length > 280) {
    return "note_too_long";
  }
  if (
    payload.latitude != null &&
    (!Number.isFinite(payload.latitude) || payload.latitude < -90 ||
      payload.latitude > 90)
  ) {
    return "invalid_latitude";
  }
  if (
    payload.longitude != null &&
    (!Number.isFinite(payload.longitude) || payload.longitude < -180 ||
      payload.longitude > 180)
  ) {
    return "invalid_longitude";
  }
  if (
    payload.accuracyMeters != null &&
    (!Number.isFinite(payload.accuracyMeters) || payload.accuracyMeters < 0 ||
      payload.accuracyMeters > 100000)
  ) {
    return "invalid_accuracy";
  }
  if (payload.attachmentManifest.length > 8) return "too_many_attachments";
  for (const attachment of payload.attachmentManifest) {
    if (
      !sha256Hex.test(attachment.contentHash) ||
      !Number.isInteger(attachment.sizeBytes) ||
      attachment.sizeBytes <= 0 ||
      attachment.sizeBytes > 10 * 1024 * 1024 ||
      !Number.isInteger(attachment.kindIndex) ||
      attachment.kindIndex < 0 ||
      attachment.kindIndex > 1
    ) {
      return "invalid_attachment";
    }
  }
  return null;
}
