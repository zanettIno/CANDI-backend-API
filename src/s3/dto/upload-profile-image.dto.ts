export class UploadProfileImageDto {
  profileId!: string; // já obrigatório
  fileName!: string;   // nome original do arquivo
  fileBuffer!: Buffer; // conteúdo do arquivo
  fileMimetype!: string; // mimetype
}
