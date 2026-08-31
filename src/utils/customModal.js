import { arcadeAudio } from './arcadeAudio.js';

let modalContainer = null;

function getOrCreateContainer() {
  if (!modalContainer || !document.body.contains(modalContainer)) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'custom-alert-container';
    modalContainer.className = 'custom-modal-wrapper';
    document.body.appendChild(modalContainer);
  }
  return modalContainer;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Display a custom alert modal to replace browser window.alert
 * @param {string} message - Message body to display
 * @param {string} [title="Notification"] - Modal header title
 * @returns {Promise<void>} Resolves when modal is dismissed
 */
export function showAlert(message, title = 'Notification') {
  return new Promise((resolve) => {
    arcadeAudio.playConflict();
    const container = getOrCreateContainer();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay custom-alert-overlay';

    overlay.innerHTML = `
      <div class="modal-card custom-alert-card" role="dialog" aria-modal="true" aria-labelledby="custom-alert-title">
        <div class="modal-header custom-alert-header">
          <div class="custom-alert-title-wrapper">
            <span class="custom-alert-icon">⚡</span>
            <h3 id="custom-alert-title" class="custom-alert-title">${escapeHtml(title)}</h3>
          </div>
          <button class="btn btn-ghost icon-only btn-sm btn-close-custom-modal" title="Close modal">&times;</button>
        </div>
        <div class="modal-body custom-alert-body">
          <p class="custom-alert-message">${escapeHtml(message)}</p>
        </div>
        <div class="custom-alert-footer">
          <button class="btn btn-primary btn-custom-modal-ok">OK</button>
        </div>
      </div>
    `;

    const close = () => {
      arcadeAudio.playClick();
      overlay.classList.add('fade-out');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve();
      }, 150);
    };

    const btnClose = overlay.querySelector('.btn-close-custom-modal');
    const btnOk = overlay.querySelector('.btn-custom-modal-ok');

    btnClose.addEventListener('click', close);
    btnOk.addEventListener('click', close);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        document.removeEventListener('keydown', handleKeyDown);
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    container.appendChild(overlay);
    btnOk.focus();
  });
}

/**
 * Display a custom confirmation dialog to replace browser window.confirm
 * @param {string} message - Question/Prompt message to display
 * @param {string} [title="Confirmation Required"] - Modal header title
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function showConfirm(message, title = 'Confirmation Required') {
  return new Promise((resolve) => {
    arcadeAudio.playSelect();
    const container = getOrCreateContainer();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay custom-alert-overlay';

    overlay.innerHTML = `
      <div class="modal-card custom-alert-card" role="dialog" aria-modal="true" aria-labelledby="custom-confirm-title">
        <div class="modal-header custom-alert-header">
          <div class="custom-alert-title-wrapper">
            <span class="custom-alert-icon">❓</span>
            <h3 id="custom-confirm-title" class="custom-alert-title">${escapeHtml(title)}</h3>
          </div>
          <button class="btn btn-ghost icon-only btn-sm btn-close-custom-modal" title="Close modal">&times;</button>
        </div>
        <div class="modal-body custom-alert-body">
          <p class="custom-alert-message">${escapeHtml(message)}</p>
        </div>
        <div class="custom-alert-footer">
          <button class="btn btn-ghost btn-custom-modal-cancel">Cancel</button>
          <button class="btn btn-primary btn-custom-modal-confirm">Confirm</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown);
      overlay.classList.add('fade-out');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 150);
    };

    const handleConfirm = () => {
      arcadeAudio.playAutoFix();
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      arcadeAudio.playClick();
      cleanup();
      resolve(false);
    };

    overlay.querySelector('.btn-close-custom-modal').addEventListener('click', handleCancel);
    overlay.querySelector('.btn-custom-modal-cancel').addEventListener('click', handleCancel);
    overlay.querySelector('.btn-custom-modal-confirm').addEventListener('click', handleConfirm);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleCancel();
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter') {
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    container.appendChild(overlay);
    overlay.querySelector('.btn-custom-modal-confirm').focus();
  });
}

/**
 * Install global overrides for window.alert and window.confirm
 */
export function installGlobalAlertOverrides() {
  if (typeof window !== 'undefined') {
    window.alert = (msg) => {
      showAlert(msg);
    };
  }
}
