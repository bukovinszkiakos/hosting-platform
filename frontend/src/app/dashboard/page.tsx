"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, FolderGit2, LineChart, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
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
      <PageHeader
        title="Dashboard"
        description="An overview of your projects and deployments."
      />

      <div className="mt-8">
        {loading ? (
          <StatGridSkeleton />
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
            {error}
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Projects"
                value={data.projectsCount}
                icon={FolderGit2}
                accent="bg-primary/10 text-primary"
                hint="Total created"
              />
              <StatCard
                label="Deployments"
                value={data.deploymentsCount}
                icon={Rocket}
                accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                hint="Total runs"
              />
              <StatCard
                label="Online Projects"
                value={data.onlineProjects}
                icon={CircleCheck}
                accent="bg-success/10 text-success"
                hint="Currently live"
              />
              <StatCard
                label="Failed Projects"
                value={data.failedProjects}
                icon={CircleX}
                accent="bg-destructive/10 text-destructive"
                hint="Needs attention"
              />
            </div>

            <div className="mt-[22px]">
              {data.deploymentsCount === 0 ? (
                <EmptyState
                  icon={LineChart}
                  title="No activity yet"
                  description="Deploy your first project and your build history and metrics will appear here."
                />
              ) : (
                <EmptyState
                  icon={LineChart}
                  title="Activity overview"
                  description="Build history and metrics charts are coming soon."
                />
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="mt-3 h-10 w-14" />
        </Card>
      ))}
    </div>
  );
}
