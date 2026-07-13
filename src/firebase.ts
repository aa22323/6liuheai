/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, query, orderBy } from "firebase/firestore";
import { HistoryRecord, DEFAULT_SETTINGS } from "./utils/lotteryEngine";

import firebaseConfig from "../firebase-applet-config.json";

export { firebaseConfig };

// Initialize Firebase App
const firebaseApp = initializeApp(firebaseConfig);

// Initialize Firestore with correct database ID
export const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// CSV standard seed data (142 records) to bootstrap Firestore on first load if it's empty
const HISTORY_SEED_DATA: Omit<HistoryRecord, "id">[] = [
  { period: 51, number: 1, zodiac: "马" },
  { period: 52, number: 38, zodiac: "蛇" },
  { period: 53, number: 15, zodiac: "龙" },
  { period: 54, number: 48, zodiac: "羊" },
  { period: 55, number: 14, zodiac: "蛇" },
  { period: 56, number: 48, zodiac: "羊" },
  { period: 57, number: 23, zodiac: "猴" },
  { period: 58, number: 31, zodiac: "鼠" },
  { period: 59, number: 10, zodiac: "鸡" },
  { period: 60, number: 9, zodiac: "狗" },
  { period: 61, number: 29, zodiac: "虎" },
  { period: 62, number: 24, zodiac: "羊" },
  { period: 63, number: 28, zodiac: "兔" },
  { period: 64, number: 18, zodiac: "牛" },
  { period: 65, number: 5, zodiac: "虎" },
  { period: 66, number: 37, zodiac: "马" },
  { period: 67, number: 5, zodiac: "虎" },
  { period: 68, number: 23, zodiac: "猴" },
  { period: 69, number: 24, zodiac: "羊" },
  { period: 70, number: 25, zodiac: "马" },
  { period: 71, number: 48, zodiac: "羊" },
  { period: 72, number: 46, zodiac: "鸡" },
  { period: 73, number: 34, zodiac: "鸡" },
  { period: 74, number: 10, zodiac: "鸡" },
  { period: 75, number: 33, zodiac: "狗" },
  { period: 76, number: 2, zodiac: "蛇" },
  { period: 77, number: 29, zodiac: "虎" },
  { period: 78, number: 46, zodiac: "鸡" },
  { period: 79, number: 35, zodiac: "猴" },
  { period: 80, number: 3, zodiac: "龙" },
  { period: 81, number: 17, zodiac: "虎" },
  { period: 82, number: 27, zodiac: "龙" },
  { period: 83, number: 5, zodiac: "虎" },
  { period: 84, number: 16, zodiac: "兔" },
  { period: 85, number: 19, zodiac: "鼠" },
  { period: 86, number: 12, zodiac: "羊" },
  { period: 87, number: 26, zodiac: "蛇" },
  { period: 88, number: 27, zodiac: "龙" },
  { period: 89, number: 49, zodiac: "马" },
  { period: 90, number: 36, zodiac: "羊" },
  { period: 91, number: 37, zodiac: "马" },
  { period: 92, number: 6, zodiac: "牛" },
  { period: 93, number: 40, zodiac: "兔" },
  { period: 94, number: 17, zodiac: "虎" },
  { period: 95, number: 35, zodiac: "猴" },
  { period: 96, number: 43, zodiac: "鼠" },
  { period: 97, number: 11, zodiac: "猴" },
  { period: 98, number: 17, zodiac: "虎" },
  { period: 99, number: 12, zodiac: "羊" },
  { period: 100, number: 33, zodiac: "狗" },
  { period: 101, number: 39, zodiac: "龙" },
  { period: 102, number: 20, zodiac: "猪" },
  { period: 103, number: 6, zodiac: "牛" },
  { period: 104, number: 1, zodiac: "马" },
  { period: 105, number: 28, zodiac: "兔" },
  { period: 106, number: 22, zodiac: "鸡" },
  { period: 107, number: 49, zodiac: "马" },
  { period: 108, number: 45, zodiac: "狗" },
  { period: 109, number: 16, zodiac: "兔" },
  { period: 110, number: 30, zodiac: "牛" },
  { period: 111, number: 1, zodiac: "马" },
  { period: 112, number: 9, zodiac: "狗" },
  { period: 113, number: 2, zodiac: "蛇" },
  { period: 114, number: 30, zodiac: "牛" },
  { period: 115, number: 4, zodiac: "兔" },
  { period: 116, number: 22, zodiac: "鸡" },
  { period: 117, number: 16, zodiac: "兔" },
  { period: 118, number: 8, zodiac: "猪" },
  { period: 119, number: 11, zodiac: "猴" },
  { period: 120, number: 6, zodiac: "牛" },
  { period: 121, number: 44, zodiac: "猪" },
  { period: 122, number: 1, zodiac: "马" },
  { period: 123, number: 46, zodiac: "鸡" },
  { period: 124, number: 39, zodiac: "龙" },
  { period: 125, number: 31, zodiac: "鼠" },
  { period: 126, number: 49, zodiac: "马" },
  { period: 127, number: 45, zodiac: "狗" },
  { period: 128, number: 37, zodiac: "马" },
  { period: 129, number: 41, zodiac: "虎" },
  { period: 130, number: 29, zodiac: "虎" },
  { period: 131, number: 7, zodiac: "鼠" },
  { period: 132, number: 30, zodiac: "牛" },
  { period: 133, number: 7, zodiac: "鼠" },
  { period: 134, number: 37, zodiac: "马" },
  { period: 135, number: 30, zodiac: "牛" },
  { period: 136, number: 48, zodiac: "羊" },
  { period: 137, number: 26, zodiac: "蛇" },
  { period: 138, number: 49, zodiac: "马" },
  { period: 139, number: 24, zodiac: "羊" },
  { period: 140, number: 16, zodiac: "兔" },
  { period: 141, number: 33, zodiac: "狗" },
  { period: 142, number: 23, zodiac: "猴" },
  { period: 143, number: 44, zodiac: "猪" },
  { period: 144, number: 43, zodiac: "鼠" },
  { period: 145, number: 5, zodiac: "虎" },
  { period: 146, number: 42, zodiac: "羊" },
  { period: 147, number: 13, zodiac: "马" },
  { period: 148, number: 48, zodiac: "羊" },
  { period: 149, number: 27, zodiac: "龙" },
  { period: 150, number: 9, zodiac: "狗" },
  { period: 151, number: 31, zodiac: "鼠" },
  { period: 152, number: 45, zodiac: "狗" },
  { period: 153, number: 41, zodiac: "虎" },
  { period: 154, number: 41, zodiac: "虎" },
  { period: 155, number: 7, zodiac: "鼠" },
  { period: 156, number: 1, zodiac: "马" },
  { period: 157, number: 40, zodiac: "兔" },
  { period: 158, number: 16, zodiac: "兔" },
  { period: 159, number: 39, zodiac: "龙" },
  { period: 160, number: 2, zodiac: "蛇" },
  { period: 161, number: 8, zodiac: "猪" },
  { period: 162, number: 32, zodiac: "狗" },
  { period: 163, number: 37, zodiac: "马" },
  { period: 164, number: 21, zodiac: "鸡" },
  { period: 165, number: 3, zodiac: "龙" },
  { period: 166, number: 6, zodiac: "牛" },
  { period: 167, number: 19, zodiac: "鼠" },
  { period: 168, number: 15, zodiac: "龙" },
  { period: 169, number: 24, zodiac: "羊" },
  { period: 170, number: 3, zodiac: "龙" },
  { period: 171, number: 28, zodiac: "兔" },
  { period: 172, number: 44, zodiac: "猪" },
  { period: 173, number: 26, zodiac: "蛇" },
  { period: 174, number: 41, zodiac: "虎" },
  { period: 175, number: 26, zodiac: "蛇" },
  { period: 176, number: 10, zodiac: "鸡" },
  { period: 177, number: 14, zodiac: "蛇" },
  { period: 178, number: 18, zodiac: "牛" },
  { period: 179, number: 15, zodiac: "龙" },
  { period: 180, number: 21, zodiac: "鸡" },
  { period: 181, number: 19, zodiac: "鼠" },
  { period: 182, number: 41, zodiac: "虎" },
  { period: 183, number: 24, zodiac: "羊" },
  { period: 184, number: 1, zodiac: "马" },
  { period: 185, number: 36, zodiac: "羊" },
  { period: 186, number: 23, zodiac: "猴" },
  { period: 187, number: 1, zodiac: "马" },
  { period: 188, number: 16, zodiac: "兔" },
  { period: 189, number: 15, zodiac: "龙" },
  { period: 190, number: 16, zodiac: "兔" },
  { period: 191, number: 29, zodiac: "虎" },
  { period: 192, number: 25, zodiac: "马" }
];

