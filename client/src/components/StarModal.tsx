import { useState } from "react";
import type { Star, StarFields } from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Popup for a star's info. Two modes: placing on an empty slot (collects
// name, date defaulting to today, optional description, confirms with "Place
// golden star") or editing an already-placed star. In edit mode the heading
// IS the star's name; a small pencil swaps it for a text box + confirm.
export default function StarModal({
  star,
  onConfirm,
  onClose,
}: {
  star?: Star; // when set, the modal edits this star instead of placing one
  onConfirm: (fields: StarFields) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(star?.name ?? "");
  const [date, setDate] = useState(star?.date ?? today());
  const [description, setDescription] = useState(star?.description ?? "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmName() {
    const next = nameDraft.trim();
    if (next) setName(next);
    setEditingName(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        name: name.trim(),
        date,
        description: description.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {!star ? (
          <h3 className="modal__title">A rejection! Congratulations.</h3>
        ) : editingName ? (
          <div className="modal__name-edit">
            <input
              className="field__input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={120}
              autoFocus
              aria-label="Star name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmName();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingName(false);
                }
              }}
            />
            <button
              className="btn"
              type="button"
              onClick={confirmName}
              aria-label="Confirm name"
            >
              ✓
            </button>
          </div>
        ) : (
          <h3 className="modal__title modal__title--name">
            {name}
            <button
              className="modal__edit"
              type="button"
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
              aria-label="Edit name"
            >
              ✎
            </button>
          </h3>
        )}
        {!star && (
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus
            />
          </label>
        )}
        <label className="field">
          <span className="field__label">Date</span>
          <input
            className="field__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">What happened? (optional)</span>
          <textarea
            className="field__input field__input--textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
          />
        </label>
        {error && <p className="modal__error">{error}</p>}
        <div className="modal__actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {star
              ? submitting
                ? "Saving…"
                : "Save changes"
              : submitting
                ? "Placing…"
                : "Place golden star"}
          </button>
        </div>
      </form>
    </div>
  );
}
