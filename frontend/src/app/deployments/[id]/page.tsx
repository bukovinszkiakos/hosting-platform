"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Rocket, Terminal, TriangleAlert } from "lucide-react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  api,
  ApiError,
  isDeploymentActive,
  type Deployment,
  type DeploymentLog,
} from "@/services/api";

// How often an in-progress deployment is refreshed (see finding: live updates).
const POLL_INTERVAL_MS = 5000;

export default function DeploymentDetailsPage() {
  return (
    <ProtectedRoute>
      <DeploymentDetailsView />
    </ProtectedRoute>
  );
}

function DeploymentDetailsView() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      api.deployments.get(id, controller.signal),
      api.deployments.logs(id, controller.signal),
    ])
      .then(([deploymentData, logData]) => {
        setDeployment(deploymentData);
        setLogs(logData);
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load the deployment.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [id]);

  // Live updates: while the deployment is still in progress, refresh it and its
  // logs on an interval, and stop automatically once it reaches a terminal state
  // (Online/Failed). Poll errors are ignored so a transient failure does not
  // clobber the current view; a 401 is still handled centrally by apiFetch.
  const isActive = deployment ? isDeploymentActive(deployment.status) : false;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const controller = new AbortController();
    const interval = setInterval(() => {
      Promise.all([
        api.deployments.get(id, controller.signal),
        api.deployments.logs(id, controller.signal),
      ])
        .then(([deploymentData, logData]) => {
          if (controller.signal.aborted) {
            return;
          }
          setDeployment(deploymentData);
          setLogs(logData);
        })
        .catch(() => {
          // Ignore transient poll errors; the next tick retries.
        });
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [id, isActive]);

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
            <DeploymentDetailsSkeleton />
          ) : error ? (
            <Card className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
              {error}
            </Card>
          ) : deployment ? (
            <div className="flex flex-col gap-6">
              <DeploymentInformation deployment={deployment} />
              {deployment.errorMessage && (
                <ErrorInformation message={deployment.errorMessage} />
              )}
              <BuildLogs logs={logs} />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function DeploymentInformation({ deployment }: { deployment: Deployment }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Rocket className="size-5.5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold">Deployment</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Started {formatDateTime(deployment.startedAt)}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        <Field label="Status">
          <StatusBadge status={deployment.status} />
        </Field>
        <Field label="Duration">
          {deployment.finishedAt ? (
            duration(deployment.startedAt, deployment.finishedAt)
          ) : (
            <span className="text-muted-foreground">In progress</span>
          )}
        </Field>
        <Field label="Started at">{formatDateTime(deployment.startedAt)}</Field>
        <Field label="Finished at">
          {deployment.finishedAt ? (
            formatDateTime(deployment.finishedAt)
          ) : (
            <span className="text-muted-foreground">In progress</span>
          )}
        </Field>
        <Field label="Build summary" full>
          {deployment.buildSummary ? (
            deployment.buildSummary
          ) : (
            <span className="text-muted-foreground">Not available yet</span>
          )}
        </Field>
      </dl>
    </Card>
  );
}

function ErrorInformation({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-5" role="alert">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <TriangleAlert className="size-4" />
        Build failed
      </h2>
      <p className="mt-2 text-sm text-destructive/90">{message}</p>
    </Card>
  );
}

function BuildLogs({ logs }: { logs: DeploymentLog[] }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Terminal className="size-4.5 text-muted-foreground" />
        Build logs
      </h2>

      {logs.length === 0 ? (
        <Card className="mt-3 border-dashed p-10 text-center text-sm text-muted-foreground shadow-none">
          No build logs available.
        </Card>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-foreground/[0.97] shadow-sm">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-2 text-xs font-medium text-white/50">
              build output
            </span>
          </div>
          <div className="overflow-x-auto p-4">
            <pre className="font-mono text-xs leading-relaxed text-white/85">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-3">
                  <span className="shrink-0 text-white/35 select-none tabular-nums">
                    {formatLogTime(log.createdAt)}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {log.message}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "bg-card p-4 sm:col-span-2" : "bg-card p-4"}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function DeploymentDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-7 w-40" />
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
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-24 w-full rounded-xl" />
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

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function duration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
