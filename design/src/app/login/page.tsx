"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { SessionUser } from "@/design/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only allow same-origin path redirects to avoid open-redirect abuse. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/projects";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);

    const trimmed = email.trim();
    const emailErr = !trimmed
      ? "Email is required"
      : !EMAIL_RE.test(trimmed)
        ? "Enter a valid email address"
        : null;
    const passwordErr = password ? null : "Password is required";
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    setSubmitting(true);
    try {
      await api.post<{ user: SessionUser }>("/api/auth/login", {
        email: trimmed,
        password,
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setServerError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Something went wrong",
      );
      setSubmitting(false);
    }
  }

  const registerHref =
    next === "/projects" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep designing."
      footer={
        <>
          No account?{" "}
          <Link href={registerHref} className="text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email" error={emailError}>
          <TextInput
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            invalid={!!emailError}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
          />
        </Field>

        <Field label="Password" error={passwordError}>
          <div className="relative">
            <TextInput
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              invalid={!!passwordError}
              className="pr-9"
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:text-text-1"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        {serverError ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {serverError}
          </div>
        ) : null}

        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
