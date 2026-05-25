import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function UnverifiedIdeaBadge() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="ml-1 text-[10px] font-normal py-0 px-1.5 cursor-help">
            Idé — overifierad
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          Detta nyckelord är AI-genererat. Volym, CPC och konkurrens är inte verifierade mot Google Ads eller GSC.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default UnverifiedIdeaBadge;
