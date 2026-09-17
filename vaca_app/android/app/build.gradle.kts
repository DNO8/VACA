import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val adMobAppId = providers.gradleProperty("ADMOB_APP_ID")
    .orElse(providers.environmentVariable("ADMOB_APP_ID"))
    .orNull
val buildsPublicRelease = gradle.startParameter.taskNames.any {
    it.contains("PublicRelease", ignoreCase = true)
}
val googleTestAdMobAppId = "ca-app-pub-3940256099942544~3347511713"
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use(keystoreProperties::load)
}
if (buildsPublicRelease) {
    require(keystorePropertiesFile.exists()) {
        "android/key.properties is required for public release signing."
    }
    listOf("storeFile", "storePassword", "keyAlias", "keyPassword").forEach { key ->
        require(!keystoreProperties.getProperty(key).isNullOrBlank()) {
            "Missing $key in android/key.properties."
        }
    }
}

android {
    namespace = "cl.vaca.app"
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
        applicationId = "cl.vaca.app"
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
            manifestPlaceholders["adMobAppId"] = googleTestAdMobAppId
            resValue("string", "app_name", "VACA Dev")
        }
        create("public") {
            dimension = "track"
            if (buildsPublicRelease && adMobAppId.isNullOrBlank()) {
                throw GradleException(
                    "ADMOB_APP_ID is required for public release builds.",
                )
            }
            manifestPlaceholders["adMobAppId"] = adMobAppId ?: googleTestAdMobAppId
            resValue("string", "app_name", "VACA")
        }
        create("municipalPilot") {
            dimension = "track"
            applicationIdSuffix = ".pilot"
            manifestPlaceholders["adMobAppId"] = googleTestAdMobAppId
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

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

flutter {
    source = "../.."
}
