import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { parse } from 'cookie';
import { z } from 'zod';
import { AuthService, Identity } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  advance,
  Avatar,
  ChatMessage,
  ClientEvents,
  Player,
  Reply,
  ServerEvents,
  WORLD,
} from '../shared/world';
interface SocketData {
  identity: Identity;
  roomId?: string;
  theme?: string;
  player?: Player;
  lastMove: number;
  cooldowns: Map<string, { count: number; start: number }>;
}
type Peer = Socket<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketData
>;
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private io!: Server<
    ClientEvents,
    ServerEvents,
    Record<string, never>,
    SocketData
  >;
  private timer?: NodeJS.Timeout;
  private frameTimer?: NodeJS.Timeout;
  private dirtyRooms = new Set<string>();
  private readonly logger = new Logger(RealtimeService.name);
  constructor(
    private auth: AuthService,
    private db: PrismaService,
  ) {}
  attach(http: HttpServer, origin: string) {
    this.io = new Server(http, {
      maxHttpBufferSize: 8192,
      cors: { origin, credentials: true },
      allowRequest: (req, done) =>
        done(null, !req.headers.origin || req.headers.origin === origin),
    });
    this.io.use(async (socket, next) => {
      try {
        const token =
          parse(socket.handshake.headers.cookie || '').re_session ||
          socket.handshake.auth.token;
        if (typeof token !== 'string') throw new Error();
        socket.data.identity = await this.auth.authenticate(token);
        socket.data.cooldowns = new Map();
        socket.data.lastMove = Date.now();
        if (
          [...this.io.sockets.sockets.values()].filter(
            (s) => s.data.identity.id === socket.data.identity.id,
          ).length >= 3
        )
          throw new Error();
        next();
      } catch {
        next(new Error('ログインし直してください'));
      }
    });
    this.io.on('connection', (socket) => {
      // One active avatar per account; replace the old tab deterministically.
      for (const peer of this.io.sockets.sockets.values())
        if (
          peer.id !== socket.id &&
          peer.data.identity.id === socket.data.identity.id
        )
          this.end(peer, '別のタブで接続されました');
      let queue = Promise.resolve();
      const run = <T>(
        event: string,
        limit: number,
        action: () => Promise<T>,
        ack?: (result: Reply<T>) => void,
      ) => {
        if (!this.allow(socket, event, limit)) {
          if (typeof ack === 'function')
            ack({ ok: false, error: '送信が速すぎます。少し待ってください' });
          return;
        }
        queue = queue.then(async () => {
          if (!socket.connected) return;
          try {
            await this.auth.validate({
              sub: socket.data.identity.id,
              sid: socket.data.identity.sid,
            });
            const data = await action();
            if (typeof ack === 'function') ack({ ok: true, data });
          } catch (error) {
            const message =
              error instanceof Error && error.name === 'ClientError'
                ? error.message
                : '処理できませんでした。再接続またはログインし直してください';
            if (typeof ack === 'function') ack({ ok: false, error: message });
          }
        });
      };
      socket.on('room:join', (id, ack) =>
        run(
          'join',
          4,
          async () => {
            const parsed = z.string().min(1).max(64).safeParse(id);
            if (!parsed.success) this.fail('ルームが不正です');
            const room = await this.db.room.findUnique({
              where: { id: parsed.data },
            });
            if (!room?.active) this.fail('このルームは利用できません');
            if (socket.data.roomId !== id && this.count(id) >= room.capacity)
              this.fail('満室です。別のルームをお試しください');
            const profile = await this.db.profile.findUniqueOrThrow({
              where: { userId: socket.data.identity.id },
            });
            if (!socket.connected) this.fail('接続が終了しました');
            if (socket.data.roomId !== id && this.count(id) >= room.capacity)
              this.fail('満室です');
            if (socket.data.roomId !== id) {
              this.leave(socket);
              socket.data.roomId = id;
              socket.data.theme = room.theme;
              socket.data.player = {
                id: profile.userId,
                displayName: profile.displayName,
                status: profile.status,
                avatar: profile.avatar as Avatar,
                ...WORLD.spawn,
                direction: 'down',
              };
              await socket.join(id);
              this.system(id, `${profile.displayName} さんが入室しました`);
              this.broadcast(id);
            }
            // Consultation rooms deliberately have no retained chat history.
            const history =
              room.theme === 'consultation'
                ? []
                : await this.db.message.findMany({
                    where: { roomId: id },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                    include: {
                      user: { select: { name: true, profile: true } },
                    },
                  });
            return {
              room,
              selfId: profile.userId,
              players: this.players(id),
              messages: history.reverse().map((m) => ({
                id: m.id,
                userId: m.userId,
                displayName: m.user.profile?.displayName || m.user.name,
                text: m.text,
                createdAt: m.createdAt.toISOString(),
                scope: 'room' as const,
              })),
            };
          },
          ack,
        ),
      );
      socket.on('player:move', (raw, ack) =>
        run(
          'move',
          35,
          async () => {
            const input = z
              .object({
                dx: z.number().finite().min(-1).max(1),
                dy: z.number().finite().min(-1).max(1),
              })
              .strict()
              .safeParse(raw);
            if (!input.success || !socket.data.player || !socket.data.roomId)
              this.fail('移動データが不正です');
            // Room closure disconnects occupants; theme is fixed for this visit.
            const theme = socket.data.theme || 'lobby';
            const now = Date.now(),
              dt = Math.min((now - socket.data.lastMove) / 1000, 0.08);
            socket.data.lastMove = now;
            const { dx, dy } = input.data;
            Object.assign(
              socket.data.player,
              advance(socket.data.player, dx, dy, dt, theme),
            );
            if (dx || dy)
              socket.data.player.direction =
                Math.abs(dx) > Math.abs(dy)
                  ? dx > 0
                    ? 'right'
                    : 'left'
                  : dy > 0
                    ? 'down'
                    : 'up';
            this.dirtyRooms.add(socket.data.roomId);
            return socket.data.player;
          },
          ack,
        ),
      );
      socket.on('chat:send', (raw, ack) =>
        run(
          'chat',
          5,
          async () => {
            const input = z
              .object({
                text: z.string().trim().min(1).max(500),
                scope: z.enum(['room', 'nearby']),
              })
              .strict()
              .safeParse(raw);
            const { roomId, player } = socket.data;
            if (!input.success || !roomId || !player)
              this.fail('メッセージは1〜500文字で入力してください');
            const room = await this.db.room.findUniqueOrThrow({
              where: { id: roomId },
            });
            const { text, scope } = input.data;
            const message: ChatMessage = {
              id: crypto.randomUUID(),
              userId: player.id,
              displayName: player.displayName,
              text,
              scope,
              createdAt: new Date().toISOString(),
            };
            if (scope === 'room' && room.theme !== 'consultation') {
              const record = await this.db.message.create({
                data: { roomId, userId: player.id, text },
              });
              message.id = record.id;
            }
            if (scope === 'room')
              this.io.to(roomId).emit('chat:message', message);
            else
              for (const peer of this.io.sockets.sockets.values())
                if (
                  peer.data.roomId === roomId &&
                  peer.data.player &&
                  Math.hypot(
                    peer.data.player.x - player.x,
                    peer.data.player.y - player.y,
                  ) <= 220
                )
                  peer.emit('chat:message', message);
            return undefined;
          },
          ack,
        ),
      );
      socket.on('disconnect', () => this.leave(socket));
    });
    // Bound fan-out to 10 frames/second per room, independent of population.
    this.frameTimer = setInterval(() => {
      for (const roomId of this.dirtyRooms) {
        const positions = this.players(roomId).map(
          ({ id, x, y, direction }) => ({
            id,
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            direction,
          }),
        );
        this.io.to(roomId).volatile.emit('world:frame', { roomId, positions });
      }
      this.dirtyRooms.clear();
    }, 100);
    this.timer = setInterval(() => {
      void this.revalidate();
    }, 5000);
  }
  private async revalidate() {
    if (!this.io) return;
    for (const peer of this.io.sockets.sockets.values()) {
      try {
        await this.auth.validate({
          sub: peer.data.identity.id,
          sid: peer.data.identity.sid,
        });
      } catch {
        this.end(peer, 'セッションが終了しました。ログインし直してください');
      }
    }
    try {
      await this.db.message.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) } },
      });
    } catch {
      this.logger.warn('Chat retention cleanup failed');
    }
  }
  private fail(message: string): never {
    const error = new Error(message);
    error.name = 'ClientError';
    throw error;
  }
  private allow(peer: Peer, key: string, max: number) {
    const now = Date.now(),
      value = peer.data.cooldowns.get(key);
    if (!value || now - value.start >= 1000) {
      peer.data.cooldowns.set(key, { count: 1, start: now });
      return true;
    }
    return ++value.count <= max;
  }
  private leave(peer: Peer) {
    const id = peer.data.roomId;
    if (!id) return;
    const name = peer.data.player?.displayName;
    void peer.leave(id);
    peer.data.roomId = undefined;
    peer.data.player = undefined;
    this.system(id, `${name} さんが退出しました`);
    this.broadcast(id);
  }
  private end(peer: Peer, reason: string) {
    peer.emit('session:ended', reason);
    peer.disconnect(true);
  }
  private system(id: string, text: string) {
    this.io?.to(id).emit('chat:message', {
      id: crypto.randomUUID(),
      userId: 0,
      displayName: 'Re:Space',
      text,
      createdAt: new Date().toISOString(),
      scope: 'system',
    });
  }
  private players(id: string) {
    return [...(this.io?.sockets.sockets.values() || [])]
      .filter((s) => s.data.roomId === id && s.data.player)
      .flatMap((s) => (s.data.player ? [s.data.player] : []));
  }
  private broadcast(id: string) {
    this.io?.to(id).emit('players', this.players(id));
  }
  count(id: string) {
    return this.players(id).length;
  }
  kick(id: number, reason = '管理者により退出しました') {
    for (const peer of this.io?.sockets.sockets.values() || [])
      if (peer.data.identity.id === id) this.end(peer, reason);
  }
  closeRoom(id: string) {
    for (const peer of this.io?.sockets.sockets.values() || [])
      if (peer.data.roomId === id) this.end(peer, 'ルームが閉鎖されました');
  }
  async refresh(id: number) {
    const profile = await this.db.profile.findUniqueOrThrow({
      where: { userId: id },
    });
    for (const peer of this.io?.sockets.sockets.values() || [])
      if (peer.data.identity.id === id && peer.data.player) {
        Object.assign(peer.data.player, {
          displayName: profile.displayName,
          avatar: profile.avatar,
          status: profile.status,
        });
        if (peer.data.roomId) this.broadcast(peer.data.roomId);
      }
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    clearInterval(this.frameTimer);
    this.io?.close();
  }
}
