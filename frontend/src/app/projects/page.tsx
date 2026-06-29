"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FolderGit2, Plus } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the websites you deploy from GitHub.
            </p>
          </div>
          {!loading && !error && (
            <Button onClick={() => setCreating((value) => !value)}>
              <Plus />
              New project
            </Button>
          )}
        </div>

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
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : projects && projects.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} onDeleted={handleDeleted} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState onCreate={() => setCreating(true)} />
          )}
        </div>
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
      noValidate
    >
      <h2 className="text-base font-semibold">New project</h2>

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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-base font-semibold">{project.name}</h3>
            <StatusBadge status={project.currentStatus} />
          </div>

          <p className="mt-2 truncate text-sm text-muted-foreground">
            {project.repositoryUrl || "No repository URL"}
          </p>

          {project.websiteUrl && (
            <a
              href={project.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block truncate text-sm font-medium text-primary hover:underline"
            >
              {project.websiteUrl}
            </a>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            Updated {formatDate(project.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Delete?</span>
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
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <FolderGit2 className="size-8 text-muted-foreground" />
      <div>
        <p className="text-base font-semibold">No projects yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first project to deploy a website from GitHub.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus />
        New project
      </Button>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
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
