/* ══════════════════════════════════════════════════════
   CRAFTCODE — Simulated AI (Read.txt §2)
   ══════════════════════════════════════════════════════
   Keyword dispatcher. Scans input for known triggers, picks a
   random variant from matched pool, and is mildly sensitive to
   time-of-day / mood / bump history if the caller passes those
   fields on AICtx. Designed to be swappable later for a real API. */

import type { AIReply, AICtx, BotLine, BotId } from './bot.types';
import { line } from './bot.dialogues';
import { t } from '~/i18n/i18n';

function tt(ctx: AICtx, key: string, fallback = ''): string {
  return t(key, ctx.lang) ?? fallback;
}

function say(who: BotId, text: string): BotLine {
  return line(who, text);
}

/** Pick a uniformly random element. Caller guarantees non-empty. */
function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function tokens(input: string): [string, string[]] {
  const parts = normalize(input).split(' ').filter(Boolean);
  return [parts[0] ?? '', parts.slice(1)];
}

/** Extended ctx fields we *may* use if the caller provides them.
 *  AICtx in bot.types.ts only requires {lang, rapport, plugins}; anything
 *  beyond is best-effort. */
interface ExtCtx extends AICtx {
  timePhase?: 'morning' | 'day' | 'evening';
  mood?: { craft?: number; code?: number };
  sim?: { bumps?: number; [k: string]: unknown };
}

function isEvening(ctx: ExtCtx): boolean {
  if (ctx.timePhase === 'evening') return true;
  try {
    const h = new Date().getHours();
    return h >= 20 || h < 5;
  } catch { return false; }
}

function craftLow(ctx: ExtCtx): boolean {
  return typeof ctx.mood?.craft === 'number' && ctx.mood.craft < 30;
}

function bumpedLots(ctx: ExtCtx): boolean {
  return typeof ctx.sim?.bumps === 'number' && ctx.sim.bumps > 5;
}

/** Does `input` contain any of these substrings (already normalized)? */
function hasAny(input: string, needles: readonly string[]): boolean {
  return needles.some((n) => input.includes(n));
}

// ── Reply pools ────────────────────────────────────────
const GREETING_POOL: Array<() => BotLine[]> = [
  () => [say('craft', 'хэй! ты вернулся'), say('code', 'uptime +1')],
  () => [say('code', 'онлайн. приветствую.'), say('craft', 'ого, гость! 🎉')],
  () => [say('craft', 'привет-привет!'), say('code', 'handshake ok')],
  () => [say('code', 'привет. lang=ru детектед.'), say('craft', 'заходи, щас поделим атлас')],
  () => [say('craft', 'hi! ставь pivot куда удобно'), say('code', 'только не в (0, -∞)')],
];

const GOODBYE_POOL: Array<() => BotLine[]> = [
  () => [say('craft', 'пока! не забудь commit'), say('code', 'bye. closing socket.')],
  () => [say('code', 'session end. thx.'), say('craft', 'до связи lol')],
  () => [say('craft', 'чао!'), say('code', 'log flushed.')],
];

const THANKS_POOL: Array<() => BotLine[]> = [
  () => [say('craft', 'всегда пожалуйста 💛')],
  () => [say('code', 'acknowledged.')],
  () => [say('craft', 'не за что, друг'), say('code', '+1 rapport')],
  () => [say('code', 'благодарность зафиксирована.')],
];

const PRICE_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'цена? всё честно на FAB!'),
    say('code', 'fab.com/sellers/Jonathan → открой карточку плагина.'),
  ],
  () => [
    say('code', 'pricing управляет Epic/FAB.'),
    say('craft', 'глянь FAB listing — там и скидки бывают'),
  ],
  () => [
    say('craft', 'купить можно на FAB marketplace'),
    say('code', 'доки бесплатны. попробуй `docs <slug>`.'),
  ],
];

const FAB_POOL: Array<() => BotLine[]> = [
  () => [
    say('code', 'FAB = Epic marketplace. вот где мы живём.'),
    say('craft', 'все плагины — там, с ревью и апдейтами'),
  ],
  () => [
    say('craft', 'FAB — наша витрина'),
    say('code', 'покупка один раз, обновления бесплатно.'),
  ],
];

