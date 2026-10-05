// Fills an EMPTY gpmp database with realistic demo data (users, groups, projects,
// tasks, submissions, files, calendar, chat, announcements, notifications, resources).
// Normally run through "npm run db:setup", which first re-creates all tables.
// It can also be run alone ("node database/seed.js") on an empty database.
//
// Every demo account uses the password Gpmp@2026.
// All dates are relative to "now", so the demo always looks current.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { UPLOAD_DIR } from '../src/server/utils/paths.js';
import { makePdf, makeText, makeCsv } from './seed-files.js';

export const DEMO_PASSWORD = 'Gpmp@2026';

// ---------------------------------------------------------------------
// Date helpers. The values saved are UTC, but "today" is the Riyadh calendar day,
// so the demo is right even when db:setup runs after midnight.
// ---------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const RIYADH_OFFSET = 3 * 60 * 60 * 1000; // Riyadh is UTC+3 all year (no daylight saving)

// A date-time `days` from now (negative = in the past).
// With riyadhHour the time of day is fixed, e.g. at(2, 10) = in 2 days at 10:00 Riyadh time.
function at(days, riyadhHour = null, minute = 0) {
  if (riyadhHour === null) {
    const date = new Date(NOW.getTime() + days * DAY);
    date.setUTCSeconds(0, 0);
    return date;
  }
  // Move to Riyadh time, set the hour on that Riyadh day, then convert back to UTC
  const riyadh = new Date(NOW.getTime() + RIYADH_OFFSET + days * DAY);
  riyadh.setUTCHours(riyadhHour, minute, 0, 0);
  return new Date(riyadh.getTime() - RIYADH_OFFSET);
}

// A DATE value 'YYYY-MM-DD' `days` from today (the Riyadh calendar day)
function dateOnly(days) {
  return new Date(NOW.getTime() + RIYADH_OFFSET + days * DAY).toISOString().slice(0, 10);
}

