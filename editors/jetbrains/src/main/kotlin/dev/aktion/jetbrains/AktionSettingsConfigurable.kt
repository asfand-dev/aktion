package dev.aktion.jetbrains

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.RowLayout
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel

/**
 * Settings → Languages & Frameworks → Aktion.
 *
 * Every field is an escape hatch, not a requirement: the plugin auto-detects Node
 * and ships its own server. The Node field exists because a GUI-launched IDE on
 * macOS/Linux does not source a login shell, so `nvm`/`fnm`/`asdf`/Volta
 * installs are frequently invisible to it — and "nothing works and I can't tell
 * why" is the worst possible first run.
 */
class AktionSettingsConfigurable : BoundConfigurable("Aktion") {

    override fun createPanel(): DialogPanel {
        val settings = AktionSettings.getInstance()

        return panel {
            row("Node interpreter:") {
                cell(nodeChooser())
                    .align(com.intellij.ui.dsl.builder.AlignX.FILL)
                    .resizableColumn()
                    .bindText(
                        getter = { settings.nodePath ?: "" },
                        setter = { settings.nodePath = it },
                    )
            }.layout(RowLayout.LABEL_ALIGNED)
            row {
                comment(
                    "Leave empty to auto-detect. Detection order: PATH, then Homebrew, " +
                        "fnm, Volta, asdf, and nvm locations. Node 18 or newer is required.",
                )
            }

            separator()

            row("Language server script:") {
                cell(serverChooser())
                    .align(com.intellij.ui.dsl.builder.AlignX.FILL)
                    .resizableColumn()
                    .bindText(
                        getter = { settings.serverPath ?: "" },
                        setter = { settings.serverPath = it },
                    )
            }.layout(RowLayout.LABEL_ALIGNED)
            row {
                comment(
                    "Leave empty to use the server bundled with this plugin. Point it at a " +
                        "checkout's <code>editors/lsp/dist/server.mjs</code> when working on the " +
                        "language service itself.",
                )
            }

            separator()

            row {
                checkBox("Log the LSP protocol trace to the server's console")
                    .bindSelected(
                        getter = { settings.trace },
                        setter = { settings.trace = it },
                    )
            }
            row {
                comment(
                    "Shown in the <b>Language Servers</b> tool window. Restart the Aktion " +
                        "server after changing this.",
                )
            }
        }
    }

    private fun nodeChooser(): TextFieldWithBrowseButton {
        val field = TextFieldWithBrowseButton(JBTextField())
        field.addBrowseFolderListener(
            "Select the Node.js Interpreter",
            "Path to the node executable used to run the Aktion language server.",
            null,
            FileChooserDescriptorFactory.createSingleFileNoJarsDescriptor(),
        )
        return field
    }

    private fun serverChooser(): TextFieldWithBrowseButton {
        val field = TextFieldWithBrowseButton(JBTextField())
        field.addBrowseFolderListener(
            "Select the Aktion Language Server",
            "Path to server.mjs — normally left empty so the bundled server is used.",
            null,
            FileChooserDescriptorFactory.createSingleFileNoJarsDescriptor(),
        )
        return field
    }
}
