#ifndef SMOOTH64_SOUND_LOG_H
#define SMOOTH64_SOUND_LOG_H
#include <stdint.h>
#include "smooth64.h"
/* Filled by play_sound (silent_host.c), cleared by each s64_tick/s64_reset. */
extern uint32_t s64_sound_log[S64_MAX_SOUNDS];
extern uint32_t s64_sound_log_count;
#endif
