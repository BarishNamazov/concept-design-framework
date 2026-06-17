"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface BalanceInfo {
  granted: number;
  used: number;
  remaining: number;
}

interface LateDayControlsProps {
  assignment: string;
  balance: BalanceInfo | null;
  appliedDays: number;
  onUpdate: () => void;
  className?: string;
}

export function LateDayControls({
  assignment,
  balance,
  appliedDays,
  onUpdate,
  className,
}: LateDayControlsProps) {
  const { session } = useAuth();
  const [days, setDays] = useState(appliedDays > 0 ? appliedDays : 1);
  const [loading, setLoading] = useState(false);

  async function apply() {
    if (!session || days <= 0) return;
    setLoading(true);
    const result = await api["late-days"].apply({ session, assignment, days });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`${days} late day(s) applied`);
      onUpdate();
    }
  }

  async function change() {
    if (!session || days <= 0) return;
    setLoading(true);
    const result = await api["late-days"].change({ session, assignment, days });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`Changed to ${days} late day(s)`);
      onUpdate();
    }
  }

  async function cancel() {
    if (!session) return;
    setLoading(true);
    const result = await api["late-days"].cancel({ session, assignment });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Late days canceled");
      onUpdate();
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Late Days</p>
        {balance && (
          <p className="text-sm text-muted-foreground">
            Balance: {balance.remaining} remaining of {balance.granted}
          </p>
        )}
      </div>

      {appliedDays > 0 ? (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">{appliedDays} day(s)</span> applied to
            this assignment
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={balance ? Math.min(balance.remaining + appliedDays, 7) : 7}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-20"
              disabled={loading}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={change}
              disabled={loading}
            >
              Change
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={cancel}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={balance?.remaining ?? 5}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-20"
            disabled={loading}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={apply}
            disabled={loading || !balance || balance.remaining < 1}
          >
            Apply Late Days
          </Button>
        </div>
      )}
    </div>
  );
}
