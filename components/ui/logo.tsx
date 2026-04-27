import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-petrol-600", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7.5" fill="currentColor" />
      <path
        d="M16 6.5l8 3.2v6.6c0 4.3-3.2 8.2-8 9.6-4.8-1.4-8-5.3-8-9.6V9.7l8-3.2z"
        stroke="white"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12.5 16.5l2.5 2.5 5-5"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
