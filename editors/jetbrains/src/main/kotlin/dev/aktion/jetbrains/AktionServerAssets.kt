package dev.aktion.jetbrains

import com.intellij.openapi.application.PluginPathManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.util.SystemInfo
import java.io.File

/**
 * Locates the two things the plugin needs at runtime: a Node interpreter and the
 * bundled `server.mjs`.
 *
 * Both are resolved lazily, on server start, rather than at plugin load — a user
 * who installs Node *after* installing the plugin should only have to restart the
 * language server, not the IDE.
 */
object AktionServerAssets {
    private val LOG = logger<AktionServerAssets>()

    /**
     * The bundled language server. `PluginPathManager.getPluginResource` resolves
     * against the plugin's install directory, which is why `build.gradle.kts`
     * copies `server/` in unpacked (via `prepareSandbox`) instead of letting it
     * end up inside the jar.
     */
    fun serverScript(): File? {
        AktionSettings.getInstance().serverPath?.let { override ->
            val file = File(override)
            if (file.isFile) return file
            LOG.warn("Configured Aktion server path does not exist: $override")
        }

        val bundled = PluginPathManager.getPluginResource(javaClass, "server/server.mjs")
        if (bundled != null && bundled.isFile) return bundled

        LOG.warn("Bundled Aktion language server not found (expected <plugin>/server/server.mjs)")
        return null
    }

    /**
     * Find a Node interpreter.
     *
     * Deliberately does NOT depend on the JavaScript/NodeJS plugins: those are
     * absent from IntelliJ IDEA Community and several other IDEs, and taking a
     * hard dependency on them would shrink the plugin's reach for no gain.
     *
     * Order: explicit setting → `PATH` → the version-manager and package-manager
     * locations that a GUI-launched IDE routinely cannot see, because macOS and
     * Linux desktop sessions do not source a login shell.
     */
    fun nodeExecutable(): File? {
        AktionSettings.getInstance().nodePath?.let { override ->
            val file = File(override)
            if (file.canExecute()) return file
            LOG.warn("Configured Node path is not executable: $override")
        }

        for (candidate in candidatePaths()) {
            val file = File(candidate)
            if (file.canExecute() && file.isFile) return file
        }
        return null
    }

    private fun candidatePaths(): List<String> {
        val exe = if (SystemInfo.isWindows) "node.exe" else "node"
        val fromPath = (System.getenv("PATH") ?: "")
            .split(File.pathSeparatorChar)
            .filter { it.isNotBlank() }
            .map { "$it${File.separator}$exe" }

        if (SystemInfo.isWindows) {
            return fromPath + listOf(
                "C:\\Program Files\\nodejs\\node.exe",
                "C:\\Program Files (x86)\\nodejs\\node.exe",
            )
        }

        val home = System.getProperty("user.home") ?: ""
        val wellKnown = listOf(
            "/opt/homebrew/bin/node",      // Homebrew on Apple silicon
            "/usr/local/bin/node",          // Homebrew on Intel / manual installs
            "/usr/bin/node",
            "$home/.local/share/fnm/aliases/default/bin/node",
            "$home/.volta/bin/node",
            "$home/.asdf/shims/node",
            "$home/.bun/bin/node",
            "$home/.nvm/versions/node/current/bin/node",
        )
        // nvm has no stable "current" symlink, so probe its version directories
        // newest-first — the alternative is telling every nvm user to fill in a
        // setting, which is a poor first-run experience.
        val nvmVersions = File("$home/.nvm/versions/node")
            .takeIf { it.isDirectory }
            ?.listFiles { f: File -> f.isDirectory }
            ?.sortedByDescending { it.name }
            ?.map { "${it.absolutePath}/bin/node" }
            ?: emptyList()

        return fromPath + wellKnown + nvmVersions
    }
}
