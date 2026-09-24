#include "load_surfaces.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "decomp/include/types.h"
#include "decomp/include/surface_terrains.h"
#include "decomp/engine/math_util.h"
#include "decomp/shim.h"

#include "debug_print.h"

struct LoadedSurfaceObject
{
    struct SM64SurfaceObjectTransform *transform;
    uint32_t surfaceCount;
    struct SM64Surface *libSurfaces;
    struct SM64SurfaceCollisionData *engineSurfaces;
};

static uint32_t s_static_surface_count = 0;
static struct SM64SurfaceCollisionData *s_static_surface_list = NULL;

static uint32_t s_surface_object_count = 0;
static struct LoadedSurfaceObject *s_surface_object_list = NULL;

#define CONVERT_ANGLE( x ) ((s16)( -(x) / 180.0f * 32768.0f ))

static void init_transform( struct SM64SurfaceObjectTransform *out, const struct SM64ObjectTransform *in )
{
    out->aVelX = 0.0f;
    out->aVelY = 0.0f;
    out->aVelZ = 0.0f;
    out->aPosX = in->position[0];
    out->aPosY = in->position[1];
    out->aPosZ = in->position[2];

    out->aAngleVelPitch = 0.0f;
    out->aAngleVelYaw   = 0.0f;
    out->aAngleVelRoll  = 0.0f;
    out->aFaceAnglePitch = CONVERT_ANGLE(in->eulerRotation[0]);
    out->aFaceAngleYaw   = CONVERT_ANGLE(in->eulerRotation[1]);
    out->aFaceAngleRoll  = CONVERT_ANGLE(in->eulerRotation[2]);
}

static void update_transform( struct SM64SurfaceObjectTransform *out, const struct SM64ObjectTransform *in )
{
    out->aVelX = in->position[0] - out->aPosX;
    out->aVelY = in->position[1] - out->aPosY;
    out->aVelZ = in->position[2] - out->aPosZ;
    out->aPosX = in->position[0];
    out->aPosY = in->position[1];
    out->aPosZ = in->position[2];

    s16 inX = CONVERT_ANGLE(in->eulerRotation[0]);
    s16 inY = CONVERT_ANGLE(in->eulerRotation[1]);
    s16 inZ = CONVERT_ANGLE(in->eulerRotation[2]);

    out->aAngleVelPitch = inX - out->aFaceAnglePitch;
    out->aAngleVelYaw   = inY - out->aFaceAngleYaw;
    out->aAngleVelRoll  = inZ - out->aFaceAngleRoll;
    out->aFaceAnglePitch = inX;
    out->aFaceAngleYaw   = inY;
    out->aFaceAngleRoll  = inZ;
}

/**
 * Returns whether a surface has exertion/moves Mario
 * based on the surface type.
 */
static s32 surface_has_force(s16 surfaceType) {
    s32 hasForce = FALSE;

    switch (surfaceType) {
        case SURFACE_0004: // Unused
        case SURFACE_FLOWING_WATER:
        case SURFACE_DEEP_MOVING_QUICKSAND:
        case SURFACE_SHALLOW_MOVING_QUICKSAND:
        case SURFACE_MOVING_QUICKSAND:
        case SURFACE_HORIZONTAL_WIND:
        case SURFACE_INSTANT_MOVING_QUICKSAND:
            hasForce = TRUE;
            break;

        default:
            break;
    }
    return hasForce;
}

