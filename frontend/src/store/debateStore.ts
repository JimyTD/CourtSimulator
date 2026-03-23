import { create } from 'zustand';
import type { DebateState, OfficialId, OfficialState, Official } from '../types';

interface DebateStore extends DebateState {
  // Actions
  startDebate: (debateId: string, topic: string, totalRounds: number, officials: OfficialState[]) => void;
  setOfficialThinking: (officialId: OfficialId) => void;
  setOfficialSpeech: (officialId: OfficialId, round: number, content: string) => void;
  setOfficialSilent: (officialId: OfficialId) => void;
  setRound: (round: number) => void;
  setChancellorSummary: (summary: string) => void;
  completeDebate: () => void;
  resetDebate: () => void;
  initOfficials: (officials: Official[]) => void;
}

const initialState: DebateState = {
  debateId: null,
  topic: '',
  status: 'idle',
  currentRound: 0,
  totalRounds: 2,
  officials: {},
  chancellorSummary: null,
};

export const useDebateStore = create<DebateStore>((set) => ({
  ...initialState,

  startDebate: (debateId, topic, totalRounds, officialStates) => {
    const officialsMap: Record<OfficialId, OfficialState> = {};
    officialStates.forEach((os) => {
      officialsMap[os.official.id] = os;
    });
    set({
      debateId,
      topic,
      totalRounds,
      status: 'running',
      currentRound: 1,
      officials: officialsMap,
      chancellorSummary: null,
    });
  },

  initOfficials: (officials) => {
    const officialsMap: Record<OfficialId, OfficialState> = {};
    officials.forEach((o) => {
      officialsMap[o.id] = {
        official: o,
        status: 'waiting',
        speeches: [],
      };
    });
    set({ officials: officialsMap });
  },

  setOfficialThinking: (officialId) => {
    set((state) => ({
      officials: {
        ...state.officials,
        [officialId]: {
          ...state.officials[officialId],
          status: 'thinking',
        },
      },
    }));
  },

  setOfficialSpeech: (officialId, round, content) => {
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;
      return {
        officials: {
          ...state.officials,
          [officialId]: {
            ...prev,
            status: 'speaking',
            speeches: [...prev.speeches, { round, content }],
          },
        },
      };
    });
  },

  setOfficialSilent: (officialId) => {
    set((state) => ({
      officials: {
        ...state.officials,
        [officialId]: {
          ...state.officials[officialId],
          status: 'silent',
        },
      },
    }));
  },

  setRound: (round) => {
    // 每轮开始，重置所有官员状态为 waiting（非 silent）
    set((state) => {
      const updated: Record<OfficialId, OfficialState> = {};
      Object.entries(state.officials).forEach(([id, os]) => {
        updated[id] = { ...os, status: 'waiting' };
      });
      return { currentRound: round, officials: updated };
    });
  },

  setChancellorSummary: (summary) => {
    set({ chancellorSummary: summary });
  },

  completeDebate: () => {
    // 将所有 speaking 状态标记为 done
    set((state) => {
      const updated: Record<OfficialId, OfficialState> = {};
      Object.entries(state.officials).forEach(([id, os]) => {
        updated[id] = {
          ...os,
          status: os.status === 'speaking' ? 'done' : os.status,
        };
      });
      return { status: 'complete', officials: updated };
    });
  },

  resetDebate: () => {
    set(initialState);
  },
}));
