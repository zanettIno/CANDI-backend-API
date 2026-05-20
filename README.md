# CANDI Backend API — Documentação Técnica Completa

> API REST + WebSocket para o aplicativo CANDI. NestJS + Fastify + AWS DynamoDB + S3.

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Stack Técnica](#stack-técnica)
3. [Arquitetura de Módulos](#arquitetura-de-módulos)
4. [Tabelas DynamoDB](#tabelas-dynamodb)
5. [Guards e Autenticação](#guards-e-autenticação)
6. [Endpoints — Referência Completa](#endpoints--referência-completa)
7. [Regras de Negócio](#regras-de-negócio)
8. [WebSocket (Socket.IO)](#websocket-socketio)
9. [Armazenamento S3](#armazenamento-s3)
10. [Variáveis de Ambiente](#variáveis-de-ambiente)
11. [Estrutura de Pastas](#estrutura-de-pastas)
12. [Como Rodar](#como-rodar)

---

## Visão Geral

A CANDI API é o backend do aplicativo mobile CANDI. Ela expõe:

- **Autenticação** — JWT (access 12h + refresh 7d), Google OAuth, recuperação de senha
- **Rede de Apoio** — sistema de convites por token para vincular pacientes a cuidadores/familiares
- **Feed e Comunidade** — posts, grupos, comentários, likes, favoritos, denúncias
- **Chat** — mensagens privadas 1-1 com WebSocket em tempo real
- **Agenda de Saúde** — compromissos, medicamentos, sintomas, calendário
- **Diário** — entradas em S3 por data
- **Tratamento** — marcos do tratamento, sentimentos, contatos emergenciais
- **Moderação** — painel admin com gestão de denúncias, banimentos e admins

---

## Stack Técnica

| Tecnologia | Versão | Uso |
|---|---|---|
| NestJS | 11 | Framework principal |
| Node.js | 20+ | Runtime |
| Fastify | 5.x | HTTP server (substituindo Express) |
| @fastify/multipart | — | Upload de arquivos multipart |
| TypeScript | 5.x | Tipagem estática |
| AWS DynamoDB | SDK v3 | Banco de dados principal (18 tabelas) |
| AWS S3 | SDK v3 | Armazenamento de imagens e diários |
| Socket.IO | 4.x | WebSocket em tempo real |
| JWT (@nestjs/jwt) | — | Access Token (12h) + Refresh Token (7d) |
| bcrypt | — | Hash de senhas (10 rounds) |
| Sharp | — | Processamento/otimização de imagens antes do upload |
| Nodemailer | — | Envio de emails (convites, recuperação de senha) |
| fastify-cookie | — | Gerenciamento de cookies HTTP |

---

## Arquitetura de Módulos

```
AppModule
├── DynamoDBModule          — Provider DYNAMO_CLIENT + Bootstrap das 18 tabelas
├── AuthModule              — Registro, Login, Tokens JWT, Convites, Rede de Apoio
│   └── RecoveryModule      — Recuperação de senha por email
├── AdminModule             — Moderação, Gestão de Admins
├── SupportModule (dentro de AdminModule) — Endpoints de leitura para suporte
├── FeedModule              — Posts globais
├── CommunityModule         — Grupos, Likes, Favoritos, Comentários, Denúncias
├── ChatModule              — Mensagens, Conversas, WebSocket Gateway
├── DiaryModule             — Diário pessoal (S3)
├── JournalModule           — Sentimentos/Humor
├── EmergencyContactsModule — Contatos de emergência
├── S3Module (ProfileImage) — Upload de foto de perfil
└── ScheduleModule
    ├── CalendarModule      — Compromissos/Consultas
    ├── MedicinesModule     — Medicamentos
    ├── SymptomsModule      — Sintomas
    └── TreatmentModule
        └── MilestonesModule — Marcos do tratamento
```

### Bootstrap de Tabelas

O `DynamoBootstrapService` roda no `onModuleInit` e cria automaticamente as tabelas DynamoDB que ainda não existem. Isso elimina a necessidade de criação manual no console AWS — basta ter as credenciais configuradas e o servidor criar a infraestrutura.

---

## Tabelas DynamoDB

| Tabela | PK (HASH) | SK (RANGE) | GSIs | Descrição |
|---|---|---|---|---|
| **CANDIProfile** | `profile_id` | — | `EmailIndex` (profile_email) | Usuários: pacientes, suportes, admins |
| **CANDIMessages** | `conversation_id` | `timestamp` | — | Mensagens de chat persistidas |
| **CANDIUserConversations** | `profile_id` | `conversation_id` | `InboxSortGSI` (profile_id, last_message_timestamp) | Inbox de conversas por usuário |
| **CANDIReports** | `post_id` | `reporter_id` | — | Denúncias de posts (1 por usuário por post) |
| **CANDIInvites** | `invite_token` | — | `ByPatientGSI` (patient_id) | Convites da rede de apoio (TTL: 7 dias) |
| **CANDISupportLinks** | `patient_id` | `support_id` | `BySupportGSI` (support_id) | Vínculo paciente ↔ suporte |
| **CANDIPosts** | `profile_id` | `post_id` | `AllPostsGSI` (feed_partition), `ByTopicGSI`, `BySubgroupGSI` | Posts do feed global e grupos |
| **CANDIGroups** | `group_id` | — | `ByTopicGSI` (topic, created_at) | Grupos/Comunidades |
| **CANDIGroupMembers** | `group_id` | `profile_id` | `ByProfileGSI` (profile_id, joined_at) | Membros de grupos |
| **CANDIPostLikes** | `post_id` | `profile_id` | `ByProfileGSI` (profile_id, liked_at) | Curtidas de posts |
| **CANDIPostFavorites** | `profile_id` | `post_id` | — | Posts favoritados por usuário |
| **CANDIComments** | `post_id` | `comment_id` | — | Comentários em posts |
| **CANDIMedicines** | `medicine_id` | — | `EmailIndex` (email) | Medicamentos prescritos |
| **CANDIAppointment** | `appointment_id` | — | `EmailIndex` (email) | Consultas e eventos do calendário |
| **CANDISymptoms** | `symptoms_id` | — | `EmailIndex` (email) | Registro de sintomas |
| **CANDIFeelings** | `feeling_id` | — | `EmailIndex` (email) | Journal de sentimentos/humor |
| **CANDIEmergencyContacts** | `emergency_id` | — | `EmailIndex` (email) | Contatos emergenciais |
| **CANDITreatmentMilestones** | `milestone_id` | — | `ProfileMilestonesIndex` (profile_id) | Marcos do tratamento oncológico |

> Todas as tabelas usam `PAY_PER_REQUEST` billing mode — sem provisionamento manual de throughput.

---

## Guards e Autenticação

### AuthGuard (`src/auth/auth.guard.ts`)

Aplicado na maioria dos endpoints. Verifica o Bearer token no header `Authorization`.

**Fluxo:**
1. Extrai `Bearer <token>` do header
2. `jwtService.verifyAsync(token, { secret: ACCESS_TOKEN_SECRET })`
3. Busca o usuário em `CANDIProfile` via `GetCommand({ Key: { profile_id: payload.id } })`
4. Se usuário existir e estiver ativo, injeta `req.user = { profile_id, profile_email, role }` na request
5. Usuários com `profile_status = 'banned'` recebem `403 Forbidden`

### AdminGuard (`src/admin/admin.guard.ts`)

Estende a verificação do AuthGuard adicionando checagem de role:

1. Mesma verificação de token que o AuthGuard
2. Verifica que `payload.role === 'admin'`
3. Injeta `req.user = { profile_id: payload.id, role: payload.role }`

> **Atenção:** AdminGuard e AuthGuard usam a mesma secret (`ACCESS_TOKEN_SECRET`) — o token é o mesmo, a diferença está na checagem de role.

### Token JWT

Todos os tokens são assinados com `{ id: profile_id, email: profile_email }` como payload.

| Token | Secret | Expiração |
|---|---|---|
| Access Token | `ACCESS_TOKEN_SECRET` | 12 horas |
| Refresh Token | `REFRESH_TOKEN_SECRET` | 7 dias |

---

## Endpoints — Referência Completa

### AUTH (`/auth`)

| Método | Rota | Guard | Descrição |
|---|---|---|---|
| `POST` | `/auth/register` | — | Registrar paciente. Body: `{ name, nickname, email, password, birth_date, cancer_type_id, adminSecret? }`. Se `adminSecret` correto, cria com `role=admin`. |
| `POST` | `/auth/google` | — | Login/Registro via Google OAuth. Body: `{ email, name, picture }`. Cria conta se não existir. |
| `POST` | `/auth/login` | — | Login com email+senha. Retorna `{ accessToken, refreshToken }` e seta cookies. |
| `GET` | `/auth/logout` | — | Limpa cookies de token. |
| `POST` | `/auth/refresh` | — | Body: `{ refreshToken }`. Verifica com `REFRESH_TOKEN_SECRET`, retorna novos tokens. |
| `GET` | `/auth/me` | AuthGuard | Perfil completo do usuário logado (sem senha). |
| `PATCH` | `/auth/me` | AuthGuard | Atualizar perfil. Body: `{ profile_name?, profile_nickname?, profile_birth_date?, cancer_type_id? }`. |
| `POST` | `/auth/invite` | AuthGuard | Criar convite de rede de apoio. Body: `{ email, permissions[] }`. Envia email. |
| `GET` | `/auth/invite/:token` | — | Buscar convite por token (valida expiração e se já foi usado). |
| `POST` | `/auth/register-support` | — | Registrar conta de suporte via convite. Body: `{ name, phone, email, password, invite_token, relationship }`. |
| `GET` | `/auth/my-invites` | AuthGuard | Lista convites criados pelo paciente logado. |
| `GET` | `/auth/support-network` | AuthGuard | Lista membros ativos da rede de apoio do paciente. |
| `DELETE` | `/auth/support-network/:support_id` | AuthGuard | Remove membro da rede de apoio. |
| `DELETE` | `/auth/invite/:invite_token` | AuthGuard | Revoga convite pendente. |
| `GET` | `/auth/my-patient` | AuthGuard | (Suporte) Retorna o primeiro paciente vinculado. |
| `GET` | `/auth/my-patients` | AuthGuard | (Suporte) Lista todos os pacientes vinculados ativos. |

---

### RECUPERAÇÃO DE SENHA (`/recuperar`)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/recuperar/send-code` | Body: `{ email }`. Envia código de 6 dígitos por email. Expira em **10 minutos** (armazenado em memória). |
| `POST` | `/recuperar/verify-code` | Body: `{ email, code }`. Valida o código. |
| `POST` | `/recuperar/reset-password` | Body: `{ email, code, newPassword }`. Reseta a senha após verificação. |

---

### ADMIN (`/admin`)

> Todos os endpoints exigem **AdminGuard** (`role = 'admin'`).

#### Dashboard

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/stats` | Retorna `{ suspended_posts, banned_users, total_reports }`. |

#### Moderação de Posts

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/posts/suspended` | Posts com `status=suspended` ou `report_count >= 3`. Inclui array `reports[]` de cada post. |
| `GET` | `/admin/reports/all` | Todos os posts que têm ao menos 1 denúncia, exceto `approved` e `removed`. Ordenados por número de denúncias. |
| `GET` | `/admin/posts/:postId/reports` | Lista as denúncias de um post específico. |
| `PATCH` | `/admin/posts/:postId/approve` | Aprova post: seta `status=approved`, zera `report_count`, **deleta todos os reports** da tabela `CANDIReports`. |
| `PATCH` | `/admin/posts/:postId/remove` | Remove post: seta `status=removed`, incrementa `banned_posts_count` do autor, **deleta todos os reports**. Se autor atingir 3 remoções → `profile_status=banned`. |

#### Usuários Banidos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/users/banned` | Usuários com `profile_status=banned` e `role=patient`. Projetado: id, nome, email, data do ban, contagem. |
| `PATCH` | `/admin/users/:userId/unban` | Volta `profile_status=active`, remove campo `banned_at`. |

#### Gestão de Admins

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/admins` | Lista todos os usuários com `role=admin`. |
| `POST` | `/admin/admins` | Body: `{ name, email, password }`. Cria admin. Email normalizado para lowercase. |
| `DELETE` | `/admin/admins/:adminId` | Deleta admin. Proibido: auto-deleção, deletar superadmin. Exige que o requisitante seja `is_superadmin=true`. |

#### Configurações do Admin

| Método | Rota | Descrição |
|---|---|---|
| `PATCH` | `/admin/me/credentials` | Body: `{ current_password, email?, password? }`. Valida senha atual antes de alterar. |

---

### SUPORTE (`/support`)

> Todos os endpoints exigem **AuthGuard**. O service valida que existe um `CANDISupportLink` ativo entre o suporte logado e o paciente solicitado.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/support/my-patients` | Lista pacientes vinculados com status `active`. |
| `GET` | `/support/patient/:patientId/agenda` | Retorna `{ appointments[], medicines[] }` do paciente. |
| `GET` | `/support/patient/:patientId/milestones` | Marcos do tratamento do paciente. |
| `GET` | `/support/patient/:patientId/diary` | Lista entradas do diário (`{ date, content }[]`). Exige permissão `diary_read` no vínculo. |
| `GET` | `/support/patient/:patientId/profile` | Dados básicos do paciente + permissões do vínculo. |

---

### FEED (`/feed`)

> Todos os endpoints exigem **AuthGuard**.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/feed/posts` | Cria post. Body: `multipart/form-data` com campo `content` (obrigatório) e `file` (opcional). Query: `topic?`, `subgroup?`. |
| `GET` | `/feed/posts` | Lista posts. Query: `topic?`, `subgroup?`, `hashtag?`, `limit?` (max 50), `lastKey?` (cursor paginação). |
| `DELETE` | `/feed/posts/:postId` | Deleta post. Apenas o próprio autor pode deletar. |

---

### COMUNIDADE (`/community`)

> Todos os endpoints exigem **AuthGuard**.

#### Grupos

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/community/groups` | Cria grupo. Body: `{ name, description, topic, isPrivate }`. Criador vira `leader`. |
| `GET` | `/community/groups` | Lista grupos. Query: `topic?`. |
| `GET` | `/community/groups/mine` | Grupos que o usuário é membro. |
| `GET` | `/community/groups/:groupId` | Detalhes do grupo + contagem de membros. |
| `PATCH` | `/community/groups/:groupId` | Editar grupo. Apenas `leader`. |
| `DELETE` | `/community/groups/:groupId` | Deletar grupo. Apenas `leader`. |
| `POST` | `/community/groups/:groupId/join` | Entrar no grupo. Se privado → status `pending`; se público → status `active`. |
| `DELETE` | `/community/groups/:groupId/leave` | Sair do grupo. |
| `GET` | `/community/groups/:groupId/members` | Lista membros ativos. |
| `GET` | `/community/groups/:groupId/my-status` | Status do usuário no grupo (`active`, `pending`, `banned`, `not_member`). |
| `GET` | `/community/groups/:groupId/requests` | Solicitações `pending` (apenas leader/co-leader). |
| `POST` | `/community/groups/:groupId/requests/:profileId` | Body: `{ action: 'approve' \| 'reject' }`. |
| `DELETE` | `/community/groups/:groupId/members/:profileId` | Remove membro. Apenas leader. Emite `kicked_from_group` via WebSocket. |
| `POST` | `/community/groups/:groupId/members/:profileId/role` | Body: `{ role: 'leader' \| 'co-leader' \| 'member' }`. |
| `DELETE` | `/community/groups/:groupId/posts/:postId` | Remove post do grupo. Apenas leader/co-leader. |
| `POST` | `/community/groups/:groupId/image` | Upload foto ou banner. Query: `type=photo\|banner`. Multipart `file`. Processado com Sharp antes de enviar para S3. |

#### Likes

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/community/posts/:postId/like` | Toggle like (like/unlike). |
| `GET` | `/community/posts/:postId/likes` | Lista de usuários que curtiram. |
| `GET` | `/community/me/liked-posts` | Posts curtidos pelo usuário logado. |

#### Favoritos

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/community/posts/:postId/favorite` | Toggle favorito. |
| `GET` | `/community/me/favorites` | Lista de IDs de posts favoritados. |
| `GET` | `/community/me/favorited-posts` | Posts favoritados completos. |

#### Comentários

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/community/posts/:postId/comments` | Body: `{ content }`. |
| `GET` | `/community/posts/:postId/comments` | Lista comentários do post. |
| `DELETE` | `/community/posts/:postId/comments/:commentId` | Apenas o autor do comentário. |
| `DELETE` | `/community/groups/:groupId/comments/:commentId` | Leader pode deletar qualquer comentário do grupo. |

#### Denúncias e Compartilhamento

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/community/posts/:postId/report` | Body: `{ reason: 'inappropriate' \| 'spam' \| 'hate' \| 'misinformation' \| 'other' }`. 1 denúncia por usuário por post. Se `report_count >= 3` → post `status=suspended`. |
| `POST` | `/community/posts/:postId/share` | Body: `{ conversationId }`. Compartilha post no chat. Emite `new_message` via WS. |

---

### CHAT (`/chat`)

> Todos os endpoints exigem **AuthGuard**.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/chat/inbox` | Lista conversas do usuário, ordenadas por `last_message_timestamp` desc. |
| `POST` | `/chat/start` | Body: `{ targetProfileId }`. Cria ou retorna conversa existente entre os dois usuários. |
| `GET` | `/chat/read-status/:conversationId` | Marca mensagens como lidas. Emite `messages_read` via WebSocket. |
| `GET` | `/chat/messages/:conversationId` | Busca todas as mensagens da conversa. |
| `POST` | `/chat/messages/:conversationId` | Body: `{ content }`. Salva mensagem e emite `new_message` via WebSocket. |

---

### SCHEDULE — CALENDÁRIO (`/calendar`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/calendar/events` | Body: `{ appointment_name, appointment_date, appointment_time?, local?, notes? }`. |
| `GET` | `/calendar/events` | Lista todos os compromissos do usuário logado. |
| `GET` | `/calendar/summary` | Resumo mensal de compromissos. |

---

### SCHEDULE — MEDICAMENTOS (`/schedule/medicines`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/schedule/medicines` | Body: `{ medicine_name, medicine_dosage, medicine_period, medicine_posology, medicine_obs? }`. |
| `GET` | `/schedule/medicines` | Lista medicamentos do usuário (por `profile_email` no `EmailIndex`). |
| `DELETE` | `/schedule/medicines/:id` | Deleta medicamento. Verifica que `profile_id` do medicamento bate com o usuário logado. |

---

### SCHEDULE — SINTOMAS (`/schedule/symptoms`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/schedule/symptoms` | Body: `{ description }`. |
| `GET` | `/schedule/symptoms` | Lista sintomas do usuário, ordenados do mais recente para o mais antigo. |

---

### TRATAMENTO — MARCOS (`/milestones`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/milestones` | Body: `{ title, description?, target_date?, completed? }`. |
| `GET` | `/milestones` | Lista marcos do usuário logado. |
| `GET` | `/milestones/:profile_id` | Lista marcos de outro usuário (para visualização da rede de apoio). |
| `PATCH` | `/milestones/:id` | Atualiza campos do marco. |
| `DELETE` | `/milestones/:id` | Deleta marco. |

---

### DIÁRIO (`/diary`)

> AuthGuard em todos. Dados armazenados em S3, não em DynamoDB.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/diary` | Body: `{ date: 'YYYY-MM-DD', content }`. Salva `userId/date.txt` no S3. |
| `GET` | `/diary` | Query: `date`. Busca entrada específica. |
| `GET` | `/diary/list` | Lista todas as entradas do usuário (`[{ date, content }]`). |
| `PATCH` | `/diary` | Body: `{ date, content }`. Sobrescreve a entrada. |
| `DELETE` | `/diary` | Query: `date`. Remove o objeto do S3. |

---

### JOURNAL — SENTIMENTOS (`/journal`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/journal/feelings` | Body: `{ happiness: 0-10, observation? }`. |
| `GET` | `/journal/feelings` | Lista sentimentos do usuário. |

---

### CONTATOS EMERGENCIAIS (`/emergency-contact`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/emergency-contact` | Body: `{ name, phone, relationship }`. |
| `GET` | `/emergency-contact` | Lista contatos do usuário. |

---

### IMAGEM DE PERFIL (`/profile-image`)

> AuthGuard em todos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/profile-image/upload` | Multipart `file`. Processa com Sharp (converte para JPEG), salva em `profile-images/{profileId}.jpg` no S3. |
| `DELETE` | `/profile-image` | Remove `profile-images/{profileId}.jpg` do S3. |

> **Nota:** O multipart usa `attachFieldsToBody: true` globalmente — o arquivo fica em `req.body.file._buf`, não em `req.file()`.

---

## Regras de Negócio

### Autenticação e Tokens

- Senhas hasheadas com **bcrypt** (10 rounds)
- Emails normalizados para **lowercase + trim** antes de armazenar ou buscar (para evitar problemas de case-sensitivity no DynamoDB Scan)
- Access Token expira em **12 horas**
- Refresh Token expira em **7 dias**, assinado com `REFRESH_TOKEN_SECRET` diferente
- `refreshTokens()` verifica com `REFRESH_TOKEN_SECRET`, re-assina com `{ id, email }` — nunca `sub`
- Código de recuperação de senha: gerado aleatório de 6 dígitos, armazenado **em memória** (não persistido), expira em **10 minutos**

### Rede de Apoio

- Paciente cria convite informando `permissions[]`: `['agenda', 'diary_read', 'milestones']`
- Convite expira em **7 dias** (verificado por timestamp no DynamoDB)
- Convite é **de uso único** (`used: true` após registro)
- Suporte pode estar vinculado a **múltiplos pacientes** (estrutura N:N em `CANDISupportLinks`)
- Um suporte que já tem conta pode aceitar convite usando email+senha da conta existente
- O endpoint de suporte verifica a existência do vínculo + permissão antes de retornar dados

### Moderação

- **Denúncia:** 1 por usuário por post (chave composta `post_id + reporter_id` garante unicidade)
- **Suspensão automática:** `report_count >= 3` → post `status = 'suspended'`
- **Ban automático:** admin remove post → `banned_posts_count++` → se `>= 3` → `profile_status = 'banned'`
- **Aprovação:** admin aprova post → `status = 'approved'` + `report_count = 0` + deleta todos os registros de `CANDIReports` para aquele post
- **Remoção:** admin remove post → `status = 'removed'` + deleta todos os registros de `CANDIReports`
- Posts `approved` e `removed` **não aparecem** na listagem de denúncias (`getAllReports`)
- Posts com `status = 'approved'` são imunes a novas denúncias

### Admins

- `createAdmin` normaliza email antes de armazenar
- Admin não pode se auto-deletar
- Apenas `is_superadmin = true` pode deletar outros admins
- O `is_superadmin` é definido diretamente no DynamoDB — não há endpoint para setá-lo (precisa ser feito manualmente ou via seed)

### Grupos e Comunidade

- Grupos públicos: `join` → `status = 'active'` imediatamente
- Grupos privados: `join` → `status = 'pending'`, aguarda aprovação do leader
- Leader pode promover membros para `co-leader`
- Co-leaders podem moderar posts e comentários do grupo
- Remoção de membro emite evento `kicked_from_group` via WebSocket para o usuário removido
- `report_count` é incrementado atomicamente com `ADD report_count :inc` no DynamoDB (evita race conditions)

### Upload de Imagens

- Todos os uploads passam por **Sharp** para processamento antes de ir ao S3
- Perfil: convertido para **JPEG** independente do formato original
- Grupos: convertido para **WebP**
- O S3 bucket **não usa ACLs** — objeto é público via **bucket policy** que permite `s3:GetObject` para `*`
- URL retornada: `https://{bucket}.s3.{region}.amazonaws.com/{key}`

---

## WebSocket (Socket.IO)

O gateway de WebSocket está em `src/chat/chat.gateway.ts`.

### Conexão

O cliente envia o token JWT no handshake:
```javascript
socket = io(API_URL, {
  auth: { token: accessToken }  // ou via extraHeaders
})
```

O gateway verifica o token no evento `connection` e associa `socket.id` ao `userId`.

### Eventos Emitidos pelo Servidor

| Evento | Dados | Quando |
|---|---|---|
| `new_message` | `{ conversationId, message }` | Novo mensagem enviada via `POST /chat/messages/:id` |
| `messages_read` | `{ conversationId, readBy }` | Conversa marcada como lida |
| `new_post` | `{ post }` | Novo post criado no feed global |
| `user_online` | `{ userId }` | Usuário conectou ao WS |
| `online_users` | `string[]` | Lista de usuários online (enviado ao conectar) |
| `kicked_from_group` | `{ groupId }` | Membro removido de grupo pelo leader |
| `inbox_update` | `{ conversationId, message }` | Nova mensagem no inbox do destinatário |

### Rastreamento de Usuários Online

O gateway mantém um Map `userId → Set<socketId>` para lidar com múltiplas conexões do mesmo usuário (ex: dois dispositivos). Quando o último socket de um usuário desconecta, ele é marcado como offline.

---

## Armazenamento S3

### Buckets

| Bucket | Região | Conteúdo |
|---|---|---|
| `awscandi-image-uploads` | `us-east-2` | Fotos de perfil (`profile-images/`), imagens de grupos (`groups/`), imagens de posts |
| `awscandi-file-uploads` | `us-east-2` | Entradas do diário pessoal (`{userId}/YYYY-MM-DD.txt`) |

### Estrutura de Paths no S3

```
awscandi-image-uploads/
├── profile-images/
│   └── {profileId}.jpg          # Foto de perfil (sempre JPEG)
├── groups/
│   ├── {groupId}-photo.webp     # Foto do grupo
│   └── {groupId}-banner.webp    # Banner do grupo
└── posts/
    └── {postId}-{filename}      # Imagem anexada a post

awscandi-file-uploads/
└── {userId}/
    └── YYYY-MM-DD.txt           # Entrada do diário
```

### Acesso Público

O bucket usa **bucket policy** para acesso público de leitura. Nenhuma requisição de upload usa `ACL: 'public-read'` (desabilitado em buckets criados após abril 2023).

Bucket policy necessária:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::awscandi-image-uploads/*"
  }]
}
```

---

## Variáveis de Ambiente

Arquivo `.env` na raiz do projeto:

```env
# JWT — Nunca usar a mesma secret para access e refresh
ACCESS_TOKEN_SECRET=sua_chave_secreta_access_aqui
REFRESH_TOKEN_SECRET=sua_chave_secreta_refresh_aqui

# AWS — Credenciais com permissões DynamoDB + S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# DynamoDB
DYNAMO_TABLE_PROFILE=CANDIProfile

# S3
AWS_S3_BUCKET_PROFILE=awscandi-image-uploads
AWS_S3_REGION=us-east-2
AWS_S3_BUCKET_FILE=awscandi-file-uploads

# Servidor
PORT=3000
NODE_ENV=development   # ou production

# Email — Gmail com App Password (não usar senha real)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=contatocandiejs@gmail.com
SMTP_PASS=xxxx_xxxx_xxxx_xxxx   # App Password do Google

# Admin
ADMIN_SECRET=candi_admin_2026   # Secret para criar admin via /auth/register

# App
APP_URL=http://localhost:8081   # URL do frontend (para links em emails)
COOKIE_SECRET=supersecret
```

---

## Estrutura de Pastas

```
CANDI-backend-API/
├── src/
│   ├── app.module.ts
│   ├── main.ts                              # Bootstrap Fastify + multipart + cookies + CORS
│   │
│   ├── admin/
│   │   ├── admin.controller.ts
│   │   ├── admin.guard.ts                   # Verifica role=admin
│   │   ├── admin.module.ts
│   │   ├── admin.service.ts
│   │   └── support.controller.ts            # Endpoints de leitura para suporte
│   │
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.guard.ts                    # Verifica Bearer token
│   │   ├── auth.dto.ts
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   └── recovery/
│   │       ├── password-recovery.service.ts # Código 6 dígitos, 10min, em memória
│   │       ├── recovery.controller.ts
│   │       └── recovery.module.ts
│   │
│   ├── chat/
│   │   ├── chat.controller.ts
│   │   ├── chat.gateway.ts                  # Socket.IO WebSocket Gateway
│   │   ├── chat.module.ts
│   │   └── chat.service.ts
│   │
│   ├── community/
│   │   ├── community.controller.ts
│   │   ├── community.module.ts
│   │   └── community.service.ts
│   │
│   ├── diary/
│   │   ├── diary.controller.ts
│   │   ├── diary.module.ts
│   │   └── diary.service.ts                 # Lê/escreve em S3 (não DynamoDB)
│   │
│   ├── dynamodb/
│   │   ├── dynamo-bootstrap.service.ts      # Cria 18 tabelas no startup
│   │   └── dynamodb.module.ts               # Provider DYNAMO_CLIENT
│   │
│   ├── emergency-contacts/
│   │   ├── emergency-contacts.controller.ts
│   │   ├── emergency-contacts.module.ts
│   │   └── emergency-contacts.service.ts
│   │
│   ├── feed/
│   │   ├── feed.controller.ts
│   │   ├── feed.module.ts
│   │   └── feed.service.ts
│   │
│   ├── journal/
│   │   ├── journal.controller.ts
│   │   ├── journal.module.ts
│   │   └── journal.service.ts
│   │
│   ├── s3/
│   │   ├── profile-image.controller.ts
│   │   ├── profile-image.module.ts
│   │   ├── profile-image.service.ts         # Sharp → JPEG → S3
│   │   └── s3.provider.module.ts
│   │
│   ├── schedule/
│   │   ├── calendar/
│   │   │   ├── calendar.controller.ts
│   │   │   ├── calendar.module.ts
│   │   │   └── calendar.service.ts
│   │   ├── medicines/
│   │   │   ├── medicines.controller.ts
│   │   │   ├── medicines.module.ts
│   │   │   └── medicines.service.ts
│   │   └── symptoms/
│   │       ├── symptoms.controller.ts
│   │       ├── symptoms.module.ts
│   │       └── symptoms.service.ts
│   │
│   └── treatment/
│       └── milestones/
│           ├── milestones.controller.ts
│           ├── milestones.module.ts
│           └── milestones.service.ts
│
├── .env
├── package.json
├── tsconfig.json
├── nest-cli.json
└── README.md
```

---

## Como Rodar

```bash
# Instalar dependências
npm install

# Desenvolvimento (hot reload)
npm run start:dev

# Produção
npm run build
npm run start:prod

# Testes unitários
npm run test

# Testes e2e
npm run test:e2e
```

> Na primeira execução, o `DynamoBootstrapService` criará automaticamente todas as 18 tabelas DynamoDB. Verifique os logs — cada tabela aparece como `✓ criada` ou `já existe`.

---

# API backend - CANDI

Este repositório contêm a API e suas respectivas rotas relacionadas ao backend e regras de negócio no aplicativo mobile desenvolvido como produto principal na matéria de Projeto Integrador pelo grupo CANDI, na Fatec São Caetano, para os anos de 2025-2026.

---

## :bulb: Características Principais

- **API REST completa**: 60+ endpoints organizados em módulos NestJS
- **Autenticação JWT**: Access Token (12h) + Refresh Token (7d) com rotação segura
- **Tempo Real**: WebSocket via Socket.IO para chat e notificações
- **Banco de Dados Serverless**: AWS DynamoDB com 18 tabelas e criação automática no startup
- **Armazenamento em Nuvem**: AWS S3 para imagens (Sharp) e diário pessoal
- **Moderação Automática**: Suspensão de posts e ban de usuários por threshold

## 🛠️ Tecnologias Utilizadas

- **NestJS 11 + Fastify**: Framework backend com server HTTP performático
- **AWS DynamoDB**: Banco de dados NoSQL serverless
- **AWS S3**: Armazenamento de objetos
- **Socket.IO**: WebSocket para comunicação em tempo real
- **JWT + bcrypt**: Autenticação segura
- **Sharp**: Processamento de imagens server-side
- **Nodemailer**: Envio de emails transacionais

## :gear: Arquitetura de Software

Arquitetura modular NestJS com separação por domínio:
- **Controllers**: Recebem e validam requisições HTTP
- **Services**: Lógica de negócio e acesso ao DynamoDB
- **Guards**: Autenticação e autorização por role
- **Gateways**: Eventos WebSocket em tempo real

## 📁 Estrutura do Projeto

Ver seção [Estrutura de Pastas](#estrutura-de-pastas) acima.

## 🚀 Como Utilizar

1. **Configurar variáveis de ambiente:**

    ```bash
    cp .env.example .env
    # Edite .env com suas credenciais AWS e secrets JWT
    ```

2. **Instalar e rodar:**

    ```bash
    npm install
    npm run start:dev
    ```

## 📝 Notas de Desenvolvimento

- Todos os emails são normalizados para lowercase antes de armazenar ou buscar no DynamoDB (DynamoDB Scan é case-sensitive)
- O `attachFieldsToBody: true` no multipart faz o arquivo ficar em `req.body.file._buf` — não usar `req.file()`
- O bucket S3 **não usa ACLs** — precisa de bucket policy explícita para leitura pública
- A secret do refresh token é diferente da do access token — nunca usar a mesma para os dois

---
