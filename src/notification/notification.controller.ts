import { Controller, Get, Req, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { AuthRequest } from '../types/auth-request';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // 未読通知を取得（通知件数と一覧）
  @UseGuards(JwtAuthGuard)
  @Get('unread')
  async getUnreadNotifications(@Req() req: AuthRequest) {
    const userId = req.user.id;
    const unread = await this.notificationService.getUnread(userId);
    return {
      unreadCount: unread.length,
      notifications: unread,
    };
  }

  // 全通知を既読にする
  @UseGuards(JwtAuthGuard)
  @Post('mark-all-read')
  async markAllAsRead(@Req() req: AuthRequest) {
    const userId = req.user.id;
    await this.notificationService.markAllAsRead(userId);
    return { message: 'All notifications marked as read.' };
  }
}
