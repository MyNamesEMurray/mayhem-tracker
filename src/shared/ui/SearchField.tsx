import { ClearIcon } from "./icons";

// The search box, shared by the desktop app and mayhemstats.com.
//
// This was written five times: three of them written out by hand in the app —
// the whole input, the clear button and its 300-character path each time —
// plus the site's SearchInput, plus a second local copy in its champion page
// because the shared one "carries a clear button and larger default width than
// these panel headers want". That last one is the lesson: a shared component
// that only covers the common case gets forked rather than extended, so this
// takes the union — the width is settable, and the clear button is optional.
export default function SearchField({
  value,
  onChange,
  placeholder,
  width,
  className = "",
  clearable = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // Fixed width in pixels — 192 is the 12rem the app's tables have always
  // used. Omit it and the field fills whatever it is given, which is what the
  // champion page's panel headers want.
  width?: number;
  className?: string;
  clearable?: boolean;
}) {
  const showClear = clearable && value !== "";
  return (
    <div className={`relative ${width == null ? "w-full" : ""} ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input ${width == null ? "w-full" : ""} ${clearable ? "pr-7" : ""}`}
        style={width == null ? undefined : { width }}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-lol-text/50 hover:text-lol-text-bright transition-colors"
        >
          <ClearIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
