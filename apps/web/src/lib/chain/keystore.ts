const DB_NAME = "listed";
const DB_VERSION = 1;
const STORES = ["accounts", "agents"] as const;
type StoreName = (typeof STORES)[number];

export interface StoredKey {
  id: string; // accountId for `accounts`, ticker for `agents`
  publicKey: string;
  secretKey: string;
  createdAt: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error("This browser can't store keys. Use a recent Chrome, Safari, Firefox or Edge."));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(new Error("This browser blocked key storage. Turn off private browsing and try again."));
    };
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Key storage failed. Try again."));
      }),
  );
}

export const keystore = {
  async get(store: StoreName, id: string): Promise<StoredKey | null> {
    const v = await run<StoredKey | undefined>(store, "readonly", (s) => s.get(id) as IDBRequest<StoredKey | undefined>);
    return v ?? null;
  },
  async put(store: StoreName, key: Omit<StoredKey, "createdAt"> & { createdAt?: string }): Promise<void> {
    const value: StoredKey = { ...key, createdAt: key.createdAt ?? new Date().toISOString() };
    await run(store, "readwrite", (s) => s.put(value));
  },
  async remove(store: StoreName, id: string): Promise<void> {
    await run(store, "readwrite", (s) => s.delete(id));
  },
  async list(store: StoreName): Promise<StoredKey[]> {
    return run<StoredKey[]>(store, "readonly", (s) => s.getAll() as IDBRequest<StoredKey[]>);
  },
};

export const pendingKeyId = (handle: string) => `pending:${handle.toLowerCase()}`;
