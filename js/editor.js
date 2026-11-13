'use strict';

/*
 * Editor de histórias.
 *
 * Como funciona:
 *  - O texto é digitado num campo editável (contenteditable).
 *  - Palavras sonorizadas viram "chips" (<span class="ed-mark">) com emoji do som.
 *  - Ao salvar, o conteúdo é convertido para a mesma sintaxe das histórias
 *    oficiais:  [texto](som-id)
 *
 * Duas abas:
 *  - Escrever:   digita normalmente; selecione palavras (toque duplo / arraste).
 *  - Sonorizar:  texto fixo; um toque numa palavra já a seleciona.
 *
 * Os sons vêm de sounds/catalog.json. Campos opcionais por som: "label" e "emoji".
 */

const ZWSP = '\u200b'; // marcador invisível para o cursor poder ficar ao lado de um chip
const WORD_CHAR = /[\p{L}\p{N}-]/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;
const BLOCK_TAG = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/;

/* ---------- informações de um som ---------- */

function soundInfo(id) {
  const entry = state.soundCatalog[id];
  const fallback = id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return {
    label: (entry && entry.label) || fallback,
    emoji: (entry && entry.emoji) || '🔊',
    desc: (entry && entry.desc) || '',
    known: Boolean(entry),
  };
}

/* ---------- DOM: chips e parágrafos ---------- */

function createMark(text, soundId) {
  const info = soundInfo(soundId);
  const span = document.createElement('span');
  span.className = 'ed-mark';
  span.setAttribute('contenteditable', 'false');
  span.dataset.soundId = soundId;
  span.dataset.emoji = info.emoji;
  span.title = `Som: ${info.label}`;
  span.textContent = text;
  return span;
}

/** Garante texto antes e depois de cada chip (onde o cursor pode ficar). */
function ensureSentinels(scope) {
  const marks = scope.classList && scope.classList.contains('ed-mark')
    ? [scope]
    : Array.from(scope.querySelectorAll('.ed-mark'));
  marks.forEach((m) => {
    const prev = m.previousSibling;
    const next = m.nextSibling;
    if (!prev || prev.nodeType !== 3) m.parentNode.insertBefore(document.createTextNode(ZWSP), m);
    if (!next || next.nodeType !== 3) m.parentNode.insertBefore(document.createTextNode(ZWSP), m.nextSibling);
  });
}

/** Carrega markdown no editor. */
function loadBody(root, body) {
  root.textContent = '';
  const trimmed = String(body || '').trim();
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/) : [''];

  paragraphs.forEach((raw) => {
    const p = document.createElement('p');
    const text = raw.replace(/\s*\n\s*/g, ' ');
    if (!text) {
      p.appendChild(document.createElement('br'));
    } else {
      const re = /\[([^\]]+)\]\(([a-z0-9-]+)\)/g;
      let last = 0;
      let m;
      while ((m = re.exec(text))) {
        if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
        p.appendChild(createMark(m[1], m[2]));
        last = re.lastIndex;
      }
      if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
    }
    root.appendChild(p);
    ensureSentinels(p);
  });
}

/** Converte o conteúdo do editor em markdown ([texto](som-id)). */
function serializeEditor(root) {
  const paragraphs = [];
  let cur = '';

  const flush = () => {
    const t = cur.replace(/\s+/g, ' ').trim();
    if (t) paragraphs.push(t);
    cur = '';
  };

  (function walk(node) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        // colchetes são removidos para não virarem sintaxe por acidente
        cur += child.nodeValue.replace(/[\u200b[\]]/g, '');
      } else if (child.nodeType === 1) {
        if (child.classList.contains('ed-mark')) {
          const t = child.textContent.replace(/[\u200b[\]]/g, '').replace(/\s+/g, ' ').trim();
          if (t) cur += `[${t}](${child.dataset.soundId})`;
        } else if (child.tagName === 'BR') {
          flush();
        } else if (BLOCK_TAG.test(child.tagName)) {
          flush();
          walk(child);
          flush();
        } else {
          walk(child);
        }
      }
    });
  })(root);

  flush();
  return paragraphs.join('\n\n');
}

/* ---------- seleção -> palavra(s) sonorizada(s) ---------- */

/** Bloco (parágrafo) de nível superior que contém o nó. */
function blockOf(root, node) {
  if (node === root) return root;
  let n = node;
  while (n.parentNode && n.parentNode !== root) n = n.parentNode;
  if (n.parentNode !== root) return null;
  return n.nodeType === 1 && BLOCK_TAG.test(n.tagName) ? n : root;
}

