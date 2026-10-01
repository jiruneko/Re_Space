import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PostService } from './post.service';
import { PrismaService } from '../prisma/prisma.service';
describe('PostService authorization', () => {
  it('rejects deleting another user content', async () => {
    const remove = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        PostService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findUnique: jest.fn().mockResolvedValue({ id: 1, authorId: 2 }),
              delete: remove,
            },
          },
        },
      ],
    }).compile();
    await expect(module.get(PostService).remove(1, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
