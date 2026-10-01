import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateBioDto } from './dto/update-bio.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthRequest } from '../types/auth-request';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ユーザー情報取得（他人のプロフィール閲覧）
  @Get(':id')
  async findUser(@Param('id') id: string) {
    const user = await this.userService.findUserById(Number(id));
    if (!user) {
      throw new NotFoundException('ユーザーが見つかりません');
    }
    return user;
  }

  // 自己紹介文の更新（自分自身のみ）
  @Patch('me/bio')
  @UseGuards(JwtAuthGuard)
  async updateBio(@Body() dto: UpdateBioDto, @Req() req: AuthRequest) {
    return this.userService.updateBio(req.user.id, dto);
  }

  // プロフィール全体の更新（自己紹介 + 画像）
  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: AuthRequest) {
    return this.userService.updateProfile(req.user.id, dto);
  }
}
