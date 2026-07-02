"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FolderGit2, Plus, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
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
    <AppShell>
      <h1 className="font-display text-3xl font-bold sm:text-[2.1rem]">
        Welcome back{user?.displayName ? `, ${user.displayName}` : ""}
      </h1>
      <p className="mt-1.5 text-base text-muted-foreground">
        Deploy a static website from GitHub in a few clicks.
      </p>

      {/* Quick actions */}
      <div className="mt-8 grid gap-[18px] sm:grid-cols-2">
        <QuickAction
          href="/projects"
          icon={Plus}
          title="Create a project"
          description="Connect a GitHub repository to deploy."
          variant="gradient"
        />
        <QuickAction
          href="/projects"
          icon={FolderGit2}
          title="View projects"
          description="Manage and deploy your existing projects."
          variant="soft"
        />
      </div>

      <div className="mt-6">
        {loading ? (
          <HomeSkeleton />
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
            {error}
          </Card>
        ) : (
          <div className="grid items-start gap-[22px] lg:grid-cols-[360px_1fr]">
            <GettingStarted
              hasProject={hasProject}
              hasDeployment={hasDeployment}
              hasPublished={hasPublished}
            />
            <div className="flex flex-col gap-7">
              <RecentProjects projects={projects.slice(0, RECENT_LIMIT)} />
              <RecentDeployments deployments={deployments} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  variant,
}: {
  href: string;
  icon: typeof Plus;
  title: string;
  description: string;
  variant: "gradient" | "soft";
}) {
  return (
    <Link href={href} className="group">
      <Card interactive className="flex items-center gap-[18px] p-[22px]">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-[13px]",
            variant === "gradient"
              ? "bg-[linear-gradient(150deg,var(--brand),color-mix(in_oklch,var(--brand),black_22%))] text-white shadow-[0_8px_18px_-7px_color-mix(in_oklch,var(--brand)_55%,transparent)]"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold">{title}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <ArrowRight className="size-5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
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
        <h2 className="font-display text-lg font-semibold">Getting started</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[13px] font-semibold text-primary tabular-nums">
          {completed}/{steps.length}
        </span>
      </div>
      <div className="mt-4 h-[7px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),color-mix(in_oklch,var(--brand),oklch(0.62_0.2_330)_45%))] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-5 flex flex-col gap-3.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-[15px]">
            {step.done ? (
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="size-[22px] shrink-0 rounded-full border-2 border-border" />
            )}
            <span className={step.done ? "font-medium" : "text-faint"}>
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
        <div className="mt-3.5">
          <EmptyState
            icon={FolderGit2}
            description="No projects yet. Create your first project to get started."
            size="sm"
          />
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-2.5">
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
        <div className="mt-3.5">
          <EmptyState
            icon={Rocket}
            description="No deployments yet. Deploy a project to publish it."
            size="sm"
          />
        </div>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-2.5">
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
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-sm font-semibold text-primary hover:underline"
        >
          View all
        </Link>
      )}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid items-start gap-[22px] lg:grid-cols-[360px_1fr]">
      <Card className="p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-[7px] w-full" />
        <div className="mt-5 flex flex-col gap-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-40" />
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-7">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
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
