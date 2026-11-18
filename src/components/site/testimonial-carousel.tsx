"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Light carousel: native scroll-snap (swipe works everywhere), arrow buttons, and a gentle auto-advance
 * that stops on hover/focus, when the tab is hidden, and when the visitor prefers reduced motion.
 */
export function TestimonialCarousel({ items }: { items: { id: string; card: React.ReactNode }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-slide]");
    const w = (card?.offsetWidth ?? el.clientWidth) + 20;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  useEffect(() => {
    if (paused || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) step(1);
    }, 6000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={ref}
        className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:none] gap-5 overflow-x-auto scroll-smooth px-4 pb-4 [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-roledescription="carousel"
        aria-label="Testimonials"
        tabIndex={0}
      >
        {items.map((it, i) => (
          <div
            key={it.id}
            data-slide
            className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
          >
            {it.card}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="flex size-10 items-center justify-center rounded-full border bg-card shadow-sm hover:bg-accent"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="flex size-10 items-center justify-center rounded-full border bg-card shadow-sm hover:bg-accent"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
