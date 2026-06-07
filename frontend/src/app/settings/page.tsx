"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/app/require-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    user?.profile.displayName ?? "",
  );
  const [bio, setBio] = useState(user?.profile.bio ?? "");
  const [avatar, setAvatar] = useState(user?.profile.avatar ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function saveProfile() {
    setBusy(true);
    try {
      const { api } = await import("@/lib/api");
      await api.profiles.setDisplayName({ session: user.session, displayName });
      await api.profiles.setBio({ session: user.session, bio });
      await api.profiles.setAvatar({ session: user.session, avatar });
      toast.success("Profile updated.");
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireAuth>
      <div className="mx-auto max-w-md py-10">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your public profile.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="bio">Bio</Label>
              <Input
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="avatar">Avatar URL</Label>
              <Input
                id="avatar"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
              />
            </div>
            <Button onClick={saveProfile} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </RequireAuth>
  );
}