/** Se a seleção pega só um pedaço de uma palavra, estende até a palavra inteira. */
function expandToWord(range) {
  let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
  if (sc.nodeType === 3) {
    const t = sc.nodeValue;
    while (so > 0 && WORD_CHAR.test(t[so - 1])) so--;
  }
  if (ec.nodeType === 3) {
    const t = ec.nodeValue;
    while (eo < t.length && WORD_CHAR.test(t[eo])) eo++;
  }
  range.setStart(sc, so);
  range.setEnd(ec, eo);
}

/**
 * Transforma o trecho selecionado em um chip com o som escolhido.
 * Retorna { span } em caso de sucesso ou { error } com o motivo.
 */
function wrapRangeWithSound(root, range, soundId) {
  const r = range.cloneRange();
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return { error: 'outside' };

  // chips tocados pela seleção entram inteiros (o som antigo é substituído)
  root.querySelectorAll('.ed-mark').forEach((m) => {
    if (m.contains(r.startContainer)) r.setStartBefore(m);
    if (m.contains(r.endContainer)) r.setEndAfter(m);
  });

  const startBlock = blockOf(root, r.startContainer);
  let endBlock = blockOf(root, r.endContainer);

  // triplo clique: o fim da seleção cai no início do parágrafo seguinte
  if (startBlock !== endBlock && r.endOffset === 0 && endBlock && endBlock.previousElementSibling === startBlock) {
    r.setEnd(startBlock, startBlock.childNodes.length);
    endBlock = startBlock;
  }
  if (!startBlock || startBlock !== endBlock) return { error: 'multi' };

  expandToWord(r);

  const fragment = r.extractContents();
  const raw = fragment.textContent.replace(/\u200b/g, '');
  const lead = raw.match(/^[^\p{L}\p{N}]*/u)[0];
  const trail = raw.slice(lead.length).match(/[^\p{L}\p{N}]*$/u)[0];
  const core = raw.slice(lead.length, raw.length - trail.length);

  if (!core) {
    r.insertNode(fragment); // desfaz
    startBlock.normalize();
    return { error: 'empty' };
  }

  const span = createMark(core, soundId);
  const out = document.createDocumentFragment();
  if (lead) out.appendChild(document.createTextNode(lead));
  out.appendChild(span);
  if (trail) out.appendChild(document.createTextNode(trail));
  r.insertNode(out);

  startBlock.normalize();
  ensureSentinels(startBlock);
  return { span };
}

/** Remove o som de um chip, devolvendo o texto simples. */
function unwrapMark(span) {
  const parent = span.parentNode;
  const text = document.createTextNode(span.textContent);
  span.replaceWith(text);
  parent.normalize();
  return text;
}

/* ---------- helpers de ponteiro (aba Sonorizar) ---------- */

function caretRangeAtPoint(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  return null;
}

function wordRangeAtPoint(root, x, y) {
  const caret = caretRangeAtPoint(x, y);
  if (!caret || caret.startContainer.nodeType !== 3 || !root.contains(caret.startContainer)) return null;

  const node = caret.startContainer;
  const t = node.nodeValue;
  let s = caret.startOffset;
  let e = caret.startOffset;
  while (s > 0 && WORD_CHAR.test(t[s - 1])) s--;
  while (e < t.length && WORD_CHAR.test(t[e])) e++;
  if (s === e || !HAS_ALNUM.test(t.slice(s, e))) return null;

  const word = document.createRange();
  word.setStart(node, s);
  word.setEnd(node, e);

  // o toque precisa ter sido em cima da palavra (e não no espaço em branco ao lado)
  const hit = Array.from(word.getClientRects()).some(
    (rect) => x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4
  );
  return hit ? word : null;
}

/* ---------- tela do editor ---------- */

