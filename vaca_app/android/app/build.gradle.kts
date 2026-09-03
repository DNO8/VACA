plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "cl.vaca.vaca_app"
    // Desde el 31 de agosto de 2026, apps y actualizaciones en Google Play
    // requieren targetSdkVersion >= 36 (Android 16).
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "cl.vaca.vaca_app"
        // VACA requiere Android 8.0+ (API 26) — alineado con el SOW y con la
        // futura interoperabilidad mesh (bitchat-android usa API 26+).
        minSdk = 26
        // Google Play exige targetSdkVersion >= 36 (Android 16) desde el 31/08/2026.
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "track"

    productFlavors {
        create("dev") {
            dimension = "track"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "VACA Dev")
        }
        create("public") {
            dimension = "track"
            resValue("string", "app_name", "VACA")
        }
        create("municipalPilot") {
            dimension = "track"
            applicationIdSuffix = ".pilot"
            resValue("string", "app_name", "VACA Piloto")
        }
    }

    dependencies {
        // Requerido por camera_android_camerax para evitar symbol resolution error.
        // camera_android_camerax upstream 0.7.4+6 declaro 1.2.0.
        implementation("androidx.concurrent:concurrent-futures:1.2.0")
    }

    packaging {
        resources {
            pickFirsts += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
