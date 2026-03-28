// src/feed/dto/feed.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'A postagem não pode exceder 500 caracteres.' })
  content: string;

  // O tópico será passado via Query Param ou Header, para o service saber onde indexar.
}

/**
 * DTO para adicionar comentário a um post
 */
export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'O comentário não pode exceder 500 caracteres.' })
  content: string;
}

/**
 * Interface para resposta de comentário
 */
export interface Comment {
  comment_id: string;
  post_id: string;
  profile_id: string;
  profile_name: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Interface para resposta de like
 */
export interface LikeResponse {
  liked: boolean;
  count: number;
}

/**
 * Interface para post com informações de interação
 */
export interface PostWithInteractions {
  post_id: string;
  profile_id: string;
  profile_name: string;
  content: string;
  file_url?: string;
  created_at: string;
  topic: string;
  subgroup?: string;
  feed_partition: string;
  likes_count: number;
  comments_count: number;
  user_liked?: boolean;
}