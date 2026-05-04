// MembersCard — Fas 7 UI: lista, bjud in och hantera projektmedlemmar.
// Ägare kan lägga till/ändra/ta bort. Medlemmar ser bara listan.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Role = "owner" | "editor" | "viewer";

interface Member {
  id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email?: string;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "Ägare",
  editor: "Redigerare",
  viewer: "Läsare",
};

export default function MembersCard({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [busy, setBusy] = useState(false);

  const isOwner = !!user && (user.id === ownerUserId || members.some(m => m.user_id === user.id && m.role === "owner"));

  const load = async () => {
    setLoading(true);
    const [{ data: project }, { data: rows }] = await Promise.all([
      supabase.from("projects").select("user_id").eq("id", projectId).maybeSingle(),
      supabase.from("project_members").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    ]);
    setOwnerUserId(project?.user_id || null);
    setMembers((rows as Member[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [projectId]);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      // Slå upp user_id för e-posten via en RPC eller fall back till profiles
      const { data: profile } = await supabase
        .from("profiles" as any)
        .select("id, user_id")
        .eq("email", inviteEmail.trim().toLowerCase())
        .maybeSingle();
      const targetUserId = (profile as any)?.user_id || (profile as any)?.id;
      if (!targetUserId) {
        toast.error("Ingen användare med den e-posten finns. Be dem registrera sig först.");
        return;
      }
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: targetUserId,
        role: inviteRole,
        invited_by: user?.id,
      });
      if (error) throw error;
      toast.success(`${inviteEmail} tillagd som ${ROLE_LABEL[inviteRole].toLowerCase()}`);
      setInviteEmail("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Kunde inte lägga till");
    } finally {
      setBusy(false);
    }
  };

  const updateRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("project_members").update({ role }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Roll uppdaterad"); load(); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("project_members").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Borttagen"); load(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Medlemmar
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Bjud in kollegor och bestäm vad de får göra. Ägare har full kontroll.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : (
          <div className="space-y-2">
            {ownerUserId && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-muted/20">
                <div className="text-sm">
                  <div className="font-medium">{ownerUserId === user?.id ? "Du" : "Projektägare"}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{ownerUserId}</div>
                </div>
                <Badge variant="default" className="text-[10px]">Ägare</Badge>
              </div>
            )}
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Inga ytterligare medlemmar.</p>
            ) : (
              members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <div className="text-sm flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-mono truncate">{m.user_id}</div>
                  </div>
                  {isOwner ? (
                    <Select value={m.role} onValueChange={(v) => updateRole(m.id, v as Role)}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Ägare</SelectItem>
                        <SelectItem value="editor">Redigerare</SelectItem>
                        <SelectItem value="viewer">Läsare</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{ROLE_LABEL[m.role]}</Badge>
                  )}
                  {isOwner && (
                    <Button size="icon" variant="ghost" onClick={() => remove(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Bjud in */}
        {isOwner && (
          <div className="border-t border-border pt-4 space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bjud in</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                type="email"
                placeholder="kollega@bolaget.se"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 min-w-[200px]"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Läsare</SelectItem>
                  <SelectItem value="editor">Redigerare</SelectItem>
                  <SelectItem value="owner">Ägare</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={invite} disabled={busy || !inviteEmail.trim()} className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> {busy ? "Lägger till…" : "Lägg till"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Personen måste redan ha skapat ett konto i Slay Station.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
