import { advance, canStand, WORLD } from './world';
describe('server movement rules', () => {
  it('keeps avatars within map bounds', () => {
    expect(canStand(0, 0, 'lobby')).toBe(false);
    expect(canStand(WORLD.width, 300, 'lobby')).toBe(false);
  });
  it('collides with furniture', () => {
    expect(canStand(200, 280, 'lobby')).toBe(false);
    expect(canStand(600, 650, 'lobby')).toBe(true);
  });
  it('limits elapsed time and normalizes diagonal speed', () => {
    const p = { x: 600, y: 650 };
    const next = advance(p, 1, 1, 100, 'lobby');
    expect(Math.hypot(next.x - p.x, next.y - p.y)).toBeCloseTo(18);
  });
  it('slides along a wall without crossing it', () => {
    const next = advance({ x: 46, y: 650 }, -1, -1, 0.1, 'lobby');
    expect(next.x).toBe(46);
    expect(next.y).toBeLessThan(650);
  });
});
