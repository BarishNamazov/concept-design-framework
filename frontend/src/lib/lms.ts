/**
 * Composed loaders for LMS views — just like src/lib/loaders.ts for the forum.
 * Each function wraps SDK calls with unwrap() so callers get clean data.
 */
import { api, unwrap } from "@/lib/api";

export async function loadStudentDashboard(
  session: string,
): Promise<{ loaded: boolean }> {
  return unwrap(await api.lms.me({ session })) as unknown as {
    loaded: boolean;
  };
}

export async function loadStaffDashboard(session: string): Promise<{
  dashboard: {
    user: string;
    seat: string;
    kind: string;
    section?: string;
    rosterName: string;
    email: string;
  }[];
}> {
  return unwrap(await api.lms["staff-dashboard"]({ session })) as unknown as {
    dashboard: {
      user: string;
      seat: string;
      kind: string;
      section?: string;
      rosterName: string;
      email: string;
    }[];
  };
}

export async function loadRosterMe(
  session: string,
): Promise<{ seat: unknown }> {
  return unwrap(await api.roster.me({ session })) as unknown as {
    seat: unknown;
  };
}

export async function loadRosterList(session: string): Promise<{
  members: {
    user: string;
    seat: string;
    kind: string;
    section?: string;
    rosterName: string;
    email: string;
  }[];
}> {
  return unwrap(await api.roster.list({ session })) as unknown as {
    members: {
      user: string;
      seat: string;
      kind: string;
      section?: string;
      rosterName: string;
      email: string;
    }[];
  };
}

export async function loadSections(): Promise<{
  sections: {
    section: string;
    name: string;
    location?: string;
    meetingPattern?: string;
    status: string;
  }[];
}> {
  return unwrap(await api.roster["sections/list"]({})) as unknown as {
    sections: {
      section: string;
      name: string;
      location?: string;
      meetingPattern?: string;
      status: string;
    }[];
  };
}

export async function loadAssignments(session: string): Promise<{
  assignments: {
    assignment: string;
    release?: string;
    dueOverride?: string;
    status: string;
  }[];
}> {
  return unwrap(await api.assignments["for-me"]({ session })) as unknown as {
    assignments: {
      assignment: string;
      release?: string;
      dueOverride?: string;
      status: string;
    }[];
  };
}

export async function loadAssignmentDetail(assignment: string): Promise<{
  assignment: {
    assignment: string;
    author: string;
    title: string;
    instructions: string;
    kind: string;
    availableAt: string;
    dueAt: string;
    closeAt?: string;
    acceptsSubmissions: boolean;
    status: string;
  };
}> {
  return unwrap(await api.assignments.get({ assignment })) as unknown as {
    assignment: {
      assignment: string;
      author: string;
      title: string;
      instructions: string;
      kind: string;
      availableAt: string;
      dueAt: string;
      closeAt?: string;
      acceptsSubmissions: boolean;
      status: string;
    };
  };
}

export async function loadSubmissionLatest(
  assignment: string,
  submitter: string,
): Promise<{
  submission: {
    submission: string;
    artifacts: string[];
    submittedAt: string;
    number: number;
    status: string;
  } | null;
}> {
  return unwrap(
    await api.submissions.latest({ assignment, submitter }),
  ) as unknown as {
    submission: {
      submission: string;
      artifacts: string[];
      submittedAt: string;
      number: number;
      status: string;
    } | null;
  };
}

export async function loadSubmissionAttempts(
  assignment: string,
  submitter: string,
): Promise<{
  attempts: {
    submission: string;
    artifacts: string[];
    submittedAt: string;
    number: number;
    status: string;
  }[];
}> {
  return unwrap(
    await api.submissions.attempts({ assignment, submitter }),
  ) as unknown as {
    attempts: {
      submission: string;
      artifacts: string[];
      submittedAt: string;
      number: number;
      status: string;
    }[];
  };
}

export async function loadSubmissionsForAssignment(
  session: string,
  assignment: string,
): Promise<{
  submissions: {
    submitter: string;
    submission: string;
    submittedAt: string;
    number: number;
    status: string;
  }[];
}> {
  return unwrap(
    await api.submissions["for-assignment"]({ session, assignment }),
  ) as unknown as {
    submissions: {
      submitter: string;
      submission: string;
      submittedAt: string;
      number: number;
      status: string;
    }[];
  };
}

export async function loadSubmissionsForStudent(submitter: string): Promise<{
  submissions: {
    assignment: string;
    submission: string;
    submittedAt: string;
    number: number;
    status: string;
  }[];
}> {
  return unwrap(
    await api.submissions["for-student"]({ submitter }),
  ) as unknown as {
    submissions: {
      assignment: string;
      submission: string;
      submittedAt: string;
      number: number;
      status: string;
    }[];
  };
}

