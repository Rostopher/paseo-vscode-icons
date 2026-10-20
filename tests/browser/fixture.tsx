import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { installFileIcons } from "../../client/web";

// This models TreeRowItem and TreeChevron from Paseo v0.12.0. React owns the
// original children, exercising reconciliation rather than only static HTML.
const root = createRoot(document.querySelector("#root")!);
let entries = [];
let visible = true;
const events = [];
const cleanups = [];
function render() {
  flushSync(() => root.render(visible ? <div data-testid="file-explorer-tree-scroll">
    {entries.map((entry, index) => <div key={index} role="button" tabIndex={0}
      data-testid={`file-explorer-row-${index}`} className="row"
      onClick={() => {
        events.push(`click:${entry.name}`);
        if (entry.folder) { entry.expanded = !entry.expanded; render(); }
      }}
      onContextMenu={event => { event.preventDefault(); events.push(`context:${entry.name}`); }}>
      <div className="entry-info">
        <div className="entry-icon">
          {entry.loading ? <div role="progressbar">Loading</div> : entry.folder
            ? <div className="chevron" style={{ transform: entry.expanded ? "rotate(90deg)" : "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
            : <svg width="16" height="16" viewBox="0 0 24 24" data-native-icon="">
              <path fill="#ccc" d="M4 2h10l6 6v14H4Z" />
            </svg>}
        </div>
        <span data-testid={`file-explorer-row-${index}-name`} className="entry-name">{entry.name}</span>
      </div>
    </div>)}
  </div> : null));
}
globalThis.fixture = {
  events,
  entries(value) { entries = value; render(); },
  visible(value) { visible = value; render(); },
  install() { cleanups.push(installFileIcons()); },
  release() { cleanups.pop()?.(); },
};
render();
