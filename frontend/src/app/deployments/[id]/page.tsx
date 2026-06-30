"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  api,
  ApiError,
  type Deployment,
  type DeploymentLog,
} from "@/services/api";

export default function DeploymentDetailsPage() {
  return (
    <ProtectedRoute>
      <DeploymentDetailsView />
    </ProtectedRoute>
  );
}

function DeploymentDetailsView() {
  const { user } = useAuth();
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
            <DeploymentDetailsSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
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
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Deployment</h1>
        <StatusBadge status={deployment.status} />
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Status">{deployment.status}</Field>
        <Field label="Started At">{formatDateTime(deployment.startedAt)}</Field>
        <Field label="Finished At">
          {deployment.finishedAt ? (
            formatDateTime(deployment.finishedAt)
          ) : (
            <span className="text-muted-foreground">In progress</span>
          )}
        </Field>
        <Field label="Build Summary">
          {deployment.buildSummary ? (
            deployment.buildSummary
          ) : (
            <span className="text-muted-foreground">Not available yet</span>
          )}
        </Field>
      </dl>
    </div>
  );
}

function ErrorInformation({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
    >
      <h2 className="text-sm font-semibold text-destructive">Build failed</h2>
      <p className="mt-1 text-sm text-destructive">{message}</p>
    </div>
  );
}

function BuildLogs({ logs }: { logs: DeploymentLog[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Build Logs</h2>

      {logs.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No build logs available.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4">
          <pre className="font-mono text-xs leading-relaxed">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-3">
                <span className="shrink-0 text-muted-foreground">
                  {formatLogTime(log.createdAt)}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {log.message}
                </span>
              </div>
            ))}
          </pre>
        </div>
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
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function DeploymentDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
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
