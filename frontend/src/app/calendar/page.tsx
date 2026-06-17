"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { ErrorState, LoadingState } from "@/components/forum/states";
import { CalendarView } from "@/components/lms/calendar-view";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function getWeekRange(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
    label: `${monday.toLocaleDateString("en", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
  };
}

export default function CalendarPage() {
  const { session } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const { start, end, label } = getWeekRange(weekOffset);

  const { data: rosterData } = useQuery<{ seat: unknown }>(
    session ? () => api.roster.me({ session }) : null,
    [session],
  );

  const {
    data: calendarData,
    loading,
    error,
    refetch,
  } = useQuery<{
    events: { assignment: string }[];
  }>(
    session && rosterData?.seat
      ? () => api.calendar.me({ session, start, end })
      : null,
    [session, rosterData, start, end],
  );

  const { data: detailsData } = useQuery<Record<string, unknown>>(
    calendarData?.events
      ? async () => {
          const map: Record<string, unknown> = {};
          await Promise.all(
            calendarData.events.map(async (e) => {
              const key = e.assignment;
              if (!map[key]) {
                const res = await api.assignments.get({ assignment: key });
                if (!("error" in res)) map[key] = res.assignment;
              }
            }),
          );
          return map;
        }
      : null,
    [calendarData],
  );

  const details = (detailsData ?? {}) as Record<
    string,
    {
      title: string;
      kind: string;
      availableAt: string;
      dueAt: string;
      closeAt?: string;
      status: string;
    }
  >;

  const events = (calendarData?.events ?? []).flatMap((e) => {
    const d = details[e.assignment];
    const name = d?.title ?? e.assignment.slice(0, 8);
    return [
      d?.availableAt
        ? {
            date: d.availableAt as unknown as string,
            label: `Available: ${name}`,
            kind: "available",
            detail: d.kind,
          }
        : null,
      d?.dueAt
        ? {
            date: d.dueAt as unknown as string,
            label: `Due: ${name}`,
            kind: "due",
            detail: d.kind,
          }
        : null,
      d?.closeAt
        ? {
            date: d.closeAt as unknown as string,
            label: `Closes: ${name}`,
            kind: "close",
            detail: d.kind,
          }
        : null,
    ].filter(Boolean) as {
      date: string;
      label: string;
      kind?: string;
      detail?: string;
    }[];
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="LMS"
        title="Calendar"
        description="Assignment availability, due dates, and close dates."
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
          Today
        </Button>
      </div>

      {loading ? (
        <LoadingState label="Loading calendar..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <CalendarView events={events} />
        </div>
      )}
    </PageContainer>
  );
}
