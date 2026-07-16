import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Star } from "../types";
import { createHoloRenderer } from "../holo";
import type { HoloRenderer } from "../holo";
import { stickerJitter, STICKER_OVERHANG } from "./StarSlot";

// How fast the shine sweeps per scrolled pixel. One full hue cycle every
// ~830px of scroll.
const PHASE_PER_PX = 0.0012;

// The holographic gloss over placed stickers. A viewport-fixed WebGL2 canvas
// (see holo.ts); this component owns the DOM wiring: it measures sticker
// geometry off the real slots (CSS stays the layout authority), rebuilds the
// mask instances when stars move, and feeds scroll into the phase uniform.
export default function HoloLayer({
  gridRef,
  stars,
  sorted,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  stars: Star[];
  sorted: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HoloRenderer | null>(null);
  const scheduleRef = useRef<() => void>(() => {});

  useEffect(() => {
    const renderer = createHoloRenderer(canvasRef.current!);
    if (!renderer) return; // no WebGL2: sheet still works, just without shine
    rendererRef.current = renderer;

    let frame = 0;
    const draw = () => {
      frame = 0;
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      renderer.render(rect.left, rect.top, window.scrollY * PHASE_PER_PX);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    scheduleRef.current = schedule;

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      renderer.dispose();
      rendererRef.current = null;
      scheduleRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-measure sticker geometry whenever stickers move: placement/edit,
  // sort toggle, or a grid resize.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const rect = grid.getBoundingClientRect();
      const instances = Array.from(
        grid.querySelectorAll<HTMLElement>(".slot--filled"),
        (el) => {
          const jitter = stickerJitter(Number(el.dataset.starId));
          const r = el.getBoundingClientRect();
          return {
            x: r.left - rect.left + r.width / 2 + jitter.dx,
            y: r.top - rect.top + r.height / 2 + jitter.dy,
            size: r.width * STICKER_OVERHANG,
            rotation: (jitter.tilt * Math.PI) / 180,
          };
        }
      );
      renderer.setStars(instances);
      scheduleRef.current();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars, sorted]);

  return <canvas className="holo" ref={canvasRef} aria-hidden />;
}
