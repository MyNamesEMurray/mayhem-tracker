interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
  // Semantic value color (e.g. win-rate green, performance ramp for KDA);
  // defaults to bright text.
  valueClassName?: string;
}

export default function StatCard({
  label,
  value,
  subtext,
  className = "",
  valueClassName = "text-lol-text-bright",
}: StatCardProps) {
  return (
    <div className={`bg-lol-card rounded-xl border border-lol-border/60 p-4 ${className}`}>
      <div className="text-[11px] text-lol-text uppercase tracking-[0.08em] mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueClassName}`}>{value}</div>
      {subtext && <div className="text-xs text-lol-text mt-1">{subtext}</div>}
    </div>
  );
}
