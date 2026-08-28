import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

// Long enough that dragging the pointer across a row of icons doesn't flash a
// bubble over each one in turn, short enough to still read as a hover response
const OPEN_DELAY_MS = 130;
// Space between the trigger and the bubble, and the least the bubble keeps
// from the window edge
const GAP = 8;
const EDGE = 8;

export interface Tooltip<T extends HTMLElement> {
  // Spread onto the element the tooltip describes. It carries the ref, so the
  // element can't already have one of its own.
  triggerProps: {
    ref: RefObject<T | null>;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  // Render anywhere inside the trigger's component - it portals out to the
  // document, so it isn't clipped by a scrolling list or a table cell
  tooltip: ReactNode;
}

/**
 * Hover tooltip for an element that can't afford a wrapper: icons sit inside
 * grids and truncating flex rows where an extra box would shift the layout, so
 * the trigger stays exactly the element it already was and only gains
 * handlers.
 *
 * The bubble is positioned by hand rather than with `absolute` inside the
 * trigger because the things it describes live in scrolling panes and
 * `overflow-hidden` cells, which would clip it.
 *
 * Shared by the desktop app and mayhemstats.com. This existed twice, with a
 * note in each copy asking the next person to change both.
 */
export function useTooltip<T extends HTMLElement>(content: ReactNode): Tooltip<T> {
  const triggerRef = useRef<T | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  // Null until the bubble has been measured - it renders hidden for that one
  // frame so it can't be seen in the corner on its way to the trigger
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    setOpen(false);
    setAt(null);
  }, []);

  const scheduleOpen = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, []);

  useEffect(() => close, [close]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const anchor = trigger.getBoundingClientRect();
    const { width, height } = bubble.getBoundingClientRect();

    // Above by preference, below when the trigger is near the top of the
    // window - the app's densest augment rows sit under a pinned header
    const above = anchor.top - height - GAP;
    const below = Math.min(anchor.bottom + GAP, window.innerHeight - height - EDGE);
    const top = Math.max(EDGE, above >= EDGE ? above : below);
    const centered = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centered), window.innerWidth - width - EDGE);

    // Measuring places the bubble, which re-renders it, which would measure
    // again - so the position is only written once it stops moving
    setAt((current) =>
      current && current.left === left && current.top === top ? current : { left, top },
    );
  });

  // A tooltip pinned to a viewport position goes stale the moment anything
  // moves, and every list it appears in scrolls
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [open, close]);

  return {
    triggerProps: {
      ref: triggerRef,
      onPointerEnter: scheduleOpen,
      onPointerLeave: close,
      onFocus: scheduleOpen,
      onBlur: close,
    },
    tooltip:
      open && content
        ? createPortal(
            <div
              ref={bubbleRef}
              role="tooltip"
              style={{
                left: at?.left ?? 0,
                top: at?.top ?? 0,
                visibility: at ? "visible" : "hidden",
              }}
              className="fixed z-50 max-w-72 px-3 py-2 bg-lol-card border border-lol-border rounded-md shadow-lg shadow-black/40 pointer-events-none"
            >
              {content}
            </div>,
            document.body,
          )
        : null,
  };
}
