"use client";

import { CheckCircle, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fullTime, relativeTime } from "@/lib/format";

export default function NotesPage() {
  const { session } = useAuth();

  const { data: rosterData } = useQuery<{ seat: unknown }>(
    session ? () => api.roster.me({ session }) : null,
    [session],
  );

  const {
    data: notesData,
    loading,
    error,
    refetch,
  } = useQuery<{
    notes: {
      note: string;
      author: string;
      body: string;
      status: string;
      createdAt: string;
      updatedAt?: string;
      followUpAt?: string;
      acknowledgedAt?: string;
      tags: string[];
    }[];
  }>(
    session && rosterData?.seat
      ? () => api.students["notes/visible"]({ session })
      : null,
    [session, rosterData],
  );

  if (!session)
    return (
      <PageContainer>
        <PageHeader eyebrow="LMS" title="Notes" />
        <EmptyState
          icon={StickyNote}
          title="Sign in required"
          description="Sign in to view your notes."
        />
      </PageContainer>
    );

  if (loading)
    return (
      <PageContainer>
        <LoadingState label="Loading notes..." />
      </PageContainer>
    );
  if (error)
    return (
      <PageContainer>
        <ErrorState message={error} onRetry={refetch} />
      </PageContainer>
    );

  const notes = notesData?.notes ?? [];
  const active = notes.filter(
    (n) => n.status === "OPEN" || n.status === "RESOLVED",
  );

  async function acknowledge(note: string) {
    if (!session) return;
    const result = await api.students["notes/acknowledge"]({ session, note });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Note acknowledged");
      refetch();
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="LMS"
        title="Notes"
        description="Notes from your instructors that are visible to you."
      />

      {active.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes"
          description="You have no visible notes from staff."
        />
      ) : (
        <div className="space-y-3">
          {active.map((note) => (
            <Card key={note.note}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {note.status === "OPEN" ? (
                      <span className="flex size-2 rounded-full bg-orange-500" />
                    ) : (
                      <span className="flex size-2 rounded-full bg-green-500" />
                    )}
                    {note.status === "OPEN" ? "Note" : "Resolved"}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {fullTime(note.createdAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {note.followUpAt && (
                  <p className="text-xs text-muted-foreground">
                    Follow-up by: {fullTime(note.followUpAt)}
                  </p>
                )}
                {!note.acknowledgedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => acknowledge(note.note)}
                    className="gap-1.5"
                  >
                    <CheckCircle className="size-4" /> Acknowledge
                  </Button>
                )}
                {note.acknowledgedAt && (
                  <p className="text-xs text-muted-foreground">
                    Acknowledged {relativeTime(note.acknowledgedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
