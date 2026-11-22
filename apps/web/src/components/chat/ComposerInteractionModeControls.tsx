import type { ProviderInteractionMode } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { BotIcon, PencilRulerIcon } from "lucide-react";
import { memo } from "react";

import { MenuRadioGroup, MenuRadioItem } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";

/** The footer's Build/Plan toggle. Shift+Tab, `/plan` and `/default` reach the same state. */
export const ComposerInteractionModeToggle = memo(function ComposerInteractionModeToggle(props: {
  interactionMode: ProviderInteractionMode;
  size?: "sm" | "xs";
  onToggleInteractionMode: () => void;
}) {
  const gt = useGT();
  const size = props.size ?? "sm";
  const planning = props.interactionMode === "plan";
  const tooltip = planning
    ? gt("Plan mode. Click to return to normal build mode")
    : gt("Build mode. Click to enter plan mode");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            size={size}
            className="shrink-0 whitespace-nowrap"
            aria-pressed={planning}
            type="button"
            onClick={props.onToggleInteractionMode}
            aria-label={tooltip}
          />
        }
      >
        {planning ? (
          <ComposerControlIcon
            icon={PencilRulerIcon}
            size={size}
            className="text-current opacity-100"
          />
        ) : (
          <ComposerControlIcon
            icon={BotIcon}
            size={size}
            opticalSize={size === "xs" ? "default" : "large"}
          />
        )}
        {/* The compacted row (xs) keeps this icon-only, like the other controls there. */}
        <span
          data-composer-control-label
          className={size === "xs" ? "sr-only" : "sr-only sm:not-sr-only"}
        >
          {planning
            ? gt("Plan", { $context: "interaction mode where the agent proposes a plan first" })
            : gt("Build", { $context: "interaction mode where the agent makes changes" })}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
});

/** Build/Plan as radio items for the overflow menu, shown when the footer toggle overflows. */
export function ComposerInteractionModeMenuSection(props: {
  interactionMode: ProviderInteractionMode;
  onToggleInteractionMode: () => void;
}) {
  const gt = useGT();
  return (
    <>
      <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
        <T>Mode</T>
      </div>
      <MenuRadioGroup
        value={props.interactionMode}
        onValueChange={(value) => {
          if (!value || value === props.interactionMode) return;
          props.onToggleInteractionMode();
        }}
      >
        <MenuRadioItem value="default">
          {gt("Build", { $context: "interaction mode where the agent makes changes" })}
        </MenuRadioItem>
        <MenuRadioItem value="plan">
          {gt("Plan", { $context: "interaction mode where the agent proposes a plan first" })}
        </MenuRadioItem>
      </MenuRadioGroup>
    </>
  );
}
