import 'package:dio/dio.dart';

import '../../../core/result/result.dart';

/// Item del feed público de Vaquitas (coordenadas ya fuzzeadas en servidor).
class VaquitaFeedItem {
  const VaquitaFeedItem({
    required this.incidentId,
    required this.category,
    required this.peopleCount,
    required this.latitude,
    required this.longitude,
    required this.donationStatus,
    required this.createdAt,
  });

  final String incidentId;
  final String category;
  final int? peopleCount;
  final double? latitude;
  final double? longitude;

  /// `signal` | `community` | `vaquita`.
  final String donationStatus;
  final DateTime? createdAt;

  bool get isPromoted =>
      donationStatus == 'community' || donationStatus == 'vaquita';
  bool get isVerified => donationStatus == 'vaquita';

  static VaquitaFeedItem? tryParse(Map<String, dynamic> json) {
    final id = json['id'];
    final category = json['category'];
    if (id is! String || category is! String) return null;
    return VaquitaFeedItem(
      incidentId: id,
      category: category,
      peopleCount: json['peopleCount'] is int ? json['peopleCount'] as int : null,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      donationStatus: json['donationStatus'] is String
          ? json['donationStatus'] as String
          : 'signal',
      createdAt: json['createdAt'] is String
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }
}

/// Lee el feed público `vaquita-feed` del backend.
///
/// El estado "incidente promovido" es autoritativo en el servidor: la app lo
/// descubre en el próximo sync cuando vuelve conectividad. Sin push.
class VaquitaFeedService {
  VaquitaFeedService({
    String? supabaseUrl,
    String? supabaseAnonKey,
    Dio? httpClient,
  })  : _supabaseUrl = supabaseUrl,
        _supabaseAnonKey = supabaseAnonKey,
        _http = httpClient ?? Dio();

  final String? _supabaseUrl;
  final String? _supabaseAnonKey;
  final Dio _http;

  Future<Result<List<VaquitaFeedItem>>> fetchFeed() async {
    final url = _supabaseUrl;
    final key = _supabaseAnonKey;
    if (url == null || url.isEmpty || key == null || key.isEmpty) {
      return const Failure(
        VacaError(
          code: 'vaquita_feed_config',
          message: 'Sin configuración del servidor.',
        ),
      );
    }
    try {
      final response = await _http.get<Map<String, dynamic>>(
        '$url/functions/v1/vaquita-feed',
        options: Options(headers: {'apikey': key}),
      );
      final rows = response.data?['incidents'];
      if (rows is! List) {
        return const Success(<VaquitaFeedItem>[]);
      }
      return Success(
        rows
            .whereType<Map<String, dynamic>>()
            .map(VaquitaFeedItem.tryParse)
            .whereType<VaquitaFeedItem>()
            .toList(),
      );
    } on DioException catch (error) {
      return Failure(
        VacaError(
          code: 'vaquita_feed_http',
          message: 'No se pudo cargar la lista de Vaquitas.',
          cause: error,
        ),
      );
    }
  }
}
