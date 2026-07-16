// Thin API client. All network calls go through here so swapping transport or
// adding auth headers later touches one file.
import type { Star, StarCreate, StarFields } from "./types";

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchStars(): Promise<Star[]> {
  return json<Star[]>(await fetch(`${BASE}/stars`));
}

export async function placeStar(payload: StarCreate): Promise<Star> {
  const res = await fetch(`${BASE}/stars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json<Star>(res);
}

export async function updateStar(id: number, payload: StarFields): Promise<Star> {
  const res = await fetch(`${BASE}/stars/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json<Star>(res);
}
