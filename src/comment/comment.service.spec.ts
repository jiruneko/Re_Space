import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { PrismaService } from '../prisma/prisma.service';
describe('CommentService authorization', () => {
  it('rejects deleting another user content', async () => {
    const remove = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: PrismaService,
          useValue: {
            comment: {
              findUnique: jest.fn().mockResolvedValue({ id: 1, userId: 2 }),
              delete: remove,
            },
          },
        },
      ],
    }).compile();
    await expect(
      module.get(CommentService).deleteComment(1, 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });
});
