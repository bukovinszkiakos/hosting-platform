"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { api, ApiError } from "@/services/api";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> no reason to show the register page.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDetails([]);

    if (!displayName.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Registration failed.");
        setDetails(err.errors);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    // Registration does not create a session, so sign in with the new credentials.
    try {
      await login({ email: email.trim(), password });
      router.replace("/home");
    } catch {
      // Account was created but auto sign-in failed; let the user sign in manually.
      router.replace("/login");
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start deploying static websites from GitHub"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={error !== null}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error !== null}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error !== null}
            disabled={submitting}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <p>{error}</p>
            {details.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {details.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button type="submit" disabled={submitting} className="mt-1 w-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
