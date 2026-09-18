import '../../data/local/database.dart';
import '../format/vaca_format.dart';

/// Texto auditable de un recibo firmado.
///
/// El recibo es una prueba verificable de recepción: compartirlo permite que
/// un tercero (donante, aseguradora, respondedor) valide la entrega sin
/// necesitar la app. Incluye todos los campos que atan la firma al evento.
String receiptShareText(ServerReceipt receipt) {
  final buffer = StringBuffer()
    ..writeln('VACA — Comprobante de recepción verificada')
    ..writeln('ID de señal: ${receipt.messageId}')
    ..writeln('ID de recibo: ${receipt.receiptId}')
    ..writeln('Recibido en: ${vacaTimestamp(receipt.serverReceivedAt)}')
    ..writeln('Clave del servidor: ${receipt.serverKeyId}')
    ..writeln('Hash del payload: ${receipt.payloadHash}')
    ..writeln('Firma: ${receipt.signature}');
  if (receipt.verifiedAt != null) {
    buffer.writeln('Verificada en: ${vacaTimestamp(receipt.verifiedAt!)}');
  }
  buffer
    ..writeln()
    ..writeln(
      'Este comprobante confirma recepción técnica por el servidor '
      'autorizado. No garantiza atención ni reemplaza los canales '
      'oficiales de emergencia.',
    );
  return buffer.toString();
}

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
