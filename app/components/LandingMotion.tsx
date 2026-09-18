"use client";

import { useEffect } from "react";

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

export default function LandingMotion() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;

    const revealItems = Array.from(page.querySelectorAll<HTMLElement>("[data-reveal]"));
    const countItems = Array.from(page.querySelectorAll<HTMLElement>("[data-count-value]"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    page.classList.add("landing-motion-ready");

    if (reduceMotion) {
      revealItems.forEach((item) => item.setAttribute("data-revealed", "true"));
      countItems.forEach((item) => {
        const value = Number(item.dataset.countValue || "0");
        item.textContent = `${Math.round(value).toLocaleString("en-US")}${item.dataset.countSuffix || ""}`;
      });
      return () => page.classList.remove("landing-motion-ready");
    }

    countItems.forEach((item) => {
      item.textContent = `0${item.dataset.countSuffix || ""}`;
    });

    let frame = 0;
    const updateScrollMotion = () => {
      frame = 0;
      const hero = page.querySelector<HTMLElement>(".landing-hero");
      if (!hero) return;
      const progress = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight * 0.72)));
      page.style.setProperty("--landing-hero-progress", progress.toFixed(4));
      const pageProgress = Math.min(1, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
      page.style.setProperty("--landing-page-progress", pageProgress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateScrollMotion);
    };

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.setAttribute("data-revealed", "true");
          window.setTimeout(() => {
            element.style.transitionDelay = "0ms";
          }, 1100);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );

    const countObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          const target = Number(element.dataset.countValue || "0");
          const suffix = element.dataset.countSuffix || "";
          const start = performance.now();
          const duration = 1050;
          const animate = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            const value = Math.round(target * easeOutCubic(progress));
            element.textContent = `${value.toLocaleString("en-US")}${suffix}`;
            if (progress < 1) window.requestAnimationFrame(animate);
          };
          window.requestAnimationFrame(animate);
          observer.unobserve(element);
        });
      },
      { threshold: 0.5 },
    );

    revealItems.forEach((item) => revealObserver.observe(item));
    countItems.forEach((item) => countObserver.observe(item));
    updateScrollMotion();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      revealObserver.disconnect();
      countObserver.disconnect();
      page.classList.remove("landing-motion-ready");
      page.style.removeProperty("--landing-hero-progress");
      page.style.removeProperty("--landing-page-progress");
    };
  }, []);

  return <div className="landing-scroll-progress" aria-hidden="true" />;
}
