/*
  Warnings:

  - You are about to drop the column `formato` on the `Campeonato` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `Campeonato` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Campeonato" DROP COLUMN "formato",
DROP COLUMN "tipo";
