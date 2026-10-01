import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
export interface Identity {
  id: number;
  name: string;
  email: string;
  role: string;
  sid: string;
}
@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    // Legacy plaintext credentials must be converted using the offline migration script.
    const valid = await bcrypt.compare(
      dto.password,
      user?.password?.startsWith('$2')
        ? user.password
        : '$2b$12$C6UzMDM.H6dfI/f/IKcEe.4f4jXhaCfeK4nFCQfUE.QZjfTgV3Lne',
    );
    if (!user || !valid || user.banned)
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードを確認してください',
      );
    await this.prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, displayName: user.name },
      update: {},
    });
    return this.issue(user.id);
  }
  async register(dto: RegisterDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException(
        'パスワードはUTF-8で72バイト以内にしてください',
      );
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          password: await bcrypt.hash(dto.password, 12),
          profile: { create: { displayName: dto.name.trim() } },
        },
      });
      return this.issue(user.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('このメールアドレスは登録済みです');
      throw error;
    }
  }
  private async issue(userId: number) {
    await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const session = await this.prisma.session.create({
      data: { userId, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    return {
      token: this.jwtService.sign({ sub: userId, sid: session.id }),
      user: await this.me(userId),
    };
  }
  async validate(payload: { sub?: number; sid?: string }): Promise<Identity> {
    if (!Number.isInteger(payload.sub) || typeof payload.sid !== 'string')
      throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.banned
    )
      throw new UnauthorizedException();
    return {
      id: session.userId,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      sid: session.id,
    };
  }
  async authenticate(token: string) {
    return this.validate(
      this.jwtService.verify<{ sub: number; sid: string }>(token),
    );
  }
  me(id: number) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, role: true, profile: true },
    });
  }
  logout(sid: string) {
    return this.prisma.session.deleteMany({ where: { id: sid } });
  }
  async updateName(userId: number, name: string) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 30)
      throw new BadRequestException('表示名は1〜30文字です');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
        profile: {
          upsert: {
            create: { displayName: name.trim() },
            update: { displayName: name.trim() },
          },
        },
      },
    });
    return this.me(userId);
  }
  async remove(id: number, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (
      typeof password !== 'string' ||
      !(await bcrypt.compare(password, user.password))
    )
      throw new UnauthorizedException('パスワードを確認してください');
    await this.prisma.$transaction(async (db) => {
      await db.notification.deleteMany({
        where: { OR: [{ receiverId: id }, { senderId: id }] },
      });
      await db.follow.deleteMany({
        where: { OR: [{ followerId: id }, { followingId: id }] },
      });
      await db.like.deleteMany({
        where: { OR: [{ userId: id }, { post: { authorId: id } }] },
      });
      await db.comment.deleteMany({
        where: { OR: [{ userId: id }, { post: { authorId: id } }] },
      });
      await db.post.deleteMany({ where: { authorId: id } });
      await db.user.delete({ where: { id } });
    });
  }
}
