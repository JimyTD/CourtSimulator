import { create } from 'zustand';
import { dbGetAll, dbPut, dbDelete } from '../utils/db';

const STORE_NAME = 'debate-history';
const MAX_RECORDS = 50;

export interface DebateRecord {
  id: string; // debate_id
  topic: string;
  createdAt: number; // Date.now()
  rounds: number;
  officials: string[]; // 参与官员职位列表（title）
  speeches: {
    round: number;
    officialId: string;
    officialTitle: string; // 职位
    content: string;
  }[];
  chancellorSummary: string | null;
}

interface HistoryStore {
  records: DebateRecord[]; // 按 createdAt 倒序

  /** 从 IndexedDB 加载全部历史 */
  loadHistory: () => Promise<void>;

  /** 保存一条记录（超出 50 条时删除最旧的） */
  saveRecord: (record: DebateRecord) => Promise<void>;

  /** 删除单条记录 */
  removeRecord: (id: string) => Promise<void>;

  /** 清空全部历史 */
  clearHistory: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  records: [],

  loadHistory: async () => {
    const all = await dbGetAll<DebateRecord>(STORE_NAME);
    // 按 createdAt 倒序排列
    all.sort((a, b) => b.createdAt - a.createdAt);
    set({ records: all });
  },

  saveRecord: async (record) => {
    // 先写入 IndexedDB
    await dbPut<DebateRecord>(STORE_NAME, record);

    // 加载最新列表，检查是否超上限
    const all = await dbGetAll<DebateRecord>(STORE_NAME);
    all.sort((a, b) => b.createdAt - a.createdAt);

    if (all.length > MAX_RECORDS) {
      // 删除超出部分（最旧的）
      const toDelete = all.slice(MAX_RECORDS);
      for (const old of toDelete) {
        await dbDelete(STORE_NAME, old.id);
      }
      set({ records: all.slice(0, MAX_RECORDS) });
    } else {
      set({ records: all });
    }
  },

  removeRecord: async (id) => {
    await dbDelete(STORE_NAME, id);
    set((state) => ({
      records: state.records.filter((r) => r.id !== id),
    }));
  },

  clearHistory: async () => {
    const { records } = get();
    // 逐条删除
    for (const r of records) {
      await dbDelete(STORE_NAME, r.id);
    }
    set({ records: [] });
  },
}));
