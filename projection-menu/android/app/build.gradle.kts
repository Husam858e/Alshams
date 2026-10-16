import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appVersionName = "0.1.0"

// Release signing: android/keystore.properties (gitignored) with storeFile,
// storePassword, keyAlias, keyPassword. Without it, release builds are signed
// with the debug key so `assembleRelease` always yields an installable APK.
val keystoreFile = rootProject.file("keystore.properties")
val keystore = Properties().apply {
    if (keystoreFile.exists()) keystoreFile.inputStream().use(::load)
}

android {
    namespace = "com.alshams.projectionmenu"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.alshams.projectionmenu"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = appVersionName
    }

    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        abortOnError = true
        // "Newer version available" notices: SDK, Gradle and library versions are
        // pinned deliberately (they must resolve in the offline build environment).
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "OldTargetApi")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// APK name: ProjectionMenu-<versionName>-<buildType>.apk
base {
    archivesName.set("ProjectionMenu-$appVersionName")
}

// The offline demo runs the real tablet/player code, so public/{shared,tablet,player}
// is copied into the APK at build time (never committed under src/main/assets).
val copyWebAssets = tasks.register<Sync>("copyWebAssets") {
    from(rootProject.file("../public")) {
        include("shared/**", "tablet/**", "player/**")
    }
    into(layout.buildDirectory.dir("generated/webAssets"))
}
android.sourceSets.getByName("main").assets.srcDir(copyWebAssets)
// Asset merging and the lint model read the assets dirs directly, for every
// variant; Gradle's implicit-dependency check fails the build if one is missed.
tasks.configureEach {
    if (name.matches(Regex("merge\\w*Assets")) || name.contains("lint", ignoreCase = true)) {
        dependsOn(copyWebAssets)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")

    testImplementation("junit:junit:4.13.2")
}
