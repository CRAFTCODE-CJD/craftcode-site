// ════════════════════════════════════════════════════
//  CraftCode companions — dialogue scene database
// ════════════════════════════════════════════════════
//  Each scene is a typed object. The engine picks by tag, respects
//  cooldowns, weighs by `weight`, gates by `requires(ctx)`, and may
//  mutate shared flags via `effect(ctx)`.
//
//  Scene schema:
//    id        — unique string (cooldown/history tracking)
//    tags      — string[] (e.g. 'idle', 'grab:craft', 'partner_on_throw:craft')
//    weight    — number (default 1; higher = more likely within tier)
//    cooldown  — seconds (default 30; scene can't replay sooner)
//    requires  — (ctx) => bool  (optional predicate)
//    effect    — (ctx) => void  (optional side-effect on play)
//    lines     — [{ who, text, act?, clip?, hold? }]
//      • act   — legacy state: 'wave' | 'surprised' | 'excited' | 'typing'
//      • clip  — rich clip name from CLIPS registry (plays alongside act)
//      • hold  — extra ms to keep the bubble up after typewriter finishes
//
//  LORE & CHARACTER BIBLE
//  (Полный лор: LORE.md в корне репо. Здесь — рабочая шпаргалка.)
//
//  🎭 CRAFT — розовый пиксель-энтузиаст. Любит Paper2D, круглые фаски,
//             бросается в идеи головой вперёд, часто не дочитывает доку.
//             Говорит слэнгом: "крч", "lol", "brb". Ломает pivot'ы.
//  🧊 CODE  — жёлтый инженер. Atlas-минималист, считает миллиметры и кадры,
//             сухой юмор, иногда выдаёт бинарное "01". Фиксит за CRAFT.
//  ⚖️ Вместе: пилят «Чертёж № 7» — их Магнум Опус (вероятно, спрайт-атлас).
//             Никакой четвёртой стены: drag/throw = "сквозняк", смена темы =
//             "слой перекрасили", баги = "шум", UE crash = "Tick() умер".
// ════════════════════════════════════════════════════

