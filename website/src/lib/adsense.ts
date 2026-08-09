// Google AdSense configuration. Everything stays inert until AD_CLIENT is
// set, so the site runs ad-free (no scripts, no layout impact) before
// approval and after any future removal.
//
// To activate after AdSense approval:
//  1. Set AD_CLIENT to your publisher id, e.g. "ca-pub-1234567890123456"
//  2. Create two display ad units in the AdSense dashboard and put their
//     slot ids in AD_SLOTS below
//  3. Replace the placeholder line in public/ads.txt with the one AdSense
//     shows under Account > ads.txt
export const AD_CLIENT = "";

export const AD_SLOTS = {
  // Responsive display unit below the filter bar
  top: "",
  // Responsive display unit above the footer
  bottom: "",
};

export function adsEnabled(): boolean {
  return AD_CLIENT.length > 0;
}

let loaded = false;

// Injects the AdSense loader once. Consent messaging (GDPR/CCPA) is served
// by this same tag, configured in the AdSense dashboard under
// Privacy & messaging.
export function loadAdSense(): void {
  if (!adsEnabled() || loaded) return;
  loaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}
