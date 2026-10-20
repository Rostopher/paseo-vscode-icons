# Paseo VSCode Icons

Colorful file and folder icons for **Paseo's existing Files explorer**, using artwork and associations from [vscode-icons](https://github.com/vscode-icons/vscode-icons).

The plugin keeps Paseo's native folder arrows, file opening, context menus, dragging, and sorting. It adds icons directly to the existing tree, with 8px between each folder's disclosure arrow and icon.

## Features

- Named folder icons with separate closed and opened artwork.
- Special filenames such as `package.json`, `README.md`, and `.gitignore`.
- Compound extensions, including `.d.ts`, `.drawio.svg`, and `.drawio.png`.
- Research formats such as LaTeX and BibTeX, with additional `.bst`, `.bbx`, `.cbx`, `.lbx`, and `.ltx` associations.
- Light-theme artwork where provided by upstream.
- Bundled icons: no icon downloads or VS Code installation required.

## Install

Requires **Paseo 0.12.x** on both the daemon and desktop/web client. Native iOS and Android clients retain their original icons.

Enable plugins under **Settings → Plugins**, then run this command on the machine hosting the daemon that your client connects to:

```sh
paseo plugin install git:frowang-ai/paseo-vscode-icons
paseo plugin ls
```

Once `paseo-vscode-icons` is running, open the existing Files explorer. Refresh the client if it still shows the previous artwork.

Update or disable the plugin with:

```sh
paseo plugin update paseo-vscode-icons
paseo plugin disable paseo-vscode-icons
```

You can also install a local checkout:

```sh
paseo plugin install /absolute/path/to/paseo-vscode-icons
```

For a local Windows daemon, use a Windows path, for example `paseo plugin install C:\projects\paseo-vscode-icons`.

## Compatibility and behavior

Paseo 0.12.x has no file icon theme registration API. This community plugin uses a desktop/web DOM adapter and preserves React-owned elements. It depends on the native tree's `file-explorer-tree-scroll`, `file-explorer-row-*`, and `TreeChevron` structure. Future Paseo releases need compatibility verification.

Rows whose expected structure cannot be recognized are left alone, and loading folders retain their native spinner. Disabling the last loaded instance restores the original artwork. Multiple installations connected to the same client share one adapter.

The plugin reads displayed filenames to select artwork. It does not read file contents, fetch icons from a server, or include a daemon-side entry. The generated catalog is included in the repository, so installing from Git does not require a build step or adjacent reference checkouts.

### Theme updates

Artwork updates when the adapter observes relevant changes to the tree, ancestor theme attributes such as `class`, `style`, or `data-theme`, or stylesheet DOM nodes/text. CSSOM-only changes, such as `CSSStyleSheet.insertRule()` or `CSSStyleRule.style` updates, wait for the next relevant DOM change.

To refresh immediately after a CSSOM-only change, reload the client, or disable every loaded instance of this plugin and re-enable it. This limitation does not establish that normal Paseo theme switches fail; all host theme-update paths have not been verified.

### Ambiguous extensions

`.cls` retains upstream's Visual Basic for Applications icon because the extension is used by both Visual Basic and LaTeX document classes.

## Development

```sh
git clone https://github.com/frowang-ai/paseo-vscode-icons.git
cd paseo-vscode-icons
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium` if the required browser system libraries are missing.

The browser checks use a React fixture based on Paseo v0.12.0's native file tree. They cover spacing, folder expansion, row reuse, editing, theme changes, native events, and cleanup. Fixture checks do not replace testing in the Paseo desktop app.

After editing an installed local checkout, run:

```sh
paseo plugin reload paseo-vscode-icons
```

### Refresh the upstream catalog

This is needed only when updating the bundled artwork or associations:

```sh
git clone https://github.com/vscode-icons/vscode-icons.git ../vscode-icons
npm run generate:icons -- ../vscode-icons
```

The generator reads upstream mapping modules and SVG files without running the VS Code extension. It records the upstream version and commit in `client/generated/catalog.json`. An alternative checkout path can be passed to `generate:icons`.

## Credits and licenses

This is an independent community plugin, not an official Paseo, Microsoft, or VSCode Icons product.

- Plugin code: [MIT](LICENSE).
- Upstream code and associations: [MIT](licenses/vscode-icons-MIT.txt), by The vscode-icons Contributors.
- Upstream icon artwork: [CC BY-SA 4.0](licenses/CC-BY-SA-4.0.txt), except branded icons, which retain their respective copyright licenses.

SVG artwork is bundled unchanged. See [NOTICE](NOTICE) for attribution and licensing details.
