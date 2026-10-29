'use strict';

const state = {
  storyCatalog: [],
  soundCatalog: {},
  audioCache: Object.create(null),
};

const app = document.getElementById('app');

/* ---------- utilities ---------- */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

/* ---------- front matter ---------- */

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const meta = Object.create(null);
  match[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 0) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key) meta[key] = value;
  });
  return { meta, body: match[2] };
}

/* ---------- story body ---------- */

function renderStoryBody(body) {
  const paragraphs = body.trim().split(/\n\s*\n/);
  return paragraphs
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(/\s*\n\s*/g, ' ');
      const withButtons = escaped.replace(
        /\[([^\]]+)\]\(([a-z0-9-]+)\)/g,
        (_m, displayText, soundId) =>
          `<button type="button" class="sound-word" data-sound-id="${soundId}">${displayText}</button>`
      );
      return `<p>${withButtons}</p>`;
    })
    .join('');
}

/* ---------- audio ---------- */

async function playSound(id) {
  const sound = state.soundCatalog[id];
  if (!sound) {
    console.warn(`Sound "${id}" not found in sounds/catalog.json.`);
    return;
  }
  const url = `sounds/${sound.file}`;
  let audio = state.audioCache[url];
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    state.audioCache[url] = audio;
  }
  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    console.error(`Failed to play sound "${id}":`, err);
  }
}

/* ---------- covers ---------- */

function attachCoverFallback(container) {
  const extensions = ['png', 'svg'];
  container.querySelectorAll('.cover[data-story-slug]').forEach((img) => {
    const slug = img.dataset.storySlug;
    let idx = 0;
    img.addEventListener('error', () => {
      idx++;
      if (idx < extensions.length) {
        img.src = `stories/${slug}/cover.${extensions[idx]}`;
      } else {
        img.style.display = 'none';
      }
    });
    img.src = `stories/${slug}/cover.${extensions[0]}`;
  });
}

/* ---------- screens ---------- */

async function renderCatalog() {
  app.innerHTML = '<p class="loading">Carregando histórias…</p>';
  document.title = 'Histórias Bíblicas';

  const items = await Promise.all(
    state.storyCatalog.map(async (slug) => {
      try {
        const text = await fetchText(`stories/${slug}/index.md`);
        const { meta } = parseFrontMatter(text);
        return { slug, meta };
      } catch (err) {
        console.error(`Failed to load story "${slug}":`, err);
        return null;
      }
    })
  );

  const valid = items.filter(Boolean);
  if (valid.length === 0) {
    app.innerHTML = '<h1>Histórias</h1><p class="error">Nenhuma história disponível.</p>';
    return;
  }

  const list = valid
    .map(({ slug, meta }) => {
      const title = escapeHtml(meta.title || slug);
      const desc = escapeHtml(meta.desc || '');
      const ageBadge = meta.age
        ? `<span class="age-badge">${escapeHtml(meta.age)} anos</span>`
        : '';
      return `
        <li>
          <a class="card" href="#/${slug}">
            <img class="cover" data-story-slug="${slug}" alt="">
            <div>
              <h2>${title}</h2>
              <p>${desc}</p>
              ${ageBadge}
            </div>
          </a>
        </li>`;
    })
    .join('');

  app.innerHTML = `<h1>Histórias</h1><ul class="catalog">${list}</ul>`;
  attachCoverFallback(app);
}

async function renderStory(slug) {
  app.innerHTML = '<p class="loading">Carregando história…</p>';
  try {
    const text = await fetchText(`stories/${slug}/index.md`);
    const { meta, body } = parseFrontMatter(text);
    const title = escapeHtml(meta.title || slug);
    document.title = `${title} · Histórias Bíblicas`;

    app.innerHTML = `
      <article class="reader">
        <a class="back" href="#/">← Voltar</a>
        <h1>${title}</h1>
        <div class="story-body">${renderStoryBody(body)}</div>
      </article>`;

    app.querySelectorAll('.sound-word').forEach((button) => {
      button.addEventListener('click', () => playSound(button.dataset.soundId));
    });
  } catch (err) {
    console.error(`Failed to load story "${slug}":`, err);
    app.innerHTML = '<p class="error">Não foi possível carregar a história.</p>';
  }
}

/* ---------- routing ---------- */

async function render() {
  const hash = location.hash || '#/';

  if (hash === '#/' || hash === '') {
    await renderCatalog();
    return;
  }

  const match = hash.match(/^#\/([a-z0-9-]+)$/);
  if (match) {
    await renderStory(match[1]);
    return;
  }

  location.hash = '#/';
}

/* ---------- init ---------- */

async function init() {
  try {
    state.storyCatalog = await fetchJson('stories/catalog.json');
    state.soundCatalog = await fetchJson('sounds/catalog.json');
  } catch (err) {
    console.error('Failed to load catalogs:', err);
    app.innerHTML = '<p class="error">Erro ao carregar os catálogos.</p>';
    return;
  }
  window.addEventListener('hashchange', render);
  await render();
}

init();