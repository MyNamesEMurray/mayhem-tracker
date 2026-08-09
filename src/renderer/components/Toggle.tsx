// The unified 34×20 toggle: gold track with dark knob when on
export default function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-5 w-[34px] shrink-0 cursor-pointer rounded-[10px] transition-colors duration-150 disabled:opacity-50 ${
        checked ? "bg-lol-gold" : "bg-lol-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform duration-150 ${
          checked ? "translate-x-[14px] bg-lol-dark" : "translate-x-0 bg-lol-text"
        }`}
      />
    </button>
  );
}
