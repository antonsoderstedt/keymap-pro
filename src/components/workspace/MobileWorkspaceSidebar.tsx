// Mobil sidomeny — Fas 8: visar samma 7-områdes-meny i en off-canvas Sheet.

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

interface Props {
  workspaceId: string;
  workspaceName: string;
  workspaceCompany?: string | null;
}

export function MobileWorkspaceSidebar(props: Props) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Stäng menyn när man navigerar
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
        <div className="block md:hidden h-full">
          {/* Återanvänd vanliga sidomenyn — den har md:hidden så vi måste neutralisera */}
          <div className="[&>aside]:!flex [&>aside]:!w-full [&>aside]:!sticky [&>aside]:!top-0 [&>aside]:!h-full">
            <WorkspaceSidebar {...props} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
