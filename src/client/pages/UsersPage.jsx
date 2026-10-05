// UsersPage: user management for administrators (FR-1, FR-2).
// Shows every account in a searchable table with role and status filters, and lets the
// administrator add users, edit them, set a new password, unlock locked accounts and
// activate/deactivate accounts (always after a confirmation).
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getUsers, setUserActive, unlockUser } from '../api/users.js';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Tabs from '../components/common/Tabs.jsx';
import Avatar from '../components/common/Avatar.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmButton from '../components/common/ConfirmButton.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Icon from '../components/common/Icon.jsx';
import UserFormModal from '../components/users/UserFormModal.jsx';
import SetPasswordModal from '../components/users/SetPasswordModal.jsx';
import { formatDateTime, plural } from '../utils/format.js';
import '../styles/users.css';

const ROLE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Student', label: 'Students' },
  { value: 'Supervisor', label: 'Supervisors' },
  { value: 'Examiner', label: 'Examiners' },
  { value: 'Administrator', label: 'Administrators' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'locked', label: 'Locked' },
];

// Keeps the users that match the chosen role tab, status and search text
function filterUsers(users, { role, status, search }) {
  const text = search.trim().toLowerCase();
  return users.filter((user) => {
    if (role !== 'all' && user.role !== role) return false;
    if (status === 'active' && !user.isActive) return false;
    if (status === 'inactive' && user.isActive) return false;
    if (status === 'locked' && !user.isLocked) return false;
    if (text && !`${user.name} ${user.email}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

// The "Details" column: the most useful profile fields of each role
function UserDetails({ user }) {
  if (user.role === 'Student') {
    return (
      <div className="users-details">
        <span>{user.major || 'No major set'}</span>
        <div className="meta">
          {user.groupName ? <span>{user.groupName}</span> : <span className="text-warning">No group</span>}
          {user.gpa !== null && <span>GPA {Number(user.gpa).toFixed(2)}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="users-details">
      <span>{user.department || 'No department set'}</span>
      <div className="meta">
        {user.role === 'Supervisor' && (
          <>
            <span>
              Groups {user.assignedGroups}/{user.numberOfGroups}
            </span>
            <span className={user.isAvailable ? 'text-success' : 'muted'}>
              {user.isAvailable ? 'Available' : 'Unavailable'}
            </span>
          </>
        )}
        {user.role === 'Examiner' && <span>{plural(user.assignedGroups ?? 0, 'group')}</span>}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: me, refreshUser } = useAuth();
  const toast = useToast();
  const { data: users, loading, error, reload, setData } = useApi(() => getUsers(), []);

  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  // formUser: undefined = form closed, null = adding a new user, object = editing that user
  const [formUser, setFormUser] = useState(undefined);
  const [passwordUser, setPasswordUser] = useState(null);

  const allUsers = useMemo(() => users || [], [users]);
  const visibleUsers = useMemo(
    () => filterUsers(allUsers, { role, status, search }),
    [allUsers, role, status, search]
  );

  // Numbers for the stat cards and the role tabs
  const stats = useMemo(() => {
    const countRole = (name) => allUsers.filter((user) => user.role === name).length;
    return {
      total: allUsers.length,
      Student: countRole('Student'),
      Supervisor: countRole('Supervisor'),
      Examiner: countRole('Examiner'),
      Administrator: countRole('Administrator'),
      attention: allUsers.filter((user) => !user.isActive || user.isLocked).length,
    };
  }, [allUsers]);

  const filtersUsed = role !== 'all' || status !== 'all' || search.trim() !== '';

  function clearFilters() {
    setRole('all');
    setStatus('all');
    setSearch('');
  }

  // Puts an updated user into the table without loading everything again
  function replaceUser(updated) {
    setData((list) => list.map((user) => (user.id === updated.id ? updated : user)));
  }

  function handleSaved(saved) {
    const wasNew = formUser === null;
    setFormUser(undefined);
    if (wasNew) {
      reload(); // a new user must appear in the right sorted place
    } else {
      replaceUser(saved);
      // Editing my own name or email: update the name shown in the sidebar and top bar
      if (saved.id === me.id) refreshUser().catch(() => {});
    }
  }

  async function handleToggleActive(user) {
    const updated = await setUserActive(user.id, !user.isActive);
    replaceUser(updated);
    toast.success(updated.isActive ? `${user.name} can sign in again.` : `${user.name} has been deactivated.`);
  }

  async function handleUnlock(user) {
    const updated = await unlockUser(user.id);
    replaceUser(updated);
    toast.success(`${user.name}'s account has been unlocked.`);
  }

  function handlePasswordSaved(message) {
    setPasswordUser(null);
    toast.success(message);
    reload(); // the account may have been unlocked
  }

  const roleTabs = ROLE_TABS.map((tab) => ({
    ...tab,
    count: tab.value === 'all' ? stats.total : stats[tab.value],
  }));

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Create accounts, update their details and control who can sign in."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setFormUser(null)}>
            <Icon name="plus" size={18} /> Add user
          </button>
        }
      />

      {loading ? (
        <Loading text="Loading users..." />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard icon="users" color="teal" value={stats.total} label="Total users" />
            <StatCard icon="project" color="blue" value={stats.Student} label="Students" />
            <StatCard
              icon="supervisor"
              color="purple"
              value={stats.Supervisor + stats.Examiner}
              label="Supervisors & examiners"
            />
            <StatCard
              icon="alert"
              color="amber"
              value={stats.attention}
              label="Inactive or locked"
              tag={stats.attention > 0 ? 'Check' : undefined}
              tagColor="amber"
            />
          </div>

          <Card flush className="users-card">
            <div className="users-toolbar">
              <Tabs tabs={roleTabs} active={role} onChange={setRole} ariaLabel="Filter by role" />
              <div className="users-filters">
                <div className="users-search">
                  <label htmlFor="users-search" className="sr-only">
                    Search by name or email
                  </label>
                  <div className="input-with-icon">
                    <Icon name="search" size={18} />
                    <input
                      id="users-search"
                      type="search"
                      placeholder="Search by name or email..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </div>
                <div className="users-status-filter">
                  <label htmlFor="users-status" className="sr-only">
                    Filter by status
                  </label>
                  <select id="users-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    {STATUS_FILTERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <p className="users-count" aria-live="polite">
              Showing {plural(visibleUsers.length, 'user')}
              {filtersUsed && (
                <>
                  {' · '}
                  <button type="button" className="link-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              )}
            </p>

            {visibleUsers.length === 0 ? (
              <EmptyState
                icon="search"
                title="No users found"
                message={filtersUsed ? 'Try another search or clear the filters.' : 'Add the first user to get started.'}
                action={
                  filtersUsed ? (
                    <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table users-table">
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Role</th>
                      <th scope="col">Details</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="users-actions-head">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => {
                      const isMe = user.id === me.id;
                      return (
                        <tr key={user.id} className={user.isActive ? undefined : 'users-row-inactive'}>
                          <td data-label="User">
                            <div className="users-person">
                              <Avatar name={user.name} />
                              <div className="users-person-text">
                                <strong>
                                  {user.name}
                                  {isMe && <span className="badge badge-teal users-you">You</span>}
                                </strong>
                                <span>{user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td data-label="Role">
                            <StatusBadge status={user.role} />
                          </td>
                          <td data-label="Details">
                            <UserDetails user={user} />
                          </td>
                          <td data-label="Status">
                            <div className="users-status">
                              <StatusBadge status={user.isActive ? 'Active' : 'Inactive'} dot />
                              {user.isLocked && (
                                <span
                                  className="badge badge-red"
                                  title={`Locked until ${formatDateTime(user.lockedUntil)}`}
                                >
                                  <Icon name="lock" size={12} /> Locked
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="actions-cell">
                            <div className="users-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setFormUser(user)}
                                aria-label={`Edit ${user.name}`}
                              >
                                <Icon name="edit" size={14} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setPasswordUser(user)}
                                aria-label={`Set a new password for ${user.name}`}
                              >
                                <Icon name="lock" size={14} /> Password
                              </button>
                              {user.isLocked && (
                                <ConfirmButton
                                  className="btn btn-secondary btn-small"
                                  danger={false}
                                  title="Unlock account"
                                  message={`${user.name} will be able to try signing in again right away. The password does not change.`}
                                  confirmLabel="Unlock"
                                  ariaLabel={`Unlock ${user.name}`}
                                  onConfirm={() => handleUnlock(user)}
                                >
                                  <Icon name="refresh" size={14} /> Unlock
                                </ConfirmButton>
                              )}
                              {/* Administrators cannot deactivate their own account */}
                              {!isMe &&
                                (user.isActive ? (
                                  <ConfirmButton
                                    className="btn btn-ghost btn-small users-deactivate"
                                    title="Deactivate account"
                                    message={`${user.name} will not be able to sign in, and any open session ends right away. You can activate the account again later.`}
                                    confirmLabel="Deactivate"
                                    ariaLabel={`Deactivate ${user.name}`}
                                    onConfirm={() => handleToggleActive(user)}
                                  >
                                    <Icon name="x" size={14} /> Deactivate
                                  </ConfirmButton>
                                ) : (
                                  <ConfirmButton
                                    className="btn btn-ghost btn-small users-activate"
                                    danger={false}
                                    title="Activate account"
                                    message={`${user.name} will be able to sign in again.`}
                                    confirmLabel="Activate"
                                    ariaLabel={`Activate ${user.name}`}
                                    onConfirm={() => handleToggleActive(user)}
                                  >
                                    <Icon name="check" size={14} /> Activate
                                  </ConfirmButton>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {formUser !== undefined && (
        <UserFormModal user={formUser} onClose={() => setFormUser(undefined)} onSaved={handleSaved} />
      )}

      {passwordUser && (
        <SetPasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSaved={handlePasswordSaved}
        />
      )}
    </>
  );
}
