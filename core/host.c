#include "smooth64.h"
#include <math.h>
#include <string.h>
#include "decomp/shim.h"
#include "decomp/include/PR/os_cont.h"
#include "decomp/include/mario_animation_ids.h"
#include "decomp/engine/math_util.h"
#include "decomp/engine/graph_node.h"
#include "decomp/engine/surface_collision.h"
#include "decomp/game/mario.h"
#include "decomp/game/object_stuff.h"
#include "load_surfaces.h"
#include "kinematics.inc.h"

_Static_assert(sizeof(S64State) == 80, "Public WASM/native ABI changed");
static struct GlobalState world;
static struct Object character;
static struct Area area;
static struct Camera camera;
static struct SM64Surface triangles[4096];
static unsigned triangle_count;
static int ready;
static S64State snapshot;

void load_mario_animation(struct MarioAnimation *a, u32 index) {
    if (index >= 209) index = 0;
    a->currentAnimAddr = 1 + index;
    a->targetAnim = &kinematics[index];
}

static void publish_state(void) {
    struct MarioState *m = gMarioState;
    memcpy(snapshot.position, m->pos, sizeof(m->pos));
    memcpy(snapshot.velocity, m->vel, sizeof(m->vel));
    snapshot.forward_velocity = m->forwardVel;
    snapshot.floor_height = m->floorHeight;
    snapshot.face_yaw = (float)m->faceAngle[1];
    snapshot.intended_magnitude = m->intendedMag;
    snapshot.action = m->action;
    snapshot.flags = m->flags;
    snapshot.tick = gGlobalTimer;
    snapshot.animation = character.header.gfx.animInfo.animID;
    snapshot.animation_frame = character.header.gfx.animInfo.animFrame;
    snapshot.floor_normal[0] = m->floor ? m->floor->normal.x : 0;
    snapshot.floor_normal[1] = m->floor ? m->floor->normal.y : 1;
    snapshot.floor_normal[2] = m->floor ? m->floor->normal.z : 0;
    snapshot.health = m->health;
    snapshot.action_timer = m->actionTimer;
}

void s64_clear_surfaces(void) { ready = 0; triangle_count = 0; }
int s64_add_triangle(int type, int ax,int ay,int az,
                    int bx,int by,int bz, int cx,int cy,int cz) {
    const int v[3][3] = {{ax,ay,az},{bx,by,bz},{cx,cy,cz}};
    if (triangle_count >= 4096 || type < 0 || type > 32767) return -1;
    for (int i=0;i<3;i++) for(int j=0;j<3;j++)
        if (v[i][j] < -32768 || v[i][j] > 32767) return -1;
    /* Reject degenerates before they reach the upstream surface loader. */
    double ux=bx-ax, uy=by-ay, uz=bz-az, vx=cx-ax, vy=cy-ay, vz=cz-az;
    if (ux*vy-uy*vx == 0 && uy*vz-uz*vy == 0 && uz*vx-ux*vz == 0) return -1;
    struct SM64Surface *s = &triangles[triangle_count++];
    memset(s, 0, sizeof(*s));
    s->type = (int16_t)type;
    memcpy(s->vertices, v, sizeof(v));
    return (int)triangle_count;
}
int s64_commit_surfaces(void) {
    ready = 0;
    surfaces_load_static(triangles, triangle_count);
    return (int)triangle_count;
}

int s64_reset(float x, float y, float z, int face_yaw) {
    ready = 0;
    if (!isfinite(x) || !isfinite(y) || !isfinite(z) ||
        fabsf(x)>32767 || fabsf(y)>32767 || fabsf(z)>32767) return -1;
    memset(&world, 0, sizeof(world));
    memset(&character, 0, sizeof(character));
    memset(&area, 0, sizeof(area));
    memset(&camera, 0, sizeof(camera));
    global_state_bind(&world);
    world.msSwimStrength = MIN_SWIM_STRENGTH;
    area.camera = &camera;
    area.flags = 1;
    gCurrentArea = &area;
    gMarioObject = &character;
    gCurrentObject = &character;
    character.activeFlags = ACTIVE_FLAG_ACTIVE;
    character.hitboxRadius = 37;
    character.hitboxHeight = 160;
    character.header.gfx.node.flags = GRAPH_RENDER_ACTIVE | GRAPH_RENDER_HAS_ANIMATION;
    vec3f_set(character.header.gfx.scale,1,1,1);
    gCurrSaveFileNum = 1;
    vec3f_set(gMarioSpawnInfoVal.startPos,x,y,z);
    vec3s_set(gMarioSpawnInfoVal.startAngle,0,(s16)face_yaw,0);
    init_mario_from_save_file();
    int result = init_mario();
    if (result < 0) { publish_state(); return result; }
    gAreaUpdateCounter = 1;
    set_mario_animation(gMarioState, MARIO_ANIM_IDLE_HEAD_CENTER);
    ready = 1;
    publish_state();
    return 0;
}

/* Directly follows n64decomp/src/game/game_init.c:adjust_analog_stick.
 * The nonlinear intended magnitude lives in upstream mario.c. */
static void adjust_stick(int x, int y) {
    x = x < -128 ? -128 : x > 127 ? 127 : x;
    y = y < -128 ? -128 : y > 127 ? 127 : y;
    gController.rawStickX = x;
    gController.rawStickY = y;
    gController.stickX = x <= -8 ? x + 6 : x >= 8 ? x - 6 : 0;
    gController.stickY = y <= -8 ? y + 6 : y >= 8 ? y - 6 : 0;
    gController.stickMag = sqrtf(gController.stickX*gController.stickX +
                                gController.stickY*gController.stickY);
    if (gController.stickMag > 64) {
        gController.stickX *= 64 / gController.stickMag;
        gController.stickY *= 64 / gController.stickMag;
        gController.stickMag = 64;
    }
}

void s64_tick(int raw_x, int raw_y, unsigned buttons, int camera_yaw) {
    if (!ready) return;
    global_state_bind(&world);
    u16 down = ((buttons & S64_A) ? A_BUTTON : 0) |
               ((buttons & S64_B) ? B_BUTTON : 0) |
               ((buttons & S64_Z) ? Z_TRIG : 0);
    gController.buttonPressed = down & ~gController.buttonDown;
    gController.buttonDown = down;
    adjust_stick(raw_x,raw_y);
    camera.yaw = (s16)camera_yaw;
    bhv_mario_update();
    /* Animation advancement is a simulation operation here, never tied to FPS.
     * Same update/order as upstream geo_set_animation_globals. */
    struct AnimInfo *anim = &character.header.gfx.animInfo;
    if (anim->curAnim) {
        anim->animFrame = geo_update_animation_frame(anim, &anim->animFrameAccelAssist);
        anim->animTimer = gAreaUpdateCounter;
    }
    gAreaUpdateCounter++;
    gGlobalTimer++;
    publish_state();
}

const S64State *s64_state(void) { return &snapshot; }
uint32_t s64_state_size(void) { return sizeof(S64State); }
float s64_floor_height(float x,float y,float z) {
    struct SM64SurfaceCollisionData *floor;
    return find_floor(x,y,z,&floor);
}
