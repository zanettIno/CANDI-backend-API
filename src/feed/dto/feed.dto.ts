 // src/feed/dto/feed.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'A postagem não pode exceder 500 caracteres.' })
  content: string;
  
  // O tópico será passado via Query Param ou Header, para o service saber onde indexar.
}