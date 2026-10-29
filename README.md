# Palavra Viva

Palavra Viva é um app gratuito que transforma as histórias da Bíblia em uma experiência viva para as crianças.

Cada conto é narrado de forma simples e divertida — e, ao tocar em palavras-chave durante a leitura, a criança ouve efeitos sonoros que fazem a história ganhar vida: o rugido do leão de Daniel, o som do mar no Êxodo, o toque da harpa de Davi…

Ideal para EBD, salinhas, catequese, hora de dormir e momentos em família.

Feito com carinho por quem acredita que a Palavra merece ser ouvida — e sentida.

## Como testar localmente

`fetch` não funciona abrindo o `index.html` direto. Use um servidor local:

```bash
python3 -m http.server 8000
```

Ou:

```bash
npx serve .
```

Abra http://localhost:8000.

## Estrutura

- `stories/catalog.json` — lista de títulos de histórias disponíveis.
- `stories/<título>/index.md` — texto com front matter.
- `stories/<título>/cover.png` (ou `.svg`, `.jpg`, `.webp`) — capa.
- `sounds/catalog.json` — catálogo central de efeitos.
- `sounds/<file>` — arquivos de áudio.

## Como escrever uma história

1. Crie `stories/meu-título/`.
2. Adicione `index.md`:
    ```markdown
    ---
    title: "Título"
    desc: "Frase curta"
    age: "3-6"
    tag: tema1, tema2
    author: "Seu nome"
    license: "CC BY-SA 4.0"
    ---
    
    Corpo da história com [palavras](sound-id) sonorizadas.
    ```

3. Adicione uma capa chamada `cover.png` (ou `.svg`, `.jpg`).
4. Inclua `"meu-título"` em `stories/catalog.json`.

## Sintaxe das palavras sonorizadas

`[texto exibido](sound-id)` — o texto aparece em negrito e clicável; o id aponta para uma entrada em `sounds/catalog.json`.

Regras do id: apenas `a-z`, `0-9` e `-`. Sem acentos. O texto exibido pode ter acentuação e não precisa ser igual ao id — `[águas](agua)` é válido e reutiliza o mesmo áudio em vários lugares.

## Como adicionar um efeito sonoro

1. Grave ou obtenha o áudio, padronize o loudness.
2. Salve como `sounds/<id>.mp3`.
3. Registre em `sounds/catalog.json`.
4. Referencie nas histórias como `[texto](id)`.

## Licenças

- Código: MIT (a definir no repositório).
- Histórias, imagens e áudios: licenças próprias indicadas em cada arquivo.