"use client";

import { useEffect, useRef } from "react";

/**
 * Light motion for inner pages: [data-reveal] / [data-stagger] children fade and slide in once,
 * via IntersectionObserver and CSS (no animation library). Content is visible without JavaScript;
 * the hidden start state applies only after this runs. Reduced motion: CSS turns it off.
 */
export function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const targets = [
      ...root.querySelectorAll<HTMLElement>("[data-reveal]"),
      ...[...root.querySelectorAll<HTMLElement>("[data-stagger]")].flatMap((g) => [...g.children] as HTMLElement[]),
    ];
    // Elements already on screen stay visible (no flash); the rest animate in.
    const vh = window.innerHeight;
    for (const [i, el] of targets.entries()) {
      el.setAttribute("data-reveal", "");
      if (el.getBoundingClientRect().top < vh) el.classList.add("is-visible");
      else el.style.transitionDelay = `${(i % 4) * 60}ms`;
    }
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    targets.forEach((t) => !t.classList.contains("is-visible") && io.observe(t));
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
