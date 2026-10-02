/**
 * Stand-in for the generated `aktion-runtime/dsl` declarations, mapped in
 * through `paths` in ./tsconfig.json so the fixture type-checks without a
 * build. It follows the generated overload shapes only as far as
 * `aktion/props-literal` depends on them: the props bag is the parameter named
 * `props` in every overload, a component has a single-object overload, and
 * the multi-slot overload types the slots after the positional one — so a
 * handler passed second resolves to `onClick`, not to `props`.
 */

declare const brand: unique symbol;

export interface AktionNode<N extends string = string> {
  readonly [brand]: N;
}

export type AktionChild = AktionNode | string | number | null | undefined;
export type Children = AktionChild | readonly Children[];

type Callable = (...args: never[]) => unknown;

interface BaseProps {
  key?: string | number;
  id?: string;
  className?: string;
}

export interface ButtonOptions extends BaseProps {
  label?: string;
  onClick?: Callable;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}
export type ButtonProps = ButtonOptions & { label: string };
export type ButtonNamed = Omit<ButtonOptions, "label">;
export declare function Button(label: string, props?: ButtonNamed): AktionNode<"Button">;
export declare function Button(props: ButtonProps): AktionNode<"Button">;
export declare function Button(
  label: string,
  onClick: Callable | null | undefined,
  props?: Omit<ButtonOptions, "label" | "onClick">,
): AktionNode<"Button">;

export interface TextOptions extends BaseProps {
  content?: string | number;
  size?: "sm" | "md" | "lg";
}
export declare function Text(content: string | number, props?: Omit<TextOptions, "content">): AktionNode<"Text">;
export declare function Text(props: TextOptions & { content: string | number }): AktionNode<"Text">;

export interface ColumnOptions extends BaseProps {
  children?: Children;
  gap?: number;
}
export declare function Column(children: Children, props?: Omit<ColumnOptions, "children">): AktionNode<"Column">;
export declare function Column(props: ColumnOptions): AktionNode<"Column">;

export interface BadgeOptions extends BaseProps {
  label?: string;
  tone?: "neutral" | "success" | "danger";
}
export declare function Badge(label: string, props?: Omit<BadgeOptions, "label">): AktionNode<"Badge">;
