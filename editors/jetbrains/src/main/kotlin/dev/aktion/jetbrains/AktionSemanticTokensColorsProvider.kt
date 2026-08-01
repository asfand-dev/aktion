package dev.aktion.jetbrains

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.psi.PsiFile
import com.redhat.devtools.lsp4ij.features.semanticTokens.SemanticTokensColorsProvider

/**
 * Maps Aktion's semantic-token legend onto IntelliJ colour keys.
 *
 * The legend is defined once, in the runtime
 * (`src/tooling/semantic-tokens.ts` → `semanticTokenTypes` /
 * `semanticTokenModifiers`), and the server sends it in its `initialize`
 * response. This class is the JetBrains-side half of the same mapping the VS
 * Code extension expresses declaratively via `semanticTokenScopes` in its
 * `package.json`.
 *
 * Using platform colour keys rather than custom ones is deliberate: Aktion then
 * inherits whatever the user's theme already does for classes, functions, and
 * globals, so a `.aktion` file looks native in Darcula, High Contrast, and every
 * third-party theme without shipping a colour scheme.
 *
 * The current legend is:
 *   types      namespace · class · function · variable · property · keyword · number
 *   modifiers  declaration · defaultLibrary
 */
class AktionSemanticTokensColorsProvider : SemanticTokensColorsProvider {

    override fun getTextAttributesKey(
        tokenType: String,
        tokenModifiers: List<String>,
        file: PsiFile,
    ): TextAttributesKey? {
        val isDeclaration = DECLARATION in tokenModifiers
        val isLibrary = DEFAULT_LIBRARY in tokenModifiers

        return when (tokenType) {
            // $util, $storage, $console, $toast, $dom — reserved runtime namespaces.
            "namespace" -> DefaultLanguageHighlighterColors.PREDEFINED_SYMBOL

            // Component calls. A library component reads as a reference; the
            // author's own `function Panel(...)` reads as a declaration site.
            "class" -> when {
                isDeclaration -> DefaultLanguageHighlighterColors.CLASS_NAME
                isLibrary -> DefaultLanguageHighlighterColors.CLASS_REFERENCE
                else -> DefaultLanguageHighlighterColors.CLASS_NAME
            }

            // $-builtins ($http, $effect, …) and the author's actions / hooks.
            "function" -> when {
                isDeclaration -> DefaultLanguageHighlighterColors.FUNCTION_DECLARATION
                isLibrary -> DefaultLanguageHighlighterColors.STATIC_METHOD
                else -> DefaultLanguageHighlighterColors.FUNCTION_CALL
            }

            // Reactive `$state` atoms. Global-variable colouring is the closest
            // match semantically — an atom is module-scoped and reassignable.
            "variable" -> DefaultLanguageHighlighterColors.GLOBAL_VARIABLE

            // Named component arguments (`{ variant: "primary" }`) and member
            // access on a namespace or resource bag (`$todos.data`).
            "property" -> DefaultLanguageHighlighterColors.INSTANCE_FIELD

            "keyword" -> DefaultLanguageHighlighterColors.KEYWORD
            "number" -> DefaultLanguageHighlighterColors.NUMBER

            // An unknown type means the runtime grew its legend and this plugin
            // has not caught up: fall through to TextMate's lexical colour
            // rather than painting the token with a wrong one.
            else -> null
        }
    }

    private companion object {
        const val DECLARATION = "declaration"
        const val DEFAULT_LIBRARY = "defaultLibrary"
    }
}
