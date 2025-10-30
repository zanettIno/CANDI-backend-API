import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Community } from './schemas/community.schema';
import { Message } from './schemas/message.schema';

@Injectable()
export class CommunityService {
  constructor(
    @InjectModel(Community.name)
    private readonly communityModel: Model<Community>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
  ) {}

  // Cria uma nova comunidade
  async createCommunity(userId: string, name: string, description: string) {
    const community = new this.communityModel({
      name,
      description,
      members: [userId],
    });
    return community.save();
  }

  // Retorna todas as comunidades de um usuário
  async getUserCommunities(userId: string) {
    return this.communityModel.find({ members: userId });
  }

  // Alias para compatibilidade com o gateway
  async getCommunitiesByUser(userId: string) {
    return this.getUserCommunities(userId);
  }

  // Adiciona um membro a uma comunidade
  async addMember(communityId: string, userId: string) {
    return this.communityModel.findByIdAndUpdate(
      communityId,
      { $addToSet: { members: userId } },
      { new: true },
    );
  }

  // Remove um membro de uma comunidade
  async removeMember(communityId: string, userId: string) {
    return this.communityModel.findByIdAndUpdate(
      communityId,
      { $pull: { members: userId } },
      { new: true },
    );
  }

  // Salva uma mensagem enviada em uma comunidade
  async saveMessage(communityId: string, authorId: string, content: string) {
    const message = new this.messageModel({
      communityId,
      authorId,
      content,
    });
    return message.save();
  }

  // Busca mensagens de uma comunidade
  async getMessages(communityId: string) {
    return this.messageModel
      .find({ communityId })
      .sort({ createdAt: 1 })
      .exec();
  }
}
