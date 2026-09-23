import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadGameCards() {
  const code = fs.readFileSync(path.join(root, "cards.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: "cards.js" });
  return sandbox.window.GameCards;
}

const GameCards = loadGameCards();
const noopCtx = {
  fireBurst() {},
  lockCannonSweep() {},
  applyNextMultiDiscount() {},
  grantDraftReroll() {},
  applyMysteryCard() {}
};

const owned = {};
const modifiers = GameCards.createDefaultModifiers();
GameCards.applyCardPick("cadencia_frenetica", owned, modifiers, noopCtx);

assert.equal(owned.cadencia_frenetica, 1);
assert.equal(modifiers.fireIntervalMult, 0.8);

GameCards.applyCardPick("cadencia_frenetica", owned, modifiers, noopCtx);
assert.equal(owned.cadencia_frenetica, 2);
assert.ok(Math.abs(modifiers.fireIntervalMult - 0.64) < 1e-9);

const fireIntervalSec = Math.max(
  0.05,
  (300 / 1000) * Math.max(0.28, modifiers.fireIntervalMult)
);
assert.ok(fireIntervalSec >= 0.05 && Number.isFinite(fireIntervalSec));

assert.equal(GameCards.playerXpToNext(1), 83);
assert.ok(Math.abs(GameCards.scalePlayerXp(10) - 1.4) < 1e-9);

console.log("PASS test:unit cadencia_frenetica");
