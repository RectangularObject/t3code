import * as Schema from "effect/Schema";

import { useLocalStorage } from "./hooks/useLocalStorage";

// Fork-only, per-browser preference: kept out of client settings so the wire contract
// stays identical to upstream.
const VERBOSE_ACTIVITY_STORAGE_KEY = "t3code:fork:verbose-activity";

export function useVerboseActivity() {
  return useLocalStorage(VERBOSE_ACTIVITY_STORAGE_KEY, false, Schema.Boolean);
}