static void engine_surface_from_lib_surface( struct SM64SurfaceCollisionData *surface, const struct SM64Surface *libSurf, struct SM64SurfaceObjectTransform *transform )
{
    int16_t type = libSurf->type;
    int16_t force = libSurf->force;
    s32 x1 = libSurf->vertices[0][0];
    s32 y1 = libSurf->vertices[0][1];
    s32 z1 = libSurf->vertices[0][2];
    s32 x2 = libSurf->vertices[1][0];
    s32 y2 = libSurf->vertices[1][1];
    s32 z2 = libSurf->vertices[1][2];
    s32 x3 = libSurf->vertices[2][0];
    s32 y3 = libSurf->vertices[2][1];
    s32 z3 = libSurf->vertices[2][2];

    s32 maxY, minY;
    f32 nx, ny, nz;
    f32 mag;

    if( transform != NULL )
    {
        Mat4 m;
        Vec3s rotation = { transform->aFaceAnglePitch, transform->aFaceAngleYaw, transform->aFaceAngleRoll };
        Vec3f position = { transform->aPosX, transform->aPosY, transform->aPosZ };
        mtxf_rotate_zxy_and_translate(m, position, rotation);

        Vec3f v1 = { x1, y1, z1 };
        Vec3f v2 = { x2, y2, z2 };
        Vec3f v3 = { x3, y3, z3 };

        mtxf_mul_vec3f( m, v1 );
        mtxf_mul_vec3f( m, v2 );
        mtxf_mul_vec3f( m, v3 );

        x1 = v1[0]; y1 = v1[1]; z1 = v1[2];
        x2 = v2[0]; y2 = v2[1]; z2 = v2[2];
        x3 = v3[0]; y3 = v3[1]; z3 = v3[2];

        surface->transform = transform;
    }
    else
    {
        surface->transform = NULL;
    }

    // (v2 - v1) x (v3 - v2)
    // Smooth64: 64-bit products; in s32 a large triangle's normal wrapped and could flip.
    nx = (s64)(y2 - y1) * (z3 - z2) - (s64)(z2 - z1) * (y3 - y2);
    ny = (s64)(z2 - z1) * (x3 - x2) - (s64)(x2 - x1) * (z3 - z2);
    nz = (s64)(x2 - x1) * (y3 - y2) - (s64)(y2 - y1) * (x3 - x2);
    mag = sqrtf(nx * nx + ny * ny + nz * nz);

    // Could have used min_3 and max_3 for this...
    minY = y1;
    if (y2 < minY) {
        minY = y2;
    }
    if (y3 < minY) {
        minY = y3;
    }

    maxY = y1;
    if (y2 > maxY) {
        maxY = y2;
    }
    if (y3 > maxY) {
        maxY = y3;
    }

    if (mag < 0.0001) {
        DEBUG_PRINT("ERROR: normal magnitude is very close to zero:");
        DEBUG_PRINT("v1 %i %i %i", x1, y1, z1 );
        DEBUG_PRINT("v2 %i %i %i", x2, y2, z2 );
        DEBUG_PRINT("v3 %i %i %i", x3, y3, z3 );
        surface->isValid = 0;
        return;
    }

    mag = (f32)(1.0 / mag);
    nx *= mag;
    ny *= mag;
    nz *= mag;

    surface->vertex1[0] = x1;
    surface->vertex2[0] = x2;
    surface->vertex3[0] = x3;

    surface->vertex1[1] = y1;
    surface->vertex2[1] = y2;
    surface->vertex3[1] = y3;

    surface->vertex1[2] = z1;
    surface->vertex2[2] = z2;
    surface->vertex3[2] = z3;

    surface->normal.x = nx;
    surface->normal.y = ny;
    surface->normal.z = nz;

    surface->originOffset = -(nx * x1 + ny * y1 + nz * z1);

    surface->lowerY = minY - 5;
    surface->upperY = maxY + 5;

    s16 hasForce = surface_has_force(type);
    s16 flags = 0; // surf_has_no_cam_collision(type);

    surface->room = 0;
    surface->type = type;
    surface->flags = (s8) flags;
    surface->terrain = libSurf->terrain;

    if (hasForce) {
        surface->force = force;
    } else {
        surface->force = 0;
    }

    surface->isValid = 1;
}

uint32_t loaded_surface_iter_group_count( void )
{
    return 1 + s_surface_object_count;
}

uint32_t loaded_surface_iter_group_size( uint32_t groupIndex )
{
    if( groupIndex == 0 )
        return s_static_surface_count;

    return s_surface_object_list[ groupIndex - 1 ].surfaceCount;
}

struct SM64SurfaceCollisionData *loaded_surface_iter_get_at_index( uint32_t groupIndex, uint32_t surfaceIndex )
{
    if( groupIndex == 0 )
        return &s_static_surface_list[ surfaceIndex ];

    return &s_surface_object_list[ groupIndex - 1 ].engineSurfaces[ surfaceIndex ];
}

/* Smooth64: a grid over the static surfaces, as the original game kept (its
 * cells were 1,024 units over a fixed 16,384-unit square); libsm64 scanned
 * every surface instead, so each query cost grew with the world. Each cell
 * lists, in load order, every surface whose bounds widened by GRID_REACH
 * touch it. A floor or ceiling lookup needs its point inside the surface's
 * bounds, and a wall check reaches at most 200 / cos 45 = 283 units from
 * them, so a cell holds every static surface a query there could match, in
 * the order the full scan met them: collision results are unchanged. */
#define GRID_REACH 512
static s64 s_grid_x0, s_grid_z0, s_grid_size;
static uint32_t s_grid_w, s_grid_h;
static uint32_t *s_grid_start = NULL, *s_grid_items = NULL;

