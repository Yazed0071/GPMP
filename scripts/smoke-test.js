// GPMP smoke test: one end-to-end run through the whole API, like a real team would use it
// (sign in, groups, the proposal flow, tasks, files, calendar, attendance, chat, announcements...).
// Each check prints PASS or FAIL, and a summary is printed at the end.
//
// HOW TO RUN (the server must be running, e.g. "npm run dev" in another terminal):
//   npm run db:setup      <- fresh demo data (needed before EVERY run, see below)
//   npm run test:smoke
// Another server address can be used with API_URL, e.g. API_URL=http://localhost:5001/api
//
// IMPORTANT - fresh demo data: the script runs the "Team Gamma" story (choose a supervisor,
// create a project, get the proposal approved). That story can only happen once, so the
// script stops at the start if Team Gamma already has a project. Everything else it creates
// (temporary group, tasks, files, events, messages, announcements, resources) is removed
// again at the end. A temporary student account is deactivated (users cannot be deleted).
// So: run "npm run db:setup" before running this script again.
//
// Uses only what Node.js 24 has built in (fetch, FormData, Blob). The live-chat check also
// uses socket.io-client from node_modules; it is skipped if that is not installed.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const API_URL = (process.env.API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const DEMO_PASSWORD = 'Gpmp@2026';
const TAG = `smoke-${Date.now()}`; // makes every temporary name unique

// Seeded ids that never change (see docs/server.md, section 11)
const ALPHA = 1;
const GAMMA = 3;
const LEGACY = 4; // Team Legacy: its project is Archived (FR-8)
const SUPERVISOR2_ID = 2; // SupervisorID of supervisor2 (available)
const SUPERVISOR3_ID = 3; // SupervisorID of supervisor3 (not available)
const EXAMINER2_ID = 2; // ExaminerID of examiner2
const PAST_ALPHA_MEETING = 8; // a past Team Alpha meeting with attendance
const FUTURE_ALPHA_MEETING = 9; // a Team Alpha meeting in 2 days

// ---------------------------------------------------------------------------
// Small helpers: results, HTTP requests, dates
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];
let rateLimited = false;

// Records one check. `detail` is printed only when the check fails.
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  ->  ${detail}` : ''}`);
  }
  return Boolean(condition);
}

// Checks the status code of a response and prints the server's message when it is wrong
function checkStatus(name, res, expected) {
  const detail = `expected ${expected}, got ${res.status} ${JSON.stringify(res.data)?.slice(0, 200)}`;
  return check(name, res.status === expected, detail);
}

function skip(name, reason) {
  console.log(`  SKIP  ${name} (${reason})`);
}

/**
 * Sends one request to the API and returns { status, data, text, headers }.
 * body: a plain object (sent as JSON) or a FormData (file upload).
 */
async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body; // fetch adds the multipart Content-Type itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // e.g. a downloaded file
  }
  if (response.status === 429) rateLimited = true;
  return { status: response.status, data, text, headers: response.headers };
}

const get = (path, token) => api('GET', path, { token });
const post = (path, token, body) => api('POST', path, { token, body });
const put = (path, token, body) => api('PUT', path, { token, body });
const patch = (path, token, body) => api('PATCH', path, { token, body });
const del = (path, token) => api('DELETE', path, { token });

// A small text file for upload tests
function textFile(name, content) {
  return { blob: new Blob([content], { type: 'text/plain' }), name, content };
}

// 'YYYY-MM-DD' for today + n days (in the university time zone, like the backend)
function dayFromToday(n) {
  const date = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(date);
}

