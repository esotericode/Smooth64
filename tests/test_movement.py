"""Behavior checks against the US decomp's rules, NOT an N64-ROM oracle.

The exact position/velocity checks cover update order as well as constants.
"""
import json
import math
import unittest
from pathlib import Path
from native import Native, FLAT

NAMES = json.loads((Path(__file__).resolve().parents[1]/"web/actions.json").read_text())


class MovementTests(unittest.TestCase):
    def setUp(self):
        self.c = Native()
        self.c.world(FLAT)
        self.c.reset()

    def name(self, s): return NAMES[str(s.action)]

    def test_stationary_jump_trajectory_and_terminal_gravity(self):
        # set_mario_action_airborne: 42 + speed*0.25; apply_gravity: -4.
        samples=[self.c.tick(buttons=1) for _ in range(22)]
        self.assertEqual([s.position[1] for s in samples[:5]],[42,80,114,144,170])
        self.assertEqual(max(s.position[1] for s in samples),242)
        self.assertEqual(samples[10].velocity[1],-2)
        self.assertEqual(samples[-1].position[1],0)
        self.assertEqual(self.name(samples[-1]),'ACT_JUMP_LAND')

    def test_early_release_reduces_jump_height(self):
        first=self.c.tick(buttons=1)
        second=self.c.tick()
        self.assertEqual(first.velocity[1],38)
        self.assertEqual(second.velocity[1],9.5)  # release quarters velocity, before normal gravity
        peak=second.position[1]
        for _ in range(40): peak=max(peak,self.c.tick().position[1])
        self.assertLess(peak,120)

    def test_lava_boost_hurts_and_coins_heal_by_the_wedge(self):
        # SURFACE_BURNING: check_lava_boost queues 12 hurt units (three wedges).
        lava=[dict(t,type=1) for t in FLAT]
        self.c.world(lava);self.c.reset()
        s=self.c.tick()
        self.assertEqual(self.name(s),'ACT_LAVA_BOOST')
        for _ in range(40): s=self.c.tick()
        self.assertEqual(s.health,0x880-3*0x100)
        # One coin (4 units) is one wedge, applied by update_mario_health.
        self.c.heal(8)
        for _ in range(12): s=self.c.tick()
        self.assertEqual(s.health,0x880-0x100)
        self.c.heal(255)
        for _ in range(80): s=self.c.tick()
        self.assertEqual(s.health,0x880)  # capped like the original

    def test_held_jump_does_not_autohop(self):
        for _ in range(90): s=self.c.tick(buttons=1)
        self.assertEqual(s.position[1],0)
        self.assertEqual(self.name(s),'ACT_IDLE')

    def test_raw_analog_deadzone_and_nonlinear_walk(self):
        for _ in range(10): s=self.c.tick(x=7,y=7)
        self.assertEqual(s.intended,0)
        self.assertEqual(list(s.position),[0,0,0])
        s=self.c.tick(x=38)
        self.assertEqual(s.intended,8)  # (38-6)^2 / 128
        s=self.c.tick(x=127,y=127)
        self.assertEqual(s.intended,32)  # original circular 64-unit clamp

    def test_running_acceleration_and_cap(self):
        self.c.reset(yaw=32768)
        samples=[self.c.tick(y=80) for _ in range(100)]
        # Walking starts at min(intendedMag,8), then uses 1.1-speed/43.
        self.assertAlmostEqual(samples[0].speed,8.91395378112793,places=6)
        # Original speed oscillates around 32; replacing this with a clamp is wrong.
        self.assertTrue(all(31 < s.speed < 32.4 for s in samples[40:]))
        self.assertTrue(all(s.position[2]<=0 for s in samples))
        self.assertTrue(all(s.position[1]==0 for s in samples))

    def test_double_then_triple_jump(self):
        self.c.reset(yaw=32768)
        for _ in range(35): self.c.tick(y=80)
        seen=[]
        for _ in range(3):
            s=self.c.tick(y=80,buttons=1);seen.append(self.name(s))
            for t in range(90):
                s=self.c.tick(y=80,buttons=1 if t<7 else 0)
                if s.position[1]==0 and not s.action&0x800: break
        self.assertEqual(seen,['ACT_JUMP','ACT_DOUBLE_JUMP','ACT_TRIPLE_JUMP'])

    def test_backflip(self):
        for _ in range(8): self.c.tick(buttons=4)
        s=self.c.tick(buttons=5)
        self.assertEqual(self.name(s),'ACT_BACKFLIP')
        self.assertEqual(s.position[1],62)

    def test_turnaround_side_somersault(self):
        self.c.reset(yaw=32768)
        for _ in range(40): self.c.tick(y=80)
        self.assertEqual(self.name(self.c.tick(y=-80)),'ACT_TURNING_AROUND')
        self.assertEqual(self.name(self.c.tick(y=-80,buttons=1)),'ACT_SIDE_FLIP')

    def test_long_jump(self):
        self.c.reset(yaw=32768)
        for _ in range(40): self.c.tick(y=80)
        self.c.tick(y=80,buttons=4)
        s=self.c.tick(y=80,buttons=5)
        self.assertEqual(self.name(s),'ACT_LONG_JUMP')
        self.assertGreater(s.speed,40)
        self.assertAlmostEqual(s.position[1],30,places=4)

    def test_dive_and_ground_pound(self):
        self.c.reset(yaw=32768)
        for _ in range(40): self.c.tick(y=80)
        for _ in range(5): self.c.tick(y=80,buttons=1)
        s=self.c.tick(y=80,buttons=2)
        self.assertEqual(self.name(s),'ACT_DIVE')
        self.c.reset()
        self.c.tick(buttons=1)
        self.assertEqual(self.name(self.c.tick(buttons=2)),'ACT_JUMP_KICK')
        self.c.reset()
        for _ in range(5): self.c.tick(buttons=1)
        s=self.c.tick(buttons=4)
        self.assertEqual(self.name(s),'ACT_GROUND_POUND')
        for _ in range(70): s=self.c.tick()
        self.assertEqual(s.position[1],0)
        self.assertTrue(math.isfinite(s.speed))

    def test_wall_collision_and_wall_kick(self):
        wall=[{'type':0,'vertices':[[-1000,0,-400],[1000,0,-400],[1000,1500,-400]]},
              {'type':0,'vertices':[[-1000,0,-400],[1000,1500,-400],[-1000,1500,-400]]}]
        self.c.world(FLAT+wall);self.c.reset((0,0,0),32768)
        for _ in range(9): self.c.tick(y=80)
        self.c.tick(y=80,buttons=1)
        for t in range(40):
            s=self.c.tick(y=80,buttons=1 if t<8 else 0)
            self.assertGreaterEqual(s.position[2],-400)
            if self.name(s)=='ACT_AIR_HIT_WALL':break
        self.assertEqual(self.name(s),'ACT_AIR_HIT_WALL')
        s=self.c.tick(buttons=1)
        self.assertEqual(self.name(s),'ACT_WALL_KICK_AIR')
        self.assertGreater(s.velocity[1],40)

    def test_reset_and_replay_are_deterministic(self):
        stream=[(30 if i%17<8 else -55,75,(1 if i%25<6 else 0)|(4 if i%71==0 else 0),0) for i in range(240)]
        self.c.reset()
        a=[]
        for tick in stream:self.c.tick(*tick);a.append(self.c.raw())
        self.c.reset()
        b=[]
        for tick in stream:self.c.tick(*tick);b.append(self.c.raw())
        self.assertEqual(a,b)

    def test_invalid_geometry_and_spawn_are_rejected(self):
        self.assertEqual(self.c.lib.s64_add_triangle(0,0,0,0,0,0,0,0,0,0),-1)
        self.assertEqual(self.c.lib.s64_add_triangle(0,40000,0,0,0,0,0,0,0,1),-1)
        self.assertEqual(self.c.lib.s64_reset(float('nan'),0,0,0),-1)
        self.assertEqual(self.c.lib.s64_reset(7000,0,7000,0),-1)


if __name__=='__main__':unittest.main()
