// CRAFTCODE — Dialogue i18n extractor.
//
//   node scripts/extract-dialogues-i18n.mjs
//
// Walks SCENES from src/bots/dialogues.data.js and the inner-monologue POOL
// (inlined below — mirrors engine.legacy.js), mints keys:
//   dialogue.<scene.id>.l<N>   — 1-indexed per scene
//   bot.monologue.<N>          — 1-indexed for the inner-monologue pool
//
// Writes into src/i18n/translations/{ru,en}.json:
//   · ru.json  — original text from the data file (source language)
//   · en.json  — English translations from the EN_MAP below (fallback = RU)
//
// Idempotent: existing keys are overwritten only if the source text changed
// (for RU) or if EN_MAP has a value (for EN). Other existing keys preserved.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Phase 5b: per-scope JSON layout. Keys are routed by prefix (`plugin.*` →
// plugin.json, `dialogue.*` → dialogue.json, everything else → common.json).
const TRANSLATIONS_DIR = path.join(ROOT, 'src/i18n/translations');
const SCOPES = ['common', 'plugin', 'dialogue'];
const scopeOf = (key) => {
  if (key.startsWith('plugin.')) return 'plugin';
  if (key.startsWith('dialogue.')) return 'dialogue';
  return 'common';
};

// Dynamic import — the data module is plain ESM, so node can load it directly.
const dataUrl = new URL('../src/bots/dialogues.data.js', import.meta.url);
const { SCENES } = await import(dataUrl.href);

// Mirror of the inner-monologue POOL in engine.legacy.js (~line 956).
const MONOLOGUE_POOL = [
  '...hmm', 'почти готово', 'крч', 'lol', 'brb', 'zzz',
  'o_O', 'wait what', 'ага', 'ок', '...', 'чёт', 'hm',
  'meh', 'ну-ну',
];

