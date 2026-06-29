"use client";

import { useEffect, useState, type ComponentType } from "react";
import { FolderGit2, Rocket, ShieldX, Users } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import {
  api,
  ApiError,
  type AdminProject,
  type AdminUser,
  type Deployment,
} from "@/services/api";

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminView />
    </ProtectedRoute>
  );
}

function AdminView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Non-admins never trigger the admin requests (the API also returns 403).
    if (!isAdmin) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      api.admin.users(controller.signal),
      api.admin.projects(controller.signal),
      api.admin.deployments(controller.signal),
    ])
      .then(([userData, projectData, deploymentData]) => {
        setUsers(userData);
        setProjects(projectData);
        setDeployments(deploymentData);
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load admin data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [isAdmin]);

  if (user && !isAdmin) {
    return (
      <AppShell isAdmin={false}>
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
            <ShieldX className="size-8 text-muted-foreground" />
            <div>
              <p className="text-base font-semibold">Access denied</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This page is only available to administrators.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const onlineDeployments = deployments.filter((d) => d.status === "Online").length;
  const failedDeployments = deployments.filter((d) => d.status === "Failed").length;

  return (
    <AppShell isAdmin>
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-wide users, projects, and deployment statistics.
        </p>

        <div className="mt-6">
          {loading ? (
            <AdminSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Total Users" value={users.length} icon={Users} />
                <StatCard label="Total Projects" value={projects.length} icon={FolderGit2} />
                <StatCard label="Total Deployments" value={deployments.length} icon={Rocket} />
                <StatCard label="Online Deployments" value={onlineDeployments} icon={Rocket} />
                <StatCard label="Failed Deployments" value={failedDeployments} icon={Rocket} />
              </div>

              <UsersTable users={users} />
              <ProjectsTable projects={projects} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function UsersTable({ users }: { users: AdminUser[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Users</h2>
      {users.length === 0 ? (
        <EmptyRow message="No users found." />
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <Th>Display Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Created At</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <Td>{u.displayName}</Td>
                  <Td className="text-muted-foreground">{u.email}</Td>
                  <Td>
                    <StatusPill label={u.role} highlight={u.role === "Admin"} />
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(u.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProjectsTable({ projects }: { projects: AdminProject[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Projects</h2>
      {projects.length === 0 ? (
        <EmptyRow message="No projects found." />
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <Th>Name</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th>Created At</Th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <Td>{p.name}</Td>
                  <Td className="text-muted-foreground">{p.ownerEmail}</Td>
                  <Td>
                    <StatusPill label={p.currentStatus} />
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(p.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ label, highlight = false }: { label: string; highlight?: boolean }) {
  const tone =
    label === "Online"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : label === "Failed"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : highlight
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", tone)}
    >
      {label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-5">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
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
