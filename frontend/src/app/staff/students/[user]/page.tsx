"use client";

import { use, useState } from "react";
import { ArrowLeft, BookOpen, GraduationCap, Clock, User } from "lucide-react";
import { LoadingState, ErrorState } from "@/components/forum/states";
import { PageContainer } from "@/components/forum/page";
import { StatusBadge } from "@/components/lms/status-badge";
import { StudentNotes } from "@/components/lms/student-notes";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fullTime, relativeTime } from "@/lib/format";

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = use(params);
  const { session } = useAuth();

  const { data: detailData, loading, error, refetch } = useQuery<{
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
  }>(
    session ? () => api.students.detail({ session, user }) : null,
    [session, user],
  );

  const { data: submissionsData } = useQuery<{
    submissions: { assignment: string; submission: string; submittedAt: string; number: number; status: string }[];
  }>(
    () => api.submissions["for-student"]({ submitter: user }),
    [user],
  );

  const { data: gradesData } = useQuery<{
    grades: { item: string; grade: string; score: number; maxPoints: number; status: string; label: string }[];
  }>(
    session ? () => api.grades["for-student"]({ session, learner: user }) : null,
    [session, user],
  );

  const { data: lateBalance } = useQuery<{
    balance: { granted: number; used: number; remaining: number };
  }>(
    () => api["late-days"].balance({ learner: user }),
    [user],
  );

  const { data: lateUses } = useQuery<{
    uses: { item: string; days: number; status: string; appliedAt: string }[];
  }>(
    () => api["late-days"].balance({ learner: user }).then(() => {
      return { uses: [] as { item: string; days: number; status: string; appliedAt: string }[] };
    }),
    [user],
  );

  const { data: notesData, refetch: refetchNotes } = useQuery<{
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
  }>(
    session ? () => api.students["notes/list"]({ session, learner: user }) : null,
    [session, user],
  );

  const detail = detailData?.detail ?? [];
  const seat = detail[0];
  const submissions = submissionsData?.submissions ?? [];
  const grades = gradesData?.grades ?? [];
  const notes = notesData?.notes ?? [];
  const balance = lateBalance?.balance;

  if (loading) return <PageContainer><LoadingState label="Loading student..." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message={error} onRetry={refetch} /></PageContainer>;

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href="/staff/roster" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to roster
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {seat?.rosterName ?? user}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/u/${user}`} className="flex items-center gap-1 hover:text-foreground">
            <User className="size-3.5" /> Profile
          </Link>
          {seat && (
            <>
              <span>·</span>
              <StatusBadge status={seat.kind} />
              <span>·</span>
              <StatusBadge status={seat.status} />
              <span>·</span>
              <span>{seat.email}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="size-4" /> Submissions ({submissions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              ) : (
                <div className="space-y-2">
                  {submissions.map((s) => (
                    <div key={s.submission} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">#{s.number}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{relativeTime(s.submittedAt)}</span>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="size-4" /> Grades ({grades.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {grades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No grades yet.</p>
              ) : (
                <div className="space-y-2">
                  {grades.map((g) => (
                    <div key={g.grade} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{g.label || g.item.slice(0, 8)}</span>
                        <StatusBadge status={g.status} />
                      </div>
                      <span className="tabular-nums">{g.score}/{g.maxPoints}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4" /> Late Days
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {balance ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-xs text-muted-foreground">Granted</p>
                    <p className="text-xl font-semibold">{balance.granted}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-xs text-muted-foreground">Used</p>
                    <p className="text-xl font-semibold">{balance.used}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-xl font-semibold">{balance.remaining}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No late day data.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentNotes
                learner={user}
                notes={notes}
                onUpdate={refetchNotes}
                editable
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