// ─── Comprehensive EN translations ────────────────────────────────────
// Keyed by exact RU source string. If a string is missing here, EN falls
// back to the RU original (which i18n.ts then surfaces as-is — fine for
// emoji / NaN / code-looking lines). Stylistic rules:
//   · cyberpunk / terminal voice, lowercase where source is lowercase
//   · gamedev terms preserved: pivot, atlas, UV, normals, Tick, Paper2D,
//     navmesh, blueprint, lightmap, GPU, shader, collider
//   · "крч" → "tl;dr", "лол/lol" → "lol", "чёт" → "kinda",
//     "зачем/что" kept conversational
//   · stage directions in *asterisks* stay wrapped
const EN_MAP = {
  // idle.build_idea
  'крч, придумал новый спрайт': 'tl;dr, got a new sprite',
  'pivot где': 'pivot where',
  'в голове': 'in my head',
  'опять уедет': "it'll drift again",
  // idle.sculpt_air
  '*лепит меш в воздухе*': '*sculpts a mesh in midair*',
  'это че': 'whats that',
  'угол': 'an angle',
  'в нём 91 градус. normals плачут': "it's 91°. normals are crying",
  'я художник, я так вижу': "i'm an artist, i see it this way",
  // idle.measure_me
  'между нами ровно 3.14 UE-юнита': "we're exactly 3.14 UE units apart",
  'только что было пять': 'was five a second ago',
  'ты подполз. vx > 0': 'you crept closer. vx > 0',
  // idle.breathing
  'ты в Tick() сейчас?': 'you in Tick() right now?',
  'вроде да': 'kinda yeah',
  'отпишись': 'confirm',
  '...': '...',
  'ок, дыши дальше': 'ok, keep breathing',
  // idle.what_are_we
  'а мы вообще для чего?': 'what are we even for?',
  'для атласа': 'for the atlas',
  'какого': 'which one',
  'этого вот всего': 'all of this',
  '*оглядывается, видит UV*': '*looks around, sees UVs*',
  // idle.redo_it
  'надо ребилд': 'need a rebuild',
  'чего': 'of what',
  'shaders. интуиция.': 'shaders. gut feeling.',
  'у тебя нет интуиции': "you don't have gut feelings",
  'есть. лежит в /Engine/Experimental/': 'i do. stored in /Engine/Experimental/',
  // idle.draft_sketch
  'щас набросаю спрайт — глянешь': "gonna sketch a sprite — you'll check",
  'я возьму линейку и grid snap': "i'll grab a ruler and grid snap",
  'только без snap!': 'just no snap!',
  'поздно. уже 16x16': 'too late. already 16x16',
  // idle.small_victory
  'вчера я подровнял край атласа': 'yesterday i trimmed an atlas edge',
  'не помню какой': "don't remember which",
  'но ты помнишь чувство': 'but you remember the feeling',
  'да. -42 пикселя впустую': 'yeah. -42 wasted pixels',
  // idle.listen_quiet
  'слышишь как тишина звенит?': 'hear how the silence rings?',
  'это не тишина. это GPU fan': "that's not silence. that's the GPU fan",
  'красиво звучит': 'sounds beautiful',
  // idle.count_something
  'давай посчитаем': "let's count",
  'что': 'what',
  'drawcalls': 'drawcalls',
  'один': 'one',
  'уже слишком много': 'already too many',
  // idle.valentin
  'назовём этот камень?': 'name this rock?',
  'каким неймингом': 'naming convention?',
  'любым': 'any',
  'Валентин_FINAL_v2': 'Valentine_FINAL_v2',
  '...почему v2': '...why v2',
  'будет v3. всегда так': "there'll be a v3. always is",
  // idle.valentin_callback
  'а где Валентин?': "where's Valentine?",
  'в /Assets/_old/': 'in /Assets/_old/',
  'ну хоть живой': 'at least alive',
  // idle.tiny_wave
  'потренирую анимацию': "gonna practice animation",
  'сколько кадров': 'how many frames',
  'четыре': 'four',
  'убедительно. как Paper2D в 2014': 'convincing. like Paper2D in 2014',
  // idle.you_tired
  'ты сегодня тише': "you're quieter today",
  'мыслю': 'thinking',
  'о?': 'oh?',
  'NDA': 'NDA',
  // idle.both_stare
  '*смотрит вдаль*': '*stares into the distance*',
  '*смотрит в тот же viewport*': '*stares into the same viewport*',
  'что там': "what's there",
  'level streaming. ничего интересного': 'level streaming. nothing interesting',
  // idle.tick_dead
  'чёт Tick() подвисает': 'kinda Tick() is lagging',
  'ты в BeginPlay залип': "you're stuck in BeginPlay",
  'а, точно. brb': 'ah right. brb',
  // idle.atlas_full
  'атлас забит под потолок': 'atlas packed to the ceiling',
  'ещё один спрайт влезет?': 'room for one more sprite?',
  'только если ты станешь 2x2': 'only if you become 2x2',
  'ставлю downscale': 'applying downscale',
  // idle.pivot_gone
  'чёт pivot опять уехал': 'kinda pivot drifted again',
  'куда': 'where',
  'куда-то в (0, -∞)': 'somewhere at (0, -∞)',
  'романтично': 'romantic',
  // idle.paper2d_flex
  'Paper2D всё-таки живёт': 'Paper2D is still alive',
  'живёт. просто тихо. как депрекейтед API': 'alive. just quietly. like a deprecated API',
  'ОБИДНО': 'RUDE',
  'зато honest': 'but honest',
  // idle.blueprint_spaghetti
  'глянь мой блюпринт': 'check my blueprint',
  '*молча отключает монитор*': '*silently unplugs the monitor*',
  'ну и ладно, lol': 'whatever, lol',
  // idle.lightmap_bake
  'lightmap печётся. 47 минут': 'lightmap baking. 47 minutes',
  'кофе?': 'coffee?',
  'два': 'two',
  // idle.fps_drop
  'у меня 24 fps': "i'm at 24 fps",
  'это кинематографично': "that's cinematic",
  'это страдание': "that's suffering",
  // idle.git_blame
  'git blame показал тебя': 'git blame pointed at you',
  'ложь и инсинуации': 'lies and slander',
  'commit "wip fix wip"': 'commit "wip fix wip"',
  '...ок это я': '...ok that was me',
  // idle.npe
  'nullptr поймал': 'caught a nullptr',
  'классика': 'classic',
  'я его отпустил': 'i let it go',
  'он вернётся': "it'll come back",
  // idle.hot_reload
  'hot reload': 'hot reload',
  'не надо': "don't",
  'уже': 'already did',
  '*экран потух*': '*screen blacks out*',
  // idle.todo_forever
  '// TODO: fix later': '// TODO: fix later',
  'дата комита?': 'commit date?',
  '2019': '2019',
  'later уже прошёл': 'later already passed',
  // idle.uv_island
  'UV-остров уплыл': 'UV island drifted off',
  'поймай за угол': 'grab it by a corner',
  'он без углов': "it has no corners",
  'ты его круглым нарисовал': 'you drew it round',
  // idle.engine_version
  'UE 5.5 вышел?': 'UE 5.5 shipped?',
  '5.6': '5.6',
  'мы на 5.2': "we're on 5.2",
  'я знаю': 'i know',
  // idle.shipping_build
  'shipping собирается': 'shipping build compiling',
  'сколько': 'how long',
  '3 часа': '3 hours',
  'brb, кушать': 'brb, food',

  // click.craft
  'хэй': 'hey',
  'коллайдер же': 'collider tho',
  'щекотно lol': 'tickles lol',
  '*поёжился в 1 кадр*': '*shudders for 1 frame*',
  'СТОП, я не кнопка': 'STOP, not a button',
  // click.code
  'input зафиксирован': 'input registered',
  'tap @ (x,y)': 'tap @ (x,y)',
  'и это был... клик': 'and that was... a click',
  '*молчит в 01010*': '*silent in 01010*',
  'rate limit превышен': 'rate limit exceeded',

  // grab.craft
  'ОЙ': 'OW',
  'ЛЕЧУ?!': 'FLYING?!',
  'zero-g mode!': 'zero-g mode!',
  'аа, teleport': 'aa, teleport',
  'лапы, лапы, это asset!': 'paws off, this is an asset!',
  // grab.code
  'координаты плывут': 'coordinates drifting',
  'Y++': 'Y++',
  'не ронять. я prefab': "don't drop. i'm a prefab",
  'отпусти на floor_01': 'set me on floor_01',
  'это precision hardware': "this is precision hardware",

  // throw
  'ЛЕЧУУУУ': 'FLYIIIIING',
  'я RAGDOLL!': "i'm RAGDOLL!",
  'не по чертежу!': 'not per blueprint!',
  'ВАУ parabola': 'WOW parabola',
  'velocity: избыточна': 'velocity: excessive',
  'trajectory = NaN': 'trajectory = NaN',
  'я не подписывал release form': "didn't sign a release form",
  'inertia подхватила': 'inertia kicked in',

  // partner
  'CRAFT?! У тебя wings нет': "CRAFT?! you don't have wings",
  'любопытный arc': 'curious arc',
  'возвращайся в prefab': 'return to prefab',
  '*логирует высоту в csv*': '*logs altitude to csv*',
  'CRAFT!!': 'CRAFT!!',
  'CODE!!': 'CODE!!',
  'ты ЛЕТИШЬ! как птица gltf!': "you're FLYING! like a gltf bird!",
  'не garbage-collect его!': "don't garbage-collect him!",
  'ты цел? хитбоксы?': 'you ok? hitboxes?',
  'угу. только pride минус десять': 'yeah. just pride -10',
  'это не по чертежу': "that wasn't per blueprint",
  'CODE?': 'CODE?',
  'углы integrity OK': 'corners integrity OK',
  'фух': 'phew',

  // land_soft
  'уф': 'oof',
  '*обнуляет velocity*': '*zeroes velocity*',
  'touched ground': 'touched ground',
  'HP: 100': 'HP: 100',
  // land_hard
  'БАМ': 'BAM',
  'увидел stars.fbx': 'saw stars.fbx',
  '*ragdoll mode*': '*ragdoll mode*',
  'респавн?..': 'respawn?..',
  // setdown
  '*teleport complete*': '*teleport complete*',
  'thx': 'thx',
  'новый spawn point': 'new spawn point',

  // accent
  'нам тему перекрасили?': 'did they repaint our theme?',
  'post-process сдвинулся': 'post-process shifted',
  'ну вкусно': 'tasty',
  'палитра обновлена': 'palette updated',
  'сохрани hex': 'save the hex',
  'новый skin! я в нём худее': 'new skin! i look slimmer',
  'тот же bounding box': 'same bounding box',
  'ДУША худее': 'SOUL is slimmer',
  'пахнет иначе': 'smells different',
  'у shader нет запаха': "shaders don't have a smell",
  'у этого есть': 'this one does',

  // konami
  '🕺 dance.anim': '🕺 dance.anim',
  '💃 loop=true': '💃 loop=true',
  'что это было': 'what was that',
  'не останавливайся, FPS держит': "don't stop, FPS is holding",
  'snd back': 'snd back',
  'gain = 1.0': 'gain = 1.0',

  // insight
  'о! идея!': 'oh! an idea!',
  'щас запишу в TODO': "i'll drop it in TODO",
  '*рисует в Aseprite*': '*draws in Aseprite*',
  'новый layer': 'new layer',
  'ну конечно! pivot вниз!': 'of course! pivot down!',
  'ровно 3.14 UU': 'exactly 3.14 UU',
  'перепроверю hash': 'rechecking the hash',
  '*измеряет margin*': '*measures margin*',
  'ассерт прошёл': 'assert passed',
  'рефактор готов. -300 строк': 'refactor done. -300 lines',

  // toss.craft
  'ты опять починил мой pivot?': 'you fixed my pivot again?',
  'он был кривой на 7 пикселей': 'it was 7 pixels off',
  'он был ТВОРЧЕСКИЙ': 'it was CREATIVE',
  'и кривой': 'and crooked',
  '.коммит.реверт.': '.commit.revert.',
  '3.14 см. отойди, я замеряю': "3.14 cm. step back, i'm measuring",
  'отойду? я?': 'step back? me?',
  'ты мешаешь snap grid': "you're blocking snap grid",
  'знаешь что ещё мешает': "know what else blocks",
  'ничего. ты уже в воздухе.': "nothing. you're already airborne.",
  'CODE': 'CODE',
  'у меня план': 'i have a plan',
  'ок': 'ok',
  'ты не спросил какой': "you didn't ask what kind",
  '...какой': '...what',
  'поздно. launch().': 'too late. launch().',
  // toss.code
  'ААААААА': 'AAAAAAA',
  'mute': 'mute',
  'АААААА': 'AAAAAA',
  'ладно. твой ход.': 'fine. your move.',
  '*лепит круглый спрайт*': '*sculpts a round sprite*',
  'должен быть квадратным для tile': 'has to be square for tile',
  'нет': 'no',
  'проверь trajectory': 'check trajectory',
  'чью': 'whose',
  'свою.': 'yours.',
  'между нами 2 юнита': "we're 2 units apart",
  'это я подполз': 'that was me creeping',
  'violation of spacing': 'violation of spacing',
  'ой': 'oops',
  'коррекция через physics': 'correction via physics',

  // toss_shout
  'АЛЛЕ-ОП!': 'ALLEY-OOP!',
  'LAUNCH()': 'LAUNCH()',
  '*хех, чит активен*': '*heh, cheat engaged*',
  'замер apex': 'measuring apex',
  'parabolic test #42': 'parabolic test #42',
  'reset и ещё раз': 'reset and again',

  // continuity
  'до сих пор motion sick': 'still motion sick',
  'vestibular буфер переполнен': 'vestibular buffer overflowed',
  'давай сегодня низко-поли': "let's go low-poly today",
  'высота — bad idea': 'altitude — bad idea',
  'у меня ещё буферы звенят': 'my buffers are still ringing',
  'у меня vsync сбился': 'my vsync slipped',
  'постоим в pause': "let's hold on pause",
  'ты сегодня странный': "you're weird today",
  'ты всегда странный. это baseline': "you're always weird. that's baseline",
  'мой baseline хотя бы тёплый': 'at least my baseline is warm',
  'мой измеряется в кельвинах': 'mine is in kelvins',
  'мы красиво ship-аем': 'we ship pretty',
  '*тихо, но одобрительно*': '*quiet, but approving*',
  'этот тон ещё тёплый': 'this tone is still warm',
  'пиксели оседают': 'pixels settling in',
  'он приживётся': "it'll take",

  // annoyed
  '*дуется в отдельном layer*': '*sulks in a separate layer*',
  'cooldown 60s': 'cooldown 60s',
  '90': '90',
  'торг уместен': 'bargaining acceptable',
  'я ещё раз пересчитаю atlas': "i'll recount the atlas",
  'всё, молчу, tab закрыл': 'fine, shutting up, tab closed',

  // chain.build
  'что будем билдить сегодня?': "what are we building today?",
  'сначала спецификация': 'specification first',
  'ок, ок': 'ok, ok',
  'ну что, спека?': "well, the spec?",
  'получается': 'coming along',
  'проверю scope': "i'll check scope",
  'он... гибкий': "it's... flexible",
  // chain.measure
  'я что-то профилирую': 'profiling something',
  'сам скоро узнаю': "i'll find out soon",
  'ну?': 'well?',
  'в допуске': 'within tolerance',
  'что именно': 'what exactly',
  'всё, что должно быть ровно. кроме тебя': 'everything that should be straight. except you',

  // chertyozh
  'Я снова думал о Седьмом атласе.': 'Was thinking about the Seventh atlas again.',
  'Базовые UV всё ещё не утверждены.': 'Base UVs still not approved.',
  'Забудь про UV. Важен vibe.': 'Forget UVs. The vibe matters.',
  'Замеряю padding для Седьмого.': 'Measuring padding for the Seventh.',
  'Сколько нам нужно места?': 'How much room do we need?',
  '2048 мало. 4096 жирно.': '2048 too small. 4096 too fat.',
  'Если загнём фаску вот так...': 'If we bend the chamfer like this...',
  'Отклонение +3 px от сетки.': 'Deviation +3 px from grid.',
  'Это дыхание спрайта. Ему нужен воздух.': "That's the sprite breathing. It needs air.",
  'Ты сделал угол 91°.': 'You made a 91° corner.',
  'Он... так живее чувствуется.': 'It... feels more alive.',
  '91 — это не чувство. Это z-fighting.': '91 is not a feeling. That’s z-fighting.',
  'Я подогнал стыки.': 'I matched the seams.',
  'Сканирую... delta 0.00 px. Ровно.': 'Scanning... delta 0.00 px. Even.',
  'Ради тебя, друг.': 'For you, friend.',
  'Седьмой Атлас ship-ed.': 'Seventh Atlas ship-ed.',
  'МЫ ЭТО ЗАРЕЛИЗИЛИ!': 'WE SHIPPED IT!',
  'Патч 1.0.1 уже в очереди.': 'Patch 1.0.1 already queued.',

  // morning / evening
  'Свежий билд. Шарниры smooth.': 'Fresh build. Joints smooth.',
  'Editor прогрет.': 'Editor warmed up.',
  'pull rebase прошёл. у тебя?': 'pull rebase landed. you?',
  'конфликт в моей голове': 'conflict in my head',
  'merge --strategy=кофе': 'merge --strategy=coffee',
  'Мастерская в night shift mode.': 'Workshop in night-shift mode.',
  'Ambient -4°C. CPU тоже.': 'Ambient -4°C. CPU too.',
  'Время тихого refactor.': 'Time for a quiet refactor.',
  'Архитектор сегодня не push-ил.': 'Architect hasn’t pushed today.',
  'Его коммиты говорят за него.': 'His commits speak for him.',
  'тишина какой-то... правильной формы': 'silence is... shaped right',
  'это квадрат 64x64. default silence.': "it's a 64x64 square. default silence.",
  'я думал кастомная': 'thought it was custom',
  'ты в think()?': 'you in think()?',
  'нет. в while(true) {}': 'no. in while(true) {}',
  'вылезай, чайник вскипел': 'crawl out, kettle boiled',

  // space.stack
  'Ого! Вижу top-edge!': 'Whoa! I see top-edge!',
  'Y++. Обзор max.': 'Y++. View max.',
  'Ты тяжёлый как uncompressed PNG!': "You're heavy like an uncompressed PNG!",
  'Моя collision capsule не для этого.': 'My collision capsule is not for this.',
  'Фиксирую space anomaly.': 'Logging a space anomaly.',
  'Лечу-у-у не по atlas-у!': 'Flyyying off-atlas!',
  'Эй! Сквозняк CODE украл!': 'Hey! The draft stole CODE!',
  'Внешний input. Vector out of scope.': 'External input. Vector out of scope.',
  'Связь lost. Он вне grid.': 'Link lost. He’s off-grid.',
  'CODE?! respawn?!': 'CODE?! respawn?!',
  'Dist=0. Overlap detected.': 'Dist=0. Overlap detected.',
  'Так теплее. Считай ambient occlusion.': 'Warmer this way. Call it ambient occlusion.',
  'Слишком близко. Padding violation.': 'Too close. Padding violation.',
  'А если не violation?': 'And if it’s not a violation?',
  '...допустимо.': '...permissible.',
  'С полки пыль как particle system.': 'Dust from the shelf like a particle system.',
  'Это GPU dust.': 'That’s GPU dust.',
  'Высота stable. Можно profile-ить.': 'Altitude stable. Ready to profile.',
  'Collider в каждую стену!': 'Collider into every wall!',
  'Stress 85%. Поставь ровно.': 'Stress 85%. Place me flat.',

  // user
  'Ой, щекотно! 12 fps смеха.': 'Oh, tickles! 12 fps of laughter.',
  'Sensor caught статику.': 'Sensor caught static.',
  'Внешнее давление optimal.': 'External pressure optimal.',
  'Стенд вибрирует. Like!': 'Stand vibrates. Like!',
  'Dist восстановлена. System stable.': 'Dist restored. System stable.',
  'Сквозняк нас reunite-нул.': 'The draft reunited us.',
  'чертёж снова сходится': 'blueprint lines up again',
  'tolerance: ok. я даже проверять не буду': "tolerance: ok. won't even verify",
  'ого, вера': 'wow, faith',
  'нет. лень.': 'no. laziness.',
  'Фух... thx. HP было на нуле.': 'Phew... thx. HP was at zero.',
  'Vector восстановлен. Thx for stabilization.': 'Vector restored. Thx for stabilization.',

  // macro
  'Сейчас... подправлю край.': 'Just... tweaking the edge.',
  '...хрясь...': '...thwack...',
  '...ещё пиксель...': '...one more pixel...',
  'Pixel-perfect.': 'Pixel-perfect.',
  'Механическое воздействие в норме.': 'Mechanical impact within limits.',
  'Я перебрал атлас. Смотри.': 'I reworked the atlas. Look.',
  'Принимаю diff...': 'Pulling diff...',
  'Conflicts=0. Подозрительно.': 'Conflicts=0. Suspicious.',
  'Я говорил! Интуиция.': 'Told you! Intuition.',
  'Energy стек падает. Паузу?': 'Energy stack draining. Break?',
  'Да. Масло в кофеварку.': 'Yes. Oil in the coffeemaker.',
  '...Тишина стабилизирует CPU.': '...Silence stabilizes the CPU.',
  'Привет, viewport!': 'Hello, viewport!',
  'Hi, vacuum.': 'Hi, vacuum.',

  // easter
  '*ммм-мм-8-bit мотив...*': '*mmm-mm-8-bit tune...*',
  'Это chiptune?': "Is that chiptune?",
  'Это my soul.wav': "It's my soul.wav",
  '01001000 01000001. Шутка.': '01001000 01000001. Joke.',
  'Ты только что смеялся?!': 'Did you just laugh?!',
  'Акустический bug. Забудь.': 'Acoustic bug. Forget it.',
  'Ты не git-оишь Валентина?': "Aren't you git-ing Valentine?",
  'X:40 его коорд. Я untouched.': "X:40 is his coord. I'm untouched.",
  'Он вечно куда-то merge-ит...': 'He always merges off somewhere...',
  'чуешь? LUT сменили': 'feel that? LUT swapped',
  'contrast +12%. допустимо': 'contrast +12%. acceptable',
  'я стал красивее на 12%': "i'm 12% prettier",
  'нет. просто темнее': 'no. just darker',
  // mood
  '*тихо, в серый layer*': '*quiet, in a grey layer*',
  'Хочешь, я что-нибудь profile-ну?': 'Want me to profile something?',
  'Потом. Сейчас standby.': 'Later. Standby now.',
  'Допуски нарушены. Множество.': 'Tolerances violated. Plural.',
  'Починим. Завтра.': "We'll fix it. Tomorrow.",
  '...thx.': '...thx.',
  'сегодня что-то... compile-ится с первого раза': 'today somehow... compiles on first try',
  'подозрительно. проверь warnings': 'suspicious. check warnings',
  'ноль': 'zero',
  'значит нас подменили': 'then we’ve been swapped',

  // jumps
  'Оп!': 'Up!',
  'Пружиню!': 'Springing!',
  'Levitate.anim!': 'Levitate.anim!',
  'это просто jump, lol': "that's just a jump, lol",
  'Y-offset': 'Y-offset',
  'vector.up': 'vector.up',
  'Гравитация, catch!': 'Gravity, catch!',
  'descent confirmed': 'descent confirmed',
  'Паркур!': 'Parkour!',
  'obstacle bypass!': 'obstacle bypass!',
  'detour': 'detour',
  'obstacle. hopping over.': 'obstacle. hopping over.',
  'Застрял! РРР!': 'Stuck! RRR!',
  'Navmesh broken!': 'Navmesh broken!',
  'collision error': 'collision error',
  'path blocked': 'path blocked',
  // button
  'Я НАЖАЛ КНОПКУ!': 'I PRESSED THE BUTTON!',
  'вижу. post-process моргает': 'i see. post-process flickering',
  'Смотри, магия!': 'Look, magic!',
  'это script, а не магия': "it's a script, not magic",
  'event триггернулся.': 'event triggered.',
  'Ещё, нажми ещё!': 'Again, press again!',

  // behavior
  'А ну иди сюда!': 'Come here you!',
  'Покидаю зону. Escape.exe': 'Leaving the zone. Escape.exe',
  'Я тебя всё равно догоню!': "I'll catch you anyway!",
  'Мой ping 12 мс. Не догонишь.': "My ping is 12 ms. You won't.",
  'Dance battle!': 'Dance battle!',
  '*грувит на 128 bpm*': '*grooves at 128 bpm*',
  'твой стиль — robot?': 'your style — robot?',
  'статистически точный robot': 'statistically precise robot',
  'эм. я в углу.': 'um. i’m in the corner.',
  '*смеётся бесшумно*': '*laughs silently*',
  'navmesh предал меня': 'navmesh betrayed me',
  'ты предал navmesh': 'you betrayed navmesh',
  'ball.throw()': 'ball.throw()',
  'ЛОВЛЮ!': 'CATCHING!',
  'она в 3.14 см левее': "it's 3.14 cm to the left",
  '*ловит головой*': '*catches with head*',
  'гляделки. готов?': 'staring contest. ready?',
  'у меня нет век': "i have no eyelids",
  'это читерство': "that's cheating",
  'это ТТХ': "that's spec",
  'смотри, тень как дракон!': 'look, the shadow is a dragon!',
  'это просто ambient occlusion': "that's just ambient occlusion",
  'у меня дракон': 'i have a dragon',
  'прячусь!': 'hiding!',
  'ты за одним пикселем': "you're behind one pixel",
  'он мой размер': "it's my size",
  'справедливо': 'fair',
  'повторяй за мной': 'copy me',
  '*машет*': '*waves*',
  '*машет с задержкой 1 кадр*': '*waves with 1-frame delay*',
  'lag у тебя': 'you got lag',
  'гонка до края!': 'race to the edge!',
  'три, два, один': 'three, two, one',
  'ЧИТ!': 'CHEAT!',
  'ты стартанул на "два"': 'you started on "two"',
  'камень-ножницы': 'rock-paper-scissors',
  'я всегда камень': "i'm always rock",
  'почему': 'why',
  'я и есть камень': "i am a rock",
  'планка. 30 секунд.': 'plank. 30 seconds.',
  'я художник, у меня талант': "i'm an artist, i have talent",
  'это не отмазка': "that's not an excuse",
  'в UE5 это отмазка': 'in UE5 that’s an excuse',
  'тык': 'poke',
  'stop': 'stop',
  'STOP': 'STOP',
  'ЭХОО!': 'ECHOOO!',
  'нет reverb bus': 'no reverb bus',
  '*добавляет reverb*': '*adds reverb*',
  'эхо-о-о...': 'ech-o-o-o...',
  'синхронный zzz?': 'synced zzz?',
  'sleep(5)': 'sleep(5)',
  '*zzz*': '*zzz*',
  '*zzz, но ровно*': '*zzz, but precise*',
  'HIGH-FIVE!': 'HIGH-FIVE!',
  '*касание: зарегистрировано*': '*touch: registered*',
  'ачивка!': 'achievement!',

  // events
  'кофе! оно само!': 'coffee! it spawned itself!',
  'варенье в кружке. принято.': 'jam in a mug. accepted.',
  'шестерёнка. пригодится.': 'a gear. useful.',
  'запчасть! дай пощупаю': 'a part! let me touch',
  'пружина! будем прыгать': 'a spring! we jump now',
  'закон Гука говорит «осторожно»': "Hooke's law says «careful»",
  'ключ. на 14. похоже.': 'a wrench. size 14. probably.',
  'чиним всё подряд!': 'fixing everything!',
  'болтик укатился. лови!': 'a bolt rolled off. catch!',
  'M6, длина 20. стандарт.': 'M6, length 20. standard.',
  'коробка! что внутри?': 'a box! what’s inside?',
  'schrödinger. не открывай.': "schrödinger. don't open.",
  'монетка! +1 очко!': 'a coin! +1 point!',
  'в экономике Tick() инфляция': 'Tick() economy has inflation',
  'тут объект без owner': "there's an object with no owner",
  'ничей значит мой': "no-one's means mine",
  'по spec это называется «воровство»': "spec calls that «theft»",
  'новая платформа! лезу!': 'new platform! climbing!',
  'physics материализовал ещё один коллайдер': 'physics materialized another collider',
  'оно... поехало?': 'did it... move?',
  'мир шевелится! держись!': 'world’s moving! hold on!',
  'это не мир. это static mesh забыл про static': "that's not the world. a static mesh forgot to be static",

  // second pass
  'глянь на атлас. grid кривой': 'look at the atlas. grid is crooked',
  'это ты наклонил голову': "that's you tilting your head",
  '*выпрямляется*': '*straightens up*',
  'теперь кривой ты': 'now you are crooked',
  'нашёл дыру в navmesh': 'found a hole in navmesh',
  'большую?': 'a big one?',
  'ровно под тобой': 'right under you',
  'я её заполняю СОБОЙ': "i'm filling it with MYSELF",
  'Delaunay лучше чем Voronoi': 'Delaunay beats Voronoi',
  'обоснуй': 'prove it',
  'просто посмотри на треугольники': 'just look at the triangles',
  'это не обоснование': 'not an argument',
  'это ЭСТЕТИКА': "that's AESTHETICS",
  'я опять за тобой': "i'm behind you again",
  'z-order. ничего личного': 'z-order. nothing personal',
  'личного НЕТ, но Z+1 МОЁ': 'nothing PERSONAL, but Z+1 is MINE',
  'возьми 0.5. компромисс': 'take 0.5. compromise',
  '*обнимает baseline-линию*': '*hugs the baseline*',
  'она не для этого': "it's not for that",
  'а для чего': 'for what then',
  'для kerning. но... продолжай': 'for kerning. but... carry on',
  'а в чём смысл framerate?': "what's the point of framerate?",
  'чтобы следующий кадр был': 'so that the next frame exists',
  'глубоко': 'deep',
  'нет. буквально': 'no. literal',
  'shader компилится': 'shader compiling',
  '4812 из 5200': '4812 of 5200',
  'можно я ЖИТЬ пойду': 'can i go LIVE',
  'ты в main thread. нельзя': "you're on main thread. no",
  'опиши коммит': 'describe the commit',
  '"норм"': '"fine"',
  'отклонено': 'rejected',
  '"ну норм"': '"eh, fine"',
  'прошло review. стыдно.': 'passed review. shameful.',
  '*тянет CODE за угол*': '*drags CODE by a corner*',
  'отпусти. я не draggable': "let go. i'm not draggable",
  'теперь да': 'now you are',
  'это fraud': "that's fraud",
  'collision — это поцелуй двух объектов': 'collision is the kiss of two objects',
  'это overlap event': "that's an overlap event",
  'так не романтично': 'not romantic',
  'зато правда': 'but true',
  'сегодня вторник?': 'is today tuesday?',
  'да. vsync подтверждает': 'yes. vsync confirms',
  'vsync не знает дней': "vsync doesn't know days",
  'мой знает. он бегает круг каждые 16.6мс': 'mine does. laps every 16.6ms',
  'у тебя UV-шов виден': 'your UV seam is showing',
  'это шрам. боевой': "that's a scar. battle-earned",
  'бой был с Photoshop': 'the fight was with Photoshop',
  'я проиграл': 'i lost',
  '*ставит pivot в центр*': '*puts pivot in center*',
  'это pivot ДЛЯ ВРАЩЕНИЯ': 'that’s a pivot FOR ROTATION',
  'и?': 'and?',
  'мы не вращаемся': "we don't rotate",
  'мы духовно': 'we do, spiritually',
  'хочу кофе': 'want coffee',
  'DeltaTime с последнего — 41 минута': 'DeltaTime since last — 41 minutes',
  'значит пора': 'then it’s time',
  'я налью. ровно 80 мл': "i'll pour. exactly 80 ml",
  'ТЕБЕ поэзия противопоказана': 'poetry is CONTRAINDICATED for you',
  'понедельник — тяжёлый spawn': 'monday is a heavy spawn',
  'статистика согласна': 'statistics agree',
  'ты... ведёшь статистику?': 'you... track statistics?',
  'с 2019. по настроению': 'since 2019. when in the mood',

  // monologue pool
  '...hmm': '...hmm',
  'почти готово': 'almost ready',
  'крч': 'tl;dr',
  'lol': 'lol',
  'brb': 'brb',
  'zzz': 'zzz',
  'o_O': 'o_O',
  'wait what': 'wait what',
  'ага': 'yep',
  'чёт': 'kinda',
  'hm': 'hm',
  'meh': 'meh',
  'ну-ну': 'sure sure',
};

