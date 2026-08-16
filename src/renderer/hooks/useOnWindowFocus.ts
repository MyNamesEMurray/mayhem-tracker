import { useEffect, useRef } from "react";

// Re-reads data whenever the window comes back to the front. Games recorded
// while the app sat in the tray never produced a renderer event (there was
// no window to send one to), so without this the list can be behind the
// database until something else happens to refetch.
export function useOnWindowFocus(callback: () => void) {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    const fire = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    window.addEventListener("focus", fire);
    document.addEventListener("visibilitychange", fire);
    return () => {
      window.removeEventListener("focus", fire);
      document.removeEventListener("visibilitychange", fire);
    };
  }, []);
}