const BOOSTY_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'Boosty = поддержать проект и получить ранний билд'),
    say('code', 'boosty.to — patreon-стайл, но наш.'),
  ],
  () => [
    say('code', 'Boosty: early access + dev-заметки.'),
    say('craft', 'спасибо всем кто бустит 💛'),
  ],
];

const YOUTUBE_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'YouTube — там туторы и devlog'),
    say('code', 'подписка = +1 к mood у CRAFT.'),
  ],
  () => [
    say('code', 'видео-доки сняты на реальных кейсах.'),
    say('craft', 'если лень читать — смотри 🍿'),
  ],
  () => [
    say('craft', 'ютуб лучше чем читать, правда?'),
    say('code', 'неправда. но иногда да.'),
  ],
];

const SPRITE_OPT_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'Sprite Optimizer — пакует Paper2D-атласы как надо'),
    say('code', 'убирает padding, мержит кадры, экономит VRAM.'),
  ],
  () => [
    say('code', 'Sprite Optimizer: batch по папкам, пресеты, diff-просмотр.'),
    say('craft', 'он сделал мой билд шустрее на 30%, я проверял!'),
  ],
  () => [
    say('craft', 'атласы + UE = головная боль. плагин — парацетамол.'),
    say('code', 'docs → /plugins/sprite-optimizer/'),
  ],
];

const MANUAL_SPRITE_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'ManualSprite — ручная геометрия спрайтов'),
    say('code', 'рисуешь collision-полигоны точно по силуэту. для Paper2D.'),
  ],
  () => [
    say('code', 'ManualSprite: editor для custom geometry, экспорт в UE.'),
    say('craft', 'pivot и shape — как ты захотел, без авто-магии'),
  ],
];

const SELF_INTRO_POOL: Array<() => BotLine[]> = [
  () => [
    say('craft', 'я CRAFT, розовый. леплю и ломаю.'),
    say('code', 'я CODE, жёлтый. считаю и чиню.'),
  ],
  () => [
    say('code', 'мы companions. живём на этом сайте.'),
    say('craft', 'просто бросай нас, мы не обидимся. почти.'),
  ],
  () => [
    say('craft', 'я бот-художник'),
    say('code', 'я бот-инженер. он перекрашивает, я выравниваю.'),
  ],
];

const CAPABILITIES_POOL: Array<() => BotLine[]> = [
  () => [
    say('code', 'умею: `help`, `plugin`, `docs <slug>`, `theme`, `about`.'),
    say('craft', 'а ещё болтаем, падаем, танцуем 💃'),
  ],
  () => [
    say('craft', 'сайт показывает плагины для UE, туторы и demo'),
    say('code', 'терминал принимает ключи сверху. попробуй `help`.'),
  ],
];

// ── Keyword → pool routing table ──────────────────────
const KEYWORD_ROUTES: Array<{
  keys: readonly string[];
  pool: Array<() => BotLine[]>;
  state?: 'greeting' | 'explaining' | 'glitch' | 'thinking' | 'easter' | 'idle';
  fireTag?: string;
}> = [
  { keys: ['пока', 'bye', 'чао', 'goodbye'], pool: GOODBYE_POOL, state: 'explaining' },
  { keys: ['спасибо', 'спс', 'thanks', 'thx', 'ty'], pool: THANKS_POOL, state: 'explaining' },
  { keys: ['цена', 'купить', 'сколько стоит', 'сколько', 'price', 'buy', 'cost'], pool: PRICE_POOL, state: 'explaining' },
  { keys: ['fab', 'marketplace', 'маркет'], pool: FAB_POOL, state: 'explaining' },
  { keys: ['boosty', 'буст', 'бусти'], pool: BOOSTY_POOL, state: 'explaining' },
  { keys: ['youtube', 'ютуб', 'видео', 'video'], pool: YOUTUBE_POOL, state: 'explaining' },
  { keys: ['sprite optim', 'sprite-optim', 'sprite opt', 'оптимизац', 'атлас', 'paper2d', 'paper 2d'], pool: SPRITE_OPT_POOL, state: 'explaining' },
  { keys: ['manualsprite', 'manual sprite', 'ручн', 'геометр'], pool: MANUAL_SPRITE_POOL, state: 'explaining' },
  { keys: ['кто ты', 'кто вы', 'who are you', 'whoami', 'бот', 'робот'], pool: SELF_INTRO_POOL, state: 'greeting' },
  { keys: ['что умеешь', 'что можешь', 'что умеете', 'what can', 'what do you do', 'возможност'], pool: CAPABILITIES_POOL, state: 'explaining' },
];

