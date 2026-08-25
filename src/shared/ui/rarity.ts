// The augment rarity palette, shared by the desktop app and mayhemstats.com.
//
// Rarity is the augment system's primary visual key, and it had drifted: the
// app rendered silver at gray-300 and gold at yellow-400 while the site used
// gray-400 and yellow-500, in both the filter chips and the rim drawn around
// an augment icon. Both files opened with a comment calling the palette unified.
//
// These are the site's values, which .design-sync already treats as canonical.
// The two steps are deliberate rather than accidental: the rim drawn around an
// icon sits one step stronger than the name beside it, so a 28px icon reads
// clearly without the text next to it turning garish.
//
// Keep utility words out of the prose here — Tailwind scans comments as well
// as code, so a bare one in a sentence mints a rule in both bundles.

export type Rarity = "all" | "kSilver" | "kGold" | "kPrismatic";

export const RARITY_LABEL: Record<string, string> = {
  kSilver: "Silver",
  kGold: "Gold",
  kPrismatic: "Prismatic",
};

// The name of an augment, tinted by its rarity
export const RARITY_TEXT: Record<string, string> = {
  kSilver: "text-gray-300",
  kGold: "text-yellow-400",
  kPrismatic: "text-fuchsia-400",
};

// The rim drawn around an augment icon — one step stronger than the name
export const RARITY_RING: Record<string, string> = {
  kSilver: "ring-1 ring-gray-400/60",
  kGold: "ring-1 ring-yellow-500/70",
  kPrismatic: "ring-1 ring-fuchsia-400/80",
};

// Filter chips: inactive chips carry the rarity colour as text on the plain
// border and tint that border on hover; active fills with the translucent
// rarity background.
export const RARITY_CHIPS: {
  key: Rarity;
  label: string;
  color: string;
  hover: string;
  active: string;
}[] = [
  {
    key: "all",
    label: "All",
    color: "text-lol-text",
    hover: "hover:border-lol-gold/50",
    active: "bg-lol-gold/15 text-lol-gold border-lol-gold/50",
  },
  {
    key: "kSilver",
    label: "Silver",
    color: "text-gray-300",
    hover: "hover:border-gray-400/50",
    active: "bg-gray-400/15 text-gray-200 border-gray-400/50",
  },
  {
    key: "kGold",
    label: "Gold",
    color: "text-yellow-400",
    hover: "hover:border-yellow-500/50",
    active: "bg-yellow-500/15 text-yellow-300 border-yellow-500/50",
  },
  {
    key: "kPrismatic",
    label: "Prismatic",
    color: "text-fuchsia-400",
    hover: "hover:border-fuchsia-400/50",
    active: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/50",
  },
];
