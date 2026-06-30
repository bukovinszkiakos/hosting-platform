import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Up to two uppercase initials from a name/email, for avatar chips.
export function initials(value: string | null | undefined): string {
  const source = (value ?? "").trim()
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  const letters =
    parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : source.slice(0, 2)
  return letters.toUpperCase()
}
