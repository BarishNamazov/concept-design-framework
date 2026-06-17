"use client";

import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "@/components/forum/states";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { GradeInput } from "@/components/lms/grade-input";
import { StatusBadge } from "@/components/lms/status-badge";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function GradebookPage() {
  const { session } = useAuth();
  const [grading, setGrading] = useState<{ learner: string; item: string } | null>(null);

  const { data: gradebookData, loading, error, refetch } = useQuery<{
    learners: { user: string; seat: string; section?: string; rosterName: string; email: string }[];
  }>(
    session ? () => api.grades.gradebook({ session }) : null,
    [session],
  );

  const { data: rosterData } = useQuery<{
    dashboard: { user: string; seat: string; kind: string }[];
  }>(
    session ? () => api.lms["staff-dashboard"]({ session }) : null,
    [session],
  );

  const { data: gradesByStudent, refetch: refetchGrades } = useQuery<
    Record<string, { item: string; grade: string; score: number; maxPoints: number; status: string; label: string }[]>
  >(
    gradebookData && gradebookData.learners.length > 0
      ? async () => {
          const map: Record<string, { item: string; grade: string; score: number; maxPoints: number; status: string; label: string }[]> = {};
          await Promise.all(
            gradebookData.learners.map(async (l) => {
              const r = await api.grades["for-student"]({ session: session!, learner: l.user });
              if (!("error" in r)) map[l.user] = r.grades;
            }),
          );
          return map;
        }
      : null,
    [session, gradebookData],
  );

  const learners = gradebookData?.learners ?? [];
  const grades = gradesByStudent ?? {};

  const allItems = new Set<string>();
  Object.values(grades).forEach((glist) => {
    glist.forEach((g) => allItems.add(g.item));
  });
  const items = [...allItems];

  if (loading) return <PageContainer><LoadingState label="Loading gradebook..." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message={error} onRetry={refetch} /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="Gradebook"
        description="Matrix view of all students and their grade items."
        actions={
          <Button variant="outline" size="sm">
            <Download className="size-4 mr-1" /> Export CSV
          </Button>
        }
      />

      {learners.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No students"
          description="No students with grades to display."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Student</TableHead>
                {items.map((item) => (
                  <TableHead key={item} className="text-xs text-center w-24">
                    {item.slice(0, 6)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {learners.map((l) => {
                const gList = grades[l.user] ?? [];
                const gMap = new Map(gList.map((g) => [g.item, g]));
                return (
                  <TableRow key={l.user}>
                    <TableCell className="sticky left-0 bg-card">
                      <Link href={`/staff/students/${l.user}`} className="text-sm font-medium hover:text-primary">
                        {l.rosterName}
                      </Link>
                    </TableCell>
                    {items.map((item) => {
                      const g = gMap.get(item);
                      if (!g) return <TableCell key={item} className="text-center text-xs text-muted-foreground">—</TableCell>;
                      return (
                        <TableCell key={item} className="text-center">
                          <button
                            type="button"
                            className="text-xs hover:underline"
                            onClick={() => setGrading({ learner: l.user, item })}
                          >
                            <span
                              className={
                                g.status === "RELEASED"
                                  ? "text-emerald-600 font-medium"
                                  : g.status === "DRAFT"
                                    ? "text-yellow-600"
                                    : g.status === "EXCUSED"
                                      ? "text-purple-600"
                                      : "text-muted-foreground"
                              }
                            >
                              {g.status === "EXCUSED" ? "EX" : `${g.score}/${g.maxPoints}`}
                            </span>
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!grading} onOpenChange={() => setGrading(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grade: {grading?.learner} — {grading?.item}</DialogTitle>
          </DialogHeader>
          {grading && (
            <GradeInput
              learner={grading.learner}
              item={grading.item}
              currentScore={grades[grading.learner]?.find((g) => g.item === grading.item)?.score}
              onSaved={() => {
                setGrading(null);
                refetchGrades();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
