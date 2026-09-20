import 'package:flutter/material.dart';

import '../../data/local/enums.dart';
import '../theme/app_theme.dart';

/// Helpers de presentación compartidos entre pantallas.
/// Centralizan etiquetas y formatos para mantener una sola fuente de verdad.

/// Prefijo corto de un identificador interno (UUID). No es un folio público.
String vacaShortId(String id) => id.length <= 8 ? id : id.substring(0, 8);

/// Timestamp UTC compacto, p. ej. `2026-09-16 09:41:03Z`.
String vacaTimestamp(DateTime dt) {
  final u = dt.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${u.year}-${two(u.month)}-${two(u.day)} '
      '${two(u.hour)}:${two(u.minute)}:${two(u.second)}Z';
}

/// Tiempo relativo en español: `hace 3 min`, `hace 2h`, `ayer`, fecha corta.
String vacaRelativeTime(DateTime dt, {DateTime? now}) {
  final local = dt.toLocal();
  final diff = (now ?? DateTime.now()).difference(local);
  if (diff.isNegative || diff.inMinutes < 1) return 'ahora';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'hace ${diff.inHours}h';
  if (diff.inDays == 1) return 'ayer';
  if (diff.inDays < 7) return 'hace ${diff.inDays} días';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year}';
}

/// Saludo según hora local del dispositivo.
String vacaGreeting(DateTime now) {
  final hour = now.hour;
  if (hour >= 6 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/// Metadatos visuales de una categoría de incidente.
typedef CategoryMeta = ({
  String label,
  String examples,
  IconData icon,
  Color color,
  IncidentPriority priority,
});

CategoryMeta categoryMeta(IncidentCategory c) => switch (c) {
      IncidentCategory.sos => const (
          label: 'SOS · Vida en riesgo',
          examples: 'Persona en peligro inmediato',
          icon: Icons.emergency_outlined,
          color: AppColors.danger,
          priority: IncidentPriority.p0,
        ),
      IncidentCategory.medical => const (
          label: 'Emergencia médica',
          examples: 'Lesión o problema de salud urgente',
          icon: Icons.medical_services_outlined,
          color: AppColors.warning,
          priority: IncidentPriority.p1,
        ),
      IncidentCategory.person => const (
          label: 'Persona / ubicación',
          examples: 'Extravío, colisión o reunificación',
          icon: Icons.person_pin_circle_outlined,
          color: AppColors.info,
          priority: IncidentPriority.p2,
        ),
      IncidentCategory.hazard => const (
          label: 'Peligro / infraestructura',
          examples: 'Fuga, corte o estructura inestable',
          icon: Icons.warning_amber_outlined,
          color: AppColors.success,
          priority: IncidentPriority.p3,
        ),
      IncidentCategory.coordination => const (
          label: 'Coordinación',
          examples: 'Punto de reunión o aviso preventivo',
          icon: Icons.groups_outlined,
          color: AppColors.celadon500,
          priority: IncidentPriority.p4,
        ),
    };

/// Etiqueta corta de prioridad, p. ej. `P2 · Incidente activo`.
String priorityShortLabel(IncidentPriority p) => switch (p) {
      IncidentPriority.p0 => 'P0 · Crítica',
      IncidentPriority.p1 => 'P1 · Grave',
      IncidentPriority.p2 => 'P2 · Activa',
      IncidentPriority.p3 => 'P3 · Menor',
      IncidentPriority.p4 => 'P4 · Observación',
      IncidentPriority.p5 => 'P5 · Multimedia',
    };

Color priorityColor(IncidentPriority p, VacaTokens tokens) => switch (p) {
      IncidentPriority.p0 => tokens.danger,
      IncidentPriority.p1 => tokens.danger,
      IncidentPriority.p2 => tokens.info,
      IncidentPriority.p3 => tokens.warning,
      IncidentPriority.p4 => tokens.success,
      IncidentPriority.p5 => tokens.muted,
    };

/// Etiqueta honesta del estado local de una señal.
String incidentStatusLabel(IncidentStatus s) => switch (s) {
      IncidentStatus.draft => 'Borrador',
      IncidentStatus.savedLocally => 'Guardada localmente',
      IncidentStatus.queued => 'En cola',
      IncidentStatus.relaying => 'Reenviando',
      IncidentStatus.uploading => 'Enviando',
      IncidentStatus.receivedByServer => 'Recibida',
      IncidentStatus.acknowledgedInstitutionally => 'Confirmada',
      IncidentStatus.cancelledLocally => 'Cancelada',
      IncidentStatus.cancellationQueued => 'Cancelando',
      IncidentStatus.cancellationReceived => 'Cancelada',
      IncidentStatus.expired => 'Expirada',
      IncidentStatus.failedRetryable => 'Reintentable',
    };

/// Tono semántico para el estado de una señal.
Color incidentStatusColor(IncidentStatus s, VacaTokens tokens) => switch (s) {
      IncidentStatus.draft => tokens.muted,
      IncidentStatus.savedLocally => tokens.muted,
      IncidentStatus.queued => tokens.warning,
      IncidentStatus.relaying => tokens.info,
      IncidentStatus.uploading => tokens.info,
      IncidentStatus.receivedByServer => tokens.success,
      IncidentStatus.acknowledgedInstitutionally => tokens.success,
      IncidentStatus.cancelledLocally => tokens.muted,
      IncidentStatus.cancellationQueued => tokens.warning,
      IncidentStatus.cancellationReceived => tokens.muted,
      IncidentStatus.expired => tokens.muted,
      IncidentStatus.failedRetryable => tokens.danger,
    };
