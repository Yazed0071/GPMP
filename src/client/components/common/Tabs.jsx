// Tabs: a row of pill buttons to switch between views (like "All Tasks | My Tasks | Team").
// The page keeps the active tab in its own state and shows the matching content.
//
// Props:
//   tabs      array     list of tabs. Each item is either a string ("All") or an object
//                       { value, label, count?, icon? }  (count shows a small number bubble)
//   active    string    the value of the selected tab (required)
//   onChange  function  called with the new tab value (required)
//   ariaLabel string    describes the tab list for screen readers (default "Views")
//
// Example:
//   const [tab, setTab] = useState('all');
//   <Tabs tabs={[{ value: 'all', label: 'All Tasks' }, { value: 'mine', label: 'My Tasks', count: 3 }]}
//         active={tab} onChange={setTab} />
import Icon from './Icon.jsx';

export default function Tabs({ tabs = [], active, onChange, ariaLabel = 'Views' }) {
  // Allow plain strings as a shortcut: 'All' -> { value: 'All', label: 'All' }
  const items = tabs.map((tab) => (typeof tab === 'string' ? { value: tab, label: tab } : tab));

  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((tab) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? 'tab active' : 'tab'}
            onClick={() => onChange(tab.value)}
          >
            {tab.icon && <Icon name={tab.icon} size={16} />}
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <span className="tab-count">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
