(() => {
  "use strict";

  const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 };

  /** XP de nível usa fração do peso Multi (perfuração mata muitos pixels por tiro). */
  const PLAYER_XP = {
    weightFactor: 0.14,
    base: 58,
    linear: 22,
    quadratic: 3.1
  };
  const MYSTERY_POOL = [
    "rajada_inicial",
    "cannao_fixo",
    "freio_emergencia",
    "laser_fantasma",
    "limpeza_borda"
  ];

  const CARD_CATALOG = [
    { id: "cadencia_frenetica", name: "Cadência Frenética", rarity: "common", maxStacks: 5, desc: "Disparos −20% intervalo.", apply(m) { m.fireIntervalMult = Math.max(0.28, m.fireIntervalMult * 0.8); } },
    { id: "mira_lenta", name: "Mira Lenta", rarity: "common", maxStacks: 4, desc: "Canhão segue o mouse 25% mais devagar.", apply(m) { m.sweepSpeedMult *= 0.75; } },
    { id: "varredura_dupla", name: "Varredura Dupla", rarity: "uncommon", maxStacks: 3, desc: "Cada tiro dispara 2 projéteis.", apply(m) { m.doubleShot = true; } },
    { id: "perfurador_mk2", name: "Perfurador MK2", rarity: "common", maxStacks: 5, desc: "+1 perfuração nos tiros.", apply(m) { m.pierceBonus += 1; } },
    { id: "nucleo_denso", name: "Núcleo Denso", rarity: "common", maxStacks: 3, desc: "Colisão +1px (visual igual).", apply(m) { m.hitRadiusBonus += 1; } },
    { id: "tiro_guiado", name: "Tiro Guiado", rarity: "uncommon", maxStacks: 3, desc: "Projéteis curvam levemente aos alvos.", apply(m) { m.homingStrength += 0.35; } },
    { id: "rajada_inicial", name: "Rajada Inicial", rarity: "rare", maxStacks: 1, desc: "Ao pegar: 5 tiros instantâneos.", apply(m, ctx) { ctx.fireBurst(5); } },
    { id: "cannao_fixo", name: "Canhão Fixo 3s", rarity: "rare", maxStacks: 2, desc: "Próximos 3s sem varredura.", apply(m, ctx) { ctx.lockCannonSweep(3); } },
    { id: "ouro_amarelo", name: "Ouro Amarelo", rarity: "common", maxStacks: 5, desc: "Setor amarelo +0,3 Multi.", apply(m) { m.sectorWeightBonus[0] += 0.3; } },
    { id: "sangue_laranja", name: "Sangue Laranja", rarity: "common", maxStacks: 5, desc: "Laranja +0,35 Multi.", apply(m) { m.sectorWeightBonus[1] += 0.35; } },
    { id: "impeto_vermelho", name: "Ímpeto Vermelho", rarity: "common", maxStacks: 5, desc: "Vermelho +0,4 Multi.", apply(m) { m.sectorWeightBonus[2] += 0.4; } },
    { id: "trono_roxo", name: "Trono Roxo", rarity: "uncommon", maxStacks: 4, desc: "Roxo +0,45 Multi.", apply(m) { m.sectorWeightBonus[3] += 0.45; } },
    { id: "azul_profundo", name: "Azul Profundo", rarity: "uncommon", maxStacks: 4, desc: "Azul +0,5 Multi.", apply(m) { m.sectorWeightBonus[4] += 0.5; } },
    { id: "arco_iris", name: "Arco-íris", rarity: "uncommon", maxStacks: 3, desc: "Todos setores +0,15 Multi.", apply(m) { m.allSectorBonus += 0.15; } },
    { id: "combo_seguro", name: "Combo Seguro", rarity: "uncommon", maxStacks: 3, desc: "3+ kills em 1s: +2 Multi.", apply(m) { m.comboSafe = true; } },
    { id: "escada_curta", name: "Escada Curta", rarity: "uncommon", maxStacks: 3, desc: "Próxima meta Multi −15%.", apply(m, ctx) { ctx.applyNextMultiDiscount(0.85); } },
    { id: "gravidade_leve", name: "Gravidade Leve", rarity: "common", maxStacks: 4, desc: "Descida 25% mais lenta.", apply(m) { m.descentIntervalMult *= 1.25; } },
    { id: "freio_emergencia", name: "Freio de Emergência", rarity: "rare", maxStacks: 2, desc: "+1 carga: pausa descida 8s (clique no inventário).", apply(m) { m.emergencyBrakeCharges += 1; } },
    { id: "tick_extra", name: "Tick Extra", rarity: "uncommon", maxStacks: 3, desc: "A cada 10 linhas: +3s sem descer.", apply(m) { m.tickExtraEnabled = true; } },
    { id: "explosao_setorial", name: "Explosão Setorial", rarity: "uncommon", maxStacks: 3, desc: "Azul: explosão 8px.", apply(m) { m.blueExplosion = true; } },
    { id: "corrente_eletrica", name: "Corrente Elétrica", rarity: "uncommon", maxStacks: 3, desc: "Roxo: 30% de chain.", apply(m) { m.purpleChain = true; } },
    { id: "laser_fantasma", name: "Laser Fantasma", rarity: "rare", maxStacks: 2, desc: "+1 raio reto (clique no inventário).", apply(m) { m.ghostLaserCharges += 1; } },
    { id: "fragmentacao", name: "Fragmentação", rarity: "uncommon", maxStacks: 3, desc: "+1 perfuração só em vermelho.", apply(m) { m.redPierceBonus += 1; } },
    { id: "limpeza_borda", name: "Limpeza de Borda", rarity: "rare", maxStacks: 2, desc: "+1 limpeza da fileira inferior (inventário).", apply(m) { m.borderCleanCharges += 1; } },
    { id: "contrato_arriscado", name: "Contrato Arriscado", rarity: "uncommon", maxStacks: 2, desc: "Desce +15% rápido; Multi ×1,25.", apply(m) { m.descentIntervalMult *= 0.87; m.multiWeightMult *= 1.25; } },
    { id: "loja_bolso", name: "Loja de Bolso", rarity: "uncommon", maxStacks: 3, desc: "Próximo draft: 1 reroll grátis.", apply(m, ctx) { ctx.grantDraftReroll(); } },
    { id: "carta_misteriosa", name: "Carta Misteriosa", rarity: "rare", maxStacks: 99, desc: "Recebe 1 carta rara aleatória.", apply(m, ctx) { ctx.applyMysteryCard(); } }
  ];

  const catalogById = Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c]));

  /** IDs com WebP em assets/cards/{id}.webp */
  const CARD_ART_IDS = new Set([
    "arco_iris",
    "azul_profundo",
    "cadencia_frenetica",
    "cannao_fixo",
    "carta_misteriosa",
    "combo_seguro",
    "contrato_arriscado",
    "corrente_eletrica",
    "escada_curta",
    "explosao_setorial",
    "fragmentacao",
    "freio_emergencia",
    "gravidade_leve",
    "impeto_vermelho",
    "laser_fantasma",
    "limpeza_borda",
    "loja_bolso",
    "mira_lenta",
    "nucleo_denso",
    "ouro_amarelo",
    "perfurador_mk2",
    "rajada_inicial",
    "sangue_laranja",
    "tiro_guiado",
    "tick_extra",
    "trono_roxo",
    "varredura_dupla"
  ]);

  function getCardArtPath(cardId) {
    if (!cardId || !CARD_ART_IDS.has(cardId)) return null;
    return "assets/cards/" + cardId + ".webp";
  }

  function createDefaultModifiers() {
    return {
      fireIntervalMult: 1,
      sweepSpeedMult: 1,
      doubleShot: false,
      pierceBonus: 0,
      hitRadiusBonus: 0,
      homingStrength: 0,
      sectorWeightBonus: [0, 0, 0, 0, 0],
      allSectorBonus: 0,
      multiWeightMult: 1,
      comboSafe: false,
      descentIntervalMult: 1,
      emergencyBrakeCharges: 0,
      tickExtraEnabled: false,
      blueExplosion: false,
      purpleChain: false,
      ghostLaserCharges: 0,
      redPierceBonus: 0,
      borderCleanCharges: 0
    };
  }

  function getStacks(owned, id) {
    return owned[id] || 0;
  }

  function canOfferCard(owned, card) {
    return getStacks(owned, card.id) < card.maxStacks;
  }

  function rollDraftOptions(owned, count = 3) {
    const pool = CARD_CATALOG.filter((c) => canOfferCard(owned, c) && c.id !== "carta_misteriosa");
    const mysteryOk = canOfferCard(owned, catalogById.carta_misteriosa);
    if (mysteryOk) pool.push(catalogById.carta_misteriosa);

    const picked = [];
    const used = new Set();

    while (picked.length < count && pool.length > used.size) {
      const available = pool.filter((c) => !used.has(c.id));
      if (!available.length) break;

      let total = 0;
      for (const c of available) {
        total += RARITY_WEIGHT[c.rarity] || 10;
      }
      let roll = Math.random() * total;
      let chosen = available[available.length - 1];
      for (const c of available) {
        roll -= RARITY_WEIGHT[c.rarity] || 10;
        if (roll <= 0) {
          chosen = c;
          break;
        }
      }
      used.add(chosen.id);
      picked.push(chosen);
    }

    while (picked.length < count) {
      picked.push({
        id: "bonus_xp",
        name: "Surto de Foco",
        rarity: "common",
        maxStacks: 99,
        desc: "+5% peso Multi nesta partida.",
        isFallback: true
      });
    }

    return picked.slice(0, count);
  }

  function applyCardPick(cardId, owned, modifiers, ctx) {
    if (cardId === "bonus_xp") {
      modifiers.multiWeightMult *= 1.05;
      return { id: cardId, name: "Surto de Foco" };
    }

    const card = catalogById[cardId];
    if (!card) return null;
    if (!canOfferCard(owned, card) && cardId !== "carta_misteriosa") return null;

    owned[cardId] = getStacks(owned, cardId) + 1;
    card.apply(modifiers, ctx);
    return card;
  }

  function applyMysteryCard(owned, modifiers, ctx) {
    const id = MYSTERY_POOL[Math.floor(Math.random() * MYSTERY_POOL.length)];
    const inner = catalogById[id];
    if (!inner) return null;
    if (canOfferCard(owned, inner)) {
      owned[id] = getStacks(owned, id) + 1;
    }
    inner.apply(modifiers, ctx);
    return inner;
  }

  function rebuildModifiersFromOwned(owned) {
    const modifiers = createDefaultModifiers();
    const noopCtx = {
      fireBurst() {},
      lockCannonSweep() {},
      applyNextMultiDiscount() {},
      grantDraftReroll() {},
      applyMysteryCard() {}
    };
    for (const card of CARD_CATALOG) {
      const stacks = getStacks(owned, card.id);
      for (let i = 0; i < stacks; i++) {
        if (card.id === "rajada_inicial" || card.id === "cannao_fixo" || card.id === "laser_fantasma" || card.id === "limpeza_borda" || card.id === "carta_misteriosa") {
          continue;
        }
        card.apply(modifiers, noopCtx);
      }
    }
    if (getStacks(owned, "combo_seguro") > 0) modifiers.comboSafe = true;
    if (getStacks(owned, "varredura_dupla") > 0) modifiers.doubleShot = true;
    if (getStacks(owned, "tick_extra") > 0) modifiers.tickExtraEnabled = true;
    if (getStacks(owned, "blue_explosion") > 0) modifiers.blueExplosion = true;
    modifiers.blueExplosion = getStacks(owned, "explosao_setorial") > 0;
    modifiers.purpleChain = getStacks(owned, "corrente_eletrica") > 0;
    modifiers.emergencyBrakeCharges = getStacks(owned, "freio_emergencia");
    modifiers.ghostLaserCharges = getStacks(owned, "laser_fantasma");
    modifiers.borderCleanCharges = getStacks(owned, "limpeza_borda");
    return modifiers;
  }

  window.GameCards = {
    CARD_CATALOG,
    catalogById,
    CARD_ART_IDS,
    getCardArtPath,
    createDefaultModifiers,
    rollDraftOptions,
    applyCardPick,
    applyMysteryCard,
    getStacks,
    scalePlayerXp(multiWeightSum) {
      if (multiWeightSum <= 0) return 0;
      return multiWeightSum * PLAYER_XP.weightFactor;
    },
    playerXpToNext(level) {
      const lv = Math.max(1, level);
      return Math.round(
        PLAYER_XP.base + PLAYER_XP.linear * lv + lv * lv * PLAYER_XP.quadratic
      );
    }
  };
})();
