(() => {
  'use strict';

  const views = [...document.querySelectorAll('[data-prototype-view]')];
  const topViewButtons = [...document.querySelectorAll('.ap-view-switch [data-view-switch]')];
  const toast = document.getElementById('apToast');
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function switchView(name) {
    views.forEach(view => {
      const active = view.dataset.prototypeView === name;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    topViewButtons.forEach(button => {
      const active = button.dataset.viewSwitch === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showPanel(type, name) {
    const view = document.querySelector('[data-prototype-view="' + type + '"]');
    if (!view) return;
    view.querySelectorAll('[data-' + type + '-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset[type + 'Panel'] === name);
    });
    view.querySelectorAll('[data-' + type + '-target]').forEach(button => {
      button.classList.toggle('active', button.dataset[type + 'Target'] === name);
    });
    const workspace = view.querySelector('.ap-workspace');
    if (workspace) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('click', event => {
    const viewSwitch = event.target.closest('[data-view-switch]');
    if (viewSwitch) {
      switchView(viewSwitch.dataset.viewSwitch);
      return;
    }

    const memberNav = event.target.closest('[data-member-target]');
    if (memberNav) {
      showPanel('member', memberNav.dataset.memberTarget);
      return;
    }

    const ownerNav = event.target.closest('[data-owner-target]');
    if (ownerNav) {
      showPanel('owner', ownerNav.dataset.ownerTarget);
      return;
    }

    const memberJump = event.target.closest('[data-member-target-jump]');
    if (memberJump) {
      showPanel('member', memberJump.dataset.memberTargetJump);
      return;
    }

    const ownerJump = event.target.closest('[data-owner-target-jump]');
    if (ownerJump) {
      showPanel('owner', ownerJump.dataset.ownerTargetJump);
      return;
    }

    const toggle = event.target.closest('.ap-toggle');
    if (toggle) {
      const on = !toggle.classList.contains('on');
      toggle.classList.toggle('on', on);
      toggle.setAttribute('aria-pressed', String(on));
      showToast(on ? 'Preference turned on in this prototype.' : 'Preference turned off in this prototype.');
      return;
    }

    const receipt = event.target.closest('[data-receipt]');
    if (receipt) {
      openReceipt(receipt.dataset.receipt);
      return;
    }

    const close = event.target.closest('[data-close-dialog]');
    if (close) {
      close.closest('dialog')?.close();
      return;
    }

    const messageButton = event.target.closest('[data-toast]');
    if (messageButton) {
      showToast(messageButton.dataset.toast);
      return;
    }

    if (event.target.closest('[data-save-preferences]')) {
      const subscribed = document.getElementById('memberNewsletterConsent')?.checked;
      showToast(subscribed ? 'Preferences saved. Assembly Updates are on.' : 'Preferences saved. Assembly Updates remain off.');
      return;
    }

    const audience = event.target.closest('[data-audience]');
    if (audience) {
      document.querySelectorAll('[data-audience]').forEach(card => card.classList.toggle('active', card === audience));
      const select = document.getElementById('apComposerAudience');
      if (select) select.value = audience.dataset.audience;
      return;
    }

    if (event.target.closest('[data-open-composer]')) {
      document.getElementById('apComposerDialog')?.showModal();
    }
  });

  const receiptData = {
    'TUA-1ON1-4812': { member: 'Maya Johnson', description: '30-Minute One-on-One Session', amount: '$0.00' },
    'TUA-CLASS-2951': { member: 'Maya Johnson', description: 'Discernment Class', amount: '$25.00' },
    'TUA-CLASS-8820': { member: 'Daniel Brooks', description: 'Discernment Class', amount: '$25.00' }
  };

  function openReceipt(id) {
    const data = receiptData[id] || { member: 'Member', description: 'Ministry Registration', amount: '$0.00' };
    const dialog = document.getElementById('apReceiptDialog');
    document.getElementById('apReceiptNumber').textContent = id;
    document.getElementById('apReceiptMember').textContent = data.member;
    document.getElementById('apReceiptDescription').textContent = data.description;
    document.getElementById('apReceiptAmount').textContent = data.amount;
    dialog?.showModal();
  }

  document.querySelectorAll('.ap-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  });

  document.getElementById('apComposerForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const audience = document.getElementById('apComposerAudience');
    const label = audience?.selectedOptions[0]?.textContent || 'selected audience';
    document.getElementById('apComposerDialog')?.close();
    showToast('Prototype preview created for ' + label + '. Nothing was sent.');
  });

  document.querySelectorAll('.ap-filter-row input[type="search"]').forEach(input => {
    input.addEventListener('input', () => {
      const card = input.closest('.ap-card');
      const term = input.value.trim().toLowerCase();
      card?.querySelectorAll('tbody tr').forEach(row => {
        row.hidden = Boolean(term && !row.textContent.toLowerCase().includes(term));
      });
    });
  });
})();