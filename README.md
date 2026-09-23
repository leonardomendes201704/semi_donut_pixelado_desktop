# Semi Donut Pixelado — protótipo desktop

Protótipo inicial em HTML + CSS + JavaScript puro.

## Como abrir

1. Extraia o ZIP.
2. Abra `index.html` em Chrome, Edge ou Firefox.
3. Não precisa instalar nada e não precisa de servidor local.

## O que existe nesta versão

- Semi donut / arco superior com pixels destrutíveis.
- 5 setores independentes (amarelo → azul).
- Canhão na base **mirando o cursor** (semicírculo superior) com projéteis automáticos.
- **Sistema Multi**: medidor com metas escalonadas; cada cor de setor soma um peso diferente ao progresso.
- A cada subida de tier, novos tiros **perfuram** mais quadradinhos (mesmo tamanho visual do projétil).
- HUD Multi, textos flutuantes `+peso`, anéis de impacto e flash ao subir tier.
- **Descida Tetris**: o semi-donut entra de cima e desce **1 linha (6px) a cada 1000ms**; se encostar na base do canhão (`y = 865`), **game over**.

## Estrutura

- `index.html` — página principal + HUD Multi.
- `styles.css` — tela, fundo e HUD.
- `cards.js` — catálogo das 27 cartas.
- `assets/cards/` — artes WebP opcionais (`{id_da_carta}.webp`); usadas no draft e no inventário quando existem. Novas artes: exporte WebP (~quality 80) ou converta PNG com `ffmpeg -i carta.png -quality 82 carta.webp`.
- `session-meta.js` — meta-progressão da sessão (fragmentos e loja).
- `app.js` — jogo, colisão, Multi, draft e render.

## API global

```js
SemiDonutPrototype.getCells()
SemiDonutPrototype.getProjectiles()
SemiDonutPrototype.getMulti()
SemiDonutPrototype.getDescent()
SemiDonutPrototype.getPlayer()
SemiDonutPrototype.getSessionMeta()
SemiDonutPrototype.getDraft()
SemiDonutPrototype.resetMulti()
SemiDonutPrototype.restart()
SemiDonutPrototype.setCellActive(indice, false)
SemiDonutPrototype.rebuild()
```

`getMulti()` retorna `{ tier, meter, required, pierceForNextShot, sectorWeights, ... }`.

`getDescent()` retorna `{ shapeOffsetY, rowsDropped, gameOver, loseLineY, ... }`.

## Nível e draft

- XP sobe com **~14%** do peso das eliminações (Multi continua com 100%); metas por nível são bem maiores que no início do protótipo.
- Cada **nível** abre draft: **3 cartas**, escolha **1**; jogo pausa e projéteis somem.
- A partir do **nível 2**, o semi-donut **oscila ±45°** (≈32s por perna); a velocidade sobe **+1×** a cada nível acima do 2.
- **Loja de Bolso** concede **1 reroll** no próximo draft.
- Inventário (canto superior esquerdo): clique em **Freio / Laser / Limpeza** para usar cargas.

## Multi (resumo)

- Progresso por **peso**, não por contagem fixa: amarelo +1.0, laranja +1.2, vermelho +1.45, roxo +1.75, azul +2.1.
- Meta do tier atual: `round(10 + 5×tier + tier²×1.25)` (fica mais exigente ao longo da partida).
- Tier atual define perfuração do próximo tiro: `1 + tier` (até 8 acertos por projétil).

## Derrota

- Linha vermelha tracejada = base do canhão.
- Qualquer quadradinho **ativo** que atinge essa linha encerra a partida; use **Jogar de novo** ou `SemiDonutPrototype.restart()`.

## Meta (sessão)

Roguelike leve **só enquanto a aba estiver aberta** (F5 zera fragmentos e compras).

- Ao **game over**, você ganha **Fragmentos de Setor** (nível, tier Multi, linhas descidas; +10 se bater recorde da sessão).
- No overlay: resumo da run, total de fragmentos e **Loja da sessão** (XP, descida, reroll no 1º draft, Freio inicial, ritual de bênção).
- **Ritual de Início**: antes de cada nova run, escolha 1 de 3 bênções fracas (só naquela partida).
- HUD no canto superior direito: fragmentos acumulados.

`getSessionMeta()` retorna `{ fragments, stacks, bestLevel, bestMultiTier, lastAward, shop, bonuses }`.
