export type OfficialId = string;

export interface Official {
  id: OfficialId;
  name: string;
  title: string;
  rank: number; // 1最高，9最低
  faction: string;
  avatar?: string;
  isDefault?: boolean;
  isChancellor?: boolean;
  personality?: string; // 自定义官员的性格描述
}

export type SpeechStatus = 'waiting' | 'thinking' | 'speaking' | 'done' | 'silent';

export interface OfficialState {
  official: Official;
  status: SpeechStatus;
  speeches: { round: number; content: string }[];
}

export interface DebateState {
  debateId: string | null;
  topic: string;
  status: 'idle' | 'running' | 'complete';
  currentRound: number;
  totalRounds: number;
  officials: Record<OfficialId, OfficialState>;
  chancellorSummary: string | null;
}

export interface Settings {
  length: 'short' | 'medium' | 'long';
  rounds: 1 | 2 | 3;
  style: 'modern' | 'classical';
  typingSpeed: 'fast' | 'slow';
  selectedOfficials: OfficialId[];
  userKey?: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
}

// WebSocket 消息类型
export type WsMessage =
  | { type: 'round_start'; round: number; total_rounds: number }
  | { type: 'official_thinking'; official: OfficialId; name: string; round: number }
  | { type: 'official_speech'; official: OfficialId; name: string; rank: number; round: number; content: string }
  | { type: 'official_silent'; official: OfficialId; name: string; display_text: string }
  | { type: 'round_complete'; round: number }
  | { type: 'chancellor_summary'; content: string }
  | { type: 'debate_complete'; debate_id: string }
  | { type: 'error'; code: string; message: string };
