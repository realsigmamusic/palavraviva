'use strict';

/*
 * PWA: registro do service worker, botão "Instalar" e aviso de atualização.
 * Service workers exigem HTTPS (ou localhost).
 */

(function () {
  const installBtn = document.getElementById('btn-install');

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------- instalar ---------- */

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // guardamos para mostrar no nosso botão
    deferredPrompt = event;
    if (installBtn) installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    showToast('Palavra Viva instalado! 🎉');
  });

  if (installBtn) {
    // iOS não tem o evento acima: mostramos o botão com as instruções manuais
    if (isIos() && !isStandalone()) installBtn.hidden = false;

    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.hidden = true;
      } else if (isIos()) {
        showToast('Toque em Compartilhar (□↑) e depois em “Adicionar à Tela de Início”.', 9000);
      }
    });
  }

  /* ---------- service worker ---------- */

  if (!('serviceWorker' in navigator)) return;

  if (location.protocol === 'file:') return;

  let userAskedUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // no primeiro acesso o SW assume o controle sem precisar recarregar
    if (userAskedUpdate) location.reload();
  });

  function showUpdateBar(worker) {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span>Há uma nova versão do app.</span>' +
      '<button type="button" class="btn primary" id="update-now">Atualizar</button>' +
      '<button type="button" class="tray-btn" id="update-later" aria-label="Depois">✕</button>';
    document.body.appendChild(bar);

    bar.querySelector('#update-now').addEventListener('click', () => {
      userAskedUpdate = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    bar.querySelector('#update-later').addEventListener('click', () => bar.remove());
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');

      // já havia uma versão nova esperando (app foi fechado antes de atualizar)
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBar(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return;
          if (navigator.serviceWorker.controller) showUpdateBar(worker);
          else showToast('Pronto! O app já funciona sem internet ✓', 5000);
        });
      });

      // apps instalados ficam abertos por dias: procura atualização ao voltar para o app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch (err) {
      console.error('Falha ao registrar o service worker:', err);
    }
  });
})();
