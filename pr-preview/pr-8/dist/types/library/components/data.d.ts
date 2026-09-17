import { ComponentSpec } from '../types.js';
export declare const Col: ComponentSpec;
export declare const Table: ComponentSpec;
export declare const ListItem: ComponentSpec;
export declare const List: ComponentSpec;
export declare const StatCard: ComponentSpec;
export declare const Sparkline: ComponentSpec;
export declare const TreeNode: ComponentSpec;
export declare const Tree: ComponentSpec;
/**
 * ISO 4217 codes are exactly three letters. Anything else has to fall back:
 * `toLocaleString` throws a RangeError on an unknown currency, which would take
 * the whole render down.
 */
export declare function currencyCode(value: unknown): string;
/**
 * A BCP-47 tag for `Intl`, or `undefined` meaning "whatever the host uses".
 *
 * Same hazard as an unknown currency: `toLocaleString("de_DE")` throws a
 * RangeError on a malformed tag, so one typo in `Col(locale:)` would take the
 * whole table down. Canonicalising through `Intl` decides that up front, and an
 * unusable tag degrades to the browser's own formatting.
 */
export declare function localeTag(value: unknown): string | undefined;
/**
 * The formatter for one `Col`, bound to that column's own `currency` and
 * `locale` — with the enclosing table's `locale` as the fallback, so a EUR
 * report sets `locale` once rather than on every column.
 *
 * Reads the Col's positional slots (8 = `currency`, 12 = `locale`); slots are
 * appended to the spec, never inserted, precisely so these indices hold.
 */
export declare function colFormatter(args: readonly unknown[] | undefined, fallbackLocale?: string): (value: unknown, format: string) => string;
/**
 * The one cell formatter, shared with `DataGrid` (advanced-data.ts).
 *
 * It used to be copy-pasted there, and the copies drifted: adding `currency`
 * here would have left the same `Col` rendering EUR in a Table and USD in a
 * DataGrid. Sorting and CSV export read through this too, so one function keeps
 * the displayed value, the sort order and the export byte-identical.
 *
 * `locale` is left `undefined` when nothing asked for one — that is what makes
 * `Intl` follow the viewer's browser, which is the right default for an app
 * whose audience is not the author's own market.
 */
export declare function formatCell(value: unknown, format: string, currency?: string, locale?: string): string;
