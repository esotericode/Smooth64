/* Host services deliberately have no Nintendo sound/asset implementation.
 * play_sound only records the upstream request (its 32-bit sound ID) so the
 * caller can voice it with its own samples; see s64_sounds in smooth64.h. */
#include "decomp/include/types.h"
#include "decomp/audio/external.h"
#include "decomp/game/sound_init.h"
#include "play_sound.h"
#include "sound_log.h"
u32 gAudioRandom = 0;
f32 gGlobalSoundSource[3] = {0,0,0};
SM64PlaySoundFunctionPtr g_play_sound_func = 0;
uint32_t s64_sound_log[S64_MAX_SOUNDS];
uint32_t s64_sound_log_count = 0;
void play_sound(u32 bits, f32 *position) {
    (void)position;
    if (s64_sound_log_count < S64_MAX_SOUNDS) s64_sound_log[s64_sound_log_count++] = bits;
}
void stop_sound(u32 bits, f32 *position) { (void)bits; (void)position; }
void play_cap_music(u16 sequence) { (void)sequence; }
void fadeout_cap_music(void) {}
void stop_cap_music(void) {}
void fadeout_music(s16 frames) { (void)frames; }
void fadeout_level_music(s16 frames) { (void)frames; }
void play_cutscene_music(u16 sequence) { (void)sequence; }
