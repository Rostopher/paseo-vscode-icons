import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["tests/browser/fixture.tsx"], bundle: true, write: false, format: "iife",
  platform: "browser", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "host-platform", setup(bundler) {
    bundler.onResolve({ filter: /^react-native$/ }, () => ({ path: "react-native", namespace: "host" }));
    bundler.onLoad({ filter: /.*/, namespace: "host" }, () => ({
      contents: "export const Platform = { OS: globalThis.testPlatform ?? 'web' };",
    }));
  } }],
});
const source = result.outputFiles[0].text;
const mark = "[data-paseo-vscode-icons-slot]";
const row = index => `[data-testid="file-explorer-row-${index}"]`;
const image = (page, index) => page.locator(`${row(index)} .entry-icon`).evaluate(
  slot => getComputedStyle(slot, "::after").backgroundImage,
);

async function load(page, platform = "web") {
  await page.setContent(`<style>
    body { background: #18181b; color: #eee; font: 14px system-ui; }
    body.light { background: #fafafa; color: #222; }
    .row { padding: 6px 12px; cursor: pointer; }
    .entry-info { display:flex; align-items:center; gap:8px; }
    .entry-icon, .chevron { width:16px; height:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; }
    .entry-name { flex:1; }
    </style><div id="root"></div>
    <div data-testid="unrelated"><svg><path d="m9 18 6-6-6-6" /></svg>Chat</div>`);
  await page.evaluate(value => { globalThis.testPlatform = value; }, platform);
  await page.addScriptTag({ content: source });
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const next = () => ++frames === 8 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
}

test("native files and folders gain icons while clicks and context menus remain native", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await load(page);
  await page.evaluate(() => {
    fixture.entries([{ name: "src", folder: true }, { name: "paper.tex" }, { name: "journal.bst" }, { name: "package.json" }]);
    globalThis.original = document.querySelector('[data-native-icon]');
    fixture.install();
  });
  await expect(page.locator(mark)).toHaveCount(4);
  expect(
    await page.locator(`${row(0)} .entry-icon`).evaluate(slot => getComputedStyle(slot).width),
  ).toBe("40px");
  expect(
    await page.locator(`${row(1)} .entry-icon`).evaluate(slot => getComputedStyle(slot).width),
  ).toBe("40px");
  expect(await image(page, 1)).toContain("data:image/svg+xml");
  expect(await image(page, 1)).toBe(await image(page, 2));
  const closed = await image(page, 0);
  await page.locator(row(0)).click();
  await expect.poll(() => image(page, 0)).not.toBe(closed);
  await page.locator(row(1)).click();
  await page.locator(row(1)).click({ button: "right" });
  expect(await page.evaluate(() => fixture.events)).toEqual(["click:src", "click:paper.tex", "context:paper.tex"]);
  expect(await page.evaluate(() => original === document.querySelector('[data-native-icon]'))).toBe(true);
  await expect(page.locator('[data-testid="unrelated"]')).not.toHaveAttribute("data-paseo-vscode-icons-slot");
  await page.screenshot({ path: "test-results/native-tree-desktop.png" });
  expect(errors).toEqual([]);
});

test("rename, recycled rows, loading folders, remounting and themes follow host updates", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { fixture.install(); fixture.entries([{ name: "paper.tex" }]); });
  await expect(page.locator(mark)).toHaveCount(1);
  const tex = await image(page, 0);
  await page.evaluate(() => { document.body.className = "light"; });
  await expect.poll(() => image(page, 0)).not.toBe(tex);
  const lightTex = await image(page, 0);
  await page.evaluate(() => fixture.entries([{ name: "analysis.py" }]));
  await expect.poll(() => image(page, 0)).not.toBe(lightTex);
  await page.evaluate(() => fixture.entries([{ name: "src", folder: true, loading: true }]));
  await expect(page.locator(mark)).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toBeVisible();
  await page.evaluate(() => fixture.entries([{ name: "src", folder: true, expanded: true }]));
  await expect(page.locator(mark)).toHaveAttribute("data-paseo-vscode-icons-slot", "folder");
  await page.evaluate(() => fixture.visible(false));
  await expect(page.locator(mark)).toHaveCount(0);
  await page.evaluate(() => fixture.visible(true));
  await expect(page.locator(mark)).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 740 });
  await expect(page.locator(`${row(0)} .entry-name`)).toBeVisible();
});

