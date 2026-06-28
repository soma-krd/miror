// Miror logo — Apple/SF Symbols-inspired design.
// Thinner strokes, cleaner geometry, more refined than the previous version.
// The hexagon is more subtle, the chevron is lighter, the status dot is smaller.

interface MirorLogoProps {
  className?: string;
  /** Size in pixels. Defaults to 28 (Apple sidebar icon size). */
  size?: number;
  /** Show the status dot (amber). Default true. */
  showStatusDot?: boolean;
}

export function MirorLogo({ className, size = 28, showStatusDot = true }: MirorLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-label="Miror"
      role="img"
    >
      {/* Hexagon — thinner stroke, Apple SF Symbol weight */}
      <polygon
        points="27,16 21,26.08 9,26.08 3,16 9,5.92 21,5.92"
        fill="#0A84FF"
        fillOpacity="0.08"
        stroke="#0A84FF"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Chevron — lighter, matches SF Symbol "play" weight */}
      <polygon
        points="11,11 13.5,11 18,16 13.5,21 11,21 15.5,16"
        fill="currentColor"
      />
      {/* Status dot — smaller, Apple-style */}
      {showStatusDot && (
        <>
          <circle cx="21" cy="9.5" r="1.25" fill="#FF9F0A" />
        </>
      )}
    </svg>
  );
}

// Large variant — for splash screens, about dialogs
export function MirorLogoLarge({ className, size = 120 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-label="Miror"
      role="img"
    >
      {/* Slate rounded-square background — Apple app icon style */}
      <rect width="128" height="128" rx="28" fill="#1C1C1E" />
      {/* Subtle top-light gradient for depth */}
      <rect width="128" height="64" rx="28" fill="#2C2C2E" opacity="0.5" />

      {/* Hexagon — Apple SF Blue */}
      <polygon
        points="108,64 86,102.04 42,102.04 20,64 42,25.96 86,25.96"
        fill="#0A84FF"
        fillOpacity="0.10"
        stroke="#0A84FF"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Chevron */}
      <polygon
        points="48,44 54,44 70,64 54,84 48,84 62,64"
        fill="#F5F5F7"
      />
      {/* Status dot */}
      <circle cx="86" cy="38" r="3.5" fill="#FF9F0A" />
    </svg>
  );
}
