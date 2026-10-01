import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { z } from 'zod';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Identity } from '../auth/auth.service';
import { RealtimeService } from './realtime.service';
type AuthRequest = Request & { user: Identity };
function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException('入力内容を確認してください');
  return result.data;
}
const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(30),
    avatar: z.enum(['mint', 'sky', 'plum', 'peach', 'gold', 'slate']),
    status: z.string().trim().max(100),
  })
  .strict();
const roomSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    description: z.string().max(200),
    theme: z.enum(['lobby', 'classroom', 'consultation', 'break']),
    capacity: z.number().int().min(2).max(50),
    active: z.boolean(),
  })
  .strict();
@Controller('space')
@UseGuards(JwtAuthGuard)
export class SpaceController {
  constructor(
    private db: PrismaService,
    private realtime: RealtimeService,
  ) {}
  @Get('rooms') async rooms() {
    return (await this.db.room.findMany({ where: { active: true } })).map(
      (r) => ({ ...r, count: this.realtime.count(r.id) }),
    );
  }
  @Patch('profile') async profile(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    const data = validate(profileSchema, raw);
    await this.db.user.update({
      where: { id: req.user.id },
      data: {
        name: data.displayName,
        profile: { upsert: { create: data, update: data } },
      },
    });
    await this.realtime.refresh(req.user.id);
    return data;
  }
  @Post('reports') async report(@Req() req: AuthRequest, @Body() raw: unknown) {
    const data = validate(
      z
        .object({
          targetId: z.number().int().positive(),
          reason: z.string().trim().min(1).max(500),
        })
        .strict(),
      raw,
    );
    if (
      (await this.db.report.count({
        where: {
          userId: req.user.id,
          createdAt: { gt: new Date(Date.now() - 3600000) },
        },
      })) >= 10
    )
      throw new BadRequestException('通報は1時間に10件までです');
    await this.db.report.create({ data: { ...data, userId: req.user.id } });
    return { ok: true };
  }
  private admin(req: AuthRequest) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException();
  }
  @Get('admin') async overview(@Req() req: AuthRequest) {
    this.admin(req);
    return {
      users: await this.db.user.findMany({
        take: 200,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          role: true,
          banned: true,
          profile: true,
        },
      }),
      rooms: await this.db.room.findMany(),
      reports: await this.db.report.findMany({
        where: { resolved: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  @Post('admin/users/:id') async moderate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() raw: unknown,
  ) {
    this.admin(req);
    const { action } = validate(
      z.object({ action: z.enum(['kick', 'ban', 'unban']) }).strict(),
      raw,
    );
    const target = await this.db.user.findUnique({ where: { id } });
    if (!target || target.role === 'ADMIN')
      throw new BadRequestException('管理者は操作できません');
    if (action !== 'kick')
      await this.db.user.update({
        where: { id },
        data: { banned: action === 'ban' },
      });
    if (action !== 'unban') {
      await this.db.session.deleteMany({ where: { userId: id } });
      this.realtime.kick(id);
    }
    return { ok: true };
  }
  @Post('admin/rooms') async createRoom(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    this.admin(req);
    return this.db.room.create({
      data: { id: crypto.randomUUID(), ...validate(roomSchema, raw) },
    });
  }
  @Patch('admin/rooms/:id') async editRoom(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    this.admin(req);
    const data = validate(roomSchema, raw);
    const room = await this.db.room.update({ where: { id }, data });
    this.realtime.closeRoom(id);
    return room;
  }
  @Post('admin/reports/:id/resolve') async resolve(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.admin(req);
    return this.db.report.update({ where: { id }, data: { resolved: true } });
  }
}
