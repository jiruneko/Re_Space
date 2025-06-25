import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // 🔸 未読通知の数を返す
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: {
        receiverId: userId,
        read: false,
      },
    });
    return { unreadCount: count };
  }

  // 🔸 未読通知一覧を返す
  async getUnread(userId: number) {
    return this.prisma.notification.findMany({
      where: {
        receiverId: userId,
        read: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // 🔸 すべての通知を既読にする
  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: {
        receiverId: userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }

  // 🔸 フォロー通知を作成する（必要に応じて）
  async createFollowNotification(followerId: number, receiverId: number) {
    const follower = await this.prisma.user.findUnique({
      where: { id: followerId },
    });

    if (!follower) return;

    await this.prisma.notification.create({
      data: {
        type: 'follow',
        message: `${follower.name} さんにフォローされました`,
        read: false,
        receiver: {
          connect: { id: receiverId },
        },
      },
    });
  }
}
