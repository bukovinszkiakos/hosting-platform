"use client";

import type { ComponentType } from "react";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Cloud,
  GitBranch,
  Hammer,
  Rocket,
  Server,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Feature = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

// See docs/09-frontend-pages.md "Features Section".
const features: Feature[] = [
  {
    title: "GitHub Integration",
    description: "Publish straight from a public GitHub repository.",
    icon: GitBranch,
  },
  {
    title: "Automatic Build Process",
    description: "Frameworks are detected and built for you.",
    icon: Hammer,
  },
  {
    title: "Cloud Hosting",
    description: "Static files are stored and served from the cloud.",
    icon: Cloud,
  },
  {
    title: "Deployment Tracking",
    description: "Follow every deployment's status and logs.",
    icon: Activity,
  },
  {
    title: "AWS Powered Infrastructure",
    description: "Runs on S3 and CloudFront behind the scenes.",
    icon: Server,
  },
];

// See docs/09-frontend-pages.md "How It Works Section".
const steps = [
  { title: "Add Repository", description: "Point us at your public GitHub repository." },
  { title: "Deploy", description: "Start a deployment with a single click." },
  { title: "Get Public URL", description: "Your site goes live on a public URL." },
];

export default function LandingPage() {
  // The marketing page stays publicly viewable; when the visitor already has a
  // session we just swap the call-to-action for an "Open app" shortcut (no hard
  // redirect, security unchanged). See docs/09-frontend-pages.md "Landing Page".
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Rocket className="size-5 text-primary" />
            <span className="text-base font-semibold">Hosting Platform</span>
          </div>
          {user ? (
            <Link href="/home" className={cn(buttonVariants({ variant: "ghost" }))}>
              Open app
            </Link>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
              Login
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-5xl px-4 py-20 text-center sm:py-28">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Deploy Your Website In Minutes
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Publish your static website directly from GitHub without managing AWS
            infrastructure.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {user ? (
              <Link
                href="/home"
                className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
              >
                Open app
                <ArrowRight />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
                >
                  Get Started
                  <ArrowRight />
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "w-full sm:w-auto",
                  )}
                >
                  Login
                </Link>
              </>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-semibold">How It Works</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="flex flex-col items-center text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="mt-4 font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold">Everything you need to ship</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <Icon className="size-6 text-primary" />
                  <h3 className="mt-4 font-medium">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-center text-sm text-muted-foreground">
          Hosting Platform
        </div>
      </footer>
    </div>
  );
}
