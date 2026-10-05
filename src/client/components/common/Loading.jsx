// Loading: a spinner with a short message, shown while data is being loaded.
//
// Props:
//   text      string   message under the spinner (default "Loading...")
//   fullPage  boolean  true = fill the whole screen (used while checking the login)
//   inline    boolean  true = small spinner in a line of text (e.g. inside a button)
//
// Example: if (loading) return <Loading />;
export default function Loading({ text = 'Loading...', fullPage = false, inline = false }) {
  if (inline) {
    return (
      <span className="loading-inline" role="status">
        <span className="spinner spinner-small" aria-hidden="true" />
        {text && <span>{text}</span>}
      </span>
    );
  }
  return (
    <div className={fullPage ? 'loading loading-full' : 'loading'} role="status">
      <span className="spinner" aria-hidden="true" />
      {text && <p>{text}</p>}
    </div>
  );
}
