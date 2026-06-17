"use client";

import {
  ArrowLeftRight,
  MoreHorizontal,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/lms/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Member {
  user: string;
  seat: string;
  kind: string;
  section?: string;
  rosterName: string;
  email: string;
  status?: string;
}

interface Section {
  section: string;
  name: string;
  location?: string;
  meetingPattern?: string;
  status: string;
}

interface RosterTableProps {
  members: Member[];
  sections: Section[];
  onUpdate: () => void;
}

export function RosterTable({ members, sections, onUpdate }: RosterTableProps) {
  const { session } = useAuth();
  const [moveSeat, setMoveSeat] = useState<{
    seat: string;
    name: string;
  } | null>(null);
  const [targetSection, setTargetSection] = useState("");

  async function dropSeat(seat: string) {
    if (!session) return;
    const result = await api.roster.drop({ session, seat });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Seat dropped");
      onUpdate();
    }
  }

  async function reinstateSeat(seat: string) {
    if (!session) return;
    const result = await api.roster.reinstate({ session, seat });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Seat reinstated");
      onUpdate();
    }
  }

  async function doMove() {
    if (!session || !moveSeat || !targetSection) return;
    const result = await api.roster["move-section"]({
      session,
      seat: moveSeat.seat,
      section: targetSection,
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Section updated");
      setMoveSeat(null);
      onUpdate();
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  No roster members.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const sec = sections.find((s) => s.section === m.section);
                return (
                  <TableRow key={m.seat}>
                    <TableCell className="font-medium text-sm">
                      {m.rosterName}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.kind} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {sec?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status ?? "ACTIVE"} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => dropSeat(m.seat)}>
                            <UserMinus className="size-4" /> Drop
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => reinstateSeat(m.seat)}
                          >
                            <UserPlus className="size-4" /> Reinstate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setMoveSeat({ seat: m.seat, name: m.rosterName })
                            }
                          >
                            <ArrowLeftRight className="size-4" /> Move Section
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!moveSeat} onOpenChange={() => setMoveSeat(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moveSeat?.name} to another section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target section</Label>
              <Select value={targetSection} onValueChange={setTargetSection}>
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections
                    .filter((s) => s.status === "ACTIVE")
                    .map((s) => (
                      <SelectItem key={s.section} value={s.section}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={doMove} disabled={!targetSection}>
              Move
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
