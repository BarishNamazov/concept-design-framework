"use client";

import { useCallback, useState } from "react";
import { ArrowUpDown, BookOpen, Filter, Search } from "lucide-react";
import { LoadingState, ErrorState, EmptyState } from "@/components/forum/states";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { StatusBadge } from "@/components/lms/status-badge";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime, fullTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  HOMEWORK: "Homework",
  PROJECT: "Project",
  READING: "Reading",
  RECITATION: "Recitation",
  ADMIN: "Admin",
};

type FilterKey = "all" | "upcoming" | "submitted" | "overdue" | "graded";

export default function AssignmentsPage() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const { data: rosterData } = useQuery<{ seat: unknown }>(
    session ? () => api.roster.me({ session }) : null,
    [session],
  );

  const { data: asgnData, loading, error, refetch } = useQuery<{
    assignments: { assignment: string; release?: string; dueOverride?: string; status: string }[];
  }>(
    session && rosterData && rosterData.seat ? () => api.assignments["for-me"]({ session }) : null,
    [session, rosterData],
  );

  const { data: gradesData } = useQuery<{
    grades: { item: string; score: number; maxPoints: number; status: string; label: string }[];
  }>(
    session && rosterData && rosterData.seat ? () => api.grades["for-me"]({ session }) : null,
    [session, rosterData],
  );

  const { data: submissionsData } = useQuery<{
    submissions: { assignment: string; submission: string; submittedAt: string; number: number; status: string }[];
  }>(
    session && asgnData ? async () => {
      if (!asgnData?.assignments) return { submissions: [] };
      const allSubs = await Promise.all(
        asgnData.assignments.map(async (a) => {
          const res = await api.submissions.latest({
            assignment: a.assignment,
            submitter: String(session),
          });
          if ("error" in res) return null;
          return { ...res.submission, assignment: a.assignment };
        }),
      );
      return { submissions: allSubs.filter(Boolean) as unknown as { assignment: string; submission: string; submittedAt: string; number: number; status: string }[] };
    } : null,
    [session, asgnData],
  );

  const { data: detailsData } = useQuery<Record<string, unknown>>(
    asgnData && asgnData.assignments ? async () => {
      const map: Record<string, unknown> = {};
      await Promise.all(
        asgnData.assignments.map(async (a) => {
          const res = await api.assignments.get({ assignment: a.assignment });
          if (!("error" in res)) map[a.assignment] = res.assignment;
        }),
      );
      return map;
    } : null,
    [asgnData],
  );

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "submitted", label: "Submitted" },
    { key: "overdue", label: "Overdue" },
    { key: "graded", label: "Graded" },
  ];

  const assignments = asgnData?.assignments ?? [];
  const details = (detailsData ?? {}) as Record<string, { title: string; kind: string; dueAt: string; status: string; availableAt: string }>;
  const submissions = submissionsData?.submissions ?? [];
  const grades = gradesData?.grades ?? [];
  const gradeMap = new Map(grades.map((g) => [g.item, g]));
  const subMap = new Map(submissions.map((s) => [s.assignment, s]));

  const now = new Date();

  const filtered = assignments.filter((a) => {
    const detail = details[a.assignment];
    const sub = subMap.get(a.assignment);
    const grade = gradeMap.get(a.assignment);

    if (search && detail) {
      const q = search.toLowerCase();
      if (!detail.title?.toLowerCase().includes(q) && !detail.kind?.toLowerCase().includes(q)) return false;
    }

    if (filter === "all") return true;
    if (filter === "submitted") return !!sub;
    if (filter === "graded") return !!grade && grade.status === "RELEASED";
    if (filter === "upcoming") {
      if (detail?.closeAt) return new Date(detail.closeAt as unknown as string) > now;
      if (detail?.dueAt) return new Date(detail.dueAt as unknown as string) > now && !sub;
      return !sub;
    }
    if (filter === "overdue") {
      if (sub) return false;
      if (detail?.closeAt) return new Date(detail.closeAt as unknown as string) < now;
      if (detail?.dueAt) return new Date(detail.dueAt as unknown as string) < now;
      return false;
    }
    return true;
  });

  if (loading) return <PageContainer><LoadingState label="Loading assignments..." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message={error} onRetry={refetch} /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="LMS"
        title="Assignments"
        description="Your current assignments, submissions, and grades."
      />

      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-48"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No assignments"
          description={filter !== "all" ? `No ${filter} assignments to show.` : "No assignments yet."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const detail = details[a.assignment];
            const sub = subMap.get(a.assignment);
            const grade = gradeMap.get(a.assignment);
            const due = detail?.dueAt as unknown as string;
            const isOverdue = due && new Date(due) < now && !sub;
            const title = detail?.title ?? a.assignment.slice(0, 8);

            return (
              <Link
                key={a.assignment}
                href={`/assignments/${a.assignment}`}
                className={cn(
                  "flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors",
                  isOverdue && "border-destructive/30 bg-destructive/5",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{title}</p>
                    {detail?.kind && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {KIND_LABELS[detail.kind] ?? detail.kind}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {due && (
                      <span title={fullTime(due)}>
                        Due: {relativeTime(due)}
                      </span>
                    )}
                    {sub && (
                      <span className="text-blue-600">
                        Submitted #{sub.number}
                      </span>
                    )}
                    {grade && grade.status === "RELEASED" && (
                      <span className="text-emerald-600">
                        Grade: {grade.score}/{grade.maxPoints}
                      </span>
                    )}
                    {grade && grade.status === "EXCUSED" && (
                      <span className="text-purple-600">Excused</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {grade && <StatusBadge status={grade.status} />}
                  {!grade && sub && <StatusBadge status="SUBMITTED" />}
                  {!grade && !sub && isOverdue && (
                    <Badge variant="destructive" className="text-xs">Overdue</Badge>
                  )}
                  {!grade && !sub && !isOverdue && (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                  <ArrowUpDown className="size-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
