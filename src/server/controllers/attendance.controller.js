// Attendance for group meetings and presentations (FR-15, UC14 Take Attendance).
//
// A "session" is a Meeting or Presentation event on a group's calendar (important_date).
// The group's supervisor (or an administrator) marks each student of the group as
// Present, Absent, Late or Excused. Records can be changed later (UC14 alternative flow).
//
// Attendance rate = (Present + Late) / (Present + Late + Absent), in percent.
// Excused sessions do not count against the student.

import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { oneOf, toInt } from '../utils/validate.js';
import { assertGroupAccess, isGroupSupervisor } from '../services/access.js';

// Must match the CHECK constraint of attendance.Status in schema.sql
export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

// The event types that attendance is taken for
const SESSION_TYPES = ['Meeting', 'Presentation'];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function emptyCounts() {
  return { present: 0, absent: 0, late: 0, excused: 0 };
}

// Adds one attendance status to a counts object, e.g. 'Late' -> counts.late += n
function addToCounts(counts, status, amount = 1) {
  const key = status.toLowerCase();
  if (key in counts) counts[key] += amount;
}

// (Present + Late) / (Present + Late + Absent) in percent, or null when nothing counts yet
function attendanceRate({ present, late, absent }) {
  const counted = present + late + absent;
  return counted === 0 ? null : Math.round(((present + late) / counted) * 100);
}

// True for the group's supervisor and for administrators
async function canRecordAttendance(user, groupId) {
  return user.role === 'Administrator' || (await isGroupSupervisor(user, groupId));
}

// The students of a group: [{ studentId, userId, name, email, isActive }] ordered by name
async function getGroupStudents(groupId) {
  const rows = await query(
    `SELECT s.StudentID AS studentId, u.UserID AS userId, u.Name AS name, u.Email AS email, u.IsActive AS isActive
       FROM student s
       JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID = ?
      ORDER BY u.Name`,
    [groupId]
  );
  return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
}

/**
 * Loads one session (a Meeting or Presentation of a group) or throws:
 * 404 when the event does not exist, 400 when attendance cannot be taken for it.
 */
async function findSession(idValue) {
  const id = toInt(idValue, 'Session id', { min: 1 });
  const rows = await query(
    `SELECT d.DeadlineID AS id, d.Title AS title, d.Description AS description, d.DeadlineType AS type,
            d.EventDate AS eventDate, d.EndDate AS endDate, d.Location AS location,
            c.GroupID AS groupId, g.GroupName AS groupName
       FROM important_date d
       JOIN calendar c ON c.CalendarID = d.CalendarID
       LEFT JOIN project_group g ON g.GroupID = c.GroupID
      WHERE d.DeadlineID = ?`,
    [id]
  );
  const session = rows[0];
  if (!session) throw new HttpError(404, 'Meeting not found');
  if (session.groupId === null || !SESSION_TYPES.includes(session.type)) {
    throw new HttpError(400, 'Attendance is only taken for group meetings and presentations.');
  }
  return session;
}

/**
 * Counts the recorded statuses of several sessions (only students who are still in the group).
 * Returns a Map: sessionId -> { present, absent, late, excused }
 */
async function getCountsBySession(sessionIds, groupId) {
  const counts = new Map(sessionIds.map((id) => [id, emptyCounts()]));
  if (sessionIds.length === 0) return counts; // "IN ()" would be invalid SQL

  const rows = await query(
    `SELECT a.DeadlineID AS sessionId, a.Status AS status, COUNT(*) AS total
       FROM attendance a
       JOIN student s ON s.StudentID = a.StudentID
      WHERE a.DeadlineID IN (?) AND s.GroupID = ?
      GROUP BY a.DeadlineID, a.Status`,
    [sessionIds, groupId]
  );
  rows.forEach((row) => addToCounts(counts.get(row.sessionId), row.status, row.total));
  return counts;
}

// Adds "notRecorded" = how many of the expected records are still missing
// (students without a record for a session, or sessions without a record for a student)
function withNotRecorded(counts, expected) {
  const recorded = counts.present + counts.absent + counts.late + counts.excused;
  return { ...counts, notRecorded: Math.max(0, expected - recorded) };
}

