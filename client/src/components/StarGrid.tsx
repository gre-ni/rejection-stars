import { useLayoutEffect, useMemo, useRef } from "react";
import type { Star } from "../types";
import { TOTAL_SLOTS } from "../constants";
import { renderRisoSheet, readPrintStyle } from "../riso";
import StarSlot from "./StarSlot";
import HoloLayer from "./HoloLayer";

// The full 1000-slot sheet. Layout (columns, gap, square size) is pure CSS —
// see .grid in styles/global.css — so reshaping the sheet never touches code.
//
// The sheet's printed artwork (pink card, edge, white star knockouts, slot
// numbers) is a riso-print bitmap rendered by riso.ts into the .grid__print
// canvas. Slot positions are measured from the DOM after layout, so CSS
// remains the single source of truth for grid shape; a resize re-measures
// and re-prints.
//
// `sorted` compacts all placed stars to the top of the sheet ordered by date.
// It is a view-only transform: slot assignments in the DB never change, and
// the print never changes either — only the stickers move.
export default function StarGrid({
  stars,
  sorted,
  onSlotClick,
  onStarClick,
}: {
  stars: Star[];
  sorted: boolean;
  onSlotClick: (slot: number) => void;
  onStarClick: (star: Star) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // One misregistration shuffle per visit; resizes re-print without reshuffling.
  const seedRef = useRef<number>((Math.random() * 2 ** 31) | 0);

  useLayoutEffect(() => {
    const grid = gridRef.current!;
    const canvas = canvasRef.current!;
    let timer: number | undefined;
    let latest = 0;

    async function print() {
      const id = ++latest;
      const rect = grid.getBoundingClientRect();
      const slots = Array.from(
        grid.querySelectorAll<HTMLElement>(".slot"),
        (el, i) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.left - rect.left,
            y: r.top - rect.top,
            size: r.width,
            number: i + 1,
          };
        }
      );
      const sheet = await renderRisoSheet(
        { width: Math.round(rect.width), height: Math.round(rect.height), slots },
        readPrintStyle(),
        seedRef.current
      );
      if (id !== latest) return; // a newer resize superseded this render
      canvas.width = sheet.width;
      canvas.height = sheet.height;
      canvas.getContext("2d")!.drawImage(sheet, 0, 0);
    }

    // Fires once on observe (initial print) and again on any size change.
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void print(), 250);
    });
    observer.observe(grid);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const bySlot = useMemo(() => {
    const map = new Map<number, Star>();
    if (sorted) {
      [...stars]
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
        .forEach((star, i) => map.set(i, star));
    } else {
      stars.forEach((star) => map.set(star.slot, star));
    }
    return map;
  }, [stars, sorted]);

  return (
    <div className="grid" ref={gridRef}>
      <canvas className="grid__print" ref={canvasRef} aria-hidden />
      {Array.from({ length: TOTAL_SLOTS }, (_, slot) => (
        <StarSlot
          key={slot}
          slot={slot}
          star={bySlot.get(slot)}
          onClick={onSlotClick}
          onStarClick={onStarClick}
        />
      ))}
      <HoloLayer gridRef={gridRef} stars={stars} sorted={sorted} />
    </div>
  );
}
