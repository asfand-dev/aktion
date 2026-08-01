rootProject.name = "aktion-jetbrains"

pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}

plugins {
    // Contributes the `intellijPlatform { … }` repository helper below.
    id("org.jetbrains.intellij.platform.settings") version "2.18.1"
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositories {
        mavenCentral()

        // IntelliJ Platform artifacts + the JetBrains Marketplace (for LSP4IJ).
        intellijPlatform {
            defaultRepositories()
        }
    }
}
