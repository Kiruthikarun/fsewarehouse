"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * App-wide navigation progress bar.
 *
 * Each route already streams its own loading.tsx skeleton, but that skeleton
 * paints in the CONTENT area only — and on a force-dynamic page there's a beat
 * between clicking a link and the server responding, during which nothing near
 * the cursor moves. So navigation "feels stuck". This paints a thin signal-orange
 * bar across the very top of the viewport the instant a navigation begins and
 * runs it to completion when the new route commits, giving immediate, global
 * feedback for every transition (sidebar, breadcrumbs, home cards, ⌘K palette).
 *
 * A start is detected two ways:
 *   - a capture-phase click on any in-app <a> (covers every <Link>), and
 *   - an explicit start() exposed via context for programmatic router.push (⌘K).
 * Completion is detected when the pathname / query actually changes.
 */

const RouteProgressContext = createContext<{ start: () => void }>({
  start: () => {},
});

/** Lets programmatic navigations (router.push) kick the bar off too. */
export const useRouteProgress = () => useContext(RouteProgressContext);

export function RouteProgress({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);

  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Identity of the current location — when this flips, the navigation committed.
  const navKey = `${pathname}?${searchParams.toString()}`;
  const lastKey = useRef(navKey);

  const finish = useCallback(() => {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    if (safety.current) {
      clearTimeout(safety.current);
      safety.current = null;
    }
    setProgress(100);
    // Hold the full bar briefly so the fill + fade-out read as "done", not a cut.
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 300);
  }, []);

  const start = useCallback(() => {
    if (trickle.current) return; // already running
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setActive(true);
    setProgress(8);
    // Trickle toward 90% — fast at first, easing as it nears the cap — then hold
    // until the route actually commits (handled by the completion effect).
    trickle.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const step = p < 40 ? 9 : p < 70 ? 4 : 1.5;
        return Math.min(90, p + step);
      });
    }, 240);
    // Safety net: never let the bar hang if a click somehow didn't navigate.
    safety.current = setTimeout(finish, 10000);
  }, [finish]);

  // Completion — the location changed, so finish and fade out.
  useEffect(() => {
    if (navKey === lastKey.current) return;
    lastKey.current = navKey;
    if (active) finish();
  }, [navKey, active, finish]);

  // Start on any same-origin in-app link click (covers every <Link>).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return; // let the browser open new tabs / windows
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // external
      // Server routes (logout/login/api) do a full document load — let them be.
      if (url.pathname.startsWith("/api/")) return;
      // Same destination (incl. hash-only jumps) — no route transition happens.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    return () => {
      if (trickle.current) clearInterval(trickle.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (safety.current) clearTimeout(safety.current);
    };
  }, []);

  return (
    <RouteProgressContext.Provider value={{ start }}>
      {active && (
        <div className="route-progress" aria-hidden>
          <div
            className="route-progress__bar"
            style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
          />
        </div>
      )}
      {children}
    </RouteProgressContext.Provider>
  );
}
