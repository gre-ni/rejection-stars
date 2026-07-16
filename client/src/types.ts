// Shared domain types. Mirror the server's Pydantic models.

export interface Star {
  id: number;
  slot: number; // 0..TOTAL_SLOTS-1
  name: string;
  date: string; // ISO date, e.g. "2026-07-10"
  description?: string | null;
}

// The user-editable info on a star — what the placement/edit modal collects.
export interface StarFields {
  name: string;
  date: string;
  description?: string;
}

export interface StarCreate extends StarFields {
  slot: number;
}

// Simple screen enum for the in-app router. Swap for a real router if the app
// ever grows beyond a handful of screens.
export type Screen = "landing" | "auth" | "grid";
