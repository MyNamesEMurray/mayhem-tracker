import { useCallback, useEffect, useState } from "react";

// Filters and tab live in the URL so views are linkable and survive reloads,
// without pulling in a router for what is a single-page site.
export function useUrlParams(): [URLSearchParams, (key: string, value: string | null) => void] {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));

  useEffect(() => {
    const onPop = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      return next;
    });
  }, []);

  return [params, setParam];
}