/** Main dispatcher. */
export function respond(input: string, ctx: AICtx): AIReply {
  const ext = ctx as ExtCtx;
  const norm = normalize(input);
  const [head, rest] = tokens(input);

  if (!head) {
    return {
      state: 'glitch',
      lines: [say('code', tt(ctx, 'bot.error'))],
    };
  }

  // ── 1. Keyword substring matches (fuzzy, picks first match) ──
  for (const route of KEYWORD_ROUTES) {
    if (hasAny(norm, route.keys)) {
      const builder = randomPick(route.pool);
      const lines = builder();
      // context-sensitive flavour additions
      if (isEvening(ext) && Math.random() < 0.35) {
        lines.push(say('craft', randomPick(['устал... спать пора', 'уже ночь, я в standby', 'zzz, почти'])));
      }
      if (craftLow(ext) && Math.random() < 0.5) {
        lines.push(say('craft', randomPick(['...mood.craft<30', '*вяло машет*', 'не спрашивай как день'])));
      }
      if (bumpedLots(ext) && Math.random() < 0.4) {
        lines.push(say('code', randomPick(['нервный он сегодня. много прыгал.', 'bumps>5, ожидайте glitch.'])));
      }
      return {
        state: route.state ?? 'explaining',
        lines,
        fireTag: route.fireTag,
      };
    }
  }

  // ── 2. Exact head-token commands (original dispatcher) ──
  switch (head) {
    case 'hi':
    case 'hello':
    case 'хай':
    case 'привет':
    case 'здорово': {
      const build = randomPick(GREETING_POOL);
      const lines = build();
      if (isEvening(ext) && Math.random() < 0.4) {
        lines.push(say('code', randomPick(['ночь. мы тоже устали.', 'late shift. но работаем.'])));
      }
      return { state: 'greeting', lines, fireTag: 'accent' };
    }

    case 'help':
    case 'помощь':
    case '?':
      return {
        state: 'explaining',
        lines: [
          say('code', tt(ctx, 'bot.help.header')),
          say('code', tt(ctx, 'bot.help.plugin')),
          say('code', tt(ctx, 'bot.help.help')),
          say('code', tt(ctx, 'bot.help.docs')),
          say('code', tt(ctx, 'bot.help.about')),
          say('code', tt(ctx, 'bot.help.theme')),
        ],
      };

    case 'plugin':
    case 'plugins':
    case 'плагин':
    case 'плагины': {
      if (ctx.plugins.length === 0) {
        return {
          state: 'thinking',
          lines: [say('code', tt(ctx, 'bot.plugin.empty'))],
        };
      }
      return {
        state: 'explaining',
        lines: [
          say('code', tt(ctx, 'bot.plugin.intro')),
          ...ctx.plugins.map((slug) => say('code', `• ${slug}`)),
        ],
      };
    }

    case 'docs':
    case 'doc':
    case 'док': {
      const slug = rest[0];
      if (!slug) {
        return {
          state: 'glitch',
          lines: [say('code', `${tt(ctx, 'bot.unknown')}: docs <slug>`)],
        };
      }
      return {
        state: 'explaining',
        lines: [say('code', `opening /plugins/${slug}/ …`)],
      };
    }

    case 'about':
    case 'о':
      return {
        state: 'explaining',
        lines: [say('craft', tt(ctx, 'bot.about'))],
      };

    case 'theme':
    case 'тема':
      return {
        state: 'glitch',
        lines: [say('code', tt(ctx, 'bot.theme'))],
        fireTag: 'konami',
      };

    default:
      return {
        state: 'glitch',
        lines: [
          say('code', `${tt(ctx, 'bot.unknown')}: ${head}`),
          say('craft', tt(ctx, 'bot.unknown.hint')),
        ],
      };
  }
}
