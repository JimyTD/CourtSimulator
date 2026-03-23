import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { dbGetAll, dbPut, dbDelete } from '../utils/db';

// ── 自定义官员结构 ──────────────────────────────────────
export interface CustomOfficial {
  id: string;          // 'custom_' + nanoid(8)
  name: string;
  title: string;
  rank: number;        // 1-9
  personality: string; // 性格/立场描述，用于生成 prompt
  isDefault: false;
  isChancellor: false;
  createdAt: number;
}

const STORE_NAME = 'custom-officials';
const MAX_OFFICIALS = 5;

// ── Zustand Store ──────────────────────────────────────

interface CustomOfficialsState {
  customOfficials: CustomOfficial[];
  loadCustomOfficials: () => Promise<void>;
  addCustomOfficial: (
    data: Omit<CustomOfficial, 'id' | 'isDefault' | 'isChancellor' | 'createdAt'>
  ) => Promise<void>;
  removeCustomOfficial: (id: string) => Promise<void>;
}

export const useCustomOfficialsStore = create<CustomOfficialsState>((set, get) => ({
  customOfficials: [],

  loadCustomOfficials: async () => {
    const officials = await dbGetAll<CustomOfficial>(STORE_NAME);
    // 按创建时间正序排列
    officials.sort((a, b) => a.createdAt - b.createdAt);
    set({ customOfficials: officials });
  },

  addCustomOfficial: async (data) => {
    const { customOfficials } = get();
    if (customOfficials.length >= MAX_OFFICIALS) {
      throw new Error(`自定义官员已达上限（${MAX_OFFICIALS}）`);
    }
    const official: CustomOfficial = {
      ...data,
      id: 'custom_' + nanoid(8),
      isDefault: false,
      isChancellor: false,
      createdAt: Date.now(),
    };
    await dbPut<CustomOfficial>(STORE_NAME, official);
    set((state) => ({
      customOfficials: [...state.customOfficials, official],
    }));
  },

  removeCustomOfficial: async (id) => {
    await dbDelete(STORE_NAME, id);
    set((state) => ({
      customOfficials: state.customOfficials.filter((o) => o.id !== id),
    }));
  },
}));
