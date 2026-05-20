const API = 'https://api.github.com';

export interface GitHubFile {
  content: string;
  sha: string;
}

export async function getFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<GitHubFile> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const json = await res.json() as { content: string; sha: string };
  return {
    content: decodeBase64(json.content),
    sha: json.sha,
  };
}

export async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
): Promise<{ sha: string }> {
  const body: Record<string, string> = {
    message,
    content: encodeBase64(content),
  };
  if (sha) body['sha'] = sha;
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${text}`);
  }
  const json = await res.json() as { content: { sha: string } };
  return { sha: json.content.sha };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
  return new TextDecoder().decode(bytes);
}
