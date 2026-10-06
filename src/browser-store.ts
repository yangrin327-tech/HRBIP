import type { Workspace, Design } from "../shared/model";
import type { ReusePlan } from "../shared/reuse";
import type { RawSheet, Original } from "./files";
import type { GuestFormat } from "./guest";

export type BrowserWork = {
  id: string;
  workspace: Workspace;
  route: string;
  sheets: RawSheet[];
  originals: Original[];
  reusePlan: ReusePlan | null;
  updated: string;
  revision: number;
};
export type BrowserTemplate = { id: string; title: string; design: Design };
let database: Promise<IDBDatabase> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const revisions = new Map<string, number>();
const transactionErrors = new WeakMap<IDBTransaction, Error>();
function db() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("hrbip-browser-workspace", 1);
      request.onupgradeneeded = () => {
        for (const name of ["works", "templates", "settings"])
          request.result.createObjectStore(name);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
      request.onblocked = () =>
        reject(new Error("다른 HRBIP 탭을 닫고 저장을 다시 시도하세요."));
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
function failure(error: unknown) {
  return new Error(
    "브라우저 저장에 실패했어요. 저장 공간과 브라우저 설정을 확인하고 ‘저장’을 다시 눌러주세요. " +
      (error instanceof Error ? error.message : String(error)),
  );
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  try {
    const database = await db();
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          transactionErrors.get(tx) ||
            tx.error ||
            new Error("저장이 중단됐어요."),
        );
      action(tx, (next) => {
        value = next;
      });
    });
  } catch (error) {
    throw failure(error);
  }
}
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const pending = queue.then(action);
  queue = pending.catch(() => {});
  return pending;
}
export const flushBrowserWrites = async () => {
  await queue;
};
export async function readBrowserWork(id: string) {
  await flushBrowserWrites();
  const work = await transaction<BrowserWork | undefined>(
    ["works"],
    "readonly",
    (tx, done) => {
      const request = tx.objectStore("works").get(id);
      request.onsuccess = () => done(request.result);
    },
  );
  if (
    !work ||
    work.workspace?.version !== 1 ||
    !Array.isArray(work.workspace.datasets)
  )
    throw new Error(
      "저장한 작업을 읽을 수 없어요. 다른 저장 작업을 선택하세요.",
    );
  revisions.set(id, work.revision);
  return work;
}
export function writeBrowserWork(
  work: Omit<BrowserWork, "updated" | "revision">,
) {
  const snapshot = structuredClone(work);
  return serialize(async () => {
    const saved = await transaction<BrowserWork>(
      ["works", "settings"],
      "readwrite",
      (tx, done) => {
        const store = tx.objectStore("works");
        const request = store.get(snapshot.id);
        request.onsuccess = () => {
          if (
            (request.result?.revision || 0) !==
            (revisions.get(snapshot.id) || 0)
          ) {
            transactionErrors.set(
              tx,
              new Error(
                "다른 탭에서 이 작업을 변경했어요. 현재 문장을 복사해 두고 ‘저장한 작업’에서 최신 작업을 다시 열거나, ‘사본 저장’으로 현재 편집을 보관하세요.",
              ),
            );
            tx.abort();
            return;
          }
          const next = {
            ...snapshot,
            updated: new Date().toISOString(),
            revision: (request.result?.revision || 0) + 1,
          };
          store.put(next, next.id);
          tx.objectStore("settings").put(next.id, "activeWork");
          done(next);
        };
      },
    );
    revisions.set(saved.id, saved.revision);
    return saved;
  });
}
export async function listBrowserWorks() {
  await flushBrowserWrites();
  return transaction<BrowserWork[]>(["works"], "readonly", (tx, done) => {
    const request = tx.objectStore("works").getAll();
    request.onsuccess = () =>
      done(
        request.result.sort((a: BrowserWork, b: BrowserWork) =>
          b.updated.localeCompare(a.updated),
        ),
      );
  });
}
export async function readBrowserSettings() {
  return transaction<{ activeWork?: string; formats: GuestFormat[] }>(
    ["settings"],
    "readonly",
    (tx, done) => {
      const settings = {
        activeWork: undefined as string | undefined,
        formats: [] as GuestFormat[],
      };
      const store = tx.objectStore("settings");
      const active = store.get("activeWork");
      active.onsuccess = () => {
        settings.activeWork = active.result;
        done(settings);
      };
      const formats = store.get("formats");
      formats.onsuccess = () => {
        settings.formats = formats.result || [];
        done(settings);
      };
    },
  );
}
export function writeBrowserFormats(formats: GuestFormat[]) {
  const snapshot = structuredClone(formats);
  return serialize(() =>
    transaction<void>(["settings", "works"], "readwrite", (tx, done) => {
      const request = tx.objectStore("works").getAll();
      request.onsuccess = () => {
        const ids = new Set(snapshot.map((f) => f.meta.id));
        if (
          request.result.some((w: BrowserWork) =>
            Object.values(w.workspace.companyFormats || {}).some(
              (id) => id && !ids.has(id),
            ),
          )
        ) {
          transactionErrors.set(
            tx,
            new Error(
              "저장한 작업이 이 양식을 사용 중이에요. 해당 작업에서 양식을 해제하고 저장한 뒤 삭제하세요.",
            ),
          );
          tx.abort();
          return;
        }
        tx.objectStore("settings").put(snapshot, "formats");
        done(undefined);
      };
    }),
  );
}
export function deleteBrowserWork(id: string) {
  return serialize(() =>
    transaction<void>(["works", "settings"], "readwrite", (tx, done) => {
      tx.objectStore("works").delete(id);
      const request = tx.objectStore("settings").get("activeWork");
      request.onsuccess = () => {
        if (request.result === id)
          tx.objectStore("settings").delete("activeWork");
        done(undefined);
      };
    }),
  );
}
export async function listBrowserTemplates() {
  await flushBrowserWrites();
  return transaction<BrowserTemplate[]>(
    ["templates"],
    "readonly",
    (tx, done) => {
      const request = tx.objectStore("templates").getAll();
      request.onsuccess = () => done(request.result);
    },
  );
}
export function writeBrowserTemplate(template: BrowserTemplate) {
  const snapshot = structuredClone(template);
  return serialize(() =>
    transaction<void>(["templates"], "readwrite", (tx, done) => {
      tx.objectStore("templates").put(snapshot, snapshot.id);
      done(undefined);
    }),
  );
}
export function deleteBrowserTemplate(id: string) {
  return serialize(() =>
    transaction<void>(["templates"], "readwrite", (tx, done) => {
      tx.objectStore("templates").delete(id);
      done(undefined);
    }),
  );
}
