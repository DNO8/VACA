/// Enums del dominio publico de incidentes de VACA.
///
/// No contienen codigos oficiales de emergencia ni campos FIBE. Son estados
/// internos del producto para la version publica offline-first.
library;

/// Nivel de confianza de identidad capturado al crear el incidente.
enum IdentityAssurance {
  unverified, // Usuario no verifico su identidad con KYC.
  verified, // Credencial opaca firmada y vigente.
  expired, // Credencial presente pero caducada.
  revoked, // Credencial revocada.
}

/// Categoria de incidente visible para el usuario.
enum IncidentCategory {
  sos, // P0 — Vida en riesgo inmediato.
  medical, // P1 — Emergencia medica.
  person, // P2 — Persona ubicacion/desaparicion/reunificacion.
  hazard, // P3 — Peligro, acceso bloqueado o dano infraestructura.
  coordination, // P4 — Coordinacion o informacion no urgente.
}

/// Prioridad de red derivada de la categoria.
enum IncidentPriority {
  p0, // SOS / vida en riesgo.
  p1, // Emergencia medica.
  p2, // Personas/ubicacion.
  p3, // Infraestructura/peligro.
  p4, // Coordinacion.
  p5, // Multimedia de gran tamano (deferred).
}

/// Fuente de la ubicacion registrada.
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

/// Estado de sincronizacion de un adjunto.
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
