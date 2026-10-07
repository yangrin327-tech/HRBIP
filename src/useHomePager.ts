import { useEffect, useRef, useState } from "react";

/** One wheel gesture = one page; normal scrolling remains available on small screens. */
export function useHomePager(count: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const current = useRef(0), movingUntil = useRef(0);
  const move = (next: number) => {
    const el = viewport.current;
    if (!el) return;
    const index = Math.max(0, Math.min(count - 1, next));
    current.current = index;
    setActive(index);
    const section = el.querySelectorAll<HTMLElement>(".landing-section")[index];
    if (!section) return;
    movingUntil.current = Date.now() + 700;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (matchMedia("(min-width: 981px) and (min-height: 650px)").matches) {
      el.scrollTo({ top: section.offsetTop, behavior: smooth ? "smooth" : "instant" });
    } else section.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const media = matchMedia("(min-width: 981px) and (min-height: 650px)");
    let consumed = false, accumulated = 0, quietTimer: ReturnType<typeof setTimeout>;
    const wheel = (event: WheelEvent) => {
      if (!media.matches || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if ((event.target as HTMLElement).closest("input,select,textarea,[data-native-scroll]")) return;
      event.preventDefault();
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => { consumed = false; accumulated = 0; }, 180);
      if (consumed || Date.now() < movingUntil.current) return;
      accumulated += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      if (Math.abs(accumulated) < 24) return;
      consumed = true;
      move(current.current + Math.sign(accumulated));
      accumulated = 0;
    };
    const key = (event: KeyboardEvent) => {
      if (!media.matches || document.querySelector("dialog[open]")) return;
      if ((event.target as HTMLElement).closest("input,select,textarea,button,a")) return;
      const targets: Record<string, number> = { ArrowDown: current.current + 1, PageDown: current.current + 1, ArrowUp: current.current - 1, PageUp: current.current - 1, Home: 0, End: count - 1, " ": current.current + (event.shiftKey ? -1 : 1) };
      if (!(event.key in targets)) return;
      event.preventDefault();
      move(targets[event.key]);
    };
    const scroll = () => {
      if (!media.matches) return;
      const pages = Array.from(el.querySelectorAll<HTMLElement>(".landing-section"));
      const closest = pages.reduce((best, page, index) => Math.abs(page.offsetTop - el.scrollTop) < Math.abs(pages[best].offsetTop - el.scrollTop) ? index : best, 0);
      current.current = closest;
      setActive(closest);
    };
    const resize = () => {
      if (media.matches) { el.scrollTo({ top: current.current * el.clientHeight }); scroll(); }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(quietTimer);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("scroll", scroll);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [count]);
  return { viewport, active, move };
}
