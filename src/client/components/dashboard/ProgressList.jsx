// ProgressList: rows with an icon tile, a title, a details line, a status badge and a progress bar
// ("Project Progress" on the dashboard, UI fig 47).
//
// Props:
//   items  array of {
//     key          unique key
//     icon         Icon name for the tile (e.g. "project")
//     color        tile and bar color: teal (default), blue, green, amber, red, purple
//     title        bold first line
//     meta         small grey details line
//     progress     0-100
//     status       optional status for a StatusBadge (e.g. "In Progress")
//     to           optional page the row links to
//   }
import { Link } from 'react-router-dom';
import Icon from '../common/Icon.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import StatusBadge from '../common/StatusBadge.jsx';

export default function ProgressList({ items }) {
  return (
    <ul className="dash-progress-list">
      {items.map((item) => {
        const color = item.color || 'teal';
        const content = (
          <>
            <span className={`icon-tile tile-${color}`}>
              <Icon name={item.icon} size={20} />
            </span>
            <span className="dash-progress-body">
              <span className="dash-progress-head">
                <span className="dash-progress-title">
                  <strong>{item.title}</strong>
                  {item.meta && <span className="meta">{item.meta}</span>}
                </span>
                {item.status && <StatusBadge status={item.status} />}
              </span>
              <span className="dash-progress-bar">
                <ProgressBar value={item.progress} size="small" color={color} />
                <span className="dash-progress-value">{item.progress}%</span>
              </span>
            </span>
          </>
        );

        return (
          <li key={item.key}>
            {item.to ? (
              <Link to={item.to} className="dash-progress-row">
                {content}
              </Link>
            ) : (
              <div className="dash-progress-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
