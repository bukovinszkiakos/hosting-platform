"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FolderGit2, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type Profile } from "@/services/api";

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileView />
    </ProtectedRoute>
  );
}

function ProfileView() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.profile
      .get(controller.signal)
      .then((data) => setProfile(data))
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load your profile.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // After an update, reload the profile and refresh the cached user (an email or
  // display-name change affects the session identity shown elsewhere).
  async function handleUpdated() {
    try {
      const data = await api.profile.get();
      setProfile(data);
    } catch {
      // Non-fatal: the update succeeded; a stale view will correct on next load.
    }
    try {
      await refresh();
    } catch {
      // Ignore: keeping the cached user in sync is best-effort.
    }
  }

  return (
    <AppShell isAdmin={user?.role === "Admin"}>
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account information and settings.
        </p>

        <div className="mt-6">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : profile ? (
            <div className="flex flex-col gap-6">
              <ProfileInformation profile={profile} />
              <ProfileStatistics profile={profile} />
              <EditProfileForm
                key={`${profile.displayName}|${profile.email}`}
                initialDisplayName={profile.displayName}
                initialEmail={profile.email}
                onUpdated={handleUpdated}
              />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function ProfileInformation({ profile }: { profile: Profile }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Account information</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Display Name">{profile.displayName}</Field>
        <Field label="Email">{profile.email}</Field>
        <Field label="Role">{profile.role}</Field>
        <Field label="Created At">{formatDate(profile.createdAt)}</Field>
      </dl>
    </div>
  );
}

function ProfileStatistics({ profile }: { profile: Profile }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Projects</span>
          <FolderGit2 className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-3xl font-semibold">{profile.projectsCount}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Deployments</span>
          <Rocket className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-3xl font-semibold">{profile.deploymentsCount}</p>
      </div>
    </div>
  );
}

function EditProfileForm({
  initialDisplayName,
  initialEmail,
  onUpdated,
}: {
  initialDisplayName: string;
  initialEmail: string;
  onUpdated: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDetails([]);
    setSuccess(null);

    if (!displayName.trim() || !email.trim()) {
      setError("Display name and email are required.");
      return;
    }

    setSubmitting(true);
    try {
      await api.profile.update({
        displayName: displayName.trim(),
        email: email.trim(),
      });
      setSuccess("Profile updated.");
      onUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Failed to update your profile.");
        setDetails(err.errors);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
      noValidate
    >
      <h2 className="text-base font-semibold">Edit profile</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          type="text"
          autoComplete="name"
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== null}
          disabled={submitting}
        />
      </div>

      {error && (
        <div role="alert" className="text-sm text-destructive">
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

      {success && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {success}
        </p>
      )}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
