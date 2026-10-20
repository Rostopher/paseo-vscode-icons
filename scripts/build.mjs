import { build } from "esbuild";

// Mirror the host's neutral client compiler; no Node or unprovided runtime modules.
await build({
  entryPoints: ["index.client.tsx"],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: "es2020",
  outfile: "dist/index.client.cjs",
  external: ["@getpaseo/plugin/client", "react-native"],
  metafile: true,
}).then(({ metafile }) => {
  for (const input of Object.values(metafile.inputs)) {
    for (const dependency of input.imports) {
      if (dependency.path.startsWith("node:")) throw new Error("Node import in client bundle");
    }
  }
});
