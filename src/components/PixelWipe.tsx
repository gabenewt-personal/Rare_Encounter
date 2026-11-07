/** Blocky diagonal screen wipe used between questions. */
export function PixelWipe({ mode }: { mode: "in" | "out" | null }) {
  if (!mode) return null;
  const cols = 8;
  const rows = 12;
  return (
    <div className={`wipe wipe--${mode}`} aria-hidden>
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        return <span key={i} style={{ animationDelay: `${(r + c) * 14}ms` }} />;
      })}
    </div>
  );
}
