"use client";

import { Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { CsvImport } from "@/components/lms/csv-import";
import { RosterTable } from "@/components/lms/roster-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadRosterList, loadSections } from "@/lib/lms";

function ClassConfig() {
  const { session } = useAuth();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [loading, setLoading] = useState(false);

  async function configure() {
    if (!session) return;
    setLoading(true);
    const result = await api.roster["configure-class"]({
      session,
      code,
      title,
      term,
      timezone,
    });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else toast.success("Class configured");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="size-4" /> Class Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cc-code">Course Code</Label>
            <Input
              id="cc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CS101"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-title">Title</Label>
            <Input
              id="cc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Intro to CS"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-term">Term</Label>
            <Input
              id="cc-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Fall 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-tz">Timezone</Label>
            <Input
              id="cc-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
            />
          </div>
        </div>
        <Button
          onClick={configure}
          disabled={loading || !code || !title || !term}
        >
          Configure Class
        </Button>
      </CardContent>
    </Card>
  );
}

function SectionManager() {
  const { session } = useAuth();
  const { data, refetch } = useQuery<{
    sections: {
      section: string;
      name: string;
      location?: string;
      meetingPattern?: string;
      status: string;
    }[];
  }>(() => loadSections(), []);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [meetingPattern, setMeetingPattern] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!session || !name.trim()) return;
    setLoading(true);
    const result = await api.roster["sections/create"]({
      session,
      name: name.trim(),
      location,
      meetingPattern,
    });
    setLoading(false);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Section created");
      setName("");
      setLocation("");
      setMeetingPattern("");
      refetch();
    }
  }

  const sections = data?.sections ?? [];
  const activeSections = sections.filter((s) => s.status === "ACTIVE");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Section 01"
            />
          </div>
          <div className="space-y-2">
            <Label>Location (optional)</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room 101"
            />
          </div>
          <div className="space-y-2">
            <Label>Meeting Pattern (optional)</Label>
            <Input
              value={meetingPattern}
              onChange={(e) => setMeetingPattern(e.target.value)}
              placeholder="MWF 10:00-10:50"
            />
          </div>
        </div>
        <Button size="sm" onClick={create} disabled={loading || !name.trim()}>
          <Plus className="size-4 mr-1" /> Create Section
        </Button>

        {activeSections.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted-foreground">Active sections:</p>
            {activeSections.map((s) => (
              <div
                key={s.section}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{s.name}</span>
                  {s.location && (
                    <span className="ml-2 text-muted-foreground">
                      {s.location}
                    </span>
                  )}
                </div>
                {s.meetingPattern && (
                  <span className="text-xs text-muted-foreground">
                    {s.meetingPattern}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RosterPage() {
  const { session } = useAuth();
  const {
    data: rosterData,
    loading,
    error,
    refetch,
  } = useQuery<{
    members: {
      user: string;
      seat: string;
      kind: string;
      section?: string;
      rosterName: string;
      email: string;
    }[];
  }>(session ? () => loadRosterList(session) : null, [session]);

  const { data: sectionsData } = useQuery<{
    sections: {
      section: string;
      name: string;
      location?: string;
      meetingPattern?: string;
      status: string;
    }[];
  }>(() => loadSections(), []);

  const members = rosterData?.members ?? [];
  const sections = sectionsData?.sections ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="Roster Management"
        description="Configure class, manage sections, and maintain the student roster."
      />

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="students">
            Students ({members.length})
          </TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6 space-y-6">
          <ClassConfig />
          <SectionManager />
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          {loading ? (
            <LoadingState label="Loading roster..." />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="No students"
              description="Import students via CSV or have them claim seats."
            />
          ) : (
            <RosterTable
              members={members}
              sections={sections}
              onUpdate={refetch}
            />
          )}
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Import Roster from CSV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CsvImport onComplete={refetch} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
