"use client";
/**
 * Shared chrome for the login/register pages: centered card on the dark page
 * background with the Aktion Design brand mark, a title/subtitle, the form
 * itself and a footer link (e.g. "No account? Create one").
 */
import type { ReactNode } from "react";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block rounded-lg shadow-[0_2px_12px_rgba(13,153,255,0.35)]"
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(135deg, var(--accent) 0%, #7b5cff 60%, #b44cff 100%)",
      }}
    />
  );
}

export default function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-0 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-text-1">
            Aktion Design
          </span>
        </div>

        <div className="rounded-xl border border-border-0 bg-bg-1 p-6 shadow-2xl shadow-black/40">
          <h1 className="text-lg font-semibold text-text-1">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-[13px] text-text-3">{subtitle}</p>
          ) : null}
          <div className="mt-5">{children}</div>
        </div>

        {footer ? (
          <p className="mt-5 text-center text-[13px] text-text-3">{footer}</p>
        ) : null}
      </div>
    </div>
  );
}
