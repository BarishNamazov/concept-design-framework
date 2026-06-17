"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface AssignmentFormProps {
  onSaved: () => void;
    existing?: {
    assignment: string;
    title: string;
    instructions: string;
    kind: string;
    availableAt: string;
    dueAt: string;
    closeAt?: string;
    acceptsSubmissions: boolean;
    audience?: string;
    targets?: string[];
    status: string;
  };
  onCancel?: () => void;
}

export function AssignmentForm({ onSaved, existing, onCancel }: AssignmentFormProps) {
  const { session } = useAuth();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [kind, setKind] = useState(existing?.kind ?? "HOMEWORK");
  const [availableAt, setAvailableAt] = useState(
    existing?.availableAt
      ? new Date(existing.availableAt as unknown as string).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  );
  const [dueAt, setDueAt] = useState(
    existing?.dueAt
      ? new Date(existing.dueAt as unknown as string).toISOString().slice(0, 16)
      : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  );
  const [closeAt, setCloseAt] = useState(
    existing?.closeAt
      ? new Date(existing.closeAt as unknown as string).toISOString().slice(0, 16)
      : "",
  );
  const [acceptsSubmissions, setAcceptsSubmissions] = useState(
    existing?.acceptsSubmissions ?? true,
  );
  const [audience, setAudience] = useState(existing?.audience ?? "EVERYONE");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!session) return;
    setLoading(true);

    const payload = {
      session,
      title: title.trim(),
      instructions: instructions.trim(),
      kind,
      availableAt: new Date(availableAt).toISOString(),
      dueAt: new Date(dueAt).toISOString(),
      closeAt: closeAt ? new Date(closeAt).toISOString() : undefined,
      acceptsSubmissions,
      audience,
      targets: undefined as string[] | undefined,
    };

    const result = existing
      ? await api.assignments.revise({ ...payload, assignment: existing.assignment })
      : await api.assignments["create-draft"](payload);

    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(existing ? "Assignment updated" : "Assignment created");
      onSaved();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="asgn-title">Title</Label>
        <Input
          id="asgn-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Homework 3"
          disabled={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="asgn-kind">Kind</Label>
          <Select value={kind} onValueChange={setKind} disabled={loading}>
            <SelectTrigger id="asgn-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HOMEWORK">Homework</SelectItem>
              <SelectItem value="PROJECT">Project</SelectItem>
              <SelectItem value="READING">Reading</SelectItem>
              <SelectItem value="RECITATION">Recitation</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="asgn-audience">Audience</Label>
          <Select value={audience} onValueChange={setAudience} disabled={loading}>
            <SelectTrigger id="asgn-audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EVERYONE">Everyone</SelectItem>
              <SelectItem value="TARGETS">Specific targets</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="asgn-available">Available at</Label>
          <Input
            id="asgn-available"
            type="datetime-local"
            value={availableAt}
            onChange={(e) => setAvailableAt(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asgn-due">Due at</Label>
          <Input
            id="asgn-due"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asgn-close">
            Close at{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="asgn-close"
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="asgn-accepts"
          checked={acceptsSubmissions}
          onChange={(e) => setAcceptsSubmissions(e.target.checked)}
          disabled={loading}
          className="rounded"
        />
        <Label htmlFor="asgn-accepts" className="cursor-pointer">
          Accepts submissions
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="asgn-instructions">Instructions</Label>
        <Textarea
          id="asgn-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={6}
          placeholder="Assignment instructions (Markdown supported)..."
          disabled={loading}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={loading || !title.trim()}>
          {existing ? "Save Changes" : "Create Draft"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
