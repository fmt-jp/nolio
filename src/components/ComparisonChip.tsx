import { Delta } from "@/lib/format";

export default function ComparisonChip({
  label,
  delta,
  goodDirection,
}: {
  label: string;
  delta: Delta;
  goodDirection: "up" | "down";
}) {
  if (delta.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {label} 変化なし
      </span>
    );
  }

  const isGood = delta.direction === goodDirection;
  const colorClass = isGood
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-600";
  const valueText = delta.pct === null ? "新規" : `${Math.abs(delta.pct).toFixed(1)}%`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${colorClass}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className={delta.direction === "up" ? "rotate-180" : ""}
      >
        <path
          d="M5 2V8M5 8L2 5M5 8L8 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label} {valueText}
    </span>
  );
}
