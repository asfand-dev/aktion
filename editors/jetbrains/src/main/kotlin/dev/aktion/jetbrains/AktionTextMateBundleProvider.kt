package dev.aktion.jetbrains

import com.intellij.openapi.application.PluginPathManager
import com.intellij.openapi.diagnostic.logger
import org.jetbrains.plugins.textmate.api.TextMateBundleProvider

/**
 * Registers the bundled Aktion TextMate grammar so `.aktion` files get lexical
 * colouring (comments, strings, numbers, keywords) the moment they open —
 * before, and independently of, the language server starting.
 *
 * Why TextMate rather than a custom `FileType` + Kotlin lexer:
 *
 *  1. Registering a `FileType` for `*.aktion` would *disable* TextMate for those
 *     files, which is why LSP4IJ recommends `fileNamePatternMapping` (see
 *     `plugin.xml`) for exactly this case.
 *  2. A Kotlin lexer would be a second, hand-maintained model of Aktion's
 *     vocabulary. The grammar shipped here is generated from the runtime's own
 *     `builtinCatalog` + `grammarSpec` by `scripts/sync-assets.mjs`, so a new
 *     `$`-builtin colours correctly in this plugin and in VS Code from one
 *     source of truth.
 *
 * Semantic precision on top of this (library component vs. your own component,
 * builtin vs. reactive atom) comes from the server's semantic tokens — see
 * [AktionSemanticTokensColorsProvider].
 *
 * The bundle ships UNPACKED next to the plugin's `lib/` (see `prepareSandbox` in
 * `build.gradle.kts`), because `getPluginResource` hands back a filesystem path.
 * If it is missing we degrade to semantic-tokens-only colouring rather than
 * failing plugin load.
 */
class AktionTextMateBundleProvider : TextMateBundleProvider {
    private val log = logger<AktionTextMateBundleProvider>()

    override fun getBundles(): List<TextMateBundleProvider.PluginBundle> {
        val bundle = PluginPathManager.getPluginResource(javaClass, "textmate/bundles/aktion")
        if (bundle == null || !bundle.isDirectory) {
            log.warn(
                "Aktion TextMate bundle not found (expected <plugin>/textmate/bundles/aktion). " +
                    "Syntax colouring will fall back to semantic tokens only.",
            )
            return emptyList()
        }
        return listOf(TextMateBundleProvider.PluginBundle("Aktion", bundle.toPath()))
    }
}
