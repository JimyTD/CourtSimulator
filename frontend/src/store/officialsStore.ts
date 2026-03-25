import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { dbGetAll, dbPut, dbDelete } from '../utils/db';
import presetsJson from '../data/officials.json';

// ── 统一官员结构 ──────────────────────────────────────
export interface StoredOfficial {
  id: string;
  name: string;
  title: string;
  rank: number;        // 1-9
  personality: string; // 性格/立场描述（预设官员也有基础描述）
  isDefault: boolean;  // true = 预设官员，false = 自定义
  isChancellor: boolean;
  createdAt: number;
}

const STORE_NAME = 'custom-officials'; // 复用现有 IndexedDB store，无需升级 DB 版本
const MAX_CUSTOM = 5;

// ── 从 JSON 获取所有预设官员（用于初始化和恢复） ──────
function getPresetOfficials(): StoredOfficial[] {
  const raw = presetsJson.officials as Record<string, any>;
  return Object.entries(raw).map(([id, o]) => ({
    id,
    name: o.name,
    title: o.title,
    rank: o.rank,
    personality: '', // 预设官员 personality 在后端 prompt_builder 里
    isDefault: true,
    isChancellor: o.isChancellor ?? false,
    createdAt: 0,    // 预设官员排在前面
  }));
}

// ── Zustand Store ──────────────────────────────────────

interface OfficialsState {
  officials: StoredOfficial[];
  loaded: boolean;

  /** 从 IndexedDB 加载，首次为空时自动写入预设 */
  loadOfficials: () => Promise<void>;

  /** 添加自定义官员 */
  addCustomOfficial: (
    data: Pick<StoredOfficial, 'name' | 'title' | 'rank' | 'personality'>
  ) => Promise<void>;

  /** 撤职（预设和自定义统一删除） */
  removeOfficial: (id: string) => Promise<void>;

  /** 恢复预设：把 JSON 中有但列表里没有的预设官员补回来 */
  restorePresets: () => Promise<void>;

  /** 自定义官员数量 */
  customCount: () => number;
}

export const useOfficialsStore = create<OfficialsState>((set, get) => ({
  officials: [],
  loaded: false,

  loadOfficials: async () => {
    let list = await dbGetAll<StoredOfficial>(STORE_NAME);

    // 首次使用：IndexedDB 为空，写入所有预设
    if (list.length === 0) {
      const presets = getPresetOfficials();
      for (const p of presets) {
        await dbPut<StoredOfficial>(STORE_NAME, p);
      }
      list = presets;
    }

    // 排序：预设（createdAt=0）在前，自定义按创建时间升序
    list.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.createdAt - b.createdAt;
    });

    set({ officials: list, loaded: true });
  },

  addCustomOfficial: async (data) => {
    const { officials } = get();
    const customCount = officials.filter((o) => !o.isDefault).length;
    if (customCount >= MAX_CUSTOM) {
      throw new Error(`自定义官员已达上限（${MAX_CUSTOM}）`);
    }
    const official: StoredOfficial = {
      ...data,
      id: 'custom_' + nanoid(8),
      isDefault: false,
      isChancellor: false,
      createdAt: Date.now(),
    };
    await dbPut<StoredOfficial>(STORE_NAME, official);
    set((state) => ({
      officials: [...state.officials, official],
    }));
  },

  removeOfficial: async (id) => {
    await dbDelete(STORE_NAME, id);
    set((state) => ({
      officials: state.officials.filter((o) => o.id !== id),
    }));
  },

  restorePresets: async () => {
    const { officials } = get();
    const existingIds = new Set(officials.map((o) => o.id));
    const presets = getPresetOfficials();
    const missing = presets.filter((p) => !existingIds.has(p.id));

    for (const p of missing) {
      await dbPut<StoredOfficial>(STORE_NAME, p);
    }

    if (missing.length > 0) {
      set((state) => {
        const merged = [...missing, ...state.officials];
        // 重新排序
        merged.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.createdAt - b.createdAt;
        });
        return { officials: merged };
      });
    }
  },

  customCount: () => {
    return get().officials.filter((o) => !o.isDefault).length;
  },
}));

// ── 向后兼容：保持旧 store 名让现有 import 不报错 ──
// 如果有其他文件还引用 useCustomOfficialsStore，可以在迁移完成后删除
