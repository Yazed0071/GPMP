// TeamCard: the students of a group (FR-4 "team members").
//
// Props:
//   members  array  [{ studentId, name, email, major }]
import Card from '../common/Card.jsx';
import Avatar from '../common/Avatar.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { plural } from '../../utils/format.js';

export default function TeamCard({ members = [] }) {
  return (
    <Card title="Team members" subtitle={plural(members.length, 'student')} icon="users" iconColor="blue" flush>
      {members.length === 0 ? (
        <EmptyState compact icon="users" title="No members yet" message="The administrator adds students to the group." />
      ) : (
        <ul className="list">
          {members.map((member) => (
            <li key={member.studentId}>
              <Avatar name={member.name} />
              <div className="proj-person">
                <strong>{member.name}</strong>
                <div className="meta">
                  {member.major && <span>{member.major}</span>}
                  <span className="truncate">{member.email}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
