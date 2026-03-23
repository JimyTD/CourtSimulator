import { useCallback, useEffect, useRef } from 'react';
import { useDebateStore } from '../store/debateStore';
import type { Settings, Official } from '../types';

// ============================================================
// Mock 数据 —— 后端就绪后替换为真实 WebSocket
// ============================================================

const MOCK_OFFICIALS: Official[] = [
  { id: 'hubu', name: '户部尚书', title: '掌管天下钱粮', rank: 2, faction: 'conservative', isDefault: true },
  { id: 'bingbu', name: '兵部尚书', title: '掌管天下兵马', rank: 2, faction: 'hawk', isDefault: true },
  { id: 'libu', name: '礼部尚书', title: '掌管礼仪典章', rank: 2, faction: 'traditionalist', isDefault: true },
  { id: 'gongbu', name: '工部尚书', title: '掌管工程营造', rank: 2, faction: 'pragmatist', isDefault: true },
  { id: 'yushi', name: '御史大夫', title: '监察百官', rank: 3, faction: 'censor', isDefault: true },
  { id: 'hanlin', name: '清流翰林', title: '翰林院学士', rank: 4, faction: 'idealist', isDefault: true },
  { id: 'chancellor', name: '内阁首辅', title: '百官之首', rank: 1, faction: 'neutral', isDefault: true, isChancellor: true },
];

const MOCK_SPEECHES: Record<string, string> = {
  hubu: '臣以为，此议耗费甚巨，国库眼下余银不足三百万两，若强行推行，恐致府库空虚，来年赈灾无以为继。且民力已竭，再加征税赋，恐生变乱。臣斗胆谏阻，望陛下三思。',
  bingbu: '陛下，强兵乃强国之本！边患未靖，若不以雷霆之势震慑宵小，他日必养虎为患。臣主张即刻发兵，一举荡平，扬我大明天威，令四方宾服！区区钱粮，岂能阻我王师！',
  libu: '礼制乃社稷之根本。查历朝史册，祖宗成法素有定制，贸然更张，恐动摇社稷根基。孔子曰：「名不正则言不顺」。臣以为，此事须循旧例，不可轻举妄动。',
  gongbu: '臣就工程层面言之：依现有物料与役夫，工期约需两载，所需木料约万方，铁料约五千斤，另需工匠三百名。可行，但需提前备料。若陛下有意，臣可详呈预算明细。',
  yushi: '臣察此议有数处不妥：其一，程序未依典章，未经廷议；其二，地方官员恐中饱私囊，需严加监察；其三，时机尚未成熟，贸然施行必生弊端。臣弹劾主议诸臣失察之责！',
  hanlin: '子曰：「仁者爱人」。圣人之道，在于以民为本。此议若利于万民，自当推行；若劳民伤财，则有悖仁政。臣请陛下以苍生为念，广开言路，听民之声，方为仁君之道。',
};

const MOCK_SPEECHES_ROUND2: Record<string, string> = {
  hubu: '兵部尚书所言，臣不敢苟同。打仗打的是粮草，兵马未动，粮草先行。国库空虚之时，纵有百万雄兵，又能支撑几月？臣坚持，财政稳固方为根本。',
  bingbu: '户部尚书此言差矣！屡屡以银两为由推诿，难道要坐等外患坐大？昔汉武帝倾尽国库击匈奴，方换百年太平，此乃千古明鉴！',
  libu: '两位大人皆有道理，然礼制所在，切不可废。臣以为须先呈明礼仪程序，方可议事。',
  gongbu: '两轮争论下来，技术层面无甚变化。臣补充一点：若要加急，工期可压缩至一载半，但成本需增三成。',
  yushi: '（品级悬殊，御史大夫沉默以对）',
  hanlin: '听诸位奏对，臣深感忧虑。无论何种方略，请陛下莫忘苍生疾苦，以仁义为先。',
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Hook
// ============================================================

export function useDebate() {
  const store = useDebateStore();
  const wsRef = useRef<WebSocket | null>(null);
  const mockRunningRef = useRef(false);

  // 获取可参与辩论的官员（排除丞相，丞相只做总结）
  const getActiveOfficials = (selectedIds: string[]) =>
    MOCK_OFFICIALS.filter((o) => !o.isChancellor && selectedIds.includes(o.id));

  // ----------------------------------------------------------
  // Mock 辩论流程（仅前端演示，后端就绪后删除此函数）
  // ----------------------------------------------------------
  const runMockDebate = useCallback(
    async (topic: string, settings: Settings) => {
      if (mockRunningRef.current) return;
      mockRunningRef.current = true;

      const selectedOfficials = getActiveOfficials(settings.selectedOfficials);
      const totalRounds = settings.rounds;
      const debateId = `mock-${Date.now()}`;

      // 初始化 store
      const officialStates = [
        ...selectedOfficials,
        ...MOCK_OFFICIALS.filter((o) => o.isChancellor && settings.selectedOfficials.includes(o.id)),
      ].map((o) => ({ official: o, status: 'waiting' as const, speeches: [] }));

      store.startDebate(debateId, topic, totalRounds, officialStates);

      for (let round = 1; round <= totalRounds; round++) {
        store.setRound(round);
        await delay(800);

        const speechMap = round === 1 ? MOCK_SPEECHES : MOCK_SPEECHES_ROUND2;

        for (const official of selectedOfficials) {
          store.setOfficialThinking(official.id);
          await delay(600 + Math.random() * 400);

          // 高品级差距时模拟沉默（第二轮御史大夫）
          if (round === 2 && official.id === 'yushi') {
            store.setOfficialSilent(official.id);
          } else {
            const content = speechMap[official.id] ?? '臣暂无奏。';
            store.setOfficialSpeech(official.id, round, content);
          }

          await delay(300);
        }

        await delay(1000);
      }

      // 丞相总结
      await delay(1200);
      store.setChancellorSummary(
        '综各位所奏，争议焦点有三：其一，财政能否支撑；其二，军事威慑之必要；其三，礼制程序之合规。户部主稳，兵部主进，礼部主循旧，工部言可行。御史大夫有所顾虑，清流翰林以仁义为念。各方皆有其理，请陛下圣裁。'
      );

      await delay(500);
      store.completeDebate();
      mockRunningRef.current = false;
    },
    [store]
  );

  // ----------------------------------------------------------
  // 真实 WebSocket（后端就绪后启用）
  // ----------------------------------------------------------
  const connectWs = useCallback(
    (debateId: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(`ws://localhost:8000/ws/debate/${debateId}`);
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
            case 'official_silent':
              store.setOfficialSilent(msg.official);
              break;
            case 'chancellor_summary':
              store.setChancellorSummary(msg.content);
              break;
            case 'debate_complete':
              store.completeDebate();
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
  // 发起朝会（当前使用 Mock；后端就绪后切换为 HTTP + WS）
  // ----------------------------------------------------------
  const startDebate = useCallback(
    async (topic: string, settings: Settings) => {
      store.resetDebate();

      // TODO: 后端就绪后替换为以下逻辑：
      // const res = await fetch('/api/debate/start', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ topic, officials: settings.selectedOfficials, rounds: settings.rounds, settings: { length: settings.length, style: settings.style }, userKey: settings.userKey }),
      // });
      // const { debate_id } = await res.json();
      // connectWs(debate_id);

      // 目前使用 Mock
      void runMockDebate(topic, settings);
    },
    [store, runMockDebate]
  );

  return {
    startDebate,
    connectWs, // 后端就绪后使用
    debateState: store,
  };
}
