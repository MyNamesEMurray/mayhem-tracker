import { useEffect, useRef } from "react";
import { AD_CLIENT, adsEnabled } from "../lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// A responsive AdSense display unit. Renders nothing at all while ads are
// unconfigured, so the layout is identical with ads off.
export default function AdSlot({ slot }: { slot: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!adsEnabled() || !slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked or not yet loaded — the unit simply stays empty
    }
  }, [slot]);

  if (!adsEnabled() || !slot) return null;

  return (
    <div className="my-4">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
