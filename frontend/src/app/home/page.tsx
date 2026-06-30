"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Circle,
  FolderGit2,
  Plus,
  Rocket,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError, type Deployment, type Project } from "@/services/api";

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
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Deploy a static website from GitHub in a few clicks.
        </p>

        {/* Quick actions */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <QuickAction
            href="/projects"
            icon={Plus}
            title="Create a project"
            description="Connect a GitHub repository to deploy."
          />
          <QuickAction
            href="/projects"
            icon={FolderGit2}
            title="View projects"
            description="Manage and deploy your existing projects."
          />
        </div>

        <div className="mt-8">
          {loading ? (
            <HomeSkeleton />
          ) : error ? (
            <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
              {error}
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <GettingStarted
                  hasProject={hasProject}
                  hasDeployment={hasDeployment}
                  hasPublished={hasPublished}
                />
              </div>
              <div className="flex flex-col gap-6 lg:col-span-3">
                <RecentProjects projects={projects.slice(0, RECENT_LIMIT)} />
                <RecentDeployments deployments={deployments} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Plus;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group">
      <Card interactive className="flex items-center gap-4 p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Card>
    </Link>
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
  const steps: { label: string; done: boolean }[] = [
    { label: "Account created", done: true },
    { label: "Logged in", done: true },
    { label: "First project created", done: hasProject },
    { label: "First deployment", done: hasDeployment },
    { label: "Website published", done: hasPublished },
  ];
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Getting started</h2>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {completed}/{steps.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-5 flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5 text-sm">
            {step.done ? (
              <CircleCheck className="size-4.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="size-4.5 text-muted-foreground/40" />
            )}
            <span className={step.done ? "" : "text-muted-foreground"}>
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentProjects({ projects }: { projects: Project[] }) {
  return (
    <section>
      <SectionHeading title="Recent projects" href="/projects" />
      {projects.length === 0 ? (
        <EmptyCard message="No projects yet. Create your first project to get started." />
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`} className="group block">
                <Card interactive className="flex items-center gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FolderGit2 className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{project.name}</p>
                    {project.repositoryUrl && (
                      <p className="truncate text-xs text-muted-foreground">
                        {project.repositoryUrl}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={project.currentStatus} />
                </Card>
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
      <SectionHeading title="Recent deployments" />
      {deployments.length === 0 ? (
        <EmptyCard message="No deployments yet. Deploy a project to publish it." />
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {deployments.map((deployment) => (
            <li key={deployment.id}>
              <Link href={`/deployments/${deployment.id}`} className="group block">
                <Card interactive className="flex items-center gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Rocket className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(deployment.startedAt)}
                    </p>
                  </div>
                  <StatusBadge status={deployment.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      )}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <Card className="mt-3 border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">
      {message}
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-6 lg:col-span-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-1.5 w-full" />
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-40" />
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-6 lg:col-span-3">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
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
