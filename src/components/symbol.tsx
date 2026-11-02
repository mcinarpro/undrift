// The undrift symbol, from art/undrift-symbol.svg. Never redrawn: change the master and copy its path.
export function Symbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} role="img" aria-label="undrift">
      <path
        fill="currentColor"
        d="M128 13 A115 115 0 1 1 13 128 A79 79 0 0 1 92 49 A51 51 0 0 1 143 100 V118.36 A28 28 0 1 1 113 118.36 V100 A21 21 0 0 0 92 79 A49 49 0 0 0 43 128 A85 85 0 1 0 128 43 A15 15 0 0 1 128 13 Z"
      />
    </svg>
  );
}
