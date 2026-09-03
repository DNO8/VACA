import 'dart:typed_data';

import 'transport.dart';

/// Contrato del servidor para entrega de bundles por Internet.
///
/// Abstrae el mecanismo de transporte real (Supabase Edge Function,
/// HTTP directo, etc.) para que [InternetTransport] no dependa de un
/// SDK concreto.
abstract class ServerContract {
  /// Envía el bundle [payload] al servidor.
  ///
  /// [messageId] es el identificador del bundle y [originPublicKey] es la
  /// clave pública Ed25519 del dispositivo, usada por el servidor para
  /// verificar la firma del bundle.
  ///
  /// Devuelve [DeliveryState.delivered] si el servidor aceptó el bundle y
  /// devolvió un recibo verificable; [DeliveryState.failed] si el intento
  /// falló o el recibo no pudo verificarse; [DeliveryState.queued] si el
  /// transporte no pudo intentarlo por falta de conectividad.
  Future<DeliveryResult> sendBundle(
    String messageId,
    Uint8List payload,
    Uint8List originPublicKey,
  );

  /// Solicita URL firmada para subir un adjunto resumible.
  ///
  /// Devuelve `null` si el servidor no permite adjuntos o si no esta
  /// configurado.
  Future<String?> requestAttachmentUrl(
    String bundleId,
    String contentHash,
  );
}
