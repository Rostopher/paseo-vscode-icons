import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

const output = await build({
  entryPoints: ["client/icons.ts"], bundle: true, write: false, format: "esm", platform: "node",
});
const { fileIconId, folderIconId, iconUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
const catalog = JSON.parse(await readFile(new URL("../client/generated/catalog.json", import.meta.url)));

test("research documents and normal programming files have useful associations", () => {
  for (const name of ["paper.tex", "references.bib", "journal.bst", "macro.sty", "x.bbx", "x.cbx"]) {
    assert.equal(fileIconId(name), "file_type_tex", name);
  }
  assert.equal(fileIconId("C:\\papers\\MAIN.TEX"), "file_type_tex");
  assert.equal(fileIconId("analysis.py"), "file_type_python");
  assert.equal(fileIconId("notes.md"), "file_type_markdown");
  assert.equal(fileIconId("README.md"), "file_type_readme");
  assert.equal(fileIconId("data.json"), "file_type_json");
  assert.equal(fileIconId("unknown.xyz-never-known"), catalog.defaults.file);
  assert.equal(fileIconId("constructor"), catalog.defaults.file);
  assert.equal(fileIconId("__proto__"), catalog.defaults.file);
});

test("filenames and compound suffixes win over generic extensions", () => {
  assert.equal(fileIconId("package.json"), catalog.fileNames["package.json"]);
  assert.notEqual(fileIconId("package.json"), fileIconId("data.json"));
  assert.equal(fileIconId("types.d.ts"), catalog.fileExtensions["d.ts"]);
  assert.notEqual(fileIconId("types.d.ts"), fileIconId("index.ts"));
  assert.equal(fileIconId("babel.config.cjs"), catalog.fileNames["babel.config.cjs"]);
  assert.equal(fileIconId(".gitignore"), catalog.fileNames[".gitignore"]);
});

test("drawio compound suffixes are normalized and take precedence over image suffixes", () => {
  for (const stem of ["drawio", "dio"]) {
    for (const ext of ["png", "svg"]) {
      const suffix = `${stem}.${ext}`;
      assert.equal(fileIconId(`diagram.${suffix}`), "file_type_drawio", suffix);
      assert.equal(fileIconId(`C:\\diagrams\\DIAGRAM.${suffix.toUpperCase()}`), "file_type_drawio");
      assert.equal(fileIconId(`.${suffix}`), "file_type_drawio");
      assert.equal(catalog.fileExtensions[suffix], "file_type_drawio");
      assert.equal(Object.hasOwn(catalog.fileExtensions, `.${suffix}`), false);
      assert.notEqual(fileIconId(`diagram.${ext}`), "file_type_drawio");
      assert.notEqual(fileIconId(`diagram.${suffix}.txt`), "file_type_drawio");
    }
  }
  assert.equal(fileIconId(".gitignore"), catalog.fileNames[".gitignore"]);
  assert.equal(Object.hasOwn(catalog.fileNames, "gitignore"), false);
});

test("named folders have closed and opened artwork; light variants are respected", () => {
  const src = folderIconId("src");
  assert.notEqual(src, catalog.defaults.folder);
  assert.equal(folderIconId("src", true), `${src}_opened`);
  assert.notEqual(iconUrl(src), iconUrl(`${src}_opened`));
  assert.notEqual(iconUrl("file_type_tex"), iconUrl("file_type_tex", true));
  assert.equal(folderIconId("unnamed-private-folder", true), "default_folder_opened");
});

test("every generated association resolves to bundled, local SVG artwork", () => {
  const ids = [...Object.values(catalog.fileNames), ...Object.values(catalog.fileExtensions),
    ...Object.values(catalog.folderNames), ...Object.values(catalog.defaults)];
  for (const id of ids) assert.match(catalog.icons[id], /<svg[\s>]/, id);
  for (const id of Object.values(catalog.folderNames)) {
    assert.match(catalog.icons[`${id}_opened`], /<svg[\s>]/, `${id}_opened`);
  }
  for (const id of Object.values(catalog.lightIcons)) assert.match(catalog.icons[id], /<svg[\s>]/, id);
  for (const svg of Object.values(catalog.icons)) {
    // Six upstream SVGs contain an empty <script/> placeholder. Preserve those
    // unchanged; reject scripts with content and any external image resources.
    assert.doesNotMatch(svg, /<script\b(?!\s*\/>)|<foreignObject\b|(?:href|src)\s*=\s*["']https?:/i);
  }
  assert.equal(catalog.source.version, "13.0.0");
  assert.match(catalog.source.commit, /^[0-9a-f]{40}$/);
});
