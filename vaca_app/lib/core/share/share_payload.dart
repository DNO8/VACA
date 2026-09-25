import '../../data/local/database.dart';
import '../format/vaca_format.dart';

/// Resumen compartible de una señal con su estado de entrega.
String signalShareText({
  required String incidentId,
  required String categoryLabel,
  required String statusLabel,
  double? latitude,
  double? longitude,
  required DateTime createdAt,
  String? shortNote,
  ServerReceipt? receipt,
}) {
  final buffer = StringBuffer()
    ..writeln('VACA — Señal de incidente')
    ..writeln('ID: $incidentId')
    ..writeln('Tipo: $categoryLabel')
    ..writeln('Estado: $statusLabel')
    ..writeln('Creada: ${vacaTimestamp(createdAt)}');
  if (latitude != null && longitude != null) {
    buffer.writeln(
      'Ubicación: ${latitude.toStringAsFixed(5)}, '
      '${longitude.toStringAsFixed(5)}',
    );
  }
  final note = shortNote?.trim();
  if (note != null && note.isNotEmpty) {
    buffer.writeln('Nota: $note');
  }
  if (receipt != null) {
    buffer
      ..writeln()
      ..writeln('Recepción verificada por el servidor:')
      ..writeln('  Recibo: ${receipt.receiptId}')
      ..writeln('  Recibido en: ${vacaTimestamp(receipt.serverReceivedAt)}')
      ..writeln('  Hash del payload: ${receipt.payloadHash}');
  }
  buffer
    ..writeln()
    ..writeln(
      'VACA es coordinación comunitaria; no reemplaza los canales '
      'oficiales de emergencia.',
    );
  return buffer.toString();
}
