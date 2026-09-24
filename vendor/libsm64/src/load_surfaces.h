#pragma once

#include "decomp/include/types.h"
#include "libsm64.h"

extern uint32_t loaded_surface_iter_group_count( void );
extern uint32_t loaded_surface_iter_group_size( uint32_t groupIndex );
extern struct SM64SurfaceCollisionData *loaded_surface_iter_get_at_index( uint32_t groupIndex, uint32_t surfaceIndex );
extern uint32_t loaded_static_cell( f32 x, f32 z, const uint32_t **items ); // Smooth64: the static surfaces near [x, z]

extern void surfaces_load_static( const struct SM64Surface *surfaceArray, uint32_t numSurfaces );
extern uint32_t surfaces_load_object( const struct SM64SurfaceObject *surfaceObject );
extern void surface_object_update_transform( uint32_t objId, const struct SM64ObjectTransform *newTransform );
extern struct SM64SurfaceObjectTransform *surfaces_object_get_transform_ptr( uint32_t objId );
extern void surfaces_unload_object( uint32_t objId );
extern void surfaces_unload_all( void );