function renderEditor(storyId) {
  const existing = storyId ? userStories.get(storyId) : null;
  if (storyId && !existing) {
    app.innerHTML =
      '<p class="error">História não encontrada.</p><a class="back" href="#/">← Voltar</a>';
    return;
  }

  let id = existing ? existing.id : null;
  const createdAt = existing ? existing.createdAt || Date.now() : Date.now();
  document.title = 'Criar história · Palavra Viva';

  const soundIds = Object.keys(state.soundCatalog);
  const chipsHtml = soundIds
    .map((sid) => {
      const info = soundInfo(sid);
      return `
        <button type="button" class="sound-chip" data-sound-id="${escapeHtml(sid)}"
                data-search="${escapeHtml((info.label + ' ' + info.desc).toLowerCase())}"
                title="${escapeHtml(info.desc)}" aria-pressed="false">
          <span class="chip-emoji" aria-hidden="true">${info.emoji}</span>
          <span class="chip-label">${escapeHtml(info.label)}</span>
        </button>`;
    })
    .join('');

  app.innerHTML = `
    <section class="editor-screen">
      <a class="back" href="#/">← Voltar</a>
      <h1>${existing ? 'Editar história' : 'Criar minha história'}</h1>

      <label class="sr-only" for="ed-title">Título da história</label>
      <input id="ed-title" class="ed-title" type="text" maxlength="80"
             placeholder="Título da história" autocomplete="off">

      <div class="mode-tabs" role="tablist" aria-label="Modo de edição">
        <button type="button" role="tab" id="tab-write" class="mode-tab active" aria-selected="true">✏️ Escrever</button>
        <button type="button" role="tab" id="tab-sound" class="mode-tab" aria-selected="false">🔊 Sonorizar</button>
      </div>
      <p class="ed-hint" id="ed-hint"></p>

      <div class="editor-wrap">
        <div class="ed-placeholder" id="ed-placeholder">Era uma vez…</div>
        <div id="editor" class="editor" contenteditable="true" role="textbox"
             aria-multiline="true" aria-label="Texto da história"></div>
      </div>

      <div class="ed-footer">
        <span id="ed-count"></span>
        <span id="ed-status" class="ed-status" aria-live="polite"></span>
      </div>

      <div class="ed-actions">
        <button type="button" id="btn-read" class="btn primary">▶ Ler história</button>
        <button type="button" id="btn-export" class="btn">⬇ Exportar .md</button>
        <button type="button" id="btn-delete" class="btn danger" ${existing ? '' : 'hidden'}>🗑 Excluir</button>
      </div>
    </section>

    <div id="tray" class="tray" hidden>
      <div class="tray-inner">
        <div class="tray-head">
          <div class="tray-title" id="tray-title"></div>
          <button type="button" class="tray-btn" id="tray-listen" hidden>▶ Ouvir</button>
          <button type="button" class="tray-btn" id="tray-remove" hidden>Sem som</button>
          <button type="button" class="tray-btn tray-close" id="tray-close" aria-label="Fechar">✕</button>
        </div>
        ${soundIds.length > 12 ? '<input type="search" id="tray-filter" class="tray-filter" placeholder="Buscar som…" autocomplete="off">' : ''}
        <div class="tray-sounds" id="tray-sounds">${chipsHtml}</div>
      </div>
    </div>`;

  const $ = (sel) => app.querySelector(sel);
  const editor = $('#editor');
  const titleInput = $('#ed-title');
  const placeholder = $('#ed-placeholder');
  const hint = $('#ed-hint');
  const status = $('#ed-status');
  const count = $('#ed-count');
  const tray = $('#tray');
  const trayTitle = $('#tray-title');
  const trayListen = $('#tray-listen');
  const trayRemove = $('#tray-remove');
  const btnDelete = $('#btn-delete');

  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) { /* ok */ }

  titleInput.value = existing ? existing.title || '' : '';
  loadBody(editor, existing ? existing.body : '');

  let mode = 'write';
  let ctx = null; // { kind: 'new', range, text } | { kind: 'edit', span, text, at }
  let trayBusy = false;
  let dirty = false;
  let saveTimer = null;

  /* ----- status, contador, placeholder ----- */

  function refreshMeta() {
    const marks = editor.querySelectorAll('.ed-mark').length;
    count.textContent =
      marks === 0 ? 'Nenhuma palavra sonorizada ainda'
      : marks === 1 ? '1 palavra sonorizada'
      : `${marks} palavras sonorizadas`;
    placeholder.hidden = serializeEditor(editor) !== '';
  }

  /* ----- salvar ----- */

  function save() {
    clearTimeout(saveTimer);
    const title = titleInput.value.trim();
    const body = serializeEditor(editor);
    if (!id && !title && !body) { status.textContent = ''; dirty = false; return false; }

    if (!id) {
      id = userStories.newId();
      history.replaceState(null, '', `#/editar/${id}`);
      btnDelete.hidden = false;
    }
    const ok = userStories.save({ id, title, body, createdAt, updatedAt: Date.now() });
    status.textContent = ok ? 'Salvo ✓' : '⚠️ Não foi possível salvar neste navegador';
    dirty = !ok;
    return ok;
  }

  function scheduleSave() {
    dirty = true;
    status.textContent = 'Salvando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }

  function afterEdit() {
    if (!editor.firstChild) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      editor.appendChild(p);
    }
    refreshMeta();
    scheduleSave();
  }

  /* ----- bandeja de sons ----- */

  function setCtx(next) {
    ctx = next;
    editor.querySelectorAll('.ed-mark.editing').forEach((m) => m.classList.remove('editing'));

    if (!next) {
      tray.hidden = true;
      document.body.classList.remove('tray-open');
      return;
    }

    const shown = next.text.length > 40 ? next.text.slice(0, 40) + '…' : next.text;
    const isEdit = next.kind === 'edit';
    trayTitle.textContent = isEdit ? `Som de “${shown}”` : `Escolha um som para “${shown}”`;
    trayListen.hidden = !isEdit;
    trayRemove.hidden = !isEdit;
    if (isEdit) next.span.classList.add('editing');

    const current = isEdit ? next.span.dataset.soundId : null;
    tray.querySelectorAll('.sound-chip').forEach((chip) => {
      const on = chip.dataset.soundId === current;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    });

    tray.hidden = false;
    document.body.classList.add('tray-open');
  }

  /** Lê a seleção atual e diz o que dá para sonorizar. */
  function contextFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return null;

    const text = range.toString().replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
    if (!HAS_ALNUM.test(text)) return null;

    // seleção que cobre exatamente um chip = editar aquele chip
    const touched = Array.from(editor.querySelectorAll('.ed-mark')).filter((m) => range.intersectsNode(m));
    if (touched.length === 1 && touched[0].textContent.trim() === text) {
      return { kind: 'edit', span: touched[0], text, at: performance.now() };
    }
    return { kind: 'new', range: range.cloneRange(), text };
  }

  function placeCaretAfter(span) {
    const sel = window.getSelection();
    const next = span.nextSibling;
    const r = document.createRange();
    if (next && next.nodeType === 3) {
      r.setStart(next, next.nodeValue.startsWith(ZWSP) ? 1 : 0);
    } else {
      r.setStartAfter(span);
    }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function applySound(soundId) {
    if (!ctx) return;
    let span;

    if (ctx.kind === 'edit') {
      span = ctx.span;
      const info = soundInfo(soundId);
      span.dataset.soundId = soundId;
      span.dataset.emoji = info.emoji;
      span.title = `Som: ${info.label}`;
    } else {
      const result = wrapRangeWithSound(editor, ctx.range, soundId);
      if (result.error === 'multi') {
        showToast('Selecione palavras de um mesmo parágrafo.');
        return;
      }
      if (!result.span) {
        showToast('Selecione uma palavra para sonorizar.');
        return;
      }
      span = result.span;
    }

    playSound(soundId);
    setCtx(null);
    if (mode === 'write') placeCaretAfter(span);
    else window.getSelection().removeAllRanges();
    afterEdit();
  }

  function removeSound() {
    if (!ctx || ctx.kind !== 'edit') return;
    unwrapMark(ctx.span);
    setCtx(null);
    window.getSelection().removeAllRanges();
    afterEdit();
  }

  /* ----- abas ----- */

  function setMode(next) {
    mode = next;
    const writing = mode === 'write';
    editor.setAttribute('contenteditable', writing ? 'true' : 'false');
    editor.classList.toggle('sound-mode', !writing);
    $('#tab-write').classList.toggle('active', writing);
    $('#tab-write').setAttribute('aria-selected', String(writing));
    $('#tab-sound').classList.toggle('active', !writing);
    $('#tab-sound').setAttribute('aria-selected', String(!writing));
    hint.textContent = writing
      ? 'Escreva sua história. Para dar vida a uma palavra, dê dois toques nela (ou arraste sobre ela) e escolha um som. Ou use a aba Sonorizar.'
      : 'Toque numa palavra para escolher um som. Para várias palavras de uma vez, arraste o dedo sobre elas. Toque num ícone colorido para trocar ou remover o som.';

    window.getSelection().removeAllRanges();
    setCtx(null);
    if (writing) {
      editor.focus();
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  /* ----- eventos ----- */

  editor.addEventListener('input', afterEdit);
  titleInput.addEventListener('input', scheduleSave);

  // colar sempre como texto puro (sem formatação vinda de outros sites)
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    text.split(/\r?\n/).forEach((line, i) => {
      if (i > 0) document.execCommand('insertParagraph');
      if (line) document.execCommand('insertText', false, line);
    });
  });

  editor.addEventListener('click', (e) => {
    // toque num chip: abrir bandeja para trocar/remover/ouvir
    const mark = e.target.closest && e.target.closest('.ed-mark');
    if (mark && editor.contains(mark)) {
      setCtx({ kind: 'edit', span: mark, text: mark.textContent.trim(), at: performance.now() });
      return;
    }

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // o usuário arrastou uma seleção

    if (mode === 'sound') {
      const word = wordRangeAtPoint(editor, e.clientX, e.clientY);
      if (word) {
        sel.removeAllRanges();
        sel.addRange(word);
      } else {
        sel.removeAllRanges();
        setCtx(null);
      }
    } else if (ctx && ctx.kind === 'edit') {
      setCtx(null);
    }
  });

  const onSelectionChange = () => {
    if (trayBusy) return;
    const next = contextFromSelection();
    if (next) { setCtx(next); return; }
    // logo após tocar num chip, a seleção "colapsa": não feche a bandeja por isso
    if (ctx && ctx.kind === 'edit' && performance.now() - ctx.at < 500) return;
    if (ctx) setCtx(null);
  };
  document.addEventListener('selectionchange', onSelectionChange);

  // a bandeja não pode roubar o foco/seleção do texto
  let busyTimer = null;
  const holdBusy = () => { trayBusy = true; clearTimeout(busyTimer); busyTimer = setTimeout(() => { trayBusy = false; }, 400); };
  ['pointerdown', 'mousedown', 'touchstart'].forEach((evt) =>
    tray.addEventListener(evt, (e) => { holdBusy(); if (evt !== 'touchstart') e.preventDefault(); }, { passive: evt === 'touchstart' })
  );

  tray.addEventListener('click', (e) => {
    const chip = e.target.closest('.sound-chip');
    if (chip) applySound(chip.dataset.soundId);
  });
  trayListen.addEventListener('click', () => ctx && ctx.kind === 'edit' && playSound(ctx.span.dataset.soundId));
  trayRemove.addEventListener('click', removeSound);
  $('#tray-close').addEventListener('click', () => {
    window.getSelection().removeAllRanges();
    setCtx(null);
  });

  const filter = $('#tray-filter');
  if (filter) {
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      tray.querySelectorAll('.sound-chip').forEach((chip) => {
        chip.hidden = q !== '' && !chip.dataset.search.includes(q);
      });
    });
    // o filtro precisa receber foco normalmente (sem perder o trecho selecionado)
    ['mousedown', 'pointerdown'].forEach((evt) =>
      filter.addEventListener(evt, (e) => e.stopPropagation())
    );
    filter.addEventListener('focus', () => { trayBusy = true; });
    filter.addEventListener('blur', () => { trayBusy = false; });
  }

  document.addEventListener('keydown', onKeydown);
  function onKeydown(e) {
    if (e.key === 'Escape' && ctx) setCtx(null);
  }

  $('#tab-write').addEventListener('click', () => setMode('write'));
  $('#tab-sound').addEventListener('click', () => setMode('sound'));

  $('#btn-read').addEventListener('click', () => {
    if (!save() || !id) {
      showToast('Escreva alguma coisa antes de ler.');
      return;
    }
    location.hash = `#/minhas/${id}`;
  });

  $('#btn-export').addEventListener('click', () => {
    const body = serializeEditor(editor);
    if (!body) { showToast('Escreva alguma coisa antes de exportar.'); return; }
    downloadStoryMarkdown({ title: titleInput.value.trim(), body });
  });

  btnDelete.addEventListener('click', () => {
    if (!id) return;
    if (!confirm('Excluir esta história? Essa ação não pode ser desfeita.')) return;
    dirty = false;
    userStories.remove(id);
    location.hash = '#/';
  });

  const onHide = () => { if (dirty) save(); };
  window.addEventListener('pagehide', onHide);

  currentCleanup = () => {
    if (dirty) save();
    clearTimeout(saveTimer);
    clearTimeout(busyTimer);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('pagehide', onHide);
    document.body.classList.remove('tray-open');
  };

  setMode('write');
  if (!existing) titleInput.focus();
  refreshMeta();
}
