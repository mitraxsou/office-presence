plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pwc.officepresence"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.pwc.officepresence"
        minSdk = 26
        targetSdk = 34
        versionCode = 8
        versionName = "2.0.0"
        buildConfigField("String", "API_BASE_URL", "\"https://office-presence-psi.vercel.app\"")
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"https://office-presence-psi.vercel.app\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE_URL", "\"https://office-presence-psi.vercel.app\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.coordinatorlayout:coordinatorlayout:1.2.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
