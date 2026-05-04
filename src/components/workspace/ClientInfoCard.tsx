import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().trim().min(1, "Namn krävs").max(120, "Max 120 tecken"),
  company: z.string().trim().min(1, "Företag krävs").max(160, "Max 160 tecken"),
  domain: z
    .string()
    .trim()
    .max(253, "Max 253 tecken")
    .optional()
    .or(z.literal("")),
});

export default function ClientInfoCard({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("projects")
        .select("name, company, domain")
        .eq("id", projectId)
        .maybeSingle();
      if (data) {
        setName(data.name ?? "");
        setCompany(data.company ?? "");
        setDomain(data.domain ?? "");
      }
      setLoading(false);
      setDirty(false);
    })();
  }, [projectId]);

  const save = async () => {
    const parsed = schema.safeParse({ name, company, domain });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const normDomain =
      parsed.data.domain
        ?.replace(/^https?:\/\//i, "")
        .replace(/\/+$/, "")
        .toLowerCase() || null;

    const { error } = await supabase
      .from("projects")
      .update({
        name: parsed.data.name,
        company: parsed.data.company,
        domain: normDomain,
      })
      .eq("id", projectId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Kunduppgifter sparade");
    setDirty(false);
    if (normDomain) setDomain(normDomain);
  };

  const deleteProject = async () => {
    setDeleting(true);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    setDeleting(false);
    if (error) {
      toast.error(`Kunde inte radera: ${error.message}`);
      return;
    }
    toast.success("Kunden har raderats");
    navigate("/clients");
  };

  const canDelete = confirmText.trim().toLowerCase() === (name || "").trim().toLowerCase() && name.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Kunduppgifter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="client-name">Namn</Label>
            <Input
              id="client-name"
              value={name}
              disabled={loading}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              placeholder="t.ex. Norrtälje Bygg"
            />
          </div>
          <div>
            <Label htmlFor="client-company">Företag</Label>
            <Input
              id="client-company"
              value={company}
              disabled={loading}
              maxLength={160}
              onChange={(e) => {
                setCompany(e.target.value);
                setDirty(true);
              }}
              placeholder="Juridiskt företagsnamn"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="client-domain">Domän</Label>
            <Input
              id="client-domain"
              value={domain}
              disabled={loading}
              maxLength={253}
              onChange={(e) => {
                setDomain(e.target.value);
                setDirty(true);
              }}
              placeholder="example.se"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Utan https:// — bara domänen, t.ex. <code>example.se</code>.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || loading || !dirty}>
            {saving ? "Sparar…" : "Spara ändringar"}
          </Button>
        </div>

        {/* Danger zone */}
        <div className="mt-6 pt-4 border-t border-destructive/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-medium text-destructive">Radera kund</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Tar bort kunden och all relaterad data permanent. Detta kan inte ångras.
              </p>
            </div>
            <AlertDialog onOpenChange={(o) => { if (!o) setConfirmText(""); }}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1" disabled={loading}>
                  <Trash2 className="h-3.5 w-3.5" /> Radera kund
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Radera "{name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Detta tar bort kunden permanent inklusive analyser, mål, alerts, briefings och allt annat kopplat till denna kund. Åtgärden kan inte ångras.
                    <br /><br />
                    Skriv kundens namn <strong>{name}</strong> nedan för att bekräfta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={name}
                  autoFocus
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      if (canDelete) deleteProject();
                    }}
                    disabled={!canDelete || deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Raderar…" : "Radera permanent"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
