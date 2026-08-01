import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.20"
    id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

kotlin {
    jvmToolchain(21)
}

dependencies {
    testImplementation(kotlin("test"))

    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion"),
        )

        // TextMate supplies lexical colouring; see AktionTextMateBundleProvider.
        bundledPlugins(providers.gradleProperty("platformBundledPlugins").map { it.split(',') })

        // LSP4IJ — the LSP client. Chosen over the platform's own LSP API because
        // that one is Ultimate-tier only (and was still being renamed as of
        // 2026.2), whereas LSP4IJ works in every IDE from 2024.2 up, including
        // the Community editions. See docs/README.md § Architecture.
        plugins(providers.gradleProperty("platformPlugins").map { it.split(',') })

        testFramework(TestFrameworkType.Platform)
    }
}

intellijPlatform {
    pluginConfiguration {
        version = providers.gradleProperty("pluginVersion")

        // The Marketplace listing text is the <!-- Plugin description --> block of
        // README.md, so the store page and the repo can never disagree.
        description = providers.fileContents(layout.projectDirectory.file("README.md")).asText.map {
            val start = "<!-- Plugin description -->"
            val end = "<!-- Plugin description end -->"
            with(it.lines()) {
                if (!containsAll(listOf(start, end))) {
                    throw GradleException("Plugin description section not found in README.md:\n$start … $end")
                }
                subList(indexOf(start) + 1, indexOf(end)).joinToString("\n")
            }
        }

        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            // Deliberately unbounded: the plugin only touches stable platform +
            // LSP4IJ APIs, so pinning an untilBuild would strand users on every
            // IDE upgrade for no benefit.
            untilBuild = provider { null }
        }
    }

    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = providers.environmentVariable("PUBLISH_TOKEN")
        // A SemVer pre-release label (0.6.0-beta.1) publishes to the matching
        // Marketplace channel automatically; a plain version goes to `default`.
        channels = providers.gradleProperty("pluginVersion")
            .map { listOf(it.substringAfter('-', "").substringBefore('.').ifEmpty { "default" }) }
    }

    pluginVerification {
        ides {
            recommended()
        }
    }
}

/**
 * Regenerate the two assets this plugin ships but does not author:
 *
 *   - `server/server.mjs`   — the bundled Aktion language server (editors/lsp)
 *   - `textmate/bundles/…`  — the TextMate grammar, generated from the runtime's
 *                             own builtin catalog (same source as VS Code)
 *
 * Both come from the repo root, so a plugin build can never ship a grammar or a
 * server that disagrees with the runtime. Node is a hard requirement for this
 * task only — not for anyone merely *using* the built plugin.
 */
val syncAssets by tasks.registering(Exec::class) {
    group = "aktion"
    description = "Bundle the Aktion language server + TextMate grammar into src resources."
    workingDir = layout.projectDirectory.asFile
    commandLine("node", "scripts/sync-assets.mjs")
    inputs.file(layout.projectDirectory.file("scripts/sync-assets.mjs"))
    outputs.dir(layout.projectDirectory.dir("server"))
    outputs.dir(layout.projectDirectory.dir("textmate"))
}

tasks {
    // `PluginPathManager.getPluginResource` resolves paths relative to the
    // plugin's install directory, so these two folders must ship UNPACKED next
    // to `lib/` rather than inside the jar.
    prepareSandbox {
        dependsOn(syncAssets)
        from(layout.projectDirectory.dir("server")) {
            into(pluginName.map { "$it/server" })
        }
        from(layout.projectDirectory.dir("textmate")) {
            into(pluginName.map { "$it/textmate" })
        }
    }

    buildPlugin {
        dependsOn(syncAssets)
    }

    wrapper {
        gradleVersion = providers.gradleProperty("gradleVersion").get()
    }
}
