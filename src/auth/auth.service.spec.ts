import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
describe('session authorization', () => {
  async function service(session: unknown) {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            session: { findUnique: jest.fn().mockResolvedValue(session) },
          },
        },
      ],
    }).compile();
    return module.get(AuthService);
  }
  it('rejects missing or revoked sessions', async () => {
    const auth = await service(null);
    await expect(
      auth.validate({ sub: 1, sid: 'revoked' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects expired sessions', async () => {
    const auth = await service({
      userId: 1,
      expiresAt: new Date(0),
      user: { banned: false },
    });
    await expect(
      auth.validate({ sub: 1, sid: 'expired' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects banned accounts', async () => {
    const auth = await service({
      userId: 1,
      expiresAt: new Date(Date.now() + 100000),
      user: { banned: true },
    });
    await expect(
      auth.validate({ sub: 1, sid: 'banned' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
