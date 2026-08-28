import { QUEUE_LABELS, QUEUE_ID_MAYHEM } from "../queues";

// The queue filter both surfaces use. Like the patch picker, it holds no state:
// the site keeps its selection in a URL parameter, the app in component state,
// and both hand a value in and get one back.
//
// undefined means every queue. That is the explicit choice at the bottom of the
// list, not the default, because a board mixing ARAM Mayhem with its Classic
// variant is not a tier list of either.
export default function QueueSelect({
  queues,
  value,
  onChange,
  size = "lg",
}: {
  queues: number[];
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
  size?: "sm" | "lg";
}) {
  // A dropdown offering one option is noise. Still rendered when a queue is
  // explicitly selected, so a filter someone set never vanishes with the
  // control that set it.
  if (queues.length < 2 && value === undefined) return null;

  const ordered = [
    ...(queues.includes(QUEUE_ID_MAYHEM) ? [QUEUE_ID_MAYHEM] : []),
    ...queues.filter((q) => q !== QUEUE_ID_MAYHEM).sort((a, b) => a - b),
  ];

  return (
    <select
      className={`select ${size === "sm" ? "select-sm" : "select-lg"}`}
      value={value ?? "all"}
      onChange={(e) => onChange(e.target.value === "all" ? undefined : Number(e.target.value))}
      aria-label="Queue"
    >
      {ordered.map((q) => (
        <option key={q} value={q}>
          {queueLabel(q)}
        </option>
      ))}
      <option value="all">All queues</option>
    </select>
  );
}

export function queueLabel(queueId: number | undefined): string {
  if (queueId === undefined) return "All Queues";
  return QUEUE_LABELS[queueId] ?? `Queue ${queueId}`;
}
