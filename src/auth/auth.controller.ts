import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Patch,
  Delete,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService, Identity } from './auth.service';
import { Request, Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 86400000,
});
type AuthRequest = Request & { user: Identity };
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('re_session', result.token, cookieOptions());
    return result;
  }
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('re_session', result.token, cookieOptions());
    return result;
  }
  @UseGuards(JwtAuthGuard)
  @Patch('name')
  updateName(@Req() req: AuthRequest, @Body() body: { name: string }) {
    return this.authService.updateName(req.user.id, body.name);
  }
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthRequest) {
    return this.authService.me(req.user.id);
  }
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.sid);
    res.clearCookie('re_session', { ...cookieOptions(), maxAge: undefined });
    return { ok: true };
  }
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async remove(
    @Req() req: AuthRequest,
    @Body() body: { password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.remove(req.user.id, body.password);
    res.clearCookie('re_session', { ...cookieOptions(), maxAge: undefined });
    return { ok: true };
  }
}
