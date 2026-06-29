"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  api,
  ApiError,
  type Deployment,
  type Project,
} from "@/services/api";

export default function ProjectDetailsPage() {
  return (
    <ProtectedRoute>
      <ProjectDetailsView />
    </ProtectedRoute>
  );
}

function ProjectDetailsView() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Loads the project and its deployment history together. Returns a no-op
  // cleanup so callers outside an effect can ignore it.
  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      return Promise.all([
        api.projects.get(id, signal),
        api.projects.deployments(id, signal),
      ])
        .then(([projectData, deploymentData]) => {
          setProject(projectData);
          setDeployments(deploymentData);
        })
        .catch((err) => {
          if (signal?.aborted) {
            return;
          }
          setError(err instanceof ApiError ? err.message : "Failed to load the project.");
        })
        .finally(() => {
          if (!signal?.aborted) {
            setLoading(false);
          }
        });
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleDeploy() {
    setDeployError(null);
    setDeploying(true);
    try {
      await api.projects.deploy(id);
      // A new deployment changes both the history and the project status.
      await load();
    } catch (err) {
      setDeployError(
        err instanceof ApiError
          ? err.message || "Failed to start the deployment."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setDeploying(false);
    }
  }

  return (
    <AppShell isAdmin={user?.role === "Admin"}>
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to projects
        </Link>

        <div className="mt-4">
          {loading ? (
            <ProjectDetailsSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : project ? (
            <div className="flex flex-col gap-6">
              <ProjectInformation
                project={project}
                deploying={deploying}
                deployError={deployError}
                onDeploy={handleDeploy}
              />
              <DeploymentHistory deployments={deployments} />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function ProjectInformation({
  project,
  deploying,
  deployError,
  onDeploy,
}: {
  project: Project;
  deploying: boolean;
  deployError: string | null;
  onDeploy: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.currentStatus} />
          </div>
        </div>
        <Button onClick={onDeploy} disabled={deploying}>
          <Rocket />
          {deploying ? "Deploying…" : "Deploy"}
        </Button>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Repository URL">
          {project.repositoryUrl ? (
            <span className="break-all">{project.repositoryUrl}</span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Field>
        <Field label="Website URL">
          {project.websiteUrl ? (
            <a
              href={project.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 break-all font-medium text-primary hover:underline"
            >
              {project.websiteUrl}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : (
            <span className="text-muted-foreground">Not published yet</span>
          )}
        </Field>
        <Field label="Current Status">{project.currentStatus}</Field>
        <Field label="Last Updated">{formatDateTime(project.updatedAt)}</Field>
      </dl>

      {deployError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {deployError}
        </p>
      )}
    </div>
  );
}

function DeploymentHistory({ deployments }: { deployments: Deployment[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Deployment History</h2>

      {deployments.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No deployments yet. Use Deploy to publish this project.
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {deployments.map((deployment, index) => (
            <li key={deployment.id}>
              <Link
                href={`/deployments/${deployment.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Newest first, so the oldest deployment is #1. */}
                    <span className="text-sm font-semibold">
                      Deploy #{deployments.length - index}
                    </span>
                    <StatusBadge status={deployment.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(deployment.startedAt)}
                    {deployment.finishedAt
                      ? ` — ${formatDateTime(deployment.finishedAt)}`
                      : ""}
                  </div>
                </div>

                {deployment.buildSummary && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {deployment.buildSummary}
                  </p>
                )}
                {deployment.errorMessage && (
                  <p className="mt-2 text-sm text-destructive">
                    {deployment.errorMessage}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <dd className="mt-1 text-sm">{children}</dd>
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
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function ProjectDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
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
