# Semi Donut Pixelado — protótipo desktop

Protótipo inicial em HTML + CSS + JavaScript puro.

## Como abrir

1. Extraia o ZIP.
2. Abra `index.html` em Chrome, Edge ou Firefox.
3. Não precisa instalar nada e não precisa de servidor local.

## O que existe nesta versão

- Semi donut / arco superior com pixels destrutíveis.
- 5 setores independentes (amarelo → azul).
- Canhão na base com varredura em semicírculo e projéteis automáticos.
- **Sistema Multi**: medidor com metas escalonadas; cada cor de setor soma um peso diferente ao progresso.
- A cada subida de tier, novos tiros **perfuram** mais quadradinhos (mesmo tamanho visual do projétil).
- HUD Multi, textos flutuantes `+peso`, anéis de impacto e flash ao subir tier.

## Estrutura

- `index.html` — página principal + HUD Multi.
- `styles.css` — tela, fundo e HUD.
- `app.js` — jogo, colisão, Multi e render.

## API global

```js
SemiDonutPrototype.getCells()
SemiDonutPrototype.getProjectiles()
SemiDonutPrototype.getMulti()
SemiDonutPrototype.resetMulti()
SemiDonutPrototype.setCellActive(indice, false)
SemiDonutPrototype.rebuild()
```

`getMulti()` retorna `{ tier, meter, required, pierceForNextShot, sectorWeights, ... }`.

## Multi (resumo)

- Progresso por **peso**, não por contagem fixa: amarelo +1.0, laranja +1.2, vermelho +1.45, roxo +1.75, azul +2.1.
- Meta do tier atual: `round(10 + 5×tier + tier²×1.25)` (fica mais exigente ao longo da partida).
- Tier atual define perfuração do próximo tiro: `1 + tier` (até 8 acertos por projétil).
