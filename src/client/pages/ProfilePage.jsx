// ProfilePage: "My profile" for every role. Shows the account and role details
// (group and supervisor for students, groups and capacity for supervisors, ...),
// lets the user edit their name plus major (students) or department (staff),
// and change their password. Email and GPA can only be changed by an administrator.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getProfile, updateProfile } from '../api/profile.js';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Avatar from '../components/common/Avatar.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import FormField from '../components/common/FormField.jsx';
import ProgressBar from '../components/common/ProgressBar.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import ChangePasswordForm from '../components/auth/ChangePasswordForm.jsx';
import { formatDate, plural } from '../utils/format.js';
import '../styles/profile.css';

// Small grey note for fields only an administrator may change
function AdminOnlyNote() {
  return (
    <span className="profile-admin-note">
      <Icon name="lock" size={12} /> Changed by the administrator
    </span>
  );
}

// ----- Personal details: view mode and edit mode -----
function PersonalDetailsCard({ profile, onSaved }) {
  const toast = useToast();
  const isStudent = profile.role === 'Student';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [extra, setExtra] = useState(''); // major (students) or department (staff)
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const extraLabel = isStudent ? 'Major' : 'Department';
  const extraValue = isStudent ? profile.major : profile.department;

  function startEditing() {
    setName(profile.name);
    setExtra(extraValue || '');
    setErrors({});
    setFormError('');
    setEditing(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setErrors({ name: 'Please enter your name.' });
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const data = { name: name.trim() };
      if (isStudent) data.major = extra.trim();
      else data.department = extra.trim();
      const updated = await updateProfile(data);
      toast.success('Your profile has been updated.');
      setEditing(false);
      onSaved(updated);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Personal details"
      icon="user"
      iconColor="teal"
      actions={
        !editing && (
          <button type="button" className="btn btn-secondary btn-small" onClick={startEditing}>
            <Icon name="edit" size={14} /> Edit
          </button>
        )
      }
    >
      {editing ? (
        <form className="form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{formError}</span>
            </div>
          )}
          <div className="form-row">
            <FormField
              id="profile-name"
              label="Full name"
              required
              maxLength={100}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name}
            />
            <FormField
              id="profile-extra"
              label={extraLabel}
              maxLength={100}
              placeholder={isStudent ? 'e.g. Software Engineering' : 'e.g. Computer Science'}
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
            />
          </div>
          <p className="field-hint">
            Your email address{isStudent ? ' and GPA' : ''} can only be changed by the administrator.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="profile-details">
          <div>
            <dt>Full name</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {profile.email}
              <AdminOnlyNote />
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              <StatusBadge status={profile.role} />
            </dd>
          </div>
          <div>
            <dt>{extraLabel}</dt>
            <dd>{extraValue || <span className="muted">Not set</span>}</dd>
          </div>
          {isStudent && (
            <div>
              <dt>GPA</dt>
              <dd>
                {profile.gpa !== null ? Number(profile.gpa).toFixed(2) : <span className="muted">Not set</span>}
                <AdminOnlyNote />
              </dd>
            </div>
          )}
          <div>
            <dt>Member since</dt>
            <dd>{formatDate(profile.createdAt)}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

// ----- Role details: group, supervision, examination or administration -----
function GroupList({ groups }) {
  if (groups.length === 0) {
    return <EmptyState compact icon="users" title="No groups yet" message="Groups you are assigned to appear here." />;
  }
  return (
    <ul className="list profile-groups">
      {groups.map((group) => (
        <li key={group.id}>
          <span className="icon-tile tile-teal profile-group-icon">
            <Icon name="users" size={18} />
          </span>
          <div className="profile-group-text">
            <Link to={`/groups/${group.id}`} className="profile-group-name">
              {group.name}
            </Link>
            <div className="meta">
              <span>{group.projectTitle || 'No project yet'}</span>
              <span>{plural(group.memberCount, 'student')}</span>
            </div>
          </div>
          {group.projectStatus && <StatusBadge status={group.projectStatus} />}
        </li>
      ))}
    </ul>
  );
}

function RoleDetailsCard({ profile }) {
  if (profile.role === 'Student') {
    return (
      <Card
        title="My group"
        icon="users"
        iconColor="blue"
        actions={
          profile.groupId && (
            <Link to="/project" className="btn btn-ghost btn-small">
              My project <Icon name="arrowRight" size={14} />
            </Link>
          )
        }
      >
        {profile.groupId ? (
          <dl className="profile-details">
            <div>
              <dt>Group</dt>
              <dd>{profile.groupName}</dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd className="profile-project">
                {profile.projectTitle || <span className="muted">No project yet</span>}
                {profile.projectStatus && <StatusBadge status={profile.projectStatus} />}
              </dd>
            </div>
            <div>
              <dt>Supervisor</dt>
              <dd>{profile.supervisorName || <span className="muted">Not chosen yet</span>}</dd>
            </div>
            <div>
              <dt>Examiner</dt>
              <dd>{profile.examinerName || <span className="muted">Not assigned yet</span>}</dd>
            </div>
          </dl>
        ) : (
          <EmptyState
            compact
            icon="users"
            title="You are not in a group yet"
            message="The administrator will add you to a project group."
          />
        )}
      </Card>
    );
  }

  if (profile.role === 'Supervisor') {
    const max = profile.numberOfGroups || 0;
    const percent = max > 0 ? Math.min(100, Math.round((profile.groupCount / max) * 100)) : 0;
    return (
      <Card
        title="Supervision"
        subtitle="Availability and capacity are managed by the administrator."
        icon="supervisor"
        iconColor="purple"
      >
        <div className="profile-capacity">
          <div className="profile-capacity-head">
            <span>
              <strong>{profile.groupCount}</strong> of {max} groups
            </span>
            <StatusBadge status={profile.isAvailable ? 'Available' : 'Unavailable'} dot />
          </div>
          <ProgressBar value={percent} color={percent >= 100 ? 'amber' : 'teal'} size="small" />
        </div>
        <GroupList groups={profile.currentGroups} />
      </Card>
    );
  }

  if (profile.role === 'Examiner') {
    return (
      <Card title="Groups I examine" subtitle={plural(profile.groupCount, 'group')} icon="proposal" iconColor="purple">
        <GroupList groups={profile.currentGroups} />
      </Card>
    );
  }

  // Administrator: shortcuts to the management pages
  return (
    <Card title="Administration" icon="shield" iconColor="navy">
      <div className="profile-shortcuts">
        <Link to="/users" className="profile-shortcut">
          <span className="icon-tile tile-navy">
            <Icon name="shield" size={18} />
          </span>
          <span>
            <strong>Manage users</strong>
            <small>Accounts, roles and passwords</small>
          </span>
        </Link>
        <Link to="/groups" className="profile-shortcut">
          <span className="icon-tile tile-teal">
            <Icon name="users" size={18} />
          </span>
          <span>
            <strong>Manage groups</strong>
            <small>Members, supervisors and examiners</small>
          </span>
        </Link>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const { data: profile, loading, error, reload, setData } = useApi(() => getProfile(), []);

  function handleSaved(updated) {
    setData(updated);
    // The name is also shown in the sidebar and the top bar
    refreshUser().catch(() => {});
  }

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your account details, your role and your password." />

      {loading ? (
        <Loading text="Loading your profile..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : (
        <>
          <section className="hero profile-hero" aria-label="Account summary">
            <Avatar name={profile.name} size="large" />
            <div className="profile-hero-text">
              <h2>{profile.name}</h2>
              <div className="profile-hero-meta">
                <span>
                  <Icon name="mail" size={15} /> {profile.email}
                </span>
                <span>
                  <Icon name="calendar" size={15} /> Member since {formatDate(profile.createdAt)}
                </span>
              </div>
            </div>
            <StatusBadge status={profile.role} className="profile-hero-role" />
          </section>

          <div className="split">
            <div className="stack">
              <PersonalDetailsCard profile={profile} onSaved={handleSaved} />
              <RoleDetailsCard profile={profile} />
            </div>
            <Card
              title="Change password"
              subtitle="Use at least 8 characters with a letter and a number."
              icon="lock"
              iconColor="amber"
            >
              <ChangePasswordForm />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
