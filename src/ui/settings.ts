import { clearAuth, setAuth, state, subscribe } from '../state';
import { triggerInbound } from '../sync/engine';
import { getFile } from '../sync/github';

interface FieldRefs {
  owner: HTMLInputElement;
  repo: HTMLInputElement;
  path: HTMLInputElement;
  token: HTMLInputElement;
}

export function initSettings(button: HTMLElement, mount: HTMLElement): void {
  const overlay = buildFirstRunOverlay();
  const { el: backdrop, syncFromState } = buildSettingsSheet(() => {
    backdrop.classList.remove('open');
  });

  mount.appendChild(overlay);
  mount.appendChild(backdrop);

  button.addEventListener('click', () => {
    syncFromState();
    backdrop.classList.add('open');
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });

  const updateOverlay = (): void => {
    overlay.style.display = state.authToken === null ? '' : 'none';
  };
  updateOverlay();
  subscribe(updateOverlay);
}

function buildFirstRunOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'setup-overlay';

  const content = document.createElement('div');
  content.className = 'setup-content';

  const logo = document.createElement('div');
  logo.className = 'setup-logo';
  logo.textContent = 'Today';

  const tagline = document.createElement('p');
  tagline.className = 'setup-tagline';
  tagline.textContent =
    'Connect your GitHub data repository to sync tasks across devices.';

  const { el: formEl, refs } = buildForm();
  const errorEl = document.createElement('div');
  errorEl.className = 'auth-error';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'auth-btn-primary';
  saveBtn.textContent = 'Connect';

  saveBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Connecting...';
    try {
      await doSave(refs, errorEl);
    } catch {
      // error already shown in errorEl
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Connect';
    }
  });

  const actions = document.createElement('div');
  actions.className = 'auth-actions';
  actions.appendChild(saveBtn);
  actions.appendChild(errorEl);

  formEl.appendChild(actions);
  content.appendChild(logo);
  content.appendChild(tagline);
  content.appendChild(formEl);
  overlay.appendChild(content);
  return overlay;
}

function buildSettingsSheet(
  onClose: () => void,
): { el: HTMLElement; syncFromState: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'settings-backdrop';

  const sheet = document.createElement('div');
  sheet.className = 'settings-sheet';

  const handle = document.createElement('div');
  handle.className = 'settings-sheet-handle';

  const title = document.createElement('div');
  title.className = 'settings-sheet-title';
  title.textContent = 'GitHub Sync';

  const { el: formEl, refs } = buildForm();
  const errorEl = document.createElement('div');
  errorEl.className = 'auth-error';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'auth-btn-primary';
  saveBtn.textContent = 'Save';

  const disconnectBtn = document.createElement('button');
  disconnectBtn.type = 'button';
  disconnectBtn.className = 'auth-btn-secondary';
  disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.addEventListener('click', () => {
    clearAuth();
    onClose();
  });

  saveBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await doSave(refs, errorEl);
      onClose();
    } catch {
      // error already shown in errorEl
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  const actions = document.createElement('div');
  actions.className = 'auth-actions';
  actions.appendChild(saveBtn);
  actions.appendChild(disconnectBtn);
  actions.appendChild(errorEl);

  formEl.appendChild(actions);
  sheet.appendChild(handle);
  sheet.appendChild(title);
  sheet.appendChild(formEl);
  backdrop.appendChild(sheet);

  function syncFromState(): void {
    refs.owner.value = state.dataRepo.owner;
    refs.repo.value = state.dataRepo.repo;
    refs.path.value = state.dataRepo.path || 'today.md';
    refs.token.value = state.authToken ?? '';
    errorEl.textContent = '';
  }

  return { el: backdrop, syncFromState };
}

function buildForm(): { el: HTMLElement; refs: FieldRefs } {
  const form = document.createElement('div');
  form.className = 'auth-form';

  const { el: ownerEl, input: owner } = buildField('GitHub owner', 'username or org');
  const { el: repoEl, input: repo } = buildField('Repository', 'my-data-repo');
  const { el: pathEl, input: path } = buildField('File path', 'today.md');
  const { el: tokenEl, input: token } = buildField('Personal access token', '');
  token.type = 'password';
  token.autocomplete = 'current-password';

  form.appendChild(ownerEl);
  form.appendChild(repoEl);
  form.appendChild(pathEl);
  form.appendChild(tokenEl);

  return { el: form, refs: { owner, repo, path, token } };
}

function buildField(
  labelText: string,
  placeholder: string,
): { el: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('div');
  field.className = 'auth-field';

  const label = document.createElement('label');

  const span = document.createElement('span');
  span.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;

  label.appendChild(span);
  label.appendChild(input);
  field.appendChild(label);

  return { el: field, input };
}

async function doSave(refs: FieldRefs, errorEl: HTMLElement): Promise<void> {
  const owner = refs.owner.value.trim();
  const repo = refs.repo.value.trim();
  const path = refs.path.value.trim() || 'today.md';
  const token = refs.token.value.trim();

  if (!owner || !repo || !token) {
    errorEl.textContent = 'Owner, repository, and token are required.';
    throw new Error('validation');
  }

  try {
    await getFile(token, owner, repo, path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('403')) {
      errorEl.textContent = 'Access denied. Check that your token has repo read/write scope.';
    } else if (msg.includes('404')) {
      errorEl.textContent = 'File not found. Check the owner, repo name, and file path.';
    } else {
      errorEl.textContent = 'Connection failed. Check your details and try again.';
    }
    throw err;
  }

  setAuth(token, { owner, repo, path });
  console.log('[settings] auth saved, triggering inbound sync');
  void triggerInbound();
}
