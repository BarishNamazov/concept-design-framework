"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Report a post for a policy violation (flags concept). */
export function FlagDialog({
  target,
  open,
  onOpenChange,
}: {
  target: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { session } = useAuth();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!session || !reason.trim()) return;
    setBusy(true);
    const result = await api.flags.raise({
      session,
      target,
      reason: reason.trim(),
    });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Thanks — a moderator will review this.");
      setReason("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Flag className="size-4" />
            Report this post
          </DialogTitle>
          <DialogDescription>
            Tell the moderators what&apos;s wrong. Reports are private.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you reporting this?"
          rows={4}
          autoFocus
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !reason.trim()}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
