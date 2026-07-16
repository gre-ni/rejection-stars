# rejection-stars

You collect little gold stars for every rejection you face in life :)

One shared sticker sheet with exactly **1000 slots**. Click an empty square,
record the rejection (name, date, optional story), and place a golden star.

## Structure

```
client/   React + TypeScript (Vite). No UI libraries — design comes from Figma later.
server/   FastAPI + SQLite (stdlib sqlite3, no ORM). Postgres swap is contained
          to server/app/db.py + repository.py.
```

## Run locally

Backend (from `server/`):

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Frontend (from `client/`, in another terminal):

```sh
npm install
npm run dev
```

Open http://localhost:5173 (if another Vite app is already running, Vite
bumps to the next free port — check its startup output). The dev server
proxies `/api` to the backend on port 8001.

## Notes

- Grid shape is CSS-only: tweak `--grid-cols` in `client/src/styles/global.css`
  (responsive breakpoints included).
- "Sort" is a view-only toggle (stars compacted to the top, ordered by date);
  slot positions in the DB never change.
- Auth screens are stubs until the main mechanic is locked in.
- The `★` glyph in filled slots is a placeholder for the planned global
  holographic WebGL shine layer.
