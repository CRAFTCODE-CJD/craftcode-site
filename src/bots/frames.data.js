// ════════════════════════════════════════════════════
//  CraftCode companions — sprite animation tables
// ════════════════════════════════════════════════════
//  Synchronized with:
//    • public/sprites/ANIMATIONS.md          (frame catalog § 3)
//    • Scripts/generate_companions.py        (source of truth for png)
//
//  Exports:
//    FRAME_ORDER    — 92-name array, index is identical in craft.png and code.png
//    fIdx(name)     — safe frame-index lookup (unknown → 0 / idle_a)
//    CLIPS          — named animations the engine can play
//    STATE_TO_CLIP  — legacy state-string → clip-name bridge
//
//  Extending: add a new frame to FRAME_ORDER (at the end, never insert), add
//  a new CLIPS entry using its name, and regen the sprite sheets. Nothing
//  in the engine changes.
// ════════════════════════════════════════════════════

export const FRAME_ORDER = [
  // 3.1 Locomotion (0–20)
  'idle_a','idle_b','breath_in','breath_out','blink',
  'walk_a','walk_e','walk_c','walk_d','walk_b','walk_f',
  'climb_a','climb_b',
  'jump_crouch','jump_launch','jump_air','jump_land',
  'tumble_0','tumble_90','tumble_180','tumble_270',
  // 3.2 Reactions (21–38)
  'surprise_pre','surprise','surprise_hold',
  'hit_squash','hit_stars','hit_recover',
  'dizzy_swayL','dizzy_stand','dizzy_swayR','dizzy_birds',
  'laugh_bounceup','laugh_bouncedn','laugh_wipetear','laugh_chuckle',
  'facepalm_raise','facepalm_palm','facepalm_shake','facepalm_drop',
  // 3.3 Expressions (39–45)
  'talk_a','talk_b','mouth_o','mouth_e',
  'wave_a','wave_b','excited',
  // 3.4 Work (46–59)
  'typing_a','typing_b','L_press','R_press',
  'carry_stepL','carry_stepR',
  'hammer_up','hammer_mid','hammer_strike',
  'bar_0','bar_25','bar_50','bar_100','bar_check',
  // 3.5 Thought / ideation (60–66)
  'idea_a','idea_b','think_a','think_b','bubble_sm','bubble_lg','flash',
  // 3.6 Social / pair interactions (67–88)
  'dance_leanL','dance_armsup','dance_leanR','dance_spin1','dance_spin2','dance_hop',
  'poke_reach','poke_poke','poke_retreat',
  'hifive_approach','hifive_raise','hifive_slap','hifive_retract',
  'throw_windup','throw_release','throw_follow','throw_recover',
  'rest_seated',
  'win_crouch','win_launch','win_peak','win_land',
  // 3.7 Sleep (89–91)
  'sleep','sleep_1z','sleep_3z',
];

export const fIdx = (name) => {
  const i = FRAME_ORDER.indexOf(name);
  return i < 0 ? 0 : i;   // unknown → idle_a, never crash
};

