-- CreateTable
CREATE TABLE "Campeonato" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "temporada" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "descricao" TEXT,
    "formato" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campeonato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "campeonatoId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoTime" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "timeId" INTEGER NOT NULL,

    CONSTRAINT "GrupoTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jogo" (
    "id" SERIAL NOT NULL,
    "campeonatoId" INTEGER NOT NULL,
    "grupoId" INTEGER,
    "timeVisitanteId" INTEGER NOT NULL,
    "timeCasaId" INTEGER NOT NULL,
    "dataJogo" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "rodada" INTEGER NOT NULL,
    "fase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGENDADO',
    "placarCasa" INTEGER,
    "placarVisitante" INTEGER,
    "observacoes" TEXT,
    "estatisticasProcessadas" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Jogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstatisticaJogo" (
    "id" SERIAL NOT NULL,
    "jogoId" INTEGER NOT NULL,
    "jogadorId" INTEGER NOT NULL,
    "timeId" INTEGER NOT NULL,
    "estatisticas" JSONB NOT NULL,

    CONSTRAINT "EstatisticaJogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificacaoGrupo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "timeId" INTEGER NOT NULL,
    "posicao" INTEGER NOT NULL,
    "jogos" INTEGER NOT NULL DEFAULT 0,
    "vitorias" INTEGER NOT NULL DEFAULT 0,
    "empates" INTEGER NOT NULL DEFAULT 0,
    "derrotas" INTEGER NOT NULL DEFAULT 0,
    "pontosPro" INTEGER NOT NULL DEFAULT 0,
    "pontosContra" INTEGER NOT NULL DEFAULT 0,
    "saldoPontos" INTEGER NOT NULL DEFAULT 0,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "aproveitamento" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ClassificacaoGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campeonato_temporada_idx" ON "Campeonato"("temporada");

-- CreateIndex
CREATE INDEX "Campeonato_status_idx" ON "Campeonato"("status");

-- CreateIndex
CREATE INDEX "Grupo_campeonatoId_idx" ON "Grupo"("campeonatoId");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_campeonatoId_nome_key" ON "Grupo"("campeonatoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoTime_grupoId_timeId_key" ON "GrupoTime"("grupoId", "timeId");

-- CreateIndex
CREATE INDEX "Jogo_campeonatoId_rodada_idx" ON "Jogo"("campeonatoId", "rodada");

-- CreateIndex
CREATE INDEX "Jogo_dataJogo_idx" ON "Jogo"("dataJogo");

-- CreateIndex
CREATE INDEX "Jogo_status_idx" ON "Jogo"("status");

-- CreateIndex
CREATE INDEX "Jogo_timeCasaId_idx" ON "Jogo"("timeCasaId");

-- CreateIndex
CREATE INDEX "Jogo_timeVisitanteId_idx" ON "Jogo"("timeVisitanteId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_jogoId_idx" ON "EstatisticaJogo"("jogoId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_jogadorId_idx" ON "EstatisticaJogo"("jogadorId");

-- CreateIndex
CREATE UNIQUE INDEX "EstatisticaJogo_jogoId_jogadorId_key" ON "EstatisticaJogo"("jogoId", "jogadorId");

-- CreateIndex
CREATE INDEX "ClassificacaoGrupo_grupoId_posicao_idx" ON "ClassificacaoGrupo"("grupoId", "posicao");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificacaoGrupo_grupoId_timeId_key" ON "ClassificacaoGrupo"("grupoId", "timeId");

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoTime" ADD CONSTRAINT "GrupoTime_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoTime" ADD CONSTRAINT "GrupoTime_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeCasaId_fkey" FOREIGN KEY ("timeCasaId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeVisitanteId_fkey" FOREIGN KEY ("timeVisitanteId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_jogoId_fkey" FOREIGN KEY ("jogoId") REFERENCES "Jogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoGrupo" ADD CONSTRAINT "ClassificacaoGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoGrupo" ADD CONSTRAINT "ClassificacaoGrupo_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE CASCADE ON UPDATE CASCADE;