static void grid_span( const struct SM64SurfaceCollisionData *s, s64 *x0, s64 *x1, s64 *z0, s64 *z1 )
{
    s64 minX = s->vertex1[0], maxX = minX, minZ = s->vertex1[2], maxZ = minZ;
    const int32_t *v[2] = { s->vertex2, s->vertex3 };
    for( int k = 0; k < 2; ++k )
    {
        if( v[k][0] < minX ) minX = v[k][0];
        if( v[k][0] > maxX ) maxX = v[k][0];
        if( v[k][2] < minZ ) minZ = v[k][2];
        if( v[k][2] > maxZ ) maxZ = v[k][2];
    }
    *x0 = (minX - GRID_REACH - s_grid_x0) / s_grid_size;
    *x1 = (maxX + GRID_REACH - s_grid_x0) / s_grid_size;
    *z0 = (minZ - GRID_REACH - s_grid_z0) / s_grid_size;
    *z1 = (maxZ + GRID_REACH - s_grid_z0) / s_grid_size;
}

static void grid_free( void )
{
    free( s_grid_start );
    free( s_grid_items );
    s_grid_start = s_grid_items = NULL;
    s_grid_w = s_grid_h = 0;
}

static void grid_build( void )
{
    s64 minX = 0, maxX = 0, minZ = 0, maxZ = 0, x0, x1, z0, z1;
    int any = 0;

    grid_free();
    for( uint32_t i = 0; i < s_static_surface_count; ++i )
    {
        const struct SM64SurfaceCollisionData *s = &s_static_surface_list[i];
        if( !s->isValid ) continue;
        const int32_t *v[3] = { s->vertex1, s->vertex2, s->vertex3 };
        for( int k = 0; k < 3; ++k )
        {
            if( !any || v[k][0] < minX ) minX = v[k][0];
            if( !any || v[k][0] > maxX ) maxX = v[k][0];
            if( !any || v[k][2] < minZ ) minZ = v[k][2];
            if( !any || v[k][2] > maxZ ) maxZ = v[k][2];
            any = 1;
        }
    }
    if( !any ) return;
    s_grid_x0 = minX - GRID_REACH;
    s_grid_z0 = minZ - GRID_REACH;

    // Cells start at the original's 1,024 units and double until the grid,
    // and the lists of surfaces that cover many cells, stay small.
    for( s_grid_size = 1024;; s_grid_size *= 2 )
    {
        s64 w = (maxX + GRID_REACH - s_grid_x0) / s_grid_size + 1, h = (maxZ + GRID_REACH - s_grid_z0) / s_grid_size + 1, entries = 0;
        if( w * h > (1 << 20) ) continue;
        for( uint32_t i = 0; i < s_static_surface_count; ++i )
        {
            if( !s_static_surface_list[i].isValid ) continue;
            grid_span( &s_static_surface_list[i], &x0, &x1, &z0, &z1 );
            entries += (x1 - x0 + 1) * (z1 - z0 + 1);
        }
        if( w * h > 1 && entries > 64 * (s64)s_static_surface_count + (1 << 16) ) continue;
        s_grid_w = (uint32_t)w;
        s_grid_h = (uint32_t)h;
        break;
    }

    uint32_t cells = s_grid_w * s_grid_h, *fill;
    s_grid_start = calloc( cells + 1, sizeof( uint32_t ));
    fill = malloc( cells * sizeof( uint32_t ));
    if( s_grid_start == NULL || fill == NULL ) { free( fill ); grid_free(); return; }
    for( uint32_t i = 0; i < s_static_surface_count; ++i )
    {
        if( !s_static_surface_list[i].isValid ) continue;
        grid_span( &s_static_surface_list[i], &x0, &x1, &z0, &z1 );
        for( s64 z = z0; z <= z1; ++z ) for( s64 x = x0; x <= x1; ++x ) s_grid_start[z * s_grid_w + x + 1]++;
    }
    for( uint32_t c = 0; c < cells; ++c ) s_grid_start[c + 1] += s_grid_start[c];
    s_grid_items = malloc( s_grid_start[cells] * sizeof( uint32_t ) + 1 );
    if( s_grid_items == NULL ) { free( fill ); grid_free(); return; }
    memcpy( fill, s_grid_start, cells * sizeof( uint32_t ));
    for( uint32_t i = 0; i < s_static_surface_count; ++i )
    {
        if( !s_static_surface_list[i].isValid ) continue;
        grid_span( &s_static_surface_list[i], &x0, &x1, &z0, &z1 );
        for( s64 z = z0; z <= z1; ++z ) for( s64 x = x0; x <= x1; ++x ) s_grid_items[fill[z * s_grid_w + x]++] = i;
    }
    free( fill );
}

/* Smooth64: the static surfaces a query at [x, z] could match, in load order.
 * Without a grid (out of memory, or no valid surfaces), *items is NULL and the
 * count covers every static surface. */