/**
 * Fetch all history records from Firestore.
 * If Firestore is empty, auto-seed with historical data and upload to Firestore.
 */
export async function getHistoryRecords(): Promise<HistoryRecord[]> {
  try {
    const collRef = collection(db, "history");
    const q = query(collRef, orderBy("period", "asc"));
    const snapshot = await getDocs(q);
    
    const records: HistoryRecord[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      records.push({
        period: Number(data.period),
        number: Number(data.number),
        zodiac: String(data.zodiac)
      });
    });

    if (records.length > 0) {
      console.log(`[Firebase client] Loaded ${records.length} records from Firestore.`);
      return records;
    }

    // Seed Firestore if empty
    console.log("[Firebase client] Firestore collection empty. Seeding with 142 records...");
    const batch = writeBatch(db);
    HISTORY_SEED_DATA.forEach(r => {
      const docRef = doc(db, "history", String(r.period));
      batch.set(docRef, {
        period: r.period,
        number: r.number,
        zodiac: r.zodiac,
        createdAt: new Date().toISOString()
      });
    });
    await batch.commit();

    console.log("[Firebase client] Successfully seeded Firestore.");
    return HISTORY_SEED_DATA.map((r, index) => ({
      ...r
    }));
  } catch (error: any) {
    console.error("[Firebase client Error] Failed to fetch history records:", error.message);
    // Fallback to local seeds
    return HISTORY_SEED_DATA.map(r => ({ ...r }));
  }
}

