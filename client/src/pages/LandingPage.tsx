// Landing screen. Placeholder copy + layout — the real design comes from Figma.
export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="screen screen--center">
      <div className="landing">
        <h1 className="landing__title">Rejection Stars</h1>
        <p className="landing__tagline">
          A gold star for every rejection you collect. 1000 slots. Fill them
          proudly.
        </p>
        <button className="btn btn--primary" onClick={onEnter}>
          Enter
        </button>
      </div>
    </main>
  );
}
