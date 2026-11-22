import { T, useGT } from "gt-react";
import { ChevronDownIcon } from "lucide-react";
import { memo, type PointerEventHandler, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ComposerBanner } from "./ComposerBanner";
import { useComposerMenuProps } from "./composerEventScope";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <ComposerBanner.Row>
      <ComposerBanner.Icon />
      <ComposerBanner.Content>
        <span className="shrink-0 font-medium text-muted-foreground">
          <T>Plan ready</T>
        </span>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-foreground/85">{planTitle}</span>
        ) : null}
      </ComposerBanner.Content>
    </ComposerBanner.Row>
  );
});

/**
 * The primary action while a proposed plan waits for an answer: Refine sends the draft as
 * feedback in plan mode, Implement (on an empty draft) builds it here or in a new thread.
 */
export function ComposerPlanFollowUpActions(props: {
  children?: ReactNode;
  compact: boolean;
  promptHasText: boolean;
  disabled: boolean;
  isSendBusy: boolean;
  canOperateThread: boolean;
  pillClassName: string;
  onPointerDown: PointerEventHandler<HTMLElement> | undefined;
  onImplementPlanInNewThread: (() => void) | undefined;
}) {
  const gt = useGT();
  const composerMenuProps = useComposerMenuProps();
  if (props.promptHasText) {
    return (
      <>
        {props.children}
        <button
          type="submit"
          className={cn(props.pillClassName, "h-9 sm:h-8", props.compact ? "px-3" : "px-4")}
          onPointerDown={props.onPointerDown}
          disabled={props.disabled}
        >
          {props.isSendBusy
            ? gt("Sending…")
            : gt("Refine", { $context: "verb, sends feedback on a proposed plan" })}
        </button>
      </>
    );
  }
  return (
    <>
      {props.children}
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <button
          type="submit"
          className={cn(props.pillClassName, "h-9 rounded-r-none px-4 sm:h-8")}
          onPointerDown={props.onPointerDown}
          disabled={props.disabled}
        >
          {props.isSendBusy
            ? gt("Sending…")
            : gt("Implement", { $context: "verb, starts building a proposed plan" })}
        </button>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  props.pillClassName,
                  "h-9 rounded-l-none border-l border-message-action-foreground/20 px-2 sm:h-8",
                )}
                aria-label={gt("Implementation actions")}
                onMouseDown={props.onPointerDown ? (event) => event.preventDefault() : undefined}
                disabled={props.disabled}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" {...composerMenuProps}>
            <MenuItem
              disabled={props.disabled}
              onClick={() => {
                if (props.canOperateThread) props.onImplementPlanInNewThread?.();
              }}
            >
              <T>Implement in a new thread</T>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </>
  );
}
