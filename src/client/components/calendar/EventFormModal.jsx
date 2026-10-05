// EventFormModal: the form to add or edit a calendar event (UC9 Manage Deadlines).
// Before saving it asks the server for other events at the same time on the same calendar and
// shows a warning (UC9 exceptional flow). The user can then change the time or "Save anyway".
//
// The page shows this component only while the form is open (so every opening starts fresh).
//
// Props:
//   event          object    the event to edit, or null to add a new one
//   initialStart   Date      start time suggested for a new event (e.g. the clicked day at 9:00)
//   groups         array     the user's groups (useMyGroups)
//   defaultGroupId number    group chosen in the page filter (pre-selected for new events)
//   user           object    the logged-in user (useAuth)
//   onClose        function  closes the form without saving
//   onSaved        function  called with the saved event
import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import Icon from '../common/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  EVENT_TYPES,
  EVENT_PRIORITIES,
  createEvent,
  updateEvent,
  checkEventConflicts,
} from '../../api/events.js';
import { toISO, toLocalInput } from '../../utils/format.js';

const SHARED = 'shared'; // value of the "shared academic calendar" option

// The form values when the dialog opens
function initialForm({ event, initialStart, groups, defaultGroupId, user }) {
  if (event) {
    return {
      title: event.title,
      type: event.type,
      priority: event.priority || 'Medium',
      start: toLocalInput(event.eventDate),
      end: toLocalInput(event.endDate),
      location: event.location || '',
      description: event.description || '',
      calendar: event.groupId ? String(event.groupId) : SHARED,
    };
  }

  // New event: students use their own group; others the filtered group, else a sensible default
  let calendar = '';
  if (user.role === 'Student') calendar = String(user.groupId);
  else if (defaultGroupId) calendar = String(defaultGroupId);
  else if (user.role === 'Administrator') calendar = SHARED;
  else if (groups.length > 0) calendar = String(groups[0].id);

  return {
    title: '',
    type: calendar === SHARED ? 'Academic' : 'Meeting',
    priority: 'Medium',
    start: toLocalInput(initialStart),
    end: '',
    location: '',
    description: '',
    calendar,
  };
}

export default function EventFormModal({ event, initialStart, groups, defaultGroupId, user, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(event);
  const isStudent = user.role === 'Student';
  const isAdmin = user.role === 'Administrator';

  const [form, setForm] = useState(() => initialForm({ event, initialStart, groups, defaultGroupId, user }));
  const [original] = useState(form); // to find out what the user changed
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [saving, setSaving] = useState(false);

  const timesChanged = !isEdit || form.start !== original.start || form.end !== original.end;
  const calendarGroupId = form.calendar === SHARED || form.calendar === '' ? null : Number(form.calendar);

  function update(field, value) {
    setForm((old) => ({ ...old, [field]: value }));
    // A different time or calendar needs a new conflict check
    if (field === 'start' || field === 'end' || field === 'calendar') setWarning('');
  }

  // Returns the first problem with the form, or null when everything is fine
  function validate() {
    if (!form.title.trim()) return 'Please enter a title for the event.';
    if (!form.start) return 'Please choose when the event starts.';
    const start = new Date(form.start);
    if (form.start !== original.start && start.getTime() < Date.now() - 60 * 1000) {
      return 'The event date cannot be in the past.';
    }
    if (form.end && new Date(form.end) <= start) return 'The end time must be after the start time.';
    if (!isEdit && form.calendar === '') return 'Please choose a calendar for the event.';
    return null;
  }

  // The fields for the server. When EDITING, unchanged dates are not sent, so a past event
  // can still be corrected (e.g. its description) without being rejected as "in the past".
  function buildPayload() {
    const payload = {
      title: form.title.trim(),
      type: form.type,
      priority: form.priority,
      location: form.location.trim(),
      description: form.description.trim(),
    };
    if (!isEdit || form.start !== original.start) payload.eventDate = toISO(form.start);
    if (!isEdit || form.end !== original.end) payload.endDate = form.end ? toISO(form.end) : null;
    if (!isEdit) payload.groupId = calendarGroupId;
    return payload;
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setSaving(true);
    try {
      // UC9: warn once about other events at the same time; the second click saves anyway
      if (timesChanged && !warning) {
        const result = await checkEventConflicts({
          eventDate: toISO(form.start),
          endDate: toISO(form.end),
          groupId: isEdit ? event.groupId : calendarGroupId,
          excludeId: event?.id,
        });
        if (result.warning) {
          setWarning(result.warning);
          return;
        }
      }

      const saved = isEdit ? await updateEvent(event.id, buildPayload()) : await createEvent(buildPayload());
      toast.success(isEdit ? 'Event updated' : 'Event added to the calendar');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Which calendar the event goes on (fixed when editing and for students)
  const calendarName = isEdit
    ? event.isShared
      ? 'Shared academic calendar'
      : event.groupName
    : isStudent
      ? groups.find((g) => g.id === user.groupId)?.name || 'My group'
      : null;

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit event' : 'Add event'} size="medium" closeOnBackdrop={false}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} /> <span>{error}</span>
          </div>
        )}

        <FormField
          id="event-title"
          label="Title"
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="e.g. Weekly supervision meeting"
        />

        <div className="form-row">
          <FormField
            id="event-type"
            label="Type"
            hint={isStudent ? 'Students can schedule meetings only.' : undefined}
          >
            <select
              id="event-type"
              value={form.type}
              onChange={(e) => update('type', e.target.value)}
              disabled={isStudent}
            >
              {(isStudent ? ['Meeting'] : EVENT_TYPES).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="event-priority" label="Priority">
            <select id="event-priority" value={form.priority} onChange={(e) => update('priority', e.target.value)}>
              {EVENT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="form-row">
          <FormField
            id="event-start"
            label="Starts"
            required
            type="datetime-local"
            min={isEdit ? undefined : toLocalInput(new Date())}
            value={form.start}
            onChange={(e) => update('start', e.target.value)}
          />
          <FormField
            id="event-end"
            label="Ends"
            type="datetime-local"
            min={form.start || undefined}
            value={form.end}
            onChange={(e) => update('end', e.target.value)}
            hint="Optional"
          />
        </div>

        <div className="form-row">
          {calendarName ? (
            <FormField id="event-calendar" label="Calendar">
              <input id="event-calendar" value={calendarName} readOnly />
            </FormField>
          ) : (
            <FormField id="event-calendar" label="Calendar" required>
              <select id="event-calendar" value={form.calendar} onChange={(e) => update('calendar', e.target.value)}>
                {form.calendar === '' && <option value="">Choose a calendar</option>}
                {isAdmin && <option value={SHARED}>Shared academic calendar (everyone)</option>}
                {groups.map((group) => (
                  <option key={group.id} value={String(group.id)}>
                    {group.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField
            id="event-location"
            label="Location"
            maxLength={200}
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            placeholder="Room or online meeting link"
          />
        </div>

        <FormField
          id="event-description"
          label="Description"
          as="textarea"
          rows={3}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Agenda, what to prepare..."
        />

        {warning && (
          <div className="alert alert-warning" role="alert">
            <Icon name="alert" size={18} />
            <span>
              {warning} You can change the time, or choose <strong>Save anyway</strong>.
            </span>
          </div>
        )}

        <p className="field-hint mb-0">The people on this calendar will be notified.</p>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : warning ? 'Save anyway' : isEdit ? 'Save changes' : 'Add event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
