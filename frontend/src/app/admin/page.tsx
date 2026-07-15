"use client";

import { useEffect, useState } from "react";
import {
  CircleCheck,
  CircleX,
  FolderGit2,
  Rocket,
  ShieldX,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn, initials } from "@/lib/utils";
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
  // Only the admin data path loads; non-admins render "Access denied" and never
  // fetch, so loading starts true only when a request is actually about to run.
  // (ProtectedRoute guarantees `user` — and thus `isAdmin` — is known on mount.)
  const [loading, setLoading] = useState(isAdmin);
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
      <AppShell>
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldX className="size-7" />
          </span>
          <div>
            <p className="font-display text-xl font-bold">Access denied</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This page is only available to administrators.
            </p>
          </div>
        </Card>
      </AppShell>
    );
  }

  const onlineDeployments = deployments.filter((d) => d.status === "Online").length;
  const failedDeployments = deployments.filter((d) => d.status === "Failed").length;

  return (
    <AppShell>
      <PageHeader
        title="Admin"
        description="Platform-wide users, projects, and deployment statistics."
      />

      <div className="mt-8">
        {loading ? (
          <AdminSkeleton />
        ) : error ? (
          <Card
            className="border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
            role="alert"
          >
            {error}
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label="Total Users"
                value={users.length}
                icon={Users}
                accent="bg-primary/10 text-primary"
              />
              <StatCard
                label="Total Projects"
                value={projects.length}
                icon={FolderGit2}
                accent="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                label="Total Deployments"
                value={deployments.length}
                icon={Rocket}
                accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              />
              <StatCard
                label="Online Deployments"
                value={onlineDeployments}
                icon={CircleCheck}
                accent="bg-success/10 text-success"
              />
              <StatCard
                label="Failed Deployments"
                value={failedDeployments}
                icon={CircleX}
                accent="bg-destructive/10 text-destructive"
              />
            </div>

            <UsersTable users={users} />
            <ProjectsTable projects={projects} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function UsersTable({ users }: { users: AdminUser[] }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Users</h2>
      {users.length === 0 ? (
        <EmptyRow message="No users found." />
      ) : (
        <Card className="mt-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                  <Th>User</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.7rem] font-semibold text-primary">
                          {initials(u.displayName)}
                        </span>
                        <span className="font-medium">{u.displayName}</span>
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{u.email}</Td>
                    <Td>
                      <RolePill role={u.role} />
                    </Td>
                    <Td className="text-muted-foreground tabular-nums">
                      {formatDate(u.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}

function ProjectsTable({ projects }: { projects: AdminProject[] }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Projects</h2>
      {projects.length === 0 ? (
        <EmptyRow message="No projects found." />
      ) : (
        <Card className="mt-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                  <Th>Name</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <Td className="font-medium">{p.name}</Td>
                    <Td className="text-muted-foreground">{p.ownerEmail}</Td>
                    <Td>
                      <StatusBadge status={p.currentStatus} />
                    </Td>
                    <Td className="text-muted-foreground tabular-nums">
                      {formatDate(p.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}

function RolePill({ role }: { role: string }) {
  const isAdmin = role === "Admin";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        isAdmin
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {role}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
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
    <Card className="mt-3 border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">
      {message}
    </Card>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-9 rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-10 w-14" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
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
