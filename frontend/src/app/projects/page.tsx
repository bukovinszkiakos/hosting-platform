"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ExternalLink, FolderGit2, GitBranch, Plus } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError, type Project } from "@/services/api";

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <ProjectsView />
    </ProtectedRoute>
  );
}

function ProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.projects
      .list(controller.signal)
      .then((list) => setProjects(list))
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load projects.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  function handleCreated(project: Project) {
    // Newest first, matching the backend ordering (UpdatedAt descending).
    setProjects((current) => [project, ...(current ?? [])]);
    setCreating(false);
  }

  function handleDeleted(id: string) {
    setProjects((current) => (current ?? []).filter((p) => p.id !== id));
  }

  return (
    <AppShell isAdmin={user?.role === "Admin"}>
      <PageHeader
        title="Projects"
        description="Manage the websites you deploy from GitHub."
      >
        {!loading && !error && (
          <Button onClick={() => setCreating((value) => !value)}>
            <Plus />
            New project
          </Button>
        )}
      </PageHeader>

      {creating && (
        <div className="mt-6">
          <CreateProjectForm
            onCreated={handleCreated}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <ProjectListSkeleton />
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
            {error}
          </Card>
        ) : projects && projects.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} onDeleted={handleDeleted} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8">
            <EmptyState
              icon={FolderGit2}
              title="No projects yet"
              description="Create your first project to deploy a website from GitHub."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  New project
                </Button>
              }
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CreateProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (project: Project) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
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
      const project = await api.projects.create({
        name: name.trim(),
        repositoryUrl: repositoryUrl.trim(),
      });
      onCreated(project);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "Failed to create the project."
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6 duration-300 animate-in fade-in slide-in-from-top-2">
      <h2 className="font-display text-lg font-semibold">New project</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect a public GitHub repository to deploy.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              type="text"
              placeholder="My Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error !== null}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="repositoryUrl">Repository URL</Label>
            <Input
              id="repositoryUrl"
              type="url"
              placeholder="https://github.com/user/repo"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              aria-invalid={error !== null}
              disabled={submitting}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create project"}
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
    </Card>
  );
}

function ProjectCard({
  project,
  onDeleted,
}: {
  project: Project;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await api.projects.delete(project.id);
      onDeleted(project.id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "Failed to delete the project."
          : "Something went wrong. Please try again.",
      );
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Card className="p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3.5">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderGit2 className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${project.id}`}
                className="truncate font-display text-lg font-semibold hover:text-primary hover:underline"
              >
                {project.name}
              </Link>
              <StatusBadge status={project.currentStatus} />
            </div>

            <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <GitBranch className="size-3.5 shrink-0" />
              {project.repositoryUrl || "No repository URL"}
            </p>

            {project.websiteUrl && (
              <a
                href={project.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 truncate text-sm font-medium text-primary hover:underline"
              >
                {project.websiteUrl}
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            )}

            <p className="mt-2 text-xs text-faint">
              Updated {formatDate(project.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Delete?
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Link
                href={`/projects/${project.id}`}
                className={buttonLinkClass}
              >
                Open
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}

// A link styled like a small outline button (Link can't use the Button primitive).
const buttonLinkClass =
  "inline-flex h-8 items-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-3 text-[0.8rem] font-medium shadow-xs transition-colors hover:bg-muted";

function ProjectListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="flex items-start gap-3.5 p-5">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-4 w-64" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        </Card>
      ))}
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
