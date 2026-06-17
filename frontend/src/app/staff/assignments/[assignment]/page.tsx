"use client";

import { use, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Archive, Send } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState } from "@/components/forum/states";
import { PageContainer } from "@/components/forum/page";
import { AssignmentForm } from "@/components/lms/assignment-form";
import { GradeInput } from "@/components/lms/grade-input";
import { StatusBadge } from "@/components/lms/status-badge";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime, fullTime } from "@/lib/format";

export default function StaffAssignmentDetailPage({
  params,
}: {
  params: Promise<{ assignment: string }>;
}) {
  const { assignment } = use(params);
  const { session } = useAuth();
  const [editing, setEditing] = useState(false);
  const [gradingUser, setGradingUser] = useState<string | null>(null);

  const { data: asgnData, loading, error, refetch } = useQuery<{
    summary: {
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
  }>(
    session ? () => api.assignments["staff-summary"]({ session, assignment }) : null,
    [session, assignment],
  );

  const { data: subsData, refetch: refetchSubs } = useQuery<{
    submissions: { submitter: string; submission: string; submittedAt: string; number: number; status: string }[];
  }>(
    session ? () => api.submissions["for-assignment"]({ session, assignment }) : null,
    [session, assignment],
  );

  const { data: gradesData, refetch: refetchGrades } = useQuery<{
    grades: { learner: string; grade: string; score: number; status: string }[];
  }>(
    session ? () => api.grades["for-item"]({ session, item: assignment }) : null,
    [session, assignment],
  );

  const { data: lateData, refetch: refetchLate } = useQuery<{
    users: { learner: string; days: number }[];
  }>(
    session ? () => api["late-days"]["for-assignment"]({ session, assignment }) : null,
    [session, assignment],
  );

  const detail = asgnData?.summary;
  const submissions = subsData?.submissions ?? [];
  const grades = gradesData?.grades ?? [];
  const lateUsers = lateData?.users ?? [];

  const submittedIds = new Set(submissions.map((s) => s.submitter));
  const gradeMap = new Map(grades.map((g) => [g.learner, g]));
  const lateMap = new Map(lateUsers.map((u) => [u.learner, u.days]));

  async function publish() {
    if (!session) return;
    const result = await api.assignments.publish({ session, assignment });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Assignment published!");
      refetch();
    }
  }

  async function archive() {
    if (!session) return;
    const result = await api.assignments.archive({ session, assignment });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Assignment archived");
      refetch();
    }
  }

  async function releaseAll() {
    if (!session) return;
    const result = await api.grades["release-item"]({ session, item: assignment });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("All grades released");
      refetchGrades();
    }
  }

  if (loading) return <PageContainer><LoadingState label="Loading assignment..." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message={error} onRetry={refetch} /></PageContainer>;
  if (!detail) return <PageContainer><ErrorState message="Assignment not found" /></PageContainer>;

  const totalAssigned = 0;
  const totalSubmitted = submittedIds.size;
  const totalMissing = Math.max(0, totalAssigned - totalSubmitted);

  return (
    <PageContainer>
      <div className="mb-4">
        <Link href="/staff/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to assignments
        </Link>
      </div>

      {editing ? (
        <div className="mb-6">
          <AssignmentForm
            existing={detail}
            onSaved={() => {
              setEditing(false);
              refetch();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-display text-3xl font-semibold tracking-tight">{detail.title}</h1>
                <StatusBadge status={detail.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.kind} · Due: {fullTime(detail.dueAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {detail.status === "DRAFT" && (
                <Button size="sm" variant="outline" className="text-emerald-600" onClick={publish}>
                  <Eye className="size-4 mr-1" /> Publish
                </Button>
              )}
              {detail.status !== "ARCHIVED" && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={archive}>
                  <Archive className="size-4 mr-1" /> Archive
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Assigned</p>
            <p className="text-2xl font-semibold">{totalAssigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Submitted</p>
            <p className="text-2xl font-semibold">{totalSubmitted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Missing</p>
            <p className="text-2xl font-semibold">{totalMissing}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Grades</CardTitle>
            <Button size="sm" variant="outline" onClick={releaseAll}>
              <Send className="size-4 mr-1" /> Release All
            </Button>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="space-y-3">
                {submissions.map((s) => {
                  const grade = gradeMap.get(s.submitter);
                  const lateDays = lateMap.get(s.submitter) ?? 0;
                  const isGrading = gradingUser === s.submitter;

                  return (
                    <div key={s.submission} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium">{s.submitter}</p>
                          <p className="text-xs text-muted-foreground">
                            Attempt #{s.number} · {relativeTime(s.submittedAt)}
                            {lateDays > 0 && <Badge variant="secondary" className="ml-2 text-xs">{lateDays} late day(s)</Badge>}
                          </p>
                        </div>
                        {grade && (
                          <div className="flex items-center gap-2">
                            <StatusBadge status={grade.status} />
                            <span className="text-sm font-mono">{grade.score}</span>
                          </div>
                        )}
                      </div>
                      {isGrading ? (
                        <GradeInput
                          learner={s.submitter}
                          item={assignment}
                          currentScore={grade?.score}
                          onSaved={() => {
                            setGradingUser(null);
                            refetchGrades();
                          }}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => setGradingUser(s.submitter)}
                        >
                          {grade ? "Update grade" : "Grade"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {detail.instructions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{detail.instructions}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
