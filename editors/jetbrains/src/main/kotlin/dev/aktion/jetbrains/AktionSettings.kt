package dev.aktion.jetbrains

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

/**
 * Application-level settings for the Aktion plugin.
 *
 * Three knobs, all optional — the defaults work on a normal developer machine:
 *
 *  - [nodePath]   override the Node interpreter used to run the language server.
 *                 Needed when Node is installed somewhere the IDE's inherited
 *                 `PATH` cannot see, which is the usual story for `nvm`, `fnm`,
 *                 `asdf`, and Volta on macOS GUI launches.
 *  - [serverPath] point at a checkout's `editors/lsp/dist/server.mjs` instead of
 *                 the copy bundled in the plugin — the plugin-development loop.
 *  - [trace]      ask the server to log every JSON-RPC message to the LSP4IJ
 *                 console (LSP4IJ shows it under *Language Servers*).
 */
@State(name = "AktionSettings", storages = [Storage("aktion.xml")])
class AktionSettings : SimplePersistentStateComponent<AktionSettings.State>(State()) {

    class State : BaseState() {
        var nodePath by string()
        var serverPath by string()
        var trace by property(false)
    }

    var nodePath: String?
        get() = state.nodePath?.trim()?.ifEmpty { null }
        set(value) {
            state.nodePath = value?.trim()?.ifEmpty { null }
        }

    var serverPath: String?
        get() = state.serverPath?.trim()?.ifEmpty { null }
        set(value) {
            state.serverPath = value?.trim()?.ifEmpty { null }
        }

    var trace: Boolean
        get() = state.trace
        set(value) {
            state.trace = value
        }

    companion object {
        fun getInstance(): AktionSettings = service()
    }
}