uint32_t loaded_static_cell( f32 x, f32 z, const uint32_t **items )
{
    *items = NULL;
    if( s_grid_start == NULL ) return s_static_surface_count;
    double cx = floor(( (double)x - s_grid_x0 ) / s_grid_size ), cz = floor(( (double)z - s_grid_z0 ) / s_grid_size );
    if( !( cx >= 0 && cx < s_grid_w && cz >= 0 && cz < s_grid_h )) return 0;
    uint32_t c = (uint32_t)cz * s_grid_w + (uint32_t)cx;
    *items = s_grid_items + s_grid_start[c];
    return s_grid_start[c + 1] - s_grid_start[c];
}

void surfaces_load_static( const struct SM64Surface *surfaceArray, uint32_t numSurfaces )
{
    if( s_static_surface_list != NULL )
        free( s_static_surface_list );

    s_static_surface_count = numSurfaces;
    s_static_surface_list = malloc( sizeof( struct SM64SurfaceCollisionData ) * numSurfaces );

    for( int i = 0; i < numSurfaces; ++i )
        engine_surface_from_lib_surface( &s_static_surface_list[i], &surfaceArray[i], NULL );
    grid_build();
}

uint32_t surfaces_load_object( const struct SM64SurfaceObject *surfaceObject )
{
    bool pickedOldIndex = false;
    uint32_t idx = s_surface_object_count;

    for( int i = 0; i < s_surface_object_count; ++i )
    {
        if( s_surface_object_list[i].surfaceCount == 0 )
        {
            pickedOldIndex = true;
            idx = i;
            break;
        }
    }

    if( !pickedOldIndex )
    {
        idx = s_surface_object_count;
        s_surface_object_count++;
        s_surface_object_list = realloc( s_surface_object_list, s_surface_object_count * sizeof( struct LoadedSurfaceObject ));
    }

    struct LoadedSurfaceObject *obj = &s_surface_object_list[idx];

    obj->surfaceCount = surfaceObject->surfaceCount;

    obj->transform = malloc( sizeof( struct SM64SurfaceObjectTransform ));
    init_transform( obj->transform, &surfaceObject->transform );

    obj->libSurfaces = malloc( obj->surfaceCount * sizeof( struct SM64Surface ));
    memcpy( obj->libSurfaces, surfaceObject->surfaces, obj->surfaceCount * sizeof( struct SM64Surface ));

    obj->engineSurfaces = malloc( obj->surfaceCount * sizeof( struct SM64SurfaceCollisionData ));
    for( int i = 0; i < obj->surfaceCount; ++i )
        engine_surface_from_lib_surface( &obj->engineSurfaces[i], &obj->libSurfaces[i], obj->transform );

    return idx;
}

void surfaces_unload_object( uint32_t objId )
{
    if( objId >= s_surface_object_count || s_surface_object_list[objId].surfaceCount == 0 )
    {
        DEBUG_PRINT("Tried to unload non-existant surface object with ID: %u", objId);
        return;
    }

    free( s_surface_object_list[objId].transform );
    free( s_surface_object_list[objId].libSurfaces );
    free( s_surface_object_list[objId].engineSurfaces );

    s_surface_object_list[objId].surfaceCount = 0;
    s_surface_object_list[objId].transform = NULL;
    s_surface_object_list[objId].libSurfaces = NULL;
    s_surface_object_list[objId].engineSurfaces = NULL;
}

void surface_object_update_transform( uint32_t objId, const struct SM64ObjectTransform *newTransform )
{
    if( objId >= s_surface_object_count || s_surface_object_list[objId].surfaceCount == 0 )
    {
        DEBUG_PRINT("Tried to update non-existant surface object with ID: %u", objId);
        return;
    }

    update_transform( s_surface_object_list[objId].transform, newTransform );
    for( int i = 0; i < s_surface_object_list[objId].surfaceCount; ++i )
    {
        struct LoadedSurfaceObject *obj = &s_surface_object_list[objId];
        engine_surface_from_lib_surface( &obj->engineSurfaces[i], &obj->libSurfaces[i], obj->transform );
    }
}

struct SM64SurfaceObjectTransform *surfaces_object_get_transform_ptr( uint32_t objId )
{
    if( objId >= s_surface_object_count || s_surface_object_list[objId].surfaceCount == 0 )
        return NULL;

    return s_surface_object_list[objId].transform;
}

void surfaces_unload_all( void )
{
    free( s_static_surface_list );
    s_static_surface_count = 0;
    s_static_surface_list = NULL;
    grid_free();

    for( int i = 0; i < s_surface_object_count; ++i )
        surfaces_unload_object( i );

    free( s_surface_object_list );
    s_surface_object_count = 0;
    s_surface_object_list = NULL;
}
