import type { Plugin, PluginModule } from "@opencode-ai/plugin";

const server: Plugin = async () => ({});

const mod: PluginModule = {
  id: "opencode-glm-vistatus",
  server,
};

export default mod;
