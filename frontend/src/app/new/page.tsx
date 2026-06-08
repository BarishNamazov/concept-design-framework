"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/forum/composer";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { RequireAuth } from "@/components/forum/require-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function NewTopicForm() {
  const router = useRouter();
  const { session } = useAuth();
  const [title, setTitle] = useState("");

  async function create(body: string) {
    if (!session) return;
    const content = title.trim() ? `# ${title.trim()}\n\n${body}` : body;
    try {
      const { conversation } = unwrap(
        await api.threads.create({ session, content }),
      );
      toast.success("Topic posted.");
      router.push(`/t/${conversation}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post topic.");
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Start a conversation"
        title="New topic"
        description="Give it a clear title, then write your opening post in Markdown."
      />
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What would you like to discuss?"
            className="text-base"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Opening post</Label>
          <Composer
            session={session ?? undefined}
            submitLabel="Post topic"
            minRows={10}
            placeholder="Lay out your question or idea. You can mention a post with [[post-id]]."
            onSubmit={create}
          />
        </div>
      </div>
    </PageContainer>
  );
}

export default function NewTopicPage() {
  return (
    <RequireAuth>
      <NewTopicForm />
    </RequireAuth>
  );
}
