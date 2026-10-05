// DayItemsModal: every item of one day (opened with "+N more", or by tapping a day on a phone).
//
// Props:
//   day          string    the day as 'YYYY-MM-DD' (the dialog is hidden when null)
//   items        array     the items of that day
//   canAdd       boolean   true = show an "Add event" button (only for today and later days)
//   onClose      function  closes the dialog
//   onItemClick  function  called with an item when it is clicked
//   onAdd        function  called with the day when "Add event" is clicked
import Modal from '../common/Modal.jsx';
import Icon from '../common/Icon.jsx';
import EmptyState from '../common/EmptyState.jsx';
import ItemRow from './ItemRow.jsx';
import { formatLongDate } from '../../utils/format.js';
import { isPastDay } from './calendarUtils.js';

export default function DayItemsModal({ day, items, canAdd, onClose, onItemClick, onAdd }) {
  if (!day) return null;
  const showAdd = canAdd && !isPastDay(day);

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Close
      </button>
      {showAdd && (
        <button type="button" className="btn btn-primary" onClick={() => onAdd(day)}>
          <Icon name="plus" size={16} /> Add event
        </button>
      )}
    </>
  );

  return (
    <Modal open onClose={onClose} title={formatLongDate(day)} footer={footer}>
      {items.length === 0 ? (
        <EmptyState compact icon="calendar" title="Nothing planned for this day" />
      ) : (
        <ul className="cal-agenda-items">
          {items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} day={day} onClick={onItemClick} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
