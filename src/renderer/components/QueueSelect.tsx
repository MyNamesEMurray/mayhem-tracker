import { useEffect, useState } from "react";
import SharedQueueSelect, { queueLabel as sharedQueueLabel } from "../../shared/ui/QueueSelect";

// The app's queue list comes over IPC from the local database, so resolving it
// is what this does; the control is shared with the website.
export function queueLabel(queueId: number | undefined): string {
  return sharedQueueLabel(queueId);
}

export default function QueueSelect({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (queue: number | undefined) => void;
}) {
  const [queues, setQueues] = useState<number[]>([]);

  useEffect(() => {
    const fetchQueues = () => window.api.getMatchFilterOptions().then((o) => setQueues(o.queues));
    fetchQueues();
    const unsub = window.api.onGamesUpdated(fetchQueues);
    return unsub;
  }, []);

  // Clear a selection new data leaves without any matching games
  useEffect(() => {
    if (value !== undefined && queues.length > 0 && !queues.includes(value)) {
      onChange(undefined);
    }
  }, [queues, value, onChange]);

  return <SharedQueueSelect queues={queues} value={value} onChange={onChange} />;
}
