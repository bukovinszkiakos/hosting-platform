"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FolderGit2, Rocket, Shield } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { api, ApiError, type Profile } from "@/services/api";
import { cn, initials } from "@/lib/utils";

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
      <PageHeader
        title="Profile"
        description="Your account information and settings."
      />

      <div className="mt-8">
        {loading ? (
          <ProfileSkeleton />
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
            {error}
          </Card>
        ) : profile ? (
          <div className="flex flex-col gap-[22px]">
            <ProfileInformation profile={profile} />
            <div className="grid gap-[18px] sm:grid-cols-2">
              <StatCard
                label="Projects"
                value={profile.projectsCount}
                icon={FolderGit2}
                accent="bg-primary/10 text-primary"
              />
              <StatCard
                label="Deployments"
                value={profile.deploymentsCount}
                icon={Rocket}
                accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              />
            </div>
            <EditProfileForm
              key={`${profile.displayName}|${profile.email}`}
              initialDisplayName={profile.displayName}
              initialEmail={profile.email}
              onUpdated={handleUpdated}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function ProfileInformation({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "Admin";
  return (
    <Card className="p-6">
      <div className="flex items-center gap-[18px]">
        <span className="flex size-[60px] shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(150deg,color-mix(in_oklch,var(--brand),white_30%),color-mix(in_oklch,var(--brand),white_74%))] text-xl font-bold text-[color-mix(in_oklch,var(--brand),black_8%)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand),white_70%)]">
          {initials(profile.displayName)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-display text-[22px] font-bold">
            {profile.displayName}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              isAdmin
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-primary/20 bg-primary/10 text-primary",
            )}
          >
            {isAdmin && <Shield className="size-3" />}
            {profile.role}
          </span>
        </div>
      </div>

      <dl className="mt-[22px] grid overflow-hidden rounded-2xl border border-border sm:grid-cols-2">
        <Field label="Display name" className="border-b border-border sm:border-r">
          {profile.displayName}
        </Field>
        <Field label="Email" className="border-b border-border">
          {profile.email}
        </Field>
        <Field label="Role" className="border-b border-border sm:border-b-0 sm:border-r">
          {profile.role}
        </Field>
        <Field label="Member since">{formatDate(profile.createdAt)}</Field>
      </dl>
    </Card>
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
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold">Edit profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your display name and email address.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
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

        {success && (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
          >
            {success}
          </p>
        )}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("p-4", className)}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]">
      <Card className="p-6">
        <div className="flex items-center gap-[18px]">
          <Skeleton className="size-[60px] rounded-2xl" />
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-52" />
          </div>
        </div>
        <div className="mt-[22px] grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-4 w-40" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-[18px] sm:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
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