// The current academic year, e.g. '2026-2027' (a new year starts in August)
function currentAcademicYear() {
  const year = NOW.getUTCFullYear();
  return NOW.getUTCMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Inserts one row (an object of column -> value) and returns the new id
async function insert(conn, table, row) {
  const [result] = await conn.query(`INSERT INTO \`${table}\` SET ?`, [row]);
  return result.insertId;
}

// ---------------------------------------------------------------------
// People
// ---------------------------------------------------------------------

const ADMIN = { key: 'admin', name: 'Nora Alsaleh', email: 'admin@gpmp.edu', department: 'Deanship of Academic Affairs' };

const SUPERVISORS = [
  { key: 'sup1', name: 'Dr. Ahmed Alotaibi', email: 'supervisor1@gpmp.edu', department: 'Software Engineering', maxGroups: 3, available: 1 },
  { key: 'sup2', name: 'Dr. Mona Alshehri', email: 'supervisor2@gpmp.edu', department: 'Computer Science', maxGroups: 3, available: 1 },
  { key: 'sup3', name: 'Dr. Faisal Alghamdi', email: 'supervisor3@gpmp.edu', department: 'Information Systems', maxGroups: 2, available: 0 },
];

const EXAMINERS = [
  { key: 'ex1', name: 'Dr. Hessa Aldosari', email: 'examiner1@gpmp.edu', department: 'Software Engineering' },
  { key: 'ex2', name: 'Dr. Omar Alzahrani', email: 'examiner2@gpmp.edu', department: 'Computer Science' },
];

// group: the key of the group in GROUPS below (null = not in a group yet)
const STUDENTS = [
  { key: 's1', name: 'Sara Alqahtani', email: 'student1@gpmp.edu', major: 'Software Engineering', gpa: 3.85, group: 'alpha' },
  { key: 's2', name: 'Abdullah Alrashid', email: 'student2@gpmp.edu', major: 'Software Engineering', gpa: 3.42, group: 'alpha' },
  { key: 's3', name: 'Reem Almutairi', email: 'student3@gpmp.edu', major: 'Software Engineering', gpa: 3.67, group: 'alpha' },
  { key: 's4', name: 'Yousef Alshammari', email: 'student4@gpmp.edu', major: 'Computer Science', gpa: 3.15, group: 'beta' },
  { key: 's5', name: 'Lama Alanazi', email: 'student5@gpmp.edu', major: 'Computer Science', gpa: 3.78, group: 'beta' },
  { key: 's6', name: 'Turki Aldossary', email: 'student6@gpmp.edu', major: 'Computer Science', gpa: 2.96, group: 'beta' },
  { key: 's7', name: 'Maha Alsubaie', email: 'student7@gpmp.edu', major: 'Information Systems', gpa: 3.25, group: null },
  { key: 's8', name: 'Nawaf Alenezi', email: 'student8@gpmp.edu', major: 'Information Systems', gpa: 3.05, group: 'gamma' },
  { key: 's9', name: 'Jana Alharthi', email: 'student9@gpmp.edu', major: 'Information Systems', gpa: 3.58, group: 'gamma' },
  { key: 'alumni1', name: 'Hamad Alkhaldi', email: 'alumni1@gpmp.edu', major: 'Software Engineering', gpa: 3.31, group: 'legacy', since: -800 },
  { key: 'alumni2', name: 'Dana Alomari', email: 'alumni2@gpmp.edu', major: 'Software Engineering', gpa: 3.72, group: 'legacy', since: -800 },
];

const GROUPS = [
  { key: 'alpha', name: 'Team Alpha', supervisor: 'sup1', examiner: 'ex1', createdDays: -55 },
  { key: 'beta', name: 'Team Beta', supervisor: 'sup2', examiner: 'ex2', createdDays: -50 },
  { key: 'gamma', name: 'Team Gamma', supervisor: null, examiner: null, createdDays: -10 },
  { key: 'legacy', name: 'Team Legacy', supervisor: 'sup1', examiner: 'ex1', createdDays: -760 },
];

async function createStaff(ctx, passwordHash) {
  const { conn, people } = ctx;

  const adminUserId = await insert(conn, 'user', {
    Name: ADMIN.name, Email: ADMIN.email, Password: passwordHash, Role: 'Administrator', CreatedAt: at(-900),
  });
  const adminId = await insert(conn, 'admin', { UserID: adminUserId, AdminDepartment: ADMIN.department });
  people.admin = { userId: adminUserId, adminId, name: ADMIN.name };

  for (const s of SUPERVISORS) {
    const userId = await insert(conn, 'user', {
      Name: s.name, Email: s.email, Password: passwordHash, Role: 'Supervisor', CreatedAt: at(-900),
    });
    const supervisorId = await insert(conn, 'supervisor', {
      UserID: userId, SupervisorDepartment: s.department, NumberOfGroups: s.maxGroups, IsAvailable: s.available,
    });
    people[s.key] = { userId, supervisorId, name: s.name };
  }

  for (const e of EXAMINERS) {
    const userId = await insert(conn, 'user', {
      Name: e.name, Email: e.email, Password: passwordHash, Role: 'Examiner', CreatedAt: at(-900),
    });
    const examinerId = await insert(conn, 'examiner', { UserID: userId, ExaminerDepartment: e.department });
    people[e.key] = { userId, examinerId, name: e.name };
  }
}

async function createGroups(ctx) {
  const { conn, people, groups } = ctx;
  for (const g of GROUPS) {
    groups[g.key] = await insert(conn, 'project_group', {
      GroupName: g.name,
      SupervisorID: g.supervisor ? people[g.supervisor].supervisorId : null,
      ExaminerID: g.examiner ? people[g.examiner].examinerId : null,
      CreatedByAdminID: people.admin.adminId,
      CreatedAt: at(g.createdDays),
    });
  }
}

async function createStudents(ctx, passwordHash) {
  const { conn, people, groups } = ctx;
  for (const s of STUDENTS) {
    const userId = await insert(conn, 'user', {
      Name: s.name, Email: s.email, Password: passwordHash, Role: 'Student', CreatedAt: at(s.since ?? -60),
    });
    const studentId = await insert(conn, 'student', {
      UserID: userId, GroupID: s.group ? groups[s.group] : null, StudentMajor: s.major, GPA: s.gpa,
    });
    people[s.key] = { userId, studentId, name: s.name };
  }
}

// ---------------------------------------------------------------------
// Projects and proposals
// ---------------------------------------------------------------------

async function createProjects(ctx) {
  const { conn, people, groups, projects } = ctx;
  const year = currentAcademicYear();

  projects.alpha = await insert(conn, 'graduation_project', {
    GroupID: groups.alpha,
    ProjectTitle: 'Smart Campus Navigation App',
    ProjectDescription:
      'A mobile-friendly web application that helps students, staff and visitors find buildings, classrooms, ' +
      'labs and offices on the Al-Yamamah University campus. It offers indoor and outdoor route guidance, a ' +
      'searchable directory of rooms, live class locations and accessibility-friendly routes.',
    Status: 'In Progress',
    AcademicYear: year,
    CreatedAt: at(-48),
  });
  await insert(conn, 'proposal', {
    ProjectID: projects.alpha,
    ProposalDeadline: dateOnly(-44),
    ProposalTime: at(-46, 11, 20),
    ProposalComments:
      'We propose a campus navigation app to solve the difficulty new students and visitors face when looking ' +
      'for rooms. The full proposal document is in our group documents.',
    Status: 'Approved',
    SupervisorFeedback:
      'Clear problem statement and a realistic scope. Make sure indoor navigation for Building B is covered in the first release.',
    SupervisorReviewedAt: at(-45, 9, 40),
    SupervisorReviewedByUserID: people.sup1.userId,
    ExaminerFeedback:
      'Approved. The idea is useful for the whole university. Please include an accessibility evaluation in the testing chapter.',
    ExaminerReviewedAt: at(-43, 13, 5),
    ExaminerReviewedByUserID: people.ex1.userId,
    DecidedByUserID: people.ex1.userId,
  });

  projects.beta = await insert(conn, 'graduation_project', {
    GroupID: groups.beta,
    ProjectTitle: 'AI Plant Disease Detector',
    ProjectDescription:
      'An application that lets farmers and home gardeners photograph a plant leaf and instantly identify common ' +
      'diseases using a convolutional neural network trained on public leaf-image datasets, with treatment ' +
      'suggestions in Arabic and English.',
    Status: 'Proposed',
    AcademicYear: year,
    CreatedAt: at(-6),
  });
  await insert(conn, 'proposal', {
    ProjectID: projects.beta,
    ProposalDeadline: dateOnly(7),
    ProposalTime: at(-2, 16, 45),
    ProposalComments:
      'Our proposal for an AI-based plant disease detector. We plan to use the PlantVillage dataset and a ' +
      'MobileNet model so the app can run on ordinary phones.',
    Status: 'Pending Supervisor',
  });

  projects.legacy = await insert(conn, 'graduation_project', {
    GroupID: groups.legacy,
    ProjectTitle: 'Library Seat Booking System',
    ProjectDescription:
      'A web system that lets students reserve study seats and group rooms in the university library, with QR ' +
      'check-in, automatic release of no-show bookings and occupancy statistics for library staff.',
    Status: 'Archived',
    AcademicYear: '2024-2025',
    ShowcaseDescription:
      'The Library Seat Booking System was piloted in the central library during the spring semester. Students ' +
      'book a seat or a group room from their phone, check in by scanning the QR code on the desk, and unused ' +
      'bookings are released automatically after 15 minutes. During the four-week pilot, 312 students made more ' +
      'than 1,400 bookings and the no-show rate dropped from 27% to 9%. The system was built with React, ' +
      'Node.js/Express and MySQL. The final report includes the requirements, design, testing results and a ' +
      'user-satisfaction survey.',
    ShowcaseVideoPath: null,
    CompletedAt: at(-480, 14),
    ArchivedAt: at(-470, 10),
    CreatedAt: at(-750),
  });
  await insert(conn, 'proposal', {
    ProjectID: projects.legacy,
    ProposalDeadline: dateOnly(-735),
    ProposalTime: at(-740, 12),
    ProposalComments: 'Proposal for a library seat booking system with QR check-in.',
    Status: 'Approved',
    SupervisorFeedback: 'Good idea with clear value for students. Approved.',
    SupervisorReviewedAt: at(-738, 10),
    SupervisorReviewedByUserID: people.sup1.userId,
    ExaminerFeedback: 'Approved. Consider collecting usage statistics during a pilot.',
    ExaminerReviewedAt: at(-736, 11),
    ExaminerReviewedByUserID: people.ex1.userId,
    DecidedByUserID: people.ex1.userId,
  });
}

// ---------------------------------------------------------------------
// Tasks and milestones
// ---------------------------------------------------------------------

// Team Alpha: 7 of 13 tasks completed (about 54% progress), every status is used
const ALPHA_TASKS = [
  { key: 'proposalMilestone', title: 'Milestone: Project Proposal Approved', due: -44, status: 'Completed', milestone: 1, assignee: null,
    description: 'The project proposal is approved by the supervisor and the examiner.' },
  { key: 'plan', title: 'Project Plan & Gantt Chart', due: -38, status: 'Completed', milestone: 0, assignee: 's2',
    description: 'Prepare the project plan: work breakdown, responsibilities of each member and a Gantt chart for both semesters.' },
  { key: 'ch1', title: 'Chapter 1 — Introduction & Problem Statement', due: -35, status: 'Completed', milestone: 0, assignee: 's1',
    description: 'Write the background, problem statement, objectives, scope and the structure of the report.' },
  { key: 'ch2', title: 'Chapter 2 — Literature Review & Related Systems', due: -28, status: 'Completed', milestone: 0, assignee: 's2',
    description: 'Review recent work on indoor positioning and campus navigation, and compare at least three existing apps.' },
  { key: 'survey', title: 'Requirements Gathering Survey', due: -24, status: 'Completed', milestone: 0, assignee: 's3',
    description: 'Run an online survey with students and staff to collect functional and non-functional requirements.' },
  { key: 'ch3', title: 'Chapter 3 — System Analysis & Design', due: -14, status: 'Completed', milestone: 0, assignee: 's1',
    description: 'Use case diagram and descriptions, sequence diagrams, class diagram, ERD and database schema.' },
  { key: 'ui', title: 'UI Prototype in Figma', due: -10, status: 'Completed', milestone: 0, assignee: 's3',
    description: 'Design the main screens (home, search, route, building details) for mobile and desktop.' },
  { key: 'db', title: 'Database Implementation', due: 1, status: 'Submitted', milestone: 0, assignee: 's2',
    description: 'Create the MySQL schema, relationships and seed data for buildings, floors, rooms and routes.' },
  { key: 'api', title: 'Backend REST API — Authentication & Users', due: 5, status: 'In Progress', milestone: 0, assignee: 's2',
    description: 'Implement login, roles and user endpoints with Express, including input validation and error handling.' },
  { key: 'map', title: 'Indoor Map Screen & Route Finder', due: -1, status: 'In Progress', milestone: 0, assignee: 's3',
    description: 'Show the floor plan of Building B and draw the shortest route between two rooms.' },
  { key: 'midterm', title: 'Milestone: Mid-term Progress Presentation', due: 12, status: 'To Do', milestone: 1, assignee: null,
    description: 'Present the analysis, design and a short live demo to the supervisor and the examiner.' },
  { key: 'ch4', title: 'Chapter 4 — Implementation', due: 21, status: 'To Do', milestone: 0, assignee: 's1',
    description: 'Describe the architecture, main modules, important code and the tools used.' },
  { key: 'final', title: 'Milestone: Final Report & Showcase Submission', due: 60, status: 'To Do', milestone: 1, assignee: null,
    description: 'Submit the final report, source code and the showcase video with a written description.' },
];

const BETA_TASKS = [
  { key: 'dataset', title: 'Collect Plant Leaf Image Dataset', due: 10, status: 'In Progress', milestone: 0, assignee: 's5',
    description: 'Download and clean the PlantVillage dataset and add photos of local plants.' },
  { key: 'models', title: 'Research CNN Models for Image Classification', due: 14, status: 'To Do', milestone: 0, assignee: 's4',
    description: 'Compare MobileNet, EfficientNet and ResNet in accuracy and size.' },
  { key: 'slides', title: 'Proposal Presentation Slides', due: 6, status: 'To Do', milestone: 0, assignee: 's6',
    description: 'Prepare 8-10 slides that explain the problem, the idea and the plan.' },
];

const LEGACY_TASKS = [
  { key: 'lch1', title: 'Chapter 1 — Introduction', due: -700, status: 'Completed', milestone: 0, assignee: 'alumni1', description: 'Introduction chapter.' },
  { key: 'ldesign', title: 'System Design & Database', due: -650, status: 'Completed', milestone: 0, assignee: 'alumni2', description: 'Design chapter and database.' },
  { key: 'limpl', title: 'Implementation & Testing', due: -530, status: 'Completed', milestone: 0, assignee: 'alumni1', description: 'Build and test the system.' },
  { key: 'lfinal', title: 'Milestone: Final Report & Presentation', due: -490, status: 'Completed', milestone: 1, assignee: null, description: 'Submit the final report and present.' },
];

async function createTaskList(ctx, groupKey, supervisorKey, list, createdDaysBeforeDue = 10) {
  const { conn, people, groups, tasks } = ctx;
  for (const t of list) {
    tasks[t.key] = await insert(conn, 'task', {
      GroupID: groups[groupKey],
      SupervisorID: people[supervisorKey].supervisorId,
      Title: t.title,
      DueDate: dateOnly(t.due),
      Status: t.status,
      Description: t.description,
      IsMilestone: t.milestone,
      AssignedToStudentID: t.assignee ? people[t.assignee].studentId : null,
      CreatedByUserID: people[supervisorKey].userId,
      CreatedAt: at(Math.min(t.due - createdDaysBeforeDue, -3), 9),
      UpdatedAt: at(Math.min(t.due, -1), 15),
    });
  }
}

async function createTasks(ctx) {
  await createTaskList(ctx, 'alpha', 'sup1', ALPHA_TASKS);
  await createTaskList(ctx, 'beta', 'sup2', BETA_TASKS, 4);
  await createTaskList(ctx, 'legacy', 'sup1', LEGACY_TASKS);
}

// ---------------------------------------------------------------------
// Files (written to uploads/ so downloads work)
// ---------------------------------------------------------------------

const MIME_TYPES = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv' };

// Writes the file to disk and inserts its `file` row. Returns the FileID.
async function addFile(ctx, { group, fileName, content, uploadedBy, uploadDate, category = 'Document', submissionId = null, version = 1 }) {
  const extension = path.extname(fileName).toLowerCase();
  const slug = path.basename(fileName, extension).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const storedName = `seed-${group}-${slug}-v${version}${extension}`;

  await fs.writeFile(path.join(UPLOAD_DIR, storedName), content);

  return insert(ctx.conn, 'file', {
    SubmissionID: submissionId,
    UploadedByUserID: ctx.people[uploadedBy].userId,
    FileName: fileName,
    FilePath: storedName,
    UploadDate: uploadDate,
    GroupID: ctx.groups[group],
    FileSize: content.length,
    MimeType: MIME_TYPES[extension] || 'application/octet-stream',
    Category: category,
    Version: version,
  });
}

// ---------------------------------------------------------------------
// Submissions and feedback (Team Alpha)
// ---------------------------------------------------------------------

async function createSubmissions(ctx) {
  const { conn, people, groups, tasks } = ctx;
  const alphaTaskDue = Object.fromEntries(ALPHA_TASKS.map((t) => [t.key, t.due]));

  // Adds one submission with an optional attached file and optional feedback
  async function submit({ task, student, days, hour = 20, minute = 15, status, notes, source = null, file = null, feedback = null }) {
    const submissionId = await insert(conn, 'submission', {
      TaskID: tasks[task],
      GroupID: groups.alpha,
      SubmittedByStudentID: people[student].studentId,
      SubmissionDeadline: dateOnly(alphaTaskDue[task]),
      SubmissionDate: at(days, hour, minute),
      SubmissionSource: source,
      Status: status,
      Notes: notes,
    });

    if (file) {
      await addFile(ctx, {
        group: 'alpha', uploadedBy: student, uploadDate: at(days, hour, minute), category: 'Submission',
        submissionId, ...file,
      });
    }

    if (feedback) {
      await insert(conn, 'feedback', {
        SubmissionID: submissionId,
        GivenByUserID: people.sup1.userId,
        Decision: feedback.decision,
        Strengths: feedback.strengths,
        Improvements: feedback.improvements,
        Comments: feedback.comments,
        CreatedAt: at(days + 1, 12),
        UpdatedAt: at(days + 1, 12),
      });
    }
    return submissionId;
  }

  await submit({
    task: 'ch1', student: 's1', days: -36, status: 'Approved',
    notes: 'Chapter 1 draft covering the background, problem statement, objectives and scope.',
    file: {
      fileName: 'Chapter1_Introduction.pdf',
      content: makePdf('Chapter 1 - Introduction & Problem Statement', [
        'Team Alpha - Smart Campus Navigation App',
        '1.1 Background. Al-Yamamah University has many buildings, labs and offices. New students, visitors and even staff often spend a long time looking for a specific room.',
        '1.2 Problem Statement. There is no digital way to search for a room and get directions on campus. Printed maps are outdated and do not cover indoor locations.',
        '1.3 Objectives. Build a web application that finds any room in less than one minute, shows indoor and outdoor routes, and offers accessibility-friendly paths.',
        '1.4 Scope. The first release covers Buildings A and B, the library and the main parking areas.',
      ]),
    },
    feedback: {
      decision: 'Approved',
      strengths: 'Clear problem statement supported by a short survey of campus visitors.',
      improvements: 'Add measurable objectives, for example the average time needed to find a room.',
      comments: 'Good work. Approved - please apply the small fixes in the final report.',
    },
  });

  // Chapter 2: first version needed revision, the second version was approved
  await submit({
    task: 'ch2', student: 's2', days: -30, status: 'Needs Revision',
    notes: 'First version of the literature review.',
    file: {
      fileName: 'Chapter2_Literature_Review.pdf', version: 1,
      content: makePdf('Chapter 2 - Literature Review (version 1)', [
        'This chapter reviews research on indoor positioning (Wi-Fi fingerprinting, Bluetooth beacons and QR markers) and campus navigation apps.',
        '2.1 Indoor positioning techniques. 2.2 Existing campus navigation apps. 2.3 Summary.',
      ]),
    },
    feedback: {
      decision: 'Needs Revision',
      strengths: 'Good selection of recent papers on indoor positioning.',
      improvements: 'Compare at least three existing campus navigation apps in a table and explain the gap your project fills.',
      comments: 'Please revise and resubmit before the deadline.',
    },
  });
  await submit({
    task: 'ch2', student: 's2', days: -27, status: 'Approved',
    notes: 'Revised version with the comparison table of existing apps.',
    file: {
      fileName: 'Chapter2_Literature_Review.pdf', version: 2,
      content: makePdf('Chapter 2 - Literature Review (version 2)', [
        'This chapter reviews research on indoor positioning (Wi-Fi fingerprinting, Bluetooth beacons and QR markers) and campus navigation apps.',
        'Table 2.1 compares MazeMap, Google Maps Indoor and a university-built app by features: indoor routes, room search, accessibility and Arabic support.',
        'Gap: none of the reviewed apps covers Al-Yamamah University or offers accessibility-friendly routes in Arabic and English.',
      ]),
    },
    feedback: {
      decision: 'Approved',
      strengths: 'The comparison table is very helpful and clearly shows the gap.',
      improvements: 'Check the reference formatting (APA 7th edition).',
      comments: 'Approved.',
    },
  });

  await submit({
    task: 'survey', student: 's3', days: -24, status: 'Approved',
    notes: 'Survey results from 146 students and 12 staff members.',
    file: {
      fileName: 'Requirements_Survey_Results.csv',
      content: makeCsv([
        ['Question', 'Strongly agree', 'Agree', 'Neutral', 'Disagree'],
        ['I have had trouble finding a room on campus', 71, 48, 17, 22],
        ['I would use a campus navigation app', 93, 51, 9, 5],
        ['Indoor directions are more important than outdoor directions', 64, 50, 30, 14],
        ['The app should support Arabic and English', 110, 38, 7, 3],
        ['Accessibility-friendly routes are important', 88, 47, 18, 5],
      ]),
    },
    feedback: {
      decision: 'Approved',
      strengths: 'Excellent response rate and well-designed questions.',
      improvements: 'Add charts of the most important results.',
      comments: 'Great job. Use these results to justify the requirements in Chapter 3.',
    },
  });

  await submit({
    task: 'ch3', student: 's1', days: -15, status: 'Approved',
    notes: 'Includes the use case, sequence and class diagrams, the ERD and the database schema.',
    file: {
      fileName: 'Chapter3_System_Analysis_and_Design.pdf',
      content: makePdf('Chapter 3 - System Analysis & Design', [
        '3.1 Functional and non-functional requirements (from the survey).',
        '3.2 Use case diagram and use case descriptions: Search Room, Get Directions, View Building, Manage Map Data.',
        '3.3 Sequence diagrams for the main use cases.',
        '3.4 Class diagram and ERD: Building, Floor, Room, Route, User.',
        '3.5 Database schema in MySQL.',
      ]),
    },
    feedback: {
      decision: 'Approved',
      strengths: 'The diagrams are consistent with each other and with the requirements.',
      improvements: 'Add the exceptional flows to the Get Directions use case.',
      comments: 'Very good chapter.',
    },
  });

  await submit({
    task: 'ui', student: 's3', days: -11, status: 'Approved',
    notes: 'The prototype has 14 screens for mobile and desktop. Screenshots are attached.',
    source: 'https://www.figma.com/',
    file: {
      fileName: 'UI_Prototype_Screens.pdf',
      content: makePdf('UI Prototype - Smart Campus Navigation App', [
        'Screens: Home, Search, Search Results, Room Details, Route (outdoor), Route (indoor), Building Details, Favourites, Settings, Accessibility Options, Login, Profile, Admin Map Editor, About.',
        'Colours follow the university identity. All screens were tested with 5 students in a quick usability session.',
      ]),
    },
    feedback: {
      decision: 'Approved',
      strengths: 'Clean and consistent design; the route screen is very clear.',
      improvements: 'Increase the contrast of the grey text for accessibility.',
      comments: 'Approved. Start implementing the search and route screens.',
    },
  });

  // Waiting for the supervisor's review (no feedback yet)
  await submit({
    task: 'db', student: 's2', days: -1, hour: 10, minute: 45, status: 'Submitted',
    notes: 'The schema and seed scripts are pushed to our repository. The notes file explains the tables.',
    file: {
      fileName: 'Database_Schema_Notes.txt',
      content: makeText([
        'Smart Campus Navigation App - Database notes',
        '',
        'Tables: building, floor, room, route_edge, favourite, app_user',
        '- building(BuildingID, Name, Code, Latitude, Longitude)',
        '- floor(FloorID, BuildingID, Level, MapImage)',
        '- room(RoomID, FloorID, Number, Name, Type, X, Y)',
        '- route_edge(EdgeID, FromRoomID, ToRoomID, DistanceMeters, IsAccessible)',
        '',
        'Seed data: 2 buildings, 7 floors, 184 rooms, 512 route edges.',
      ]),
    },
  });
}

// ---------------------------------------------------------------------
// Group documents
// ---------------------------------------------------------------------

async function createDocuments(ctx) {
  const proposalParagraphs = [
    'Team: Sara Alqahtani, Abdullah Alrashid, Reem Almutairi. Supervisor: Dr. Ahmed Alotaibi.',
    'Problem: finding rooms, labs and offices on campus is difficult for new students and visitors.',
    'Idea: a web application with room search, indoor and outdoor directions and accessibility-friendly routes.',
    'Tools: React, Node.js, Express, MySQL, Figma, GitHub.',
  ];

  await addFile(ctx, {
    group: 'alpha', fileName: 'Smart_Campus_Proposal.pdf', version: 1, uploadedBy: 's1', uploadDate: at(-47, 21),
    content: makePdf('Project Proposal - Smart Campus Navigation App (draft)', proposalParagraphs),
  });
  await addFile(ctx, {
    group: 'alpha', fileName: 'Smart_Campus_Proposal.pdf', version: 2, uploadedBy: 's1', uploadDate: at(-46, 11),
    content: makePdf('Project Proposal - Smart Campus Navigation App', [
      ...proposalParagraphs,
      'Updated after the supervisor comments: indoor navigation for Building B is part of the first release.',
    ]),
  });
  await addFile(ctx, {
    group: 'alpha', fileName: 'Report_Template_Guidelines.pdf', uploadedBy: 'sup1', uploadDate: at(-40, 10),
    content: makePdf('Graduation Project Report - Template Guidelines', [
      'Font: Times New Roman 12, line spacing 1.5, justified text.',
      'Chapters: 1 Introduction, 2 Literature Review, 3 System Analysis & Design, 4 Implementation, 5 Testing, 6 Conclusion.',
      'Every figure and table needs a number and a caption. Use APA 7th edition for references.',
    ]),
  });
  await addFile(ctx, {
    group: 'alpha', fileName: 'Meeting_Minutes_Week3.txt', uploadedBy: 's3', uploadDate: at(-21, 14),
    content: makeText([
      'Team Alpha - Meeting minutes (week 3)',
      'Attendees: Dr. Ahmed Alotaibi, Sara Alqahtani, Abdullah Alrashid, Reem Almutairi',
      '',
      '1. Reviewed the literature review comments - Abdullah will add the comparison table.',
      '2. Survey closed with 158 responses - Reem will summarise the results.',
      '3. Sara starts Chapter 3 diagrams (use case and sequence).',
      '',
      'Next meeting: same time next week.',
    ]),
  });
  await addFile(ctx, {
    group: 'alpha', fileName: 'Campus_Buildings_Data.csv', uploadedBy: 's2', uploadDate: at(-18, 16),
    content: makeCsv([
      ['Code', 'Building', 'Floors', 'Rooms', 'Accessible entrance'],
      ['A', 'Administration & Main Auditorium', 3, 42, 'Yes'],
      ['B', 'Engineering & Computing', 4, 96, 'Yes'],
      ['C', 'Business School', 3, 58, 'Yes'],
      ['L', 'Central Library', 2, 24, 'Yes'],
    ]),
  });

  await addFile(ctx, {
    group: 'beta', fileName: 'Plant_Disease_Detector_Proposal.pdf', uploadedBy: 's5', uploadDate: at(-2, 16),
    content: makePdf('Project Proposal - AI Plant Disease Detector', [
      'Team: Yousef Alshammari, Lama Alanazi, Turki Aldossary. Supervisor: Dr. Mona Alshehri.',
      'Problem: plant diseases are often detected too late, which reduces crop quality and income.',
      'Idea: take a photo of a leaf and get the disease name and treatment suggestions in seconds.',
      'Approach: a MobileNet model trained on the PlantVillage dataset, served by a small web API.',
    ]),
  });

  await addFile(ctx, {
    group: 'legacy', fileName: 'Final_Report_Library_Seat_Booking.pdf', uploadedBy: 'alumni1', uploadDate: at(-485, 18),
    content: makePdf('Final Report - Library Seat Booking System', [
      'Team Legacy: Hamad Alkhaldi, Dana Alomari. Supervisor: Dr. Ahmed Alotaibi. Academic year 2024-2025.',
      'The system lets students book library seats and group rooms, check in with a QR code and automatically releases no-show bookings.',
      'Pilot results: 312 students, more than 1,400 bookings, no-show rate reduced from 27% to 9%.',
      'Technologies: React, Node.js, Express, MySQL.',
    ]),
  });
  await addFile(ctx, {
    group: 'legacy', fileName: 'Final_Presentation_Slides.pdf', uploadedBy: 'alumni2', uploadDate: at(-482, 12),
    content: makePdf('Final Presentation - Library Seat Booking System', [
      'Slide 1: Problem - students cannot find free seats during exam weeks.',
      'Slide 2: Solution - online booking with QR check-in.',
      'Slide 3: Architecture - React frontend, Express API, MySQL database.',
      'Slide 4: Pilot results and lessons learned.',
    ]),
  });
}

// ---------------------------------------------------------------------
// Calendars, events and attendance
// ---------------------------------------------------------------------

async function createCalendarsAndEvents(ctx) {
  const { conn, people, groups, events } = ctx;

  // The shared academic calendar (GroupID NULL) + one calendar per group
  const calendars = { shared: await insert(conn, 'calendar', { GroupID: null, CalendarDate: at(-90) }) };
  for (const g of GROUPS) {
    calendars[g.key] = await insert(conn, 'calendar', { GroupID: groups[g.key], CalendarDate: at(g.createdDays) });
  }

  // Adds one event; past events are marked as "reminder already sent"
  async function addEvent(key, calendarKey, createdBy, e) {
    events[key] = await insert(conn, 'important_date', {
      CalendarID: calendars[calendarKey],
      DeadlineType: e.type,
      DeadlinePriority: e.priority,
      DeadlineSetDate: e.setDate || at(-30),
      Title: e.title,
      Description: e.description || null,
      EventDate: e.start,
      EndDate: e.end || null,
      Location: e.location || null,
      CreatedByUserID: people[createdBy].userId,
      ReminderSent: e.start < NOW ? 1 : 0,
    });
  }

  // Shared academic dates
  await addEvent('semesterStart', 'shared', 'admin', {
    type: 'Academic', priority: 'Low', title: 'Fall Semester Classes Begin', start: at(-45, 8), setDate: at(-90),
    description: 'First day of classes for the fall semester.',
  });
  await addEvent('proposalDeadline', 'shared', 'admin', {
    type: 'Academic', priority: 'High', title: 'Last Day to Submit Graduation Project Proposals', start: at(7, 23, 59), setDate: at(-60),
    description: 'All groups must submit their project proposal through GPMP before the end of this day.',
  });
  await addEvent('midtermWeek', 'shared', 'admin', {
    type: 'Academic', priority: 'Medium', title: 'Mid-term Progress Presentations Week', start: at(12, 8), end: at(16, 16), setDate: at(-60),
    description: 'Every group presents its progress to the supervisor and the examiner. Check your group calendar for the exact time.',
  });
  await addEvent('withdraw', 'shared', 'admin', {
    type: 'Academic', priority: 'Medium', title: 'Last Day to Withdraw from Courses', start: at(30, 8), setDate: at(-60),
  });
  await addEvent('finalReport', 'shared', 'admin', {
    type: 'Academic', priority: 'High', title: 'Final Report Submission Deadline', start: at(60, 23, 59), setDate: at(-60),
    description: 'Upload the final report, the source code and the showcase video.',
  });
  await addEvent('showcaseDay', 'shared', 'admin', {
    type: 'Academic', priority: 'High', title: 'Final Presentations & Project Showcase Day', start: at(70, 9), end: at(70, 15), setDate: at(-60),
    location: 'Main Auditorium, Building A',
  });

  // Team Alpha
  await addEvent('alphaMeeting1', 'alpha', 'sup1', {
    type: 'Meeting', priority: 'Medium', title: 'Weekly Supervision Meeting', start: at(-14, 10), end: at(-14, 11), setDate: at(-20),
    location: 'Building B, Room 214', description: 'Review of Chapter 3 diagrams and the survey results.',
  });
  await addEvent('alphaMeeting2', 'alpha', 'sup1', {
    type: 'Meeting', priority: 'Medium', title: 'Weekly Supervision Meeting', start: at(-7, 10), end: at(-7, 11), setDate: at(-13),
    location: 'Building B, Room 214', description: 'Review of the UI prototype and planning of the implementation phase.',
  });
  await addEvent('alphaMeeting3', 'alpha', 'sup1', {
    type: 'Meeting', priority: 'Medium', title: 'Weekly Supervision Meeting', start: at(2, 10), end: at(2, 11), setDate: at(-6),
    location: 'Building B, Room 214', description: 'Review of the database implementation and the backend API progress.',
  });
  await addEvent('alphaPresentation', 'alpha', 'sup1', {
    type: 'Presentation', priority: 'High', title: 'Mid-term Progress Presentation', start: at(12, 13), end: at(12, 13, 45), setDate: at(-5),
    location: 'Main Auditorium, Building A',
    description: '10 minutes of slides and a short live demo, followed by questions from the supervisor and the examiner.',
  });
  await addEvent('alphaCh4', 'alpha', 'sup1', {
    type: 'Deadline', priority: 'High', title: 'Chapter 4 Draft Due', start: at(21, 23, 59), setDate: at(-3),
  });

  // Team Beta
  await addEvent('betaMeeting', 'beta', 'sup2', {
    type: 'Meeting', priority: 'Medium', title: 'Proposal Discussion Meeting', start: at(3, 11), end: at(3, 12), setDate: at(-1),
    location: 'Online - Microsoft Teams', description: 'Discuss the proposal feedback and the dataset plan.',
  });
  await addEvent('betaRevision', 'beta', 'sup2', {
    type: 'Deadline', priority: 'High', title: 'Proposal Revision Deadline', start: at(7, 23, 59), setDate: at(-1),
  });

  // Team Gamma (no supervisor yet)
  await addEvent('gammaChoose', 'gamma', 'admin', {
    type: 'Deadline', priority: 'High', title: 'Choose a Supervisor', start: at(5, 23, 59), setDate: at(-10),
    description: 'Team Gamma must choose a supervisor from the available supervisors list.',
  });

  // Team Legacy (last year)
  await addEvent('legacyMeeting', 'legacy', 'sup1', {
    type: 'Meeting', priority: 'Medium', title: 'Weekly Supervision Meeting', start: at(-520, 10), end: at(-520, 11), setDate: at(-525),
    location: 'Building B, Room 214',
  });
  await addEvent('legacyPresentation', 'legacy', 'sup1', {
    type: 'Presentation', priority: 'High', title: 'Final Presentation', start: at(-490, 12), end: at(-490, 13), setDate: at(-520),
    location: 'Main Auditorium, Building A',
  });

  // Attendance for past meetings and presentations
  const attendance = [
    ['alphaMeeting1', 's1', 'Present'], ['alphaMeeting1', 's2', 'Present'], ['alphaMeeting1', 's3', 'Present'],
    ['alphaMeeting2', 's1', 'Present'], ['alphaMeeting2', 's2', 'Late'], ['alphaMeeting2', 's3', 'Absent'],
    ['legacyMeeting', 'alumni1', 'Present'], ['legacyMeeting', 'alumni2', 'Excused'],
    ['legacyPresentation', 'alumni1', 'Present'], ['legacyPresentation', 'alumni2', 'Present'],
  ];
  const eventDays = { alphaMeeting1: -14, alphaMeeting2: -7, legacyMeeting: -520, legacyPresentation: -490 };
  for (const [eventKey, student, status] of attendance) {
    await insert(conn, 'attendance', {
      DeadlineID: events[eventKey],
      StudentID: people[student].studentId,
      Status: status,
      RecordedByUserID: people.sup1.userId,
      RecordedAt: at(eventDays[eventKey], 11, 5),
    });
  }
}

// ---------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------

async function createChat(ctx) {
  const { conn, people, groups } = ctx;

  // [sender, date, text] for the group chat (students + supervisor)
  async function groupChat(groupKey, messages) {
    for (const [sender, date, text] of messages) {
      await insert(conn, 'chat_message', {
        GroupID: groups[groupKey], SenderUserID: people[sender].userId, ReceiverUserID: null,
        MsgType: 'Group', MsgDate: date, MessageText: text,
      });
    }
  }

  // [sender, receiver, date, text] for the supervisor-examiner channel
  async function staffChat(groupKey, messages) {
    for (const [sender, receiver, date, text] of messages) {
      await insert(conn, 'chat_message', {
        GroupID: groups[groupKey], SenderUserID: people[sender].userId, ReceiverUserID: people[receiver].userId,
        MsgType: 'Staff', MsgDate: date, MessageText: text,
      });
    }
  }

  await groupChat('alpha', [
    ['sup1', at(-3, 9, 15), 'Good morning team. Reminder: the database implementation is due this week. Please push the schema and the seed scripts to the repository.'],
    ['s2', at(-3, 9, 32), "Good morning Dr. Ahmed. The schema is almost done, I'm finishing the foreign keys and will submit it tomorrow."],
    ['s1', at(-3, 9, 40), "I started the Chapter 4 outline, I'll share it after our next meeting."],
    ['s3', at(-2, 18, 5), 'The indoor map for Building B is taking longer than expected. The floor plans we have are not to scale.'],
    ['sup1', at(-2, 18, 20), 'Contact the facilities office, they have CAD files for all buildings. Mention that it is for your graduation project.'],
    ['s3', at(-2, 18, 24), "Great, thank you! I'll email them tomorrow morning."],
    ['s2', at(-1, 11, 2), 'I submitted the database implementation task 👍'],
    ['s1', at(-1, 11, 10), 'Nice work Abdullah!'],
    ['sup1', at(-1, 14, 30), "Thanks, I'll review it before our next meeting."],
    ['s1', at(-2 / 24), 'Dr. Ahmed, can we show a live demo of the prototype in the mid-term presentation instead of slides only?'],
    ['sup1', at(-1 / 24), 'Yes, a short live demo (3-4 minutes) is a great idea. Prepare a backup video in case the Wi-Fi fails.'],
  ]);

  await staffChat('alpha', [
    ['sup1', 'ex1', at(-6, 12, 10), 'Hi Dr. Hessa, Team Alpha finished Chapter 3. Would you like to review the design before the mid-term presentation?'],
    ['ex1', 'sup1', at(-6, 13, 45), "Yes please, I'll check the diagrams in their documents. Is the accessibility testing still in their plan?"],
    ['sup1', 'ex1', at(-5, 9, 20), 'Yes, they added it to the testing chapter outline following your proposal feedback.'],
    ['ex1', 'sup1', at(-1, 10, 5), "Good. I'll attend the mid-term presentation. Please share the evaluation rubric with the team."],
  ]);

  await groupChat('beta', [
    ['s5', at(-2, 16, 50), 'Hi everyone, I uploaded our proposal to the documents page.'],
    ['s4', at(-2, 17, 5), 'Thanks Lama. I found two public datasets we can use: PlantVillage and PlantDoc.'],
    ['sup2', at(-1, 10, 30), "Hello team, I received your proposal. I'll review it within the next few days."],
    ['s6', at(-1, 10, 42), 'Thank you Dr. Mona!'],
  ]);

  await staffChat('beta', [
    ['sup2', 'ex2', at(-1, 11), 'Hi Dr. Omar, Team Beta submitted their proposal on plant disease detection. I will forward it to you after my review.'],
  ]);

  await groupChat('legacy', [
    ['sup1', at(-492, 9), 'Final presentation is in two days. Please rehearse the demo at least twice.'],
    ['alumni2', at(-492, 9, 30), 'We will, thank you Dr. Ahmed!'],
  ]);
}

// ---------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------

async function createAnnouncements(ctx) {
  const { conn, people, groups } = ctx;

  await insert(conn, 'announcement', {
    PublishedByUserID: people.admin.userId,
    AnnouncementDate: at(-20, 9),
    AnnouncementTitle: 'Welcome to the Graduation Projects Semester',
    AnnouncementContent:
      'Welcome to GPMP! Use the platform to manage your graduation project: follow your tasks, upload documents, ' +
      'chat with your supervisor and keep an eye on the academic calendar. Groups without a supervisor should ' +
      'choose one from the Supervisors page as soon as possible.',
    TargetRole: 'All',
    GroupID: null,
  });

  await insert(conn, 'announcement', {
    PublishedByUserID: people.admin.userId,
    AnnouncementDate: at(-4, 10),
    AnnouncementTitle: 'Final Report Template and Formatting Guidelines',
    AnnouncementContent:
      'The final report template is now available on the Resources page. Please use Times New Roman 12 with 1.5 ' +
      'line spacing, number every figure and table, and follow APA 7th edition for references. Reports that do ' +
      'not follow the template will be returned for correction.',
    AnnouncementEditDate: at(-3, 12),
    TargetRole: 'Student',
    GroupID: null,
  });

  await insert(conn, 'announcement', {
    PublishedByUserID: people.admin.userId,
    AnnouncementDate: at(-6, 9),
    AnnouncementTitle: 'Proposal Review Reminder for Supervisors',
    AnnouncementContent:
      'Please review all pending project proposals within one week of submission, so examiners have enough time ' +
      'to give their feedback before the proposal deadline.',
    TargetRole: 'Supervisor',
    GroupID: null,
  });

  await insert(conn, 'announcement', {
    PublishedByUserID: people.sup1.userId,
    AnnouncementDate: at(-1, 15),
    AnnouncementTitle: 'Mid-term Presentation Preparation',
    AnnouncementContent:
      'Team Alpha: your mid-term presentation is on the group calendar. Prepare about 10 minutes of slides and a ' +
      'short live demo. Every member must present a part of the work. Dr. Hessa will attend as the examiner.',
    TargetRole: 'All',
    GroupID: groups.alpha,
  });
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

async function createNotifications(ctx) {
  const { conn, people, groups, tasks } = ctx;

  // [user, type, title, message, link, isRead, date]
  const list = [
    // student1 - several unread
    ['s1', 'System', 'Welcome to GPMP', 'Your account is ready. Start by checking your project page.', '/project', 1, at(-60, 9)],
    ['s1', 'Feedback', 'New feedback on "Chapter 3 — System Analysis & Design"', 'Dr. Ahmed Alotaibi approved your submission.', `/tasks/${tasks.ch3}`, 1, at(-14, 12)],
    ['s1', 'Announcement', 'New announcement: Final Report Template and Formatting Guidelines', 'Posted by Nora Alsaleh.', '/announcements', 0, at(-4, 10)],
    ['s1', 'Task', 'New task: Chapter 4 — Implementation', 'Due in three weeks. Assigned to you.', `/tasks/${tasks.ch4}`, 0, at(-3, 9)],
    ['s1', 'Meeting', 'Meeting scheduled: Weekly Supervision Meeting', 'Building B, Room 214.', `/calendar?groupId=${groups.alpha}`, 0, at(-2, 9)],
    ['s1', 'Announcement', 'New announcement: Mid-term Presentation Preparation', 'Posted by Dr. Ahmed Alotaibi for Team Alpha.', '/announcements', 0, at(-1, 15)],
    ['s1', 'Message', 'New message in Team Alpha — Group chat', 'Dr. Ahmed Alotaibi: Yes, a short live demo (3-4 minutes) is a great idea...', `/chat?groupId=${groups.alpha}&channel=Group`, 0, at(-1 / 24)],
    // other Team Alpha students
    ['s2', 'Feedback', 'New feedback on "Chapter 2 — Literature Review & Related Systems"', 'Your submission was approved.', `/tasks/${tasks.ch2}`, 1, at(-26, 12)],
    ['s2', 'Deadline', 'Deadline approaching: Database Implementation', 'Due tomorrow.', `/tasks/${tasks.db}`, 0, at(-1, 8)],
    ['s3', 'Deadline', 'Task overdue: Indoor Map Screen & Route Finder', 'The due date has passed.', `/tasks/${tasks.map}`, 0, at(-1 / 3)],
    // supervisor1 - several unread
    ['sup1', 'System', 'Welcome to GPMP', 'You supervise Team Alpha and Team Legacy.', '/groups', 1, at(-55, 9)],
    ['sup1', 'Announcement', 'New announcement: Proposal Review Reminder for Supervisors', 'Posted by Nora Alsaleh.', '/announcements', 1, at(-6, 9)],
    ['sup1', 'Message', 'New message in Team Alpha — Supervisor & Examiner', "Dr. Hessa Aldosari: Good. I'll attend the mid-term presentation...", `/chat?groupId=${groups.alpha}&channel=Staff`, 0, at(-1, 10, 5)],
    ['sup1', 'Task', 'New submission: Database Implementation', 'Abdullah Alrashid submitted work for review.', `/tasks/${tasks.db}`, 0, at(-1, 10, 45)],
    ['sup1', 'Meeting', 'Upcoming meeting: Weekly Supervision Meeting', 'Team Alpha, Building B, Room 214.', `/calendar?groupId=${groups.alpha}`, 0, at(-1 / 6)],
    // others
    ['sup2', 'Proposal', 'New proposal to review: AI Plant Disease Detector', 'Team Beta submitted their project proposal.', '/proposals', 0, at(-2, 16, 45)],
    ['ex1', 'Message', 'New message in Team Alpha — Supervisor & Examiner', 'Dr. Ahmed Alotaibi: Team Alpha finished Chapter 3...', `/chat?groupId=${groups.alpha}&channel=Staff`, 1, at(-6, 12, 10)],
    ['admin', 'System', 'Team Gamma has no supervisor yet', 'Remind the group to choose a supervisor before the proposal deadline.', `/groups/${groups.gamma}`, 0, at(-2, 9)],
  ];

  for (const [who, type, title, message, link, isRead, date] of list) {
    await insert(conn, 'notification', {
      UserID: people[who].userId, Type: type, Title: title, Message: message, Link: link, IsRead: isRead, CreatedAt: date,
    });
  }
}

// ---------------------------------------------------------------------
// Resources (FR-17)
// ---------------------------------------------------------------------

async function createResources(ctx) {
  const resources = [
    ['React — Official Documentation', 'Library', 'https://react.dev/learn',
      'Learn React step by step: components, props, state and hooks. The GPMP frontend itself is built with React.'],
    ['Node.js — Learn', 'Tutorial', 'https://nodejs.org/en/learn',
      'The official Node.js learning path: running JavaScript on the server, modules, npm and asynchronous code.'],
    ['Express — Routing Guide', 'Framework', 'https://expressjs.com/en/guide/routing.html',
      'How to define routes, use middleware and handle errors in Express, the framework used for REST APIs.'],
    ['MySQL Tutorial', 'Tutorial', 'https://dev.mysql.com/doc/refman/8.0/en/tutorial.html',
      'The official MySQL tutorial: creating databases and tables, writing queries and joining tables.'],
    ['Git & GitHub — Hello World', 'Tutorial', 'https://docs.github.com/en/get-started/start-your-journey/hello-world',
      'Create a repository, branches, commits and pull requests, and share code with your team safely.'],
    ['Figma', 'Tool', 'https://www.figma.com/',
      'Design UI mockups and clickable prototypes, and agree on the screens with your supervisor before coding.'],
    ['draw.io (diagrams.net)', 'Tool', 'https://app.diagrams.net/',
      'Free diagram editor for use case, class, sequence and activity diagrams, ERDs and architecture diagrams.'],
    ['Technical Writing Courses (Google)', 'Guide', 'https://developers.google.com/tech-writing',
      'Free short courses on clear and concise technical writing - very useful for your graduation project report.'],
  ];

  let day = -30;
  for (const [title, category, url, description] of resources) {
    await insert(ctx.conn, 'resource', {
      Title: title, Category: category, Url: url, Description: description,
      CreatedByUserID: ctx.people.admin.userId, CreatedAt: at(day++, 10),
    });
  }
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

/**
 * Inserts all demo data using the given mysql2 pool. Everything runs in one
 * transaction: if anything fails, nothing is saved.
 */
export async function seed(pool) {
  // Hash the demo password once and reuse it for every account (hashing is slow on purpose)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ctx = { conn, people: {}, groups: {}, projects: {}, tasks: {}, events: {} };
    await createStaff(ctx, passwordHash);
    await createGroups(ctx);
    await createStudents(ctx, passwordHash);
    await createProjects(ctx);
    await createTasks(ctx);
    await createSubmissions(ctx);
    await createDocuments(ctx);
    await createCalendarsAndEvents(ctx);
    await createChat(ctx);
    await createAnnouncements(ctx);
    await createNotifications(ctx);
    await createResources(ctx);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Allows running this file directly: node database/seed.js (only on an empty database)
const isRunDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  const { pool } = await import('../src/server/config/db.js');
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM `user`');
    if (rows[0].count > 0) {
      console.log('The database already has data. Run "npm run db:setup" to reset it and insert the demo data.');
    } else {
      await seed(pool);
      console.log(`Demo data inserted. Every demo account uses the password ${DEMO_PASSWORD}`);
    }
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