// An ISO date-time n days from now at a fixed hour (UTC)
function isoInDays(n, hourUtc = 9) {
  const date = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Shared state between the steps
// ---------------------------------------------------------------------------

const tokens = {}; // demo account name -> login token
const me = {}; // demo account name -> the logged-in user object
const cleanup = []; // functions that remove what the test created (run at the end)

const DEMO_ACCOUNTS = {
  admin: 'admin@gpmp.edu',
  supervisor1: 'supervisor1@gpmp.edu',
  supervisor2: 'supervisor2@gpmp.edu',
  examiner1: 'examiner1@gpmp.edu',
  examiner2: 'examiner2@gpmp.edu',
  student1: 'student1@gpmp.edu',
  student2: 'student2@gpmp.edu',
  student4: 'student4@gpmp.edu',
  student7: 'student7@gpmp.edu',
  student8: 'student8@gpmp.edu',
  alumni1: 'alumni1@gpmp.edu',
};

// The temporary student created by the test
const temp = {
  email: `${TAG}@gpmp.edu`,
  password: 'Smoke2026pass',
  userId: null,
  studentId: null,
  token: null,
  groupId: null,
};

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

async function stepHealth() {
  const health = await get('/health');
  if (!checkStatus('API is running (GET /health)', health, 200)) {
    throw new Error(`The API at ${API_URL} is not reachable. Start the backend first (npm run dev).`);
  }
}

async function stepLogin() {
  const wrong = await post('/auth/login', null, { email: DEMO_ACCOUNTS.student1, password: 'wrong-password1' });
  checkStatus('wrong password is rejected (401)', wrong, 401);
  check('wrong password message', wrong.data?.error?.message === 'Incorrect email or password.', wrong.data?.error?.message);

  const expectedRoles = {
    admin: 'Administrator',
    supervisor1: 'Supervisor',
    supervisor2: 'Supervisor',
    examiner1: 'Examiner',
    examiner2: 'Examiner',
  };
  for (const [name, email] of Object.entries(DEMO_ACCOUNTS)) {
    const res = await post('/auth/login', null, { email, password: DEMO_PASSWORD });
    const role = expectedRoles[name] || 'Student';
    check(`login ${name} (${role})`, res.status === 200 && res.data?.token && res.data.user?.role === role, `status ${res.status}`);
    tokens[name] = res.data?.token;
    me[name] = res.data?.user;
  }

  const meRes = await get('/auth/me', tokens.student1);
  check('GET /auth/me returns the logged-in student', meRes.status === 200 && meRes.data?.email === DEMO_ACCOUNTS.student1 && meRes.data?.groupId === ALPHA);
  checkStatus('GET /auth/me without a token -> 401', await get('/auth/me'), 401);
  checkStatus('GET /auth/me with a broken token -> 401', await get('/auth/me', 'not-a-real-token'), 401);
}

// Stops the test early when the demo data is not fresh (Team Gamma must not have a project yet)
async function stepFreshData() {
  const gamma = await get('/meta/my-groups', tokens.student8);
  const fresh = check('Team Gamma has no project yet (fresh demo data)', gamma.status === 200 && !gamma.data?.[0]?.projectId);
  if (!fresh) {
    throw new Error('The demo data is not fresh. Run "npm run db:setup" and then this test again.');
  }
}

async function stepMyGroups() {
  const names = async (who) => ((await get('/meta/my-groups', tokens[who])).data || []).map((g) => g.name);
  check('my-groups: admin sees all 4 groups', (await names('admin')).length === 4);
  check('my-groups: supervisor1 sees Team Alpha and Team Legacy', (await names('supervisor1')).join() === 'Team Alpha,Team Legacy');
  check('my-groups: examiner1 sees Team Alpha and Team Legacy', (await names('examiner1')).join() === 'Team Alpha,Team Legacy');
  check('my-groups: student1 sees only Team Alpha', (await names('student1')).join() === 'Team Alpha');
  check('my-groups: student7 (no group) sees nothing', (await names('student7')).length === 0);
}

async function stepGroups() {
  const list = await get('/groups', tokens.admin);
  check('admin lists all groups', list.status === 200 && list.data.length === 4);

  const detail = await get(`/groups/${ALPHA}`, tokens.supervisor1);
  check('supervisor1 opens Team Alpha detail', detail.status === 200 && detail.data?.name === 'Team Alpha' && detail.data?.project?.title === 'Smart Campus Navigation App');
  checkStatus('student1 opens another group -> 403', await get('/groups/2', tokens.student1), 403);
  checkStatus('an unknown group -> 404', await get('/groups/99999', tokens.admin), 404);
}

async function stepUsersAndTempGroup() {
  // Create the temporary student (FR-2 user management)
  const created = await post('/users', tokens.admin, {
    name: 'Smoke Test Student',
    email: temp.email,
    password: temp.password,
    role: 'Student',
    major: 'Software Engineering',
  });
  checkStatus('admin creates a temporary student', created, 201);
  temp.userId = created.data?.id;
  cleanup.push(async () => {
    // Accounts cannot be deleted, so the temporary account is deactivated instead
    if (temp.userId) await patch(`/users/${temp.userId}/status`, tokens.admin, { isActive: false });
  });

  const duplicate = await post('/users', tokens.admin, { name: 'Copy', email: temp.email, password: temp.password, role: 'Student' });
  checkStatus('a duplicate email -> 409', duplicate, 409);
  checkStatus('a supervisor cannot list users -> 403', await get('/users', tokens.supervisor1), 403);

  const search = await get(`/users?search=${encodeURIComponent(TAG)}`, tokens.admin);
  check('admin finds the new user by search', search.status === 200 && search.data?.length === 1);

  const login = await post('/auth/login', null, { email: temp.email, password: temp.password });
  check('the temporary student can sign in', login.status === 200 && login.data?.user?.role === 'Student');
  temp.token = login.data?.token;
  temp.studentId = login.data?.user?.studentId;

  // Admin creates a temporary group with this student (UC10)
  const groupName = `Smoke Group ${TAG}`;
  const group = await post('/groups', tokens.admin, { name: groupName, supervisorId: null, examinerId: null, studentIds: [temp.studentId] });
  checkStatus('admin creates a temporary group', group, 201);
  temp.groupId = group.data?.id;
  cleanup.push(async () => {
    if (temp.groupId) await del(`/groups/${temp.groupId}`, tokens.admin);
  });

  const again = await post('/groups', tokens.admin, { name: groupName, studentIds: [] });
  check('a duplicate group name -> 409 with the UC10 message', again.status === 409 && again.data?.error?.message === 'A group with this name already exists', again.data?.error?.message);

  const memberMe = await get('/auth/me', temp.token);
  check('the student is now in the new group', memberMe.data?.groupId === temp.groupId);
  checkStatus('a student cannot create groups -> 403', await post('/groups', tokens.student1, { name: 'Nope' }), 403);
}

async function stepTeamGammaFlow() {
  const s8 = tokens.student8;

  // UC11: choose a supervisor
  const unavailable = await post('/supervisors/choose', s8, { supervisorId: SUPERVISOR3_ID });
  checkStatus('choosing an unavailable supervisor -> 400', unavailable, 400);
  const choose = await post('/supervisors/choose', s8, { supervisorId: SUPERVISOR2_ID });
  checkStatus('student8 chooses supervisor2 for Team Gamma', choose, 200);
  const choice = await get('/supervisors/my-choice', s8);
  check('my-choice shows supervisor2', choice.data?.supervisorId === SUPERVISOR2_ID);

  // FR-3/FR-4: create the project
  const project = await post('/projects', s8, {
    title: 'Smart Parking Finder',
    description: 'An app that shows free parking spaces on campus in real time.',
    academicYear: '2026-2027',
  });
  check('student8 creates the Team Gamma project', project.status === 201 && project.data?.status === 'Proposed', `status ${project.status} ${JSON.stringify(project.data)?.slice(0, 150)}`);
  const projectId = project.data?.id;

  // FR-6: submit the proposal
  const proposal = await post('/proposals', s8, { projectId, comments: 'Please review our proposal.' });
  check('student8 submits the proposal (Pending Supervisor)', proposal.status === 201 && proposal.data?.status === 'Pending Supervisor', `status ${proposal.status}`);
  const proposalId = proposal.data?.id;
  checkStatus('a second open proposal -> 409', await post('/proposals', s8, { projectId }), 409);

  // UC16: the supervisor reviews
  const noFeedback = await patch(`/proposals/${proposalId}/review`, tokens.supervisor2, { decision: 'reject', feedback: '' });
  check('rejecting without feedback -> 400 "Please enter your feedback"', noFeedback.status === 400 && /Please enter your feedback/.test(noFeedback.data?.error?.message || ''), noFeedback.data?.error?.message);
  const approveEmpty = await patch(`/proposals/${proposalId}/review`, tokens.supervisor2, { decision: 'approve', feedback: '  ' });
  check('approving without feedback -> 400 too (UC16 exceptional flow)', approveEmpty.status === 400 && /Please enter your feedback/.test(approveEmpty.data?.error?.message || ''), approveEmpty.data?.error?.message);
  checkStatus('another supervisor cannot review it -> 403', await patch(`/proposals/${proposalId}/review`, tokens.supervisor1, { decision: 'approve', feedback: 'ok' }), 403);
  const approved1 = await patch(`/proposals/${proposalId}/review`, tokens.supervisor2, { decision: 'approve', feedback: 'Good idea, well scoped.' });
  check('supervisor2 approves -> Pending Examiner', approved1.status === 200 && approved1.data?.status === 'Pending Examiner', `status ${approved1.status} ${approved1.data?.status}`);

  const adminNotes = await get('/notifications', tokens.admin);
  check('the admin is asked to assign an examiner', (adminNotes.data || []).some((n) => n.title === 'Team Gamma needs an examiner'));

  // The admin assigns an examiner (UC10 edit)
  checkStatus('examiner2 cannot see the proposal before being assigned -> 403', await get(`/proposals/${proposalId}`, tokens.examiner2), 403);
  const assign = await put(`/groups/${GAMMA}`, tokens.admin, { examinerId: EXAMINER2_ID });
  check('admin assigns examiner2 to Team Gamma', assign.status === 200 && assign.data?.examiner?.id === EXAMINER2_ID, JSON.stringify(assign.data?.examiner));

  // UC17 / FR-7: the examiner approves
  const approved2 = await patch(`/proposals/${proposalId}/review`, tokens.examiner2, { decision: 'approve', feedback: 'Approved. Focus on the sensor data.' });
  check('examiner2 approves -> Approved', approved2.status === 200 && approved2.data?.status === 'Approved', `status ${approved2.status} ${approved2.data?.status}`);

  const after = await get(`/projects/${projectId}`, s8);
  check('the Team Gamma project is now In Progress', after.data?.status === 'In Progress', after.data?.status);

  const reviewed = await get(`/proposals/${proposalId}`, tokens.supervisor2);
  check('supervisor2 may edit the feedback they wrote', reviewed.data?.canEditFeedback === true && reviewed.data?.feedbackStage === 'supervisor');
  check('the timeline names who reviewed each stage', reviewed.data?.supervisorReviewerName === 'Dr. Mona Alshehri' && reviewed.data?.examinerReviewerName === 'Dr. Omar Alzahrani', `${reviewed.data?.supervisorReviewerName} / ${reviewed.data?.examinerReviewerName}`);
  const studentNotes = await get('/notifications', s8);
  check('student8 is told the proposal was approved', (studentNotes.data || []).some((n) => n.title === 'Your proposal was approved'));
}

// The administrator rejects a proposal at the supervisor stage: the supervisor may not rewrite
// the admin's reason, and the timeline shows the administrator as the reviewer (UC16, FR-6)
async function stepFeedbackOwnership() {
  checkStatus('the temporary student chooses supervisor2', await post('/supervisors/choose', temp.token, { supervisorId: SUPERVISOR2_ID }), 200);
  const project = await post('/projects', temp.token, { title: `Smoke Project ${TAG}`, description: 'A project of the smoke test.' });
  checkStatus('the temporary student creates a project', project, 201);
  const proposal = await post('/proposals', temp.token, { projectId: project.data?.id });
  checkStatus('the temporary student submits the proposal', proposal, 201);
  const proposalId = proposal.data?.id;

  const rejected = await patch(`/proposals/${proposalId}/review`, tokens.admin, { decision: 'reject', feedback: 'ADMIN: the scope is too small.' });
  check('the admin rejects it at the supervisor stage', rejected.status === 200 && rejected.data?.status === 'Rejected', `status ${rejected.status}`);
  check('the timeline shows the administrator as the reviewer', rejected.data?.supervisorReviewerRole === 'Administrator' && rejected.data?.supervisorReviewerName === 'Nora Alsaleh');

  const asSupervisor = await get(`/proposals/${proposalId}`, tokens.supervisor2);
  check("the supervisor may not edit the admin's feedback", asSupervisor.status === 200 && asSupervisor.data?.canEditFeedback === false);
  const overwrite = await put(`/proposals/${proposalId}/supervisor-feedback`, tokens.supervisor2, { feedback: 'Overwritten' });
  check("rewriting the admin's reason -> 403", overwrite.status === 403 && /only edit the feedback you wrote/.test(overwrite.data?.error?.message || ''), overwrite.data?.error?.message);
  const after = await get(`/proposals/${proposalId}`, temp.token);
  check("the admin's reason is unchanged", after.data?.supervisorFeedback === 'ADMIN: the scope is too small.');
}

// FR-5: a deactivated supervisor is not "available" and cannot be given a group
async function stepDeactivatedSupervisor() {
  const available = async () => (await get('/dashboard', tokens.admin)).data?.stats?.availableSupervisors;
  const before = await available();

  const email = `${TAG}-supervisor@gpmp.edu`;
  const created = await post('/users', tokens.admin, { name: 'Smoke Test Supervisor', email, password: 'Smoke2026pass', role: 'Supervisor', numberOfGroups: 3, isAvailable: true });
  checkStatus('admin creates a temporary supervisor', created, 201);
  const userId = created.data?.id;
  cleanup.push(async () => {
    // Accounts cannot be deleted, so the temporary account is deactivated instead
    if (userId) await patch(`/users/${userId}/status`, tokens.admin, { isActive: false });
  });
  check('the new supervisor is counted as accepting groups', (await available()) === before + 1);

  checkStatus('the admin deactivates the temporary supervisor', await patch(`/users/${userId}/status`, tokens.admin, { isActive: false }), 200);
  check('a deactivated supervisor is not counted on the admin dashboard', (await available()) === before);

  const supervisors = await get('/supervisors', tokens.admin);
  const supervisorId = (supervisors.data || []).find((s) => s.email === email)?.id;
  const assign = await put(`/groups/${temp.groupId}`, tokens.admin, { supervisorId });
  check('a deactivated supervisor cannot be assigned -> 400', assign.status === 400 && assign.data?.error?.message === 'This supervisor account is deactivated.', assign.data?.error?.message);
}

async function stepTasksSubmissionsFeedback() {
  const sup = tokens.supervisor1;
  const stu = tokens.student1;

  const past = await post('/tasks', sup, { groupId: ALPHA, title: 'Smoke past task', dueDate: dayFromToday(-2) });
  checkStatus('a task due in the past -> 400', past, 400);
  checkStatus('an examiner cannot create tasks -> 403', await post('/tasks', tokens.examiner1, { groupId: ALPHA, title: 'x' }), 403);

  const task = await post('/tasks', sup, {
    groupId: ALPHA,
    title: `Smoke test task ${TAG}`,
    description: 'Created by the smoke test.',
    dueDate: dayFromToday(7),
    assignedToStudentId: me.student1.studentId,
  });
  check('supervisor1 creates a task (To Do)', task.status === 201 && task.data?.status === 'To Do', `status ${task.status}`);
  const taskId = task.data?.id;
  cleanup.push(async () => {
    if (taskId) await del(`/tasks/${taskId}`, sup);
  });

  const list = await get(`/tasks?groupId=${ALPHA}`, stu);
  check('student1 sees the task in the list', (list.data || []).some((t) => t.id === taskId));
  const toReview = async () => (await get('/dashboard', sup)).data?.stats?.submissionsToReview;
  const reviewBefore = await toReview();
  checkStatus('student1 moves the task to In Progress', await patch(`/tasks/${taskId}/status`, stu, { status: 'In Progress' }), 200);

  // UC5: submit work with a file
  const file = textFile('smoke-submission.txt', `Submission from the smoke test ${TAG}`);
  const form = new FormData();
  form.append('taskId', String(taskId));
  form.append('notes', 'Here is our work.');
  form.append('files', file.blob, file.name);
  const submission = await post('/submissions', stu, form);
  check('student1 submits work with a file', submission.status === 201 && submission.data?.files?.length === 1, `status ${submission.status} ${JSON.stringify(submission.data)?.slice(0, 200)}`);
  const submissionId = submission.data?.id;

  const empty = new FormData();
  empty.append('taskId', String(taskId));
  checkStatus('a submission without a file or link -> 400', await post('/submissions', stu, empty), 400);

  const submitted = await get(`/tasks/${taskId}`, stu);
  check('the task is now Submitted', submitted.data?.status === 'Submitted', submitted.data?.status);

  // The student replaces the work before the review: the task is still counted once
  const again = new FormData();
  again.append('taskId', String(taskId));
  again.append('source', 'https://example.com/smoke-v2');
  const second = await post('/submissions', stu, again);
  checkStatus('student1 submits a second version (link only)', second, 201);
  const secondId = second.data?.id;
  check('a resubmitted task counts once in "submissions to review"', (await toReview()) === reviewBefore + 1, `${await toReview()} vs ${reviewBefore} + 1`);

  const fileId = submission.data?.files?.[0]?.id;
  const download = await get(`/files/${fileId}/download`, sup);
  check('the supervisor downloads the submitted file', download.status === 200 && download.text === file.content);

  // UC13: structured feedback
  const noComments = await post('/feedback', sup, { submissionId, decision: 'Approved', comments: '' });
  checkStatus('feedback without comments -> 400', noComments, 400);
  checkStatus('a student cannot give feedback -> 403', await post('/feedback', stu, { submissionId, decision: 'Approved', comments: 'x' }), 403);
  const feedback = await post('/feedback', sup, {
    submissionId: secondId,
    decision: 'Approved',
    strengths: 'Clear and complete.',
    improvements: 'Add more screenshots.',
    comments: 'Well done.',
  });
  checkStatus('supervisor1 gives Approved feedback', feedback, 201);
  const twice = await post('/feedback', sup, { submissionId: secondId, decision: 'Approved', comments: 'Again.' });
  checkStatus('the same reviewer cannot give feedback twice -> 409', twice, 409);
  check('after the review nothing of this task waits any more', (await toReview()) === reviewBefore, `${await toReview()} vs ${reviewBefore}`);

  const done = await get(`/tasks/${taskId}`, stu);
  check('the task is now Completed', done.data?.status === 'Completed', done.data?.status);
  check('the submission shows the feedback', done.data?.submissions?.[0]?.status === 'Approved' && done.data?.submissions?.[0]?.feedback?.length === 1);

  const progress = await get(`/tasks/progress?groupId=${ALPHA}`, stu);
  check('the progress endpoint returns a percentage', progress.status === 200 && typeof progress.data?.percent === 'number');
}

async function stepDocuments() {
  const stu = tokens.student1;
  const name = `smoke-document-${TAG}.txt`;
  const created = [];

  async function upload(token, fileName, content, groupId = ALPHA) {
    const form = new FormData();
    form.append('groupId', String(groupId));
    form.append('file', new Blob([content], { type: 'text/plain' }), fileName);
    return post('/files', token, form);
  }

  const first = await upload(stu, name, 'version one');
  check('student1 uploads a document (version 1)', first.status === 201 && first.data?.version === 1, `status ${first.status}`);
  if (first.data?.id) created.push(first.data.id);
  const second = await upload(stu, name, 'version two');
  check('uploading the same name again gives version 2', second.status === 201 && second.data?.version === 2);
  if (second.data?.id) created.push(second.data.id);
  cleanup.push(async () => {
    for (const id of created) await del(`/files/${id}`, tokens.admin);
  });

  checkStatus('an examiner cannot upload -> 403', await upload(tokens.examiner1, 'x.txt', 'x'), 403);
  checkStatus('a blocked file type -> 400', await upload(stu, 'virus.exe', 'x'), 400);
  const emptyFile = await upload(stu, `smoke-empty-${TAG}.txt`, '');
  check('an empty (0-byte) file -> 400 (UC5)', emptyFile.status === 400 && /empty or damaged/.test(emptyFile.data?.error?.message || ''), emptyFile.data?.error?.message);

  // Two uploads of the same name at the same moment still get different versions
  const raceName = `smoke-race-${TAG}.txt`;
  const race = await Promise.all([upload(stu, raceName, 'race a'), upload(stu, raceName, 'race b')]);
  race.forEach((res) => res.data?.id && created.push(res.data.id));
  const raceVersions = race.map((res) => res.data?.version).sort().join();
  check('two uploads at the same moment get versions 1 and 2', raceVersions === '1,2', raceVersions);

  const list = await get(`/files?groupId=${ALPHA}&search=${encodeURIComponent(`smoke-document-${TAG}`)}`, stu);
  check('the document list shows both versions', list.status === 200 && list.data?.length === 2);

  const download = await get(`/files/${second.data?.id}/download`, tokens.examiner1);
  check('the examiner downloads the newest version', download.status === 200 && download.text === 'version two');
  checkStatus('a student of another group cannot download -> 403', await get(`/files/${second.data?.id}/download`, tokens.student4), 403);

  for (const id of [...created]) {
    const res = await del(`/files/${id}`, stu);
    checkStatus(`the uploader deletes document ${id}`, res, 200);
    if (res.status === 200) created.splice(created.indexOf(id), 1);
  }
}

async function stepEvents() {
  const sup = tokens.supervisor1;
  const start = isoInDays(3, 7);
  const end = isoInDays(3, 8);

  const past = await post('/events', sup, { title: 'Smoke past meeting', type: 'Meeting', eventDate: isoInDays(-1), groupId: ALPHA });
  check('an event in the past -> 400', past.status === 400 && past.data?.error?.message === 'The event date cannot be in the past.', past.data?.error?.message);
  checkStatus('an examiner cannot add events -> 403', await post('/events', tokens.examiner1, { title: 'x', type: 'Meeting', eventDate: start, groupId: ALPHA }), 403);
  checkStatus('a student cannot add a Deadline -> 403', await post('/events', tokens.student1, { title: 'x', type: 'Deadline', eventDate: start, groupId: ALPHA }), 403);

  const event = await post('/events', sup, {
    title: `Smoke meeting ${TAG}`,
    type: 'Meeting',
    priority: 'Medium',
    eventDate: start,
    endDate: end,
    location: 'Room 101',
    groupId: ALPHA,
  });
  checkStatus('supervisor1 schedules a meeting', event, 201);
  const eventId = event.data?.id;
  cleanup.push(async () => {
    if (eventId) await del(`/events/${eventId}`, sup);
  });

  const from = isoInDays(-1, 0);
  const to = isoInDays(40, 0);
  const list = await get(`/events?groupId=${ALPHA}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, tokens.student1);
  const items = list.data || [];
  check('student1 sees the new meeting on the calendar', items.some((item) => item.id === eventId));
  check('the calendar also lists task due dates', items.some((item) => item.source === 'task' && String(item.id).startsWith('task-')));
  check('the calendar also lists shared academic dates', items.some((item) => item.isShared));

  // UC9: a supervisor is warned about a clash with a meeting of their OTHER group
  const clash = await get(`/events/conflicts?eventDate=${encodeURIComponent(start)}&groupId=${LEGACY}`, sup);
  check(
    'supervisor1 is warned about a clash on another group\'s calendar',
    (clash.data?.conflicts || []).some((c) => c.id === eventId) && /Team Alpha calendar/.test(clash.data?.warning || ''),
    clash.data?.warning
  );

  const deleted = await del(`/events/${eventId}`, sup);
  checkStatus('supervisor1 deletes the meeting', deleted, 200);

  // A student may delete a meeting they scheduled while it has not started yet
  const later = await post('/events', tokens.student1, { title: `Smoke student meeting ${TAG}`, type: 'Meeting', eventDate: isoInDays(4, 8), groupId: ALPHA });
  checkStatus('student1 schedules a meeting', later, 201);
  checkStatus('student1 deletes it before it starts', await del(`/events/${later.data?.id}`, tokens.student1), 200);

  // Once a meeting has started, its attendance belongs to the supervisor (FR-15)
  const started = await post('/events', tokens.student1, {
    title: `Smoke started meeting ${TAG}`,
    type: 'Meeting',
    eventDate: new Date(Date.now() - 30 * 1000).toISOString(), // started 30 seconds ago
    groupId: ALPHA,
  });
  checkStatus('student1 schedules a meeting that starts now', started, 201);
  const startedId = started.data?.id;
  cleanup.push(async () => {
    if (startedId) await del(`/events/${startedId}`, sup);
  });
  check('the started meeting is no longer editable for the student', started.data?.canEdit === false);
  checkStatus('the student cannot move the started meeting -> 403', await put(`/events/${startedId}`, tokens.student1, { eventDate: isoInDays(5) }), 403);
  checkStatus('the student cannot delete the started meeting -> 403', await del(`/events/${startedId}`, tokens.student1), 403);
  const record = await put(`/attendance/sessions/${startedId}`, sup, { records: [{ studentId: me.student1.studentId, status: 'Absent' }] });
  checkStatus('supervisor1 records attendance for it', record, 200);
  const moved = await put(`/events/${startedId}`, sup, { eventDate: isoInDays(5) });
  check('a meeting with recorded attendance cannot be moved -> 409', moved.status === 409 && /Attendance has already been recorded/.test(moved.data?.error?.message || ''), moved.data?.error?.message);
  checkStatus('supervisor1 deletes the started meeting', await del(`/events/${startedId}`, sup), 200);
  cleanup.pop();
}

// FR-8: an archived project (Team Legacy) is read-only for everyone except the administrator
async function stepArchivedProject() {
  const form = new FormData();
  form.append('groupId', String(LEGACY));
  form.append('file', new Blob(['late change'], { type: 'text/plain' }), `smoke-archive-${TAG}.txt`);
  const upload = await post('/files', tokens.alumni1, form);
  check('a student cannot upload to an archived project -> 409', upload.status === 409 && /archived/.test(upload.data?.error?.message || ''), upload.data?.error?.message);
  if (upload.data?.id) await del(`/files/${upload.data.id}`, tokens.admin);

  const files = await get(`/files?groupId=${LEGACY}`, tokens.alumni1);
  check('the archived documents cannot be deleted (canDelete false)', files.status === 200 && files.data.length > 0 && files.data.every((f) => f.canDelete === false));
  checkStatus('deleting an archived final document -> 409', await del(`/files/${files.data?.[0]?.id}`, tokens.alumni1), 409);
  const supervisorFiles = await get(`/files?groupId=${LEGACY}`, tokens.supervisor1);
  check('not even the supervisor can delete them', (supervisorFiles.data || []).every((f) => f.canDelete === false));

  const task = await post('/tasks', tokens.supervisor1, { groupId: LEGACY, title: `Smoke archived task ${TAG}` });
  checkStatus('the supervisor cannot add a task to an archived project -> 409', task, 409);
  if (task.data?.id) await del(`/tasks/${task.data.id}`, tokens.admin);

  const legacyTasks = await get(`/tasks?groupId=${LEGACY}`, tokens.supervisor1);
  const detail = await get(`/tasks/${legacyTasks.data?.[0]?.id}`, tokens.supervisor1);
  check('the archived tasks come with no edit permissions', detail.status === 200 && detail.data?.permissions?.canEdit === false && detail.data?.permissions?.canChangeStatus === false);

  const event = await post('/events', tokens.supervisor1, { title: `Smoke archived meeting ${TAG}`, type: 'Meeting', eventDate: isoInDays(3), groupId: LEGACY });
  checkStatus('no new events on an archived project calendar -> 409', event, 409);
  if (event.data?.id) await del(`/events/${event.data.id}`, tokens.admin);
}

async function stepAttendance() {
  const sup = tokens.supervisor1;
  const sessions = await get(`/attendance/sessions?groupId=${ALPHA}`, sup);
  check('supervisor1 lists the attendance sessions', sessions.status === 200 && sessions.data.some((s) => s.id === PAST_ALPHA_MEETING));

  const session = await get(`/attendance/sessions/${PAST_ALPHA_MEETING}`, sup);
  const students = session.data?.students || [];
  check('the session lists the group students', students.length === 3);
  const target = students.find((s) => s.status !== 'Excused');
  const original = students.map((s) => ({ studentId: s.studentId, status: s.status }));
  // Put the original records back at the end
  cleanup.push(async () => put(`/attendance/sessions/${PAST_ALPHA_MEETING}`, sup, { records: original }));

  const save = await put(`/attendance/sessions/${PAST_ALPHA_MEETING}`, sup, { records: [{ studentId: target.studentId, status: 'Excused' }] });
  checkStatus('supervisor1 records attendance', save, 200);

  const summary = await get(`/attendance/summary?groupId=${ALPHA}`, sup);
  const row = (summary.data || []).find((s) => s.studentId === target.studentId);
  check('the summary shows the Excused record', row && row.excused >= 1);

  const future = await put(`/attendance/sessions/${FUTURE_ALPHA_MEETING}`, sup, { records: [{ studentId: target.studentId, status: 'Present' }] });
  checkStatus('attendance for a future meeting -> 400', future, 400);
  checkStatus('a student cannot record attendance -> 403', await put(`/attendance/sessions/${PAST_ALPHA_MEETING}`, tokens.student1, { records: [] }), 403);

  const mine = await get('/attendance/me', tokens.student1);
  check('student1 sees their own attendance rate', mine.status === 200 && typeof mine.data?.rate === 'number');

  checkStatus('supervisor1 restores the original records', await put(`/attendance/sessions/${PAST_ALPHA_MEETING}`, sup, { records: original }), 200);
  cleanup.pop();
}

// Loads socket.io-client from node_modules (null if it is not installed)
async function loadSocketClient() {
  try {
    const projectRequire = createRequire(new URL('../package.json', import.meta.url));
    const module = await import(pathToFileURL(projectRequire.resolve('socket.io-client')).href);
    return module.io || module.default?.io || module.default || null;
  } catch {
    return null;
  }
}

// Opens a live connection like the website does and collects the events it receives
async function connectSocket(io, token) {
  const origin = new URL(API_URL).origin;
  const socket = io(origin, { path: '/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
  const received = [];
  socket.onAny((event, data) => received.push({ event, data }));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
  return { socket, received };
}

async function stepChat() {
  const stu = tokens.student1;
  const created = [];
  cleanup.push(async () => {
    for (const id of created) await del(`/chat/messages/${id}`, stu);
  });

  const channels = await get('/chat/channels', stu);
  check('student1 has the Team Alpha group chat', channels.status === 200 && channels.data.length === 1 && channels.data[0].channel === 'Group');

  // Live chat check (FR-9) with two real socket connections
  const io = await loadSocketClient();
  let student2Socket = null;
  let student4Socket = null;
  if (io) {
    try {
      student2Socket = await connectSocket(io, tokens.student2);
      student4Socket = await connectSocket(io, tokens.student4);
      check('student2 and student4 connect to Socket.IO', true);
    } catch (err) {
      check('student2 and student4 connect to Socket.IO', false, err.message);
    }
  } else {
    skip('live chat over Socket.IO', 'socket.io-client not found in node_modules (run npm install)');
  }

  const text = `Hello from the smoke test ${TAG}`;
  const sent = await post('/chat/messages', stu, { groupId: ALPHA, channel: 'Group', text });
  check('student1 sends a group message', sent.status === 201 && sent.data?.text === text, `status ${sent.status}`);
  if (sent.data?.id) created.push(sent.data.id);

  if (student2Socket && student4Socket) {
    await wait(700);
    const live = student2Socket.received.find((e) => e.event === 'chat:message' && e.data?.id === sent.data?.id);
    check('student2 receives the message live (chat:message)', Boolean(live));
    check('student2 gets a live notification too', student2Socket.received.some((e) => e.event.startsWith('notification:')));
    check('student4 (another group) does not receive it', !student4Socket.received.some((e) => e.event === 'chat:message'));
    student2Socket.socket.disconnect();
    student4Socket.socket.disconnect();
  }

  const messages = await get(`/chat/messages?groupId=${ALPHA}&channel=Group`, tokens.supervisor1);
  check('supervisor1 reads the message', (messages.data || []).some((m) => m.id === sent.data?.id));
  const unread = await get('/chat/unread-count', tokens.supervisor1);
  check('supervisor1 has unread chat messages', unread.data?.count >= 1, JSON.stringify(unread.data));
  const dashboard = await get('/dashboard', tokens.supervisor1);
  check('the dashboard shows the same unread count as the chat', dashboard.data?.stats?.unreadMessages === unread.data?.count, `${dashboard.data?.stats?.unreadMessages} vs ${unread.data?.count}`);
  await patch('/chat/read', tokens.supervisor1, { groupId: ALPHA, channel: 'Group' });
  const channelsAfter = await get('/chat/channels', tokens.supervisor1);
  const alphaGroup = (channelsAfter.data || []).find((c) => c.groupId === ALPHA && c.channel === 'Group');
  check('opening the channel marks it read', alphaGroup?.unreadCount === 0);

  checkStatus('an empty message -> 400', await post('/chat/messages', stu, { groupId: ALPHA, channel: 'Group', text: '   ' }), 400);
  checkStatus('a student cannot read the Staff channel -> 403', await get(`/chat/messages?groupId=${ALPHA}&channel=Staff`, stu), 403);
  checkStatus('an examiner cannot read the Group channel -> 403', await get(`/chat/messages?groupId=${ALPHA}&channel=Group`, tokens.examiner1), 403);
  checkStatus('a student of another group cannot read it -> 403', await get(`/chat/messages?groupId=${ALPHA}&channel=Group`, tokens.student4), 403);
  checkStatus('an administrator has no chat access -> 403', await get(`/chat/messages?groupId=${ALPHA}&channel=Group`, tokens.admin), 403);

  const staff = await post('/chat/messages', tokens.examiner1, { groupId: ALPHA, channel: 'Staff', text: `Staff note ${TAG}` });
  checkStatus('examiner1 writes in the Supervisor & Examiner channel', staff, 201);
  if (staff.data?.id) await del(`/chat/messages/${staff.data.id}`, tokens.examiner1);

  const removed = await del(`/chat/messages/${sent.data?.id}`, stu);
  checkStatus('student1 deletes their own message', removed, 200);
  if (removed.status === 200) created.pop();
}

async function stepAnnouncements() {
  checkStatus('a student cannot post announcements -> 403', await post('/announcements', tokens.student1, { title: 'x', content: 'x' }), 403);
  const missing = await post('/announcements', tokens.admin, { title: '', content: 'x' });
  check('an announcement without a title -> 400', missing.status === 400 && missing.data?.error?.message === 'Title is required', missing.data?.error?.message);

  const forAlpha = await post('/announcements', tokens.supervisor1, { title: `Alpha news ${TAG}`, content: 'Only for Team Alpha.', groupId: ALPHA });
  checkStatus('supervisor1 posts to Team Alpha', forAlpha, 201);
  const forSupervisors = await post('/announcements', tokens.admin, { title: `Supervisor news ${TAG}`, content: 'Only for supervisors.', targetRole: 'Supervisor' });
  checkStatus('admin posts to all supervisors', forSupervisors, 201);
  cleanup.push(async () => {
    if (forAlpha.data?.id) await del(`/announcements/${forAlpha.data.id}`, tokens.admin);
    if (forSupervisors.data?.id) await del(`/announcements/${forSupervisors.data.id}`, tokens.admin);
  });

  // The visibility rule: target role + group access (the publisher always sees their own)
  const sees = async (who) => {
    const ids = ((await get('/announcements', tokens[who])).data || []).map((a) => a.id);
    return [ids.includes(forAlpha.data?.id), ids.includes(forSupervisors.data?.id)].join();
  };
  check('student1 sees the Alpha one only', (await sees('student1')) === 'true,false');
  check('student4 (Team Beta) sees neither', (await sees('student4')) === 'false,false');
  check('examiner1 sees the Alpha one only', (await sees('examiner1')) === 'true,false');
  check('supervisor2 sees the supervisors one only', (await sees('supervisor2')) === 'false,true');
  check('supervisor1 sees both', (await sees('supervisor1')) === 'true,true');
  check('admin sees both', (await sees('admin')) === 'true,true');

  const notes = await get('/notifications', tokens.student1);
  check('student1 is notified about the Alpha announcement', (notes.data || []).some((n) => n.type === 'Announcement' && n.title.includes(TAG)));

  checkStatus('supervisor2 cannot delete supervisor1\'s announcement -> 403', await del(`/announcements/${forAlpha.data?.id}`, tokens.supervisor2), 403);
  checkStatus('supervisor1 deletes their announcement', await del(`/announcements/${forAlpha.data?.id}`, tokens.supervisor1), 200);
  checkStatus('admin deletes the supervisors announcement', await del(`/announcements/${forSupervisors.data?.id}`, tokens.admin), 200);
  cleanup.pop();
}

async function stepNotifications() {
  // Uses the temporary student, so the demo accounts keep their unread notifications
  const list = await get('/notifications', temp.token);
  check('the temporary student has notifications', list.status === 200 && list.data.length >= 1, `${list.data?.length}`);
  const count = await get('/notifications/unread-count', temp.token);
  check('the unread count is at least 1', count.data?.count >= 1, JSON.stringify(count.data));
  checkStatus('mark all as read', await patch('/notifications/read-all', temp.token), 200);
  const after = await get('/notifications/unread-count', temp.token);
  check('the unread count is now 0', after.data?.count === 0, JSON.stringify(after.data));

  const others = await get('/notifications', tokens.student1);
  const someoneElses = others.data?.[0]?.id;
  checkStatus("reading someone else's notification -> 404", await patch(`/notifications/${someoneElses}/read`, temp.token), 404);
}

async function stepResources() {
  checkStatus('a student cannot add resources -> 403', await post('/resources', tokens.student1, { title: 'x', url: 'https://example.com', category: 'Tool' }), 403);
  const badLink = await post('/resources', tokens.supervisor1, { title: 'x', url: 'ftp://example.com', category: 'Tool' });
  checkStatus('a non-http link -> 400', badLink, 400);

  const created = await post('/resources', tokens.supervisor1, { title: `Smoke tool ${TAG}`, description: 'A test link.', url: 'https://example.com/smoke', category: 'Tool' });
  checkStatus('supervisor1 adds a resource', created, 201);
  const id = created.data?.id;
  cleanup.push(async () => {
    if (id) await del(`/resources/${id}`, tokens.admin);
  });

  const updated = await put(`/resources/${id}`, tokens.supervisor1, { title: `Smoke tool ${TAG} (edited)`, url: 'https://example.com/smoke2', category: 'Tool' });
  check('supervisor1 edits the resource', updated.status === 200 && updated.data?.title.endsWith('(edited)'));
  checkStatus("supervisor2 cannot edit supervisor1's resource -> 403", await put(`/resources/${id}`, tokens.supervisor2, { title: 'x', url: 'https://example.com', category: 'Tool' }), 403);

  const list = await get('/resources?category=Tool', tokens.student1);
  check('students see it in the Tool category', (list.data || []).some((r) => r.id === id));
  checkStatus('supervisor1 deletes the resource', await del(`/resources/${id}`, tokens.supervisor1), 200);
  cleanup.pop();
}

async function stepProfile() {
  const profile = await get('/profile', temp.token);
  check('the temporary student opens their profile', profile.status === 200 && profile.data?.role === 'Student');
  const updated = await put('/profile', temp.token, { name: 'Smoke Test Student Renamed', major: 'Computer Science' });
  checkStatus('they update their name and major', updated, 200);
  const meAfter = await get('/auth/me', temp.token);
  check('/auth/me shows the new name', meAfter.data?.name === 'Smoke Test Student Renamed');
  checkStatus('changing the email on the profile -> 400', await put('/profile', temp.token, { name: 'x', email: 'other@gpmp.edu' }), 400);
}

async function stepShowcaseAndDashboards() {
  const showcase = await get('/showcase', tokens.student1);
  check('the showcase lists the archived Team Legacy project', (showcase.data || []).some((p) => p.title === 'Library Seat Booking System'));
  const years = await get('/showcase/years', tokens.student1);
  check('the showcase years include 2024-2025', (years.data || []).includes('2024-2025'), JSON.stringify(years.data));

  const legacyItem = (showcase.data || []).find((p) => p.title === 'Library Seat Booking System');
  const legacy = await get(`/showcase/${legacyItem?.id}`, tokens.student7);
  const documents = legacy.data?.documents || [];
  check('the showcase card counts the same final documents as the detail', legacy.status === 200 && legacy.data?.documentCount === documents.length, `${legacy.data?.documentCount} vs ${documents.length}`);
  const finalDoc = await get(`/showcase/${legacyItem?.id}/documents/${documents[0]?.id}/download`, tokens.student7);
  checkStatus('any user can download a final document', finalDoc, 200);
  check('the students can still edit the archived showcase (FR-18)', (await get(`/showcase/${legacyItem?.id}`, tokens.alumni1)).data?.canEdit === true);

  for (const [who, role] of [['student1', 'Student'], ['supervisor1', 'Supervisor'], ['examiner1', 'Examiner'], ['admin', 'Administrator']]) {
    const dashboard = await get('/dashboard', tokens[who]);
    check(`dashboard for ${role}`, dashboard.status === 200 && dashboard.data?.role === role, `status ${dashboard.status}`);
  }
  const student7 = await get('/dashboard', tokens.student7);
  check('dashboard for a student without a group', student7.status === 200 && student7.data?.group === null);
}

async function stepPasswordReset() {
  const unknown = await post('/auth/forgot-password', null, { email: `nobody-${TAG}@gpmp.edu` });
  check('forgot password for an unknown email -> 404 (UC2)', unknown.status === 404 && unknown.data?.error?.message === 'No account was found with this email address.', unknown.data?.error?.message);

  const forgot = await post('/auth/forgot-password', null, { email: temp.email });
  checkStatus('forgot password for the temporary student', forgot, 200);
  const link = forgot.data?.devResetLink;
  if (!link) {
    skip('reset password with the emailed link', 'the server runs in production mode, so the link is only emailed');
    return;
  }
  const token = new URL(link).searchParams.get('token');
  const sessionBefore = temp.token;
  checkStatus('a weak new password -> 400', await post('/auth/reset-password', null, { token, password: 'short' }), 400);
  temp.password = 'Reset2026pass';
  checkStatus('reset the password with the link', await post('/auth/reset-password', null, { token, password: temp.password }), 200);
  checkStatus('the used link cannot be used again -> 400', await post('/auth/reset-password', null, { token, password: 'Another2026' }), 400);
  checkStatus('the reset ends the older session (old token -> 401)', await get('/auth/me', sessionBefore), 401);
  const login = await post('/auth/login', null, { email: temp.email, password: temp.password });
  checkStatus('sign in with the new password', login, 200);
  temp.token = login.data?.token || temp.token;
}

async function stepLockout() {
  // UC1: 5 wrong passwords in a row lock the account for 15 minutes
  let last = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    last = await post('/auth/login', null, { email: temp.email, password: `Wrong${attempt}pass` });
  }
  check('the 5th wrong password locks the account (423)', last.status === 423, `got ${last.status}`);
  const locked = await post('/auth/login', null, { email: temp.email, password: temp.password });
  checkStatus('even the right password is refused while locked (423)', locked, 423);

  const users = await get(`/users?search=${encodeURIComponent(TAG)}`, tokens.admin);
  check('the admin sees the account as locked', (users.data || []).find((u) => u.id === temp.userId)?.isLocked === true);
  checkStatus('the admin unlocks the account', await post(`/users/${temp.userId}/unlock`, tokens.admin), 200);
  const login = await post('/auth/login', null, { email: temp.email, password: temp.password });
  checkStatus('the student can sign in again', login, 200);
  temp.token = login.data?.token || temp.token;

  const wrongCurrent = await post('/auth/change-password', temp.token, { currentPassword: 'not-it-123', newPassword: 'Changed2026pass' });
  checkStatus('change password with a wrong current password -> 400', wrongCurrent, 400);
  const oldToken = temp.token;
  const changed = await post('/auth/change-password', temp.token, { currentPassword: temp.password, newPassword: 'Changed2026pass' });
  check('change password (returns a new token)', changed.status === 200 && Boolean(changed.data?.token), `status ${changed.status}`);
  temp.password = 'Changed2026pass';
  checkStatus('the token from before the change stops working (401)', await get('/auth/me', oldToken), 401);
  checkStatus('the new token keeps this tab signed in', await get('/auth/me', changed.data?.token), 200);
  temp.token = changed.data?.token || temp.token;
}

async function stepDeactivate() {
  checkStatus('the admin cannot deactivate themself -> 400', await patch(`/users/${me.admin.id}/status`, tokens.admin, { isActive: false }), 400);
  const off = await patch(`/users/${temp.userId}/status`, tokens.admin, { isActive: false });
  check('the admin deactivates the temporary student', off.status === 200 && off.data?.isActive === false);
  checkStatus('their old token stops working (401)', await get('/auth/me', temp.token), 401);
  const login = await post('/auth/login', null, { email: temp.email, password: temp.password });
  checkStatus('a deactivated account cannot sign in (403)', login, 403);
}

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------

const steps = [
  ['Health', stepHealth],
  ['Sign in (UC1) and /auth/me', stepLogin],
  ['Fresh demo data', stepFreshData],
  ['My groups per role', stepMyGroups],
  ['Groups and access rules', stepGroups],
  ['Users (FR-2) and a temporary group (UC10)', stepUsersAndTempGroup],
  ['Team Gamma: supervisor, project, proposal review (UC11, UC16, UC17)', stepTeamGammaFlow],
  ['Proposal feedback belongs to its reviewer (UC16)', stepFeedbackOwnership],
  ['Deactivated supervisors (FR-5)', stepDeactivatedSupervisor],
  ['Tasks, submission, feedback (UC5, UC13, UC15)', stepTasksSubmissionsFeedback],
  ['Documents (UC4)', stepDocuments],
  ['Calendar events (UC9)', stepEvents],
  ['Archived project is read-only (FR-8)', stepArchivedProject],
  ['Attendance (UC14)', stepAttendance],
  ['Chat (UC6, UC12)', stepChat],
  ['Announcements (UC7)', stepAnnouncements],
  ['Notifications (FR-20)', stepNotifications],
  ['Resources (FR-17)', stepResources],
  ['Profile', stepProfile],
  ['Showcase and dashboards', stepShowcaseAndDashboards],
  ['Forgot / reset password (UC2)', stepPasswordReset],
  ['Account lock and change password (UC1)', stepLockout],
  ['Deactivate a user', stepDeactivate],
];

console.log(`GPMP smoke test against ${API_URL}\n`);

let stopped = false;
for (const [title, step] of steps) {
  console.log(`\n== ${title}`);
  try {
    await step();
  } catch (err) {
    // Without a running API or with old demo data, the other steps cannot work
    if (step === stepHealth || step === stepFreshData) {
      console.log(`\n${err.message}`);
      stopped = true;
      break;
    }
    check(`${title} finished without crashing`, false, err.message);
  }
}

// Remove what the test created, newest first
console.log('\n== Cleaning up');
for (const undo of cleanup.reverse()) {
  try {
    await undo();
  } catch (err) {
    console.log(`  (cleanup step failed: ${err.message})`);
  }
}
console.log('  done');

console.log(`\n${passed} passed, ${failed} failed${stopped ? ' (stopped early)' : ''}`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  failures.forEach((name) => console.log(`  - ${name}`));
}
if (rateLimited) {
  console.log(
    '\nNote: the server answered 429 (too many failed sign-ins from this computer). ' +
      'The limit is 20 failed attempts per 15 minutes. Restart the backend or wait 15 minutes, ' +
      'then run "npm run db:setup" and this test again.'
  );
}
process.exitCode = failed > 0 ? 1 : 0;
