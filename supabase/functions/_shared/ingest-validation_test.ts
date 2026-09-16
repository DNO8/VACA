import { assertEquals } from "jsr:@std/assert@1.0.14";
import {
  type IngestValidationInput,
  validateIngest,
} from "./ingest-validation.ts";

const now = Date.UTC(2026, 8, 16, 12);

function validInput(): IngestValidationInput {
  return {
    messageId: "123e4567-e89b-42d3-a456-426614174000",
    incidentId: "123e4567-e89b-42d3-a456-426614174001",
    eventTypeIndex: 0,
    createdAtMs: now - 1000,
    expiresAtMs: now + 60000,
    payloadLength: 128,
    ciphertextLength: 128,
    payload: {
      categoryIndex: 0,
      priorityIndex: 0,
      peopleCount: 2,
      shortNote: "Señal válida",
      latitude: -33.015,
      longitude: -71.55,
      accuracyMeters: 12,
      locationSourceIndex: 0,
      identityAssuranceIndex: 0,
      attachmentManifest: [],
    },
    nowMs: now,
  };
}

Deno.test("accepts a bounded current bundle", () => {
  assertEquals(validateIngest(validInput()), null);
});

Deno.test("rejects expired and inconsistent bundles", () => {
  const expired = validInput();
  expired.expiresAtMs = now - 1;
  assertEquals(validateIngest(expired), "invalid_expiration");

  const wrongPriority = validInput();
  wrongPriority.payload.priorityIndex = 4;
  assertEquals(validateIngest(wrongPriority), "invalid_category_priority");
});

Deno.test("rejects invalid coordinates and attachment bounds", () => {
  const coordinates = validInput();
  coordinates.payload.latitude = 91;
  assertEquals(validateIngest(coordinates), "invalid_latitude");

  const attachment = validInput();
  attachment.payload.attachmentManifest = [
    { contentHash: "invalid", sizeBytes: 11 * 1024 * 1024, kindIndex: 0 },
  ];
  assertEquals(validateIngest(attachment), "invalid_attachment");
});
