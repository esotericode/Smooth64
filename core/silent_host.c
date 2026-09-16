/* Host services deliberately have no Nintendo sound/asset implementation. */
#include "decomp/include/types.h"
#include "decomp/audio/external.h"
#include "decomp/game/sound_init.h"
#include "play_sound.h"
u32 gAudioRandom = 0;
f32 gGlobalSoundSource[3] = {0,0,0};
SM64PlaySoundFunctionPtr g_play_sound_func = 0;
void play_sound(u32 bits, f32 *position) { (void)bits; (void)position; }
void stop_sound(u32 bits, f32 *position) { (void)bits; (void)position; }
void play_cap_music(u16 sequence) { (void)sequence; }
void fadeout_cap_music(void) {}
void stop_cap_music(void) {}
void fadeout_music(s16 frames) { (void)frames; }
void fadeout_level_music(s16 frames) { (void)frames; }
void play_cutscene_music(u16 sequence) { (void)sequence; }
