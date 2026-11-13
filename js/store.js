'use strict';

/*
 * Histórias criadas pelo usuário ficam no localStorage do navegador.
 * Formato de cada item: { id, title, body, createdAt, updatedAt }
 * `body` usa a mesma sintaxe das histórias oficiais: [texto](som-id)
 */

const USER_STORIES_KEY = 'palavra-viva:minhas-historias';

const userStories = {
  list() {
    try {
      const raw = localStorage.getItem(USER_STORIES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((s) => s && typeof s.id === 'string' && /^[a-z0-9]+$/.test(s.id))
        : [];
    } catch (err) {
      console.error('Falha ao ler histórias salvas:', err);
      return [];
    }
  },

  get(id) {
    return this.list().find((s) => s.id === id) || null;
  },

  /** Retorna true se salvou, false se o navegador recusou. */
  save(story) {
    try {
      const all = this.list();
      const idx = all.findIndex((s) => s.id === story.id);
      if (idx >= 0) all[idx] = story;
      else all.push(story);
      localStorage.setItem(USER_STORIES_KEY, JSON.stringify(all));
      return true;
    } catch (err) {
      console.error('Falha ao salvar história:', err);
      return false;
    }
  },

  remove(id) {
    try {
      const all = this.list().filter((s) => s.id !== id);
      localStorage.setItem(USER_STORIES_KEY, JSON.stringify(all));
      return true;
    } catch (err) {
      console.error('Falha ao excluir história:', err);
      return false;
    }
  },

  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },
};

/** Conta quantas palavras sonorizadas existem num texto em markdown. */
function countSoundWords(body) {
  return (String(body || '').match(/\[[^\]]+\]\([a-z0-9-]+\)/g) || []).length;
}

function slugify(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'minha-historia'
  );
}

/** Baixa a história como index.md, pronto para virar stories/<slug>/index.md */
function downloadStoryMarkdown(story) {
  const clean = (s) => String(s || '').replace(/"/g, '”').replace(/\r?\n/g, ' ').trim();
  const md =
    '---\n' +
    `title: "${clean(story.title) || 'Minha história'}"\n` +
    'desc: ""\n' +
    'age: ""\n' +
    'tag: \n' +
    'author: ""\n' +
    'license: ""\n' +
    '---\n\n' +
    `${story.body || ''}\n`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(story.title)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message, ms = 3200) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
