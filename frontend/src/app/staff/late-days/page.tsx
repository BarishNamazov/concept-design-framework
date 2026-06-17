"use client";

import { Clock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { EmptyState } from "@/components/forum/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LateDaysAdminPage() {
  const { session } = useAuth();

  const { data: rosterData } = useQuery<{
    dashboard: {
      user: string;
      seat: string;
      kind: string;
      rosterName: string;
    }[];
  }>(session ? () => api.lms["staff-dashboard"]({ session }) : null, [session]);

  const [grantDialog, setGrantDialog] = useState<{
    learner: string;
    name: string;
  } | null>(null);
  const [grantDays, setGrantDays] = useState(1);
  const [grantReason, setGrantReason] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);

  const { data: balances, refetch: refetchBalances } = useQuery<
    Record<string, { granted: number; used: number; remaining: number }>
  >(
    rosterData?.dashboard
      ? async () => {
          const map: Record<
            string,
            { granted: number; used: number; remaining: number }
          > = {};
          const students = rosterData.dashboard.filter(
            (m) => m.kind === "STUDENT",
          );
          await Promise.all(
            students.map(async (s) => {
              const r = await api["late-days"].balance({ learner: s.user });
              if (!("error" in r)) map[s.user] = r.balance;
            }),
          );
          return map;
        }
      : null,
    [rosterData],
  );

  async function doGrant() {
    if (!session || !grantDialog) return;
    setGrantLoading(true);
    const result = await api["late-days"].grant({
      session,
      learner: grantDialog.learner,
      days: grantDays,
      reason: grantReason,
    });
    setGrantLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`Granted ${grantDays} late day(s) to ${grantDialog.name}`);
      setGrantDialog(null);
      setGrantReason("");
      setGrantDays(1);
      refetchBalances();
    }
  }

  const students = (rosterData?.dashboard ?? []).filter(
    (m) => m.kind === "STUDENT",
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="Late Days Admin"
        description="View balances, grant extra days, and audit usage."
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No students"
          description="No students with late day data."
        />
      ) : (
        <div className="space-y-2">
          {students.map((s) => {
            const b = balances?.[s.user];
            return (
              <div
                key={s.user}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{s.rosterName}</p>
                  <p className="text-xs text-muted-foreground">{s.user}</p>
                </div>
                <div className="flex items-center gap-4">
                  {b ? (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {b.remaining}
                        </span>{" "}
                        remaining
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {b.used}
                        </span>{" "}
                        used
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {b.granted}
                        </span>{" "}
                        granted
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Loading...
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setGrantDialog({ learner: s.user, name: s.rosterName })
                    }
                  >
                    <Plus className="size-4 mr-1" /> Grant days
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!grantDialog} onOpenChange={() => setGrantDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Late Days to {grantDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grant-days">Days</Label>
              <Input
                id="grant-days"
                type="number"
                min={1}
                value={grantDays}
                onChange={(e) => setGrantDays(Number(e.target.value))}
                disabled={grantLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-reason">Reason</Label>
              <Textarea
                id="grant-reason"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="e.g. Extension for illness..."
                rows={3}
                disabled={grantLoading}
              />
            </div>
            <Button onClick={doGrant} disabled={grantLoading || grantDays < 1}>
              Grant {grantDays} day(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
