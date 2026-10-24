import React from "react";
// Original line-art spider, never a character mask or a Marvel/Sony emblem.
export function SpiderMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 96"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="40" cy="57" rx="10" ry="16" fill="currentColor" />
      <circle cx="40" cy="33" r="8" fill="currentColor" />
      <path
        d="M32 40 16 24 12 6M48 40l16-16 4-18M30 48 8 38 2 20M50 48l22-10 6-18M30 56 10 62 4 82M50 56l20 6 6 20M34 66 20 80 18 94M46 66l14 14 2 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
