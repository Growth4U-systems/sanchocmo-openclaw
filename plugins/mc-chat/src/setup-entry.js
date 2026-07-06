/**
 * MC Chat — Lightweight setup entry (loaded when channel is disabled/unconfigured)
 */

import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { mcChatPlugin } from "./channel.js";

export default defineSetupPluginEntry(mcChatPlugin);