// The full detail of one session: the event, the counts and every student with their status
async function buildSessionDetail(session, user) {
  const students = await query(
    `SELECT s.StudentID AS studentId, u.UserID AS userId, u.Name AS name, u.Email AS email,
            a.Status AS status, a.RecordedAt AS recordedAt, ru.Name AS recordedByName
       FROM student s
       JOIN \`user\` u ON u.UserID = s.UserID
       LEFT JOIN attendance a ON a.StudentID = s.StudentID AND a.DeadlineID = ?
       LEFT JOIN \`user\` ru ON ru.UserID = a.RecordedByUserID
      WHERE s.GroupID = ?
      ORDER BY u.Name`,
    [session.id, session.groupId]
  );

  const counts = emptyCounts();
  students.forEach((student) => {
    if (student.status) addToCounts(counts, student.status);
  });

  const hasStarted = session.eventDate.getTime() <= Date.now();
  return {
    ...session,
    hasStarted,
    canRecord: hasStarted && (await canRecordAttendance(user, session.groupId)),
    counts: withNotRecorded(counts, students.length),
    students: students.map((student) => ({
      studentId: student.studentId,
      userId: student.userId,
      name: student.name,
      email: student.email,
      status: student.status || null, // null = not recorded yet
      recordedAt: student.recordedAt,
      recordedBy: student.recordedByName || null,
    })),
  };
}

// ---------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------

/**
 * GET /api/attendance/sessions?groupId=
 * The group's meetings and presentations with attendance counts.
 * Sessions that have started come first (newest first), then the upcoming ones (soonest first).
 */
export async function listSessions(req, res) {
  const groupId = await assertGroupAccess(req.user, req.query.groupId);

  const sessions = await query(
    `SELECT d.DeadlineID AS id, d.Title AS title, d.DeadlineType AS type,
            d.EventDate AS eventDate, d.EndDate AS endDate, d.Location AS location
       FROM important_date d
       JOIN calendar c ON c.CalendarID = d.CalendarID
      WHERE c.GroupID = ? AND d.DeadlineType IN (?)
      ORDER BY d.EventDate DESC`,
    [groupId, SESSION_TYPES]
  );

  const [countRows, studentRows, mayRecord] = await Promise.all([
    getCountsBySession(sessions.map((s) => s.id), groupId),
    query('SELECT COUNT(*) AS total FROM student WHERE GroupID = ?', [groupId]),
    canRecordAttendance(req.user, groupId),
  ]);
  const studentCount = studentRows[0].total;
  const now = Date.now();

  const list = sessions.map((session) => {
    const hasStarted = session.eventDate.getTime() <= now;
    return {
      ...session,
      groupId,
      hasStarted,
      canRecord: hasStarted && mayRecord,
      studentCount,
      counts: withNotRecorded(countRows.get(session.id), studentCount),
    };
  });

  // Started sessions stay newest-first; upcoming sessions are shown soonest-first
  const started = list.filter((s) => s.hasStarted);
  const upcoming = list.filter((s) => !s.hasStarted).reverse();
  res.json([...started, ...upcoming]);
}

// GET /api/attendance/sessions/:eventId -> the session + every student of the group with their status
export async function getSession(req, res) {
  const session = await findSession(req.params.eventId);
  await assertGroupAccess(req.user, session.groupId);
  res.json(await buildSessionDetail(session, req.user));
}

/**
 * PUT /api/attendance/sessions/:eventId { records: [{ studentId, status }] }
 * UC14: the group's supervisor (or an administrator) records attendance.
 * Existing records are updated. status null removes a student's record again.
 */
export async function saveAttendance(req, res) {
  const session = await findSession(req.params.eventId);
  await assertGroupAccess(req.user, session.groupId);
  if (!(await canRecordAttendance(req.user, session.groupId))) {
    throw new HttpError(403, "Only the group's supervisor can record attendance.");
  }
  if (session.eventDate.getTime() > Date.now()) {
    throw new HttpError(400, 'Attendance can only be recorded for meetings that have started.');
  }

  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    throw new HttpError(400, 'Please mark the attendance of at least one student.');
  }

  // Only students of this group may be recorded
  const students = await getGroupStudents(session.groupId);
  const memberIds = new Set(students.map((s) => s.studentId));

  // A Map keeps one entry per student (if a student is sent twice, the last one wins)
  const changes = new Map();
  for (const record of records) {
    const studentId = toInt(record?.studentId, 'Student id');
    if (!memberIds.has(studentId)) {
      throw new HttpError(400, 'One of the students is not a member of this group.');
    }
    const status =
      record.status === null || record.status === ''
        ? null
        : oneOf(record.status, ATTENDANCE_STATUSES, 'Attendance status');
    changes.set(studentId, status);
  }

  // Save everything together: either all records are stored or none
  const recordedAt = new Date();
  await withTransaction(async (conn) => {
    for (const [studentId, status] of changes) {
      if (status === null) {
        await conn.query('DELETE FROM attendance WHERE DeadlineID = ? AND StudentID = ?', [session.id, studentId]);
      } else {
        // Insert a new record, or update the existing one (UNIQUE DeadlineID + StudentID)
        await conn.query(
          `INSERT INTO attendance (DeadlineID, StudentID, Status, RecordedByUserID, RecordedAt)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE Status = VALUES(Status),
                                   RecordedByUserID = VALUES(RecordedByUserID),
                                   RecordedAt = VALUES(RecordedAt)`,
          [session.id, studentId, status, req.user.id, recordedAt]
        );
      }
    }
  });

  res.json(await buildSessionDetail(session, req.user));
}

