/*
  Warnings:

  - You are about to drop the column `createdAt` on the `EstatisticaJogo` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `EstatisticaJogo` table. All the data in the column will be lost.
  - You are about to drop the `PlayoffJogo` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[temporada,isSuperliga]` on the table `Campeonato` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `campeonatoId` to the `EstatisticaJogo` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "EstatisticaJogo" DROP CONSTRAINT "EstatisticaJogo_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "EstatisticaJogo" DROP CONSTRAINT "EstatisticaJogo_jogoId_fkey";

-- DropForeignKey
ALTER TABLE "EstatisticaJogo" DROP CONSTRAINT "EstatisticaJogo_timeId_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_campeonatoId_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_conferenciaId_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_jogoAnterior1Id_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_jogoAnterior2Id_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_timeClassificado1Id_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_timeClassificado2Id_fkey";

-- DropForeignKey
ALTER TABLE "PlayoffJogo" DROP CONSTRAINT "PlayoffJogo_timeVencedorId_fkey";

-- DropIndex
DROP INDEX "EstatisticaJogo_fase_idx";

-- DropIndex
DROP INDEX "EstatisticaJogo_jogadorId_idx";

-- DropIndex
DROP INDEX "EstatisticaJogo_jogoId_idx";

-- DropIndex
DROP INDEX "EstatisticaJogo_rodada_idx";

-- DropIndex
DROP INDEX "EstatisticaJogo_temporada_idx";

-- DropIndex
DROP INDEX "EstatisticaJogo_timeId_idx";

-- AlterTable
ALTER TABLE "EstatisticaJogo" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "campeonatoId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Jogo" ADD COLUMN     "conferenciaId" INTEGER,
ADD COLUMN     "nome" TEXT,
ADD COLUMN     "regionalId" INTEGER,
ADD COLUMN     "timeVencedorId" INTEGER;

-- DropTable
DROP TABLE "PlayoffJogo";

-- CreateIndex
CREATE UNIQUE INDEX "Campeonato_temporada_isSuperliga_key" ON "Campeonato"("temporada", "isSuperliga");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_campeonatoId_timeId_idx" ON "EstatisticaJogo"("campeonatoId", "timeId");

-- CreateIndex
CREATE INDEX "EstatisticaJogo_campeonatoId_jogadorId_idx" ON "EstatisticaJogo"("campeonatoId", "jogadorId");

-- CreateIndex
CREATE INDEX "Jogo_campeonatoId_fase_idx" ON "Jogo"("campeonatoId", "fase");

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "Conferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_regionalId_fkey" FOREIGN KEY ("regionalId") REFERENCES "Regional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_jogoId_fkey" FOREIGN KEY ("jogoId") REFERENCES "Jogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_timeId_fkey" FOREIGN KEY ("timeId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaJogo" ADD CONSTRAINT "EstatisticaJogo_campeonatoId_fkey" FOREIGN KEY ("campeonatoId") REFERENCES "Campeonato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
