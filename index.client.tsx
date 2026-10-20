import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installFileIcons } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return installFileIcons();
}
