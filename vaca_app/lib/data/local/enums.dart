/// Enums del dominio público de incidentes de VACA.
///
/// No contienen códigos oficiales de emergencia ni campos FIBE. Son estados
/// internos del producto para la versión pública offline-first.
library;

/// Nivel de confianza de identidad capturado al crear el incidente.
enum IdentityAssurance {
  unverified, // Usuario no verificó su identidad con KYC.
  verified, // Credencial opaca firmada y vigente.
  expired, // Credencial presente pero caducada.
  revoked, // Credencial revocada.
  pending, // Verificación enviada, pendiente de decisión del proveedor.
}

/// Categoría de incidente visible para el usuario.
enum IncidentCategory {
  sos, // P0 — Vida en riesgo inmediato.
  medical, // P1 — Emergencia médica.
  person, // P2 — Persona ubicación/desaparición/reunificación.
  hazard, // P3 — Peligro, acceso bloqueado o daño infraestructura.
  coordination, // P4 — Coordinación o información no urgente.
}

/// Prioridad de red derivada de la categoría.
enum IncidentPriority {
  p0, // SOS / vida en riesgo.
  p1, // Emergencia médica.
  p2, // Personas/ubicación.
  p3, // Infraestructura/peligro.
  p4, // Coordinación.
  p5, // Multimedia de gran tamaño (deferred).
}

/// Fuente de la ubicación registrada.
enum LocationSource {
  gps,
  manual,
  unavailable,
}

/// Estado local del incidente en la UI/entrega.
enum IncidentStatus {
  draft,
  savedLocally,
  queued,
  relaying,
  uploading,
  receivedByServer,
  acknowledgedInstitutionally,
  cancelledLocally,
  cancellationQueued,
  cancellationReceived,
  expired,
  failedRetryable,
}

/// Tipo de evento de la vida de un incidente.
enum EventType {
  created,
  updated,
  cancelled,
  receipt,
}

/// Tipo de adjunto.
enum AttachmentKind {
  photo,
  thumbnail,
}

/// Estado de sincronización de un adjunto.
enum AttachmentSyncStatus {
  pending,
  uploading,
  synced,
  failed,
}

/// Estado de una entrega de paquete.
enum DeliveryState {
  queued,
  sent,
  delivered,
  failed,
}

/// Estado de un intento de entrega.
enum DeliveryOutcome {
  success,
  retryable,
  nonRetryable,
  expired,
}

/// Tipo de transporte que maneja el paquete.
enum LinkKind {
  internet,
  bleRelay,
}
