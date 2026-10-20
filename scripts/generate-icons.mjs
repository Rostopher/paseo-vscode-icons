import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const upstream = path.resolve(process.argv[2] ?? path.join(root, "../vscode-icons"));
const bundled = await build({
  stdin: {
    contents: `export {extensions as files} from './src/iconsManifest/supportedExtensions.ts';
export {extensions as folders} from './src/iconsManifest/supportedFolders.ts';`,
    resolveDir: upstream,
  },
  bundle: true, write: false, format: "esm", platform: "node",
});
const { files, folders } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const metadata = JSON.parse(await readFile(path.join(upstream, "package.json"), "utf8"));
const catalog = {
  source: {
    repository: "https://github.com/vscode-icons/vscode-icons",
    commit: execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    version: metadata.version,
    codeLicense: "MIT", iconLicense: "CC-BY-SA-4.0; branded icons retain their respective licenses",
  },
  defaults: { file: "default_file", folder: "default_folder" },
  fileNames: {}, fileExtensions: {}, folderNames: {}, lightIcons: {}, icons: {},
};

async function addIcon(id, filename, lightFilename) {
  if (!(id in catalog.icons)) {
    catalog.icons[id] = (await readFile(path.join(upstream, "icons", filename), "utf8")).trim();
  }
  if (lightFilename) {
    const lightId = `${id}_light`;
    catalog.icons[lightId] = (await readFile(path.join(upstream, "icons", lightFilename), "utf8")).trim();
    catalog.lightIcons[id] = lightId;
  }
}

await addIcon("default_file", "default_file.svg");
await addIcon("default_folder", "default_folder.svg");
await addIcon("default_folder_opened", "default_folder_opened.svg");
const languageNames = {}, languageExtensions = {};
for (const file of files.supported.filter(file => !file.disabled)) {
  const id = `file_type_${file.icon}`;
  await addIcon(id, `${id}.svg`, file.light ? `file_type_light_${file.icon}.svg` : undefined);
  for (const language of file.languages ?? []) {
    for (const name of language.knownFilenames ?? []) languageNames[name.toLowerCase()] = id;
    for (const ext of language.knownExtensions ?? []) languageExtensions[ext.toLowerCase()] = id;
  }
  const associations = [...(file.extensions ?? [])];
  for (const stem of file.filenamesGlob ?? []) {
    for (const ext of file.extensionsGlob ?? []) associations.push(`${stem}.${ext}`);
  }
  for (const association of associations) {
    // Upstream strips the first leading dot only for extension associations.
    const key = (file.filename ? association : association.replace(/^\./, "")).toLowerCase();
    (file.filename ? catalog.fileNames : catalog.fileExtensions)[key] = id;
  }
}
catalog.fileNames = { ...languageNames, ...catalog.fileNames };
catalog.fileExtensions = { ...languageExtensions, ...catalog.fileExtensions };
// Research files missing upstream. .cls is a Visual Basic association upstream;
// retain that choice rather than silently treating every .cls file as LaTeX.
for (const ext of ["bst", "bbx", "cbx", "lbx", "ltx"]) catalog.fileExtensions[ext] = "file_type_tex";
for (const folder of folders.supported.filter(folder => !folder.disabled)) {
  const id = `folder_type_${folder.icon}`;
  await addIcon(id, `${id}.svg`, folder.light ? `folder_type_light_${folder.icon}.svg` : undefined);
  await addIcon(`${id}_opened`, `${id}_opened.svg`, folder.light ? `folder_type_light_${folder.icon}_opened.svg` : undefined);
  for (const name of folder.extensions ?? []) catalog.folderNames[name.toLowerCase()] = id;
}
await mkdir(path.join(root, "client/generated"), { recursive: true });
await writeFile(path.join(root, "client/generated/catalog.json"), JSON.stringify(catalog) + "\n");
await mkdir(path.join(root, "licenses"), { recursive: true });
await writeFile(path.join(root, "licenses/vscode-icons-MIT.txt"), await readFile(path.join(upstream, "LICENSE")));
console.info(JSON.stringify({
  icons: Object.keys(catalog.icons).length,
  fileNames: Object.keys(catalog.fileNames).length,
  fileExtensions: Object.keys(catalog.fileExtensions).length,
  folderNames: Object.keys(catalog.folderNames).length,
  source: catalog.source,
}, null, 2));
