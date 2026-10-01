import { useEffect, useRef } from 'react';
import {
  AVATARS,
  furniture,
  Player,
  RoomInfo,
  WORLD,
} from '../src/shared/world';
interface Props {
  players: Player[];
  selfId: number;
  room: RoomInfo;
  move: (dx: number, dy: number) => void;
  connected: boolean;
}
export function World({ players, selfId, room, move, connected }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    keys = useRef(new Set<string>());
  const latest = useRef({ players, selfId, room, move, connected });
  latest.current = { players, selfId, room, move, connected };
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext('2d')!;
    const smooth = new Map<number, { x: number; y: number }>();
    let animation = 0,
      previous = performance.now(),
      lastSend = 0;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      element.width = Math.round(rect.width * devicePixelRatio);
      element.height = Math.round(rect.height * devicePixelRatio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const down = (event: KeyboardEvent) => {
      if (
        document.activeElement !== element ||
        ![
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'w',
          'a',
          's',
          'd',
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      keys.current.add(event.key);
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    element.addEventListener('blur', blur);
    function draw(now: number) {
      // Bound canvas work on low-power devices and software-rendered browsers.
      if (now - previous < 1000 / 30) {
        animation = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const {
        players: ps,
        selfId: me,
        room: r,
        connected: ready,
      } = latest.current;
      const k = keys.current;
      if (now - lastSend >= 50 && ready) {
        const dx =
          Number(k.has('ArrowRight') || k.has('d')) -
          Number(k.has('ArrowLeft') || k.has('a'));
        const dy =
          Number(k.has('ArrowDown') || k.has('s')) -
          Number(k.has('ArrowUp') || k.has('w'));
        if (dx || dy) latest.current.move(dx, dy);
        lastSend = now;
      }
      const width = element.width / devicePixelRatio,
        height = element.height / devicePixelRatio;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.fillStyle = '#e9ede5';
      context.fillRect(0, 0, width, height);
      const scale = Math.max(0.7, Math.min(width / 1050, height / 730, 1.15));
      const self = ps.find((p) => p.id === me);
      const camera = self ? smooth.get(me) || self : WORLD.spawn;
      const cameraX = Math.max(
        0,
        Math.min(WORLD.width - width / scale, camera.x - width / scale / 2),
      );
      const cameraY = Math.max(
        0,
        Math.min(WORLD.height - height / scale, camera.y - height / scale / 2),
      );
      context.save();
      context.scale(scale, scale);
      context.translate(-cameraX, -cameraY);
      const box = (
        x: number,
        y: number,
        w: number,
        h: number,
        color: string,
        radius = 10,
      ) => {
        context.fillStyle = color;
        context.beginPath();
        context.roundRect(x, y, w, h, radius);
        context.fill();
      };
      box(25, 25, 1150, 790, '#d6dcd2', 18);
      box(
        35,
        35,
        1130,
        770,
        r.theme === 'classroom' ? '#f0e8d6' : '#f4efe2',
        14,
      );
      context.strokeStyle = '#e7e0d1';
      context.lineWidth = 1;
      for (let x = 35; x < 1170; x += 60) {
        context.beginPath();
        context.moveTo(x, 35);
        context.lineTo(x, 805);
        context.stroke();
      }
      for (let y = 35; y < 810; y += 60) {
        context.beginPath();
        context.moveTo(35, y);
        context.lineTo(1165, y);
        context.stroke();
      }
      box(
        420,
        220,
        360,
        350,
        r.theme === 'consultation' ? '#dedee9' : '#dce6da',
        80,
      );
      context.textAlign = 'center';
      context.font = '500 22px "Noto Sans JP", sans-serif';
      context.fillStyle = '#637767';
      context.fillText(r.name, 600, 190);
      for (const o of furniture(r.theme)) {
        box(o.x + 3, o.y + 7, o.w, o.h, '#00000010');
        if (o.kind === 'plant') {
          box(o.x + 17, o.y + 28, 28, 30, '#d6bda0', 8);
          for (const [dx, dy] of [
            [14, 18],
            [37, 15],
            [27, 0],
            [30, 30],
          ]) {
            context.fillStyle = dy === 0 ? '#669778' : '#88ad88';
            context.beginPath();
            context.ellipse(o.x + dx, o.y + dy, 18, 24, 0.4, 0, Math.PI * 2);
            context.fill();
          }
        } else if (o.kind === 'sofa') {
          box(o.x, o.y, o.w, o.h, '#91aca0', 14);
          box(o.x + 8, o.y + 20, o.w - 16, o.h - 28, '#afc5b8', 10);
        } else if (o.kind === 'shelf') {
          box(o.x, o.y, o.w, o.h, '#b89e7d', 6);
          for (let x = o.x + 15; x < o.x + o.w - 15; x += 20)
            box(
              x,
              o.y + 10,
              12,
              o.h - 20,
              ['#83a69a', '#d6bc89', '#a6aec6'][Math.floor(x / 20) % 3],
              2,
            );
        } else {
          box(o.x, o.y, o.w, o.h, '#bea383', 14);
          box(o.x + 4, o.y + 2, o.w - 8, o.h - 9, '#dec7a5', 12);
          box(o.x + o.w / 2 - 18, o.y + 15, 36, 24, '#f5f2e9', 3);
        }
      }
      for (const id of smooth.keys())
        if (!ps.some((p) => p.id === id)) smooth.delete(id);
      for (const player of [...ps].sort((a, b) => a.y - b.y)) {
        let position = smooth.get(player.id);
        if (
          !position ||
          Math.hypot(position.x - player.x, position.y - player.y) > 220
        )
          position = { x: player.x, y: player.y };
        const mix = 1 - Math.exp(-18 * dt);
        position.x += (player.x - position.x) * mix;
        position.y += (player.y - position.y) * mix;
        smooth.set(player.id, position);
        const { x, y } = position;
        context.fillStyle = '#00000016';
        context.beginPath();
        context.ellipse(x, y + 12, 20, 8, 0, 0, Math.PI * 2);
        context.fill();
        if (player.id === me) {
          context.strokeStyle = '#2c8977';
          context.lineWidth = 2;
          context.beginPath();
          context.ellipse(x, y + 13, 26, 12, 0, 0, Math.PI * 2);
          context.stroke();
        }
        box(x - 13, y - 12, 26, 28, AVATARS[player.avatar] || AVATARS.mint, 10);
        context.fillStyle = '#f4d7bb';
        context.beginPath();
        context.arc(x, y - 21, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#45515b';
        context.beginPath();
        context.arc(x, y - 25, 13, Math.PI, Math.PI * 2);
        context.fill();
        if (player.direction !== 'up') {
          const offset =
            player.direction === 'left'
              ? -4
              : player.direction === 'right'
                ? 4
                : 0;
          box(x - 5 + offset, y - 23, 3, 3, '#47514e', 1);
          box(x + 3 + offset, y - 23, 3, 3, '#47514e', 1);
        }
        context.font = '600 13px "Noto Sans JP", sans-serif';
        const label =
          player.displayName + (player.id === me ? '（あなた）' : '');
        const labelWidth = context.measureText(label).width;
        box(
          x - labelWidth / 2 - 9,
          y - 62,
          labelWidth + 18,
          23,
          '#fffffff0',
          8,
        );
        context.fillStyle = '#35463e';
        context.fillText(label, x, y - 46);
        if (player.status) {
          context.font = '12px "Noto Sans JP", sans-serif';
          context.fillStyle = '#6c786f';
          context.fillText(player.status.slice(0, 18), x, y + 40);
        }
      }
      context.restore();
      animation = requestAnimationFrame(draw);
    }
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      element.removeEventListener('blur', blur);
      keys.current.clear();
    };
  }, [room.id]);
  return (
    <div className="world-wrap">
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="2D空間。クリックしてから矢印キーまたはWASDで移動"
        onPointerDown={(e) => e.currentTarget.focus()}
      />
      <div className="world-help">
        クリックして移動 <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> / 矢印キー
      </div>
      <div className="dpad" aria-label="タッチ移動">
        {[
          ['↑', 'ArrowUp'],
          ['←', 'ArrowLeft'],
          ['↓', 'ArrowDown'],
          ['→', 'ArrowRight'],
        ].map(([label, key]) => (
          <button
            key={key}
            aria-label={`${label}へ移動`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              keys.current.add(key);
            }}
            onPointerUp={() => keys.current.delete(key)}
            onPointerCancel={() => keys.current.delete(key)}
            onLostPointerCapture={() => keys.current.delete(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
