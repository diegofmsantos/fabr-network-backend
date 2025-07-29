/*
  Warnings:

  - Made the column `timeVisitanteId` on table `Jogo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timeCasaId` on table `Jogo` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeCasaId_fkey";

-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeVisitanteId_fkey";

-- AlterTable
ALTER TABLE "Jogo" ALTER COLUMN "timeVisitanteId" SET NOT NULL,
ALTER COLUMN "timeCasaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeCasaId_fkey" FOREIGN KEY ("timeCasaId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeVisitanteId_fkey" FOREIGN KEY ("timeVisitanteId") REFERENCES "Time"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
