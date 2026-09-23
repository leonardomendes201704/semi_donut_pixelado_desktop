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
    }
  };

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

  function multiRequiredDelta(tier) {
    return Math.round(10 + 5 * tier + tier * tier * 1.25);
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

    const required = multiRequiredDelta(multiState.tier);
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
    if (!kills.length) return;

    let gained = 0;
    for (const kill of kills) {
      const weight = CONFIG.multi.sectorWeight[kill.sectorIndex] ?? 1;
      gained += weight;
      multiState.lastSectorIndex = kill.sectorIndex;
      spawnFloatingWeight(kill.cx, kill.cy, weight, kill.sectorIndex);
      spawnImpactRing(kill.cx, kill.cy, kill.sectorIndex);
    }

    multiState.meter += gained;
    multiState.lifetimeWeighted += gained;
    pulseMultiHud();

    let tierUps = 0;
    while (multiState.meter >= multiRequiredDelta(multiState.tier)) {
      multiState.meter -= multiRequiredDelta(multiState.tier);
      multiState.tier += 1;
      tierUps += 1;
    }

    if (tierUps > 0) {
      celebrateMultiTierUp();
    }

    syncMultiHud();
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
  let sweepPhi = 0;
  let sweepDir = 1;
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
    const gx0 = Math.floor((px - radius - gridMinX) / pitch);
    const gx1 = Math.floor((px + radius - gridMinX) / pitch);
    const gy0 = Math.floor((py - radius - gridMinY) / pitch);
    const gy1 = Math.floor((py + radius - gridMinY) / pitch);
    const kills = [];

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cell = cellLookup.get(cellGridKey(gx, gy));
        if (!cell || !cell.active) continue;

        const left = cell.x + inset;
        const top = cell.y + inset;
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
    const { inset, size } = getCellHitRect();
    const glowPad = CONFIG.glow ? CELL_GLOW_ERASE_PAD : 0;
    const left = px - radius - glowPad;
    const top = py - radius - glowPad;
    const width = radius * 2 + glowPad * 2;
    const height = radius * 2 + glowPad * 2;

    staticCellsCtx.clearRect(left, top, width, height);

    forEachCellInWorldRect(left, top, width, height, (cell) => {
      if (!cell.active) return;
      drawOneCell(staticCellsCtx, cell);
    });
  }

  function moveProjectile(p, dt) {
    const cannon = CONFIG.cannon;
    const hitRadius = p.hitRadius ?? cannon.projectileRadius;
    const speed = Math.hypot(p.vx, p.vy);
    const maxStep = CONFIG.pixelSize * 0.45;
    const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      p.x += p.vx * stepDt;
      p.y += p.vy * stepDt;

      const result = killCellsHitByProjectile(p.x, p.y, hitRadius);
      if (!result.hit) continue;

      registerMultiKills(result.kills);

      if (p.pierceLeft > 1) {
        p.pierceLeft -= 1;
        continue;
      }

      return { removed: true };
    }

    return { removed: false };
  }

  function syncCannonDebugHud() {
    if (!cannonDebugAngleEl || !cannonDebugMetaEl) return;

    const dir = getCannonAimDirection(sweepPhi);
    const aimRad = Math.atan2(dir.y, dir.x);
    const aimDeg = (aimRad * 180) / Math.PI;
    const sweepLabel = sweepDir > 0 ? "varredura →" : "varredura ←";

    cannonDebugAngleEl.textContent = aimDeg.toFixed(1) + "°";
    cannonDebugMetaEl.textContent =
      "φ " + sweepPhi.toFixed(2) + " rad · " + sweepLabel;
  }

  function getCannonAimDirection(phi) {
    return {
      x: -Math.cos(phi),
      y: -Math.sin(phi)
    };
  }

  function updateCannon(dt) {
    const cannon = CONFIG.cannon;
    const sweepSpeed = Math.PI / cannon.sweepSecondsOneWay;

    sweepPhi += sweepDir * sweepSpeed * dt;
    if (sweepPhi >= Math.PI) {
      sweepPhi = Math.PI;
      sweepDir = -1;
    } else if (sweepPhi <= 0) {
      sweepPhi = 0;
      sweepDir = 1;
    }

    fireAccumulator += dt;
    while (fireAccumulator >= cannon.fireIntervalMs / 1000) {
      fireAccumulator -= cannon.fireIntervalMs / 1000;
      const dir = getCannonAimDirection(sweepPhi);
      const muzzleOffset = cannon.barrelLength - 4;
      projectiles.push({
        x: cannon.pivotX + dir.x * muzzleOffset,
        y: cannon.pivotY + dir.y * muzzleOffset,
        vx: dir.x * cannon.projectileSpeed,
        vy: dir.y * cannon.projectileSpeed,
        pierceLeft: getPierceForMultiTier(multiState.tier),
        powerTier: multiState.tier,
        hitRadius: cannon.projectileRadius
      });
    }

    const margin = 80;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
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
    ctx.drawImage(staticCellsCanvas, 0, 0);

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
    rebuild: () => {
      buildCells();
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

  buildCells();
  syncMultiHud();
  Game.markStaticDirty();
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  startGameLoop();
})();
