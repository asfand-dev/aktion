package dev.aktion.jetbrains

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.server.CannotStartProcessException
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider

/**
 * Starts `node <plugin>/server/server.mjs --stdio`.
 *
 * The server is the repo's own `editors/lsp` bundle, which wraps the DOM-free
 * `aktion-runtime/language` surface — the identical analysis the VS Code
 * extension runs in-process. That is the whole point of the LSP indirection:
 * there is one parser and one schema validator for Aktion, and this plugin does
 * not contain a second copy of either.
 */
class AktionLanguageServerProvider(private val project: Project) : OSProcessStreamConnectionProvider() {

    @Throws(CannotStartProcessException::class)
    override fun start() {
        val node = AktionServerAssets.nodeExecutable()
        if (node == null) {
            notifyMissingNode()
            throw CannotStartProcessException(
                "Aktion: no Node.js interpreter found. Install Node 18 or newer, or set its path " +
                    "in Settings → Languages & Frameworks → Aktion.",
            )
        }

        val server = AktionServerAssets.serverScript()
            ?: throw CannotStartProcessException(
                "Aktion: the bundled language server is missing. Reinstall the plugin, or point " +
                    "Settings → Languages & Frameworks → Aktion at a checkout's " +
                    "editors/lsp/dist/server.mjs.",
            )

        val commandLine = GeneralCommandLine(node.absolutePath, server.absolutePath, "--stdio")
            .withWorkDirectory(project.basePath)
            .withCharset(Charsets.UTF_8)
        if (AktionSettings.getInstance().trace) {
            commandLine.withEnvironment("AKTION_LSP_TRACE", "1")
        }
        setCommandLine(commandLine)

        super.start()
    }

    /**
     * A missing Node interpreter is the one failure a user can actually fix, and
     * it is invisible otherwise (the LSP console is not somewhere people look).
     * Surface it with a one-click route to the setting.
     */
    private fun notifyMissingNode() {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification(
                "Aktion language support is inactive",
                "Node.js 18 or newer is required to run the Aktion language server.",
                NotificationType.WARNING,
            )
            .addAction(
                NotificationAction.createSimpleExpiring("Configure Node path…") {
                    ShowSettingsUtil.getInstance()
                        .showSettingsDialog(project, AktionSettingsConfigurable::class.java)
                },
            )
            .notify(project)
    }

    companion object {
        const val NOTIFICATION_GROUP: String = "Aktion"
    }
}
