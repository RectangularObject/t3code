import { useGT } from "gt-react";

import { useVerboseActivity } from "../../forkVerboseActivity";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function VerboseActivityRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const [verboseActivity, setVerboseActivity] = useVerboseActivity();
  return (
    <SettingsRow
      {...setting("verbose-activity")}
      description={gt(
        "Show every thought in full and every tool call as its own row, like a terminal CLI. Finished turns stay expanded until you collapse them. Has no effect in Zen.",
      )}
      resetAction={
        verboseActivity ? (
          <SettingResetButton
            ariaLabel={gt("Reset expanded activity log to default")}
            onClick={() => setVerboseActivity(false)}
          />
        ) : null
      }
      control={
        <Switch
          checked={verboseActivity}
          onCheckedChange={setVerboseActivity}
          aria-label={gt("Expanded activity log")}
        />
      }
    />
  );
}
