import { DBSchema, IDBPDatabase, openDB } from "idb";
import {
  Account,
  Category,
  CategoryRule,
  ImportBatch,
  NormalizationRule,
  Transaction,
} from "./types";

interface NolioDBSchema extends DBSchema {
  accounts: { key: string; value: Account };
  categories: { key: string; value: Category };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { by_date: string; by_account: string; by_category: string };
  };
  normalizationRules: { key: string; value: NormalizationRule };
  categoryRules: { key: string; value: CategoryRule };
  importBatches: { key: string; value: ImportBatch };
  meta: { key: string; value: { key: string; value: string } };
}

const DB_NAME = "nolio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NolioDBSchema>> | null = null;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function getDb(): Promise<IDBPDatabase<NolioDBSchema>> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<NolioDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("accounts")) {
          db.createObjectStore("accounts", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transactions")) {
          const store = db.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("by_date", "date");
          store.createIndex("by_account", "account_id");
          store.createIndex("by_category", "category_id");
        }
        if (!db.objectStoreNames.contains("normalizationRules")) {
          db.createObjectStore("normalizationRules", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("categoryRules")) {
          db.createObjectStore("categoryRules", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("importBatches")) {
          db.createObjectStore("importBatches", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export type { NolioDBSchema };
