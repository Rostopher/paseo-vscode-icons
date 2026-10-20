import { Platform } from "react-native";
import { fileIconId, folderIconId, iconUrl } from "./icons";

// Deliberately local: the plugin has no DOM dependency on iOS or Android.
interface DomStyle {
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
  setProperty(name: string, value: string, priority?: string): void;
  removeProperty(name: string): string;
}
interface DomNode {
  readonly nodeType: number;
  readonly parentElement: DomElement | null;
}
interface DomElement extends DomNode {
  readonly tagName: string;
  readonly isConnected: boolean;
  readonly firstElementChild: DomElement | null;
  readonly previousElementSibling: DomElement | null;
  readonly children: ArrayLike<DomElement>;
  readonly style: DomStyle;
  textContent: string | null;
  matches(selector: string): boolean;
  closest(selector: string): DomElement | null;
  contains(node: DomNode): boolean;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  appendChild(node: DomElement): void;
  remove(): void;
}
interface DomMutation {
  readonly target: DomNode;
  readonly addedNodes: ArrayLike<DomNode>;
}
interface DomObserver {
  observe(target: DomNode, options: {
    childList?: boolean;
    subtree?: boolean;
    attributes?: boolean;
    attributeFilter?: string[];
    characterData?: boolean;
  }): void;
  disconnect(): void;
}
interface Installation { references: number; dispose(): void }
declare const document: {
  readonly body: DomElement;
  readonly head: DomElement;
  readonly documentElement: DomElement;
  createElement(tag: string): DomElement;
  [key: symbol]: Installation | undefined;
};
declare const window: {
  getComputedStyle(element: DomElement): { color: string; backgroundColor: string; transform: string };
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
};
declare const MutationObserver: new (callback: (records: DomMutation[]) => void) => DomObserver;

const TREE = '[data-testid="file-explorer-tree-scroll"]';
const ROW = '[data-testid^="file-explorer-row-"]';
const MARK = "data-paseo-vscode-icons-slot";
const IMAGE = "--paseo-vscode-icons-image";
const SHARED = Symbol.for("frowang.paseo-vscode-icons.installation.v1");

// Keep React's SVG and disclosure chevron mounted. Only the file artwork is hidden;
// folder icons sit beside the native chevron so loading and expansion stay native.
const CSS = `
[${MARK}] {
  position: relative !important;
}
[${MARK}]::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  background-image: var(${IMAGE});
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
}
[${MARK}="file"] > * { visibility: hidden !important; }
[${MARK}="folder"] {
  width: 40px !important;
  min-width: 40px !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
}
`;

function element(node: DomNode): DomElement | null {
  return node.nodeType === 1 ? node as DomElement : node.parentElement;
}

function lightTheme(label: DomElement): boolean {
  // Read the app's actual surface rather than the OS preference, which can differ.
  for (let node: DomElement | null = label; node; node = node.parentElement) {
    const rgba = window.getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (rgba && rgba.length >= 3 && (rgba[3] ?? 1) > 0.95) {
      return rgba[0] * 0.2126 + rgba[1] * 0.7152 + rgba[2] * 0.0722 > 128;
    }
  }
  const rgb = window.getComputedStyle(label).color.match(/[\d.]+/g)?.map(Number);
  return Boolean(rgb && rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 128);
}

function folderState(slot: DomElement): boolean | null {
  const wrapper = slot.firstElementChild;
  if (!wrapper || wrapper.tagName.toLowerCase() === "svg") return null;
  // TreeChevron in Paseo 0.12.x is a ChevronRight inside a rotated View.
  const path = wrapper.querySelector("svg path, svg polyline");
  const d = path?.getAttribute("d")?.replace(/[\s,]+/g, " ").trim();
  const points = path?.getAttribute("points")?.replace(/[\s,]+/g, " ").trim();
  if (d?.toLowerCase() !== "m9 18 6-6-6-6" &&
      points !== "9 18 15 12 9 6") return null;
  const transform = window.getComputedStyle(wrapper).transform;
  if (transform === "none" || transform === "") return false;
  if (/rotate\(90deg\)/.test(transform)) return true;
  const matrix = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
  if (!matrix || matrix.length !== 6) return null;
  if (Math.abs(matrix[0]) < 0.01 && matrix[1] > 0.99) return true;
  return Math.abs(matrix[0] - 1) < 0.01 && Math.abs(matrix[1]) < 0.01 ? false : null;
}

type Decoration = { image: string; priority: string };

