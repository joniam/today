import { ulid } from 'ulid';
import type { Bucket, Item } from '../types';
import { BUCKET_ORDER } from '../state';

const HEADER_REGEX = /^## (Today|Soon|Later)\s*$/;
const ITEM_REGEX = /^- \[([ xX])\] (.*)$/;

const HEADER_TO_BUCKET: Record<string, Bucket> = {
  Today: 'today',
  Soon: 'soon',
  Later: 'later',
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Parse markdown to items. Existing items are passed so IDs can be preserved
 * by matching on (bucket, normalized_text, done).
 */
export function parseMarkdown(markdown: string, existing: Item[] = []): Item[] {
  const lines = markdown.split('\n');
  let currentBucket: Bucket | null = null;
  const orderCounters: Record<Bucket, number> = { today: 1, soon: 1, later: 1 };
  const parsed: Item[] = [];

  // Build a lookup of existing items for ID preservation.
  const existingMap = new Map<string, Item>();
  for (const item of existing) {
    existingMap.set(`${item.bucket}:${normalize(item.text)}:${item.done}`, item);
  }
  const usedIds = new Set<string>();

  for (const line of lines) {
    const headerMatch = HEADER_REGEX.exec(line);
    if (headerMatch) {
      currentBucket = HEADER_TO_BUCKET[headerMatch[1]!] ?? null;
      continue;
    }
    if (!currentBucket) continue;

    const itemMatch = ITEM_REGEX.exec(line);
    if (!itemMatch) continue;

    const done = itemMatch[1] !== ' ';
    const text = itemMatch[2]!;
    const bucket = currentBucket;
    const order = orderCounters[bucket]++;

    const key = `${bucket}:${normalize(text)}:${done}`;
    const existing_item = existingMap.get(key);
    let id: string;
    if (existing_item && !usedIds.has(existing_item.id)) {
      id = existing_item.id;
      usedIds.add(id);
    } else {
      id = ulid();
    }

    parsed.push({ id, text, done, bucket, order });
  }

  return parsed;
}

export function serializeMarkdown(items: Item[]): string {
  const sections: string[] = [];

  for (const bucket of BUCKET_ORDER) {
    const bucketItems = items
      .filter((i) => i.bucket === bucket)
      .sort((a, b) => a.order - b.order);

    const label = bucket.charAt(0).toUpperCase() + bucket.slice(1);
    const lines = [`## ${label}`];
    for (const item of bucketItems) {
      lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n') + '\n';
}
