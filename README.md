# Palavra Viva

Palavra Viva é um app gratuito que transforma as histórias da Bíblia em uma experiência viva para as crianças.

Cada conto é narrado de forma simples e divertida — e, ao tocar em palavras-chave durante a leitura, a criança ouve efeitos sonoros que fazem a história ganhar vida: o rugido do leão de Daniel, o som do mar no Êxodo, o toque da harpa de Davi…

Ideal para EBD, salinhas, catequese, hora de dormir e momentos em família.

Feito com carinho por quem acredita que a Palavra merece ser ouvida — e sentida.

## App instalável e offline (PWA)

O Palavra Viva é um PWA: pode ser instalado como aplicativo (tela cheia, sem barra do navegador) e funciona **sem internet**. No primeiro acesso online, o app baixa tudo — telas, todas as histórias e todos os sons — e a partir daí não precisa mais de conexão. As histórias criadas pelo usuário já ficam no aparelho.

**Instalar**
- Android / Chrome / Edge / desktop: botão **📲 Instalar app** no topo (ou menu do navegador → *Instalar app*).
- iPhone / iPad (Safari): *Compartilhar* → *Adicionar à Tela de Início*. O botão do topo mostra essa instrução.

**Requisitos de hospedagem**
- Precisa de **HTTPS** (ou `localhost` para testes). Em `file://` o modo offline não funciona.
- Funciona na raiz do domínio ou em subpasta (ex.: GitHub Pages), pois todos os caminhos são relativos.

**Publicar uma atualização**
1. Altere o que quiser (histórias, sons, código).
2. Rode `node tools/stamp-sw.js` — ele troca a `VERSION` em `sw.js` por um hash do conteúdo. **Sem isso, quem já instalou o app continua vendo a versão antiga.**
3. Publique. Ao abrir o app, o usuário vê "Há uma nova versão do app" e toca em *Atualizar*.

Novas histórias e novos sons entram no modo offline automaticamente: o `sw.js` lê `stories/catalog.json` e `sounds/catalog.json` para saber o que baixar. Só é preciso rodar o passo 2.

**Ícones** ficam em `icons/`. Para regenerar: `pip install pillow && python3 tools/make-icons.py`.

## Como testar localmente

`fetch` não funciona abrindo o `index.html` direto. Use um servidor local:

```bash
python3 -m http.server 8000
```

Ou:

```bash
npx serve .
```

Abra http://localhost:8000. Para testar o offline: abra o app, espere a mensagem "O app já funciona sem internet", depois no DevTools (*Application → Service Workers*) marque *Offline* e recarregue.

## Criar minha própria história

Na tela inicial, toque em **✨ Criar minha história**.

1. Digite o título e escreva o texto na aba **✏️ Escrever**.
2. Selecione uma palavra (toque duplo ou arraste) — abre uma bandeja com os sons disponíveis. Toque num som e a palavra vira um chip com o emoji dele.
3. Prefere tocar? Use a aba **🔊 Sonorizar**: um toque numa palavra já a seleciona; arraste para várias palavras de uma vez.
4. Toque num chip para **trocar**, **ouvir** ou **remover** o som.
5. Tudo é salvo automaticamente no navegador (localStorage). Use **▶ Ler história** para ver como a criança vai ver, ou **⬇ Exportar .md** para baixar o arquivo no mesmo formato das histórias oficiais (basta colocar em `stories/<slug>/index.md` e registrar no `stories/catalog.json`).

A bandeja de sons é montada a partir de `sounds/catalog.json`: ao adicionar um som novo, ele aparece sozinho no editor. Com mais de 12 sons, aparece um campo de busca.

## Estrutura

- `js/store.js` — armazenamento das histórias do usuário e exportação.
- `js/editor.js` — editor (seleção de palavras, chips, bandeja de sons).
- `js/app.js` — rotas, catálogo e leitor.
- `js/pwa.js` — registro do service worker, botão de instalar, aviso de atualização.
- `sw.js` — service worker (cache offline).
- `manifest.webmanifest` — nome, ícones e modo standalone.
- `icons/`, `tools/` — ícones e scripts de apoio.

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
3. Registre em `sounds/catalog.json`. Campos opcionais usados pelo editor: `"label"` (nome curto exibido) e `"emoji"` (ícone do chip). Sem eles, o nome vem do id e o ícone é 🔊.
4. Referencie nas histórias como `[texto](id)`.

## Licenças

- Código: MIT (a definir no repositório).
- Histórias, imagens e áudios: licenças próprias indicadas em cada arquivo.