// ── CLIPS — named animations the engine can play ──
//
//  Each clip is { frames: string[], fps: number, loop: boolean, owner?, hold? }
//    frames — frame names (resolved through fIdx at play time)
//    fps    — frames per second
//    loop   — if false, clip holds final frame then onEnd fires
//    owner  — 'craft'|'code' — owner-only clip; wrong bot falls back to idle
//    hold   — ms to keep final frame after reaching end (only when loop=false)
//
//  Authors (scenes, physics, AI) reference clips by NAME, never index —
//  that's the whole point of the indirection.
export const CLIPS = {
  idle:     { frames: ['idle_a','idle_b','idle_a','blink','idle_a','breath_in','breath_out'], fps: 2.2, loop: true },
  walk:     { frames: ['walk_a','walk_e','walk_c','walk_d','walk_b','walk_f'], fps: 11, loop: true },
  climb:    { frames: ['climb_a','climb_b'],                                                 fps: 8,  loop: true },
  jump_up:  { frames: ['jump_crouch','jump_launch','jump_air'],                              fps: 10, loop: false, hold: 120 },
  jump_dn:  { frames: ['jump_air','jump_land'],                                              fps: 8,  loop: false, hold: 180 },
  tumble:   { frames: ['tumble_0','tumble_90','tumble_180','tumble_270'],                    fps: 14, loop: true },

  surprise: { frames: ['surprise_pre','surprise','surprise_hold','surprise_hold'],           fps: 5,  loop: false, hold: 400 },
  // Dragged by pointer — wide eyes + O mouth, with a subtle L/R sway
  // to feel "dangled". Loops as long as the pointer is down.
  held:     { frames: ['surprise','surprise_hold','dizzy_swayL','surprise_hold','dizzy_swayR','surprise_hold'], fps: 7, loop: true },
  hit:      { frames: ['hit_squash','hit_stars','hit_stars','hit_stars','hit_recover'],      fps: 5,  loop: false, hold: 250 },
  dizzy:    { frames: ['dizzy_swayL','dizzy_stand','dizzy_swayR','dizzy_stand','dizzy_birds'], fps: 5, loop: true },
  laugh:    { frames: ['laugh_bounceup','laugh_bouncedn','laugh_bounceup','laugh_wipetear','laugh_chuckle'], fps: 6, loop: true },
  facepalm: { frames: ['facepalm_raise','facepalm_palm','facepalm_shake','facepalm_shake','facepalm_drop'], fps: 6, loop: false, hold: 300 },

  talk:     { frames: ['talk_a','mouth_o','talk_b','mouth_e'],                               fps: 9,  loop: true },
  wave:     { frames: ['wave_a','wave_b'],                                                   fps: 5,  loop: true },
  excited:  { frames: ['excited','excited','idle_b','excited'],                              fps: 6,  loop: true },

  typing:   { frames: ['typing_a','typing_b','L_press','typing_a','typing_b','R_press'],     fps: 10, loop: true },
  carry:    { frames: ['carry_stepL','carry_stepR'],                                         fps: 8,  loop: true },

  hammer:   { frames: ['hammer_up','hammer_mid','hammer_strike','hammer_mid'],               fps: 7,  loop: true, owner: 'craft' },
  bar:      { frames: ['bar_0','bar_25','bar_50','bar_100','bar_check'],                     fps: 3,  loop: false, owner: 'code', hold: 400 },

  idea:     { frames: ['bubble_sm','bubble_lg','flash','idea_a','idea_b'],                   fps: 5,  loop: false, hold: 350 },
  think:    { frames: ['think_a','think_b'],                                                 fps: 9,  loop: true },
  bubble:   { frames: ['bubble_sm','bubble_lg'],                                             fps: 3,  loop: true },

  dance:    { frames: ['dance_leanL','dance_armsup','dance_leanR','dance_spin1','dance_spin2','dance_hop'], fps: 8, loop: true },
  poke:     { frames: ['poke_reach','poke_poke','poke_retreat'],                             fps: 8,  loop: false, hold: 150 },
  hifive:   { frames: ['hifive_approach','hifive_raise','hifive_slap','hifive_retract'],     fps: 8,  loop: false, hold: 200 },
  throwAct: { frames: ['throw_windup','throw_release','throw_follow','throw_recover'],       fps: 10, loop: false, hold: 200 },
  rest:     { frames: ['rest_seated'],                                                       fps: 1,  loop: true },
  win:      { frames: ['win_crouch','win_launch','win_peak','win_peak','win_land'],          fps: 9,  loop: false, hold: 300 },

  sleep:    { frames: ['sleep','sleep_1z','sleep_3z','sleep_1z'],                            fps: 1.3, loop: true },

  // ── Macro / combo clips (composed from existing frames, no new PNGs) ──
  //
  // These feed the "life simulation" macros: a bot meditating on the
  // shelf, two bots sharing a laptop during handoff, a quiet victory
  // after completing a Chertyozh № 7 stage. Constructed purely by
  // selecting and sequencing existing FRAME_ORDER entries.

  stargaze:         { frames: ['breath_in'],                                                fps: 1,    loop: true  },
  coffee_sip:       { frames: ['rest_seated','talk_b','rest_seated','idle_a'],              fps: 2,    loop: false, hold: 1000 },
  share_laptop:     { frames: ['idea_b'],                                                   fps: 1,    loop: true  },
  cheer:            { frames: ['win_peak','excited'],                                       fps: 6,    loop: true  },
  silent_stare:     { frames: ['idle_a','idle_b'],                                          fps: 0.5,  loop: true  },
  // CODE-only — microtyping in the air while doing a measurement pose
  measure_distance: { frames: ['L_press','idle_a','R_press','idle_a'],                      fps: 4,    loop: true, owner: 'code'  },
  // CRAFT-only — hands moving like sculpting
  sketch_air:       { frames: ['climb_a','climb_b','excited','climb_b'],                    fps: 6,    loop: true, owner: 'craft' },

  // Single-pose expressions — each one holds exactly one laugh frame.
  // Useful when a scene wants a SPECIFIC emotional pose (a chuckle vs a
  // full belly laugh) instead of the looping `laugh` cycle.
  chuckle:          { frames: ['laugh_chuckle'],                                            fps: 1,    loop: true  },
  wipe_tear:        { frames: ['laugh_wipetear'],                                           fps: 1,    loop: true  },
};

// Legacy `setCharState` values that dialogue lines + physics still use.
// Maps state-string → clip name so the old API keeps working while the
// sprite now flips through the 92-frame catalog instead of the old 20-frame sheet.
export const STATE_TO_CLIP = {
  idle:      'idle',
  walking:   'walk',
  falling:   'tumble',    // airborne post-throw tumbles while spinning
  dragging:  'held',      // finger grabbed — surprised + sway, NOT tumble
  talking:   'talk',
  surprised: 'surprise',
  excited:   'excited',
  sleeping:  'sleep',
  waving:    'wave',
  typing:    'typing',
  idea:      'idea',      // one-shot, falls back via onEnd
  thinking:  'think',
};
