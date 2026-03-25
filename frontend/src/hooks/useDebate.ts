import { useCallback, useEffect, useRef } from 'react';
import { useDebateStore } from '../store/debateStore';
import { useHistoryStore } from '../store/historyStore';
import { useOfficialsStore } from '../store/officialsStore';
import type { DebateRecord } from '../store/historyStore';
import type { Settings, Official, OfficialState } from '../types';

// ============================================================
// 构建 WebSocket URL（通过 nginx 代理，自动适配 http/https）
// ============================================================

function buildWsUrl(debateId: string): string {
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws/debate/${debateId}`;
}

// ============================================================
// Hook
// ============================================================

export function useDebate() {
  const store = useDebateStore();
  const historyStore = useHistoryStore();
  const wsRef = useRef<WebSocket | null>(null);

  // ----------------------------------------------------------
  // WebSocket 连接
  // ----------------------------------------------------------
  const connectWs = useCallback(
    (debateId: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(buildWsUrl(debateId));
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'round_start':
              store.setRound(msg.round);
              break;
            case 'official_thinking':
              store.setOfficialThinking(msg.official);
              break;
            case 'official_speech':
              store.setOfficialSpeech(msg.official, msg.round, msg.content);
              break;
            case 'official_speech_token':
              store.appendOfficialToken(msg.official, msg.round, msg.token);
              break;
            case 'official_speech_done':
              store.finishOfficialSpeech(msg.official, msg.round, msg.content);
              break;
            case 'official_silent':
              store.setOfficialSilent(msg.official);
              break;
            case 'chancellor_summary':
              store.setChancellorSummary(msg.content);
              break;
            case 'debate_complete':
              store.completeDebate();
              // 保存本次朝会到历史记录
              {
                const finalState = useDebateStore.getState();
                const wsSpeeches: DebateRecord['speeches'] = [];
                Object.values(finalState.officials).forEach((os) => {
                  os.speeches.forEach((s) => {
                    wsSpeeches.push({
                      round: s.round,
                      officialId: os.official.id,
                      officialTitle: os.official.title,
                      content: s.content,
                    });
                  });
                });
                const wsRecord: DebateRecord = {
                  id: msg.debate_id || finalState.debateId || `ws-${Date.now()}`,
                  topic: finalState.topic,
                  createdAt: Date.now(),
                  rounds: finalState.totalRounds,
                  officials: Object.values(finalState.officials).map((os) => os.official.title),
                  speeches: wsSpeeches,
                  chancellorSummary: finalState.chancellorSummary,
                };
                void useHistoryStore.getState().saveRecord(wsRecord);
              }
              break;
            case 'error':
              console.error('[WS Error]', msg.code, msg.message);
              break;
          }
        } catch (e) {
          console.error('[WS Parse Error]', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[WS] Connection error', e);
      };

      ws.onclose = () => {
        console.info('[WS] Connection closed');
      };
    },
    [store]
  );

  // 清理 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // ----------------------------------------------------------
  // 发起朝会（真实 API 模式）
  // ----------------------------------------------------------
  const startDebate = useCallback(
    async (topic: string, settings: Settings) => {
      store.resetDebate();

      // 确保官员列表已从 IndexedDB 加载
      await useOfficialsStore.getState().loadOfficials();

      // 从统一 store 获取已选中的官员
      const storeOfficials = useOfficialsStore.getState().officials;
      const allOfficials: Official[] = storeOfficials
        .filter((o) => settings.selectedOfficials.includes(o.id))
        .map((o) => ({
          id: o.id,
          name: o.name,
          title: o.title,
          rank: o.rank,
          isDefault: o.isDefault,
          isChancellor: o.isChancellor,
          personality: o.personality,
        }));

      // 提取自定义官员（发给后端 custom_officials 字段）
      const customSelected = allOfficials.filter((o) => !o.isDefault);

      // 初始化 store（先展示"恭候中"状态）
      const officialStates: OfficialState[] = allOfficials.map((o) => ({
        official: o,
        status: 'waiting',
        speeches: [],
      }));
      store.startDebate('pending', topic, settings.rounds, officialStates);

      // 调用后端 API
      try {
        const res = await fetch('/api/debate/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            officials: settings.selectedOfficials,
            rounds: settings.rounds,
            settings: { length: settings.length, style: settings.style },
            userKey: settings.userKey,
            custom_officials: customSelected.map((o) => ({
              id: o.id,
              name: o.name,
              title: o.title,
              rank: o.rank,
              personality: o.personality ?? '',
            })),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail?.message || `API 错误 (${res.status})`);
        }

        const { debate_id } = await res.json();

        // 更新 store 中的 debateId
        useDebateStore.setState({ debateId: debate_id });

        // 连接 WebSocket 接收辩论过程
        connectWs(debate_id);
      } catch (err) {
        console.error('[startDebate] API 调用失败:', err);
        // API 失败时重置状态，让用户可以重试
        store.resetDebate();
        // 将错误抛出，让调用者处理（可选）
        throw err;
      }
    },
    [store, connectWs]
  );

  return {
    startDebate,
    connectWs,
    debateState: store,
  };
}
