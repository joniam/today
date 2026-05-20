import { ulid } from 'ulid';
import type { Bucket, Item } from '../types';
import { BUCKET_ORDER } from '../state';

const HEADER_REGEX = /^## (Today|Soon|Later|Done)\s*$/;
const ITEM_REGEX = /^- \[([ xX])\] (.*)$/;
// Indented note line: one or more tabs (Obsidian) or 2+ spaces, followed by "- ".
// We strip the indent and bullet marker; notes are stored as plain text lines.
const NOTE_LINE_REGEX = /^(\t+| {2,})- (.*)$/;

const HEADER_TO_BUCKET: Record<string, Bucket | 'done'> = {
  Today: 'today',
  Soon: 'soon',
  Later: 'later',
  Done: 'done',
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export interface ParseResult {
  items: Item[];
  tail: string; // everything after the last structural line, preserved verbatim
}

/**
 * Parse markdown to items + tail. Existing items are passed so IDs can be preserved
 * by matching on (bucket, normalized_text, done).
 */
export function parseMarkdown(markdown: string, existing: Item[] = []): ParseResult {
  const lines = markdown.split('\n');
  let currentSection: Bucket | 'done' | null = null;
  const orderCounters: Record<Bucket, number> = { today: 1, soon: 1, later: 1 };
  let doneOrderCounter = 1;
  const parsed: Item[] = [];
  let lastStructuralIdx = -1;

  // Build a lookup of existing items for ID preservation.
  const existingMap = new Map<string, Item>();
  for (const item of existing) {
    existingMap.set(`${item.bucket}:${normalize(item.text)}:${item.done}`, item);
  }
  const usedIds = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    const headerMatch = HEADER_REGEX.exec(line);
    if (headerMatch) {
      currentSection = HEADER_TO_BUCKET[headerMatch[1]!] ?? null;
      lastStructuralIdx = i;
      i++;
      continue;
    }

    if (!currentSection) {
      i++;
      continue;
    }

    const itemMatch = ITEM_REGEX.exec(line);
    if (!itemMatch) {
      i++;
      continue;
    }

    const text = itemMatch[2]!;
    lastStructuralIdx = i;

    let bucket: Bucket;
    let done: boolean;
    let order: number;

    if (currentSection === 'done') {
      bucket = 'today';
      done = true;
      order = doneOrderCounter++;
    } else {
      bucket = currentSection;
      done = itemMatch[1] !== ' ';
      order = orderCounters[bucket]++;
    }

    // Collect indented note lines immediately following this task line.
    const noteLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j]!;
      // Stop at headers or task lines.
      if (HEADER_REGEX.test(nextLine) || ITEM_REGEX.test(nextLine)) break;
      const noteMatch = NOTE_LINE_REGEX.exec(nextLine);
      if (!noteMatch) {
        // Allow blank lines between note blocks to be skipped.
        if (nextLine.trim() === '') {
          j++;
          continue;
        }
        break;
      }
      // Group 2 is the plain text after the bullet marker.
      noteLines.push(noteMatch[2]!);
      lastStructuralIdx = j;
      j++;
    }
    i = j;

    const key = `${bucket}:${normalize(text)}:${done}`;
    const existing_item = existingMap.get(key);
    let id: string;
    if (existing_item && !usedIds.has(existing_item.id)) {
      id = existing_item.id;
      usedIds.add(id);
    } else {
      id = ulid();
    }

    const notes = noteLines.length > 0 ? noteLines.join('\n') : undefined;
    parsed.push({ id, text, done, bucket, order, notes });
  }

  // Everything after the last structural line is the tail (freeform scratchpad).
  const tailLines = lines.slice(lastStructuralIdx + 1);
  // Trim leading blank lines so a single trailing newline after the last task
  // doesn't produce a non-empty tail.
  while (tailLines.length > 0 && tailLines[0]!.trim() === '') tailLines.shift();
  const tail = tailLines.join('\n');

  return { items: parsed, tail };
}

export function serializeMarkdown(items: Item[], tail = ''): string {
  const sections: string[] = [];

  for (const bucket of BUCKET_ORDER) {
    const bucketItems = items
      .filter((i) => i.bucket === bucket && !i.done && i.text !== '')
      .sort((a, b) => a.order - b.order);

    const label = bucket.charAt(0).toUpperCase() + bucket.slice(1);
    const lines = [`## ${label}`];
    for (const item of bucketItems) {
      lines.push(`- [ ] ${item.text}`);
      if (item.notes) {
        for (const noteLine of item.notes.split('\n')) {
          lines.push(`\t- ${noteLine}`);
        }
      }
    }
    sections.push(lines.join('\n'));
  }

  const doneItems = items.filter((i) => i.done).sort((a, b) => a.order - b.order);
  if (doneItems.length > 0) {
    const lines = ['## Done'];
    for (const item of doneItems) {
      lines.push(`- [x] ${item.text}`);
      if (item.notes) {
        for (const noteLine of item.notes.split('\n')) {
          lines.push(`\t- ${noteLine}`);
        }
      }
    }
    sections.push(lines.join('\n'));
  }

  let result = sections.join('\n\n') + '\n';
  if (tail) result += '\n' + tail + (tail.endsWith('\n') ? '' : '\n');
  return result;
}
