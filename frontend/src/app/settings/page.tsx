"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { RequireAuth } from "@/components/forum/require-auth";
import { UserAvatar } from "@/components/forum/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function ProfileSettings() {
  const { session, me, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(me?.profile.displayName ?? "");
  const [bio, setBio] = useState(me?.profile.bio ?? "");
  const [avatar, setAvatar] = useState(me?.profile.avatar ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!session) return;
    setBusy(true);
    const results = await Promise.all([
      api.profiles.setDisplayName({ session, displayName: displayName.trim() }),
      api.profiles.setBio({ session, bio }),
      api.profiles.setAvatar({ session, avatar: avatar.trim() }),
    ]);
    setBusy(false);
    const failed = results.find((r) => "error" in r);
    if (failed && "error" in failed) {
      toast.error(failed.error);
    } else {
      toast.success("Profile saved");
      await refresh();
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 font-display text-xl font-semibold">Profile</h2>
      <div className="flex items-center gap-4">
        <UserAvatar
          user={me ? String(me.user) : "me"}
          name={displayName}
          avatar={avatar}
          className="size-16"
        />
        <div className="text-sm text-muted-foreground">
          Your avatar is shown across the forum. Paste an image URL below.
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={me?.profile.email ?? ""}
            disabled
          />
          <p className="text-xs text-muted-foreground">
            Email is set during registration and cannot be changed here yet.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="avatar">Avatar URL</Label>
          <Input
            id="avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="Tell the community a little about yourself."
          />
        </div>
        <Button onClick={save} disabled={busy}>
          Save profile
        </Button>
      </div>
    </section>
  );
}

function PasswordSettings() {
  const { session } = useAuth();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (!session || !oldPassword || !newPassword) return;
    setBusy(true);
    const result = await api.auth.changePassword({
      session,
      oldPassword,
      newPassword,
    });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Password changed");
      setOld("");
      setNew("");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 font-display text-xl font-semibold">Password</h2>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="old">Current password</Label>
          <Input
            id="old"
            type="password"
            value={oldPassword}
            onChange={(e) => setOld(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </div>
        <Button
          onClick={change}
          disabled={busy || !oldPassword || !newPassword}
          variant="outline"
        >
          Change password
        </Button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Account"
          title="Settings"
          description="Manage how you appear and how you sign in."
        />
        <div className="space-y-6">
          <ProfileSettings />
          <PasswordSettings />
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
