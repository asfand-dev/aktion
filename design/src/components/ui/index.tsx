"use client";
/**
 * Shared editor-chrome UI kit. Small, dependency-free primitives styled with
 * the design tokens in globals.css. Everything here is a client component.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
  }
>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes = size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "bg-bg-3 text-text-1 hover:bg-border-1",
    ghost: "bg-transparent text-text-2 hover:bg-bg-3 hover:text-text-1",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button
      ref={ref}
      className={cn(base, sizes, variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function TextInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border bg-bg-2 px-2.5 text-[13px] text-text-1 placeholder:text-text-3",
        "border-border-1 focus:border-accent focus:outline-none",
        invalid && "border-danger",
        className,
      )}
      {...rest}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border-1 bg-bg-2 px-2.5 py-2 text-[13px] text-text-1 placeholder:text-text-3 focus:border-accent focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-label="Loading"
      className="inline-block animate-spin rounded-full border-2 border-text-3 border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[85vh] overflow-auto rounded-xl border border-border-1 bg-bg-1 shadow-2xl"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-border-0 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-1">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-text-3 hover:bg-bg-3 hover:text-text-1"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Menu (small dropdown)
// ---------------------------------------------------------------------------

export function Menu({
  trigger,
  items,
  align = "start",
}: {
  trigger: ReactNode;
  align?: "start" | "end";
  items: Array<
    | { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
    | "separator"
  >;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          className={cn(
            "absolute z-40 mt-1 min-w-44 rounded-lg border border-border-1 bg-bg-2 py-1 shadow-xl",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <div key={i} className="my-1 border-t border-border-0" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[13px] hover:bg-bg-3 disabled:opacity-40",
                  item.danger ? "text-danger" : "text-text-1",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip (simple, CSS-positioned)
// ---------------------------------------------------------------------------

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  side?: "top" | "bottom";
  children: ReactNode;
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-1 bg-bg-2 px-2 py-1 text-xs text-text-1 opacity-0 shadow-lg transition-opacity group-hover/tt:opacity-100",
          side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-md bg-bg-2 p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          title={opt.title}
          className={cn(
            "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-bg-3 text-text-1"
              : "text-text-3 hover:text-text-2",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast (lightweight, module-level store)
// ---------------------------------------------------------------------------

type ToastItem = { id: number; message: string; tone: "info" | "error" | "success" };
type ToastListener = (items: ToastItem[]) => void;

let toastItems: ToastItem[] = [];
let toastListeners: ToastListener[] = [];
let toastSeq = 1;

export function toast(message: string, tone: ToastItem["tone"] = "info") {
  const item = { id: toastSeq++, message, tone };
  toastItems = [...toastItems, item];
  toastListeners.forEach((l) => l(toastItems));
  setTimeout(() => {
    toastItems = toastItems.filter((t) => t.id !== item.id);
    toastListeners.forEach((l) => l(toastItems));
  }, 3500);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const listener: ToastListener = (next) => setItems([...next]);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-lg border px-3.5 py-2 text-[13px] shadow-xl",
            t.tone === "error" && "border-danger/40 bg-[#2a1512] text-[#ffb3a5]",
            t.tone === "success" && "border-success/40 bg-[#0f231a] text-[#7fe0ae]",
            t.tone === "info" && "border-border-1 bg-bg-2 text-text-1",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
