/*
  Warnings:

  - You are about to drop the `MetaDados` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeCasaId_fkey";

-- DropForeignKey
ALTER TABLE "Jogo" DROP CONSTRAINT "Jogo_timeVisitanteId_fkey";

-- AlterTable
ALTER TABLE "Jogo" ALTER COLUMN "timeVisitanteId" DROP NOT NULL,
ALTER COLUMN "timeCasaId" DROP NOT NULL;

-- DropTable
DROP TABLE "MetaDados";

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeCasaId_fkey" FOREIGN KEY ("timeCasaId") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jogo" ADD CONSTRAINT "Jogo_timeVisitanteId_fkey" FOREIGN KEY ("timeVisitanteId") REFERENCES "Time"("id") ON DELETE SET NULL ON UPDATE CASCADE;
