import { useCallback, useEffect, useMemo, useState } from "react";
import type { Star, StarFields } from "../types";
import { fetchStars, placeStar, updateStar } from "../api";
import { TOTAL_SLOTS } from "../constants";
import StarGrid from "../components/StarGrid";
import StarModal from "../components/StarModal";

// The modal is either placing a star on an empty slot or editing a placed one.
type ModalState = { mode: "place"; slot: number } | { mode: "edit"; star: Star };

// Main screen: the 1000-slot sticker sheet.
export default function GridPage() {
  const [stars, setStars] = useState<Star[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sorted, setSorted] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    fetchStars()
      .then(setStars)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load stars.")
      );
  }, []);

  // In the sorted (compacted) view, cell positions are virtual and the new
  // star will appear in date order regardless of where you click — so the
  // star goes into the lowest free real slot instead of the clicked cell.
  const firstFreeSlot = useMemo(() => {
    const taken = new Set(stars.map((s) => s.slot));
    for (let i = 0; i < TOTAL_SLOTS; i++) if (!taken.has(i)) return i;
    return null; // sheet is full
  }, [stars]);

  const handleSlotClick = useCallback(
    (slot: number) => {
      const target = sorted ? firstFreeSlot : slot;
      setModal(target === null ? null : { mode: "place", slot: target });
    },
    [sorted, firstFreeSlot]
  );

  const handleStarClick = useCallback((star: Star) => {
    setModal({ mode: "edit", star });
  }, []);

  async function handleConfirm(fields: StarFields) {
    if (!modal) return;
    if (modal.mode === "place") {
      const star = await placeStar({ ...fields, slot: modal.slot });
      setStars((prev) => [...prev, star]);
    } else {
      const star = await updateStar(modal.star.id, fields);
      setStars((prev) => prev.map((s) => (s.id === star.id ? star : s)));
    }
    setModal(null);
  }

  return (
    <main className="screen">
      <header className="toolbar">
        <h1 className="toolbar__title">Rejection Stars</h1>
        <span className="toolbar__count">
          {stars.length} / {TOTAL_SLOTS}
        </span>
        <button className="btn" onClick={() => setSorted((s) => !s)}>
          {sorted ? "Back to chaos" : "Sort"}
        </button>
      </header>
      {loadError && <p className="load-error">{loadError}</p>}
      <StarGrid
        stars={stars}
        sorted={sorted}
        onSlotClick={handleSlotClick}
        onStarClick={handleStarClick}
      />
      {modal && (
        <StarModal
          star={modal.mode === "edit" ? modal.star : undefined}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