function translate(ru) {
  if (ru in EN_MAP) return EN_MAP[ru];
  return ru; // fallback — keep Russian (t() then shows it literally)
}

// ─── Collect ────────────────────────────────────────────────────────
const newRU = {};
const newEN = {};
let lineCount = 0;

for (const scene of SCENES) {
  if (!scene || !Array.isArray(scene.lines)) continue;
  scene.lines.forEach((line, i) => {
    const key = `dialogue.${scene.id}.l${i + 1}`;
    const text = String(line.text ?? '');
    newRU[key] = text;
    newEN[key] = translate(text);
    lineCount++;
  });
}

let monoCount = 0;
MONOLOGUE_POOL.forEach((text, i) => {
  const key = `bot.monologue.${i + 1}`;
  newRU[key] = text;
  newEN[key] = translate(text);
  monoCount++;
});

// ─── Merge into existing per-scope files ─────────────────────────────
async function readScope(lang, scope) {
  try {
    const raw = await readFile(path.join(TRANSLATIONS_DIR, lang, `${scope}.json`), 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

async function mergeInto(lang, patch) {
  const buckets = {};
  for (const s of SCOPES) buckets[s] = await readScope(lang, s);
  for (const [k, v] of Object.entries(patch)) buckets[scopeOf(k)][k] = v;
  for (const s of SCOPES) {
    const sorted = Object.fromEntries(Object.keys(buckets[s]).sort().map((k) => [k, buckets[s][k]]));
    await writeFile(path.join(TRANSLATIONS_DIR, lang, `${s}.json`), JSON.stringify(sorted), 'utf8');
  }
}

await mergeInto('ru', newRU);
await mergeInto('en', newEN);

console.log(`[dialogues-i18n] scenes=${SCENES.length} lines=${lineCount} monologue=${monoCount}`);
console.log(`[dialogues-i18n] wrote translations/{en,ru}/{common,plugin,dialogue}.json`);

// Stats: how many EN keys got actual translations vs RU fallback.
const translatedCount = Object.entries(newEN).filter(([k, v]) => v !== newRU[k]).length;
console.log(`[dialogues-i18n] EN translations: ${translatedCount}/${lineCount + monoCount} (rest = RU passthrough)`);
