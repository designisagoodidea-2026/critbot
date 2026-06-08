// code.js — Critbot Figma plugin, SANDBOX / MAIN THREAD
//
// This runs in Figma's sandbox: it HAS the `figma` API (read/write the
// document) but NO DOM. The panel UI lives in ui.html (iframe, no figma API).
// The two halves talk ONLY via postMessage:
//   here → UI : figma.ui.postMessage(msg)
//   UI → here : figma.ui.onmessage = (msg) => { ... }
//
// v1 skeleton scope: render the action-item queue (Screen 3 stub), let the
// designer jump to the anchored frame(s) and toggle item status. All data is
// SYNTHETIC — no CoS intel, no real transcripts (see CLAUDE.md air-gap rule).

// --- Synthetic crit record (stand-in for the backend's structured output) ---
// Shape mirrors docs/data-model.md → ActionItem.
const SYNTHETIC_QUEUE = [
  {
    id: "ai-001",
    content: "Unclear what this page is for — state the design intent up top.",
    type: "concern",
    scope: ["design-level"],
    targets: [], // design-level feedback legitimately has no node targets
    transcriptAnchor: { t: "00:02:14", speaker: "Reviewer A" },
    rubricTag: "Design Intent",
    status: "open"
  },
  {
    id: "ai-002",
    content: "Primary CTA loses contrast on the hero — fails AA.",
    type: "suggestion",
    scope: ["single-frame"],
    targets: [], // populate with real node IDs via guess-then-confirm in review
    transcriptAnchor: { t: "00:07:48", speaker: "Reviewer B" },
    rubricTag: "Accessibility",
    status: "open"
  },
  {
    id: "ai-003",
    content: "Card type scale is inconsistent across the component set.",
    type: "suggestion",
    scope: ["component-set"],
    targets: [],
    transcriptAnchor: { t: "00:12:03", speaker: "Reviewer A" },
    rubricTag: "Typography",
    status: "open"
  }
];

figma.showUI(__html__, { width: 360, height: 560 });

// Hand the queue to the UI once it's ready.
figma.ui.postMessage({ kind: "load-queue", queue: SYNTHETIC_QUEUE });

figma.ui.onmessage = (msg) => {
  switch (msg.kind) {
    case "focus-targets":
      focusTargets(msg.targets || []);
      break;
    case "status-change":
      // Skeleton: status lives in the UI for now. When the backend is wired,
      // persist this back to the crit record here.
      figma.notify(`Item ${msg.id} → ${msg.status}`);
      break;
    case "record-loaded":
      figma.notify("Crit record loaded — reviewing action items.");
      break;
    case "close":
      figma.closePlugin();
      break;
  }
};

// Select + zoom to the node(s) an action item is anchored to.
async function focusTargets(nodeIds) {
  if (!nodeIds.length) {
    figma.notify("Design-level item — no specific frame to focus.");
    return;
  }
  const nodes = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && "type" in node) nodes.push(node);
  }
  if (!nodes.length) {
    figma.notify("Anchored node(s) not found in this file.");
    return;
  }
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}
