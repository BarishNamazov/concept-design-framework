/**
 * Composed loaders for LMS views — just like src/lib/loaders.ts for the forum.
 * Each function wraps SDK calls with unwrap() so callers get clean data.
 *
 * Note: The SDK exposes multi-word endpoint paths as hyphenated properties
 * (e.g. api.lms["staff-dashboard"], api["late-days"].balance).
 */
import { api, unwrap } from "@/lib/api";

export async function loadStudentDashboard(session: string) {
  return unwrap(await api.lms.me({ session }));
}

export async function loadStaffDashboard(session: string) {
  return unwrap(await (api.lms as Record<string, Function>)["staff-dashboard"]({ session }));
}

export async function loadRosterMe(session: string) {
  return unwrap(await api.roster.me({ session }));
}

export async function loadRosterList(session: string) {
  return unwrap(await api.roster.list({ session }));
}

export async function loadSections() {
  const roster = api.roster as Record<string, Record<string, Function>>;
  return unwrap(await roster["sections"].list({}));
}

export async function loadAssignments(session: string) {
  return unwrap(await (api.assignments as Record<string, Function>)["for-me"]({ session }));
}

export async function loadAssignmentDetail(assignment: string) {
  return unwrap(await api.assignments.get({ assignment }));
}

export async function loadSubmissionLatest(assignment: string, submitter: string) {
  return unwrap(await api.submissions.latest({ assignment, submitter }));
}

export async function loadSubmissionAttempts(assignment: string, submitter: string) {
  return unwrap(await api.submissions.attempts({ assignment, submitter }));
}

export async function loadSubmissionsForAssignment(session: string, assignment: string) {
  return unwrap(await (api.submissions as Record<string, Function>)["for-assignment"]({ session, assignment }));
}

export async function loadSubmissionsForStudent(submitter: string) {
  return unwrap(await (api.submissions as Record<string, Function>)["for-student"]({ submitter }));
}

export async function loadGradesForMe(session: string) {
  return unwrap(await (api.grades as Record<string, Function>)["for-me"]({ session }));
}

export async function loadGradesForStudent(session: string, learner: string) {
  return unwrap(await (api.grades as Record<string, Function>)["for-student"]({ session, learner }));
}

export async function loadGradesForItem(session: string, item: string) {
  return unwrap(await (api.grades as Record<string, Function>)["for-item"]({ session, item }));
}

export async function loadGradebook(session: string) {
  return unwrap(await api.grades.gradebook({ session }));
}

const lateDays = () => api as unknown as Record<string, Record<string, Function>>;

export async function loadLateDayBalance(learner: string) {
  return unwrap(await lateDays()["late-days"].balance({ learner }));
}

export async function loadLateDaysList(session: string) {
  return unwrap(await lateDays()["late-days"].list({ session }));
}

export async function loadLateDaysForAssignment(session: string, assignment: string) {
  return unwrap(await lateDays()["late-days"]["for-assignment"]({ session, assignment }));
}

const studentsApi = () => api.students as unknown as Record<string, Record<string, Function>>;

export async function loadVisibleNotes(session: string) {
  return unwrap(await studentsApi().notes.visible({ session }));
}

export async function loadStaffNotes(session: string, learner: string) {
  return unwrap(await studentsApi().notes.list({ session, learner }));
}

export async function loadStudentDetail(session: string, user: string) {
  return unwrap(await (api.students as unknown as Record<string, Function>).detail({ session, user }));
}

export async function loadCalendarMe(session: string, start: string, end: string) {
  return unwrap(await api.calendar.me({ session, start, end }));
}

export async function loadCalendarStaff(session: string, start: string, end: string, section?: string) {
  const cal = api.calendar as unknown as Record<string, Function>;
  return unwrap(await cal.staff({ session, start, end, section }));
}
