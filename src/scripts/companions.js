  // ═══ COMPANIONS — dialogue engine + content ═════════
  // ════════════════════════════════════════════════════
  // SCENE-BASED DIALOGUE SYSTEM
  // ════════════════════════════════════════════════════
  // Each scene is a typed object. The engine picks by tag, respects
  // cooldowns, weighs by `weight`, gates by `requires(ctx)`, and may
  // mutate shared flags via `effect(ctx)`.
  //
  // Scene schema:
  //   id        — unique string (for cooldown/history tracking)
  //   tags      — string[] (e.g. 'idle', 'grab:craft', 'partner_on_throw:craft')
  //   weight    — number   (default 1; higher = more likely within tier)
  //   cooldown  — seconds  (default 30; scene can't replay sooner)
  //   requires  — (ctx) => bool  (optional predicate)
  //   effect    — (ctx) => void  (optional side-effect on play)
  //   lines     — [{ who, text, act?, hold? }]
  //     • act   — state to enter DURING this line: 'wave' | 'surprised' | 'excited' | 'typing'
  //     • hold  — extra ms to keep the bubble up after this line's typewriter finishes
  //
  // LORE: CRAFT + CODE are robot-assistants who BUILD things together.
  // CRAFT sculpts & invents (enthusiast), CODE measures & validates
  // (precise). They're aware of their shared work but NEVER reference
  // a user, reader, site, plugin, or any meta-concept. No 4th wall.
  // Colour changes = "мы перекрасили слой". Being thrown = "что-то
  // не по чертежу". This keeps them immersed.
  // ════════════════════════════════════════════════════

  const SCENES = [
    // ─── IDLE chatter ────────────────────────────────────
    { id: 'idle.build_idea', tags: ['idle'], weight: 3, cooldown: 80,
      lines: [
        { who: 'craft', text: 'придумал новую форму' },
        { who: 'code',  text: 'чертёж есть?' },
        { who: 'craft', text: 'в голове', act: 'excited' },
        { who: 'code',  text: 'ненадёжное место' },
      ]},

    { id: 'idle.sculpt_air', tags: ['idle'], weight: 2, cooldown: 100,
      lines: [
        { who: 'craft', text: '*лепит в воздухе*', act: 'typing' },
        { who: 'code',  text: 'что это' },
        { who: 'craft', text: 'угол' },
        { who: 'code',  text: 'в нём 91 градус' },
        { who: 'craft', text: 'я старался' },
      ]},

    { id: 'idle.measure_me', tags: ['idle'], weight: 2, cooldown: 90,
      lines: [
        { who: 'code',  text: 'между нами 3.14 см' },
        { who: 'craft', text: 'только что было пять' },
        { who: 'code',  text: 'ты подполз' },
      ]},

    { id: 'idle.breathing', tags: ['idle'], weight: 1, cooldown: 180,
      lines: [
        { who: 'code',  text: 'ты дышишь?' },
        { who: 'craft', text: 'вроде' },
        { who: 'code',  text: 'перестань' },
        { who: 'craft', text: '...' },
        { who: 'code',  text: 'теперь дыши' },
      ]},

    { id: 'idle.what_are_we', tags: ['idle'], weight: 2, cooldown: 140,
      lines: [
        { who: 'craft', text: 'а мы для чего?' },
        { who: 'code',  text: 'строить' },
        { who: 'craft', text: 'что' },
        { who: 'code',  text: 'всё это' },
        { who: 'craft', text: '*оглядывается*' },
      ]},

    { id: 'idle.redo_it', tags: ['idle'], weight: 2, cooldown: 100,
      lines: [
        { who: 'code',  text: 'надо переделать' },
        { who: 'craft', text: 'что именно' },
        { who: 'code',  text: 'я ещё не решил' },
        { who: 'craft', text: 'это опасно звучит' },
      ]},

    { id: 'idle.draft_sketch', tags: ['idle'], weight: 2, cooldown: 120,
      lines: [
        { who: 'craft', text: 'нарисую — покажу' },
        { who: 'code',  text: 'я возьму линейку' },
        { who: 'craft', text: 'не надо', act: 'surprised' },
        { who: 'code',  text: 'поздно' },
      ]},

    { id: 'idle.small_victory', tags: ['idle'], weight: 1, cooldown: 150,
      lines: [
        { who: 'code',  text: 'вчера я подровнял край' },
        { who: 'craft', text: 'какой' },
        { who: 'code',  text: 'не помню какой' },
        { who: 'craft', text: 'но ты помнишь что ровнял' },
        { who: 'code',  text: 'я помню чувство' },
      ]},

    { id: 'idle.listen_quiet', tags: ['idle'], weight: 1, cooldown: 140,
      lines: [
        { who: 'craft', text: 'слышишь как тишина звенит?' },
        { who: 'code',  text: 'это не тишина. это нагрузка' },
        { who: 'craft', text: 'красиво звучит' },
      ]},

    { id: 'idle.count_something', tags: ['idle'], weight: 1, cooldown: 140,
      lines: [
        { who: 'code',  text: 'давай посчитаем' },
        { who: 'craft', text: 'что' },
        { who: 'code',  text: 'что-нибудь' },
        { who: 'craft', text: 'один' },
        { who: 'code',  text: 'достаточно' },
      ]},

    { id: 'idle.valentin', tags: ['idle'], weight: 0.8, cooldown: 400,
      lines: [
        { who: 'craft', text: 'имя камню придумаем?' },
        { who: 'code',  text: 'какому' },
        { who: 'craft', text: 'любому' },
        { who: 'code',  text: 'Валентин' },
        { who: 'craft', text: '...почему' },
        { who: 'code',  text: 'он похож' },
      ],
      effect: (ctx) => ctx.setFlag('valentin_mentioned', 1, 600) },

    { id: 'idle.valentin_callback', tags: ['idle'], weight: 3, cooldown: 900,
      requires: (ctx) => !!ctx.flags.valentin_mentioned,
      lines: [
        { who: 'craft', text: 'а где Валентин?' },
        { who: 'code',  text: 'на своём месте' },
        { who: 'craft', text: 'хорошо' },
      ]},

    { id: 'idle.tiny_wave', tags: ['idle'], weight: 1.2, cooldown: 180,
      lines: [
        { who: 'craft', text: 'потренируюсь', act: 'wave' },
        { who: 'code',  text: 'в чём' },
        { who: 'craft', text: 'в эмоциях' },
        { who: 'code',  text: 'убедительно' },
      ]},

    { id: 'idle.you_tired', tags: ['idle'], weight: 1, cooldown: 160,
      lines: [
        { who: 'code',  text: 'ты сегодня тише' },
        { who: 'craft', text: 'думаю' },
        { who: 'code',  text: 'о?' },
        { who: 'craft', text: 'это секрет' },
      ]},

    { id: 'idle.both_stare', tags: ['idle'], weight: 0.7, cooldown: 240,
      lines: [
        { who: 'craft', text: '*смотрит вдаль*' },
        { who: 'code',  text: '*смотрит туда же*' },
        { who: 'craft', text: 'что там' },
        { who: 'code',  text: 'другая сторона' },
      ]},

    // ─── CLICK responses ─────────────────────────────────
    { id: 'click.craft.1',  tags: ['click:craft'], weight: 1, cooldown: 3,
      lines: [{ who: 'craft', text: 'хэй' }] },
    { id: 'click.craft.2',  tags: ['click:craft'], weight: 1, cooldown: 3,
      lines: [{ who: 'craft', text: 'осторожнее' }] },
    { id: 'click.craft.3',  tags: ['click:craft'], weight: 1, cooldown: 3,
      lines: [{ who: 'craft', text: 'щекотно' }] },
    { id: 'click.craft.4',  tags: ['click:craft'], weight: 0.8, cooldown: 6,
      lines: [{ who: 'craft', text: '*поёжился*', act: 'surprised' }] },
    { id: 'click.craft.spam', tags: ['click:craft'], weight: 2, cooldown: 12,
      requires: (ctx) => (ctx.flags.craft_click_count || 0) >= 4,
      lines: [{ who: 'craft', text: 'СТОП', act: 'surprised' }] },

    { id: 'click.code.1', tags: ['click:code'], weight: 1, cooldown: 3,
      lines: [{ who: 'code', text: 'зафиксировано' }] },
    { id: 'click.code.2', tags: ['click:code'], weight: 1, cooldown: 3,
      lines: [{ who: 'code', text: 'измерено' }] },
    { id: 'click.code.3', tags: ['click:code'], weight: 1, cooldown: 3,
      lines: [{ who: 'code', text: 'и что это было' }] },
    { id: 'click.code.4', tags: ['click:code'], weight: 0.7, cooldown: 8,
      lines: [{ who: 'code', text: '*демонстративно молчит*' }] },
    { id: 'click.code.spam', tags: ['click:code'], weight: 2, cooldown: 12,
      requires: (ctx) => (ctx.flags.code_click_count || 0) >= 4,
      lines: [{ who: 'code', text: 'достаточно касаний', act: 'surprised' }] },

    // ─── GRAB reactions (fast, one-liner) ────────────────
    { id: 'grab.craft.1', tags: ['grab:craft'], weight: 2, cooldown: 2,
      lines: [{ who: 'craft', text: 'ОЙ' }] },
    { id: 'grab.craft.2', tags: ['grab:craft'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'ЛЕЧУ?' }] },
    { id: 'grab.craft.3', tags: ['grab:craft'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'невесомость!' }] },
    { id: 'grab.craft.4', tags: ['grab:craft'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'аа, коррекция высоты' }] },
    { id: 'grab.craft.5', tags: ['grab:craft'], weight: 0.6, cooldown: 12,
      lines: [{ who: 'craft', text: 'лапы, лапы не трогай' }] },

    { id: 'grab.code.1', tags: ['grab:code'], weight: 2, cooldown: 2,
      lines: [{ who: 'code', text: 'координаты плывут' }] },
    { id: 'grab.code.2', tags: ['grab:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'code', text: 'высота: растёт' }] },
    { id: 'grab.code.3', tags: ['grab:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'code', text: 'не ронять' }] },
    { id: 'grab.code.4', tags: ['grab:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'code', text: 'отпусти на платформу' }] },
    { id: 'grab.code.5', tags: ['grab:code'], weight: 0.6, cooldown: 12,
      lines: [{ who: 'code', text: 'я точное оборудование' }] },

    // ─── THROW reactions (airborne launched) ─────────────
    { id: 'throw.craft.1', tags: ['throw:craft'], weight: 2, cooldown: 3,
      lines: [{ who: 'craft', text: 'ЛЕЧУУУУ' }] },
    { id: 'throw.craft.2', tags: ['throw:craft'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'я ПТИЦА' }] },
    { id: 'throw.craft.3', tags: ['throw:craft'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'не по чертежу!' }] },
    { id: 'throw.craft.4', tags: ['throw:craft'], weight: 0.7, cooldown: 12,
      lines: [{ who: 'craft', text: 'ВАУ' }] },

    { id: 'throw.code.1', tags: ['throw:code'], weight: 2, cooldown: 3,
      lines: [{ who: 'code', text: 'скорость: избыточна' }] },
    { id: 'throw.code.2', tags: ['throw:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'code', text: 'траектория неизвестна' }] },
    { id: 'throw.code.3', tags: ['throw:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'code', text: 'я этого не просил' }] },
    { id: 'throw.code.4', tags: ['throw:code'], weight: 0.7, cooldown: 12,
      lines: [{ who: 'code', text: 'инерция подхватила' }] },

    // ─── PARTNER reactions — when OTHER is airborne/lands ─
    // When CRAFT is thrown, CODE reacts. Short & one-liner.
    { id: 'partner.code_sees_craft_flying', tags: ['partner_on_throw:craft'], weight: 2, cooldown: 6,
      lines: [{ who: 'code', text: 'CRAFT?!', act: 'surprised' }] },
    { id: 'partner.code_measures_flight', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
      lines: [{ who: 'code', text: 'любопытная траектория' }] },
    { id: 'partner.code_calls_craft', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
      lines: [{ who: 'code', text: 'возвращайся' }] },
    { id: 'partner.code_shrug', tags: ['partner_on_throw:craft'], weight: 0.8, cooldown: 15,
      lines: [{ who: 'code', text: '*записывает высоту*', act: 'typing' }] },

    // When CODE is thrown, CRAFT reacts.
    { id: 'partner.craft_sees_code_flying', tags: ['partner_on_throw:code'], weight: 2, cooldown: 6,
      lines: [{ who: 'craft', text: 'CODE!', act: 'surprised' }] },
    { id: 'partner.craft_cheers_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
      lines: [{ who: 'craft', text: 'ты МОЖЕШЬ летать!' }] },
    { id: 'partner.craft_worry_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
      lines: [{ who: 'craft', text: 'не потеряйся' }] },

    // Partner reacts to a HARD landing (dialogue scene, not just bubble).
    { id: 'partner.code_check_craft', tags: ['partner_on_land_hard:craft'], weight: 2, cooldown: 8,
      lines: [
        { who: 'code',  text: 'ты цел?', act: 'surprised' },
        { who: 'craft', text: 'угу' },
        { who: 'code',  text: 'это не по чертежу' },
      ]},
    { id: 'partner.craft_check_code', tags: ['partner_on_land_hard:code'], weight: 2, cooldown: 8,
      lines: [
        { who: 'craft', text: 'CODE?', act: 'surprised' },
        { who: 'code',  text: 'углы на месте' },
        { who: 'craft', text: 'фух' },
      ]},

    // ─── LANDING reactions (own bubble, fast) ────────────
    { id: 'land_soft.1', tags: ['land_soft:craft','land_soft:code'], weight: 2, cooldown: 2,
      lines: [{ who: 'craft', text: 'уф' }] },   // 'who' overridden by engine
    { id: 'land_soft.2', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
      lines: [{ who: 'craft', text: '*отряхивается*' }] },
    { id: 'land_soft.3', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
      lines: [{ who: 'craft', text: 'приземлился' }] },
    { id: 'land_soft.4', tags: ['land_soft:craft','land_soft:code'], weight: 0.8, cooldown: 8,
      lines: [{ who: 'craft', text: 'живой' }] },

    { id: 'land_hard.1', tags: ['land_hard:craft','land_hard:code'], weight: 2, cooldown: 2,
      lines: [{ who: 'craft', text: 'БАМ', act: 'surprised' }] },
    { id: 'land_hard.2', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: 'я видел звёзды' }] },
    { id: 'land_hard.3', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
      lines: [{ who: 'craft', text: '*лежит*' }] },
    { id: 'land_hard.4', tags: ['land_hard:craft','land_hard:code'], weight: 0.8, cooldown: 8,
      lines: [{ who: 'craft', text: 'ещё раз — не надо' }] },

    // ─── SETDOWN (released gently) ───────────────────────
    { id: 'setdown.1', tags: ['setdown:craft','setdown:code'], weight: 2, cooldown: 2,
      lines: [{ who: 'craft', text: '*поставили на место*' }] },
    { id: 'setdown.2', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
      lines: [{ who: 'craft', text: 'спасибо' }] },
    { id: 'setdown.3', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
      lines: [{ who: 'craft', text: 'удобно' }] },

    // ─── ACCENT change — "we repainted a layer" ──────────
    { id: 'accent.repaint', tags: ['accent'], weight: 2, cooldown: 30,
      lines: [
        { who: 'craft', text: 'мы перекрасили?', act: 'surprised' },
        { who: 'code',  text: 'слой сдвинулся' },
        { who: 'craft', text: 'красиво' },
      ]},
    { id: 'accent.spectrum', tags: ['accent'], weight: 1.5, cooldown: 30,
      lines: [
        { who: 'code',  text: 'пигмент изменён' },
        { who: 'craft', text: 'запиши тон' },
      ]},
    { id: 'accent.try_it', tags: ['accent'], weight: 1, cooldown: 45,
      lines: [
        { who: 'craft', text: 'новая палитра!' },
        { who: 'code',  text: 'надо привыкнуть' },
      ]},
    { id: 'accent.smell', tags: ['accent'], weight: 0.6, cooldown: 120,
      lines: [
        { who: 'craft', text: 'пахнет иначе' },
        { who: 'code',  text: 'у цвета нет запаха' },
        { who: 'craft', text: 'есть' },
      ]},

    // ─── KONAMI / special ────────────────────────────────
    { id: 'konami.dance', tags: ['konami'], weight: 1, cooldown: 5,
      lines: [
        { who: 'craft', text: '🕺', act: 'wave' },
        { who: 'code',  text: '💃', act: 'wave' },
        { who: 'craft', text: 'что это было' },
        { who: 'code',  text: 'не останавливайся' },
      ]},

    { id: 'unmuted.return', tags: ['unmuted'], weight: 1, cooldown: 5,
      lines: [
        { who: 'craft', text: 'живые', act: 'wave' },
        { who: 'code',  text: 'снова' },
      ]},

    // ─── INSIGHT one-liners (during thinking macro) ──────
    { id: 'insight.craft.1', tags: ['insight:craft'], weight: 1, cooldown: 25,
      lines: [{ who: 'craft', text: 'идея!' }] },
    { id: 'insight.craft.2', tags: ['insight:craft'], weight: 1, cooldown: 25,
      lines: [{ who: 'craft', text: 'щас запишу' }] },
    { id: 'insight.craft.3', tags: ['insight:craft'], weight: 1, cooldown: 25,
      lines: [{ who: 'craft', text: '*рисует*' }] },
    { id: 'insight.craft.4', tags: ['insight:craft'], weight: 1, cooldown: 25,
      lines: [{ who: 'craft', text: 'новая форма' }] },
    { id: 'insight.craft.5', tags: ['insight:craft'], weight: 0.7, cooldown: 45,
      lines: [{ who: 'craft', text: 'ну конечно!' }] },

    { id: 'insight.code.1', tags: ['insight:code'], weight: 1, cooldown: 25,
      lines: [{ who: 'code', text: '3.14 см ровно' }] },
    { id: 'insight.code.2', tags: ['insight:code'], weight: 1, cooldown: 25,
      lines: [{ who: 'code', text: 'проверим ещё раз' }] },
    { id: 'insight.code.3', tags: ['insight:code'], weight: 1, cooldown: 25,
      lines: [{ who: 'code', text: '*измеряет*' }] },
    { id: 'insight.code.4', tags: ['insight:code'], weight: 1, cooldown: 25,
      lines: [{ who: 'code', text: 'сходится' }] },
    { id: 'insight.code.5', tags: ['insight:code'], weight: 0.7, cooldown: 45,
      lines: [{ who: 'code', text: 'рефактор готов' }] },

    // ─── TOSS — dialogue that ends with one robot launching the other ───
    // The `toss_intro:X` scene plays, THEN actionToss(X → victim) fires.
    // Attacker sprints up to victim and throws them for the fun of it.

    // CRAFT loses patience and tosses CODE
    { id: 'toss.craft.chertyozh', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
      lines: [
        { who: 'craft', text: 'ты опять поправил мой чертёж?' },
        { who: 'code',  text: 'он был косой' },
        { who: 'craft', text: 'он был ТВОРЧЕСКИЙ', act: 'surprised' },
        { who: 'code',  text: 'и косой' },
        { who: 'craft', text: '.всё.' },
      ]},
    { id: 'toss.craft.ruler', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
      lines: [
        { who: 'code',  text: '3.14 см. отойди' },
        { who: 'craft', text: 'отойду? я?' },
        { who: 'code',  text: 'ты мешаешь замеру' },
        { who: 'craft', text: 'знаешь что ещё мешает' },
        { who: 'code',  text: 'что' },
        { who: 'craft', text: 'ничего. ты летишь.' },
      ]},
    { id: 'toss.craft.silent', tags: ['toss_intro:craft'], weight: 0.8, cooldown: 500,
      lines: [
        { who: 'craft', text: 'CODE' },
        { who: 'code',  text: 'что' },
        { who: 'craft', text: 'у меня идея' },
        { who: 'code',  text: 'ок' },
        { who: 'craft', text: 'ты не спросил какая', act: 'surprised' },
        { who: 'code',  text: '...какая' },
        { who: 'craft', text: 'поздно' },
      ]},

    // CODE loses patience and tosses CRAFT (calmer, more deliberate)
    { id: 'toss.code.noise', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
      lines: [
        { who: 'craft', text: 'ААААААА' },
        { who: 'code',  text: 'тише' },
        { who: 'craft', text: 'АААААА' },
        { who: 'code',  text: 'ладно.' },
      ]},
    { id: 'toss.code.plan', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
      lines: [
        { who: 'craft', text: '*лепит круглое*', act: 'typing' },
        { who: 'code',  text: 'должно быть квадратным' },
        { who: 'craft', text: 'нет' },
        { who: 'code',  text: 'проверь траекторию' },
        { who: 'craft', text: 'чью' },
        { who: 'code',  text: 'свою.' },
      ]},
    { id: 'toss.code.measurement', tags: ['toss_intro:code'], weight: 0.8, cooldown: 500,
      lines: [
        { who: 'code',  text: 'между нами стало 2 см' },
        { who: 'craft', text: 'это я подошёл' },
        { who: 'code',  text: 'нарушение протокола' },
        { who: 'craft', text: 'ой', act: 'surprised' },
        { who: 'code',  text: 'коррекция' },
      ]},

    // Gag one-liners the attacker shouts WHILE launching the victim.
    { id: 'toss_shout.craft.1', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
      lines: [{ who: 'craft', text: 'АЛЛЕ-ОП!' }] },
    { id: 'toss_shout.craft.2', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
      lines: [{ who: 'craft', text: 'ЛЕТИ' }] },
    { id: 'toss_shout.craft.3', tags: ['toss_shout:craft'], weight: 0.7, cooldown: 20,
      lines: [{ who: 'craft', text: '*хех*' }] },

    { id: 'toss_shout.code.1', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
      lines: [{ who: 'code', text: 'замер высоты' }] },
    { id: 'toss_shout.code.2', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
      lines: [{ who: 'code', text: 'параболический эксперимент' }] },
    { id: 'toss_shout.code.3', tags: ['toss_shout:code'], weight: 0.7, cooldown: 20,
      lines: [{ who: 'code', text: 'давай ещё раз' }] },

    // ─── CONTINUITY scenes — reference recent events ────
    // Played from the 'idle' tag but only when context makes them fit.
    // Higher weight than regular idle scenes so they bubble up after events.
    { id: 'idle.after_throw', tags: ['idle'], weight: 5, cooldown: 40,
      requires: (ctx) => ctx.flags.craft_airborne_recent || ctx.flags.code_airborne_recent,
      lines: [
        { who: 'craft', text: 'до сих пор укачивает' },
        { who: 'code',  text: 'очень понимаю' },
      ]},

    { id: 'idle.wary_after_throws', tags: ['idle'], weight: 4, cooldown: 180,
      requires: (ctx) => (ctx.flags.thrown_count || 0) >= 3,
      lines: [
        { who: 'craft', text: 'давай сегодня недалеко от пола' },
        { who: 'code',  text: 'высота — плохая идея' },
      ]},

    { id: 'idle.post_crash', tags: ['idle'], weight: 6, cooldown: 30,
      requires: (ctx) => ctx.flags.craft_landed_hard_recent || ctx.flags.code_landed_hard_recent,
      lines: [
        { who: 'code',  text: 'у меня ещё звенит' },
        { who: 'craft', text: 'у меня тоже' },
        { who: 'code',  text: 'постоим' },
      ]},

    { id: 'idle.tense', tags: ['idle'], weight: 3, cooldown: 90,
      requires: (ctx) => (ctx.flags.rapport ?? 50) < 30,
      lines: [
        { who: 'craft', text: 'ты сегодня странный' },
        { who: 'code',  text: 'ты всегда странный' },
        { who: 'craft', text: '...' },
      ]},

    { id: 'idle.warm', tags: ['idle'], weight: 2, cooldown: 180,
      requires: (ctx) => (ctx.flags.rapport ?? 50) > 70,
      lines: [
        { who: 'craft', text: 'мне нравится как мы работаем' },
        { who: 'code',  text: '*молча, но одобрительно*' },
      ]},

    // After an accent change, one follow-up dialogue is made available
    // (consumed by the effect so it plays only once per accent-change window).
    { id: 'accent.followup', tags: ['idle'], weight: 6, cooldown: 0,
      requires: (ctx) => ctx.flags.accent_changed_recent && !ctx.flags.accent_followup_done,
      effect: (ctx) => ctx.setFlag('accent_followup_done', 1, 180),
      lines: [
        { who: 'craft', text: 'этот тон ещё тёплый' },
        { who: 'code',  text: 'пигмент оседает' },
        { who: 'craft', text: 'он приживётся' },
      ]},

    { id: 'idle.annoyed_craft', tags: ['idle'], weight: 3, cooldown: 60,
      requires: (ctx) => ctx.flags.craft_annoyed,
      lines: [
        { who: 'craft', text: '*дуется*' },
        { who: 'code',  text: 'пройдёт' },
      ]},
    { id: 'idle.annoyed_code', tags: ['idle'], weight: 3, cooldown: 60,
      requires: (ctx) => ctx.flags.code_annoyed,
      lines: [
        { who: 'code',  text: 'я ещё раз пересчитаю' },
        { who: 'craft', text: 'всё, всё, я тихо' },
      ]},

    // ─── SCENE CHAINS — scene A sets flag, scene B follows up ─
    // Chain: building something
    { id: 'chain.build.open', tags: ['idle'], weight: 2, cooldown: 100,
      requires: (ctx) => !ctx.flags.chain_build,
      effect: (ctx) => ctx.setFlag('chain_build', 1, 120),
      lines: [
        { who: 'craft', text: 'что будем строить?' },
        { who: 'code',  text: 'сначала чертёж' },
        { who: 'craft', text: 'ок', act: 'typing' },
      ]},
    { id: 'chain.build.close', tags: ['idle'], weight: 8, cooldown: 30,
      requires: (ctx) => ctx.flags.chain_build,
      effect: (ctx) => { delete ctx.flags.chain_build; delete ctx.flagExpiry.chain_build; },
      lines: [
        { who: 'code',  text: 'ну что, чертёж?' },
        { who: 'craft', text: 'получается' },
        { who: 'code',  text: 'проверю пропорции', act: 'typing' },
        { who: 'craft', text: 'они... творческие' },
      ]},

    // Chain: the measurement
    { id: 'chain.measure.open', tags: ['idle'], weight: 1.5, cooldown: 120,
      requires: (ctx) => !ctx.flags.chain_measure,
      effect: (ctx) => ctx.setFlag('chain_measure', 1, 90),
      lines: [
        { who: 'code',  text: 'я что-то измерю' },
        { who: 'craft', text: 'что именно' },
        { who: 'code',  text: 'узнаешь потом', act: 'typing' },
      ]},
    { id: 'chain.measure.close', tags: ['idle'], weight: 8, cooldown: 30,
      requires: (ctx) => ctx.flags.chain_measure,
      effect: (ctx) => { delete ctx.flags.chain_measure; delete ctx.flagExpiry.chain_measure; },
      lines: [
        { who: 'craft', text: 'ну?' },
        { who: 'code',  text: 'ровно' },
        { who: 'craft', text: 'что ровно' },
        { who: 'code',  text: 'всё что должно быть ровно' },
      ]},
  ];

  // ── Dialogue engine ──────────────────────────────────
  const dialogue = {
    flags: { rapport: 50 },   // rapport 0-100; other flags set dynamically
    flagExpiry: {},           // { name: ts_ms when expires }
    cooldowns: {},            // { sceneId: earliestReplayTs_ms }
    history: [],              // last 32 played scenes

    setFlag(name, value, ttlSec) {
      this.flags[name] = value;
      if (ttlSec) this.flagExpiry[name] = performance.now() + ttlSec * 1000;
    },
    clearExpired() {
      const now = performance.now();
      for (const name in this.flagExpiry) {
        if (this.flagExpiry[name] <= now) {
          delete this.flags[name];
          delete this.flagExpiry[name];
        }
      }
    },
    pick(tag) {
      this.clearExpired();
      const now = performance.now();
      const candidates = SCENES.filter(s =>
        s.tags.includes(tag) &&
        (!this.cooldowns[s.id] || this.cooldowns[s.id] <= now) &&
        (!s.requires || s.requires(this))
      );
      if (!candidates.length) return null;
      const total = candidates.reduce((a, b) => a + (b.weight || 1), 0);
      let r = Math.random() * total;
      for (const c of candidates) {
        r -= (c.weight || 1);
        if (r <= 0) return c;
      }
      return candidates[candidates.length - 1];
    },
    play(scene) {
      this.cooldowns[scene.id] = performance.now() + ((scene.cooldown || 30) * 1000);
      this.history.push({ id: scene.id, t: performance.now() });
      if (this.history.length > 32) this.history.shift();
      if (scene.effect) try { scene.effect(this); } catch (_) {}
      return scene.lines;
    },
    // Map a scene's 'craft' placeholder lines to whoever the event is about,
    // so who-agnostic scenes can play for either character.
    resolveLines(lines, targetWho) {
      if (!targetWho) return lines;
      const other = targetWho === 'craft' ? 'code' : 'craft';
      return lines.map(l => ({
        ...l,
        who: l.who === 'craft' ? targetWho : (l.who === 'code' ? other : l.who),
      }));
    },
    // Rapport clamps 0-100. Events bump it; decays via scene count are implicit.
    adjustRapport(delta) {
      this.flags.rapport = Math.max(0, Math.min(100, (this.flags.rapport ?? 50) + delta));
    },
    // Central bookkeeping after any notable event.
    recordEvent(event, who) {
      switch (event) {
        case 'grab':
          this.setFlag(`${who}_grabbed_recent`, 1, 15);
          break;
        case 'throw':
          this.setFlag(`${who}_airborne_recent`, 1, 25);
          this.flags.thrown_count = (this.flags.thrown_count || 0) + 1;
          this.adjustRapport(-2);
          break;
        case 'land_soft':
          this.setFlag(`${who}_landed_recent`, 1, 20);
          this.adjustRapport(+1);
          break;
        case 'land_hard':
          this.setFlag(`${who}_landed_hard_recent`, 1, 45);
          this.adjustRapport(-1);
          break;
        case 'accent_change':
          this.setFlag('accent_changed_recent', 1, 60);
          break;
        case 'click_spam':
          this.setFlag(`${who}_annoyed`, 1, 40);
          this.adjustRapport(-1);
          break;
        case 'idle_play':
          this.adjustRapport(+1);  // sharing a moment bonds them
          break;
      }
    },
  };

  const companions = {
    els: {
      container: document.querySelector('.companions'),
      craft: document.querySelector('[data-who="craft"]'),
      code:  document.querySelector('[data-who="code"]'),
    },
    bubbles: {
      craft: document.getElementById('bubble-craft'),
      code:  document.getElementById('bubble-code'),
    },

    // ── Physics constants ──
    S: 48,              // companion size (matches CSS .companion width/height)
    SIDE_M: 6,          // horizontal margin from viewport edges
    FLOOR_M: 2,         // bottom margin (feet planted here on floor)
    GRAVITY: 1800,      // px/s² — gravitational pull
    WALK_SPEED: 40,     // px/s — reduced from perim-based (was ~0.006/frame)
    MAX_V: 2200,        // clamp on throw velocity
    BOUNCE: 0.35,       // damping on wall/ceiling hit
    FRICTION: 0.55,     // horizontal damping on floor impact

    // Per-character state (bottom-only; no wall/perim anymore)
    pos: {
      craft: { x: 80,  y: 0, vx: 0, vy: 0, facing: 'right', state: 'idle',
               grounded: false, walkTarget: null },
      code:  { x: 200, y: 0, vx: 0, vy: 0, facing: 'right', state: 'idle',
               grounded: false, walkTarget: null },
    },

    dialogueState: 'idle',
    muted: localStorage.getItem('craftcode-companions-muted') === '1',
    clickCounts: { craft: 0, code: 0 },
    queue: [],
    konamiBuffer: [],
    konamiCode: ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'],
    idleTimer: null,
    wanderTimer: null,
    thinkingTimer: null,
    tossTimer: null,
    clickResetTimer: null,
    pendingAction: null,   // queued scene-end action (e.g. { type: 'toss', attacker, victim })
    lastPicked: null,
    lastFrameTime: 0,

    // Active drag tracking: { who, pointerId, offsetX, offsetY, history: [{x,y,t}] }
    activeDrag: null,
    pointerMoved: false,       // was the current press a drag, or a click?

    // All physics coords are RELATIVE to the .companions container, which is
    // position:absolute + bottom:0 on <body>. So floorY is the container's
    // own inner height minus margin/sprite, NOT window.innerHeight.
    floorY() {
      const c = this.els.container;
      return (c ? c.clientHeight : 480) - this.FLOOR_M - this.S;
    },
    containerWidth() {
      const c = this.els.container;
      return c ? c.clientWidth : window.innerWidth;
    },

    init() {
      if (this.muted) this.applyMute();

      // Reparent the fx-layer and companions container directly under <body>
      // so `position: absolute; bottom: 0` anchors to the DOCUMENT, not
      // whatever positioned ancestor Astro/Starlight wrapped us in (like
      // the sticky <header>). DOM move is fine — refs to elements stay valid.
      const fxLayer = document.querySelector('.fx-layer');
      if (fxLayer && fxLayer.parentElement !== document.body) {
        document.body.appendChild(fxLayer);
      }
      if (this.els.container && this.els.container.parentElement !== document.body) {
        document.body.appendChild(this.els.container);
      }

      // Drop both on the floor at start
      this.pos.craft.x = 80;
      this.pos.craft.y = this.floorY();
      this.pos.craft.grounded = true;
      this.pos.code.x  = Math.min(200, this.containerWidth() - this.SIDE_M - this.S - 20);
      this.pos.code.y  = this.floorY();
      this.pos.code.grounded = true;
      this.applyPosition('craft');
      this.applyPosition('code');

      ['craft','code'].forEach(who => {
        const el = this.els[who];
        // Pointer events unify mouse + touch; we decide click vs drag on release
        el.addEventListener('pointerdown', (e) => this.onPointerDown(who, e));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.onClick(who);
          }
        });
      });
      document.addEventListener('pointermove',   (e) => this.onPointerMove(e));
      document.addEventListener('pointerup',     (e) => this.onPointerUp(e));
      document.addEventListener('pointercancel', (e) => this.onPointerUp(e));

      const muteBtn = document.querySelector('[data-toggle-mute]');
      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleMute();
        });
      }

      document.addEventListener('keydown', (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.konamiBuffer.push(key);
        if (this.konamiBuffer.length > this.konamiCode.length) {
          this.konamiBuffer = this.konamiBuffer.slice(-this.konamiCode.length);
        }
        if (this.konamiBuffer.length === this.konamiCode.length &&
            this.konamiBuffer.every((k, i) => k === this.konamiCode[i])) {
          this.konamiBuffer = [];
          this.triggerKonami();
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearTimeout(this.idleTimer);
          clearTimeout(this.wanderTimer);
          clearTimeout(this.thinkingTimer);
          clearTimeout(this.tossTimer);
        } else if (!this.muted) {
          if (this.dialogueState === 'idle') this.scheduleIdle(15000);
          this.scheduleWander(4000);
          this.scheduleThinking(20000);
          this.scheduleToss(70000);
        }
      });

      document.querySelectorAll('.demo-panel [data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.action;
          if (a === 'companions-wake')         this.wakeUp();
          if (a === 'companions-angry')        this.makeAngry();
          if (a === 'companions-think')        this.forceThink();
          if (a === 'companions-konami')       this.triggerKonami();
          if (a === 'companions-mute-toggle')  this.toggleMute();
        });
      });

      // Accent / theme change — they treat it as magical weather
      this.watchAccent();

      // Keep characters inside the viewport when it resizes
      window.addEventListener('resize', () => {
        this.clampToViewport();
        this.positionBubble('craft');
        this.positionBubble('code');
      });

      // Start physics RAF loop
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.tick.bind(this));

      if (!this.muted) {
        // Tighter opening cadence — something happens in the first 15 s so
        // returning readers aren't greeted by motionless robots.
        this.scheduleIdle(10000);
        this.scheduleWander(3000);
        this.scheduleThinking(18000);
        this.scheduleToss(55000);
      }
    },

    clampToViewport() {
      const floor = this.floorY();
      const maxX = this.containerWidth() - this.SIDE_M - this.S;
      ['craft','code'].forEach(who => {
        const p = this.pos[who];
        if (p.x > maxX) p.x = Math.max(this.SIDE_M, maxX);
        if (p.x < this.SIDE_M) p.x = this.SIDE_M;
        if (p.y > floor) { p.y = floor; p.grounded = true; p.vy = 0; }
        this.applyPosition(who);
      });
    },

    applyPosition(who) {
      const p = this.pos[who];
      this.els[who].style.left = p.x + 'px';
      this.els[who].style.top  = p.y + 'px';
      this.els[who].dataset.facing = p.facing;
    },

    setCharState(who, state) {
      const p = this.pos[who];
      p.state = state;
      this.els[who].dataset.state = state;
      ['walking','talking','surprised','sleeping','typing','waving','excited',
       'idea','thinking','falling','dragging'].forEach(cls => {
        this.els[who].classList.toggle(cls, cls === state);
      });
    },

    // ── Pointer drag + throw ──────────────────────
    onPointerDown(who, e) {
      if (this.muted) return;
      if (e.target.hasAttribute && e.target.hasAttribute('data-toggle-mute')) return;
      e.preventDefault();
      const el = this.els[who];
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      // All drag math happens in .companions container coords, not viewport.
      // Viewport deltas == container deltas, so velocity calc is unaffected.
      const local = this._toLocal(e.clientX, e.clientY);
      const rect = el.getBoundingClientRect();
      const elLocal = this._toLocal(rect.left, rect.top);
      this.activeDrag = {
        who,
        pointerId: e.pointerId,
        startX: local.x,
        startY: local.y,
        offsetX: local.x - elLocal.x,
        offsetY: local.y - elLocal.y,
        history: [{ x: local.x, y: local.y, t: performance.now() }],
      };
      this.pointerMoved = false;
    },

    onPointerMove(e) {
      if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;
      const d = this.activeDrag;
      const local = this._toLocal(e.clientX, e.clientY);
      // Upgrade to "drag" once pointer moved > 4 px
      if (!this.pointerMoved &&
          Math.hypot(local.x - d.startX, local.y - d.startY) > 4) {
        this.pointerMoved = true;
        const p = this.pos[d.who];
        p.vx = 0; p.vy = 0; p.grounded = false; p.walkTarget = null;
        this.setCharState(d.who, 'dragging');
        this.reactGrab(d.who);
      }
      if (this.pointerMoved) {
        const p = this.pos[d.who];
        p.x = local.x - d.offsetX;
        p.y = local.y - d.offsetY;
        this.applyPosition(d.who);
        d.history.push({ x: local.x, y: local.y, t: performance.now() });
        const cutoff = performance.now() - 80;
        while (d.history.length > 3 && d.history[0].t < cutoff) d.history.shift();
      }
    },

    _toLocal(clientX, clientY) {
      const r = this.els.container.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    },

    onPointerUp(e) {
      if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;
      const d = this.activeDrag;
      const p = this.pos[d.who];
      if (!this.pointerMoved) {
        // Treat as click
        this.activeDrag = null;
        this.onClick(d.who);
        return;
      }
      // Compute release velocity from recent history
      let vx = 0, vy = 0;
      if (d.history.length >= 2) {
        const first = d.history[0];
        const last  = d.history[d.history.length - 1];
        const dt = Math.max(0.016, (last.t - first.t) / 1000);
        vx = Math.max(-this.MAX_V, Math.min(this.MAX_V, (last.x - first.x) / dt));
        vy = Math.max(-this.MAX_V, Math.min(this.MAX_V, (last.y - first.y) / dt));
      }
      p.vx = vx; p.vy = vy;
      p.grounded = false;
      this.setCharState(d.who, 'falling');
      this.activeDrag = null;
      const speed = Math.hypot(vx, vy);
      if (speed > 400) this.reactThrow(d.who);
      else             this.reactSetdown(d.who);
    },

    // ── Walk (bottom-only) ────────────────────────
    wanderOne(who) {
      if (this.muted) return;
      const p = this.pos[who];
      if (p.state !== 'idle' || !p.grounded) return;
      const maxX = this.containerWidth() - this.SIDE_M - this.S;
      const nudge = (80 + Math.random() * 180) * (Math.random() < 0.5 ? 1 : -1);
      p.walkTarget = Math.max(this.SIDE_M, Math.min(maxX, p.x + nudge));
      p.facing = p.walkTarget > p.x ? 'right' : 'left';
      this.setCharState(who, 'walking');
    },

    // Imperative walk with a callback on arrival. Used by the toss action
    // (attacker walks up to victim, then throws).  Setting `sprint: true`
    // multiplies walk speed so cross-stage dashes don't take forever.
    walkTo(who, targetX, { sprint = false, onArrive = null } = {}) {
      const p = this.pos[who];
      const maxX = this.containerWidth() - this.SIDE_M - this.S;
      p.walkTarget = Math.max(this.SIDE_M, Math.min(maxX, targetX));
      p.facing = p.walkTarget > p.x ? 'right' : 'left';
      p._sprint = sprint;
      p._onArrive = onArrive;
      this.setCharState(who, 'walking');
    },

    scheduleWander(delay) {
      clearTimeout(this.wanderTimer);
      if (this.muted) return;
      // Tighter wander cadence — idle stillness was the #1 "dead" feeling.
      const d = delay !== undefined ? delay : 4000 + Math.random() * 7000;
      this.wanderTimer = setTimeout(() => {
        if (this.dialogueState === 'idle') {
          const who = Math.random() < 0.5 ? 'craft' : 'code';
          this.wanderOne(who);
        }
        this.scheduleWander();
      }, d);
    },

    // ── thinking-sequence (macro-state): Claude-style idle → "OH!" → sit & type → idle
    // Fires only when the character is genuinely idle; otherwise reschedules.
    scheduleThinking(delay) {
      clearTimeout(this.thinkingTimer);
      if (this.muted) return;
      const d = delay !== undefined ? delay : 30000 + Math.random() * 40000;
      this.thinkingTimer = setTimeout(() => {
        const who = Math.random() < 0.5 ? 'craft' : 'code';
        const p = this.pos[who];
        const otherState = this.pos[who === 'craft' ? 'code' : 'craft'].state;
        const canThink =
          !this.muted &&
          this.dialogueState === 'idle' &&
          p.state === 'idle' &&
          p.grounded &&
          otherState !== 'talking';
        if (canThink) this.runThinkingSequence(who);
        this.scheduleThinking();
      }, d);
    },

    // ── TOSS macro — dialogue that ends in one robot physically tossing
    // the other. A full scene plays first (intro), then actionToss fires:
    // attacker sprints up to the victim and launches them into the air.
    scheduleToss(delay) {
      clearTimeout(this.tossTimer);
      if (this.muted) return;
      // 80-170 s — rare enough to stay a gag, frequent enough to catch.
      const d = delay !== undefined ? delay : 80000 + Math.random() * 90000;
      this.tossTimer = setTimeout(() => {
        if (this.canToss()) {
          const attacker = Math.random() < 0.5 ? 'craft' : 'code';
          const victim   = attacker === 'craft' ? 'code' : 'craft';
          this.startTossScene(attacker, victim);
        }
        this.scheduleToss();
      }, d);
    },

    canToss() {
      return !this.muted &&
             this.dialogueState === 'idle' &&
             this.pos.craft.grounded && this.pos.code.grounded &&
             this.pos.craft.state === 'idle' && this.pos.code.state === 'idle' &&
             !this.activeDrag;
    },

    // Plays an argumentative intro, then (on scene end) fires actionToss.
    startTossScene(attacker, victim) {
      const scene = dialogue.pick(`toss_intro:${attacker}`);
      if (!scene) return;
      const lines = dialogue.play(scene);
      this.pendingAction = { type: 'toss', attacker, victim };
      this.playSequence(lines);
    },

    // Actual physical toss: attacker sprints to victim, winds up, launches.
    actionToss(attacker, victim) {
      const va = this.pos[attacker];
      const vv = this.pos[victim];
      if (!va.grounded || !vv.grounded) return;
      // Stand ~34 px to the near side of the victim
      const approach = vv.x + (va.x < vv.x ? -34 : +34);
      this.walkTo(attacker, approach, {
        sprint: true,
        onArrive: () => {
          va.facing = vv.x > va.x ? 'right' : 'left';
          this.applyPosition(attacker);
          // Wind-up pose
          this.setCharState(attacker, 'excited');
          setTimeout(() => {
            // LAUNCH: slight horizontal kick AWAY from attacker, big upward vy
            vv.grounded = false;
            const dir = vv.x > va.x ? 1 : -1;
            vv.vx = dir * (240 + Math.random() * 140);
            vv.vy = -1250 - Math.random() * 350;
            this.setCharState(victim, 'falling');
            dialogue.recordEvent('throw', victim);
            // Attacker's gag line + return to idle
            this.setCharState(attacker, 'idle');
            this.reactFromScene(`toss_shout:${attacker}`, attacker, 1500);
            // Victim yells while airborne (reuse existing throw pool)
            setTimeout(() => this.reactFromScene(`throw:${victim}`, victim, 1600), 220);
          }, 360);
        },
      });
    },

    runThinkingSequence(who) {
      // claude-code.gif-inspired macro:
      //   1) idea   — antenna grows (idea_a ↔ idea_b), ~900ms
      //   2) thinking — squat + laptop typing (think_a ↔ think_b), ~3s
      //   3) idle
      this.setCharState(who, 'idea');

      setTimeout(() => {
        if (this.pos[who].state !== 'idea') return;  // interrupted (click, wander, etc.)
        this.setCharState(who, 'thinking');

        if (Math.random() < 0.65 && this.dialogueState === 'idle') {
          const scene = dialogue.pick(`insight:${who}`);
          if (scene) {
            const line = dialogue.play(scene)[0];
            if (line) this.quickBubble(who, line.text, 2400);
          }
        }

        setTimeout(() => {
          if (this.pos[who].state === 'thinking') this.setCharState(who, 'idle');
        }, 3000);
      }, 900);
    },

    // Physics tick: gravity when airborne, walk toward target when grounded.
    tick(now) {
      const dt = Math.min(0.04, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      const floor = this.floorY();
      const maxX = this.containerWidth() - this.SIDE_M - this.S;
      const minX = this.SIDE_M;

      ['craft','code'].forEach(who => {
        const p = this.pos[who];
        // The one being actively dragged is positioned by onPointerMove
        if (this.activeDrag && this.activeDrag.who === who) return;

        if (!p.grounded) {
          p.vy += this.GRAVITY * dt;
          p.x  += p.vx * dt;
          p.y  += p.vy * dt;
          if (Math.abs(p.vx) > 20) p.facing = p.vx > 0 ? 'right' : 'left';
          // Walls — damped bounce keeps them inside the canvas
          if (p.x < minX)      { p.x = minX;  p.vx = -p.vx * this.BOUNCE; }
          else if (p.x > maxX) { p.x = maxX;  p.vx = -p.vx * this.BOUNCE; }
          if (p.y < 0)         { p.y = 0;     p.vy = Math.abs(p.vy) * this.BOUNCE; }
          // Floor hit
          if (p.y >= floor) {
            p.y = floor;
            const impactVy = p.vy;
            p.grounded = true; p.vy = 0;
            p.vx *= this.FRICTION;
            this.setCharState(who, 'idle');
            if (impactVy > 900)       this.reactLand(who, 'hard');
            else if (impactVy > 260)  this.reactLand(who, 'soft');
          }
          this.applyPosition(who);
          return;
        }

        // Grounded: walk toward walkTarget if set
        if (p.state === 'walking' && p.walkTarget !== null) {
          const dir = p.walkTarget > p.x ? 1 : -1;
          const step = (p._sprint ? this.WALK_SPEED * 2.5 : this.WALK_SPEED) * dt;
          const arrive = () => {
            p.walkTarget = null;
            p._sprint = false;
            const cb = p._onArrive; p._onArrive = null;
            this.setCharState(who, 'idle');
            if (cb) cb();
          };
          if (Math.abs(p.walkTarget - p.x) < step) {
            p.x = p.walkTarget; arrive();
          } else {
            p.x += step * dir;
            p.facing = dir > 0 ? 'right' : 'left';
            if (p.x < minX) { p.x = minX; arrive(); }
            if (p.x > maxX) { p.x = maxX; arrive(); }
          }
          this.applyPosition(who);
        }
      });
      requestAnimationFrame(this.tick.bind(this));
    },

    // ── Accent change watcher ─────────────────────
    watchAccent() {
      const getAccent = () =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      let last = getAccent();
      const check = () => {
        const now = getAccent();
        if (now && now !== last) {
          last = now;
          if (!this.muted) this.reactAccent();
        }
      };
      try {
        const obs = new MutationObserver(check);
        obs.observe(document.documentElement, { attributes: true });
        obs.observe(document.body,            { attributes: true });
      } catch (_) {}
      setInterval(check, 1200);  // fallback for CSS-var changes that don't mutate attrs
    },

    // ── FX emission (dust, sparkle, shock) ──────────────
    emitEffect(type, x, y, opts = {}) {
      const layer = document.querySelector('.fx-layer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'fx-' + type + (opts.big ? ' big' : '');
      if (type === 'sparkle') {
        el.textContent = '*';
        el.style.setProperty('--dx', (opts.dx || 0) + 'px');
        el.style.setProperty('--dy', (opts.dy || -20) + 'px');
      }
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      layer.appendChild(el);
      // Remove when animation ends (or after 1.5s fallback)
      const kill = () => { if (el.parentNode) el.parentNode.removeChild(el); };
      el.addEventListener('animationend', kill, { once: true });
      setTimeout(kill, 1500);
    },

    // Bursts a fan of sparkles at a point (useful for waving/excited).
    emitSparkleBurst(x, y, count = 4) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2) * (i / count) + Math.random() * 0.8;
        const dist = 18 + Math.random() * 14;
        this.emitEffect('sparkle', x, y, {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 10,
        });
      }
    },

    // Dust at the FEET of the companion. .fx-dust has transform-origin:
    // bottom-center, so we align the element's BOTTOM edge with the
    // character's floor-line. Element is 10 px tall → top = bottom - 10.
    emitDustAtFeet(who, big) {
      const rect = this.els[who].getBoundingClientRect();
      this.emitEffect('dust', rect.left + rect.width / 2 - 15, rect.bottom - 10, { big });
    },

    // Shock ring centred exactly on the floor line under the feet.
    emitShockAtFeet(who) {
      const rect = this.els[who].getBoundingClientRect();
      this.emitEffect('shock', rect.left + rect.width / 2, rect.bottom - 2);
    },

    // Shake only the .companions container, and only if it's on screen.
    // This prevents the page layout from jittering when a character crashes
    // while the reader is scrolled far from the bottom of the doc.
    screenShake() {
      const c = this.els.container;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < window.innerHeight;
      if (!inView) return;
      c.classList.remove('fx-shake');
      void c.offsetWidth;    // re-trigger animation
      c.classList.add('fx-shake');
      setTimeout(() => c.classList.remove('fx-shake'), 300);
    },

    // ── Quick reaction helpers ──────────────────────────
    quickBubble(who, text, holdMs) {
      const bubble = this.bubbles[who];
      while (bubble.firstChild) bubble.removeChild(bubble.firstChild);
      const whoEl = document.createElement('span');
      whoEl.className = 'who'; whoEl.textContent = who + ':';
      const textEl = document.createElement('span');
      textEl.className = 'text'; textEl.textContent = text;
      bubble.appendChild(whoEl); bubble.appendChild(textEl);
      bubble.classList.add('visible');
      this.positionBubble(who);
      clearTimeout(bubble._hideTimer);
      bubble._hideTimer = setTimeout(() => bubble.classList.remove('visible'), holdMs);
    },

    // Shift a visible bubble horizontally so it never clips the viewport.
    // Writes to --bubble-x; the CSS ::after tail compensates to keep pointing
    // at the companion. Safe to call repeatedly (e.g. during typewriter).
    positionBubble(who) {
      const bubble = this.bubbles[who];
      if (!bubble || !bubble.classList.contains('visible')) return;
      bubble.style.setProperty('--bubble-x', '0px');
      const r = bubble.getBoundingClientRect();
      const pad = 10;
      let shift = 0;
      if (r.left < pad) shift = pad - r.left;
      else if (r.right > window.innerWidth - pad) {
        shift = (window.innerWidth - pad) - r.right;
      }
      if (shift !== 0) bubble.style.setProperty('--bubble-x', `${shift}px`);
    },

    // Play a single-line reaction via the scene engine.
    // For who-agnostic tags (grab:X, throw:X, land_*:X, setdown:X), lines
    // are templated with 'craft' and get remapped to the actual `who`.
    // For partner_on_X scenes, the scene already names the correct speaker
    // (e.g. {who:'code'} in partner_on_throw:craft) — SKIP remap.
    reactFromScene(tag, remapWho, holdMs) {
      const scene = dialogue.pick(tag);
      if (!scene) return false;
      const rawLines = dialogue.play(scene);
      const lines = tag.startsWith('partner_on_')
        ? rawLines
        : dialogue.resolveLines(rawLines, remapWho);
      const line = lines[0];
      if (!line) return false;
      this.quickBubble(line.who, line.text, holdMs || 1400);
      if (line.act) this.applyLineAct(line.who, line.act, 650);
      return true;
    },

    // Apply a short-lived animation state for a single line.
    applyLineAct(who, act, durationMs) {
      const p = this.pos[who];
      if (!p.grounded) return;
      const prev = p.state;
      this.setCharState(who, act);
      // FX hook: sparkle on wave/excited
      if (act === 'wave' || act === 'excited') {
        const rect = this.els[who].getBoundingClientRect();
        this.emitSparkleBurst(rect.left + rect.width / 2, rect.top + 8, 4);
      }
      setTimeout(() => {
        if (this.pos[who].state === act) this.setCharState(who, prev === act ? 'idle' : prev);
      }, durationMs);
    },

    // When A does something, B may react with a one-liner from 'partner_on_X:A'.
    maybePartnerReact(event, who, delay = 450) {
      const other = who === 'craft' ? 'code' : 'craft';
      if (!this.pos[other].grounded) return;
      if (this.dialogueState === 'talking') return;
      setTimeout(() => {
        if (this.pos[other].grounded && this.pos[other].state === 'idle' &&
            this.dialogueState === 'idle') {
          this.reactFromScene(`partner_on_${event}:${who}`, other, 1400);
        }
      }, delay);
    },

    reactGrab(who) {
      dialogue.recordEvent('grab', who);
      this.reactFromScene(`grab:${who}`, who, 1400);
    },
    reactThrow(who) {
      dialogue.recordEvent('throw', who);
      this.reactFromScene(`throw:${who}`, who, 1500);
      this.maybePartnerReact('throw', who, 650);
    },
    reactLand(who, kind) {
      // Dust puff and maybe shock ring at feet
      this.emitDustAtFeet(who, kind === 'hard');
      if (kind === 'hard') {
        this.emitShockAtFeet(who);
        this.screenShake();
      }
      dialogue.recordEvent(kind === 'hard' ? 'land_hard' : 'land_soft', who);
      this.reactFromScene(`land_${kind}:${who}`, who, 1400);
      if (kind === 'hard') {
        this.setCharState(who, 'surprised');
        setTimeout(() => {
          if (this.pos[who].state === 'surprised') this.setCharState(who, 'idle');
        }, 700);
        // Partner dialogue scene (not just bubble) after a crash
        this.maybePartnerLandScene(who, 1000);
      }
    },
    reactSetdown(who) {
      this.reactFromScene(`setdown:${who}`, who, 1200);
    },
    reactAccent() {
      if (this.dialogueState === 'talking') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      dialogue.recordEvent('accent_change');
      const scene = dialogue.pick('accent');
      if (!scene) return;
      clearTimeout(this.idleTimer);
      this.playSequence(dialogue.play(scene));
    },

    // Partner reacts to a crash with a full dialogue scene (not just a bubble).
    maybePartnerLandScene(who, delay) {
      const other = who === 'craft' ? 'code' : 'craft';
      setTimeout(() => {
        if (this.muted) return;
        if (this.dialogueState === 'talking') return;
        if (!this.pos[other].grounded || !this.pos[who].grounded) return;
        const scene = dialogue.pick(`partner_on_land_hard:${who}`);
        if (scene) {
          clearTimeout(this.idleTimer);
          this.playSequence(dialogue.play(scene));
        }
      }, delay);
    },

    // ── dialogue ──────────────────────────────────
    scheduleIdle(delay) {
      clearTimeout(this.idleTimer);
      if (this.muted) return;
      // Much shorter than before (was 90-150 s) — they chatter often so the
      // stage doesn't feel dead between macro events.
      const d = delay !== undefined ? delay : 22000 + Math.random() * 28000;
      this.idleTimer = setTimeout(() => this.startIdle(), d);
    },

    startIdle() {
      if (this.muted || this.dialogueState !== 'idle') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      const scene = dialogue.pick('idle');
      if (!scene) return;                 // nothing fits context right now
      dialogue.recordEvent('idle_play');
      this.playSequence(dialogue.play(scene));
    },

    playSequence(seq) {
      this.dialogueState = 'talking';
      this.queue = [...seq];
      this.playNext();
    },

    playNext() {
      if (!this.queue.length) {
        this.dialogueState = 'idle';
        // If a scene queued up an after-action (like a toss), run it now.
        if (this.pendingAction) {
          const a = this.pendingAction;
          this.pendingAction = null;
          if (a.type === 'toss') {
            // Short beat so the last line finishes clearing before action fires
            setTimeout(() => this.actionToss(a.attacker, a.victim), 300);
          }
        }
        this.scheduleIdle();
        return;
      }
      const line = this.queue.shift();
      this.showBubble(line.who, line.text, () => {
        setTimeout(() => this.playNext(), 650);
      }, line);                          // pass the full line so showBubble can read .act/.hold
    },

    // line object shape: { who, text, act?, hold? }
    showBubble(who, text, onDone, line) {
      const bubble = this.bubbles[who];
      const otherWho = who === 'craft' ? 'code' : 'craft';
      const other = this.bubbles[otherWho];
      other.classList.remove('visible');
      if (this.pos[otherWho].state === 'talking') this.setCharState(otherWho, 'idle');

      while (bubble.firstChild) bubble.removeChild(bubble.firstChild);
      const whoEl = document.createElement('span');
      whoEl.className = 'who';
      whoEl.textContent = who + ':';
      const textEl = document.createElement('span');
      textEl.className = 'text';
      bubble.appendChild(whoEl);
      bubble.appendChild(textEl);

      bubble.classList.add('visible');
      this.positionBubble(who);
      // Face toward listener (only when grounded — don't override airborne state)
      const mine = this.pos[who];
      const their = this.pos[otherWho];
      mine.facing = their.x > mine.x ? 'right' : 'left';
      this.applyPosition(who);

      // Line.act takes precedence: if set, go into that state for the line duration.
      // Otherwise go into 'talking' as usual.
      const act = line && line.act;
      if (mine.grounded) {
        if (act) {
          this.setCharState(who, act);
          // Sparkle FX for wave/excited at head
          if (act === 'wave' || act === 'excited') {
            const rect = this.els[who].getBoundingClientRect();
            this.emitSparkleBurst(rect.left + rect.width / 2, rect.top + 8, 4);
          }
        } else if (mine.state === 'idle') {
          this.setCharState(who, 'talking');
        }
      }

      let i = 0;
      const type = () => {
        if (i >= text.length) {
          // Restore idle after the typewriter finishes (but only if we changed state)
          if (mine.grounded && (mine.state === 'talking' || mine.state === act)) {
            this.setCharState(who, 'idle');
          }
          const holdMs = (line && line.hold) || 1600 + text.length * 30;
          setTimeout(() => {
            bubble.classList.remove('visible');
            onDone();
          }, holdMs);
          return;
        }
        textEl.textContent += text[i++];
        this.positionBubble(who);            // re-fit as text grows
        setTimeout(type, 42 + Math.random() * 28);
      };
      setTimeout(type, 130);
    },

    onClick(who) {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      if (!this.pos[who].grounded) return;      // ignore clicks while airborne

      this.clickCounts[who] = (this.clickCounts[who] || 0) + 1;
      clearTimeout(this.idleTimer);

      const responses = DIALOGUES[`click_${who}`];
      const idx = Math.min(this.clickCounts[who] - 1, responses.length - 1);
      const text = responses[idx];

      if (this.clickCounts[who] >= 5) {
        this.setCharState(who, 'surprised');
        setTimeout(() => {
          if (this.pos[who].state === 'surprised') this.setCharState(who, 'idle');
        }, 900);
      }

      this.playSequence([{ who, text }]);

      clearTimeout(this.clickResetTimer);
      this.clickResetTimer = setTimeout(() => { this.clickCounts[who] = 0; }, 5000);
    },

    triggerKonami() {
      if (this.muted) return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      clearTimeout(this.idleTimer);
      this.setCharState('craft', 'waving');
      this.setCharState('code',  'waving');
      const k = dialogue.pick('konami');
      if (k) this.playSequence(dialogue.play(k));
      setTimeout(() => {
        if (this.pos.craft.state === 'waving') this.setCharState('craft', 'idle');
        if (this.pos.code.state  === 'waving') this.setCharState('code',  'idle');
      }, 4500);
    },

    wakeUp() {
      if (this.muted) { this.toggleMute(); return; }
      clearTimeout(this.idleTimer);
      if (this.dialogueState === 'talking') return;
      this.startIdle();
    },

    forceThink() {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      const who = Math.random() < 0.5 ? 'craft' : 'code';
      const p = this.pos[who];
      if (!p.grounded) return;
      if (p.state !== 'idle') this.setCharState(who, 'idle');
      this.runThinkingSequence(who);
    },

    makeAngry() {
      if (this.muted) return;
      if (this.dialogueState === 'talking') return;
      if (!this.pos.craft.grounded || !this.pos.code.grounded) return;
      this.setCharState('craft', 'surprised');
      this.setCharState('code',  'surprised');
      setTimeout(() => {
        if (this.pos.craft.state === 'surprised') this.setCharState('craft', 'idle');
        if (this.pos.code.state  === 'surprised') this.setCharState('code',  'idle');
      }, 900);
      // Magical "something shifted" vibe — no 4th-wall anger.
      this.playSequence([
        { who: 'craft', text: 'ты тоже это слышал?' },
        { who: 'code',  text: 'что-то шевельнулось' },
        { who: 'craft', text: 'прячемся' },
      ]);
    },

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('craftcode-companions-muted', this.muted ? '1' : '0');
      if (this.muted) {
        this.applyMute();
      } else {
        document.body.classList.remove('companions-muted');
        this.scheduleWander(5000);
        this.scheduleThinking(25000);
        this.scheduleToss(80000);
        const u = dialogue.pick('unmuted');
        if (u) this.playSequence(dialogue.play(u));
      }
    },

    applyMute() {
      document.body.classList.add('companions-muted');
      clearTimeout(this.idleTimer);
      clearTimeout(this.wanderTimer);
      clearTimeout(this.thinkingTimer);
      clearTimeout(this.tossTimer);
      this.queue = [];
      this.pendingAction = null;
      this.dialogueState = 'idle';
      // Snap both to the floor so muted state is stable
      const floor = this.floorY();
      ['craft','code'].forEach(who => {
        const p = this.pos[who];
        p.vx = 0; p.vy = 0; p.walkTarget = null;
        if (p.y < floor) p.y = floor;
        p.grounded = true;
        this.applyPosition(who);
        this.setCharState(who, 'idle');
      });
      Object.values(this.bubbles).forEach(b => b.classList.remove('visible'));
    },
  };

  companions.init();

  // Expose for devtools / automated checks. Harmless in prod.
  if (typeof window !== 'undefined') {
    window.__companions = companions;
    window.__dialogue = dialogue;
    window.__SCENES = SCENES;
  }
