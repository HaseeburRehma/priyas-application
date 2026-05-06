import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names with conflict-aware merging.
 *
 * @example cn("px-2 py-1", isActive && "bg-primary-500", "py-2") // -> "px-2 bg-primary-500 py-2"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
