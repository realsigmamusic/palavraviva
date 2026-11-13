'use strict';

/*
 * Service worker do Palavra Viva — app 100% offline.
 *
 * Estratégia: cache-first com pré-cache versionado.
 *  - Na instalação baixa o app inteiro: arquivos do app, todas as histórias
 *    (lidas de stories/catalog.json) e todos os sons (lidos de sounds/catalog.json).
 *    Por isso, novas histórias e sons entram no cache sem mexer neste arquivo.
 *  - Depois disso, tudo é servido do cache, sem depender de rede.
 *  - Para publicar uma atualização: mude VERSION (ou rode `node tools/stamp-sw.js`).
 *    O app avisa o usuário e atualiza quando ele aceitar.
 */

const VERSION = '0.1.0';
const CACHE = `palavra-viva-${VERSION}`;

// Arquivos essenciais: se algum falhar, a instalação falha (nunca fica um app quebrado em cache).
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/store.js',
  'js/editor.js',
  'js/app.js',
  'js/pwa.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'stories/catalog.json',
  'sounds/catalog.json',
];

const COVER_EXTENSIONS = ['png', 'svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(CACHE);

  const store = async (url, { optional = false, quiet = false } = {}) => {
    try {
      const response = await fetch(url, { cache: 'reload' }); // ignora o cache HTTP do navegador
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      await cache.put(url, response);
    } catch (err) {
      if (!optional) throw err;
      if (!quiet) console.warn('[sw] ignorado:', err.message);
    }
  };

  await Promise.all(SHELL.map((url) => store(url)));

  // conteúdo descoberto pelos catálogos
  const readJson = async (url) => (await cache.match(url)).json();
  const [stories, sounds] = await Promise.all([
    readJson('stories/catalog.json'),
    readJson('sounds/catalog.json'),
  ]);

  const content = new Set();
  stories.forEach((slug) => content.add(`stories/${slug}/index.md`));
  Object.values(sounds).forEach((s) => s && s.file && content.add(`sounds/${s.file}`));
  await Promise.all([...content].map((url) => store(url, { optional: true })));

  await Promise.all(
    stories.flatMap((slug) =>
      COVER_EXTENSIONS.map((ext) => store(`stories/${slug}/cover.${ext}`, { optional: true, quiet: true }))
    )
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('palavra-viva-') && n !== CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// o app pede a troca de versão só quando o usuário aceita atualizar
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(handle(request));
});

async function handle(request) {
  const cache = await caches.open(CACHE);

  // navegação (abrir o app / recarregar): sempre o index.html em cache (SPA com rotas por #)
  if (request.mode === 'navigate') {
    const page = await cache.match('index.html');
    if (page) return page;
    return fetch(request);
  }

  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return request.headers.has('range') ? rangeResponse(request, cached) : cached;
  }

  // fora do pré-cache (ex.: capa nova): tenta a rede e guarda para a próxima
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return new Response('Sem conexão e arquivo não está no cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Áudio/vídeo pedem faixas de bytes (Range). O Safari exige resposta 206;
 * sem isso o som não toca offline. Fatiamos o arquivo que já está em cache.
 */
async function rangeResponse(request, response) {
  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!match) return response;

  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    start = Math.max(0, size - Number(match[2])); // "últimos N bytes"
    end = size - 1;
  } else {
    start = match[1] === '' ? 0 : Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
