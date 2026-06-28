"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";

// Guards protected pages: verifies authentication before rendering and redirects
// unauthenticated users to the login page (see docs/12 "Protected Routes" and
// "Error Handling"). Protected pages wrap their content in this component.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user === null) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // While the session is being restored, or while redirecting an unauthenticated
  // user, do not render the protected content.
  if (loading || user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
