-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeCasaId_fkey";

-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeVisitanteId_fkey";

-- DropIndex
DROP INDEX "Jogo_timeCasaId_idx";

-- DropIndex
DROP INDEX "Jogo_timeVisitanteId_idx";

-- AlterTable
ALTER TABLE "Jogo" ALTER COLUMN "timeVisitanteId" DROP NOT NULL,
ALTER COLUMN "timeCasaId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeCasaId_fkey" FOREIGN KEY ("timeCasaId") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeVisitanteId_fkey" FOREIGN KEY ("timeVisitanteId") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;
