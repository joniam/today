import { setAuth, state, subscribe } from '../state';
import { triggerInbound } from '../sync/engine';
import { getFile } from '../sync/github';

interface FieldRefs {
  owner: HTMLInputElement;
  repo: HTMLInputElement;
  path: HTMLInputElement;
  token: HTMLInputElement;
}

export function initFirstRun(mount: HTMLElement): void {
  const overlay = buildFirstRunOverlay();
  mount.appendChild(overlay);

  const update = (): void => {
    overlay.style.display = state.authToken === null ? '' : 'none';
  };
  update();
  subscribe(update);
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

function buildForm(): { el: HTMLElement; refs: FieldRefs } {
  const form = document.createElement('form');
  form.className = 'auth-form';
  form.autocomplete = 'on';

  const { el: ownerEl, input: owner } = buildField('GitHub owner', 'username or org');
  const { el: repoEl, input: repo } = buildField('Repository', 'today-data');
  repo.value = 'today-data';
  const { el: pathEl, input: path } = buildField('File path', 'today.md');
  path.value = 'today.md';
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
  input.autocapitalize = 'off';

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
