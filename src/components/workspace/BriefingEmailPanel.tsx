import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  role: "to" | "cc" | "bcc";
  enabled: boolean;
  auto_send: boolean;
}

interface Props {
  projectId: string;
  weekStart: string;
}

export default function BriefingEmailPanel({ projectId, weekStart }: Props) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("briefing_email_recipients")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    setRecipients((data as Recipient[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const addRecipient = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Ange en giltig email");
      return;
    }
    const { error } = await supabase.from("briefing_email_recipients").insert({
      project_id: projectId,
      email,
      name: newName.trim() || null,
      role: "to",
      enabled: true,
      auto_send: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewEmail("");
    setNewName("");
    load();
  };

  const updateRecipient = async (id: string, patch: Partial<Recipient>) => {
    const { error } = await supabase.from("briefing_email_recipients").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else setRecipients((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRecipient = async (id: string) => {
    const { error } = await supabase.from("briefing_email_recipients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setRecipients((rs) => rs.filter((r) => r.id !== id));
  };

  const sendNow = async () => {
    const enabled = recipients.filter((r) => r.enabled);
    if (!enabled.length) {
      toast.error("Lägg till minst en aktiv mottagare först");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-briefing-send", {
        body: { project_id: projectId, week_start: weekStart },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      if (r?.status === "sent") {
        toast.success(`Skickad till ${r.sent} mottagare${r.failed ? ` (${r.failed} misslyckade)` : ""}`);
      } else {
        toast.warning(`Inget skickat: ${r?.reason || "okänt"}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte skicka");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Email-utskick
          </CardTitle>
          <Button size="sm" onClick={sendNow} disabled={sending} className="gap-2">
            <Send className={`h-3.5 w-3.5 ${sending ? "animate-pulse" : ""}`} />
            {sending ? "Skickar…" : "Skicka denna vecka nu"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Lägg till mottagare per kund. Aktivera <strong>Auto</strong> för att inkludera i automatiskt veckoutskick (måndagar 06:00).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lägg till */}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="email@kunden.se"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRecipient()}
          />
          <Input
            placeholder="Namn (valfritt)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRecipient()}
          />
          <Button variant="outline" onClick={addRecipient} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Lägg till
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Laddar…</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga mottagare ännu — lägg till email-adresser ovan.
          </p>
        ) : (
          <div className="space-y-1.5">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.email}</div>
                  {r.name && <div className="text-[11px] text-muted-foreground truncate">{r.name}</div>}
                </div>
                <Badge variant={r.enabled ? "default" : "secondary"} className="text-[10px]">
                  {r.enabled ? "Aktiv" : "Pausad"}
                </Badge>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => updateRecipient(r.id, { enabled: v })}
                  />
                  På
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={r.auto_send}
                    onCheckedChange={(v) => updateRecipient(r.id, { auto_send: v })}
                  />
                  Auto
                </label>
                <Button size="icon" variant="ghost" onClick={() => removeRecipient(r.id)} className="h-7 w-7">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