export async function loadGradesForMe(session: string): Promise<{
  grades: {
    item: string;
    grade: string;
    score: number;
    maxPoints: number;
    status: string;
    label: string;
    feedback?: string;
  }[];
}> {
  return unwrap(await api.grades["for-me"]({ session })) as unknown as {
    grades: {
      item: string;
      grade: string;
      score: number;
      maxPoints: number;
      status: string;
      label: string;
      feedback?: string;
    }[];
  };
}

export async function loadGradesForStudent(
  session: string,
  learner: string,
): Promise<{
  grades: {
    item: string;
    grade: string;
    score: number;
    maxPoints: number;
    status: string;
    label: string;
    feedback?: string;
  }[];
}> {
  return unwrap(
    await api.grades["for-student"]({ session, learner }),
  ) as unknown as {
    grades: {
      item: string;
      grade: string;
      score: number;
      maxPoints: number;
      status: string;
      label: string;
      feedback?: string;
    }[];
  };
}

export async function loadGradesForItem(
  session: string,
  item: string,
): Promise<{
  grades: { learner: string; grade: string; score: number; status: string }[];
}> {
  return unwrap(await api.grades["for-item"]({ session, item })) as unknown as {
    grades: { learner: string; grade: string; score: number; status: string }[];
  };
}

export async function loadGradebook(session: string): Promise<{
  learners: {
    user: string;
    seat: string;
    section?: string;
    rosterName: string;
    email: string;
  }[];
}> {
  return unwrap(await api.grades.gradebook({ session })) as unknown as {
    learners: {
      user: string;
      seat: string;
      section?: string;
      rosterName: string;
      email: string;
    }[];
  };
}

export async function loadLateDayBalance(
  learner: string,
): Promise<{ balance: { granted: number; used: number; remaining: number } }> {
  return unwrap(await api["late-days"].balance({ learner })) as unknown as {
    balance: { granted: number; used: number; remaining: number };
  };
}

export async function loadLateDaysList(session: string): Promise<unknown> {
  return unwrap(await api["late-days"].list({ session })) as unknown;
}

export async function loadLateDaysForAssignment(
  session: string,
  assignment: string,
): Promise<{
  users: { learner: string; days: number }[];
}> {
  return unwrap(
    await api["late-days"]["for-assignment"]({ session, assignment }),
  ) as unknown as {
    users: { learner: string; days: number }[];
  };
}

export async function loadVisibleNotes(session: string): Promise<{
  notes: {
    note: string;
    body: string;
    status: string;
    createdAt: string;
    acknowledgedAt?: string;
  }[];
}> {
  return unwrap(
    await api.students["notes/visible"]({ session }),
  ) as unknown as {
    notes: {
      note: string;
      body: string;
      status: string;
      createdAt: string;
      acknowledgedAt?: string;
    }[];
  };
}

export async function loadStaffNotes(
  session: string,
  learner: string,
): Promise<{
  notes: {
    note: string;
    author: string;
    body: string;
    visibility: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    followUpAt?: string;
    acknowledgedAt?: string;
    tags: string[];
  }[];
}> {
  return unwrap(
    await api.students["notes/list"]({ session, learner }),
  ) as unknown as {
    notes: {
      note: string;
      author: string;
      body: string;
      visibility: string;
      status: string;
      createdAt: string;
      updatedAt?: string;
      followUpAt?: string;
      acknowledgedAt?: string;
      tags: string[];
    }[];
  };
}

export async function loadStudentDetail(
  session: string,
  user: string,
): Promise<{
  detail: {
    seat: string;
    user: string;
    externalKey: string;
    email: string;
    rosterName: string;
    kind: string;
    section?: string;
    status: string;
  }[];
}> {
  return unwrap(await api.students.detail({ session, user })) as unknown as {
    detail: {
      seat: string;
      user: string;
      externalKey: string;
      email: string;
      rosterName: string;
      kind: string;
      section?: string;
      status: string;
    }[];
  };
}

export async function loadCalendarMe(
  session: string,
  start: string,
  end: string,
): Promise<{
  events: { assignment: string }[];
}> {
  return unwrap(await api.calendar.me({ session, start, end })) as unknown as {
    events: { assignment: string }[];
  };
}

export async function loadCalendarStaff(
  session: string,
  start: string,
  end: string,
  section?: string,
): Promise<{
  events: { assignment: string }[];
}> {
  return unwrap(
    await api.calendar.staff({ session, start, end, section } as {
      session: string;
      start: string;
      end: string;
      section: string;
    }),
  ) as unknown as {
    events: { assignment: string }[];
  };
}
