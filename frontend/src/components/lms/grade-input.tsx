"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface GradeInputProps {
  learner: string;
  item: string;
  currentScore?: number;
  currentFeedback?: string;
  onSaved: () => void;
  className?: string;
}

export function GradeInput({
  learner,
  item,
  currentScore,
  currentFeedback,
  onSaved,
  className,
}: GradeInputProps) {
  const { session } = useAuth();
  const [score, setScore] = useState(currentScore ?? 0);
  const [feedback, setFeedback] = useState(currentFeedback ?? "");
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!session) return;
    setLoading(true);
    const result = await api.grades.record({
      session,
      learner,
      item,
      score: score as unknown as string,
      feedback,
      evidence: "",
    } as never);
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Grade saved");
      onSaved();
    }
  }

  async function release() {
    if (!session) return;
    setLoading(true);
    const result = await api.grades.release({ session, learner, item });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Grade released");
      onSaved();
    }
  }

  async function excuse() {
    if (!session) return;
    const excuseFeedback = feedback || "Excused";
    setLoading(true);
    const result = await api.grades.excuse({
      session,
      learner,
      item,
      feedback: excuseFeedback,
    });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Learner excused");
      onSaved();
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <Label htmlFor={`grade-score-${learner}-${item}`}>Score</Label>
        <Input
          id={`grade-score-${learner}-${item}`}
          type="number"
          min={0}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          disabled={loading}
          className="w-32"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`grade-feedback-${learner}-${item}`}>Feedback</Label>
        <Textarea
          id={`grade-feedback-${learner}-${item}`}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={loading}
          rows={3}
          placeholder="Optional feedback for the learner..."
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={loading}>
          Save Draft
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={release}
          disabled={loading}
        >
          Release
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={excuse}
          disabled={loading}
        >
          Excuse
        </Button>
      </div>
    </div>
  );
}
