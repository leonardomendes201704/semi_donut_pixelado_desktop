import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

const BASE = process.env.GAME_URL || "http://127.0.0.1:8765/index.html?test=1";

function resolveChromiumExecutable() {
  const root = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  const headlessShell = path.join(
    root,
    "chromium_headless_shell-1148",
    "chrome-win",
    "headless_shell.exe"
  );
  if (fs.existsSync(headlessShell)) {
    return headlessShell;
  }
  const fullChrome = path.join(
    root,
    "chromium-1148",
    "chrome-win",
    "chrome.exe"
  );
  if (fs.existsSync(fullChrome)) {
    return fullChrome;
  }
  return null;
}

async function main() {
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  const page = await browser.newPage();

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 15000 });

  const apiPick = await page.evaluate(() => {
    const api = window.SemiDonutPrototype;
    if (!api.__test) {
      return { ok: false, error: "missing __test (use ?test=1)" };
    }
    api.restart();
    api.__test.openDraft([
      "cadencia_frenetica",
      "mira_lenta",
      "perfurador_mk2"
    ]);
    api.__test.pick("cadencia_frenetica");
    const state = api.__test.internal();
    const benchMs = api.__test.benchUpdates(180);
    if (state.draftPaused || state.draftActive) {
      return { ok: false, error: "draft still active after pick", state };
    }
    if (state.gameOver) {
      return { ok: false, error: "unexpected game over", state };
    }
    if (state.fireIntervalMult >= 1) {
      return { ok: false, error: "cadencia did not reduce fire interval", state };
    }
    if (benchMs > 4000) {
      return { ok: false, error: "update loop too slow: " + benchMs + "ms", state };
    }
    return { ok: true, state, benchMs };
  });

  if (!apiPick.ok) {
    await browser.close();
    console.error("FAIL api pick:", apiPick);
    process.exit(1);
  }

  await page.evaluate(() => {
    window.SemiDonutPrototype.restart();
    window.SemiDonutPrototype.__test.openDraft([
      "cadencia_frenetica",
      "mira_lenta",
      "perfurador_mk2"
    ]);
  });

  await page.click("button.draft-card:has-text(\"Cadência Frenética\")");

  const uiPick = await page.evaluate(() => {
    const state = window.SemiDonutPrototype.__test.internal();
    const benchMs = window.SemiDonutPrototype.__test.benchUpdates(180);
    return { state, benchMs };
  });

  if (uiPick.state.draftPaused || uiPick.state.draftActive) {
    await browser.close();
    console.error("FAIL ui pick:", uiPick);
    process.exit(1);
  }

  await browser.close();
  console.log("PASS cadencia draft", { apiPick, uiPick });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