/**
 * GET /api/attendance/me (students)
 * The student's own attendance for the sessions of their group that have started, and their rate.
 */
export async function getMyAttendance(req, res) {
  const { groupId, studentId } = req.user;
  if (!groupId) {
    res.json({
      group: null,
      records: [],
      counts: { ...emptyCounts(), notRecorded: 0 },
      rate: null,
      nextSession: null,
    });
    return;
  }

  const [groupRows, records, nextRows] = await Promise.all([
    query('SELECT GroupID AS id, GroupName AS name FROM project_group WHERE GroupID = ?', [groupId]),
    query(
      `SELECT d.DeadlineID AS eventId, d.Title AS title, d.DeadlineType AS type,
              d.EventDate AS eventDate, d.EndDate AS endDate, d.Location AS location,
              a.Status AS status, a.RecordedAt AS recordedAt
         FROM important_date d
         JOIN calendar c ON c.CalendarID = d.CalendarID
         LEFT JOIN attendance a ON a.DeadlineID = d.DeadlineID AND a.StudentID = ?
        WHERE c.GroupID = ? AND d.DeadlineType IN (?) AND d.EventDate <= NOW()
        ORDER BY d.EventDate DESC`,
      [studentId, groupId, SESSION_TYPES]
    ),
    query(
      `SELECT d.DeadlineID AS id, d.Title AS title, d.DeadlineType AS type,
              d.EventDate AS eventDate, d.Location AS location
         FROM important_date d
         JOIN calendar c ON c.CalendarID = d.CalendarID
        WHERE c.GroupID = ? AND d.DeadlineType IN (?) AND d.EventDate > NOW()
        ORDER BY d.EventDate
        LIMIT 1`,
      [groupId, SESSION_TYPES]
    ),
  ]);

  const counts = emptyCounts();
  let notRecorded = 0;
  for (const record of records) {
    if (record.status) addToCounts(counts, record.status);
    else notRecorded += 1;
  }

  res.json({
    group: groupRows[0] || null,
    records: records.map((record) => ({ ...record, status: record.status || null })),
    counts: { ...counts, notRecorded },
    rate: attendanceRate(counts),
    nextSession: nextRows[0] || null,
  });
}

/**
 * GET /api/attendance/summary?groupId=
 * One row per student of the group: how often they were present, absent, late or excused,
 * and their attendance rate. Only sessions that have started are counted.
 */
export async function getSummary(req, res) {
  const groupId = await assertGroupAccess(req.user, req.query.groupId);

  const [students, sessionRows, countRows] = await Promise.all([
    getGroupStudents(groupId),
    query(
      `SELECT COUNT(*) AS total
         FROM important_date d
         JOIN calendar c ON c.CalendarID = d.CalendarID
        WHERE c.GroupID = ? AND d.DeadlineType IN (?) AND d.EventDate <= NOW()`,
      [groupId, SESSION_TYPES]
    ),
    // Only records of sessions that have started, the same sessions as sessionCount
    query(
      `SELECT a.StudentID AS studentId, a.Status AS status, COUNT(*) AS total
         FROM attendance a
         JOIN important_date d ON d.DeadlineID = a.DeadlineID
         JOIN calendar c ON c.CalendarID = d.CalendarID
        WHERE c.GroupID = ? AND d.DeadlineType IN (?) AND d.EventDate <= NOW()
        GROUP BY a.StudentID, a.Status`,
      [groupId, SESSION_TYPES]
    ),
  ]);
  const sessionCount = sessionRows[0].total;

  // studentId -> counts
  const countsByStudent = new Map(students.map((s) => [s.studentId, emptyCounts()]));
  countRows.forEach((row) => {
    const counts = countsByStudent.get(row.studentId);
    if (counts) addToCounts(counts, row.status, row.total);
  });

  res.json(
    students.map((student) => {
      const counts = countsByStudent.get(student.studentId);
      return {
        studentId: student.studentId,
        userId: student.userId,
        name: student.name,
        email: student.email,
        ...withNotRecorded(counts, sessionCount),
        sessions: sessionCount,
        rate: attendanceRate(counts),
      };
    })
  );
}
