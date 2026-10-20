import catalog from "./generated/catalog.json";

const files = catalog.fileNames as Readonly<Record<string, string>>;
const extensions = catalog.fileExtensions as Readonly<Record<string, string>>;
const folders = catalog.folderNames as Readonly<Record<string, string>>;
const lightIcons = catalog.lightIcons as Readonly<Record<string, string>>;
const icons = catalog.icons as Readonly<Record<string, string>>;
const urls = new Map<string, string>();

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
}

export function fileIconId(path: string): string {
  const name = basename(path);
  if (Object.hasOwn(files, name)) return files[name];
  // VS Code resolves the most specific suffix first: d.ts before ts, for example.
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    const suffix = name.slice(dot + 1);
    if (Object.hasOwn(extensions, suffix)) return extensions[suffix];
  }
  return catalog.defaults.file;
}

export function folderIconId(path: string, expanded = false): string {
  const name = basename(path);
  const id = Object.hasOwn(folders, name) ? folders[name] : catalog.defaults.folder;
  return expanded ? `${id}_opened` : id;
}

export function iconUrl(id: string, light = false): string {
  const variant = light && Object.hasOwn(lightIcons, id) ? lightIcons[id] : id;
  let url = urls.get(variant);
  if (url) return url;
  const svg = icons[variant] ?? icons[catalog.defaults.file];
  url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  urls.set(variant, url);
  return url;
}
