import type { Comment } from '../../database/entities/comment.entity.js';
import type { CommentResponse } from '../interfaces/comment-response.interface.js';

export function buildCommentResponse(
  comment: Comment,
  authorFollowing: boolean,
): CommentResponse {
  return {
    id: comment.id,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    body: comment.body,
    author: {
      username: comment.author.username,
      bio: comment.author.bio,
      image: comment.author.image,
      following: authorFollowing,
    },
  };
}
