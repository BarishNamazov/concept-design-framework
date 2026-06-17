"use client";

import { AlertTriangle, BookOpen, Clock, FileText, Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { ErrorState, LoadingState } from "@/components/forum/states";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function StaffDashboardPage() {
  const { session, can } = useAuth();

  const {
    data: dashData,
    loading,
    error,
    refetch,
  } = useQuery<{
    dashboard: {
      user: string;
      seat: string;
      kind: string;
      section?: string;
      rosterName: string;
      email: string;
    }[];
  }>(session ? () => api.lms["staff-dashboard"]({ session }) : null, [session]);

  if (loading)
    return (
      <PageContainer>
        <LoadingState label="Loading staff dashboard..." />
      </PageContainer>
    );
  if (error)
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={refetch} />
      </PageContainer>
    );

  const members = dashData?.dashboard ?? [];
  const students = members.filter((m) => m.kind === "STUDENT");
  const staff = members.filter((m) => m.kind === "STAFF");
  const auditors = members.filter((m) => m.kind === "AUDITOR");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="LMS Dashboard"
        description="Overview of your course roster, assignments, and tasks."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Link
          href="/staff/roster"
          className="rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Users className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Students</p>
          </div>
          <p className="text-3xl font-semibold">{students.length}</p>
          <p className="text-xs text-muted-foreground mt-1">enrolled</p>
        </Link>

        <Link
          href="/staff/assignments"
          className="rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Assignments</p>
          </div>
          <p className="text-3xl font-semibold">—</p>
          <p className="text-xs text-muted-foreground mt-1">manage</p>
        </Link>

        <Link
          href="/staff/gradebook"
          className="rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <FileText className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Gradebook</p>
          </div>
          <p className="text-3xl font-semibold">—</p>
          <p className="text-xs text-muted-foreground mt-1">view</p>
        </Link>

        <Link
          href="/staff/late-days"
          className="rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Late Days</p>
          </div>
          <p className="text-3xl font-semibold">—</p>
          <p className="text-xs text-muted-foreground mt-1">manage</p>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" /> Roster Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Students</span>
                <Badge variant="secondary">{students.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Staff</span>
                <Badge variant="secondary">{staff.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Auditors</span>
                <Badge variant="secondary">{auditors.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Total active</span>
                <Badge>{members.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="size-4" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/staff/assignments"
              className="flex items-center gap-2 text-sm hover:text-primary"
            >
              <BookOpen className="size-4" /> Create / manage assignments
            </Link>
            <Link
              href="/staff/roster"
              className="flex items-center gap-2 text-sm hover:text-primary"
            >
              <Users className="size-4" /> Manage roster & sections
            </Link>
            <Link
              href="/staff/gradebook"
              className="flex items-center gap-2 text-sm hover:text-primary"
            >
              <FileText className="size-4" /> Open gradebook
            </Link>
            <Link
              href="/staff/late-days"
              className="flex items-center gap-2 text-sm hover:text-primary"
            >
              <Clock className="size-4" /> Grant late days
            </Link>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
