"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, GitBranch, Pencil, Rocket } from "lucide-react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  api,
  ApiError,
  isDeploymentActive,
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
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

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
    <AppShell>
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to projects
        </Link>

        <div className="mt-5">
          {loading ? (
            <ProjectDetailsSkeleton />
          ) : error ? (
            <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
              {error}
            </Card>
          ) : project ? (
            <div className="flex flex-col gap-6">
              <ProjectInformation
                project={project}
                deploying={deploying}
                deployError={deployError}
                onDeploy={handleDeploy}
                onUpdated={setProject}
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
  onUpdated,
}: {
  project: Project;
  deploying: boolean;
  deployError: string | null;
  onDeploy: () => void;
  onUpdated: (project: Project) => void;
}) {
  const [editing, setEditing] = useState(false);

  // Disable Deploy while a deployment for this project is still in progress. This
  // complements the backend guard, which rejects a concurrent deployment
  // (see docs/10-deployment-workflow.md "One Active Deployment Per Project").
  const deployInProgress = deploying || isDeploymentActive(project.currentStatus);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Rocket className="size-5.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-2xl font-bold">
                {project.name}
              </h1>
              <StatusBadge status={project.currentStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDate(project.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setEditing((value) => !value)}
            disabled={deployInProgress || editing}
          >
            <Pencil />
            Edit
          </Button>
          <Button onClick={onDeploy} disabled={deployInProgress}>
            <Rocket />
            {deployInProgress ? "Deploying…" : "Deploy"}
          </Button>
        </div>
      </div>

      {editing ? (
        <EditProjectForm
          project={project}
          onCancel={() => setEditing(false)}
          onUpdated={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
        />
      ) : (
        <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          <Field label="Repository URL" icon={<GitBranch className="size-3.5" />}>
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
          <Field label="Current status">
            <StatusBadge status={project.currentStatus} />
          </Field>
          <Field label="Last updated">{formatDate(project.updatedAt)}</Field>
        </dl>
      )}

      {deployError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {deployError}
        </p>
      )}
    </Card>
  );
}

function EditProjectForm({
  project,
  onUpdated,
  onCancel,
}: {
  project: Project;
  onUpdated: (project: Project) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !repositoryUrl.trim()) {
      setError("Project name and repository URL are required.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await api.projects.update(project.id, {
        name: name.trim(),
        repositoryUrl: repositoryUrl.trim(),
      });
      onUpdated(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "Failed to update the project."
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-5 duration-300 animate-in fade-in"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-name">Project name</Label>
        <Input
          id="edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error !== null}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-repositoryUrl">Repository URL</Label>
        <Input
          id="edit-repositoryUrl"
          type="url"
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          aria-invalid={error !== null}
          disabled={submitting}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeploymentHistory({ deployments }: { deployments: Deployment[] }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Deployment history</h2>

      {deployments.length === 0 ? (
        <Card className="mt-3 border-dashed p-10 text-center text-sm text-muted-foreground shadow-none">
          No deployments yet. Use <span className="font-medium text-foreground">Deploy</span> to publish this project.
        </Card>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {deployments.map((deployment, index) => (
            <li key={deployment.id}>
              <Link href={`/deployments/${deployment.id}`} className="block">
                <Card interactive className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {/* Newest first, so the oldest deployment is #1. */}
                      <span className="text-sm font-semibold">
                        Deploy #{deployments.length - index}
                      </span>
                      <StatusBadge status={deployment.status} />
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
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
                    <p className="mt-2 line-clamp-2 text-sm text-destructive">
                      {deployment.errorMessage}
                    </p>
                  )}
                </Card>
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
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card p-4">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function ProjectDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-4 w-40" />
            </div>
          ))}
        </div>
      </Card>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-20 w-full rounded-xl" />
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
