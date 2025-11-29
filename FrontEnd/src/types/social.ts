export type CommentDTO = {
  id: string;
  content: string;
  createdAt: string;        // ISO
  updatedAt?: string;
  author: { id: string; name: string | null; email: string } | null;
  repliesCount?: number;
};

export type CommentsPage = {
  items: CommentDTO[];
  nextCursor: string | null;
};

export type ReactionsSummary = {
  likes: number;
  likedByMe: boolean;
};
