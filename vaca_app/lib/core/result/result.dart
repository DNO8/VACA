/// Resultado tipado para operaciones que pueden fallar.
///
/// Evita excepciones no controladas en la capa de dominio.
sealed class Result<T> {
  const Result();

  bool get isSuccess => this is Success<T>;
  bool get isFailure => this is Failure<T>;

  T? get valueOrNull => switch (this) {
        Success(value: final v) => v,
        Failure() => null,
      };

  VacaError? get errorOrNull => switch (this) {
        Failure(error: final e) => e,
        Success() => null,
      };
}

final class Success<T> extends Result<T> {
  const Success(this.value);

  final T value;
}

final class Failure<T> extends Result<T> {
  const Failure(this.error);

  final VacaError error;
}

/// Error de dominio. No almacena datos sensibles.
class VacaError {
  const VacaError({
    required this.code,
    this.message,
    this.cause,
  });

  final String code;
  final String? message;
  final Object? cause;

  @override
  String toString() => 'VacaError[$code]: $message';
}