test("multiple host installations share one observer and the last cleanup restores native icons", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    fixture.entries([{ name: "src", folder: true }, { name: "paper.tex" }]);
    fixture.install(); fixture.install();
  });
  await expect(page.locator(mark)).toHaveCount(2);
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(1);
  await page.evaluate(() => fixture.release());
  await expect(page.locator(mark)).toHaveCount(2);
  await page.evaluate(() => fixture.release());
  await expect(page.locator(mark)).toHaveCount(0);
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(0);
  await expect(page.locator('[data-native-icon]')).toBeVisible();
  expect(await page.locator(`${row(0)} .entry-icon`).evaluate(slot => getComputedStyle(slot).width)).toBe("16px");
  await page.evaluate(() => fixture.entries([{ name: "other.tex" }]));
  await expect(page.locator(mark)).toHaveCount(0);
});

test("unsupported native mobile clients retain their host UI", async ({ page }) => {
  await load(page, "ios");
  await page.evaluate(() => { fixture.entries([{ name: "paper.tex" }]); fixture.install(); });
  await expect(page.locator(mark)).toHaveCount(0);
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(0);
});

test("unrecognized host markup keeps native icons and settled trees do not spin", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { fixture.entries([{ name: "paper.tex" }]); fixture.install(); });
  await expect(page.locator(mark)).toHaveCount(1);
  await page.evaluate(() => {
    globalThis.mutations = 0;
    globalThis.counter = new MutationObserver(records => { mutations += records.length; });
    counter.observe(document.querySelector('[data-testid="file-explorer-tree-scroll"]'), {
      attributes: true, childList: true, subtree: true,
    });
  });
  // Give the observer several animation frames, without mutating the host UI.
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const next = () => ++frames === 8 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  expect(await page.evaluate(() => mutations)).toBe(0);
  await page.evaluate(() => {
    counter.disconnect();
    const slot = document.querySelector('.entry-icon');
    const unknown = document.createElement('div');
    unknown.textContent = 'Native icon';
    slot.replaceChildren(unknown);
  });
  await expect(page.locator(mark)).toHaveCount(0);
  await expect(page.getByText("Native icon", { exact: true })).toBeVisible();
});

test("connected rows moved out of the native tree restore their original artwork and CSS priority", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    fixture.entries([{ name: "paper.tex" }]);
    globalThis.moving = document.querySelector('[data-testid="file-explorer-row-0"]');
    globalThis.slot = moving.querySelector('.entry-icon');
    globalThis.nativeSvg = slot.firstElementChild;
    slot.style.setProperty('--paseo-vscode-icons-image', 'url("native-slot.svg")', 'important');
    fixture.install();
  });
  await expect(page.locator(mark)).toHaveCount(1);
  await page.evaluate(() => document.querySelector('[data-testid="unrelated"]').append(moving));
  await expect(page.locator(mark)).toHaveCount(0);
  expect(await page.evaluate(() => ({
    image: slot.style.getPropertyValue('--paseo-vscode-icons-image'),
    priority: slot.style.getPropertyPriority('--paseo-vscode-icons-image'),
    nativeNode: nativeSvg === slot.firstElementChild,
    visibility: getComputedStyle(nativeSvg).visibility,
    connected: moving.isConnected,
  }))).toEqual({ image: 'url("native-slot.svg")', priority: 'important', nativeNode: true,
    visibility: 'visible', connected: true });
  await page.evaluate(() => document.querySelector('[data-testid="file-explorer-tree-scroll"]').append(moving));
  await expect(page.locator(mark)).toHaveCount(1);
  await page.evaluate(() => fixture.release());
  await expect(page.locator(mark)).toHaveCount(0);
  expect(await page.evaluate(() => slot.style.getPropertyPriority('--paseo-vscode-icons-image'))).toBe('important');
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(0);
});

test("rows moved between two recognized native trees retain decoration and update their theme", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    fixture.entries([{ name: "paper.tex" }]);
    globalThis.firstTree = document.querySelector('[data-testid="file-explorer-tree-scroll"]');
    globalThis.secondTree = document.createElement('div');
    secondTree.setAttribute('data-testid', 'file-explorer-tree-scroll');
    secondTree.style.backgroundColor = '#fafafa';
    document.body.append(secondTree);
    globalThis.moving = firstTree.firstElementChild;
    globalThis.slot = moving.querySelector('.entry-icon');
    globalThis.nativeSvg = slot.firstElementChild;
    fixture.install(); fixture.install();
  });
  await expect(page.locator(mark)).toHaveCount(1);
  await settle(page);
  const dark = await image(page, 0);
  await page.evaluate(() => {
    globalThis.markerChanges = 0;
    globalThis.counter = new MutationObserver(records => { markerChanges += records.length; });
    counter.observe(slot, { attributes: true, attributeFilter: ['data-paseo-vscode-icons-slot'] });
    secondTree.append(moving);
  });
  await expect.poll(() => image(page, 0)).not.toBe(dark);
  await page.evaluate(() => firstTree.append(moving));
  await expect.poll(() => image(page, 0)).toBe(dark);
  await settle(page);
  expect(await page.evaluate(() => markerChanges)).toBe(0);
  expect(await page.evaluate(() => nativeSvg === slot.firstElementChild)).toBe(true);
  await page.evaluate(() => { counter.disconnect(); fixture.release(); });
  await expect(page.locator(mark)).toHaveCount(1);
  await page.evaluate(() => fixture.release());
  await expect(page.locator(mark)).toHaveCount(0);
  expect(await page.evaluate(() => slot.style.getPropertyValue('--paseo-vscode-icons-image'))).toBe('');
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(0);
});

