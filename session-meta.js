(() => {
  "use strict";

  const SHOP_CATALOG = [
    {
      id: "meta_xp",
      name: "Memória de Combate",
      desc: "+5% XP de nível (sessão).",
      basePrice: 25,
      maxStacks: 3,
      priceScale: 1.25
    },
    {
      id: "meta_descent",
      name: "Gravidade Amortecida",
      desc: "Descida base +3% mais lenta (sessão).",
      basePrice: 30,
      maxStacks: 2,
      priceScale: 1.3
    },
    {
      id: "meta_reroll",
      name: "Olhar Duplo",
      desc: "Próxima run: 1 reroll no 1º draft.",
      basePrice: 20,
      maxStacks: 1,
      priceScale: 1
    },
    {
      id: "meta_brake",
      name: "Freio de Oficina",
      desc: "Começa cada run com +1 Freio.",
      basePrice: 40,
      maxStacks: 1,
      priceScale: 1
    },
    {
      id: "meta_blessing",
      name: "Ritual de Início",
      desc: "Antes de cada run: escolha 1 bênção.",
      basePrice: 35,
      maxStacks: 1,
      priceScale: 1
    }
  ];

  const catalogById = Object.fromEntries(SHOP_CATALOG.map((c) => [c.id, c]));

  const START_BLESSINGS = [
    {
      id: "bless_gravidade",
      name: "Ar Leve",
      desc: "Descida 12% mais lenta nesta run.",
      apply(m) {
        m.descentIntervalMult *= 1.12;
      }
    },
    {
      id: "bless_ouro",
      name: "Brilho Amarelo",
      desc: "Setor amarelo +0,15 Multi nesta run.",
      apply(m) {
        m.sectorWeightBonus[0] += 0.15;
      }
    },
    {
      id: "bless_cadencia",
      name: "Pulso Calmo",
      desc: "Disparos 10% mais rápidos nesta run.",
      apply(m) {
        m.fireIntervalMult = Math.max(0.28, m.fireIntervalMult * 0.9);
      }
    },
    {
      id: "bless_nucleo",
      name: "Mira Estável",
      desc: "Colisão +1px nesta run.",
      apply(m) {
        m.hitRadiusBonus += 1;
      }
    },
    {
      id: "bless_arco",
      name: "Arco Suave",
      desc: "Todos setores +0,08 Multi nesta run.",
      apply(m) {
        m.allSectorBonus += 0.08;
      }
    }
  ];

  function createSessionMeta() {
    return {
      fragments: 0,
      stacks: {},
      bestLevel: 0,
      bestMultiTier: 0,
      lastAward: null,
      pendingFirstDraftReroll: false
    };
  }

  function getStack(state, id) {
    return state.stacks[id] || 0;
  }

  function priceForStack(item, currentStack) {
    if (currentStack >= item.maxStacks) return null;
    return Math.round(item.basePrice * Math.pow(item.priceScale, currentStack));
  }

  function computeRunFragments(stats, records) {
    const level = Math.max(1, stats.level || 1);
    const tier = Math.max(0, stats.multiTier || 0);
    const rows = Math.max(0, stats.rowsDropped || 0);
    let total = 8 + 4 * (level - 1) + 2 * tier + Math.floor(rows / 8);
    const beatLevel = level > (records.bestLevel || 0);
    const beatTier = tier > (records.bestMultiTier || 0);
    if (beatLevel || beatTier) total += 10;
    return { total, beatLevel, beatTier };
  }

  function awardRunEnd(state, stats) {
    const { total, beatLevel, beatTier } = computeRunFragments(stats, state);
    state.fragments += total;
    if (stats.level > state.bestLevel) state.bestLevel = stats.level;
    if (stats.multiTier > state.bestMultiTier) {
      state.bestMultiTier = stats.multiTier;
    }
    state.lastAward = {
      fragments: total,
      beatLevel,
      beatTier,
      stats: { ...stats }
    };
    return state.lastAward;
  }

  function getSessionBonuses(state) {
    const xpStacks = getStack(state, "meta_xp");
    const descentStacks = getStack(state, "meta_descent");
    return {
      xpMult: 1 + 0.05 * xpStacks,
      descentMult: Math.pow(1.03, descentStacks),
      startBrakeCharge: getStack(state, "meta_brake") >= 1,
      blessingUnlocked: getStack(state, "meta_blessing") >= 1,
      pendingFirstDraftReroll: Boolean(state.pendingFirstDraftReroll)
    };
  }

  function tryPurchase(state, id) {
    const item = catalogById[id];
    if (!item) return { ok: false, reason: "unknown" };
    const current = getStack(state, id);
    if (current >= item.maxStacks) return { ok: false, reason: "max" };
    const price = priceForStack(item, current);
    if (price == null || state.fragments < price) {
      return { ok: false, reason: "fragments" };
    }
    state.fragments -= price;
    state.stacks[id] = current + 1;
    if (id === "meta_reroll") {
      state.pendingFirstDraftReroll = true;
    }
    return { ok: true, price, stacks: state.stacks[id] };
  }

  function getShopRows(state) {
    return SHOP_CATALOG.map((item) => {
      const stacks = getStack(state, item.id);
      const atMax = stacks >= item.maxStacks;
      const price = atMax ? null : priceForStack(item, stacks);
      return {
        id: item.id,
        name: item.name,
        desc: item.desc,
        stacks,
        maxStacks: item.maxStacks,
        price,
        atMax,
        canBuy: !atMax && price != null && state.fragments >= price
      };
    });
  }

  function rollStartBlessings(count = 3) {
    const pool = START_BLESSINGS.slice();
    const picked = [];
    while (picked.length < count && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(i, 1)[0]);
    }
    return picked;
  }

  function applyStartBlessing(modifiers, blessingId) {
    const b = START_BLESSINGS.find((x) => x.id === blessingId);
    if (!b) return false;
    b.apply(modifiers);
    return true;
  }

  const api = {
    SHOP_CATALOG,
    START_BLESSINGS,
    createSessionMeta,
    computeRunFragments,
    awardRunEnd,
    getSessionBonuses,
    tryPurchase,
    getShopRows,
    rollStartBlessings,
    applyStartBlessing,
    priceForStack
  };

  if (typeof window !== "undefined") {
    window.SessionMeta = api;
  }
  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
