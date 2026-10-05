-- =====================================================================
-- GPMP database schema (MySQL / MariaDB)
--
-- Based on the report's Database Schema (Figure 39). Table and column
-- names follow the report. Anything not in the figure is marked "added"
-- together with the requirement (FR / Use Case) it supports.
--
-- Running this file DELETES all GPMP tables and creates them again.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS resource, notification, announcement, chat_message,
  attendance, important_date, calendar, feedback, `file`, submission, task,
  proposal, graduation_project, student, project_group, examiner, supervisor,
  admin, `user`;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------

-- Every person who can log in
CREATE TABLE `user` (
  UserID              INT AUTO_INCREMENT PRIMARY KEY,
  Name                VARCHAR(100) NOT NULL,
  Email               VARCHAR(150) NOT NULL UNIQUE,
  Password            VARCHAR(255) NOT NULL,              -- bcrypt hash, never plain text (NFR-10)
  Role                VARCHAR(50)  NOT NULL,
  IsActive            TINYINT(1)   NOT NULL DEFAULT 1,    -- added: admin can deactivate accounts
  FailedLoginAttempts INT          NOT NULL DEFAULT 0,    -- added: UC1 lock after many failed logins
  LockedUntil         DATETIME     NULL,                  -- added: UC1
  ResetTokenHash      VARCHAR(255) NULL,                  -- added: UC2 reset password
  ResetTokenExpires   DATETIME     NULL,                  -- added: UC2
  TokenVersion        INT          NOT NULL DEFAULT 0,    -- added: raised on every password change so older login tokens stop working
  CreatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP, -- added
  CONSTRAINT chk_user_role CHECK (Role IN ('Student', 'Supervisor', 'Examiner', 'Administrator'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin (
  AdminID         INT AUTO_INCREMENT PRIMARY KEY,
  UserID          INT NOT NULL UNIQUE,
  AdminDepartment VARCHAR(100) NULL,
  CONSTRAINT fk_admin_user FOREIGN KEY (UserID) REFERENCES `user`(UserID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supervisor (
  SupervisorID         INT AUTO_INCREMENT PRIMARY KEY,
  UserID               INT NOT NULL UNIQUE,
  SupervisorDepartment VARCHAR(100) NULL,
  NumberOfGroups       INT NOT NULL DEFAULT 3,   -- the maximum number of groups this supervisor accepts (FR-5)
  IsAvailable          TINYINT(1) NOT NULL DEFAULT 1, -- added: FR-5 admin manages the available supervisors list
  CONSTRAINT fk_supervisor_user FOREIGN KEY (UserID) REFERENCES `user`(UserID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE examiner (
  ExaminerID         INT AUTO_INCREMENT PRIMARY KEY,
  UserID             INT NOT NULL UNIQUE,
  ExaminerDepartment VARCHAR(100) NULL,
  CONSTRAINT fk_examiner_user FOREIGN KEY (UserID) REFERENCES `user`(UserID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Groups and projects
-- ---------------------------------------------------------------------

CREATE TABLE project_group (
  GroupID          INT AUTO_INCREMENT PRIMARY KEY,
  GroupName        VARCHAR(100) NOT NULL UNIQUE,   -- UC10: a group with the same name cannot exist twice
  SupervisorID     INT NULL,
  ExaminerID       INT NULL,
  CreatedByAdminID INT NULL,
  CreatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- added
  CONSTRAINT fk_group_supervisor FOREIGN KEY (SupervisorID) REFERENCES supervisor(SupervisorID) ON DELETE SET NULL,
  CONSTRAINT fk_group_examiner   FOREIGN KEY (ExaminerID)   REFERENCES examiner(ExaminerID)     ON DELETE SET NULL,
  CONSTRAINT fk_group_admin      FOREIGN KEY (CreatedByAdminID) REFERENCES admin(AdminID)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student (
  StudentID    INT AUTO_INCREMENT PRIMARY KEY,
  UserID       INT NOT NULL UNIQUE,
  GroupID      INT NULL,                         -- NULL until the admin puts the student in a group
  StudentMajor VARCHAR(100) NULL,
  GPA          DECIMAL(3,2) NULL,
  CONSTRAINT fk_student_user  FOREIGN KEY (UserID)  REFERENCES `user`(UserID)         ON DELETE CASCADE,
  CONSTRAINT fk_student_group FOREIGN KEY (GroupID) REFERENCES project_group(GroupID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One graduation project per group
CREATE TABLE graduation_project (
  ProjectID           INT AUTO_INCREMENT PRIMARY KEY,
  GroupID             INT NOT NULL UNIQUE,
  ProjectTitle        VARCHAR(200) NOT NULL,
  ProjectDescription  TEXT NULL,
  Status              VARCHAR(50) NOT NULL DEFAULT 'Proposed', -- added: FR-4 project status
  AcademicYear        VARCHAR(20) NULL,          -- added: FR-19 compare archived projects by year
  ShowcaseDescription TEXT NULL,                 -- added: FR-18 written description on completion
  ShowcaseVideoPath   VARCHAR(500) NULL,         -- added: FR-18 stored file name of the showcase video
  CompletedAt         DATETIME NULL,             -- added
  ArchivedAt          DATETIME NULL,             -- added: FR-8
  CreatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- added
  CONSTRAINT fk_project_group FOREIGN KEY (GroupID) REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT chk_project_status CHECK (Status IN ('Proposed', 'In Progress', 'Completed', 'Archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proposal review flow (FR-6, FR-7, UC16, UC17):
-- student submits -> 'Pending Supervisor' -> supervisor approves -> 'Pending Examiner'
-- -> examiner approves -> 'Approved'.  Any reviewer (or the admin) can reject -> 'Rejected'.
CREATE TABLE proposal (
  ProposalID            INT AUTO_INCREMENT PRIMARY KEY,
  ProjectID             INT NOT NULL,
  ProposalDeadline      DATE NULL,
  ProposalTime          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- when it was submitted
  ProposalComments      TEXT NULL,                -- the students' notes when submitting
  Status                VARCHAR(50) NOT NULL DEFAULT 'Pending Supervisor',
  SupervisorFeedback    TEXT NULL,                -- added: supervisor's decision comments
  ExaminerFeedback      TEXT NULL,                -- added: UC17 examiner proposal feedback (editable)
  SupervisorReviewedAt  DATETIME NULL,            -- added
  ExaminerReviewedAt    DATETIME NULL,            -- added
  DecidedByUserID       INT NULL,                 -- added: who made the final decision
  SupervisorReviewedByUserID INT NULL,            -- added: who wrote the supervisor-stage feedback (UC16)
  ExaminerReviewedByUserID   INT NULL,            -- added: who wrote the examiner-stage feedback (UC17)
  CONSTRAINT fk_proposal_project FOREIGN KEY (ProjectID) REFERENCES graduation_project(ProjectID) ON DELETE CASCADE,
  CONSTRAINT fk_proposal_decider FOREIGN KEY (DecidedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_proposal_sup_reviewer FOREIGN KEY (SupervisorReviewedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_proposal_ex_reviewer  FOREIGN KEY (ExaminerReviewedByUserID)   REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_proposal_status CHECK (Status IN ('Pending Supervisor', 'Pending Examiner', 'Approved', 'Rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tasks, submissions, files and feedback
-- ---------------------------------------------------------------------

-- Tasks and milestones (FR-14, UC15)
CREATE TABLE task (
  TaskID              INT AUTO_INCREMENT PRIMARY KEY,
  GroupID             INT NOT NULL,
  SupervisorID        INT NULL,
  Title               VARCHAR(200) NOT NULL,
  DueDate             DATE NULL,
  Status              VARCHAR(50) NOT NULL DEFAULT 'To Do',
  Description         TEXT NULL,                  -- added
  IsMilestone         TINYINT(1) NOT NULL DEFAULT 0, -- added: FR-14 milestones
  AssignedToStudentID INT NULL,                   -- added
  CreatedByUserID     INT NULL,                   -- added
  CreatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- added
  UpdatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- added
  ReminderSentFor     DATE NULL,                  -- added: FR-20 the due date a "due tomorrow" reminder was already sent for
  CONSTRAINT fk_task_group      FOREIGN KEY (GroupID)             REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT fk_task_supervisor FOREIGN KEY (SupervisorID)        REFERENCES supervisor(SupervisorID) ON DELETE SET NULL,
  CONSTRAINT fk_task_student    FOREIGN KEY (AssignedToStudentID) REFERENCES student(StudentID) ON DELETE SET NULL,
  CONSTRAINT fk_task_creator    FOREIGN KEY (CreatedByUserID)     REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_task_status CHECK (Status IN ('To Do', 'In Progress', 'Submitted', 'Completed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A student's submission for a task (UC5)
CREATE TABLE submission (
  SubmissionID         INT AUTO_INCREMENT PRIMARY KEY,
  TaskID               INT NOT NULL,
  GroupID              INT NOT NULL,
  SubmittedByStudentID INT NULL,
  SubmissionDeadline   DATE NULL,                 -- copy of the task due date at submission time
  SubmissionDate       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  SubmissionSource     VARCHAR(255) NULL,         -- optional link (e.g. GitHub or Drive URL)
  Status               VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  Notes                TEXT NULL,                 -- added: the student's message with the submission
  CONSTRAINT fk_submission_task    FOREIGN KEY (TaskID)               REFERENCES task(TaskID) ON DELETE CASCADE,
  CONSTRAINT fk_submission_group   FOREIGN KEY (GroupID)              REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT fk_submission_student FOREIGN KEY (SubmittedByStudentID) REFERENCES student(StudentID) ON DELETE SET NULL,
  CONSTRAINT chk_submission_status CHECK (Status IN ('Submitted', 'Approved', 'Needs Revision'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uploaded files: group documents (FR-16, UC4), submission attachments and showcase videos
CREATE TABLE `file` (
  FileID           INT AUTO_INCREMENT PRIMARY KEY,
  SubmissionID     INT NULL,                      -- set when the file belongs to a submission
  UploadedByUserID INT NULL,
  FileName         VARCHAR(255) NOT NULL,         -- original file name shown to users
  FilePath         VARCHAR(500) NOT NULL,         -- stored file name inside uploads/
  UploadDate       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  GroupID          INT NULL,                      -- added: the group the file belongs to
  FileSize         INT NULL,                      -- added: size in bytes
  MimeType         VARCHAR(100) NULL,             -- added
  Category         VARCHAR(50) NOT NULL DEFAULT 'Document', -- added
  Version          INT NOT NULL DEFAULT 1,        -- added: increases when a file with the same name is uploaded again
  CONSTRAINT fk_file_submission FOREIGN KEY (SubmissionID)     REFERENCES submission(SubmissionID) ON DELETE CASCADE,
  CONSTRAINT fk_file_user       FOREIGN KEY (UploadedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_file_group      FOREIGN KEY (GroupID)          REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT chk_file_category CHECK (Category IN ('Document', 'Submission', 'Showcase'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- added table: structured feedback on submissions (FR-11, UC13)
CREATE TABLE feedback (
  FeedbackID     INT AUTO_INCREMENT PRIMARY KEY,
  SubmissionID   INT NOT NULL,
  GivenByUserID  INT NULL,
  Decision       VARCHAR(50) NOT NULL,
  Strengths      TEXT NULL,
  Improvements   TEXT NULL,
  Comments       TEXT NOT NULL,
  CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feedback_reviewer (SubmissionID, GivenByUserID), -- one feedback per reviewer per submission (UC13)
  CONSTRAINT fk_feedback_submission FOREIGN KEY (SubmissionID)  REFERENCES submission(SubmissionID) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_user       FOREIGN KEY (GivenByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_feedback_decision CHECK (Decision IN ('Approved', 'Needs Revision'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Calendar, events and attendance
-- ---------------------------------------------------------------------

-- One calendar per group. The calendar with GroupID = NULL is the shared
-- academic calendar that every user sees.
CREATE TABLE calendar (
  CalendarID   INT AUTO_INCREMENT PRIMARY KEY,
  GroupID      INT NULL UNIQUE,
  CalendarDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- when the calendar was created
  CONSTRAINT fk_calendar_group FOREIGN KEY (GroupID) REFERENCES project_group(GroupID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Events on a calendar: deadlines, meetings, presentations, academic dates (FR-13, UC9)
CREATE TABLE important_date (
  DeadlineID         INT AUTO_INCREMENT PRIMARY KEY,
  CalendarID         INT NOT NULL,
  DeadlineType       VARCHAR(100) NOT NULL DEFAULT 'Deadline',
  DeadlinePriority   VARCHAR(50)  NOT NULL DEFAULT 'Medium',
  DeadlineSetDate    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- when the event was created
  DeadlineUpdateDate DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,    -- when the event was last changed
  Title              VARCHAR(200) NOT NULL,       -- added
  Description        TEXT NULL,                   -- added
  EventDate          DATETIME NOT NULL,           -- added: when the event happens
  EndDate            DATETIME NULL,               -- added
  Location           VARCHAR(200) NULL,           -- added: room or online meeting link
  CreatedByUserID    INT NULL,                    -- added
  ReminderSent       TINYINT(1) NOT NULL DEFAULT 0, -- added: FR-20 reminder already sent
  CONSTRAINT fk_date_calendar FOREIGN KEY (CalendarID)      REFERENCES calendar(CalendarID) ON DELETE CASCADE,
  CONSTRAINT fk_date_creator  FOREIGN KEY (CreatedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_date_type     CHECK (DeadlineType IN ('Deadline', 'Meeting', 'Presentation', 'Academic')),
  CONSTRAINT chk_date_priority CHECK (DeadlinePriority IN ('Low', 'Medium', 'High'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- added table: attendance for meetings and presentations (FR-15, UC14)
CREATE TABLE attendance (
  AttendanceID     INT AUTO_INCREMENT PRIMARY KEY,
  DeadlineID       INT NOT NULL,                  -- the meeting / presentation (important_date)
  StudentID        INT NOT NULL,
  Status           VARCHAR(50) NOT NULL,
  RecordedByUserID INT NULL,
  RecordedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (DeadlineID, StudentID),
  CONSTRAINT fk_attendance_event    FOREIGN KEY (DeadlineID)       REFERENCES important_date(DeadlineID) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_student  FOREIGN KEY (StudentID)        REFERENCES student(StudentID) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_recorder FOREIGN KEY (RecordedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_attendance_status CHECK (Status IN ('Present', 'Absent', 'Late', 'Excused'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------

-- MsgType 'Group' = the group chat between students and their supervisor (FR-9, UC6)
-- MsgType 'Staff' = the supervisor-examiner channel of a group (FR-10, UC12)
CREATE TABLE chat_message (
  ChatID         INT AUTO_INCREMENT PRIMARY KEY,
  GroupID        INT NOT NULL,
  SenderUserID   INT NULL,
  ReceiverUserID INT NULL,
  MsgType        VARCHAR(50) NOT NULL DEFAULT 'Group',
  MsgDate        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- report: DATE; DATETIME keeps the time too
  MessageText    TEXT NOT NULL,
  CONSTRAINT fk_chat_group    FOREIGN KEY (GroupID)        REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT fk_chat_sender   FOREIGN KEY (SenderUserID)   REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_chat_receiver FOREIGN KEY (ReceiverUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_chat_type CHECK (MsgType IN ('Group', 'Staff'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Announcements (FR-12, UC7). The report links them to admin only; supervisors
-- can also post (FR-12), so the publisher is a user.
CREATE TABLE announcement (
  AnnouncementID       INT AUTO_INCREMENT PRIMARY KEY,
  PublishedByUserID    INT NULL,                  -- report: PublishedByAdminID
  AnnouncementDate     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  AnnouncementTitle    VARCHAR(200) NOT NULL,
  AnnouncementContent  TEXT NOT NULL,
  AnnouncementEditDate DATETIME NULL,
  TargetRole           VARCHAR(50) NOT NULL DEFAULT 'All', -- added: who should see it
  GroupID              INT NULL,                  -- added: set when only one group should see it
  CONSTRAINT fk_announcement_user  FOREIGN KEY (PublishedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT fk_announcement_group FOREIGN KEY (GroupID)           REFERENCES project_group(GroupID) ON DELETE CASCADE,
  CONSTRAINT chk_announcement_target CHECK (TargetRole IN ('All', 'Student', 'Supervisor', 'Examiner'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- added table: in-app notifications (FR-20)
CREATE TABLE notification (
  NotificationID INT AUTO_INCREMENT PRIMARY KEY,
  UserID         INT NOT NULL,
  Type           VARCHAR(50)  NOT NULL,
  Title          VARCHAR(200) NOT NULL,
  Message        VARCHAR(500) NULL,
  Link           VARCHAR(255) NULL,               -- page to open when clicked, e.g. /tasks/4
  IsRead         TINYINT(1) NOT NULL DEFAULT 0,
  CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (UserID) REFERENCES `user`(UserID) ON DELETE CASCADE,
  CONSTRAINT chk_notification_type CHECK (Type IN ('Announcement', 'Deadline', 'Meeting', 'Message', 'Feedback', 'Task', 'Proposal', 'System'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- added table: learning resources (FR-17)
CREATE TABLE resource (
  ResourceID      INT AUTO_INCREMENT PRIMARY KEY,
  Title           VARCHAR(200) NOT NULL,
  Description     TEXT NULL,
  Url             VARCHAR(500) NOT NULL,
  Category        VARCHAR(50) NOT NULL DEFAULT 'Tutorial',
  CreatedByUserID INT NULL,
  CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resource_user FOREIGN KEY (CreatedByUserID) REFERENCES `user`(UserID) ON DELETE SET NULL,
  CONSTRAINT chk_resource_category CHECK (Category IN ('Tutorial', 'Tool', 'Framework', 'Library', 'Guide'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
