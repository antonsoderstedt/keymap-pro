import { useEffect, useState } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  GOOGLE_REAUTH_EVENT,
  isGoogleReauthError,
  extractMessage,
} from "@/lib/googleReauth";
import { reconnectGoogle } from "@/lib/googleOAuth";

const DISMISS_KEY = "google-reauth-banner-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 30; // 30 min

export function GoogleReauthBanner() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const show = (msg?: string) => {
      const dismissedAt = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
      setMessage(
        msg ||
          "Din Google-anslutning har gått ut eller återkallats. Koppla om Google för att fortsätta hämta data."
      );
      setVisible(true);
    };

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined;
      show(detail?.message);
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      if (isGoogleReauthError(e.reason)) show(extractMessage(e.reason));
    };

    window.addEventListener(GOOGLE_REAUTH_EVENT, onEvent as EventListener);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener(GOOGLE_REAUTH_EVENT, onEvent as EventListener);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!visible) return null;

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      toast.info("Rensar gammal Google-token och startar OAuth …");
      await reconnectGoogle();
      // reconnectGoogle redirects to Google; nothing to do on success.
    } catch (e) {
      setReconnecting(false);
      toast.error("Kunde inte starta Google-anslutning", {
        description: extractMessage(e),
      });
    }
  };

  return (
    <div className="border-b border-destructive/40 bg-destructive/10 text-destructive-foreground">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Google-anslutning krävs
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleReconnect}
              disabled={reconnecting}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reconnecting ? "animate-spin" : ""}`} />
              {reconnecting ? "Startar …" : "Anslut Google igen"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
                setVisible(false);
              }}
            >
              Påminn senare
            </Button>
          </div>
        </div>
        <button
          aria-label="Stäng"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