test("a tree that loses its native identity restores slots and stops decorating subsequent rows", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    fixture.entries([{ name: "paper.tex" }]);
    globalThis.formerTree = document.querySelector('[data-testid="file-explorer-tree-scroll"]');
    globalThis.nativeSvg = formerTree.querySelector('[data-native-icon]');
    fixture.install();
  });
  await expect(page.locator(mark)).toHaveCount(1);
  await page.evaluate(() => formerTree.setAttribute('data-testid', 'changes-tree'));
  await expect(page.locator('[data-testid="file-explorer-tree-scroll"]')).toHaveCount(0);
  await expect(page.locator(mark)).toHaveCount(0);
  expect(await page.evaluate(() => formerTree.querySelector('[data-native-icon]') === nativeSvg)).toBe(true);
  await expect(page.locator('[data-native-icon]')).toBeVisible();
  await page.evaluate(() => {
    const newRow = formerTree.firstElementChild.cloneNode(true);
    newRow.setAttribute('data-testid', 'file-explorer-row-1');
    newRow.querySelector('.entry-name').setAttribute('data-testid', 'file-explorer-row-1-name');
    formerTree.append(newRow);
  });
  await settle(page);
  await expect(page.locator(mark)).toHaveCount(0);
  expect(await page.locator('.entry-icon').evaluateAll(slots => slots.every(
    slot => slot.style.getPropertyValue('--paseo-vscode-icons-image') === '',
  ))).toBe(true);
  await page.evaluate(() => formerTree.setAttribute('data-testid', 'file-explorer-tree-scroll'));
  await expect(page.locator(mark)).toHaveCount(2);
  await page.evaluate(() => formerTree.remove());
  await settle(page);
  expect(await page.evaluate(() => [...formerTree.querySelectorAll('.entry-icon')].every(slot =>
    !slot.hasAttribute('data-paseo-vscode-icons-slot') &&
    slot.style.getPropertyValue('--paseo-vscode-icons-image') === '',
  ))).toBe(true);
  await page.evaluate(() => fixture.release());
  await expect(page.locator('[data-paseo-vscode-icons-style]')).toHaveCount(0);
});

test("unrelated streaming does not rescan native trees or document roots", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { fixture.entries([{ name: "paper.tex" }]); fixture.install(); });
  await expect(page.locator(mark)).toHaveCount(1);
  await settle(page);
  await page.evaluate(() => {
    globalThis.searches = { roots: 0, trees: 0 };
    const tree = document.querySelector('[data-testid="file-explorer-tree-scroll"]');
    for (const node of [document, document.documentElement, document.body, tree]) {
      const query = node.querySelectorAll;
      node.querySelectorAll = function(...args) {
        searches[node === tree ? 'trees' : 'roots']++;
        return query.apply(this, args);
      };
    }
    const unrelated = document.querySelector('[data-testid="unrelated"]');
    for (let index = 0; index < 20; index++) {
      const chunk = document.createElement('span');
      chunk.textContent = `Stream ${index}`;
      unrelated.append(chunk);
      chunk.firstChild.textContent += '.';
    }
  });
  await settle(page);
  expect(await page.evaluate(() => searches)).toEqual({ roots: 0, trees: 0 });
});

test("CSSOM-only theme edits refresh after all plugin instances are reloaded", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { fixture.entries([{ name: "paper.tex" }]); fixture.install(); fixture.install(); });
  await expect(page.locator(mark)).toHaveCount(1);
  const dark = await image(page, 0);
  await page.evaluate(() => {
    document.querySelector('style').sheet.insertRule('body { background: #fafafa; color: #222; }', 2);
  });
  await settle(page);
  expect(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor)).toBe('rgb(250, 250, 250)');
  expect(await image(page, 0)).toBe(dark);
  await page.evaluate(() => { fixture.release(); fixture.release(); fixture.install(); fixture.install(); });
  await expect.poll(() => image(page, 0)).not.toBe(dark);
  const light = await image(page, 0);
  // Stylesheet text changes do emit DOM mutations and must update existing slots.
  await page.evaluate(() => { document.querySelector('style').textContent += 'body { background: #18181b; color: #eee; }'; });
  await expect.poll(() => image(page, 0)).not.toBe(light);
});
