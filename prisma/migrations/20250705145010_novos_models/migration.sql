/*
  Warnings:

  - Added the required column `updatedAt` to the `EstatisticaJogo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Jogo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EstatisticaJogo" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fase" TEXT,
ADD COLUMN     "rodada" INTEGER,
ADD COLUMN     "temporada" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Jogo" ADD COLUMN     "conferencia" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "regional" TEXT,
ADD COLUMN     "temporada" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "DistribuicaoTime" (
    "id" SERIAL NOT NULL,
    "campeonatoId" INTEGER NOT NULL,
    "conferenciaId" INTEGER NOT NULL,
    "regionalId" INTEGER NOT NULL,
    "timeId" INTEGER NOT NULL,
    "temporada" TEXT NOT NULL,
    "conferenciaType" TEXT NOT NULL,
    "regionalType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistribuicaoTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistribuicaoTime_campeonatoId_temporada_idx" ON "DistribuicaoTime"("campeonatoId", "temporada");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_conferenciaId_idx" ON "DistribuicaoTime"("conferenciaId");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_regionalId_idx" ON "DistribuicaoTime"("regionalId");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_timeId_idx" ON "DistribuicaoTime"("timeId");

-- CreateIndex
CREATE INDEX "DistribuicaoTime_temporada_idx" ON "DistribuicaoTime"("temporada");

-- CreateIndex
CREATE UNIQUE INDEX "DistribuicaoTime_campeonatoId_timeId_temporada_key" ON "DistribuicaoTime"("campeonatoId", "timeId", "temporada");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_timeId_idx" ON "EstatisticaJogo"("timeId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_temporada_idx" ON "EstatisticaJogo"("temporada");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_rodada_idx" ON "EstatisticaJogo"("rodada");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_fase_idx" ON "EstatisticaJogo"("fase");

-- CreateIndex
CREATE INDEX "Jogo_conferencia_idx" ON "Jogo"("conferencia");

-- CreateIndex
CREATE INDEX "Jogo_regional_idx" ON "Jogo"("regional");

-- CreateIndex
CREATE INDEX "Jogo_temporada_idx" ON "Jogo"("temporada");

-- CreateIndex
CREATE INDEX "Jogo_fase_idx" ON "Jogo"("fase");

-- AddForeignKey
ALTER TABLE "DistribuicaoTime" ADD CONSTRAINT "DistribuicaoTime_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribuicaoTime" ADD CONSTRAINT "DistribuicaoTime_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "Conferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribuicaoTime" ADD CONSTRAINT "DistribuicaoTime_regionalId_fkey" FOREIGN KEY ("regionalId") REFERENCES "Regional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribuicaoTime" ADD CONSTRAINT "DistribuicaoTime_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE CASCADE ON UPDATE CASCADE;
