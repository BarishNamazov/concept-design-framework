"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime, fullTime } from "@/lib/format";

interface CalendarEvent {
  date: string;
  label: string;
  kind?: string;
  detail?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  className?: string;
}

export function CalendarView({ events, className }: CalendarViewProps) {
  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground", className)}>
        <CalendarDays className="size-6" />
        <p className="text-sm">No events in this range.</p>
      </div>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <div className={cn("divide-y divide-border", className)}>
      {sorted.map((event, i) => {
        const date = new Date(event.date);
        const isPast = date < new Date();
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 px-3 py-3 transition-colors",
              isPast ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-xs font-medium">
              {date.toLocaleDateString("en", { month: "short", day: "numeric" })}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{event.label}</p>
              {event.detail && (
                <p className="text-xs text-muted-foreground truncate">{event.detail}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5" title={fullTime(event.date)}>
                {relativeTime(event.date)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
