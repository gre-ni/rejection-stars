import type { Star } from "../types";
import { mulberry32 } from "../riso";
import starPlaced from "../assets/star-placed.svg";

// Stickers are placed by hand, so each lands slightly off: a chance tilt and
// off-center shift, different for every star. Seeded by the star's id, so a
// sticker keeps its exact placement across re-renders and the sort toggle —
// the crookedness belongs to the sticker, not the cell.
const STICKER_MAX_TILT = 2; // degrees to either side
const STICKER_MAX_SHIFT = 3; // px off-center

// Exported so the holographic layer can place its shine masks on exactly the
// same crooked sticker geometry (see HoloLayer).
export function stickerJitter(id: number): {
  dx: number;
  dy: number;
  tilt: number; // degrees
} {
  const rand = mulberry32(Math.imul(id + 1, 0x9e3779b9));
  const tilt = (rand() * 2 - 1) * STICKER_MAX_TILT;
  const direction = rand() * 2 * Math.PI;
  const shift = rand() * STICKER_MAX_SHIFT;
  return {
    dx: Math.cos(direction) * shift,
    dy: Math.sin(direction) * shift,
    tilt,
  };
}

// The sticker overhangs its slot like the Figma component (80px art on a
// 75px cell). HoloLayer mirrors these numbers when it rebuilds shine masks.
export const STICKER_OVERHANG = 80 / 75;

function stickerTransform(id: number): string {
  const { dx, dy, tilt } = stickerJitter(id);
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg)`;
}

// One square on the sticker sheet. The paper artwork — white star knockout
// and the slot number "printed" on the paper — lives in the riso-printed
// canvas behind the slots (see StarGrid + riso.ts), tied to the physical
// cell: neither placement nor the sort toggle ever changes it. This
// component is only the interactive layer: an invisible hotspot for empty
// slots, the gold sticker (placeholder for the holographic WebGL layer) for
// filled ones.
export default function StarSlot({
  slot,
  star,
  onClick,
  onStarClick,
}: {
  slot: number;
  star?: Star;
  onClick: (slot: number) => void;
  onStarClick: (star: Star) => void;
}) {
  if (star) {
    return (
      <button
        className="slot slot--filled"
        data-star-id={star.id}
        onClick={() => onStarClick(star)}
        aria-label={`Star for ${star.name}. Click to view or edit.`}
      >
        <img
          className="slot__star"
          src={starPlaced}
          alt=""
          aria-hidden
          style={{ transform: stickerTransform(star.id) }}
        />
        {/* Title tag shown on hover — see .slot__label */}
        <span className="slot__label" aria-hidden>
          {star.name}
        </span>
      </button>
    );
  }
  return (
    <button
      className="slot"
      onClick={() => onClick(slot)}
      aria-label={`Place a star in slot ${slot + 1}`}
    >
      {/* Punchcard perforation shown on hover — see .slot__hover */}
      <svg className="slot__hover" viewBox="0 0 85 85" aria-hidden>
        <rect x="0.5" y="0.5" width="84" height="84" />
      </svg>
    </button>
  );
}
