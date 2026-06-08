// main.js — Critbot desktop app (Electron). Packages the live experience into a
// Mac app that is BOTH a menubar (Tray) item AND a desktop window. The relay
// runs in-process (no separate terminal), reusing core/live/relay.js + the
// shared HTTP layer; it reads keys from core/live/.env just like the CLI relay.
//
//   menubar Tray ──(show/hide, start, quit)
//   BrowserWindow ── loads http://127.0.0.1:<port>/live/  (the same web app)
//   in-process relay ── serves the page + bridges mic↔Deepgram + LLM/record APIs
//
// Smoke mode: set CRITBOT_SMOKE=1 to boot, verify the relay serves, then quit
// (used for headless CI in a Linux sandbox — see README).

"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const http = require("http");
const relayHttp = require("../live/relayHttp");
const { createRelayServer } = require("../live/relay");

const PORT = Number(process.env.PORT) || 8787;
const URL = `http://127.0.0.1:${PORT}/live/`;
let win = null, tray = null, server = null;

function startRelay() {
  relayHttp.loadEnv();                 // reads core/live/.env (same keys as the CLI)
  const r = createRelayServer();
  server = r.server;
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => {
    console.log(`[critbot] relay listening on ${URL} (deepgram key: ${r.hasKey ? "yes" : "MISSING"}, llm: ${r.llmOn})`);
    resolve(r);
  }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 860, show: false, title: "Critbot",
    backgroundColor: "#0f1115",
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(URL);
  win.once("ready-to-show", () => { if (!process.env.CRITBOT_SMOKE) win.show(); });
  win.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } }); // menubar app: close → hide
  return win;
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty()); // macOS shows the title text in the menu bar
    tray.setTitle("● Critbot");
    const menu = Menu.buildFromTemplate([
      { label: "Open Critbot", click: () => { win.show(); win.focus(); } },
      { label: "Libraries", click: () => shell.openExternal(`http://127.0.0.1:${PORT}/live/libraries.html`) },
      { label: "Roster", click: () => shell.openExternal(`http://127.0.0.1:${PORT}/live/roster.html`) },
      { type: "separator" },
      { label: "Quit Critbot", click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip("Critbot — live design critique");
    tray.setContextMenu(menu);
    tray.on("click", () => { win.isVisible() ? win.hide() : (win.show(), win.focus()); });
  } catch (e) {
    console.warn("[critbot] tray unavailable (fine on headless Linux):", e.message);
  }
}

app.whenReady().then(async () => {
  await startRelay();
  createWindow();
  createTray();

  win.webContents.on("did-finish-load", () => {
    console.log("[critbot] window loaded:", URL);
    if (process.env.CRITBOT_SMOKE) {
      http.get(URL, (res) => {
        console.log("[critbot] SMOKE: relay responded", res.statusCode);
        console.log(res.statusCode === 200 ? "[critbot] SMOKE OK" : "[critbot] SMOKE FAIL");
        app.isQuitting = true; app.quit();
      }).on("error", (err) => { console.log("[critbot] SMOKE FAIL:", err.message); app.isQuitting = true; app.quit(); });
    }
  });
});

app.on("window-all-closed", (e) => { /* menubar app stays resident */ if (process.env.CRITBOT_SMOKE) app.quit(); });
app.on("before-quit", () => { app.isQuitting = true; if (server) try { server.close(); } catch (_) {} });
