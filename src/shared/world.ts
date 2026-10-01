export const AVATARS = {
  mint: '#369c87',
  sky: '#5b91cb',
  plum: '#a37bb5',
  peach: '#d98765',
  gold: '#bd9b45',
  slate: '#647b8b',
} as const;
export type Avatar = keyof typeof AVATARS;
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface PublicProfile {
  displayName: string;
  avatar: Avatar;
  status: string;
}
export interface Player extends PublicProfile {
  id: number;
  x: number;
  y: number;
  direction: Direction;
}
export interface RoomInfo {
  id: string;
  name: string;
  description: string;
  theme: string;
  capacity: number;
  active: boolean;
  count?: number;
}
export interface ChatMessage {
  id: string;
  userId: number;
  displayName: string;
  text: string;
  createdAt: string;
  scope?: 'room' | 'nearby' | 'system';
}
export interface Snapshot {
  room: RoomInfo;
  players: Player[];
  messages: ChatMessage[];
  selfId: number;
}
export type Reply<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
export interface ClientEvents {
  'room:join': (id: string, ack: (result: Reply<Snapshot>) => void) => void;
  'player:move': (
    move: { dx: number; dy: number },
    ack?: (result: Reply<Player>) => void,
  ) => void;
  'chat:send': (
    message: { text: string; scope: 'room' | 'nearby' },
    ack: (result: Reply) => void,
  ) => void;
}
export interface ServerEvents {
  'world:frame': (frame: {
    roomId: string;
    positions: Pick<Player, 'id' | 'x' | 'y' | 'direction'>[];
  }) => void;
  players: (players: Player[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'session:ended': (reason: string) => void;
}
export const WORLD = {
  width: 1200,
  height: 840,
  radius: 16,
  speed: 180,
  spawn: { x: 600, y: 650 },
};
export interface Furniture {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'table' | 'sofa' | 'plant' | 'shelf';
}
export function furniture(theme: string): Furniture[] {
  const base: Furniture[] = [
    { x: 65, y: 70, w: 60, h: 60, kind: 'plant' },
    { x: 1075, y: 70, w: 60, h: 60, kind: 'plant' },
    { x: 70, y: 740, w: 60, h: 60, kind: 'plant' },
    { x: 1065, y: 740, w: 60, h: 60, kind: 'plant' },
  ];
  if (theme === 'classroom')
    return [
      ...base,
      ...[240, 520, 800].flatMap((x) =>
        [260, 440].map((y) => ({
          x,
          y,
          w: 160,
          h: 70,
          kind: 'table' as const,
        })),
      ),
      { x: 400, y: 80, w: 400, h: 45, kind: 'shelf' },
    ];
  if (theme === 'consultation')
    return [
      ...base,
      { x: 470, y: 320, w: 260, h: 110, kind: 'table' },
      { x: 330, y: 300, w: 80, h: 150, kind: 'sofa' },
      { x: 790, y: 300, w: 80, h: 150, kind: 'sofa' },
    ];
  return [
    ...base,
    { x: 170, y: 250, w: 250, h: 80, kind: 'sofa' },
    { x: 200, y: 390, w: 180, h: 95, kind: 'table' },
    { x: 780, y: 250, w: 250, h: 80, kind: 'sofa' },
    { x: 810, y: 390, w: 180, h: 95, kind: 'table' },
    { x: 475, y: 80, w: 250, h: 50, kind: 'shelf' },
  ];
}
export function canStand(x: number, y: number, theme: string): boolean {
  const r = WORLD.radius;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= r + 30 &&
    y >= r + 30 &&
    x <= WORLD.width - r - 30 &&
    y <= WORLD.height - r - 30 &&
    !furniture(theme).some(
      (o) =>
        x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h,
    )
  );
}
export function advance(
  p: { x: number; y: number },
  dx: number,
  dy: number,
  dt: number,
  theme: string,
) {
  const length = Math.hypot(dx, dy) || 1;
  const distance = WORLD.speed * Math.min(dt, 0.1);
  const x = p.x + (dx / length) * distance,
    y = p.y + (dy / length) * distance;
  const nx = canStand(x, p.y, theme) ? x : p.x;
  return { x: nx, y: canStand(nx, y, theme) ? y : p.y };
}