/**
 * Add a new lottery record to Firestore.
 */
export async function addHistoryRecord(period: number, num: number, zodiac: string): Promise<void> {
  const docRef = doc(db, "history", String(period));
  await setDoc(docRef, {
    period,
    number: num,
    zodiac,
    createdAt: new Date().toISOString()
  });
}

/**
 * Delete a lottery record from Firestore.
 */
export async function deleteHistoryRecord(period: number): Promise<void> {
  const docRef = doc(db, "history", String(period));
  await deleteDoc(docRef);
}

/**
 * Get active strategy configuration from Firestore.
 * Defaults to DEFAULT_SETTINGS if empty.
 */
export async function getStrategyConfig(): Promise<any> {
  try {
    const docRef = doc(db, "config", "current");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    // Write default if missing
    await setDoc(docRef, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (e) {
    console.warn("[Firebase client] Failed to read strategy config, falling back to default.", e);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save strategy configuration to Firestore.
 */
export async function saveStrategyConfig(config: any): Promise<void> {
  const docRef = doc(db, "config", "current");
  await setDoc(docRef, config);
}

/**
 * Get saved Gemini AI report from Firestore.
 */
export async function getSavedAiReport(period: number): Promise<string | null> {
  try {
    const docRef = doc(db, "reports", `prediction_ai_${period}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data().report || null;
    }
    return null;
  } catch (e) {
    console.warn("[Firebase client] Failed to load saved AI report:", e);
    return null;
  }
}

/**
 * Save Gemini AI report to Firestore.
 */
export async function saveAiReport(period: number, report: string): Promise<void> {
  try {
    const docRef = doc(db, "reports", `prediction_ai_${period}`);
    await setDoc(docRef, {
      period,
      report,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error("[Firebase client] Failed to save AI report:", e);
  }
}