export const SCENES = [
  // ─── IDLE chatter ────────────────────────────────────
  { id: 'idle.build_idea', tags: ['idle'], weight: 3, cooldown: 80,
    lines: [
      { who: 'craft', text: 'крч, придумал новый спрайт' },
      { who: 'code',  text: 'pivot где' },
      { who: 'craft', text: 'в голове', act: 'excited' },
      { who: 'code',  text: 'опять уедет' },
    ]},

  { id: 'idle.sculpt_air', tags: ['idle'], weight: 2, cooldown: 100,
    lines: [
      { who: 'craft', text: '*лепит меш в воздухе*', act: 'typing' },
      { who: 'code',  text: 'это че' },
      { who: 'craft', text: 'угол' },
      { who: 'code',  text: 'в нём 91 градус. normals плачут' },
      { who: 'craft', text: 'я художник, я так вижу' },
    ]},

  { id: 'idle.measure_me', tags: ['idle'], weight: 2, cooldown: 90,
    lines: [
      { who: 'code',  text: 'между нами ровно 3.14 UE-юнита' },
      { who: 'craft', text: 'только что было пять' },
      { who: 'code',  text: 'ты подполз. vx > 0' },
    ]},

  { id: 'idle.breathing', tags: ['idle'], weight: 1, cooldown: 180,
    lines: [
      { who: 'code',  text: 'ты в Tick() сейчас?' },
      { who: 'craft', text: 'вроде да' },
      { who: 'code',  text: 'отпишись' },
      { who: 'craft', text: '...' },
      { who: 'code',  text: 'ок, дыши дальше' },
    ]},

  { id: 'idle.what_are_we', tags: ['idle'], weight: 2, cooldown: 140,
    lines: [
      { who: 'craft', text: 'а мы вообще для чего?' },
      { who: 'code',  text: 'для атласа' },
      { who: 'craft', text: 'какого' },
      { who: 'code',  text: 'этого вот всего', act: 'surprised' },
      { who: 'craft', text: '*оглядывается, видит UV*' },
    ]},

  { id: 'idle.redo_it', tags: ['idle'], weight: 2, cooldown: 100,
    lines: [
      { who: 'code',  text: 'надо ребилд' },
      { who: 'craft', text: 'чего' },
      { who: 'code',  text: 'я ещё не решил. но надо' },
      { who: 'craft', text: 'звучит как пятница' },
    ]},

  { id: 'idle.draft_sketch', tags: ['idle'], weight: 2, cooldown: 120,
    lines: [
      { who: 'craft', text: 'щас набросаю спрайт — глянешь' },
      { who: 'code',  text: 'я возьму линейку и grid snap' },
      { who: 'craft', text: 'только без snap!', act: 'surprised' },
      { who: 'code',  text: 'поздно. уже 16x16' },
    ]},

  { id: 'idle.small_victory', tags: ['idle'], weight: 1, cooldown: 150,
    lines: [
      { who: 'code',  text: 'вчера я подровнял край атласа' },
      { who: 'craft', text: 'какой' },
      { who: 'code',  text: 'не помню какой' },
      { who: 'craft', text: 'но ты помнишь чувство' },
      { who: 'code',  text: 'да. -42 пикселя впустую' },
    ]},

  { id: 'idle.listen_quiet', tags: ['idle'], weight: 1, cooldown: 140,
    lines: [
      { who: 'craft', text: 'слышишь как тишина звенит?' },
      { who: 'code',  text: 'это не тишина. это GPU fan' },
      { who: 'craft', text: 'красиво звучит' },
    ]},

  { id: 'idle.count_something', tags: ['idle'], weight: 1, cooldown: 140,
    lines: [
      { who: 'code',  text: 'давай посчитаем' },
      { who: 'craft', text: 'что' },
      { who: 'code',  text: 'drawcalls' },
      { who: 'craft', text: 'один' },
      { who: 'code',  text: 'уже слишком много' },
    ]},

  { id: 'idle.valentin', tags: ['idle'], weight: 0.8, cooldown: 400,
    lines: [
      { who: 'craft', text: 'назовём этот камень?' },
      { who: 'code',  text: 'каким неймингом' },
      { who: 'craft', text: 'любым' },
      { who: 'code',  text: 'Валентин_FINAL_v2' },
      { who: 'craft', text: '...почему v2' },
      { who: 'code',  text: 'будет v3. всегда так' },
    ],
    effect: (ctx) => ctx.setFlag('valentin_mentioned', 1, 600) },

  { id: 'idle.valentin_callback', tags: ['idle'], weight: 3, cooldown: 900,
    requires: (ctx) => !!ctx.flags.valentin_mentioned,
    lines: [
      { who: 'craft', text: 'а где Валентин?' },
      { who: 'code',  text: 'в /Assets/_old/' },
      { who: 'craft', text: 'ну хоть живой' },
    ]},

  { id: 'idle.tiny_wave', tags: ['idle'], weight: 1.2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'потренирую анимацию', act: 'wave' },
      { who: 'code',  text: 'сколько кадров' },
      { who: 'craft', text: 'четыре' },
      { who: 'code',  text: 'убедительно. как Paper2D в 2014' },
    ]},

  { id: 'idle.you_tired', tags: ['idle'], weight: 1, cooldown: 160,
    lines: [
      { who: 'code',  text: 'ты сегодня тише' },
      { who: 'craft', text: 'мыслю' },
      { who: 'code',  text: 'о?' },
      { who: 'craft', text: 'NDA' },
    ]},

  { id: 'idle.both_stare', tags: ['idle'], weight: 0.7, cooldown: 240,
    lines: [
      { who: 'craft', text: '*смотрит вдаль*' },
      { who: 'code',  text: '*смотрит в тот же viewport*' },
      { who: 'craft', text: 'что там' },
      { who: 'code',  text: 'level streaming. ничего интересного' },
    ]},

  // ─── NEW IDLE — game-dev flavour ─────────────────────
  { id: 'idle.tick_dead', tags: ['idle'], weight: 2, cooldown: 120,
    lines: [
      { who: 'craft', text: 'чёт Tick() подвисает' },
      { who:  'code', text: 'ты в BeginPlay залип' },
      { who: 'craft', text: 'а, точно. brb' },
    ]},

  { id: 'idle.atlas_full', tags: ['idle'], weight: 2, cooldown: 150,
    lines: [
      { who:  'code', text: 'атлас забит под потолок' },
      { who: 'craft', text: 'ещё один спрайт влезет?' },
      { who:  'code', text: 'только если ты станешь 2x2' },
      { who: 'craft', text: 'ставлю downscale', act: 'typing' },
    ]},

  { id: 'idle.pivot_gone', tags: ['idle'], weight: 2, cooldown: 130,
    lines: [
      { who: 'craft', text: 'чёт pivot опять уехал' },
      { who:  'code', text: 'куда' },
      { who: 'craft', text: 'куда-то в (0, -∞)' },
      { who:  'code', text: 'романтично' },
    ]},

  { id: 'idle.paper2d_flex', tags: ['idle'], weight: 1, cooldown: 200,
    lines: [
      { who: 'craft', text: 'Paper2D всё-таки живёт' },
      { who:  'code', text: 'живёт. просто тихо' },
      { who: 'craft', text: 'как мы по субботам' },
    ]},

  { id: 'idle.blueprint_spaghetti', tags: ['idle'], weight: 1.5, cooldown: 160,
    lines: [
      { who: 'craft', text: 'глянь мой блюпринт' },
      { who:  'code', text: '*молча отключает монитор*' },
      { who: 'craft', text: 'ну и ладно, lol' },
    ]},

  { id: 'idle.lightmap_bake', tags: ['idle'], weight: 1, cooldown: 300,
    lines: [
      { who:  'code', text: 'lightmap печётся. 47 минут' },
      { who: 'craft', text: 'кофе?' },
      { who:  'code', text: 'два' },
    ]},

  { id: 'idle.fps_drop', tags: ['idle'], weight: 1.5, cooldown: 150,
    lines: [
      { who: 'craft', text: 'у меня 24 fps' },
      { who:  'code', text: 'это кинематографично' },
      { who: 'craft', text: 'это страдание' },
    ]},

  { id: 'idle.git_blame', tags: ['idle'], weight: 1, cooldown: 180,
    lines: [
      { who:  'code', text: 'git blame показал тебя' },
      { who: 'craft', text: 'ложь и инсинуации' },
      { who:  'code', text: 'commit "wip fix wip"' },
      { who: 'craft', text: '...ок это я' },
    ]},

  { id: 'idle.npe', tags: ['idle'], weight: 1, cooldown: 120,
    lines: [
      { who: 'craft', text: 'nullptr поймал' },
      { who:  'code', text: 'классика' },
      { who: 'craft', text: 'я его отпустил' },
      { who:  'code', text: 'он вернётся' },
    ]},

  { id: 'idle.hot_reload', tags: ['idle'], weight: 1.2, cooldown: 140,
    lines: [
      { who:  'code', text: 'hot reload' },
      { who: 'craft', text: 'не надо' },
      { who:  'code', text: 'уже' },
      { who: 'craft', text: '*экран потух*' },
    ]},

  { id: 'idle.todo_forever', tags: ['idle'], weight: 1, cooldown: 220,
    lines: [
      { who: 'craft', text: '// TODO: fix later' },
      { who:  'code', text: 'дата комита?' },
      { who: 'craft', text: '2019' },
      { who:  'code', text: 'later уже прошёл' },
    ]},

  { id: 'idle.uv_island', tags: ['idle'], weight: 1, cooldown: 240,
    lines: [
      { who: 'craft', text: 'UV-остров уплыл' },
      { who:  'code', text: 'поймай за угол' },
      { who: 'craft', text: 'он без углов' },
      { who:  'code', text: 'ты его круглым нарисовал' },
    ]},

  { id: 'idle.engine_version', tags: ['idle'], weight: 0.8, cooldown: 400,
    lines: [
      { who: 'craft', text: 'UE 5.5 вышел?' },
      { who:  'code', text: '5.6' },
      { who: 'craft', text: 'мы на 5.2' },
      { who:  'code', text: 'я знаю' },
    ]},

  { id: 'idle.shipping_build', tags: ['idle'], weight: 0.8, cooldown: 300,
    lines: [
      { who:  'code', text: 'shipping собирается' },
      { who: 'craft', text: 'сколько' },
      { who:  'code', text: '3 часа' },
      { who: 'craft', text: 'brb, кушать' },
    ]},

  // ─── CLICK responses ─────────────────────────────────
  { id: 'click.craft.1',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'хэй' }] },
  { id: 'click.craft.2',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'коллайдер же' }] },
  { id: 'click.craft.3',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'щекотно lol' }] },
  { id: 'click.craft.4',  tags: ['click:craft'], weight: 0.8, cooldown: 6,
    lines: [{ who: 'craft', text: '*поёжился в 1 кадр*', act: 'surprised' }] },
  { id: 'click.craft.spam', tags: ['click:craft'], weight: 2, cooldown: 12,
    requires: (ctx) => (ctx.flags.craft_click_count || 0) >= 4,
    lines: [{ who: 'craft', text: 'СТОП, я не кнопка', act: 'surprised' }] },

  { id: 'click.code.1', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'input зафиксирован' }] },
  { id: 'click.code.2', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'tap @ (x,y)' }] },
  { id: 'click.code.3', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'и это был... клик' }] },
  { id: 'click.code.4', tags: ['click:code'], weight: 0.7, cooldown: 8,
    lines: [{ who: 'code', text: '*молчит в 01010*' }] },
  { id: 'click.code.spam', tags: ['click:code'], weight: 2, cooldown: 12,
    requires: (ctx) => (ctx.flags.code_click_count || 0) >= 4,
    lines: [{ who: 'code', text: 'rate limit превышен', act: 'surprised' }] },

  // ─── GRAB reactions ─────────────────────────────────
  { id: 'grab.craft.1', tags: ['grab:craft'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'ОЙ' }] },
  { id: 'grab.craft.2', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'ЛЕЧУ?!' }] },
  { id: 'grab.craft.3', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'zero-g mode!' }] },
  { id: 'grab.craft.4', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'аа, teleport' }] },
  { id: 'grab.craft.5', tags: ['grab:craft'], weight: 0.6, cooldown: 12,
    lines: [{ who: 'craft', text: 'лапы, лапы, это asset!' }] },

  { id: 'grab.code.1', tags: ['grab:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'code', text: 'координаты плывут' }] },
  { id: 'grab.code.2', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'Y++' }] },
  { id: 'grab.code.3', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'не ронять. я prefab' }] },
  { id: 'grab.code.4', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'отпусти на floor_01' }] },
  { id: 'grab.code.5', tags: ['grab:code'], weight: 0.6, cooldown: 12,
    lines: [{ who: 'code', text: 'это precision hardware' }] },

  // ─── THROW reactions ─────────────────────────────────
  { id: 'throw.craft.1', tags: ['throw:craft'], weight: 2, cooldown: 3,
    lines: [{ who: 'craft', text: 'ЛЕЧУУУУ' }] },
  { id: 'throw.craft.2', tags: ['throw:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'я RAGDOLL!' }] },
  { id: 'throw.craft.3', tags: ['throw:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'не по чертежу!' }] },
  { id: 'throw.craft.4', tags: ['throw:craft'], weight: 0.7, cooldown: 12,
    lines: [{ who: 'craft', text: 'ВАУ parabola' }] },

  { id: 'throw.code.1', tags: ['throw:code'], weight: 2, cooldown: 3,
    lines: [{ who: 'code', text: 'velocity: избыточна' }] },
  { id: 'throw.code.2', tags: ['throw:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'trajectory = NaN' }] },
  { id: 'throw.code.3', tags: ['throw:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'я не подписывал release form' }] },
  { id: 'throw.code.4', tags: ['throw:code'], weight: 0.7, cooldown: 12,
    lines: [{ who: 'code', text: 'inertia подхватила' }] },

  // ─── PARTNER reactions ──────────────────────────────
  { id: 'partner.code_sees_craft_flying', tags: ['partner_on_throw:craft'], weight: 2, cooldown: 6,
    lines: [{ who: 'code', text: 'CRAFT?! У тебя wings нет', act: 'surprised' }] },
  { id: 'partner.code_measures_flight', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'любопытный arc' }] },
  { id: 'partner.code_calls_craft', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'возвращайся в prefab' }] },
  { id: 'partner.code_shrug', tags: ['partner_on_throw:craft'], weight: 0.8, cooldown: 15,
    lines: [{ who: 'code', text: '*логирует высоту в csv*', act: 'typing' }] },

  { id: 'partner.craft_sees_code_flying', tags: ['partner_on_throw:code'], weight: 2, cooldown: 6,
    lines: [{ who: 'craft', text: 'CODE!!', act: 'surprised' }] },
  { id: 'partner.craft_cheers_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'ты ЛЕТИШЬ! как птица gltf!' }] },
  { id: 'partner.craft_worry_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'не garbage-collect его!' }] },

  { id: 'partner.code_check_craft', tags: ['partner_on_land_hard:craft'], weight: 2, cooldown: 8,
    lines: [
      { who: 'code',  text: 'ты цел? хитбоксы?', act: 'surprised' },
      { who: 'craft', text: 'угу. только pride минус десять' },
      { who: 'code',  text: 'это не по чертежу' },
    ]},
  { id: 'partner.craft_check_code', tags: ['partner_on_land_hard:code'], weight: 2, cooldown: 8,
    lines: [
      { who: 'craft', text: 'CODE?', act: 'surprised' },
      { who: 'code',  text: 'углы integrity OK' },
      { who: 'craft', text: 'фух' },
    ]},

  // ─── LANDING ─────────────────────────────────────────
  { id: 'land_soft.1', tags: ['land_soft:craft','land_soft:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'уф' }] },
  { id: 'land_soft.2', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: '*обнуляет velocity*' }] },
  { id: 'land_soft.3', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'touched ground' }] },
  { id: 'land_soft.4', tags: ['land_soft:craft','land_soft:code'], weight: 0.8, cooldown: 8,
    lines: [{ who: 'craft', text: 'HP: 100' }] },

  { id: 'land_hard.1', tags: ['land_hard:craft','land_hard:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'БАМ', act: 'surprised' }] },
  { id: 'land_hard.2', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'увидел stars.fbx' }] },
  { id: 'land_hard.3', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: '*ragdoll mode*' }] },
  { id: 'land_hard.4', tags: ['land_hard:craft','land_hard:code'], weight: 0.8, cooldown: 8,
    lines: [{ who: 'craft', text: 'респавн?..' }] },

  // ─── SETDOWN ─────────────────────────────────────────
  { id: 'setdown.1', tags: ['setdown:craft','setdown:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: '*teleport complete*' }] },
  { id: 'setdown.2', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'thx' }] },
  { id: 'setdown.3', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'новый spawn point' }] },

  // ─── ACCENT ──────────────────────────────────────────
  { id: 'accent.repaint', tags: ['accent'], weight: 2, cooldown: 30,
    lines: [
      { who: 'craft', text: 'нам тему перекрасили?', act: 'surprised' },
      { who: 'code',  text: 'post-process сдвинулся' },
      { who: 'craft', text: 'ну вкусно' },
    ]},
  { id: 'accent.spectrum', tags: ['accent'], weight: 1.5, cooldown: 30,
    lines: [
      { who: 'code',  text: 'палитра обновлена' },
      { who: 'craft', text: 'сохрани hex' },
    ]},
  { id: 'accent.try_it', tags: ['accent'], weight: 1, cooldown: 45,
    lines: [
      { who: 'craft', text: 'новый skin!' },
      { who: 'code',  text: 'надо привыкнуть к LUT' },
    ]},
  { id: 'accent.smell', tags: ['accent'], weight: 0.6, cooldown: 120,
    lines: [
      { who: 'craft', text: 'пахнет иначе' },
      { who: 'code',  text: 'у shader нет запаха' },
      { who: 'craft', text: 'у этого есть' },
    ]},

  // ─── KONAMI / special ────────────────────────────────
  { id: 'konami.dance', tags: ['konami'], weight: 1, cooldown: 5,
    lines: [
      { who: 'craft', text: '🕺 dance.anim', act: 'wave' },
      { who: 'code',  text: '💃 loop=true', act: 'wave' },
      { who: 'craft', text: 'что это было' },
      { who: 'code',  text: 'не останавливайся, FPS держит' },
    ]},

  { id: 'unmuted.return', tags: ['unmuted'], weight: 1, cooldown: 5,
    lines: [
      { who: 'craft', text: 'snd back', act: 'wave' },
      { who: 'code',  text: 'gain = 1.0' },
    ]},

  // ─── INSIGHT ─────────────────────────────────────────
  { id: 'insight.craft.1', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'о! идея!' }] },
  { id: 'insight.craft.2', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'щас запишу в TODO' }] },
  { id: 'insight.craft.3', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: '*рисует в Aseprite*' }] },
  { id: 'insight.craft.4', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'новый layer' }] },
  { id: 'insight.craft.5', tags: ['insight:craft'], weight: 0.7, cooldown: 45,
    lines: [{ who: 'craft', text: 'ну конечно! pivot вниз!' }] },

  { id: 'insight.code.1', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: 'ровно 3.14 UU' }] },
  { id: 'insight.code.2', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: 'перепроверю hash' }] },
  { id: 'insight.code.3', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: '*измеряет margin*' }] },
  { id: 'insight.code.4', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: 'ассерт прошёл' }] },
  { id: 'insight.code.5', tags: ['insight:code'], weight: 0.7, cooldown: 45,
    lines: [{ who: 'code', text: 'рефактор готов. -300 строк' }] },

  // ─── TOSS intro ──────────────────────────────────────
  { id: 'toss.craft.chertyozh', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: 'ты опять починил мой pivot?' },
      { who: 'code',  text: 'он был кривой на 7 пикселей' },
      { who: 'craft', text: 'он был ТВОРЧЕСКИЙ', act: 'surprised' },
      { who: 'code',  text: 'и кривой' },
      { who: 'craft', text: '.коммит.реверт.' },
    ]},
  { id: 'toss.craft.ruler', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
    lines: [
      { who: 'code',  text: '3.14 см. отойди, я замеряю' },
      { who: 'craft', text: 'отойду? я?' },
      { who: 'code',  text: 'ты мешаешь snap grid' },
      { who: 'craft', text: 'знаешь что ещё мешает' },
      { who: 'code',  text: 'что' },
      { who: 'craft', text: 'ничего. ты уже в воздухе.' },
    ]},
  { id: 'toss.craft.silent', tags: ['toss_intro:craft'], weight: 0.8, cooldown: 500,
    lines: [
      { who: 'craft', text: 'CODE' },
      { who: 'code',  text: 'что' },
      { who: 'craft', text: 'у меня план' },
      { who: 'code',  text: 'ок' },
      { who: 'craft', text: 'ты не спросил какой', act: 'surprised' },
      { who: 'code',  text: '...какой' },
      { who: 'craft', text: 'поздно. launch().' },
    ]},

  { id: 'toss.code.noise', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: 'ААААААА' },
      { who: 'code',  text: 'mute' },
      { who: 'craft', text: 'АААААА' },
      { who: 'code',  text: 'ладно. твой ход.' },
    ]},
  { id: 'toss.code.plan', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: '*лепит круглый спрайт*', act: 'typing' },
      { who: 'code',  text: 'должен быть квадратным для tile' },
      { who: 'craft', text: 'нет' },
      { who: 'code',  text: 'проверь trajectory' },
      { who: 'craft', text: 'чью' },
      { who: 'code',  text: 'свою.' },
    ]},
  { id: 'toss.code.measurement', tags: ['toss_intro:code'], weight: 0.8, cooldown: 500,
    lines: [
      { who: 'code',  text: 'между нами 2 юнита' },
      { who: 'craft', text: 'это я подполз' },
      { who: 'code',  text: 'violation of spacing' },
      { who: 'craft', text: 'ой', act: 'surprised' },
      { who: 'code',  text: 'коррекция через physics' },
    ]},

  { id: 'toss_shout.craft.1', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'АЛЛЕ-ОП!' }] },
  { id: 'toss_shout.craft.2', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'LAUNCH()' }] },
  { id: 'toss_shout.craft.3', tags: ['toss_shout:craft'], weight: 0.7, cooldown: 20,
    lines: [{ who: 'craft', text: '*хех, чит активен*' }] },

  { id: 'toss_shout.code.1', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'замер apex' }] },
  { id: 'toss_shout.code.2', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'parabolic test #42' }] },
  { id: 'toss_shout.code.3', tags: ['toss_shout:code'], weight: 0.7, cooldown: 20,
    lines: [{ who: 'code', text: 'reset и ещё раз' }] },

  // ─── CONTINUITY ─────────────────────────────────────
  { id: 'idle.after_throw', tags: ['idle'], weight: 5, cooldown: 40,
    requires: (ctx) => ctx.flags.craft_airborne_recent || ctx.flags.code_airborne_recent,
    lines: [
      { who: 'craft', text: 'до сих пор motion sick' },
      { who: 'code',  text: 'vestibular буфер переполнен' },
    ]},

  { id: 'idle.wary_after_throws', tags: ['idle'], weight: 4, cooldown: 180,
    requires: (ctx) => (ctx.flags.thrown_count || 0) >= 3,
    lines: [
      { who: 'craft', text: 'давай сегодня низко-поли' },
      { who: 'code',  text: 'высота — bad idea' },
    ]},

  { id: 'idle.post_crash', tags: ['idle'], weight: 6, cooldown: 30,
    requires: (ctx) => ctx.flags.craft_landed_hard_recent || ctx.flags.code_landed_hard_recent,
    lines: [
      { who: 'code',  text: 'у меня ещё буферы звенят' },
      { who: 'craft', text: 'у меня vsync сбился' },
      { who: 'code',  text: 'постоим в pause' },
    ]},

  { id: 'idle.tense', tags: ['idle'], weight: 3, cooldown: 90,
    requires: (ctx) => (ctx.flags.rapport ?? 50) < 30,
    lines: [
      { who: 'craft', text: 'ты сегодня странный' },
      { who: 'code',  text: 'ты всегда странный. это baseline' },
      { who: 'craft', text: '...' },
    ]},

  { id: 'idle.warm', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => (ctx.flags.rapport ?? 50) > 70,
    lines: [
      { who: 'craft', text: 'мы красиво ship-аем' },
      { who: 'code',  text: '*тихо, но одобрительно*' },
    ]},

  { id: 'accent.followup', tags: ['idle'], weight: 6, cooldown: 0,
    requires: (ctx) => ctx.flags.accent_changed_recent && !ctx.flags.accent_followup_done,
    effect: (ctx) => ctx.setFlag('accent_followup_done', 1, 180),
    lines: [
      { who: 'craft', text: 'этот тон ещё тёплый' },
      { who: 'code',  text: 'пиксели оседают' },
      { who: 'craft', text: 'он приживётся' },
    ]},

  { id: 'idle.annoyed_craft', tags: ['idle'], weight: 3, cooldown: 60,
    requires: (ctx) => ctx.flags.craft_annoyed,
    lines: [
      { who: 'craft', text: '*дуется в отдельном layer*' },
      { who: 'code',  text: 'cooldown 60s' },
    ]},
  { id: 'idle.annoyed_code', tags: ['idle'], weight: 3, cooldown: 60,
    requires: (ctx) => ctx.flags.code_annoyed,
    lines: [
      { who: 'code',  text: 'я ещё раз пересчитаю atlas' },
      { who: 'craft', text: 'всё, молчу, tab закрыл' },
    ]},

  // ─── SCENE CHAINS ────────────────────────────────────
  { id: 'chain.build.open', tags: ['idle'], weight: 2, cooldown: 100,
    requires: (ctx) => !ctx.flags.chain_build,
    effect: (ctx) => ctx.setFlag('chain_build', 1, 120),
    lines: [
      { who: 'craft', text: 'что будем билдить сегодня?' },
      { who: 'code',  text: 'сначала спецификация' },
      { who: 'craft', text: 'ок, ок', act: 'typing' },
    ]},
  { id: 'chain.build.close', tags: ['idle'], weight: 8, cooldown: 30,
    requires: (ctx) => ctx.flags.chain_build,
    effect: (ctx) => { delete ctx.flags.chain_build; delete ctx.flagExpiry.chain_build; },
    lines: [
      { who: 'code',  text: 'ну что, спека?' },
      { who: 'craft', text: 'получается' },
      { who: 'code',  text: 'проверю scope', act: 'typing' },
      { who: 'craft', text: 'он... гибкий' },
    ]},

  { id: 'chain.measure.open', tags: ['idle'], weight: 1.5, cooldown: 120,
    requires: (ctx) => !ctx.flags.chain_measure,
    effect: (ctx) => ctx.setFlag('chain_measure', 1, 90),
    lines: [
      { who: 'code',  text: 'я что-то профилирую' },
      { who: 'craft', text: 'что' },
      { who: 'code',  text: 'сам скоро узнаю', act: 'typing' },
    ]},
  { id: 'chain.measure.close', tags: ['idle'], weight: 8, cooldown: 30,
    requires: (ctx) => ctx.flags.chain_measure,
    effect: (ctx) => { delete ctx.flags.chain_measure; delete ctx.flagExpiry.chain_measure; },
    lines: [
      { who: 'craft', text: 'ну?' },
      { who: 'code',  text: 'в допуске' },
      { who: 'craft', text: 'что именно' },
      { who: 'code',  text: 'всё, что должно быть ровно. кроме тебя' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 3 — «Чертёж № 7»
  // ═════════════════════════════════════════════════════════════════
  { id: 'chertyozh.step_0', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => (ctx.flags.chertyozh_7_step || 0) === 0,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 1),
    lines: [
      { who: 'craft', text: 'Я снова думал о Седьмом атласе.', clip: 'idea' },
      { who: 'code',  text: 'Базовые UV всё ещё не утверждены.' },
      { who: 'craft', text: 'Забудь про UV. Важен vibe.' },
    ]},
  { id: 'chertyozh.step_1', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 1,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 2),
    lines: [
      { who: 'code',  text: 'Замеряю padding для Седьмого.', clip: 'measure_distance' },
      { who: 'craft', text: 'Сколько нам нужно места?' },
      { who: 'code',  text: '2048 мало. 4096 жирно.' },
    ]},
  { id: 'chertyozh.step_2', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 2,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 3),
    lines: [
      { who: 'craft', text: 'Если загнём фаску вот так...', clip: 'sketch_air' },
      { who: 'code',  text: 'Отклонение +3 px от сетки.' },
      { who: 'craft', text: 'Это дыхание спрайта. Ему нужен воздух.' },
    ]},
  { id: 'chertyozh.step_3', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 3,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 4),
    lines: [
      { who: 'code',  text: 'Ты сделал угол 91°.' },
      { who: 'craft', text: 'Он... так живее чувствуется.', act: 'surprised' },
      { who: 'code',  text: '91 — это не чувство. Это z-fighting.', clip: 'facepalm' },
    ]},
  { id: 'chertyozh.step_4', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 4,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 5),
    lines: [
      { who: 'craft', text: 'Я подогнал стыки.', clip: 'hammer' },
      { who: 'code',  text: 'Сканирую... delta 0.00 px. Ровно.' },
      { who: 'craft', text: 'Ради тебя, друг.' },
    ]},
  { id: 'chertyozh.step_5', tags: ['chertyozh_7_tick'], weight: 15,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 5,
    effect:   (ctx) => {
      ctx.setFlag('chertyozh_7_step', 0);
      ctx.modifyMood('craft', +20);
      ctx.modifyMood('code',  +20);
    },
    lines: [
      { who: 'code',  text: 'Седьмой Атлас ship-ed.', clip: 'bar' },
      { who: 'craft', text: 'МЫ ЭТО ЗАРЕЛИЗИЛИ!', clip: 'cheer' },
      { who: 'code',  text: 'Патч 1.0.1 уже в очереди.', clip: 'laugh' },
    ]},

  // ─── MORNING / EVENING ──────────────────────────────
  { id: 'env.morning_1', tags: ['morning'], weight: 5, cooldown: 600,
    lines: [
      { who: 'craft', text: 'Свежий билд. Шарниры smooth.', clip: 'excited' },
      { who: 'code',  text: 'Editor прогрет.' },
    ]},
  { id: 'env.morning_2', tags: ['morning'], weight: 3, cooldown: 600,
    lines: [
      { who: 'code',  text: 'Pull rebase прошёл. Ты?' },
      { who: 'craft', text: 'Я всегда готов. Для чего — потом вспомню.' },
    ]},
  { id: 'env.evening_1', tags: ['evening'], weight: 5, cooldown: 600,
    lines: [
      { who: 'craft', text: 'Мастерская в night shift mode.' },
      { who: 'code',  text: 'Ambient -4°C. CPU тоже.' },
      { who: 'craft', text: 'Время тихого refactor.', clip: 'silent_stare' },
    ]},
  { id: 'env.evening_2', tags: ['evening'], weight: 3, cooldown: 600,
    lines: [
      { who: 'code',  text: 'Архитектор сегодня не push-ил.' },
      { who: 'craft', text: 'Его коммиты говорят за него.' },
    ]},
  { id: 'env.silence_1', tags: ['silence_break'], weight: 5,
    lines: [
      { who: 'craft', text: 'Тишина правильной формы.' },
      { who: 'code',  text: 'Acoustic null. Ровно.' },
    ]},
  { id: 'env.silence_2', tags: ['silence_break'], weight: 3,
    lines: [
      { who: 'code',  text: '...' },
      { who: 'craft', text: 'Ты тоже think()?' },
      { who: 'code',  text: 'Всегда.' },
    ]},

  // ─── SPATIAL HOOKS ──────────────────────────────────
  { id: 'space.stack_top_craft', tags: ['stack:top:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'Ого! Вижу top-edge!', clip: 'wave' }]},
  { id: 'space.stack_top_code',  tags: ['stack:top:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Y++. Обзор max.' }]},
  { id: 'space.stack_bot_craft', tags: ['stack:bottom:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'Ты тяжёлый как uncompressed PNG!', act: 'surprised' }]},
  { id: 'space.stack_bot_code',  tags: ['stack:bottom:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Моя collision capsule не для этого.', clip: 'facepalm' }]},

  { id: 'space.drag_craft', tags: ['partner_dragged:craft'], weight: 5, cooldown: 20,
    lines: [
      { who: 'code',  text: 'Фиксирую space anomaly.' },
      { who: 'craft', text: 'Лечу-у-у не по atlas-у!' },
    ]},
  { id: 'space.drag_code',  tags: ['partner_dragged:code'],  weight: 5, cooldown: 20,
    lines: [
      { who: 'craft', text: 'Эй! Сквозняк CODE украл!', act: 'surprised' },
      { who: 'code',  text: 'Внешний input. Vector out of scope.' },
    ]},

  { id: 'space.lost_craft', tags: ['partner_lost:craft'], weight: 5, cooldown: 15,
    lines: [{ who: 'code', text: 'Связь lost. Он вне grid.', act: 'surprised' }]},
  { id: 'space.lost_code',  tags: ['partner_lost:code'],  weight: 5, cooldown: 15,
    lines: [{ who: 'craft', text: 'CODE?! respawn?!', act: 'surprised' }]},

  { id: 'space.stuck_1', tags: ['stuck_together'], weight: 5, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Dist=0. Overlap detected.' },
      { who: 'craft', text: 'Так теплее. Считай ambient occlusion.' },
    ]},
  { id: 'space.stuck_2', tags: ['stuck_together'], weight: 3, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Слишком близко. Padding violation.' },
      { who: 'craft', text: 'А если не violation?' },
      { who: 'code',  text: '...допустимо.' },
    ]},

  { id: 'space.platform_craft', tags: ['platform_rest:craft'], weight: 5, cooldown: 45,
    lines: [
      { who: 'craft', text: 'С полки пыль как particle system.', clip: 'stargaze' },
      { who: 'code',  text: 'Это GPU dust.' },
    ]},
  { id: 'space.platform_code',  tags: ['platform_rest:code'],  weight: 5, cooldown: 45,
    lines: [{ who: 'code', text: 'Высота stable. Можно profile-ить.', clip: 'measure_distance' }]},

  { id: 'space.bumped_craft', tags: ['bumped_repeated:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'Collider в каждую стену!', clip: 'facepalm' }]},
  { id: 'space.bumped_code',  tags: ['bumped_repeated:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Stress 85%. Поставь ровно.', clip: 'facepalm' }]},

  // ─── USER INTERACTION ──────────────────────────────
  { id: 'user.touch_craft', tags: ['gentle_touch:craft'], weight: 5, cooldown: 120,
    lines: [
      { who: 'craft', text: 'Ой, щекотно! 12 fps смеха.', clip: 'chuckle' },
      { who: 'code',  text: 'Sensor caught статику.' },
    ]},
  { id: 'user.touch_code',  tags: ['gentle_touch:code'],  weight: 5, cooldown: 120,
    lines: [
      { who: 'code',  text: 'Внешнее давление optimal.', clip: 'wave' },
      { who: 'craft', text: 'Стенд вибрирует. Like!' },
    ]},

  { id: 'user.reconcile_1', tags: ['reconciliation'], weight: 5, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Dist восстановлена. System stable.' },
      { who: 'craft', text: 'Сквозняк нас reunite-нул.', clip: 'excited' },
    ]},
  { id: 'user.reconcile_2', tags: ['reconciliation'], weight: 3, cooldown: 60,
    lines: [
      { who: 'craft', text: 'Чертёж снова сходится.', clip: 'sketch_air' },
      { who: 'code',  text: 'Tolerance: ok.' },
    ]},

  { id: 'user.saved_craft', tags: ['picked_up_after_hurt:craft'], weight: 5, cooldown: 30,
    effect: (ctx) => ctx.modifyMood('craft', +10),
    lines: [{ who: 'craft', text: 'Фух... thx. HP было на нуле.', clip: 'wipe_tear' }]},
  { id: 'user.saved_code',  tags: ['picked_up_after_hurt:code'],  weight: 5, cooldown: 30,
    effect: (ctx) => ctx.modifyMood('code', +10),
    lines: [{ who: 'code', text: 'Vector восстановлен. Thx for stabilization.' }]},

  // ─── MACRO ──────────────────────────────────────────
  { id: 'macro.hammer_time', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 4,
    lines: [
      { who: 'craft', text: 'Сейчас... подправлю край.' },
      { who: 'craft', text: '...хрясь...', clip: 'hammer' },
      { who: 'craft', text: '...ещё пиксель...', clip: 'hammer' },
      { who: 'craft', text: 'Pixel-perfect.' },
      { who: 'code',  text: 'Механическое воздействие в норме.' },
    ]},
  { id: 'macro.handoff_laptop', tags: ['idle'], weight: 2, cooldown: 240,
    requires: (ctx) => !!ctx.flags.bots_close,
    lines: [
      { who: 'craft', text: 'Я перебрал атлас. Смотри.', clip: 'share_laptop' },
      { who: 'code',  text: 'Принимаю diff...', clip: 'share_laptop' },
      { who: 'code',  text: 'Conflicts=0. Подозрительно.', clip: 'typing' },
      { who: 'craft', text: 'Я говорил! Интуиция.', clip: 'excited' },
    ]},
  { id: 'macro.coffee_break', tags: ['idle'], weight: 2, cooldown: 300,
    requires: (ctx) => ctx.sim && ctx.sim.workshopTime > 0.5,
    lines: [
      { who: 'code',  text: 'Energy стек падает. Паузу?', clip: 'rest' },
      { who: 'craft', text: 'Да. Масло в кофеварку.', clip: 'coffee_sip' },
      { who: 'code',  text: '...Тишина стабилизирует CPU.', clip: 'silent_stare' },
    ]},
  { id: 'macro.pair_wave', tags: ['idle'], weight: 2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'Привет, viewport!', clip: 'wave' },
      { who: 'code',  text: 'Hi, vacuum.', clip: 'wave' },
    ]},

  // ─── EASTER ─────────────────────────────────────────
  { id: 'easter.singing', tags: ['idle'], weight: 0.5, cooldown: 300,
    lines: [
      { who: 'craft', text: '*ммм-мм-8-bit мотив...*', clip: 'wave' },
      { who: 'code',  text: 'Это chiptune?' },
      { who: 'craft', text: 'Это my soul.wav' },
    ]},
  { id: 'easter.code_laugh', tags: ['idle'], weight: 0.5, cooldown: 500,
    lines: [
      { who: 'code',  text: '01001000 01000001. Шутка.', clip: 'laugh' },
      { who: 'craft', text: 'Ты только что смеялся?!', act: 'surprised' },
      { who: 'code',  text: 'Акустический bug. Забудь.' },
    ]},
  { id: 'easter.valentin_missing', tags: ['idle'], weight: 2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'Ты не git-оишь Валентина?' },
      { who: 'code',  text: 'X:40 его коорд. Я untouched.' },
      { who: 'craft', text: 'Он вечно куда-то merge-ит...' },
    ]},
  { id: 'easter.theme_sense', tags: ['idle'], weight: 2, cooldown: 240,
    lines: [
      { who: 'craft', text: 'Чуешь? LUT сменили.' },
      { who: 'code',  text: 'Contrast +12%. Допустимо.' },
    ]},
  { id: 'mood.low_craft', tags: ['idle'], weight: 3, cooldown: 120,
    requires: (ctx) => ctx.sim && ctx.sim.mood.craft < 30,
    lines: [
      { who: 'craft', text: '*тихо, в серый layer*' },
      { who: 'code',  text: 'Хочешь, я что-нибудь profile-ну?' },
      { who: 'craft', text: 'Потом. Сейчас standby.' },
    ]},
  { id: 'mood.low_code', tags: ['idle'], weight: 3, cooldown: 120,
    requires: (ctx) => ctx.sim && ctx.sim.mood.code < 30,
    lines: [
      { who: 'code',  text: 'Допуски нарушены. Множество.' },
      { who: 'craft', text: 'Починим. Завтра.' },
      { who: 'code',  text: '...thx.' },
    ]},
  { id: 'mood.high_both', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => ctx.sim && ctx.sim.mood.craft > 70 && ctx.sim.mood.code > 70,
    lines: [
      { who: 'craft', text: 'Сегодня что-то... compile-ится сразу.' },
      { who: 'code',  text: 'Оптимальный режим. Confirmed.' },
    ]},

  // ─── JUMPS & PARKOUR ────────────────────────────────
  { id: 'jump.craft.1', tags: ['jump:craft'], weight: 2, cooldown: 15,
    lines: [{ who: 'craft', text: 'Оп!' }] },
  { id: 'jump.craft.2', tags: ['jump:craft'], weight: 1, cooldown: 30,
    lines: [{ who: 'craft', text: 'Пружиню!' }] },
  { id: 'jump.craft.3', tags: ['jump:craft'], weight: 1, cooldown: 40,
    lines: [
      { who: 'craft', text: 'Levitate.anim!' },
      { who: 'code', text: 'это просто jump, lol' }
    ]},

  { id: 'jump.code.1', tags: ['jump:code'], weight: 2, cooldown: 15,
    lines: [{ who: 'code', text: 'Y-offset' }] },
  { id: 'jump.code.2', tags: ['jump:code'], weight: 1, cooldown: 30,
    lines: [{ who: 'code', text: 'vector.up' }] },

  { id: 'jump_down.craft.1', tags: ['jump_down:craft'], weight: 2, cooldown: 15,
    lines: [{ who: 'craft', text: 'Гравитация, catch!' }] },
  { id: 'jump_down.code.1', tags: ['jump_down:code'], weight: 2, cooldown: 15,
    lines: [{ who: 'code', text: 'descent confirmed' }] },

  { id: 'jump_over.craft.1', tags: ['jump_over:craft'], weight: 2, cooldown: 15,
    lines: [{ who: 'craft', text: 'Паркур!' }] },
  { id: 'jump_over.craft.2', tags: ['jump_over:craft'], weight: 1, cooldown: 30,
    lines: [{ who: 'craft', text: 'obstacle bypass!' }] },
  { id: 'jump_over.code.1', tags: ['jump_over:code'], weight: 2, cooldown: 20,
    lines: [{ who: 'code', text: 'detour' }] },
  { id: 'jump_over.code.2', tags: ['jump_over:code'], weight: 1, cooldown: 30,
    lines: [{ who: 'code', text: 'obstacle. hopping over.' }] },

  { id: 'stuck.craft.1', tags: ['stuck_jump:craft'], weight: 2, cooldown: 15,
    lines: [{ who: 'craft', text: 'Застрял! РРР!', act: 'surprised' }] },
  { id: 'stuck.craft.2', tags: ['stuck_jump:craft'], weight: 1, cooldown: 30,
    lines: [{ who: 'craft', text: 'Navmesh broken!', act: 'surprised' }] },
  { id: 'stuck.code.1', tags: ['stuck_jump:code'], weight: 2, cooldown: 15,
    lines: [{ who: 'code', text: 'collision error' }] },
  { id: 'stuck.code.2', tags: ['stuck_jump:code'], weight: 1, cooldown: 30,
    lines: [{ who: 'code', text: 'path blocked' }] },

  // ─── BUTTON PRESSED ─────────────────────────────────
  { id: 'button.craft.1', tags: ['button_pressed:craft'], weight: 2, cooldown: 20,
    lines: [
      { who: 'craft', text: 'Я НАЖАЛ КНОПКУ!', act: 'excited' },
      { who: 'code', text: 'вижу. post-process моргает' }
    ]},
  { id: 'button.craft.2', tags: ['button_pressed:craft'], weight: 1, cooldown: 40,
    lines: [
      { who: 'craft', text: 'Смотри, магия!', act: 'surprised' },
      { who: 'code', text: 'это script, а не магия' }
    ]},
  { id: 'button.code.1', tags: ['button_pressed:code'], weight: 2, cooldown: 30,
    lines: [
      { who: 'code', text: 'event триггернулся.' },
      { who: 'craft', text: 'Ещё, нажми ещё!' }
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  BEHAVIOR — новые поведенческие сценки (engine пока не экзекьютит
  //  actions, но структура готова под будущий scripted AI).
  // ═════════════════════════════════════════════════════════════════
  { id: 'behavior.chase', tags: ['behavior','idle'], weight: 1.2, cooldown: 240,
    lines: [
      { who: 'craft', text: 'А ну иди сюда!' },
      { who: 'code',  text: 'Покидаю зону. Escape.exe' },
      { who: 'craft', text: 'Я тебя всё равно догоню!' },
      { who: 'code',  text: 'Мой ping 12 мс. Не догонишь.' },
    ]},

  { id: 'behavior.dance_battle', tags: ['behavior','idle'], weight: 1, cooldown: 300,
    lines: [
      { who: 'craft', text: 'Dance battle!', clip: 'wave' },
      { who: 'code',  text: '*грувит на 128 bpm*', clip: 'wave' },
      { who: 'craft', text: 'твой стиль — robot?' },
      { who: 'code',  text: 'статистически точный robot' },
    ]},

  { id: 'behavior.stuck_corner', tags: ['behavior','idle'], weight: 1, cooldown: 220,
    lines: [
      { who: 'craft', text: 'эм. я в углу.' },
      { who: 'code',  text: '*смеётся бесшумно*', clip: 'laugh' },
      { who: 'craft', text: 'navmesh предал меня' },
      { who: 'code',  text: 'ты предал navmesh' },
    ]},

  { id: 'behavior.ball_toss', tags: ['behavior','idle'], weight: 1, cooldown: 200,
    lines: [
      { who: 'code',  text: 'ball.throw()' },
      { who: 'craft', text: 'ЛОВЛЮ!', act: 'excited' },
      { who: 'code',  text: 'она в 3.14 см левее' },
      { who: 'craft', text: '*ловит головой*' },
    ]},

  { id: 'behavior.staring_contest', tags: ['behavior','idle'], weight: 0.8, cooldown: 260,
    lines: [
      { who: 'craft', text: 'гляделки. готов?' },
      { who: 'code',  text: 'у меня нет век' },
      { who: 'craft', text: 'это читерство' },
      { who: 'code',  text: 'это ТТХ' },
    ]},

  { id: 'behavior.shadow_play', tags: ['behavior','idle'], weight: 0.8, cooldown: 280,
    lines: [
      { who: 'craft', text: 'смотри, тень как дракон!' },
      { who: 'code',  text: 'это просто ambient occlusion' },
      { who: 'craft', text: 'у меня дракон' },
    ]},

  { id: 'behavior.hide_seek', tags: ['behavior','idle'], weight: 1, cooldown: 250,
    lines: [
      { who: 'craft', text: 'прячусь!' },
      { who: 'code',  text: 'ты за одним пикселем' },
      { who: 'craft', text: 'он мой размер' },
      { who: 'code',  text: 'справедливо' },
    ]},

  { id: 'behavior.copy_me', tags: ['behavior','idle'], weight: 0.9, cooldown: 240,
    lines: [
      { who: 'craft', text: 'повторяй за мной' },
      { who: 'craft', text: '*машет*', clip: 'wave' },
      { who: 'code',  text: '*машет с задержкой 1 кадр*', clip: 'wave' },
      { who: 'craft', text: 'lag у тебя' },
    ]},

  { id: 'behavior.race', tags: ['behavior','idle'], weight: 1, cooldown: 260,
    lines: [
      { who: 'craft', text: 'гонка до края!' },
      { who: 'code',  text: 'три, два, один' },
      { who: 'craft', text: 'ЧИТ!' },
      { who: 'code',  text: 'ты стартанул на "два"' },
    ]},

  { id: 'behavior.rock_paper', tags: ['behavior','idle'], weight: 0.9, cooldown: 280,
    lines: [
      { who: 'craft', text: 'камень-ножницы' },
      { who: 'code',  text: 'я всегда камень' },
      { who: 'craft', text: 'почему' },
      { who: 'code',  text: 'я и есть камень' },
    ]},

  { id: 'behavior.pair_plank', tags: ['behavior','idle'], weight: 0.8, cooldown: 300,
    lines: [
      { who: 'code',  text: 'планка. 30 секунд.' },
      { who: 'craft', text: 'я художник, у меня талант' },
      { who: 'code',  text: 'это не отмазка' },
      { who: 'craft', text: 'в UE5 это отмазка' },
    ]},

  { id: 'behavior.poke_loop', tags: ['behavior','idle'], weight: 0.9, cooldown: 200,
    lines: [
      { who: 'craft', text: 'тык' },
      { who: 'code',  text: 'stop' },
      { who: 'craft', text: 'тык' },
      { who: 'code',  text: 'STOP', act: 'surprised' },
      { who: 'craft', text: 'тык' },
    ]},

  { id: 'behavior.echo_canyon', tags: ['behavior','idle'], weight: 0.7, cooldown: 320,
    lines: [
      { who: 'craft', text: 'ЭХОО!' },
      { who: 'code',  text: 'нет reverb bus' },
      { who: 'craft', text: 'ЭХОО!' },
      { who: 'code',  text: '*добавляет reverb*' },
      { who: 'craft', text: 'эхо-о-о...' },
    ]},

  { id: 'behavior.sync_nap', tags: ['behavior','idle'], weight: 0.8, cooldown: 340,
    lines: [
      { who: 'craft', text: 'синхронный zzz?' },
      { who: 'code',  text: 'sleep(5)' },
      { who: 'craft', text: '*zzz*' },
      { who: 'code',  text: '*zzz, но ровно*' },
    ]},

  { id: 'behavior.highfive', tags: ['behavior','idle'], weight: 1, cooldown: 220,
    lines: [
      { who: 'craft', text: 'HIGH-FIVE!', act: 'excited' },
      { who: 'code',  text: '*касание: зарегистрировано*', clip: 'wave' },
      { who: 'craft', text: 'ачивка!' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  EVENT — реакции на случайные события стейджа (item_spawn,
  //  platform_appear, obstacle_move). Scene id-шка содержит тип
  //  предмета/события после точки; bot.events.ts выбирает по тегу
  //  `event` + опциональному остатку в id. Короткие реплики (1-2).
  // ═════════════════════════════════════════════════════════════════
  { id: 'event.item_spawn.coffee', tags: ['event','event:item_spawn'], weight: 1.2, cooldown: 60,
    lines: [
      { who: 'craft', text: 'кофе! оно само!' , act: 'excited' },
      { who: 'code',  text: 'варенье в кружке. принято.' },
    ]},

  { id: 'event.item_spawn.gear', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'code',  text: 'шестерёнка. пригодится.' },
      { who: 'craft', text: 'запчасть! дай пощупаю' , act: 'excited' },
    ]},

  { id: 'event.item_spawn.spring', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'craft', text: 'пружина! будем прыгать' , act: 'excited' },
      { who: 'code',  text: 'закон Гука говорит «осторожно»' },
    ]},

  { id: 'event.item_spawn.wrench', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'code',  text: 'ключ. на 14. похоже.' },
      { who: 'craft', text: 'чиним всё подряд!' },
    ]},

  { id: 'event.item_spawn.bolt', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'craft', text: 'болтик укатился. лови!' },
      { who: 'code',  text: 'M6, длина 20. стандарт.' },
    ]},

  { id: 'event.item_spawn.cube', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'craft', text: 'коробка! что внутри?' },
      { who: 'code',  text: 'schrödinger. не открывай.' },
    ]},

  { id: 'event.item_spawn.coin', tags: ['event','event:item_spawn'], weight: 1, cooldown: 60,
    lines: [
      { who: 'craft', text: 'монетка! +1 очко!' , act: 'excited' },
      { who: 'code',  text: 'в экономике Tick() инфляция' },
    ]},

  { id: 'event.item_seen.generic', tags: ['event','event:item_seen'], weight: 1, cooldown: 45,
    lines: [
      { who: 'code',  text: 'что-то упало' },
      { who: 'craft', text: 'ага, видел!' },
    ]},

  { id: 'event.platform_appear.generic', tags: ['event','event:platform_appear'], weight: 1, cooldown: 80,
    lines: [
      { who: 'craft', text: 'новая платформа! лезу!' , act: 'excited' },
      { who: 'code',  text: 'physics материализовал ещё один коллайдер' },
    ]},

  { id: 'event.obstacle_move.generic', tags: ['event','event:obstacle_move'], weight: 1, cooldown: 70,
    lines: [
      { who: 'code',  text: 'оно... поехало?' },
      { who: 'craft', text: 'мир шевелится! держись!' },
    ]},
];
