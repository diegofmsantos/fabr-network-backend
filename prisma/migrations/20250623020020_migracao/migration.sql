-- AlterTable
ALTER TABLE "Campeonato" ADD COLUMN     "configSuperliga" JSONB,
ADD COLUMN     "isSuperliga" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Grupo" ADD COLUMN     "regionalId" INTEGER;

-- CreateTable
CREATE TABLE "Conferencia" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "campeonatoId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "totalTimes" INTEGER NOT NULL,

    CONSTRAINT "Conferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regional" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "conferenciaId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "timesPorRegional" INTEGER NOT NULL,

    CONSTRAINT "Regional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayoffJogo" (
    "id" SERIAL NOT NULL,
    "campeonatoId" INTEGER NOT NULL,
    "conferenciaId" INTEGER,
    "fase" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "timeClassificado1Id" INTEGER,
    "timeClassificado2Id" INTEGER,
    "jogoAnterior1Id" INTEGER,
    "jogoAnterior2Id" INTEGER,
    "timeVencedorId" INTEGER,
    "dataJogo" TIMESTAMP(3),
    "local" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO',
    "placarTime1" INTEGER,
    "placarTime2" INTEGER,
    "observacoes" TEXT,

    CONSTRAINT "PlayoffJogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conferencia_campeonatoId_idx" ON "Conferencia"("campeonatoId");

-- CreateIndex
CREATE UNIQUE INDEX "Conferencia_campeonatoId_tipo_key" ON "Conferencia"("campeonatoId", "tipo");

-- CreateIndex
CREATE INDEX "Regional_conferenciaId_idx" ON "Regional"("conferenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "Regional_conferenciaId_tipo_key" ON "Regional"("conferenciaId", "tipo");

-- CreateIndex
CREATE INDEX "PlayoffJogo_campeonatoId_fase_rodada_idx" ON "PlayoffJogo"("campeonatoId", "fase", "rodada");

-- CreateIndex
CREATE INDEX "PlayoffJogo_conferenciaId_idx" ON "PlayoffJogo"("conferenciaId");

-- AddForeignKey
ALTER TABLE "Conferencia" ADD CONSTRAINT "Conferencia_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regional" ADD CONSTRAINT "Regional_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "Conferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_regionalId_fkey" FOREIGN KEY ("regionalId") REFERENCES "Regional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "Conferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_timeClassificado1Id_fkey" FOREIGN KEY ("timeClassificado1Id") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_timeClassificado2Id_fkey" FOREIGN KEY ("timeClassificado2Id") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_timeVencedorId_fkey" FOREIGN KEY ("timeVencedorId") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_jogoAnterior1Id_fkey" FOREIGN KEY ("jogoAnterior1Id") REFERENCES "PlayoffJogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayoffJogo" ADD CONSTRAINT "PlayoffJogo_jogoAnterior2Id_fkey" FOREIGN KEY ("jogoAnterior2Id") REFERENCES "PlayoffJogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
