"use client";

import { useEffect, useState, type ComponentType } from "react";
import { CircleCheck, CircleX, FolderGit2, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { api, ApiError, type DashboardSummary } from "@/services/api";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardView />
    </ProtectedRoute>
  );
}

function DashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.dashboard
      .get(controller.signal)
      .then((summary) => setData(summary))
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load the dashboard.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <AppShell isAdmin={user?.role === "Admin"}>
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An overview of your projects and deployments.
        </p>

        <div className="mt-6">
          {loading ? (
            <StatGridSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Projects" value={data.projectsCount} icon={FolderGit2} />
              <StatCard label="Deployments" value={data.deploymentsCount} icon={Rocket} />
              <StatCard label="Online Projects" value={data.onlineProjects} icon={CircleCheck} />
              <StatCard label="Failed Projects" value={data.failedProjects} icon={CircleX} />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
