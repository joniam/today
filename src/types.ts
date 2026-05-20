export type Bucket = 'today' | 'soon' | 'later';

export interface Item {
  id: string;
  text: string;
  done: boolean;
  bucket: Bucket;
  order: number;
  notes?: string;
}

export interface DataRepo {
  owner: string;
  repo: string;
  path: string;
}

export interface AppState {
  items: Item[];
  baseItems: Item[];   // items at lastSyncedSha, used as merge base
  tail: string;        // unstructured content after the task sections, preserved verbatim
  lastSyncedSha: string | null;
  lastSyncedAt: number | null;
  pendingChanges: boolean;
  authToken: string | null;
  dataRepo: DataRepo;
}
