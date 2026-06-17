"use client";

import { Archive, CheckCircle, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Note {
  note: string;
  author: string;
  learner: string;
  body: string;
  visibility: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  followUpAt?: string;
  acknowledgedAt?: string;
  tags: string[];
}

interface StudentNotesProps {
  learner: string;
  notes: Note[];
  onUpdate: () => void;
  editable?: boolean;
  className?: string;
}

export function StudentNotes({
  learner,
  notes,
  onUpdate,
  editable = false,
  className,
}: StudentNotesProps) {
  const { session } = useAuth();

  return (
    <div className={cn("space-y-3", className)}>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        notes.map((note) => (
          <NoteCard
            key={note.note}
            note={note}
            onUpdate={onUpdate}
            editable={editable}
          />
        ))
      )}
      {editable && <WriteNoteForm learner={learner} onSaved={onUpdate} />}
    </div>
  );
}

function NoteCard({
  note,
  onUpdate,
  editable,
}: {
  note: Note;
  onUpdate: () => void;
  editable: boolean;
}) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  async function action(fn: () => Promise<unknown>) {
    if (!session) return;
    setLoading(true);
    const result = await fn();
    setLoading(false);
    if (typeof result === "object" && result !== null && "error" in result) {
      toast.error((result as { error: string }).error);
    } else {
      toast.success("Updated");
      onUpdate();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              note.status === "OPEN"
                ? "bg-orange-100 text-orange-800 text-xs"
                : note.status === "RESOLVED"
                  ? "bg-green-100 text-green-800 text-xs"
                  : "bg-gray-100 text-gray-600 text-xs"
            }
          >
            {note.status.toLowerCase()}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {note.visibility === "STAFF_ONLY" ? "staff-only" : "visible"}
          </Badge>
          {note.acknowledgedAt && (
            <Badge variant="outline" className="text-xs text-green-700">
              acknowledged
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {relativeTime(note.createdAt)}
        </span>
      </div>

      <p className="text-sm whitespace-pre-wrap">{note.body}</p>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {note.followUpAt && (
        <p className="text-xs text-muted-foreground">
          Follow-up:{" "}
          {new Date(note.followUpAt as unknown as string).toLocaleDateString()}
        </p>
      )}

      {editable && (
        <div className="flex gap-1.5 pt-1">
          {note.status === "OPEN" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                action(() =>
                  api.students["notes/resolve"]({
                    session: session!,
                    note: note.note,
                  }),
                )
              }
              disabled={loading}
            >
              <CheckCircle className="size-3 mr-1" /> Resolve
            </Button>
          )}
          {note.status === "RESOLVED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                action(() =>
                  api.students["notes/archive"]({
                    session: session!,
                    note: note.note,
                  }),
                )
              }
              disabled={loading}
            >
              <Archive className="size-3 mr-1" /> Archive
            </Button>
          )}
          {(note.status === "RESOLVED" || note.status === "ARCHIVED") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                action(async () => {
                  const { error } = await import("@/lib/api");
                  return { error: "restore not yet wired" };
                })
              }
              disabled
            >
              <RefreshCw className="size-3 mr-1" /> Restore
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function WriteNoteForm({
  learner,
  onSaved,
}: {
  learner: string;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<
    "STAFF_ONLY" | "LEARNER_VISIBLE"
  >("STAFF_ONLY");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function write() {
    if (!session || !body.trim()) return;
    setLoading(true);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const result = await api.students["notes/write"]({
      session,
      learner,
      body: body.trim(),
      visibility,
      tags: tagList,
    });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Note written");
      setBody("");
      setTags("");
      setOpen(false);
      onSaved();
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-3 mr-1" /> Write a note
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note about this student..."
        rows={3}
        disabled={loading}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          disabled={loading}
        >
          <option value="STAFF_ONLY">Staff only</option>
          <option value="LEARNER_VISIBLE">Learner visible</option>
        </select>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-xs"
          disabled={loading}
        />
        <Button size="sm" onClick={write} disabled={loading || !body.trim()}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
