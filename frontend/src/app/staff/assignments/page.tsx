"use client";

import { useState } from "react";
import { Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { LoadingState, ErrorState, EmptyState } from "@/components/forum/states";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { AssignmentForm } from "@/components/lms/assignment-form";
import { StatusBadge } from "@/components/lms/status-badge";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime, fullTime } from "@/lib/format";

const KIND_LABELS: Record<string, string> = {
  HOMEWORK: "Homework",
  PROJECT: "Project",
  READING: "Reading",
  RECITATION: "Recitation",
  ADMIN: "Admin",
};

export default function StaffAssignmentsPage() {
  const { session } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const { data: rosterData } = useQuery<{
    dashboard: { user: string; seat: string; kind: string }[];
  }>(
    session ? () => api.lms["staff-dashboard"]({ session }) : null,
    [session],
  );

  const { data: asgnData, loading, error, refetch } = useQuery<{
    assignments: { assignment: string; title: string; kind: string; status: string; dueAt: string; availableAt: string; audience: string }[];
  }>(
    async () => {
      return { assignments: [] as { assignment: string; title: string; kind: string; status: string; dueAt: string; availableAt: string; audience: string }[] };
    },
    [],
  );

  const filters = [
    { key: "all", label: "All" },
    { key: "DRAFT", label: "Draft" },
    { key: "PUBLISHED", label: "Published" },
    { key: "ARCHIVED", label: "Archived" },
  ];

  const assignments = asgnData?.assignments ?? [];
  const filtered = filter === "all"
    ? assignments
    : assignments.filter((a) => a.status === filter);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="Assignment Manager"
        description="Create, edit, publish, and archive assignments."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1" /> New Assignment
          </Button>
        }
      />

      <div className="mb-6 flex items-center gap-2">
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
      </div>

      {loading ? (
        <LoadingState label="Loading assignments..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No assignments"
          description="Create your first assignment to get started."
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="size-4 mr-1" /> Create Assignment
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Link
              key={a.assignment}
              href={`/staff/assignments/${a.assignment}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{a.title}</p>
                  <span className="text-xs text-muted-foreground capitalize">
                    {KIND_LABELS[a.kind] ?? a.kind}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Due: {fullTime(a.dueAt)} | Audience: {a.audience.toLowerCase()}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Assignment</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            onSaved={() => {
              setShowCreate(false);
              refetch();
            }}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
