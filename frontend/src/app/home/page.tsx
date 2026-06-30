"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Circle, FolderGit2, Plus } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, ApiError, type Deployment, type Project } from "@/services/api";

// Starting page after sign-in (see docs/09-frontend-pages.md "Home Page"). Unlike
// the Dashboard, this is an onboarding/landing surface, not a statistics page.
export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeView />
    </ProtectedRoute>
  );
}

const RECENT_LIMIT = 5;

function HomeView() {
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const projectList = await api.projects.list(controller.signal);

        // The MVP has no cross-project deployments endpoint, so "recent
        // deployments" is aggregated from the most recently updated projects
        // (the list is already ordered newest-first by the backend).
        const recentProjects = projectList.slice(0, RECENT_LIMIT);
        const deploymentLists = await Promise.all(
          recentProjects.map((p) => api.projects.deployments(p.id, controller.signal)),
        );
        if (controller.signal.aborted) return;

        const recentDeployments = deploymentLists
          .flat()
          .sort(
            (a, b) =>
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          )
          .slice(0, RECENT_LIMIT);

        setProjects(projectList);
        setDeployments(recentDeployments);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Failed to load your home page.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const hasProject = projects.length > 0;
  const hasDeployment = deployments.length > 0;
  const hasPublished = projects.some((p) => p.websiteUrl);

  return (
    <AppShell isAdmin={user?.role === "Admin"}>
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold">
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deploy a static website from GitHub in a few clicks.
        </p>

        {/* Quick actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/projects" className={cn(buttonVariants())}>
            <Plus />
            Create Project
          </Link>
          <Link href="/projects" className={cn(buttonVariants({ variant: "outline" }))}>
            <FolderGit2 />
            View Projects
          </Link>
        </div>

        <div className="mt-8">
          {loading ? (
            <HomeSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <GettingStarted
                hasProject={hasProject}
                hasDeployment={hasDeployment}
                hasPublished={hasPublished}
              />
              <RecentProjects projects={projects.slice(0, RECENT_LIMIT)} />
              <RecentDeployments deployments={deployments} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function GettingStarted({
  hasProject,
  hasDeployment,
  hasPublished,
}: {
  hasProject: boolean;
  hasDeployment: boolean;
  hasPublished: boolean;
}) {
  // Account Created and Logged In are always true on this authenticated page.
  const steps: { label: string; done: boolean }[] = [
    { label: "Account Created", done: true },
    { label: "Logged In", done: true },
    { label: "First Project Created", done: hasProject },
    { label: "First Deployment", done: hasDeployment },
    { label: "Website Published", done: hasPublished },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold">Getting Started</h2>
      <ul className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="size-4 text-muted-foreground" />
            )}
            <span className={step.done ? "" : "text-muted-foreground"}>
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentProjects({ projects }: { projects: Project[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Recent Projects</h2>
      {projects.length === 0 ? (
        <EmptyCard message="No projects yet. Create your first project to get started." />
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">{project.name}</span>
                  <StatusBadge status={project.currentStatus} />
                </div>
                {project.repositoryUrl && (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {project.repositoryUrl}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentDeployments({ deployments }: { deployments: Deployment[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Recent Deployments</h2>
      {deployments.length === 0 ? (
        <EmptyCard message="No deployments yet. Deploy a project to publish it." />
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {deployments.map((deployment) => (
            <li key={deployment.id}>
              <Link
                href={`/deployments/${deployment.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge status={deployment.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(deployment.startedAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Online"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "Failed"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", tone)}
    >
      {status}
    </span>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-44 animate-pulse rounded-xl border border-border bg-card" />
      <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
