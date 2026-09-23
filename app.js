(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  // ------------------------------------------------------------
  // CONFIGURAÇÃO PRINCIPAL
  // ------------------------------------------------------------
  const CONFIG = {
    virtualWidth: 1400,
    virtualHeight: 900,

    pixelSize: 6,
    pixelGap: 1,

    innerRadius: 245,
    outerRadius: 410,

    // Pequena folga angular entre os 5 setores.
    sectorGapRadians: 0.018,

    // Centro do arco dentro do palco virtual.
    centerX: 700,
    centerY: 690,

    backgroundGrid: true,
    glow: true,

    sectors: [
      { id: 0, name: "amarelo", color: "#ffc928", glow: "#ff9d00" },
      { id: 1, name: "laranja", color: "#ff7b22", glow: "#ff4d00" },
      { id: 2, name: "vermelho", color: "#ff3159", glow: "#ff174d" },
      { id: 3, name: "roxo", color: "#b13cff", glow: "#d500ff" },
      { id: 4, name: "azul", color: "#268cff", glow: "#00b7ff" }
    ],

    cannon: {
      pivotX: 700,
      pivotY: 865,
      fireIntervalMs: 300,
      sweepSecondsOneWay: 2.8,
      projectileSpeed: 540,
      projectileRadius: 4,
      barrelLength: 42,
      barrelWidth: 16
    },

    multi: {
      sectorWeight: [1.0, 1.2, 1.45, 1.75, 2.1],
      maxPierceHits: 8
    },

    descent: {
      intervalMs: 1000,
      startGapAbove: 24
    },

    shapeRotation: {
      minLevel: 2,
      limitRad: Math.PI / 4,
      halfCycleSeconds: 32,
      speedPerLevel: 1
    }
  };

  function getLoseLineY() {
    return CONFIG.cannon.pivotY;
  }

  let draftPaused = false;
  let pendingDrafts = 0;
  let draftOpenScheduled = false;
  let draftResumeTimer = 0;
  let freeDraftReroll = false;
  let draftState = { active: false, options: [], rerollUsed: false };
  let playerProgress = { level: 1, xp: 0 };
  let ownedCards = {};
  let runModifiers = GameCards.createDefaultModifiers();
  let descentPauseTimer = 0;
  let cannonLockSweepTimer = 0;
  let multiRequiredDiscountPending = false;
  let multiRequiredDiscountFactor = 1;
  let comboKillTimestamps = [];
  let lastRowsDroppedForTick = 0;

  const playerLevelEl = document.getElementById("playerLevel");
  const playerXpFillEl = document.getElementById("playerXpFill");
  const playerXpMetaEl = document.getElementById("playerXpMeta");
  const cardInventoryEl = document.getElementById("cardInventory");
  const levelDraftOverlayEl = document.getElementById("levelDraftOverlay");
  const levelDraftTitleEl = document.getElementById("levelDraftTitle");
  const levelDraftSubtitleEl = document.getElementById("levelDraftSubtitle");
  const levelDraftChoicesEl = document.getElementById("levelDraftChoices");
  const levelDraftRerollEl = document.getElementById("levelDraftReroll");
  const stageEl = document.querySelector(".stage");

  const cardContext = {
    fireBurst(count) {
      for (let i = 0; i < count; i++) {
        spawnProjectileFromCannon(0);
      }
    },
    lockCannonSweep(seconds) {
      cannonLockSweepTimer = Math.max(cannonLockSweepTimer, seconds);
    },
    applyNextMultiDiscount(factor) {
      multiRequiredDiscountPending = true;
      multiRequiredDiscountFactor = factor;
    },
    grantDraftReroll() {
      freeDraftReroll = true;
    },
    applyMysteryCard() {
      GameCards.applyMysteryCard(ownedCards, runModifiers, cardContext);
      syncCardInventory();
    }
  };

  function clearDraftResumeTimer() {
    if (!draftResumeTimer) return;
    clearTimeout(draftResumeTimer);
    draftResumeTimer = 0;
  }

  function resetPlayerRun() {
    playerProgress = { level: 1, xp: 0 };
    ownedCards = {};
    runModifiers = GameCards.createDefaultModifiers();
    pendingDrafts = 0;
    clearDraftResumeTimer();
    draftPaused = false;
    draftState.active = false;
    freeDraftReroll = false;
    descentPauseTimer = 0;
    cannonLockSweepTimer = 0;
    multiRequiredDiscountPending = false;
    comboKillTimestamps = [];
    if (levelDraftOverlayEl) levelDraftOverlayEl.hidden = true;
    setDraftUiOpen(false);
    syncPlayerHud();
    syncCardInventory();
  }

  function getPlayerSnapshot() {
    return {
      level: playerProgress.level,
      xp: playerProgress.xp,
      xpToNext: GameCards.playerXpToNext(playerProgress.level),
      ownedCards: { ...ownedCards }
    };
  }

  function getDraftSnapshot() {
    return {
      active: draftState.active,
      pendingDrafts,
      options: draftState.options.map((c) => c.id)
    };
  }

  function syncPlayerHud() {
    if (!playerLevelEl || !playerXpFillEl || !playerXpMetaEl) return;
    const need = GameCards.playerXpToNext(playerProgress.level);
    const ratio = need > 0 ? Math.min(1, playerProgress.xp / need) : 0;
    playerLevelEl.textContent = String(playerProgress.level);
    playerXpFillEl.style.width = (ratio * 100).toFixed(1) + "%";
    playerXpMetaEl.textContent =
      playerProgress.xp.toFixed(1) + " / " + need + " XP";
  }

  function syncCardInventory() {
    if (!cardInventoryEl) return;
    cardInventoryEl.innerHTML = "";
    const ids = Object.keys(ownedCards).filter((id) => ownedCards[id] > 0);
    ids.sort();
    for (const id of ids) {
      const card = GameCards.catalogById[id];
      if (!card) continue;
      let chip = document.createElement("span");
      chip.className = "card-chip";
      chip.title = card.desc;
      chip.textContent = card.name + (ownedCards[id] > 1 ? " ×" + ownedCards[id] : "");
      if (id === "freio_emergencia" && runModifiers.emergencyBrakeCharges > 0) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "card-chip card-chip--usable";
        chip.title = card.desc;
        chip.textContent = card.name + (ownedCards[id] > 1 ? " ×" + ownedCards[id] : "");
        chip.textContent += " [" + runModifiers.emergencyBrakeCharges + "]";
        chip.addEventListener("click", () => useEmergencyBrake());
      } else if (id === "laser_fantasma" && runModifiers.ghostLaserCharges > 0) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "card-chip card-chip--usable";
        chip.title = card.desc;
        chip.textContent = card.name + (ownedCards[id] > 1 ? " ×" + ownedCards[id] : "");
        chip.textContent += " [" + runModifiers.ghostLaserCharges + "]";
        chip.addEventListener("click", () => useGhostLaser());
      } else if (id === "limpeza_borda" && runModifiers.borderCleanCharges > 0) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "card-chip card-chip--usable";
        chip.title = card.desc;
        chip.textContent = card.name + (ownedCards[id] > 1 ? " ×" + ownedCards[id] : "");
        chip.textContent += " [" + runModifiers.borderCleanCharges + "]";
        chip.addEventListener("click", () => useBorderClean());
      }
      cardInventoryEl.appendChild(chip);
    }
  }

  function useEmergencyBrake() {
    if (runModifiers.emergencyBrakeCharges <= 0) return;
    runModifiers.emergencyBrakeCharges -= 1;
    descentPauseTimer = Math.max(descentPauseTimer, 8);
    syncCardInventory();
  }

  function useGhostLaser() {
    if (runModifiers.ghostLaserCharges <= 0) return;
    runModifiers.ghostLaserCharges -= 1;
    fireGhostLaser();
    syncCardInventory();
  }

  function useBorderClean() {
    if (runModifiers.borderCleanCharges <= 0) return;
    runModifiers.borderCleanCharges -= 1;
    cleanLowestActiveRow();
    syncCardInventory();
  }

  function renderDraftUI() {
    if (!levelDraftChoicesEl || !levelDraftTitleEl) return;
    levelDraftTitleEl.textContent =
      "Nível " + playerProgress.level + " — escolha uma carta";
    if (levelDraftSubtitleEl) {
      levelDraftSubtitleEl.textContent =
        "Toque em uma das cartas neste painel (centro). O jogo está pausado até você escolher.";
    }
    levelDraftChoicesEl.innerHTML = "";
    for (const card of draftState.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "draft-card draft-card--" + (card.rarity || "common");
      btn.innerHTML =
        '<span class="draft-card__name">' +
        card.name +
        '</span><span class="draft-card__desc">' +
        card.desc +
        "</span>";
      btn.addEventListener("click", () => pickDraftCard(card.id));
      levelDraftChoicesEl.appendChild(btn);
    }
    if (levelDraftRerollEl) {
      const showReroll = draftState.rerollAvailable && !draftState.rerollUsed;
      levelDraftRerollEl.hidden = !showReroll;
    }
  }

  function setDraftUiOpen(isOpen) {
    if (stageEl) {
      stageEl.classList.toggle("draft-open", isOpen);
    }
  }

  function openDraft() {
    if (draftState.active || gameOver || pendingDrafts <= 0) return;
    draftState.active = true;
    draftPaused = true;
    projectiles.length = 0;
    fireAccumulator = 0;
    descentAccumulator = 0;
    draftState.rerollUsed = false;
    draftState.rerollAvailable = freeDraftReroll;
    freeDraftReroll = false;
    draftState.options = GameCards.rollDraftOptions(ownedCards, 3);
    renderDraftUI();
    if (levelDraftOverlayEl) levelDraftOverlayEl.hidden = false;
    setDraftUiOpen(true);
  }

  function openDraftWithOptions(cardIds) {
    if (draftState.active || gameOver) return;
    draftState.active = true;
    draftPaused = true;
    projectiles.length = 0;
    fireAccumulator = 0;
    descentAccumulator = 0;
    draftState.options = cardIds
      .map((id) => GameCards.catalogById[id])
      .filter(Boolean);
    renderDraftUI();
    if (levelDraftOverlayEl) levelDraftOverlayEl.hidden = false;
    setDraftUiOpen(true);
  }

  function closeDraftAndResume() {
    draftState.active = false;
    draftPaused = false;
    if (levelDraftOverlayEl) levelDraftOverlayEl.hidden = true;
    setDraftUiOpen(false);
    syncCardInventory();
    if (pendingDrafts > 0 && !gameOver) {
      requestAnimationFrame(() => {
        if (pendingDrafts > 0 && !draftState.active && !gameOver) {
          openDraft();
        }
      });
    }
  }

  function pickDraftCard(cardId) {
    if (!draftState.active || gameOver) return;
    GameCards.applyCardPick(cardId, ownedCards, runModifiers, cardContext);
    pendingDrafts = Math.max(0, pendingDrafts - 1);
    fireAccumulator = 0;
    syncPlayerHud();
    closeDraftAndResume();
  }

  function scheduleTryOpenDraft() {
    if (draftOpenScheduled || gameOver) return;
    draftOpenScheduled = true;
    queueMicrotask(() => {
      draftOpenScheduled = false;
      tryOpenDraft();
    });
  }

  function tryOpenDraft() {
    if (gameOver || draftState.active) return;
    if (pendingDrafts <= 0) return;
    openDraft();
  }

  function grantPlayerXp(amount) {
    if (amount <= 0) return;
    playerProgress.xp += amount;
    let leveled = false;
    while (
      playerProgress.xp >= GameCards.playerXpToNext(playerProgress.level)
    ) {
      playerProgress.xp -= GameCards.playerXpToNext(playerProgress.level);
      playerProgress.level += 1;
      pendingDrafts += 1;
      leveled = true;
    }
    syncPlayerHud();
    if (leveled) scheduleTryOpenDraft();
  }

  if (levelDraftRerollEl) {
    levelDraftRerollEl.addEventListener("click", () => {
      if (!draftState.active || draftState.rerollUsed || !draftState.rerollAvailable) {
        return;
      }
      draftState.rerollUsed = true;
      draftState.options = GameCards.rollDraftOptions(ownedCards, 3);
      renderDraftUI();
    });
  }

  function getKillWeight(sectorIndex) {
    let w = CONFIG.multi.sectorWeight[sectorIndex] ?? 1;
    w += runModifiers.sectorWeightBonus[sectorIndex] || 0;
    w += runModifiers.allSectorBonus || 0;
    w *= runModifiers.multiWeightMult || 1;
    return w;
  }

  function getMultiRequiredForTier(tier) {
    return Math.round(10 + 5 * tier + tier * tier * 1.25);
  }

  function consumeMultiRequiredDiscount(required) {
    if (!multiRequiredDiscountPending) return required;
    multiRequiredDiscountPending = false;
    return Math.round(required * multiRequiredDiscountFactor);
  }

  function findNearestActiveCellWorld(px, py, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const cell of cellLookup.values()) {
      if (!cell.active) continue;
      const center = rotateWorldPoint(
        cell.cx,
        cell.cy + shapeOffsetY
      );
      const d = (center.x - px) ** 2 + (center.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = cell;
      }
    }
    return best;
  }

  function killCellAtWorld(cell, patchPx, patchPy, radius, killsOut) {
    if (!cell || !cell.active) return;
    cell.active = false;
    cellLookup.delete(cell.gridKey);
    killsOut.push({
      cx: cell.cx,
      cy: cell.cy,
      sectorIndex: cell.sectorIndex
    });
    patchCellsCanvasAfterHit(patchPx, patchPy, radius);
  }

  function explodeAtWorld(wx, wy, radius, killsOut) {
    const unrot = unrotateWorldPoint(wx, wy);
    wx = unrot.x;
    wy = unrot.y;
    const { inset, size } = getCellHitRect();
    const localPy = wy - shapeOffsetY;
    const pitch = CONFIG.pixelSize;
    const gx0 = Math.floor((wx - radius - gridMinX) / pitch);
    const gx1 = Math.floor((wx + radius - gridMinX) / pitch);
    const gy0 = Math.floor((localPy - radius - gridMinY) / pitch);
    const gy1 = Math.floor((localPy + radius - gridMinY) / pitch);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cell = cellLookup.get(cellGridKey(gx, gy));
        if (!cell || !cell.active) continue;
        const left = cell.x + inset;
        const top = cell.y + inset + shapeOffsetY;
        if (circleIntersectsRect(wx, wy, radius, left, top, size, size)) {
          killCellAtWorld(cell, wx, wy, radius, killsOut);
        }
      }
    }
  }

  function chainFromCell(cell, killsOut) {
    const pitch = CONFIG.pixelSize;
    const parts = cell.gridKey.split(",");
    const gx = parseInt(parts[0], 10);
    const gy = parseInt(parts[1], 10);
    const neighbors = [
      [gx + 1, gy],
      [gx - 1, gy],
      [gx, gy + 1],
      [gx, gy - 1]
    ];
    for (const [nx, ny] of neighbors) {
      const n = cellLookup.get(cellGridKey(nx, ny));
      if (n && n.active && Math.random() < 0.3) {
        killCellAtWorld(n, n.cx, n.cy + shapeOffsetY, CONFIG.cannon.projectileRadius, killsOut);
        break;
      }
    }
  }

  function cleanLowestActiveRow() {
    let maxBottom = -Infinity;
    for (const cell of cellLookup.values()) {
      if (!cell.active) continue;
      const bottom = cellBottomWorldY(cell);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    if (maxBottom === -Infinity) return;
    const kills = [];
    for (const cell of cellLookup.values()) {
      if (!cell.active) continue;
      if (Math.abs(cellBottomWorldY(cell) - maxBottom) < 0.5) {
        killCellAtWorld(
          cell,
          cell.cx,
          cell.cy + shapeOffsetY,
          CONFIG.cannon.projectileRadius,
          kills
        );
      }
    }
    if (kills.length) processKillRewards(kills, false);
  }

  function fireGhostLaser() {
    const dir = getCannonAimDirection(sweepPhi);
    const cannon = CONFIG.cannon;
    const muzzleOffset = cannon.barrelLength - 4;
    let x = cannon.pivotX + dir.x * muzzleOffset;
    let y = cannon.pivotY + dir.y * muzzleOffset;
    const step = CONFIG.pixelSize * 0.5;
    const kills = [];
    for (let i = 0; i < 800; i++) {
      x += dir.x * step;
      y += dir.y * step;
      if (x < 0 || x > CONFIG.virtualWidth || y < 0 || y > CONFIG.virtualHeight) break;
      const hit = unrotateWorldPoint(x, y);
      const result = killCellsHitByProjectile(hit.x, hit.y, cannon.projectileRadius);
      if (result.kills.length) {
        kills.push(...result.kills);
      }
    }
    if (kills.length) processKillRewards(kills, false);
  }

  function spawnProjectileFromCannon(phiOffset) {
    if (gameOver || draftPaused) return;
    const cannon = CONFIG.cannon;
    const phi = sweepPhi + phiOffset;
    const dir = getCannonAimDirection(phi);
    const muzzleOffset = cannon.barrelLength - 4;
    const hitRadius = cannon.projectileRadius + runModifiers.hitRadiusBonus;
    let pierce =
      getPierceForMultiTier(multiState.tier) + runModifiers.pierceBonus;
    pierce = Math.min(CONFIG.multi.maxPierceHits, pierce);
    projectiles.push({
      x: cannon.pivotX + dir.x * muzzleOffset,
      y: cannon.pivotY + dir.y * muzzleOffset,
      vx: dir.x * cannon.projectileSpeed,
      vy: dir.y * cannon.projectileSpeed,
      pierceLeft: pierce,
      powerTier: multiState.tier,
      hitRadius,
      homing: runModifiers.homingStrength
    });
  }

  function processKillRewards(kills, allowCardExtras) {
    if (!kills.length) return;
    const extras = [];
    if (allowCardExtras) {
      for (const kill of kills) {
        if (runModifiers.blueExplosion && kill.sectorIndex === 4) {
          const fx = rotateWorldPoint(kill.cx, kill.cy + shapeOffsetY);
          explodeAtWorld(
            fx.x,
            fx.y,
            8,
            extras
          );
        }
        if (runModifiers.purpleChain && kill.sectorIndex === 3) {
          const cell = cells.find(
            (c) => c.cx === kill.cx && c.cy === kill.cy
          );
          if (cell) chainFromCell(cell, extras);
        }
      }
    }

    const allKills = kills.concat(extras);
    let gained = 0;
    const now = performance.now();
    comboKillTimestamps = comboKillTimestamps.filter((t) => now - t < 1000);
    for (const kill of allKills) {
      const weight = getKillWeight(kill.sectorIndex);
      gained += weight;
      multiState.lastSectorIndex = kill.sectorIndex;
      const fx = rotateWorldPoint(kill.cx, kill.cy + shapeOffsetY);
      spawnFloatingWeight(fx.x, fx.y, weight, kill.sectorIndex);
      spawnImpactRing(fx.x, fx.y, kill.sectorIndex);
      comboKillTimestamps.push(now);
    }

    if (runModifiers.comboSafe && comboKillTimestamps.length >= 3) {
      multiState.meter += 2;
      comboKillTimestamps = [];
    }

    multiState.meter += gained;
    multiState.lifetimeWeighted += gained;
    pulseMultiHud();
    grantPlayerXp(GameCards.scalePlayerXp(gained));

    let tierUps = 0;
    let req = consumeMultiRequiredDiscount(
      getMultiRequiredForTier(multiState.tier)
    );
    while (multiState.meter >= req) {
      multiState.meter -= req;
      multiState.tier += 1;
      tierUps += 1;
      req = getMultiRequiredForTier(multiState.tier);
    }
    if (tierUps > 0) celebrateMultiTierUp();
    syncMultiHud();
  }

  const multiState = {
    tier: 0,
    meter: 0,
    lifetimeWeighted: 0,
    lastSectorIndex: 0
  };

  let tierFlash = 0;
  const floatingTexts = [];
  const impactRings = [];

  const hudTierEl = document.getElementById("multiTier");
  const hudFillEl = document.getElementById("multiFill");
  const hudMetaEl = document.getElementById("multiMeta");
  const hudRootEl = document.getElementById("multiHud");
  const cannonDebugAngleEl = document.getElementById("cannonDebugAngle");
  const cannonDebugMetaEl = document.getElementById("cannonDebugMeta");
  const gameOverOverlayEl = document.getElementById("gameOverOverlay");
  const gameOverRestartEl = document.getElementById("gameOverRestart");

  let shapeBounds = { minY: 0, maxY: 0 };
  let shapeOffsetY = 0;
  let shapeRotationRad = 0;
  let shapeRotationDir = 1;
  let descentAccumulator = 0;
  let rowsDropped = 0;
  let gameOver = false;
  let gameOverReason = "";

  function multiRequiredDelta(tier) {
    return getMultiRequiredForTier(tier);
  }

  function getPierceForMultiTier(tier) {
    return Math.min(CONFIG.multi.maxPierceHits, 1 + tier);
  }

  function getMultiSnapshot() {
    return {
      tier: multiState.tier,
      meter: multiState.meter,
      required: multiRequiredDelta(multiState.tier),
      lifetimeWeighted: multiState.lifetimeWeighted,
      sectorWeights: CONFIG.multi.sectorWeight.slice(),
      pierceForNextShot: getPierceForMultiTier(multiState.tier)
    };
  }

  function resetMulti() {
    multiState.tier = 0;
    multiState.meter = 0;
    multiState.lifetimeWeighted = 0;
    multiState.lastSectorIndex = 0;
    tierFlash = 0;
    syncMultiHud();
  }

  function syncMultiHud() {
    if (!hudTierEl || !hudFillEl || !hudMetaEl) return;

    const required = getMultiRequiredForTier(multiState.tier);
    const ratio = required > 0 ? Math.min(1, multiState.meter / required) : 0;
    const sector = CONFIG.sectors[multiState.lastSectorIndex] || CONFIG.sectors[0];

    hudTierEl.textContent = "×" + (multiState.tier + 1);
    hudFillEl.style.width = (ratio * 100).toFixed(1) + "%";
    hudMetaEl.textContent =
      multiState.meter.toFixed(1) + " / " + required + " → ×" + (multiState.tier + 2);

    if (hudRootEl) {
      hudRootEl.style.setProperty("--multi-accent", sector.color);
      hudRootEl.style.setProperty("--multi-glow", sector.glow);
    }
  }

  function pulseMultiHud() {
    if (!hudRootEl) return;
    hudRootEl.classList.remove("multi-hud--gain");
    void hudRootEl.offsetWidth;
    hudRootEl.classList.add("multi-hud--gain");
  }

  function celebrateMultiTierUp() {
    tierFlash = 0.42;
    if (!hudRootEl) return;
    hudRootEl.classList.remove("multi-hud--tier-up");
    void hudRootEl.offsetWidth;
    hudRootEl.classList.add("multi-hud--tier-up");
  }

  function spawnFloatingWeight(x, y, weight, sectorIndex) {
    const sector = CONFIG.sectors[sectorIndex] || CONFIG.sectors[0];
    floatingTexts.push({
      x,
      y,
      text: "+" + weight.toFixed(1),
      color: sector.color,
      life: 0.65,
      maxLife: 0.65,
      vy: -42
    });
  }

  function spawnImpactRing(x, y, sectorIndex) {
    const sector = CONFIG.sectors[sectorIndex] || CONFIG.sectors[0];
    impactRings.push({
      x,
      y,
      color: sector.glow,
      life: 0.22,
      maxLife: 0.22,
      radius: CONFIG.cannon.projectileRadius
    });
  }

  function registerMultiKills(kills) {
    processKillRewards(kills, true);
  }

  function updateEffects(dt) {
    tierFlash = Math.max(0, tierFlash - dt);

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const fx = floatingTexts[i];
      fx.life -= dt;
      fx.y += fx.vy * dt;
      if (fx.life <= 0) {
        floatingTexts.splice(i, 1);
      }
    }

    for (let i = impactRings.length - 1; i >= 0; i--) {
      const fx = impactRings[i];
      fx.life -= dt;
      fx.radius += 48 * dt;
      if (fx.life <= 0) {
        impactRings.splice(i, 1);
      }
    }
  }

  function projectileColorsForTier(powerTier) {
    const t = Math.min(powerTier, 12);
    if (t >= 6) {
      return { core: "#fffef5", glow: "#ffe566", shadow: 22, trail: 0.014 };
    }
    if (t >= 3) {
      return { core: "#ffe08a", glow: "#ffb347", shadow: 18, trail: 0.011 };
    }
    return { core: "#7cf7ff", glow: "#00e5ff", shadow: 12, trail: 0.008 };
  }

  function drawEffects() {
    for (const ring of impactRings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const fx of floatingTexts) {
      const alpha = Math.max(0, fx.life / fx.maxLife);
      const scale = 1 + (1 - alpha) * 0.35;
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.scale(scale, scale);
      ctx.font = "bold 14px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = fx.color;
      ctx.shadowBlur = 10;
      ctx.fillText(fx.text, 0, 0);
      ctx.restore();
    }

    if (tierFlash > 0) {
      const alpha = tierFlash * 0.35;
      const sector = CONFIG.sectors[multiState.lastSectorIndex] || CONFIG.sectors[0];
      ctx.save();
      ctx.fillStyle = sector.glow;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, CONFIG.virtualWidth, CONFIG.virtualHeight);
      ctx.restore();
    }
  }

  // Cada quadrado do donut vira um objeto independente.
  // Isso deixa o protótipo pronto para, depois, remover pixels,
  // aplicar dano, colisão, pontuação etc.
  let cells = [];
  let projectiles = [];
  let cellLookup = new Map();
  let gridMinX = 0;
  let gridMinY = 0;
  let sweepPhi = Math.PI / 2;
  let pointerVirtualX = CONFIG.cannon.pivotX;
  let pointerVirtualY = CONFIG.cannon.pivotY - 320;
  let pointerOnCanvas = false;
  let fireAccumulator = 0;
  let lastFrameTime = 0;
  let rafId = 0;
  let staticLayerDirty = true;
  const CELL_GLOW_ERASE_PAD = 4;

  const staticBgCanvas = document.createElement("canvas");
  staticBgCanvas.width = CONFIG.virtualWidth;
  staticBgCanvas.height = CONFIG.virtualHeight;
  const staticBgCtx = staticBgCanvas.getContext("2d", { alpha: true });

  const staticCellsCanvas = document.createElement("canvas");
  staticCellsCanvas.width = CONFIG.virtualWidth;
  staticCellsCanvas.height = CONFIG.virtualHeight;
  const staticCellsCtx = staticCellsCanvas.getContext("2d", { alpha: true });

  const Game = {
    targetFps: 60,
    maxDeltaSeconds: 1 / 20,

    markStaticDirty() {
      staticLayerDirty = true;
    },

    update(dt) {
      updateShapeRotation(dt);
      updateDescent(dt);
      updateCannon(dt);
      updateEffects(dt);
    },

    render() {
      if (staticLayerDirty) {
        renderStaticLayer();
        staticLayerDirty = false;
      }
      renderFrame();
    }
  };

  function computeShapeBounds() {
    if (!cells.length) {
      shapeBounds = { minY: 0, maxY: 0 };
      return;
    }

    const { inset, size } = getCellHitRect();
    let minY = Infinity;
    let maxY = -Infinity;

    for (const cell of cells) {
      const top = cell.y + inset;
      const bottom = top + size;
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    }

    shapeBounds = { minY, maxY };
  }

  function isShapeRotationActive() {
    return playerProgress.level >= CONFIG.shapeRotation.minLevel;
  }

  function getShapeRotationRad() {
    return isShapeRotationActive() ? shapeRotationRad : 0;
  }

  function getShapePivotY() {
    return CONFIG.centerY + shapeOffsetY;
  }

  function rotateWorldPoint(ux, uy) {
    const angle = getShapeRotationRad();
    if (Math.abs(angle) < 1e-6) {
      return { x: ux, y: uy };
    }
    const px = CONFIG.centerX;
    const py = getShapePivotY();
    const dx = ux - px;
    const dy = uy - py;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: px + dx * cos - dy * sin,
      y: py + dx * sin + dy * cos
    };
  }

  function unrotateWorldPoint(wx, wy) {
    const angle = getShapeRotationRad();
    if (Math.abs(angle) < 1e-6) {
      return { x: wx, y: wy };
    }
    const px = CONFIG.centerX;
    const py = getShapePivotY();
    const dx = wx - px;
    const dy = wy - py;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      x: px + dx * cos - dy * sin,
      y: py + dx * sin + dy * cos
    };
  }

  function cellBottomWorldY(cell) {
    const { inset, size } = getCellHitRect();
    const bottom = rotateWorldPoint(
      cell.cx,
      cell.y + inset + size + shapeOffsetY
    );
    return bottom.y;
  }

  function updateShapeRotation(dt) {
    if (gameOver || draftPaused || !isShapeRotationActive()) {
      if (!isShapeRotationActive()) {
        shapeRotationRad = 0;
        shapeRotationDir = 1;
      }
      return;
    }

    const limit = CONFIG.shapeRotation.limitRad;
    const baseSpeed =
      (limit * 2) / Math.max(0.5, CONFIG.shapeRotation.halfCycleSeconds);
    const levelsAbove = Math.max(
      0,
      playerProgress.level - CONFIG.shapeRotation.minLevel
    );
    const perLevel = CONFIG.shapeRotation.speedPerLevel ?? 1;
    const speed = baseSpeed * (1 + levelsAbove * perLevel);

    shapeRotationRad += shapeRotationDir * speed * dt;
    if (shapeRotationRad >= limit) {
      shapeRotationRad = limit;
      shapeRotationDir = -1;
    } else if (shapeRotationRad <= -limit) {
      shapeRotationRad = -limit;
      shapeRotationDir = 1;
    }
  }

  function resetDescentPosition() {
    computeShapeBounds();
    shapeOffsetY =
      -shapeBounds.maxY -
      CONFIG.descent.startGapAbove;
    descentAccumulator = 0;
    rowsDropped = 0;
    lastRowsDroppedForTick = 0;
  }

  function getDescentSnapshot() {
    return {
      shapeOffsetY,
      gameOver,
      gameOverReason,
      rowsDropped,
      loseLineY: getLoseLineY(),
      shapeBounds: { ...shapeBounds },
      shapeRotationRad: getShapeRotationRad()
    };
  }

  function setGameOver(reason) {
    if (gameOver) return;
    gameOver = true;
    gameOverReason = reason;
    pendingDrafts = 0;
    draftState.active = false;
    draftPaused = false;
    if (levelDraftOverlayEl) levelDraftOverlayEl.hidden = true;
    setDraftUiOpen(false);
    if (gameOverOverlayEl) {
      gameOverOverlayEl.hidden = false;
    }
  }

  function checkDescentGameOver() {
    const loseLineY = getLoseLineY();

    for (const cell of cellLookup.values()) {
      if (!cell.active) continue;
      if (cellBottomWorldY(cell) >= loseLineY) {
        setGameOver("O semi-donut encostou na base do canhão.");
        return;
      }
    }
  }

  function updateDescent(dt) {
    if (gameOver || draftPaused) return;
    const stepSeconds = Math.max(
      0.05,
      (CONFIG.descent.intervalMs / 1000) *
        Math.max(0.05, runModifiers.descentIntervalMult || 1)
    );

    if (descentPauseTimer > 0) {
      descentPauseTimer = Math.max(0, descentPauseTimer - dt);
      return;
    }

    descentAccumulator += dt;

    let descentSteps = 8;
    while (descentAccumulator >= stepSeconds && descentSteps > 0) {
      descentAccumulator -= stepSeconds;
      descentSteps -= 1;
      shapeOffsetY += CONFIG.pixelSize;
      rowsDropped += 1;

      if (
        runModifiers.tickExtraEnabled &&
        rowsDropped > 0 &&
        rowsDropped % 10 === 0 &&
        rowsDropped !== lastRowsDroppedForTick
      ) {
        lastRowsDroppedForTick = rowsDropped;
        descentPauseTimer = Math.max(descentPauseTimer, 3);
      }

      checkDescentGameOver();
      if (gameOver) break;
    }
  }

  function drawDangerLine() {
    const y = getLoseLineY();
    ctx.save();
    ctx.strokeStyle = "rgba(255, 80, 110, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CONFIG.virtualWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function restartGame() {
    gameOver = false;
    gameOverReason = "";
    projectiles.length = 0;
    floatingTexts.length = 0;
    impactRings.length = 0;
    tierFlash = 0;
    fireAccumulator = 0;
    shapeRotationRad = 0;
    shapeRotationDir = 1;
    resetMulti();
    resetPlayerRun();
    buildCells();
    resetDescentPosition();
    Game.markStaticDirty();
    if (gameOverOverlayEl) {
      gameOverOverlayEl.hidden = true;
    }
  }

  if (gameOverRestartEl) {
    gameOverRestartEl.addEventListener("click", restartGame);
  }

  function cellGridKey(gx, gy) {
    return gx + "," + gy;
  }

  function getCellHitRect() {
    const inset = CONFIG.pixelGap / 2;
    const size = CONFIG.pixelSize - CONFIG.pixelGap;
    return { inset, size };
  }

  function circleIntersectsRect(px, py, radius, left, top, width, height) {
    const closestX = Math.max(left, Math.min(px, left + width));
    const closestY = Math.max(top, Math.min(py, top + height));
    const dx = px - closestX;
    const dy = py - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  function forEachCellInWorldRect(left, top, width, height, fn) {
    const pitch = CONFIG.pixelSize;
    const gx0 = Math.floor((left - gridMinX) / pitch);
    const gx1 = Math.floor((left + width - gridMinX) / pitch);
    const gy0 = Math.floor((top - gridMinY) / pitch);
    const gy1 = Math.floor((top + height - gridMinY) / pitch);

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cell = cellLookup.get(cellGridKey(gx, gy));
        if (cell) {
          fn(cell);
        }
      }
    }
  }

  function killCellsHitByProjectile(px, py, radius) {
    const { inset, size } = getCellHitRect();
    const pitch = CONFIG.pixelSize;
    const localPy = py - shapeOffsetY;
    const gx0 = Math.floor((px - radius - gridMinX) / pitch);
    const gx1 = Math.floor((px + radius - gridMinX) / pitch);
    const gy0 = Math.floor((localPy - radius - gridMinY) / pitch);
    const gy1 = Math.floor((localPy + radius - gridMinY) / pitch);
    const kills = [];

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cell = cellLookup.get(cellGridKey(gx, gy));
        if (!cell || !cell.active) continue;

        const left = cell.x + inset;
        const top = cell.y + inset + shapeOffsetY;
        if (!circleIntersectsRect(px, py, radius, left, top, size, size)) {
          continue;
        }

        kills.push({
          cx: cell.cx,
          cy: cell.cy,
          sectorIndex: cell.sectorIndex
        });

        cell.active = false;
        cellLookup.delete(cell.gridKey);
      }
    }

    if (kills.length) {
      patchCellsCanvasAfterHit(px, py, radius);
    }

    return { hit: kills.length > 0, kills };
  }

  function patchCellsCanvasAfterHit(px, py, radius) {
    const localPx = px;
    const localPy = py - shapeOffsetY;
    const { inset, size } = getCellHitRect();
    const glowPad = CONFIG.glow ? CELL_GLOW_ERASE_PAD : 0;
    const left = localPx - radius - glowPad;
    const top = localPy - radius - glowPad;
    const width = radius * 2 + glowPad * 2;
    const height = radius * 2 + glowPad * 2;

    staticCellsCtx.clearRect(left, top, width, height);

    forEachCellInWorldRect(left, top, width, height, (cell) => {
      if (!cell.active) return;
      drawOneCell(staticCellsCtx, cell);
    });
  }

  function moveProjectile(p, dt) {
    if (!p) return { removed: true };
    const cannon = CONFIG.cannon;
    const hitRadius = p.hitRadius ?? cannon.projectileRadius;
    const speed = Math.hypot(p.vx, p.vy);
    const maxStep = CONFIG.pixelSize * 0.45;
    const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      p.x += p.vx * stepDt;
      p.y += p.vy * stepDt;

      const hitPos = unrotateWorldPoint(p.x, p.y);
      const result = killCellsHitByProjectile(hitPos.x, hitPos.y, hitRadius);
      if (!result.hit) continue;

      registerMultiKills(result.kills);

      if (result.kills.some((k) => k.sectorIndex === 2)) {
        p.pierceLeft += runModifiers.redPierceBonus;
      }

      if (p.pierceLeft > 1) {
        p.pierceLeft -= 1;
        continue;
      }

      return { removed: true };
    }

    return { removed: false };
  }

  function steerProjectileHoming(p, dt) {
    if (!p || !p.homing || p.homing <= 0) return;
    const target = findNearestActiveCellWorld(p.x, p.y, 220);
    if (!target) return;
    const center = rotateWorldPoint(target.cx, target.cy + shapeOffsetY);
    const tx = center.x;
    const ty = center.y;
    let dx = tx - p.x;
    let dy = ty - p.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const blend = Math.min(1, p.homing * dt * 3);
    p.vx = p.vx * (1 - blend) + dx * speed * blend;
    p.vy = p.vy * (1 - blend) + dy * speed * blend;
  }

  function clientToVirtual(clientX, clientY) {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const scale = Math.min(
      cssW / CONFIG.virtualWidth,
      cssH / CONFIG.virtualHeight
    );
    const offsetX = (cssW - CONFIG.virtualWidth * scale) / 2;
    const offsetY = (cssH - CONFIG.virtualHeight * scale) / 2;
    return {
      x: (clientX - offsetX) / scale,
      y: (clientY - offsetY) / scale
    };
  }

  function targetPhiFromVirtualPoint(vx, vy) {
    const cannon = CONFIG.cannon;
    const dx = vx - cannon.pivotX;
    const dy = vy - cannon.pivotY;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      return Math.PI / 2;
    }
    let phi = Math.atan2(-dy, -dx);
    if (phi < 0) phi = 0;
    if (phi > Math.PI) phi = Math.PI;
    return phi;
  }

  function updateCannonAimFromPointer(dt) {
    const cannon = CONFIG.cannon;
    const vx = pointerOnCanvas ? pointerVirtualX : cannon.pivotX;
    const vy = pointerOnCanvas ? pointerVirtualY : cannon.pivotY - 320;
    const targetPhi = targetPhiFromVirtualPoint(vx, vy);
    const turnSpeed =
      (Math.PI / Math.max(0.4, cannon.sweepSecondsOneWay)) *
      (runModifiers.sweepSpeedMult || 1) *
      1.35;
    const maxStep = turnSpeed * dt;
    let delta = targetPhi - sweepPhi;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    sweepPhi += delta;
    if (sweepPhi < 0) sweepPhi = 0;
    if (sweepPhi > Math.PI) sweepPhi = Math.PI;
  }

  function syncCannonDebugHud() {
    if (!cannonDebugAngleEl || !cannonDebugMetaEl) return;

    const dir = getCannonAimDirection(sweepPhi);
    const aimRad = Math.atan2(dir.y, dir.x);
    const aimDeg = (aimRad * 180) / Math.PI;

    cannonDebugAngleEl.textContent = aimDeg.toFixed(1) + "°";
    cannonDebugMetaEl.textContent =
      "φ " +
      sweepPhi.toFixed(2) +
      " rad · " +
      (pointerOnCanvas ? "mira · mouse" : "mira · centro");
  }

  function getCannonAimDirection(phi) {
    return {
      x: -Math.cos(phi),
      y: -Math.sin(phi)
    };
  }

  function updateCannon(dt) {
    if (draftPaused) return;

    const cannon = CONFIG.cannon;

    if (cannonLockSweepTimer > 0) {
      cannonLockSweepTimer = Math.max(0, cannonLockSweepTimer - dt);
    } else {
      updateCannonAimFromPointer(dt);
    }

    if (!gameOver) {
      const mult = Math.max(0.28, runModifiers.fireIntervalMult || 1);
      const fireInterval = Math.max(
        0.05,
        (cannon.fireIntervalMs / 1000) * mult
      );
      fireAccumulator += dt;
      let shotsBudget = 16;
      while (fireAccumulator >= fireInterval && shotsBudget > 0) {
        fireAccumulator -= fireInterval;
        shotsBudget -= 1;
        const stacks = GameCards.getStacks(ownedCards, "varredura_dupla");
        const shots = runModifiers.doubleShot ? 1 + Math.min(2, stacks) : 1;
        const offsets = [0, -0.05, 0.05];
        for (let i = 0; i < shots; i++) {
          spawnProjectileFromCannon(offsets[i] || 0);
        }
      }
      if (fireAccumulator > fireInterval * 2) {
        fireAccumulator = fireInterval;
      }
    }

    const margin = 80;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!p) {
        projectiles.splice(i, 1);
        continue;
      }
      steerProjectileHoming(p, dt);
      const result = moveProjectile(p, dt);

      if (result.removed) {
        projectiles.splice(i, 1);
        continue;
      }

      if (
        p.x < -margin ||
        p.x > CONFIG.virtualWidth + margin ||
        p.y < -margin ||
        p.y > CONFIG.virtualHeight + margin
      ) {
        projectiles.splice(i, 1);
      }
    }
  }

  function drawCannon() {
    const cannon = CONFIG.cannon;
    const dir = getCannonAimDirection(sweepPhi);
    const angle = Math.atan2(dir.y, dir.x);
    const colors = projectileColorsForTier(multiState.tier);

    ctx.save();
    ctx.translate(cannon.pivotX, cannon.pivotY);

    ctx.fillStyle = "rgba(12, 18, 28, 0.85)";
    ctx.strokeStyle = "rgba(120, 180, 230, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(angle);
    ctx.fillStyle = "#3a4658";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(4, -cannon.barrelWidth / 2, cannon.barrelLength, cannon.barrelWidth);
    ctx.strokeRect(4, -cannon.barrelWidth / 2, cannon.barrelLength, cannon.barrelWidth);

    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 6 + multiState.tier * 2;
    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(cannon.barrelLength + 2, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawProjectiles() {
    const cannon = CONFIG.cannon;

    for (const p of projectiles) {
      if (!p) continue;
      const colors = projectileColorsForTier(p.powerTier ?? 0);
      const trail = colors.trail;

      ctx.save();
      ctx.strokeStyle = colors.glow;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * trail * 3, p.y - p.vy * trail * 3);
      ctx.lineTo(p.x - p.vx * trail, p.y - p.vy * trail);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = colors.shadow;
      ctx.fillStyle = colors.core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cannon.projectileRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(p.x - p.vx * trail, p.y - p.vy * trail, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function buildCells() {
    cells = [];
    cellLookup = new Map();

    const size = CONFIG.pixelSize;
    const half = size / 2;

    const minX = CONFIG.centerX - CONFIG.outerRadius - size;
    const maxX = CONFIG.centerX + CONFIG.outerRadius + size;
    const minY = CONFIG.centerY - CONFIG.outerRadius - size;
    const maxY = CONFIG.centerY + size;

    gridMinX = minX;
    gridMinY = minY;

    for (let y = minY; y <= maxY; y += size) {
      for (let x = minX; x <= maxX; x += size) {
        const cx = x + half;
        const cy = y + half;

        const dx = cx - CONFIG.centerX;
        const dy = cy - CONFIG.centerY;
        const radius = Math.hypot(dx, dy);

        // Mantém apenas a metade superior do anel.
        if (dy >= 0) continue;
        if (radius < CONFIG.innerRadius || radius > CONFIG.outerRadius) continue;

        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;

        // No canvas, o arco superior ocupa de PI até 2PI.
        if (angle < Math.PI || angle > Math.PI * 2) continue;

        const normalized = (angle - Math.PI) / Math.PI; // 0..1
        let sectorIndex = Math.floor(normalized * 5);

        if (sectorIndex < 0) sectorIndex = 0;
        if (sectorIndex > 4) sectorIndex = 4;

        const sectorStart = Math.PI + (Math.PI / 5) * sectorIndex;
        const sectorEnd = sectorStart + Math.PI / 5;

        // Cria uma separação visual entre as cinco partes.
        if (
          angle < sectorStart + CONFIG.sectorGapRadians ||
          angle > sectorEnd - CONFIG.sectorGapRadians
        ) {
          continue;
        }

        const sector = CONFIG.sectors[sectorIndex];
        const gridGx = Math.floor((x - minX) / size);
        const gridGy = Math.floor((y - minY) / size);
        const gridKey = cellGridKey(gridGx, gridGy);

        cells.push({
          x,
          y,
          cx,
          cy,
          sectorIndex,
          color: sector.color,
          glow: sector.glow,
          active: true,
          gridKey
        });
        cellLookup.set(gridKey, cells[cells.length - 1]);
      }
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBackgroundGrid(targetCtx) {
    if (!CONFIG.backgroundGrid) return;

    const spacing = 44;

    targetCtx.lineWidth = 1;
    targetCtx.strokeStyle = "rgba(95, 155, 210, 0.055)";

    for (let x = 0; x <= CONFIG.virtualWidth; x += spacing) {
      targetCtx.beginPath();
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, CONFIG.virtualHeight);
      targetCtx.stroke();
    }

    for (let y = 0; y <= CONFIG.virtualHeight; y += spacing) {
      targetCtx.beginPath();
      targetCtx.moveTo(0, y);
      targetCtx.lineTo(CONFIG.virtualWidth, y);
      targetCtx.stroke();
    }
  }

  function drawOneCell(targetCtx, cell) {
    if (!cell.active) return;

    const inset = CONFIG.pixelGap / 2;
    const size = CONFIG.pixelSize - CONFIG.pixelGap;

    if (CONFIG.glow) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = "screen";
      targetCtx.shadowColor = cell.glow;
      targetCtx.shadowBlur = 16;
      targetCtx.fillStyle = cell.glow;
      targetCtx.globalAlpha = 0.20;
      targetCtx.fillRect(cell.x + inset, cell.y + inset, size, size);
      targetCtx.restore();
    }

    targetCtx.fillStyle = cell.color;
    targetCtx.fillRect(cell.x + inset, cell.y + inset, size, size);

    targetCtx.fillStyle = "rgba(8, 12, 18, 0.22)";
    targetCtx.fillRect(
      cell.x + inset + 2,
      cell.y + inset + 2,
      Math.max(0, size - 4),
      Math.max(0, size - 4)
    );

    targetCtx.strokeStyle = "rgba(255,255,255,0.20)";
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(
      cell.x + inset + 0.5,
      cell.y + inset + 0.5,
      size - 1,
      size - 1
    );
  }

  function drawCells(targetCtx) {
    for (const cell of cells) {
      drawOneCell(targetCtx, cell);
    }
  }

  function eraseCellVisual(cell) {
    const { inset, size } = getCellHitRect();
    const glowPad = CONFIG.glow ? CELL_GLOW_ERASE_PAD : 0;
    const left = cell.x + inset - glowPad;
    const top = cell.y + inset - glowPad;
    const width = size + glowPad * 2;
    const height = size + glowPad * 2;

    staticCellsCtx.clearRect(left, top, width, height);

    forEachCellInWorldRect(left, top, width, height, (other) => {
      if (!other.active) return;
      drawOneCell(staticCellsCtx, other);
    });
  }

  function renderStaticBackground() {
    staticBgCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticBgCtx.clearRect(0, 0, CONFIG.virtualWidth, CONFIG.virtualHeight);

    drawBackgroundGrid(staticBgCtx);

    if (CONFIG.glow) {
      const gradient = staticBgCtx.createRadialGradient(
        CONFIG.centerX,
        CONFIG.centerY - 90,
        CONFIG.innerRadius * 0.45,
        CONFIG.centerX,
        CONFIG.centerY - 90,
        CONFIG.outerRadius * 1.25
      );
      gradient.addColorStop(0, "rgba(255, 125, 32, 0.10)");
      gradient.addColorStop(0.52, "rgba(150, 42, 255, 0.05)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      staticBgCtx.fillStyle = gradient;
      staticBgCtx.beginPath();
      staticBgCtx.arc(
        CONFIG.centerX,
        CONFIG.centerY,
        CONFIG.outerRadius * 1.3,
        Math.PI,
        Math.PI * 2
      );
      staticBgCtx.lineTo(CONFIG.centerX + CONFIG.outerRadius * 1.3, CONFIG.centerY);
      staticBgCtx.lineTo(CONFIG.centerX - CONFIG.outerRadius * 1.3, CONFIG.centerY);
      staticBgCtx.closePath();
      staticBgCtx.fill();
    }
  }

  function renderStaticCells() {
    staticCellsCtx.setTransform(1, 0, 0, 1, 0, 0);
    staticCellsCtx.clearRect(0, 0, CONFIG.virtualWidth, CONFIG.virtualHeight);
    drawCells(staticCellsCtx);
  }

  function renderStaticLayer() {
    renderStaticBackground();
    renderStaticCells();
  }

  function renderFrame() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    // Escala desktop: preserva o enquadramento do palco virtual,
    // sem depender de layout mobile.
    const scale = Math.min(
      width / CONFIG.virtualWidth,
      height / CONFIG.virtualHeight
    );

    const offsetX = (width - CONFIG.virtualWidth * scale) / 2;
    const offsetY = (height - CONFIG.virtualHeight * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(staticBgCanvas, 0, 0);

    const pivotX = CONFIG.centerX;
    const pivotY = getShapePivotY();
    const angle = getShapeRotationRad();
    ctx.save();
    ctx.translate(pivotX, pivotY);
    if (Math.abs(angle) > 1e-6) {
      ctx.rotate(angle);
    }
    ctx.drawImage(staticCellsCanvas, -pivotX, -CONFIG.centerY);
    ctx.restore();

    drawDangerLine();
    drawEffects();
    drawProjectiles();
    drawCannon();

    ctx.restore();
    syncCannonDebugHud();
  }

  function draw() {
    Game.markStaticDirty();
    Game.render();
  }

  function gameLoop(timestamp) {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }

    const dt = Math.min(
      (timestamp - lastFrameTime) / 1000,
      Game.maxDeltaSeconds
    );
    lastFrameTime = timestamp;

    Game.update(dt);
    Game.render();
    rafId = requestAnimationFrame(gameLoop);
  }

  function startGameLoop() {
    if (rafId) return;
    lastFrameTime = 0;
    rafId = requestAnimationFrame(gameLoop);
  }

  function stopGameLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // API mínima para as próximas etapas.
  // Nenhuma mecânica está ligada na UI neste primeiro protótipo.
  window.SemiDonutPrototype = {
    config: CONFIG,
    game: Game,
    getCells: () => cells,
    getProjectiles: () => projectiles,
    getMulti: getMultiSnapshot,
    resetMulti,
    getDescent: getDescentSnapshot,
    getPlayer: getPlayerSnapshot,
    getDraft: getDraftSnapshot,
    restart: restartGame,
    rebuild: () => {
      buildCells();
      resetDescentPosition();
      Game.markStaticDirty();
    },
    redraw: draw,
    setCellActive(index, active) {
      if (!cells[index]) return false;
      const cell = cells[index];
      const next = Boolean(active);
      if (cell.active === next) return true;

      cell.active = next;
      if (next) {
        cellLookup.set(cell.gridKey, cell);
        drawOneCell(staticCellsCtx, cell);
      } else {
        cellLookup.delete(cell.gridKey);
        eraseCellVisual(cell);
      }
      return true;
    },
    start: startGameLoop,
    stop: stopGameLoop
  };

  if (new URLSearchParams(window.location.search).has("test")) {
    window.SemiDonutPrototype.__test = {
      grantXp(amount) {
        grantPlayerXp(amount);
      },
      openDraft(cardIds) {
        pendingDrafts = Math.max(pendingDrafts, 1);
        openDraftWithOptions(cardIds);
      },
      pick(cardId) {
        pickDraftCard(cardId);
      },
      internal() {
        return {
          draftPaused,
          pendingDrafts,
          draftActive: draftState.active,
          overlayHidden: levelDraftOverlayEl ? levelDraftOverlayEl.hidden : null,
          fireIntervalMult: runModifiers.fireIntervalMult,
          gameOver,
          projectileCount: projectiles.length
        };
      },
      benchUpdates(frames, dt = 1 / 60) {
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) {
          Game.update(dt);
        }
        return performance.now() - t0;
      }
    };
  }

  buildCells();
  resetPlayerRun();
  resetDescentPosition();
  syncMultiHud();
  syncPlayerHud();
  Game.markStaticDirty();
  if (gameOverOverlayEl) {
    gameOverOverlayEl.hidden = true;
  }
  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("mousemove", (event) => {
    const v = clientToVirtual(event.clientX, event.clientY);
    pointerVirtualX = v.x;
    pointerVirtualY = v.y;
    pointerOnCanvas = true;
  });
  canvas.addEventListener("mouseleave", () => {
    pointerOnCanvas = false;
  });
  resizeCanvas();
  startGameLoop();
})();
