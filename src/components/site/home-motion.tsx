"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Home page motion (GSAP + ScrollTrigger), applied to server-rendered markup through data attributes,
 * so the content is complete and indexable without JavaScript:
 *   data-hero-line   staggered reveal on load          data-trace / data-pad / data-chip  hero circuit
 *   data-counter     number counts up once in view     data-stagger  children rise in, staggered
 *   data-reveal      fade/slide in on scroll           data-tilt     card tilts toward the pointer
 *   data-hscroll     pinned horizontal scroll (desktop) with data-hscroll-track inside
 *   data-parallax    slow drift on scroll
 * With prefers-reduced-motion everything is shown as-is (no animation).
 */
export function HomeMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(scope);
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 1024px)",
          finePointer: "(pointer: fine)",
        },
        (context) => {
          const { motion, desktop, finePointer } = context.conditions as Record<string, boolean>;
          if (!motion) return;

          // Hero
          gsap.from(q("[data-hero-line]"), { y: 36, autoAlpha: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 });
          q("[data-trace]").forEach((el, i) => {
            const path = el as unknown as SVGPathElement;
            const len = path.getTotalLength();
            gsap.fromTo(
              path,
              { strokeDasharray: len, strokeDashoffset: len },
              { strokeDashoffset: 0, duration: 1.4, delay: 0.3 + i * 0.06, ease: "power2.inOut" },
            );
          });
          gsap.from(q("[data-pad]"), {
            scale: 0,
            transformOrigin: "50% 50%",
            duration: 0.4,
            delay: 1.2,
            stagger: 0.04,
            ease: "back.out(2)",
          });
          gsap.from(q("[data-chip]"), { y: 30, autoAlpha: 0, duration: 1, delay: 0.2, ease: "power3.out" });

          const chip = q("[data-chip]")[0];
          const cleanups: (() => void)[] = [];
          if (chip && finePointer) {
            const rx = gsap.quickTo(chip, "rotationX", { duration: 0.6, ease: "power3" });
            const ry = gsap.quickTo(chip, "rotationY", { duration: 0.6, ease: "power3" });
            const onMove = (e: PointerEvent) => {
              rx((e.clientY / window.innerHeight - 0.5) * -14);
              ry((e.clientX / window.innerWidth - 0.5) * 18);
            };
            window.addEventListener("pointermove", onMove, { passive: true });
            cleanups.push(() => window.removeEventListener("pointermove", onMove));
          }

          // Pinned horizontal "how it works" row on desktop. Created FIRST so every trigger below it
          // is measured with the pin's extra scroll distance included.
          if (desktop) {
            q("[data-hscroll]").forEach((section) => {
              const track = section.querySelector<HTMLElement>("[data-hscroll-track]");
              if (!track) return;
              const distance = () => Math.max(0, track.scrollWidth - (section as HTMLElement).clientWidth + 48);
              if (distance() < 40) return;
              gsap.to(track, {
                x: () => -distance(),
                ease: "none",
                scrollTrigger: {
                  trigger: section,
                  start: "top top",
                  end: () => `+=${distance()}`,
                  pin: true,
                  scrub: 0.6,
                  invalidateOnRefresh: true,
                },
              });
            });
          }

          q("[data-parallax]").forEach((el) => {
            const speed = Number((el as HTMLElement).dataset.parallax) || 0.2;
            gsap.to(el, {
              yPercent: speed * 100,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
            });
          });

          // Counters
          q("[data-counter]").forEach((el) => {
            const target = Number((el as HTMLElement).dataset.counter) || 0;
            const fmt = new Intl.NumberFormat("en-IN");
            const obj = { v: 0 };
            el.textContent = "0";
            gsap.to(obj, {
              v: target,
              duration: 1.8,
              ease: "power2.out",
              scrollTrigger: { trigger: el, start: "top 90%", once: true },
              onUpdate: () => {
                el.textContent = fmt.format(Math.round(obj.v));
              },
            });
          });

          // Staggered groups and single reveals (skip reveals inside the pinned row; it animates as a unit)
          q("[data-stagger]").forEach((group) => {
            gsap.from(group.children, {
              y: 40,
              autoAlpha: 0,
              duration: 0.7,
              ease: "power3.out",
              stagger: 0.1,
              scrollTrigger: { trigger: group, start: "top 85%", once: true },
            });
          });
          q("[data-reveal]")
            .filter((el) => !el.closest("[data-hscroll]") || !desktop)
            .forEach((el) => {
              gsap.from(el, {
                y: 28,
                autoAlpha: 0,
                duration: 0.7,
                ease: "power3.out",
                scrollTrigger: { trigger: el, start: "top 88%", once: true },
              });
            });

          // Card tilt
          if (finePointer) {
            q("[data-tilt]").forEach((card) => {
              const el = card as HTMLElement;
              const rx = gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power2" });
              const ry = gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power2" });
              gsap.set(el, { transformPerspective: 800 });
              const move = (e: PointerEvent) => {
                const r = el.getBoundingClientRect();
                rx(((e.clientY - r.top) / r.height - 0.5) * -8);
                ry(((e.clientX - r.left) / r.width - 0.5) * 8);
              };
              const leave = () => {
                rx(0);
                ry(0);
              };
              el.addEventListener("pointermove", move);
              el.addEventListener("pointerleave", leave);
              cleanups.push(() => {
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerleave", leave);
              });
            });
          }

          // Fonts and images can change heights after load; re-measure once everything is in.
          const onLoad = () => ScrollTrigger.refresh();
          window.addEventListener("load", onLoad);
          cleanups.push(() => window.removeEventListener("load", onLoad));

          return () => cleanups.forEach((fn) => fn());
        },
      );
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
