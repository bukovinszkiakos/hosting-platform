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
import { Logo } from "@/components/ui/logo";
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
    <div className="flex min-h-screen animate-fade-in flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo size="lg" />
            <span className="font-display text-[19px] font-bold">
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
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-glow" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-mask" />
          <div className="relative mx-auto w-full max-w-[900px] px-6 py-28 text-center sm:px-8 sm:py-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-primary shadow-xs">
              <Sparkles className="size-3.5" />
              Deploy static sites from GitHub
            </span>
            <h1 className="font-display mx-auto mt-7 max-w-3xl text-balance text-5xl font-bold leading-[1.02] sm:text-[78px]">
              Deploy your website
              <br />
              <span className="bg-[linear-gradient(115deg,var(--brand),color-mix(in_oklch,var(--brand)_60%,oklch(0.62_0.2_330)))] bg-clip-text text-transparent">
                in minutes
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground sm:text-xl">
              Publish your static website directly from GitHub without managing
              AWS infrastructure, build pipelines, or DNS.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-6 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold sm:text-[44px]">
              How it works
            </h2>
            <p className="mt-2.5 text-lg text-muted-foreground">
              From repository to live site in three steps.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="px-3.5 py-2 text-center">
                <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-[15px] bg-[linear-gradient(150deg,var(--brand),color-mix(in_oklch,var(--brand),black_22%))] font-display text-xl font-bold text-white shadow-[0_8px_18px_-6px_color-mix(in_oklch,var(--brand)_55%,transparent)]">
                  {index + 1}
                </div>
                <h3 className="font-display text-xl font-semibold">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[280px] text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-border bg-[color-mix(in_oklch,var(--background),oklch(0.5_0.03_265)_3%)]">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-22 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold sm:text-[44px]">
                Everything you need to ship
              </h2>
              <p className="mt-2.5 text-lg text-muted-foreground">
                A complete static hosting workflow, without the infrastructure work.
              </p>
            </div>
            <div className="mt-13 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04),0_14px_30px_-20px_rgba(20,20,45,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(20,20,40,0.05),0_22px_42px_-22px_rgba(20,20,45,0.28)]"
                  >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="font-display mt-4 text-lg font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-[1120px] px-6 py-22 sm:px-8">
          <div className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(155deg,color-mix(in_oklch,var(--brand),black_4%),color-mix(in_oklch,var(--brand),black_30%))] px-6 py-[76px] text-center shadow-[0_34px_66px_-34px_color-mix(in_oklch,var(--brand)_62%,transparent)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-100 [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(70%_80%_at_50%_0%,#000,transparent)]"
            />
            <div className="relative">
              <h2 className="font-display text-3xl font-bold text-white sm:text-5xl">
                Ready to deploy?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-lg text-white/80">
                Create an account and publish your first site in minutes.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href={user ? "/home" : "/register"}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-bold text-[color-mix(in_oklch,var(--brand),black_12%)] shadow-[0_10px_26px_-10px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-0.5"
                >
                  {user ? "Open app" : "Get Started"}
                  <ArrowRight className="size-4.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center justify-between gap-3.5 px-6 py-7 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-foreground">
              Hosting Platform
            </span>
          </div>
          <span className="text-[13.5px] text-faint">
            © 2026 Hosting Platform. Deploy static sites from GitHub.
          </span>
        </div>
      </footer>
    </div>
  );
}
