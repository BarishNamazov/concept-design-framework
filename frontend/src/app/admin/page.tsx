"use client";

import { FolderPlus, List, Shield, Trash2, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryDot } from "@/components/forum/badges";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { EmptyState, LoadingState } from "@/components/forum/states";
import { UserName } from "@/components/forum/user-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { FORUM_CONTEXT, useAuth } from "@/lib/auth";
import { shortId } from "@/lib/format";
import type { Category, RoleDetail, RoleRow, RoleSummary } from "@/lib/models";

const CAPABILITY_INFO: Record<string, string> = {
  administer:
    "Full administrative access — manage roles, categories, and forum configuration.",
  moderate:
    "Content moderation — lock threads, trash posts, and manage categories.",
  pin: "Pin threads to the top of category listings.",
};

function CategoryAdmin() {
  const { session } = useAuth();
  const { data, refetch } = useQuery<{ categories: Category[] }>(
    () => api.categories.list({}),
    [],
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function create() {
    if (!session || !name.trim()) return;
    const result = await api.categories.create({
      session,
      name: name.trim(),
      description: description.trim(),
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Category created");
      setName("");
      setDescription("");
      refetch();
    }
  }

  async function remove(category: string) {
    if (!session) return;
    const result = await api.categories.delete({ session, category });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Category deleted");
      refetch();
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <FolderPlus className="size-5" />
          New category
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Announcements"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Input
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What belongs here?"
            />
          </div>
        </div>
        <Button className="mt-4" onClick={create} disabled={!name.trim()}>
          Create category
        </Button>
      </section>

      <section>
        <h3 className="eyebrow mb-3">Existing categories</h3>
        {!data || data.categories.length === 0 ? (
          <EmptyState
            title="No categories"
            description="Create your first category above."
          />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.categories.map((category) => (
              <div
                key={String(category.category)}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="flex items-center gap-2.5">
                  <CategoryDot
                    id={String(category.category)}
                    className="size-3.5"
                  />
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {category.description || "No description"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => remove(String(category.category))}
                  aria-label="Delete category"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoleAdmin() {
  const { session } = useAuth();
  const [roleName, setRoleName] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantRole, setGrantRole] = useState("");
  const [lookupUser, setLookupUser] = useState("");
  const [queryUser, setQueryUser] = useState<string | null>(null);
  const [queryUsername, setQueryUsername] = useState<string | null>(null);
  const [roleDetails, setRoleDetails] = useState<Record<string, RoleDetail>>(
    {},
  );
  const fetchedRef = useRef<Set<string>>(new Set());

  function resetInspection() {
    setRoleDetails({});
    fetchedRef.current.clear();
  }

  const roleList = useQuery<{ roles: RoleSummary[] }>(
    () => api.roles.list({}),
    [],
  );

  const roles = useQuery<{ roles: RoleRow[] }>(
    queryUser
      ? () => api.roles.forUser({ user: queryUser, context: FORUM_CONTEXT })
      : null,
    [queryUser],
  );

  useEffect(() => {
    if (!roles.data) return;
    Promise.all(
      roles.data.roles.map(async (r) => {
        const key = String(r.role);
        if (fetchedRef.current.has(key)) return;
        fetchedRef.current.add(key);
        const result = await api.roles.get({ role: key });
        if (!("error" in result)) {
          setRoleDetails((prev) => ({ ...prev, [key]: result }));
        }
      }),
    );
  }, [roles.data]);

  function toggleCap(cap: string) {
    setCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  }

  async function define() {
    if (!session || !roleName.trim() || caps.length === 0) return;
    const result = await api.roles.define({
      session,
      name: roleName.trim(),
      // The SDK contract type narrows capabilities to a single string (symbolic
      // frame vars collapse to string), but the backend expects a string[].
      capabilities: caps as unknown as string,
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`Role "${roleName.trim()}" defined`);
      setRoleName("");
      setCaps([]);
      roleList.refetch();
    }
  }

  async function grant() {
    if (!session || !grantUser.trim() || !grantRole.trim()) return;
    const result = await api.roles.grant({
      session,
      user: grantUser.trim(),
      context: FORUM_CONTEXT,
      role: grantRole.trim(),
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Role granted");
      setGrantUser("");
      setGrantRole("");
      if (queryUser === grantUser.trim()) {
        resetInspection();
        roles.refetch();
      }
    }
  }

  async function revoke(role: string) {
    if (!session || !queryUser) return;
    const result = await api.roles.revoke({
      session,
      user: queryUser,
      context: FORUM_CONTEXT,
      role,
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Role revoked");
      resetInspection();
      roles.refetch();
    }
  }

  const CAPABILITIES = Object.keys(CAPABILITY_INFO);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Shield className="size-5" />
          Define a role
        </h3>
        <div className="space-y-2">
          <Label htmlFor="role-name">Role name</Label>
          <Input
            id="role-name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g. moderator"
          />
        </div>
        <div className="mt-4 space-y-3">
          <Label>Capabilities</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {CAPABILITIES.map((cap) => {
              const selected = caps.includes(cap);
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCap(cap)}
                  className={
                    "rounded-lg border p-3 text-left transition-colors " +
                    (selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  <p className="text-sm font-medium capitalize">{cap}</p>
                  <p className="mt-0.5 text-xs leading-relaxed opacity-70">
                    {CAPABILITY_INFO[cap]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={define}
          disabled={!roleName.trim() || caps.length === 0}
        >
          Define role
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <UserCog className="size-5" />
          Grant a role
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="grant-user">Username</Label>
            <Input
              id="grant-user"
              value={grantUser}
              onChange={(e) => setGrantUser(e.target.value)}
              placeholder="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-role">Role (name or ID)</Label>
            <Input
              id="grant-role"
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value)}
              placeholder="e.g. moderator"
              list="grant-role-suggestions"
            />
            {roleList.data && roleList.data.roles.length > 0 ? (
              <datalist id="grant-role-suggestions">
                {roleList.data.roles.map((r) => (
                  <option key={String(r.role)} value={r.name} />
                ))}
              </datalist>
            ) : null}
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={grant}
          disabled={!grantUser.trim() || !grantRole.trim()}
        >
          Grant role
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <List className="size-5" />
          Defined roles
        </h3>
        {roleList.loading ? (
          <LoadingState />
        ) : !roleList.data || roleList.data.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No roles defined yet. Create one above.
          </p>
        ) : (
          <div className="space-y-2">
            {roleList.data.roles.map((r) => (
              <div
                key={String(r.role)}
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium capitalize">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {shortId(String(r.role))}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.capabilities.map((cap) => (
                      <Badge
                        key={cap}
                        variant="secondary"
                        className="text-xs capitalize"
                      >
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 font-display text-lg font-semibold">
          Inspect a user&apos;s roles
        </h3>
        <div className="flex gap-2">
          <Input
            value={lookupUser}
            onChange={(e) => setLookupUser(e.target.value)}
            placeholder="username"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const name = lookupUser.trim();
                if (name) {
                  setQueryUser(name);
                  setQueryUsername(name);
                  resetInspection();
                }
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              const name = lookupUser.trim();
              if (name) {
                setQueryUser(name);
                setQueryUsername(name);
                resetInspection();
              }
            }}
            disabled={!lookupUser.trim()}
          >
            Look up
          </Button>
        </div>
        {queryUser ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Roles for{" "}
              <UserName user={queryUser} className="text-foreground" /> (
              {queryUsername ?? shortId(queryUser)})
            </p>
            {roles.loading ? (
              <LoadingState />
            ) : !roles.data || roles.data.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No roles in this context.
              </p>
            ) : (
              <ul className="space-y-2">
                {roles.data.roles.map((r) => {
                  const detail = roleDetails[String(r.role)];
                  return (
                    <li
                      key={String(r.role)}
                      className="flex items-start justify-between rounded-lg border border-border px-4 py-3"
                    >
                      <div className="min-w-0">
                        {detail ? (
                          <>
                            <p className="font-medium capitalize">
                              {detail.name}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                              {shortId(String(r.role))}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {detail.capabilities.map((cap) => (
                                <Badge
                                  key={cap}
                                  variant="secondary"
                                  className="text-xs capitalize"
                                >
                                  {cap}
                                </Badge>
                              ))}
                            </div>
                          </>
                        ) : (
                          <span className="font-mono text-sm">
                            {shortId(String(r.role))}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive shrink-0"
                        onClick={() => revoke(String(r.role))}
                      >
                        Revoke
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function AdminPage() {
  const { loading, can } = useAuth();

  if (loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );

  if (!can.administer)
    return (
      <PageContainer>
        <EmptyState
          icon={Shield}
          title="Administrators only"
          description="You don't have permission to view the admin console."
        />
      </PageContainer>
    );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Console"
        title="Administration"
        description="Manage categories and the roles that grant moderation powers."
      />
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-6">
          <CategoryAdmin />
        </TabsContent>
        <TabsContent value="roles" className="mt-6">
          <RoleAdmin />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