function mountTheme(): () => void {
  const sheet = document.createElement("style");
  sheet.setAttribute("data-paseo-vscode-icons-style", "");
  sheet.textContent = CSS;
  document.head.appendChild(sheet);
  const trees = new Set<DomElement>();
  const dirty = new Set<DomElement>();
  const decorated = new Map<DomElement, Decoration>();
  let frame = 0;
  let disposed = false;

  function restore(slot: DomElement) {
    const original = decorated.get(slot);
    if (!original) return;
    slot.removeAttribute(MARK);
    if (original.image) slot.style.setProperty(IMAGE, original.image, original.priority);
    else slot.style.removeProperty(IMAGE);
    decorated.delete(slot);
  }

  function owner(slot: DomElement): DomElement | null {
    const tree = slot.closest(TREE);
    return slot.isConnected && tree && trees.has(tree) ? tree : null;
  }

  function scan(tree: DomElement) {
    const seen = new Set<DomElement>();
    let light: boolean | undefined;
    for (const row of Array.from(tree.querySelectorAll(ROW))) {
      if (row.closest(TREE) !== tree) continue;
      const id = row.getAttribute("data-testid") ?? "";
      if (!/^file-explorer-row-\d+$/.test(id)) continue;
      const label = row.querySelector(`[data-testid="${id}-name"]`);
      const slot = label?.previousElementSibling;
      const name = label?.textContent;
      // A new host layout, input row or loading spinner should retain native artwork.
      if (!label || !slot || !name || slot.children.length !== 1 ||
          slot.querySelector('[role="progressbar"]')) continue;
      const expanded = folderState(slot);
      const file = slot.firstElementChild?.tagName.toLowerCase() === "svg";
      if (expanded === null && !file) continue;
      light ??= lightTheme(label);
      const kind = expanded === null ? "file" : "folder";
      const icon = kind === "file" ? fileIconId(name) : folderIconId(name, expanded!);
      const url = iconUrl(icon, light);
      if (!decorated.has(slot)) decorated.set(slot, {
        image: slot.style.getPropertyValue(IMAGE),
        priority: slot.style.getPropertyPriority(IMAGE),
      });
      if (slot.getAttribute(MARK) !== kind) slot.setAttribute(MARK, kind);
      if (slot.style.getPropertyValue(IMAGE) !== url) slot.style.setProperty(IMAGE, url);
      seen.add(slot);
    }
    for (const slot of decorated.keys()) {
      // Another active tree may now own a moved row; its scan handles that slot.
      if (owner(slot) === tree && !seen.has(slot)) restore(slot);
    }
  }

  function flush() {
    frame = 0;
    if (disposed) return;
    for (const tree of trees) {
      if (!tree.isConnected || !tree.matches(TREE)) { trees.delete(tree); dirty.delete(tree); }
    }
    // Connected rows can leave Files, and a connected tree can lose its identity.
    for (const slot of decorated.keys()) if (!owner(slot)) restore(slot);
    const pending = Array.from(dirty);
    dirty.clear();
    for (const tree of pending) if (trees.has(tree)) scan(tree);
  }

  function schedule(tree?: DomElement) {
    if (tree) { trees.add(tree); dirty.add(tree); }
    else for (const item of trees) dirty.add(item);
    if (!frame) frame = window.requestAnimationFrame(flush);
  }

  function discover(node: DomElement) {
    if (node.matches(TREE)) schedule(node);
    for (const tree of Array.from(node.querySelectorAll(TREE))) schedule(tree);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = element(record.target);
      if (!target) continue;
      const tree = target.closest(TREE);
      if (tree) { schedule(tree); continue; }
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) discover(node as DomElement);
      }
      // Ancestor theme attributes and removal/identity changes need a refresh.
      for (const current of trees) {
        if (!current.isConnected || target.contains(current)) schedule(current);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["class", "style", "data-testid", "d", "points", "data-theme"],
  });
  // Observe stylesheet DOM insertion/removal and text edits, not CSSOM changes
  // such as insertRule() or CSSStyleRule.style updates (see README refresh steps).
  const styles = new MutationObserver(() => schedule());
  styles.observe(document.head, { childList: true, subtree: true, characterData: true });
  discover(document.body);

  return () => {
    disposed = true;
    observer.disconnect();
    styles.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    for (const slot of decorated.keys()) restore(slot);
    trees.clear();
    dirty.clear();
    sheet.remove();
  };
}

/** Shared across host installations; the last cleanup restores the native explorer. */
export function installFileIcons(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined" || !document.body) return () => {};
  let installation = document[SHARED];
  if (!installation) {
    installation = { references: 0, dispose: mountTheme() };
    document[SHARED] = installation;
  }
  installation.references++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installation.references === 0) {
      installation.dispose();
      delete document[SHARED];
    }
  };
}
