package dev.aktion.jetbrains

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider

/**
 * Wires the Aktion language server into LSP4IJ.
 *
 * Everything the plugin offers — diagnostics, hover, completion, signature help,
 * go-to-definition (including across `import { … } from "./other.aktion"`), find
 * usages, rename, structure view, formatting, and semantic colouring — is a
 * capability the *server* advertises during `initialize`. There is deliberately
 * no per-feature Kotlin here: adding a capability to `src/tooling/*` in the
 * runtime lights it up in this plugin and in VS Code at the same time, with no
 * editor-side change. LSP4IJ's defaults already enable every feature the server
 * declares, so overriding `createClientFeatures()` would only add ways to drift.
 */
class AktionLanguageServerFactory : LanguageServerFactory {

    override fun createConnectionProvider(project: Project): StreamConnectionProvider =
        AktionLanguageServerProvider(project)
}
