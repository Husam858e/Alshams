import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appVersionName = "2.2.0"

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
        versionCode = 6
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

// The offline demo runs the real staff app and projector player, so the web UIs
// and the browser libraries they import are copied into the APK at build time
// (never committed under src/main/assets). Asset paths mirror the server's URLs:
// /shared, /app, /player, /vendor/{preact,htm,three,qrcode} (see src/app.js),
// plus /vendor/firebase for cloud mode.
val webRoot = rootProject.file("..")
val nodeModules = File(webRoot, "node_modules")
val nativeAssets = file("src/main/assets")

// Firebase SDK modules the cloud backend imports (assets/cloud/backend/).
val firebaseModules = listOf("app", "auth", "firestore", "storage")

/**
 * The cloud pages' import maps are static HTML, so they name the SDK version in
 * the gstatic URLs the SDK files import each other with. Fail the build when an
 * `npm install` moved node_modules/firebase to another version than the one the
 * pages map (test/android-cloud-assets.test.js checks the same, in more detail).
 */
fun checkFirebaseImportMaps() {
    val version = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
        .find(File(nodeModules, "firebase/package.json").readText())?.groupValues?.get(1)
        ?: throw GradleException("node_modules/firebase/package.json has no version")
    for (page in listOf("cloud/app.html", "cloud/player.html")) {
        val html = File(nativeAssets, page).readText()
        for (module in firebaseModules) {
            val url = "https://www.gstatic.com/firebasejs/$version/firebase-$module.js"
            if (!html.contains("\"$url\": \"/vendor/firebase/firebase-$module.js\"")) {
                throw GradleException(
                    "assets/$page does not map $url to /vendor/firebase/firebase-$module.js: " +
                        "update its import map to firebase $version (node_modules/firebase).",
                )
            }
        }
    }
}

val copyWebAssets = tasks.register<Sync>("copyWebAssets") {
    description = "Copies public/{shared,app,player} and their vendor libraries into the APK assets."
    into(layout.buildDirectory.dir("generated/webAssets"))
    from(File(webRoot, "public")) {
        include("shared/**", "app/**", "player/**")
    }
    from(File(nodeModules, "preact")) {
        include("dist/**", "hooks/dist/**", "LICENSE")
        into("vendor/preact")
    }
    from(File(nodeModules, "htm")) {
        include("dist/**", "preact/**", "LICENSE")
        into("vendor/htm")
    }
    // three.module.js re-exports three.core.js; GLTFLoader needs BufferGeometryUtils.
    from(File(nodeModules, "three")) {
        include(
            "build/three.module.js",
            "build/three.core.js",
            "examples/jsm/loaders/GLTFLoader.js",
            "examples/jsm/utils/BufferGeometryUtils.js",
            "LICENSE",
        )
        into("vendor/three")
    }
    // MIT, with its licence header inside the file (the package ships no LICENSE).
    from(File(nodeModules, "qrcode-generator/dist")) {
        include("qrcode.mjs")
        into("vendor/qrcode")
    }
    // Cloud mode (assets/cloud/): the Firebase SDK's browser ES modules (the files
    // gstatic.com serves). They import each other by their gstatic URL, which the
    // cloud pages' import maps send back to these copies: nothing loads from gstatic.
    from(File(nodeModules, "firebase")) {
        // Apache-2.0, with the licence header inside each file (no LICENSE in the package).
        include(firebaseModules.map { "firebase-$it.js" })
        into("vendor/firebase")
    }
    exclude("**/*.map", "**/*.d.ts", "**/.DS_Store")
    // checkFirebaseImportMaps reads them: a changed page must re-run this task.
    inputs.files(File(nativeAssets, "cloud/app.html"), File(nativeAssets, "cloud/player.html"))
    doFirst {
        val missing = listOf("preact", "htm", "three", "qrcode-generator", "firebase").filterNot { File(nodeModules, "$it/package.json").isFile }
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Missing node_modules: ${missing.joinToString()}. Run `npm install` in ${webRoot.canonicalPath} " +
                    "first: the APK's offline demo bundles the web UIs and these libraries.",
            )
        }
        checkFirebaseImportMaps()
    }
    // The setup/offline pages also live in assets/app/: a web file with the same
    // path would silently replace one of them (or break asset merging).
    eachFile {
        if (File(nativeAssets, path).exists()) {
            throw GradleException("public/$path collides with android/app/src/main/assets/$path: rename one of them.")
        }
    }
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
