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
  Sparkles,
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
    description: "Publish straight from a public GitHub repository — just paste a URL.",
    icon: GitBranch,
  },
  {
    title: "Automatic Build Process",
    description: "Frameworks are detected and built for you in an isolated job.",
    icon: Hammer,
  },
  {
    title: "Cloud Hosting",
    description: "Static files are stored and served from durable cloud storage.",
    icon: Cloud,
  },
  {
    title: "Deployment Tracking",
    description: "Follow every deployment's status and read its build logs.",
    icon: Activity,
  },
  {
    title: "AWS Powered",
    description: "Runs on S3 and CloudFront behind the scenes — no setup for you.",
    icon: Server,
  },
  {
    title: "Instant Public URL",
    description: "Each deployment publishes to a fast, HTTPS CDN URL.",
    icon: Rocket,
  },
];

// See docs/09-frontend-pages.md "How It Works Section".
const steps = [
  {
    title: "Add Repository",
    description: "Create a project and point us at your public GitHub repository.",
  },
  {
    title: "Deploy",
    description: "Start a deployment with a single click and watch it build.",
  },
  {
    title: "Get Public URL",
    description: "Your site goes live on a public CloudFront URL in moments.",
  },
];

export default function LandingPage() {
  // The marketing page stays publicly viewable; when the visitor already has a
  // session we swap the call-to-action for an "Open app" shortcut (no hard
  // redirect, security unchanged). See docs/09-frontend-pages.md "Landing Page".
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Rocket className="size-4.5" />
            </span>
            <span className="text-[0.95rem] font-semibold tracking-tight">
              Hosting Platform
            </span>
          </div>
          {user ? (
            <Link href="/home" className={cn(buttonVariants())}>
              Open app
              <ArrowRight />
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost" }))}
              >
                Login
              </Link>
              <Link href="/register" className={cn(buttonVariants())}>
                Get Started
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Deploy static sites from GitHub
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              Deploy your website{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                in minutes
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
              Publish your static website directly from GitHub without managing
              AWS infrastructure, build pipelines, or DNS.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {user ? (
                <Link
                  href="/home"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "w-full sm:w-auto",
                  )}
                >
                  Open app
                  <ArrowRight />
                </Link>
              ) : (
                <>
                  <Link
                    href="/register"
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "w-full sm:w-auto",
                    )}
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
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted-foreground">
              From repository to live site in three steps.
            </p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="relative text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground shadow-sm">
                  {index + 1}
                </div>
                {index < steps.length - 1 && (
                  <span className="absolute left-[calc(50%+2.5rem)] top-6 hidden h-px w-[calc(100%-5rem)] bg-border sm:block" />
                )}
                <h3 className="mt-5 font-medium">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Everything you need to ship
              </h2>
              <p className="mt-3 text-muted-foreground">
                A complete static hosting workflow, without the infrastructure work.
              </p>
            </div>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-medium">{feature.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to deploy?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Create an account and publish your first site in minutes.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href={user ? "/home" : "/register"}
                className={cn(buttonVariants({ size: "lg" }))}
              >
                {user ? "Open app" : "Get Started"}
                <ArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-primary" />
            <span className="font-medium text-foreground">Hosting Platform</span>
          </div>
          <span>Deploy static websites from GitHub.</span>
        </div>
      </footer>
    </div>
  );
}
