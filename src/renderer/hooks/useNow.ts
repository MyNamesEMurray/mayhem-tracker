import { useEffect, useState } from "react";

// Re-renders on an interval so relative timestamps ("3m ago") keep counting
// up while the window sits open, instead of freezing at whatever they said
// when the data last loaded.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
