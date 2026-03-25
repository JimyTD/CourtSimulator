import { create } from 'zustand';
import type { DebateState, OfficialId, OfficialState, Official, TimelineMessage } from '../types';

// 生成唯一 timeline 消息 ID
let _tlSeq = 0;
function tlId(): string {
  return `tl-${Date.now()}-${++_tlSeq}`;
}

interface DebateStore extends DebateState {
  // Actions
  startDebate: (debateId: string, topic: string, totalRounds: number, officials: OfficialState[]) => void;
  setOfficialThinking: (officialId: OfficialId) => void;
  setOfficialSpeech: (officialId: OfficialId, round: number, content: string) => void;
  appendOfficialToken: (officialId: OfficialId, round: number, token: string) => void;
  finishOfficialSpeech: (officialId: OfficialId, round: number, content: string) => void;
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
  timeline: [],
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
      timeline: [],
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
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;

      // 替换掉该官员之前的 thinking 消息（如果有的话）
      const filtered = state.timeline.filter(
        (m) => !(m.type === 'thinking' && m.officialId === officialId)
      );
      const thinkingMsg: TimelineMessage = {
        id: tlId(),
        type: 'thinking',
        officialId,
        officialTitle: prev.official.title,
        rank: prev.official.rank,
        round: state.currentRound,
        content: '',
        isStreaming: false,
      };

      return {
        officials: {
          ...state.officials,
          [officialId]: { ...prev, status: 'thinking' },
        },
        timeline: [...filtered, thinkingMsg],
      };
    });
  },

  setOfficialSpeech: (officialId, round, content) => {
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;

      // 移除该官员的 thinking 消息，添加完整发言
      const filtered = state.timeline.filter(
        (m) => !(m.type === 'thinking' && m.officialId === officialId)
      );
      const speechMsg: TimelineMessage = {
        id: tlId(),
        type: 'speech',
        officialId,
        officialTitle: prev.official.title,
        rank: prev.official.rank,
        round,
        content,
        isStreaming: false,
      };

      return {
        officials: {
          ...state.officials,
          [officialId]: {
            ...prev,
            status: 'done',
            speeches: [...prev.speeches, { round, content }],
          },
        },
        timeline: [...filtered, speechMsg],
      };
    });
  },

  appendOfficialToken: (officialId, round, token) => {
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;

      // 如果还是 thinking/waiting → 切换到 streaming，移除 thinking 消息，创建新 speech 气泡
      if (prev.status === 'thinking' || prev.status === 'waiting') {
        const filtered = state.timeline.filter(
          (m) => !(m.type === 'thinking' && m.officialId === officialId)
        );
        const speechMsg: TimelineMessage = {
          id: tlId(),
          type: 'speech',
          officialId,
          officialTitle: prev.official.title,
          rank: prev.official.rank,
          round,
          content: token,
          isStreaming: true,
        };
        return {
          officials: {
            ...state.officials,
            [officialId]: {
              ...prev,
              status: 'streaming',
              speeches: [...prev.speeches, { round, content: token }],
            },
          },
          timeline: [...filtered, speechMsg],
        };
      }

      // 已经在 streaming → 追加到最后一条 speech 和 timeline
      const speeches = [...prev.speeches];
      if (speeches.length > 0) {
        const last = speeches[speeches.length - 1];
        speeches[speeches.length - 1] = { ...last, content: last.content + token };
      }

      // 更新 timeline 中该官员最后一条 streaming 消息
      const timeline = [...state.timeline];
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].type === 'speech' && timeline[i].officialId === officialId && timeline[i].isStreaming) {
          timeline[i] = { ...timeline[i], content: timeline[i].content + token };
          break;
        }
      }

      return {
        officials: {
          ...state.officials,
          [officialId]: { ...prev, status: 'streaming', speeches },
        },
        timeline,
      };
    });
  },

  finishOfficialSpeech: (officialId, round, content) => {
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;

      // 用完整文本替换最后一条（确保文本一致性）
      const speeches = [...prev.speeches];
      if (speeches.length > 0 && speeches[speeches.length - 1].round === round) {
        speeches[speeches.length - 1] = { round, content };
      } else {
        speeches.push({ round, content });
      }

      // 同步更新 timeline 中对应的 streaming 消息为 done
      const timeline = [...state.timeline];
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (timeline[i].type === 'speech' && timeline[i].officialId === officialId && timeline[i].isStreaming) {
          timeline[i] = { ...timeline[i], content, isStreaming: false };
          break;
        }
      }

      return {
        officials: {
          ...state.officials,
          [officialId]: {
            ...prev,
            status: 'done',
            speeches,
          },
        },
        timeline,
      };
    });
  },

  setOfficialSilent: (officialId) => {
    set((state) => {
      const prev = state.officials[officialId];
      if (!prev) return state;

      // 移除 thinking 消息，添加 silent 消息
      const filtered = state.timeline.filter(
        (m) => !(m.type === 'thinking' && m.officialId === officialId)
      );
      const silentMsg: TimelineMessage = {
        id: tlId(),
        type: 'silent',
        officialId,
        officialTitle: prev.official.title,
        rank: prev.official.rank,
        round: state.currentRound,
        content: '臣无奏',
        isStreaming: false,
      };

      return {
        officials: {
          ...state.officials,
          [officialId]: { ...prev, status: 'silent' },
        },
        timeline: [...filtered, silentMsg],
      };
    });
  },

  setRound: (round) => {
    set((state) => {
      // 将非终态的官员重置为 waiting
      const updated: Record<OfficialId, OfficialState> = {};
      Object.entries(state.officials).forEach(([id, os]) => {
        updated[id] = { ...os, status: 'waiting' };
      });

      // 在 timeline 中添加轮次分隔（第 1 轮也加）
      const roundMsg: TimelineMessage = {
        id: tlId(),
        type: 'round_start',
        round,
        content: '',
        isStreaming: false,
      };

      return {
        currentRound: round,
        officials: updated,
        timeline: [...state.timeline, roundMsg],
      };
    });
  },

  setChancellorSummary: (summary) => {
    set({ chancellorSummary: summary });
  },

  completeDebate: () => {
    set((state) => {
      const updated: Record<OfficialId, OfficialState> = {};
      Object.entries(state.officials).forEach(([id, os]) => {
        updated[id] = {
          ...os,
          status: (os.status === 'streaming') ? 'done' : os.status,
        };
      });

      // 将所有 streaming 的 timeline 消息标记为非 streaming
      const timeline = state.timeline.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      );

      return { status: 'complete', officials: updated, timeline };
    });
  },

  resetDebate: () => {
    set(initialState);
  },
}));
