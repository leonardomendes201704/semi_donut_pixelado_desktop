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

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SessionMeta = require("../session-meta.js");

const emptyMeta = SessionMeta.createSessionMeta();
const frag = SessionMeta.computeRunFragments(
  { level: 3, multiTier: 2, rowsDropped: 16 },
  emptyMeta
);
assert.equal(frag.total, 32);
assert.equal(frag.beatLevel, true);
assert.equal(frag.beatTier, true);

const noRecord = SessionMeta.computeRunFragments(
  { level: 3, multiTier: 2, rowsDropped: 16 },
  { bestLevel: 5, bestMultiTier: 5 }
);
assert.equal(noRecord.total, 22);

const awarded = SessionMeta.awardRunEnd(emptyMeta, {
  level: 3,
  multiTier: 2,
  rowsDropped: 16
});
assert.equal(awarded.fragments, 32);
assert.equal(emptyMeta.fragments, 32);

const buy = SessionMeta.tryPurchase(emptyMeta, "meta_xp");
assert.equal(buy.ok, true);
assert.equal(emptyMeta.stacks.meta_xp, 1);
assert.equal(SessionMeta.getSessionBonuses(emptyMeta).xpMult, 1.05);

console.log("PASS test:unit cadencia_frenetica");
console.log("PASS test:unit session_meta_fragments");
