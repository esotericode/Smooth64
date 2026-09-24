#ifndef SMOOTH64_H
#define SMOOTH64_H
#include <stdint.h>

#if defined(_WIN32)
#define S64_API __declspec(dllexport)
#else
#define S64_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* One world / one character. Units and angles are the original game units.
 * Each tick is EXACTLY 1/30 s. The caller owns clock, camera and presentation.
 * This API has no graphics, audio, windowing, ROM or asset dependencies. */
enum { S64_A = 1, S64_B = 2, S64_Z = 4 };
typedef struct S64State {
    float position[3], velocity[3];
    float forward_velocity, floor_height, face_yaw, intended_magnitude;
    uint32_t action, flags, tick;
    int32_t animation, animation_frame;
    float floor_normal[3];
    int32_t health, action_timer;
} S64State;

/* Triangles use original integer coordinates and CCW winding viewed from
 * their collidable side. There is no triangle limit beyond memory. Coordinates
 * may reach +-S64_COORDINATE_LIMIT, which keeps the collision tests' 64-bit
 * integer products exact; movement stays true to the original far inside that
 * (float positions lose precision: about 1/32 unit at 250,000). Returns
 * -1 for an out-of-range, degenerate or unstorable triangle.
 * Clear, add, commit, THEN reset; committing invalidates old floor pointers. */
enum { S64_COORDINATE_LIMIT = 1 << 29 };
S64_API void s64_clear_surfaces(void);
S64_API int s64_add_triangle(int type,
    int ax,int ay,int az, int bx,int by,int bz, int cx,int cy,int cz);
S64_API int s64_commit_surfaces(void);
S64_API int s64_reset(float x, float y, float z, int face_yaw);
/* N64 raw axes [-128,127], +X right, +Y forward. Original deadzone/clamp
 * is applied internally. camera_yaw is the yaw from player toward camera:
 * 0 means camera on +Z, so pressing forward moves toward -Z. */
S64_API void s64_tick(int raw_x, int raw_y, unsigned buttons, int camera_yaw);
S64_API const S64State *s64_state(void);
S64_API uint32_t s64_state_size(void);
S64_API float s64_floor_height(float x, float y, float z);
/* Queue healing the way the original coin interaction does: add to the
 * character's heal counter (4 units = one health wedge; one coin is 4).
 * The upstream health update applies it over the next ticks. Clamped to 255. */
S64_API void s64_heal(int amount);
/* Sound requests made by the original actions during the last s64_tick, in
 * call order, as upstream 32-bit sound IDs: bank << 28 | ID << 16 | priority
 * << 8 | flags. Step, jump and landing IDs include the floor's terrain offset.
 * Continuous (bank 1) sounds repeat on every tick they should keep playing.
 * The core plays nothing; the caller voices IDs with its own samples. At most
 * S64_MAX_SOUNDS per tick; valid until the next core operation. */
enum { S64_MAX_SOUNDS = 16 };
S64_API uint32_t s64_sound_count(void);
S64_API const uint32_t *s64_sounds(void);

#ifdef __cplusplus
}
#endif
#endif
