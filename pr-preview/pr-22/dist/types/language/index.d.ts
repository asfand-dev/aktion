import { ComponentLibrary } from '../library/types.js';
import { grammarSpec, createStreamTokenizer, defaultTagMap, keywordDocs, GrammarSpec, GrammarTokenKind, StreamTokenizer, KeywordDoc } from './grammar.js';
import { getComponentCatalog, indexCatalog, universalPropCatalog, ComponentEntry, ComponentParam } from './components.js';
import { getSnippets, SnippetEntry } from './snippets.js';
import { builtinCatalog, builtinNames, builtinsByName, findBuiltin, isBuiltinName, BuiltinEntry, BuiltinCategory } from './builtins.js';
import { namespaceCatalog, factoryResourceCatalog, factoryResourceNames, routeMembers, i18nResultMembers, findNamespace, isNamespaceName, findFactoryResource, namespaceMembersAt, findNamespaceMember, findBuiltinConfig, NamespaceEntry, NamespaceMember, NamespaceMemberKind, FactoryResourceEntry, ConfigKey } from './namespaces.js';
export type { GrammarSpec, GrammarTokenKind, StreamTokenizer, KeywordDoc, ComponentEntry, ComponentParam, SnippetEntry, BuiltinEntry, BuiltinCategory, NamespaceEntry, NamespaceMember, NamespaceMemberKind, FactoryResourceEntry, ConfigKey, };
export { grammarSpec, createStreamTokenizer, defaultTagMap, keywordDocs, getComponentCatalog, indexCatalog, universalPropCatalog, getSnippets, builtinCatalog, builtinNames, builtinsByName, findBuiltin, isBuiltinName, namespaceCatalog, factoryResourceCatalog, factoryResourceNames, routeMembers, i18nResultMembers, findNamespace, isNamespaceName, findFactoryResource, namespaceMembersAt, findNamespaceMember, findBuiltinConfig, };
/**
 * Diagnostic severity buckets that map to common editor lint levels.
 * Editors typically map: `error` → red squiggle, `warning` → yellow,
 * `info` → blue, `hint` → grey.
 */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";
export interface LanguageSpec {
    grammar: GrammarSpec;
    /** Build a fresh tokenizer instance suitable for CodeMirror StreamLanguage. */
    tokenizer: StreamTokenizer;
    /** Map from grammar token kind → CodeMirror highlight tag name. */
    tagMap: Record<GrammarTokenKind, string | null>;
    components: ComponentEntry[];
    componentsByName: Record<string, ComponentEntry>;
    /** Catalog of `$`-prefixed builtins (hooks, factories, namespaces). */
    builtins: readonly BuiltinEntry[];
    snippets: readonly SnippetEntry[];
    /**
     * Reserved-keyword documentation (definition + syntax + example),
     * keyed by keyword. Powers keyword highlight-popups and hover help.
     */
    keywordDocs: Record<string, KeywordDoc>;
    /** Built-in theme names; useful for theme-picker autocomplete. */
    themeNames: readonly string[];
    /** Default severity for the parser's ParseError stream. */
    severityTokenMap: Record<"parse-error", DiagnosticSeverity>;
    /**
     * Font Awesome icon aliases used by components that accept `icon: string`.
     * Editors can use these to power icon-name autocomplete.
     */
    iconAliases: readonly string[];
}
/**
 * Build a complete language spec ready for editor consumption. Pass a custom
 * `ComponentLibrary` if your host has registered extra components via
 * `<aktion-app>.registerComponents([...])` — the returned spec will
 * include them in autocomplete and inspection tooltips.
 */
export declare function getLanguageSpec(library?: ComponentLibrary): LanguageSpec;
