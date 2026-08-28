import { useCallback, useEffect, useState } from "react";

// Path + query state without pulling in a router. setParam tweaks the query
// in place (replaceState - filters don't create history entries) while
// navigate changes the path (pushState - page changes do), carrying the
// current filters along.
export function useUrlState(): {
  path: string;
  params: URLSearchParams;
  setParam: (key: string, value: string | null) => void;
  navigate: (path: string) => void;
  replaceUrl: (path: string, params: URLSearchParams) => void;
} {
  const [path, setPath] = useState(window.location.pathname);
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));

  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname);
      setParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
      return next;
    });
  }, []);

  const navigate = useCallback((nextPath: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      // The legacy champion query param never survives a navigation
      next.delete("champion");
      const query = next.toString();
      window.history.pushState(null, "", `${nextPath}${query ? `?${query}` : ""}`);
      return next;
    });
    setPath(nextPath);
    window.scrollTo(0, 0);
  }, []);

  // One-shot URL rewrite without a history entry (legacy-link canonicalization)
  const replaceUrl = useCallback((nextPath: string, nextParams: URLSearchParams) => {
    const query = nextParams.toString();
    window.history.replaceState(null, "", `${nextPath}${query ? `?${query}` : ""}`);
    setPath(nextPath);
    setParams(nextParams);
  }, []);

  return { path, params, setParam, navigate, replaceUrl };
}
