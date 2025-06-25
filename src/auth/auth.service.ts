import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.password !== dto.password) {
      throw new UnauthorizedException(
        'メールアドレスまたはパスワードが間違っています',
      );
    }
    const token = this.jwtService.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
    });
    return { message: 'ログイン成功', token, user };
  }

  async register(dto: RegisterDto) {
    const { name, email, password } = dto;

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new UnauthorizedException('既に登録されています');
    }
    const user = await this.prisma.user.create({
      data: { name, email, password },
    });
    const token = this.jwtService.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
    });
    return { message: '登録成功', token, user };
  }
  async updateName(userId: number, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
    });
  }
}
