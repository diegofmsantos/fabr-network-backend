/*
  Warnings:

  - A unique constraint covering the columns `[temporada,divisao]` on the table `Campeonato` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sigla,temporada,divisao]` on the table `Time` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Campeonato_temporada_isSuperliga_key";

-- DropIndex
DROP INDEX "Time_sigla_temporada_key";

-- AlterTable
ALTER TABLE "Campeonato" ADD COLUMN     "divisao" TEXT NOT NULL DEFAULT 'D1';

-- AlterTable
ALTER TABLE "Time" ADD COLUMN     "divisao" TEXT NOT NULL DEFAULT 'D1';

-- CreateIndex
CREATE UNIQUE INDEX "Campeonato_temporada_divisao_key" ON "Campeonato"("temporada", "divisao");

-- CreateIndex
CREATE UNIQUE INDEX "Time_sigla_temporada_divisao_key" ON "Time"("sigla", "temporada", "divisao");
