import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowService {
  constructor(private readonly prisma: PrismaService) {}

  // フォロー処理（通知は1回だけ）
  async followUser(followerId: number, followingId: number) {
    if (followerId === followingId) {
      throw new ForbiddenException('自分をフォローすることはできません');
    }

    // すでにフォローしているか確認
    const alreadyFollowing = await this.prisma.follow.findFirst({
      where: { followerId, followingId },
    });

    if (alreadyFollowing) {
      return { message: '既にフォロー済みです' };
    }

    // フォロー作成
    await this.prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    // すでにフォロー通知が存在するか確認
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        type: 'follow',
        senderId: followerId,
        receiverId: followingId,
      },
    });

    // 通知がまだ存在しない場合のみ作成
    if (!existingNotification) {
      const followerUser = await this.prisma.user.findUnique({
        where: { id: followerId },
      });

      if (followerUser) {
        await this.prisma.notification.create({
          data: {
            type: 'follow',
            message: `${followerUser.name} さんがあなたをフォローしました`,
            read: false,
            receiver: { connect: { id: followingId } },
            sender: { connect: { id: followerId } },
          },
        });
      }
    }

    return { message: 'フォローしました' };
  }

  // フォロー解除
  async unfollow(followerId: number, followingId: number) {
    return this.prisma.follow.deleteMany({
      where: {
        followerId,
        followingId,
      },
    });
  }

  // フォロー一覧取得（このユーザーがフォローしているユーザー）
  async getFollowings(userId: number) {
    return this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: { id: true, name: true, bio: true, profileImage: true },
        },
      },
    });
  }

  // フォロワー一覧取得（このユーザーをフォローしているユーザー）
  async getFollowers(userId: number) {
    return this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          select: { id: true, name: true, bio: true, profileImage: true },
        },
      },
    });
  }

  // フォロー状態を確認
  async isFollowing(followerId: number, followingId: number) {
    const follow = await this.prisma.follow.findFirst({
      where: {
        followerId,
        followingId,
      },
    });
    return !!follow;
  }
}
