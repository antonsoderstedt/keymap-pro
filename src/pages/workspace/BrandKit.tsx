import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrandKit, type BrandPalette } from "@/hooks/useBrandKit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Save, Palette as PaletteIcon, Type, Mic, Sparkles } from "lucide-react";

const TONE_OPTIONS = [
  { value: "professional", label: "Professionell / formell" },
  { value: "expert", label: "Expert / teknisk" },
  { value: "friendly", label: "Vänlig / personlig" },
  { value: "bold", label: "Modig / självsäker" },
  { value: "playful", label: "Lekfull / kreativ" },
  { value: "premium", label: "Premium / lyxig" },
];

const FONT_SUGGESTIONS = [
  "Inter", "Playfair Display", "Roboto", "Open Sans", "Lato", "Montserrat",
  "Poppins", "Source Sans Pro", "Merriweather", "Georgia", "Helvetica Neue",
];

export default function BrandKit() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { brandKit, loading, save, palette, fonts } = useBrandKit(projectId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genUrl, setGenUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Local form state derived from brand kit
  const [localPalette, setLocalPalette] = useState<BrandPalette>(palette);
  const [headingFont, setHeadingFont] = useState(fonts.heading);
  const [bodyFont, setBodyFont] = useState(fonts.body);
  const [tone, setTone] = useState(brandKit?.tone || "professional");
  const [voice, setVoice] = useState(brandKit?.voice_guidelines || "");
  const [imageStyle, setImageStyle] = useState(brandKit?.image_style || "");

  // Sync when brandKit loads
  useState(() => {
    if (brandKit) {
      setLocalPalette(brandKit.palette);
      setHeadingFont(brandKit.fonts.heading);
      setBodyFont(brandKit.fonts.body);
      setTone(brandKit.tone);
      setVoice(brandKit.voice_guidelines || "");
      setImageStyle(brandKit.image_style || "");
    }
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !projectId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${projectId}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
      const { error } = await save({ logo_url: data.publicUrl });
      if (error) throw error;
      toast.success("Logotyp uppladdad");
    } catch (err: any) {
      toast.error("Kunde inte ladda upp: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save({
      palette: localPalette,
      fonts: { heading: headingFont, body: bodyFont },
      tone,
      voice_guidelines: voice,
      image_style: imageStyle,
    });
    setSaving(false);
    if (error) toast.error("Kunde inte spara");
    else toast.success("Brand Kit sparad");
  };

  const handleGenerate = async () => {
    let url = genUrl.trim();
    if (!url) {
      const { data: proj } = await supabase.from("projects").select("domain").eq("id", projectId!).maybeSingle();
      url = proj?.domain || "";
    }
    if (!url) return toast.error("Ange URL eller spara domän på projektet");
    if (!url.startsWith("http")) url = "https://" + url;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("brand-kit-extract", { body: { url } });
      if (error) throw error;
      if (data?.palette) setLocalPalette({ ...localPalette, ...data.palette });
      if (data?.fonts?.heading) setHeadingFont(data.fonts.heading);
      if (data?.fonts?.body) setBodyFont(data.fonts.body);
      if (data?.tone) setTone(data.tone);
      if (data?.voice_guidelines) setVoice(data.voice_guidelines);
      if (data?.image_style) setImageStyle(data.image_style);
      toast.success("Brand-profil hämtad — kontrollera och spara");
    } catch (e: any) {
      toast.error("Misslyckades: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="animate-pulse text-sm text-muted-foreground">Laddar Brand Kit…</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">Brand Kit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Logo, färger, typsnitt och tone of voice. Allt vi exporterar (PPTX, PDF, ads, briefs)
            använder den här profilen automatiskt.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Sparar…" : "Spara Brand Kit"}
        </Button>
      </div>

      {/* Auto-generate */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-medium">Generera Brand Kit från sajten</div>
            <div className="text-xs text-muted-foreground">Vi scrapar sajten och låter AI extrahera färger, typsnitt och ton.</div>
          </div>
          <Input className="w-64" placeholder="https://exempel.se (valfritt)" value={genUrl} onChange={(e) => setGenUrl(e.target.value)} />
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            <Sparkles className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
            {generating ? "Hämtar…" : "Hämta från sajt"}
          </Button>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-serif">
            <Upload className="h-4 w-4 text-primary" />
            Logotyp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div
              className="h-24 w-48 rounded-lg border border-border flex items-center justify-center bg-muted/30 overflow-hidden"
            >
              {brandKit?.logo_url ? (
                <img src={brandKit.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">Ingen logotyp</span>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "Laddar upp…" : "Ladda upp logotyp"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">PNG, SVG eller JPG. Helst transparent bakgrund.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Palette */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-serif">
            <PaletteIcon className="h-4 w-4 text-primary" />
            Färgpalett
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(Object.keys(localPalette) as (keyof BrandPalette)[]).map((key) => (
              <div key={key} className="space-y-2">
                <Label className="text-xs uppercase tracking-wider">{key.replace("_", " ")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localPalette[key]}
                    onChange={(e) => setLocalPalette({ ...localPalette, [key]: e.target.value })}
                    className="h-10 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={localPalette[key]}
                    onChange={(e) => setLocalPalette({ ...localPalette, [key]: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Preview */}
          <div className="mt-6 p-4 rounded-lg border border-border" style={{ backgroundColor: localPalette.neutral_bg }}>
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: localPalette.neutral_fg, opacity: 0.6 }}>
              Förhandsvisning
            </div>
            <h3 className="text-2xl mb-3" style={{ color: localPalette.primary, fontFamily: headingFont }}>
              Rubrik i din primärfärg
            </h3>
            <p className="text-sm mb-4" style={{ color: localPalette.neutral_fg, fontFamily: bodyFont }}>
              Brödtext i din valda body-font. Knappar och accenter använder palette nedan.
            </p>
            <div className="flex gap-2 flex-wrap">
              <span className="px-3 py-1.5 rounded-md text-sm text-white" style={{ backgroundColor: localPalette.primary }}>Primary</span>
              <span className="px-3 py-1.5 rounded-md text-sm" style={{ backgroundColor: localPalette.secondary, color: localPalette.neutral_fg }}>Secondary</span>
              <span className="px-3 py-1.5 rounded-md text-sm text-white" style={{ backgroundColor: localPalette.accent }}>Accent</span>
              <span className="px-3 py-1.5 rounded-md text-sm text-white" style={{ backgroundColor: localPalette.success }}>Success</span>
              <span className="px-3 py-1.5 rounded-md text-sm text-white" style={{ backgroundColor: localPalette.warning }}>Warning</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fonts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-serif">
            <Type className="h-4 w-4 text-primary" />
            Typsnitt
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Rubrik-font</Label>
            <Input value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} list="font-suggestions" />
          </div>
          <div className="space-y-2">
            <Label>Brödtext-font</Label>
            <Input value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} list="font-suggestions" />
          </div>
          <datalist id="font-suggestions">
            {FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
          </datalist>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Skriv namnet på en Google Font eller systemfont. Används i exporter och AI-genererat innehåll.
          </p>
        </CardContent>
      </Card>

      {/* Tone of voice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-serif">
            <Mic className="h-4 w-4 text-primary" />
            Tone of voice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Övergripande ton</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Språkriktlinjer (valfritt)</Label>
            <Textarea
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              rows={4}
              placeholder="T.ex. 'Använd du-tilltal. Undvik anglicismer. Var konkret och undvik buzzwords.'"
            />
          </div>
          <div className="space-y-2">
            <Label>Bildstil (valfritt)</Label>
            <Textarea
              value={imageStyle}
              onChange={(e) => setImageStyle(e.target.value)}
              rows={2}
              placeholder="T.ex. 'Industriella miljöer, naturligt ljus, människor i jobb-situationer.'"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
