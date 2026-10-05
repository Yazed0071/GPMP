// EventDetailsModal: the details of one calendar item.
// Events can be edited or deleted here by the people allowed to (item.canEdit from the server);
// task due dates link to their task page. Started meetings link to the attendance page (FR-15).
//
// Props:
//   item               object    the calendar item to show (the dialog is hidden when null)
//   canTakeAttendance  boolean   true for supervisors and administrators
//   onClose            function  closes the dialog
//   onEdit             function  called with the item when "Edit" is clicked
//   onDeleted          function  called with the item after it was deleted
import { Link } from 'react-router-dom';
import Modal from '../common/Modal.jsx';
import Icon from '../common/Icon.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { deleteEvent } from '../../api/events.js';
import { formatLongDate, formatDateTime } from '../../utils/format.js';
import { itemTimeRange, relativeDayLabel } from './calendarUtils.js';

export default function EventDetailsModal({ item, canTakeAttendance, onClose, onEdit, onDeleted }) {
  const toast = useToast();
  if (!item) return null;

  const isTask = item.source === 'task';
  const isSession = !isTask && !item.isShared && (item.type === 'Meeting' || item.type === 'Presentation');
  const hasStarted = new Date(item.eventDate).getTime() <= Date.now();

  async function handleDelete() {
    await deleteEvent(item.id);
    toast.success('Event deleted');
    onDeleted(item);
  }

  const deleteMessage = isSession
    ? `Delete "${item.title}"? Attendance recorded for it will be deleted too, and the group will be notified.`
    : `Delete "${item.title}"? The people on this calendar will be notified.`;

  const footer = (
    <>
      {item.canEdit && (
        <ConfirmButton
          onConfirm={handleDelete}
          className="btn btn-ghost cal-delete-button"
          title="Delete event"
          message={deleteMessage}
          confirmLabel="Delete event"
        >
          <Icon name="trash" size={16} /> Delete
        </ConfirmButton>
      )}
      <span className="spacer" />
      {isSession && hasStarted && canTakeAttendance && (
        <Link className="btn btn-secondary" to={`/attendance?groupId=${item.groupId}&session=${item.id}`}>
          <Icon name="attendance" size={16} /> Attendance
        </Link>
      )}
      {item.canEdit && (
        <button type="button" className="btn btn-secondary" onClick={() => onEdit(item)}>
          <Icon name="edit" size={16} /> Edit
        </button>
      )}
      {/* data-autofocus: the dialog opens with focus here, not on "Delete" */}
      {isTask ? (
        <Link className="btn btn-primary" to={item.link} data-autofocus>
          Open task <Icon name="arrowRight" size={16} />
        </Link>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
          Close
        </button>
      )}
    </>
  );

  return (
    <Modal open onClose={onClose} title={item.title} footer={footer}>
      <div className="cal-details">
        <div className="row">
          <StatusBadge status={item.type} dot />
          {item.priority && <StatusBadge status={item.priority}>{item.priority} priority</StatusBadge>}
          {isTask && <StatusBadge status={item.status} />}
          {item.isMilestone && <StatusBadge status="Milestone" />}
          <span className="muted small">{relativeDayLabel(item)}</span>
        </div>

        <dl className="cal-details-list">
          <div>
            <dt>
              <Icon name="calendar" size={16} /> Date
            </dt>
            <dd>{formatLongDate(item.eventDate)}</dd>
          </div>
          <div>
            <dt>
              <Icon name="clock" size={16} /> Time
            </dt>
            <dd>{itemTimeRange(item)}</dd>
          </div>
          {item.location && (
            <div>
              <dt>
                <Icon name="mapPin" size={16} /> Location
              </dt>
              <dd>{item.location}</dd>
            </div>
          )}
          <div>
            <dt>
              <Icon name="users" size={16} /> Calendar
            </dt>
            <dd>{item.isShared ? 'Shared academic calendar' : item.groupName}</dd>
          </div>
          {item.createdBy && (
            <div>
              <dt>
                <Icon name="user" size={16} /> Added by
              </dt>
              <dd>
                {item.createdBy.name}
                {item.createdAt && <span className="muted"> · {formatDateTime(item.createdAt)}</span>}
              </dd>
            </div>
          )}
        </dl>

        {item.description && <p className="cal-details-description">{item.description}</p>}

        {isSession && !hasStarted && canTakeAttendance && (
          <p className="field-hint mb-0">Attendance can be recorded once the meeting has started.</p>
        )}
      </div>
    </Modal>
  );
}
