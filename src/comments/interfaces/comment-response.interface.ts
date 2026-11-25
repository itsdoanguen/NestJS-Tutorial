import type { ProfileResponse } from '../../profiles/interfaces/profile-response.interface.js';

export interface CommentResponse {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  body: string;
  author: ProfileResponse;
}
