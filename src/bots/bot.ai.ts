/* ══════════════════════════════════════════════════════
   CRAFTCODE — Simulated AI (Read.txt §2)
   ══════════════════════════════════════════════════════
   Keyword dispatcher that reads every copy string from the
   shared i18n dictionary (src/i18n/i18n.ts). Pluggable — the
   whole module can later be swapped for an API client with
   the same respond() signature.                               */

import type { AIReply, AICtx, BotLine, BotId } from './bot.types';
import { line } from './bot.dialogues';
import { t } from '~/i18n/i18n';

function tt(ctx: AICtx, key: string, fallback = ''): string {
  return t(key, ctx.lang) ?? fallback;
}

function say(who: BotId, text: string): BotLine {
  return line(who, text);
}

export function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function tokens(input: string): [string, string[]] {
  const parts = normalize(input).split(' ').filter(Boolean);
  return [parts[0] ?? '', parts.slice(1)];
}

/** Main dispatcher (Read.txt §2.2). */
export function respond(input: string, ctx: AICtx): AIReply {
  const [head, rest] = tokens(input);

  if (!head) {
    return {
      state: 'glitch',
      lines: [say('code', tt(ctx, 'bot.error'))],
    };
  }

  switch (head) {
    case 'hi':
    case 'hello':
    case 'привет':
    case 'здорово':
      return {
        state: 'greeting',
        lines: [
          say('code', tt(ctx, 'bot.greeting.1')),
          say('code', tt(ctx, 'bot.greeting.2')),
        ],
        fireTag: 'accent',
      };

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
