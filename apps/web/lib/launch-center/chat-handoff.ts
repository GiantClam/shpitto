export type LaunchCenterChatHandoff = {
  prompt: string;
  files: File[];
  createdAt: number;
};

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const DB_NAME = "shpitto-launch-center";
const DB_VERSION = 1;
const STORE_NAME = "chat-handoffs";
const handoffs = new Map<string, LaunchCenterChatHandoff>();

type StoredLaunchCenterChatHandoff = LaunchCenterChatHandoff & {
  projectId: string;
};

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open launch handoff DB."));
  });
}

async function putPersistedHandoff(record: StoredLaunchCenterChatHandoff): Promise<void> {
  const db = await openHandoffDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to persist launch handoff."));
      tx.onabort = () => reject(tx.error || new Error("Launch handoff persistence aborted."));
    });
  } finally {
    db.close();
  }
}

async function getPersistedHandoff(projectId: string): Promise<StoredLaunchCenterChatHandoff | undefined> {
  const db = await openHandoffDb();
  try {
    return await new Promise<StoredLaunchCenterChatHandoff | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(projectId);
      request.onsuccess = () => resolve(request.result as StoredLaunchCenterChatHandoff | undefined);
      request.onerror = () => reject(request.error || new Error("Failed to read launch handoff."));
      tx.onerror = () => reject(tx.error || new Error("Failed to read launch handoff."));
    });
  } finally {
    db.close();
  }
}

async function deletePersistedHandoff(projectId: string): Promise<void> {
  const db = await openHandoffDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to delete launch handoff."));
      tx.onabort = () => reject(tx.error || new Error("Launch handoff deletion aborted."));
    });
  } finally {
    db.close();
  }
}

function normalizeHandoff(record: LaunchCenterChatHandoff | undefined): LaunchCenterChatHandoff | undefined {
  if (!record) return undefined;
  if (Date.now() - Number(record.createdAt || 0) > HANDOFF_TTL_MS) return undefined;
  const prompt = String(record.prompt || "").trim();
  if (!prompt) return undefined;
  return {
    prompt,
    files: Array.from(record.files || []).filter(Boolean),
    createdAt: Number(record.createdAt || Date.now()),
  };
}

export async function storeLaunchCenterChatHandoff(
  projectId: string,
  handoff: Omit<LaunchCenterChatHandoff, "createdAt">,
): Promise<void> {
  const normalizedProjectId = String(projectId || "").trim();
  const prompt = String(handoff.prompt || "").trim();
  if (!normalizedProjectId || !prompt) return;
  const record: StoredLaunchCenterChatHandoff = {
    projectId: normalizedProjectId,
    prompt,
    files: Array.from(handoff.files || []).filter(Boolean),
    createdAt: Date.now(),
  };
  handoffs.set(normalizedProjectId, record);
  try {
    await putPersistedHandoff(record);
  } catch {
    // In-memory handoff still covers same-session client transitions when IndexedDB is unavailable.
  }
}

export async function takeLaunchCenterChatHandoff(projectId: string): Promise<LaunchCenterChatHandoff | undefined> {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) return undefined;
  const memoryHandoff = handoffs.get(normalizedProjectId);
  handoffs.delete(normalizedProjectId);

  let persistedHandoff: StoredLaunchCenterChatHandoff | undefined;
  try {
    persistedHandoff = await getPersistedHandoff(normalizedProjectId);
  } catch {
    persistedHandoff = undefined;
  }

  try {
    await deletePersistedHandoff(normalizedProjectId);
  } catch {
    // Best-effort cleanup; stale persisted handoffs are guarded by TTL.
  }

  const normalizedMemoryHandoff = normalizeHandoff(memoryHandoff);
  if (normalizedMemoryHandoff) return normalizedMemoryHandoff;

  return normalizeHandoff(persistedHandoff);
}
