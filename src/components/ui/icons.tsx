/**
 * Inline icons. Kept as hand-written SVG rather than an icon package — the
 * whole set below costs less than the smallest tree-shaken icon library.
 */

type IconProps = { className?: string };

const base = "shrink-0";

export function WhatsAppIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2 22l5.33-1.4a9.83 9.83 0 0 0 4.71 1.2h.01c5.43 0 9.85-4.42 9.85-9.86A9.8 9.8 0 0 0 19 4.87 9.78 9.78 0 0 0 12.04 2zm0 1.8c2.15 0 4.17.84 5.69 2.36a8.01 8.01 0 0 1 2.36 5.7c0 4.44-3.61 8.05-8.06 8.05a8.05 8.05 0 0 1-4.1-1.12l-.3-.18-3.05.8.81-2.97-.19-.31a8 8 0 0 1-1.23-4.28c0-4.44 3.62-8.05 8.07-8.05z" />
    </svg>
  );
}

export function ArrowIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function ChevronIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function PlusIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function MinusIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M3 8h10" />
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="m3 8.5 3.5 3.5L13 5" />
    </svg>
  );
}

export function CloseIcon({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function MenuIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}

export function PinIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M10 17.5s5.5-4.9 5.5-9a5.5 5.5 0 1 0-11 0c0 4.1 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.5" r="2" />
    </svg>
  );
}

export function ClockIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 1.8" />
    </svg>
  );
}

export function PhoneIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M6.2 3.5 8 7l-1.6 1.6a10.5 10.5 0 0 0 5 5L13 12l3.5 1.8-.6 2.4a1.4 1.4 0 0 1-1.5 1A12.8 12.8 0 0 1 3.3 5.6a1.4 1.4 0 0 1 1-1.5Z" />
    </svg>
  );
}

export function BoxIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M10 2.5 3 6v8l7 3.5L17 14V6l-7-3.5Z" />
      <path d="M3 6l7 3.5L17 6M10 9.5v8" />
    </svg>
  );
}

export function UsersIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16.5a5 5 0 0 1 10 0" />
      <path d="M13.5 4.6a2.75 2.75 0 0 1 0 4.8M14.5 12.2a5 5 0 0 1 3 4.3" />
    </svg>
  );
}

export function SheetIcon({ className = "size-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      <path d="M4.5 2.5h11v15h-11z" />
      <path d="M7 6.5h6M7 10h6M7 13.5h3.5" />
    </svg>
  );
}
