// Breakdown: a short list of labels with counts and bars, e.g. "Projects by status".
// Used by the administrator's platform overview.
//
// Props:
//   title  string  heading of the block
//   items  array   [{ label, value, color }] - color: teal, blue, green, amber, red, purple, navy, gray
export default function Breakdown({ title, items }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="dash-breakdown">
      <h3 className="dash-breakdown-title">
        {title} <span className="muted">({total})</span>
      </h3>
      <ul>
        {items.map((item) => {
          const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <li key={item.label}>
              <span className="dash-breakdown-row">
                <span className="dash-breakdown-label">
                  <span className={`dash-dot dash-dot-${item.color || 'teal'}`} aria-hidden="true" />
                  {item.label}
                </span>
                <strong className="dash-breakdown-value">{item.value}</strong>
              </span>
              <span className="dash-breakdown-track" aria-hidden="true">
                <span className={`dash-breakdown-fill dash-fill-${item.color || 'teal'}`} style={{ width: `${percent}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
