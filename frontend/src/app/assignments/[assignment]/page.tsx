"use client";

import { ArrowLeft, Clock, GraduationCap, Send } from "lucide-react";
import { use, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/forum/page";
import { ErrorState, LoadingState } from "@/components/forum/states";
import { Link } from "@/components/link";
import { LateDayControls } from "@/components/lms/late-day-controls";
import { StatusBadge } from "@/components/lms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fullTime, relativeTime } from "@/lib/format";
import {
  loadAssignmentDetail,
  loadGradesForMe,
  loadLateDayBalance,
  loadSubmissionAttempts,
  loadSubmissionLatest,
} from "@/lib/lms";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  HOMEWORK: "Homework",
  PROJECT: "Project",
  READING: "Reading",
  RECITATION: "Recitation",
  ADMIN: "Admin",
};

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ assignment: string }>;
}) {
  const { assignment } = use(params);
  const { session, me } = useAuth();

  const {
    data: asgnData,
    loading,
    error,
    refetch,
  } = useQuery<{
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
  }>(() => loadAssignmentDetail(assignment), [assignment]);

  const { data: subData, refetch: refetchSub } = useQuery<{
    submission: {
      submission: string;
      artifacts: string[];
      submittedAt: string;
      number: number;
      status: string;
    } | null;
  }>(
    me && asgnData && !("error" in asgnData)
      ? () => loadSubmissionLatest(assignment, String(me.user))
      : null,
    [assignment, me, asgnData],
  );

  const { data: attemptsData, refetch: refetchAttempts } = useQuery<{
    attempts: {
      submission: string;
      artifacts: string[];
      submittedAt: string;
      number: number;
      status: string;
    }[];
  }>(
    me && asgnData && !("error" in asgnData)
      ? () => loadSubmissionAttempts(assignment, String(me.user))
      : null,
    [assignment, me, asgnData],
  );

  const { data: lateBalance, refetch: refetchLate } = useQuery<{
    balance: { granted: number; used: number; remaining: number };
  }>(me ? () => loadLateDayBalance(String(me.user)) : null, [me]);

  const { data: lateUseData, refetch: refetchLateUse } = useQuery<{
    days: number;
  }>(
    me
      ? async () => {
          const r = await loadLateDayBalance(String(me.user));
          if ("error" in r) return { days: 0 };
          return { days: 0 };
        }
      : null,
    [me, assignment],
  );

  const { data: gradesData, refetch: refetchGrades } = useQuery<{
    grades: {
      item: string;
      grade: string;
      score: number;
      maxPoints: number;
      status: string;
      label: string;
      feedback?: string;
    }[];
  }>(me && session ? () => loadGradesForMe(session) : null, [me, session]);

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const detail =
    asgnData?.assignment && !("error" in asgnData) ? asgnData.assignment : null;
  const latest = subData?.submission;
  const attempts = attemptsData?.attempts ?? [];
  const balance = lateBalance?.balance ?? null;
  const myGrade = gradesData?.grades?.find((g) => g.item === assignment);

  async function submit() {
    if (!session || !content.trim()) return;
    setSubmitting(true);
    const result = await api.assignments.submit({
      session,
      assignment,
      content: content.trim(),
    });
    setSubmitting(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Submitted!");
      setContent("");
      refetchSub();
      refetchAttempts();
    }
  }

  const handleUpdate = () => {
    refetchSub();
    refetchAttempts();
    refetchLate();
    refetchLateUse();
    refetchGrades();
  };

  if (loading)
    return (
      <PageContainer>
        <LoadingState label="Loading assignment..." />
      </PageContainer>
    );
  if (error)
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={refetch} />
      </PageContainer>
    );
  if (!detail)
    return (
      <PageContainer>
        <ErrorState message="Assignment not found" />
      </PageContainer>
    );

  const due = detail.dueAt as unknown as string;
  const now = new Date();
  const isOverdue = new Date(due) < now;
  const isPastClose = detail.closeAt
    ? new Date(detail.closeAt as unknown as string) < now
    : false;
  const canSubmit =
    detail.acceptsSubmissions && !isPastClose && detail.status === "PUBLISHED";

  return (
    <PageContainer>
      <div className="mb-4">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to assignments
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {detail.title}
            </h1>
            <Badge variant="secondary">
              {KIND_LABELS[detail.kind] ?? detail.kind}
            </Badge>
            <StatusBadge status={detail.status} />
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/grades">
            <GraduationCap className="size-4 mr-1" /> View grades
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {detail.instructions && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-sm">
                  {detail.instructions}
                </div>
              </CardContent>
            </Card>
          )}

          {canSubmit && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {latest
                    ? `Resubmit (Attempt #${latest.number + 1})`
                    : "Submit"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your submission..."
                  rows={8}
                  disabled={submitting}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={submit}
                    disabled={submitting || !content.trim()}
                    className="gap-1.5"
                  >
                    <Send className="size-4" />
                    {submitting ? "Submitting..." : "Submit"}
                  </Button>
                  {latest && (
                    <p className="text-xs text-muted-foreground">
                      Last submitted {relativeTime(latest.submittedAt)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {attempts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Attempts History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...attempts].reverse().map((a) => (
                    <div
                      key={a.submission}
                      className={cn(
                        "flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm",
                        a.status === "WITHDRAWN" && "opacity-60",
                      )}
                    >
                      <div>
                        <span className="font-medium">Attempt #{a.number}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {fullTime(a.submittedAt)}
                        </span>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {myGrade &&
            (myGrade.status === "RELEASED" || myGrade.status === "EXCUSED") && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Grade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={myGrade.status} />
                    {myGrade.status !== "EXCUSED" && (
                      <span className="text-2xl font-semibold">
                        {myGrade.score} / {myGrade.maxPoints}
                      </span>
                    )}
                  </div>
                  {myGrade.feedback && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {myGrade.feedback}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4" /> Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Available</p>
                <p className="font-medium">{fullTime(detail.availableAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due</p>
                <p
                  className={cn("font-medium", isOverdue && "text-destructive")}
                >
                  {fullTime(detail.dueAt)}
                </p>
              </div>
              {detail.closeAt && (
                <div>
                  <p className="text-muted-foreground">Closes</p>
                  <p className="font-medium">{fullTime(detail.closeAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <LateDayControls
            assignment={assignment}
            balance={balance}
            appliedDays={lateUseData?.days ?? 0}
            onUpdate={handleUpdate}
          />

          {latest && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Latest:</span> Attempt
                  #{latest.number}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <StatusBadge status={latest.status} />
                </p>
                <p>
                  <span className="text-muted-foreground">Submitted:</span>{" "}
                  {fullTime(latest.submittedAt)}
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}
