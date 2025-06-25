// src/types/express.d.ts
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email?: string;
    // 他に必要な情報があれば追加
  };
}
