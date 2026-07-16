// Log in / register screen. Auth is intentionally stubbed until the main
// mechanic is locked in — both buttons just proceed to the grid.
export default function AuthPage({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  return (
    <main className="screen screen--center">
      <form
        className="auth"
        onSubmit={(e) => {
          e.preventDefault();
          onAuthenticated();
        }}
      >
        <h2 className="auth__title">Welcome back, star collector</h2>
        <label className="field">
          <span className="field__label">Email</span>
          <input className="field__input" type="email" name="email" />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input className="field__input" type="password" name="password" />
        </label>
        <div className="auth__actions">
          <button className="btn btn--primary" type="submit">
            Log in
          </button>
          <button className="btn" type="button" onClick={onAuthenticated}>
            Register
          </button>
        </div>
        <p className="auth__note">(Auth is a stub for now — either button lets you in.)</p>
      </form>
    </main>
  );
}
