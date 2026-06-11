-- Multi-channel (vários canais do mesmo tipo) — FASE 1 (fundação)
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode este SQL no banco de produção ANTES de subir o
-- deploy da Fase 1. Os comandos são ADITIVOS (só adicionam colunas/índice
-- nullable), então são seguros de rodar com a versão ATUAL do app no ar — o
-- código antigo não usa essas colunas. Depois de rodar, faça o deploy.
--
-- Se o deploy subir ANTES deste SQL, o app vai tentar ler colunas que ainda
-- não existem e quebrar canais/conversas. Por isso: SQL primeiro, deploy depois.
--
-- A Fase 1 NÃO remove a trava de "1 canal por tipo" ainda (isso é a Fase 3,
-- junto com o refactor do CRUD). Aqui só preparamos o terreno.

-- Rótulo opcional do canal (ex.: "Loja Centro", "Loja Shopping").
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- Qual instância de canal a conversa usa (p/ responder pelo número certo
-- quando houver vários do mesmo tipo). NULL = resolve pelo tipo (comportamento
-- atual de canal único).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "channel_config_id" TEXT;

-- Índice por (account_id, type) — leitura de canais por tipo continua rápida
-- quando houver vários por tipo (Fase 3). Redundante com a unique atual, mas
-- inofensivo e já deixa pronto.
CREATE INDEX IF NOT EXISTS "channels_account_id_type_idx" ON "channels" ("account_id", "type");
