import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'enums.dart';
import 'tables.dart';

// Generado por build_runner (paso 4 de SETUP.md): `dart run build_runner build`.
part 'database.g.dart';

/// Base de datos local de VACA (offline-first).
///
/// Almacena perfiles de identidad, incidentes, eventos append-only,
/// adjuntos, bundles de transporte, intentos de entrega y recibos del servidor.
@DriftDatabase(
  tables: [
    IdentityProfiles,
    Incidents,
    IncidentEvents,
    Attachments,
    OriginBundles,
    DeliveryAttempts,
    ServerReceipts,
    Tombstones,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? _openConnection());

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (migrator) => migrator.createAll(),
        onUpgrade: (migrator, from, to) async {
          if (from < 2) {
            await migrator.addColumn(originBundles, originBundles.retryCount);
            await migrator.addColumn(
              originBundles,
              originBundles.nextAttemptAt,
            );
            await migrator.addColumn(
              originBundles,
              originBundles.lastErrorCode,
            );
          }
        },
      );

  static QueryExecutor _openConnection() {
    // drift_flutter maneja la ruta del archivo y las libs nativas de SQLite.
    return driftDatabase(name: 'vaca_db');
  }
}
