import type { ReactNode } from "react";

// The house furniture: the card every panel is drawn on, the label above it,
// and the gold call to action.
//
// None of these existed. PANEL and LABEL were declared as string constants in
// three files with identical values, the panel's classes were written out in
// sixteen more places, and the gold button was hand-written eight times with
// the values pulling apart as it went - border at /50, /30 or /25, background
// at /15 or /10, hover at /25 or /20, radius lg or md, text xs or 13px, and
// five different padding pairs.

// The panel surface. `bg-lol-card` on a `lol-border/60` hairline, extended
// with whatever padding or layout the caller wants.
export const PANEL = "bg-lol-card rounded-xl border border-lol-border/60";

// The muted heading above a panel or a column of stats.
export const LABEL = "text-[11px] font-medium uppercase tracking-[.08em] text-lol-text";

export function Panel({
  className = "",
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`${PANEL} ${className}`} {...rest}>
      {children}
    </div>
  );
}

// Gold means brand, interaction and "you" - never performance, which is what
// the amber/sky/emerald ramp is for, and never an outcome, which is win green
// and loss red. One size, because the eight it had grown were not deliberate.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold " +
  "transition-colors disabled:opacity-50 cursor-pointer";

const BUTTON_TONE = {
  gold: "border-lol-gold/50 bg-lol-gold/15 text-lol-gold hover:bg-lol-gold/25",
  // The quieter one, for anything sitting beside a gold button
  plain: "border-lol-border bg-lol-card text-lol-text hover:border-lol-gold/40 hover:text-lol-gold",
} as const;

const BUTTON_SIZE = {
  sm: "px-3 py-1 text-xs",
  md: "px-3.5 py-1.5 text-[13px]",
  lg: "px-5 py-2 text-[13px]",
} as const;

// The same look for an element that is a link rather than a button - the
// site's two download calls to action are anchors.
export function buttonClass(
  tone: keyof typeof BUTTON_TONE = "gold",
  size: keyof typeof BUTTON_SIZE = "md",
  className = "",
): string {
  return `${BUTTON_BASE} ${BUTTON_TONE[tone]} ${BUTTON_SIZE[size]} ${className}`;
}

export function Button({
  tone = "gold",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  tone?: keyof typeof BUTTON_TONE;
  size?: keyof typeof BUTTON_SIZE;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={buttonClass(tone, size, className)} {...rest}>
      {children}
    </button>
  );
}

// A single number with its name above it. The app called this StatCard and the
// site called it Tile, and they disagreed by two pixels of padding, a font
// weight and a margin.
export function StatTile({
  label,
  value,
  sub,
  valueClassName = "text-lol-text-bright",
  className = "",
}: {
  label: string;
  value: string | number;
  sub?: string;
  // For a value that carries meaning - a win rate, a performance ramp
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={`${PANEL} p-[18px] ${className}`}>
      <p className={LABEL}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClassName}`}>{value}</p>
      {sub && <p className="text-xs text-lol-text mt-0.5">{sub}</p>}
    </div>
  );
}
