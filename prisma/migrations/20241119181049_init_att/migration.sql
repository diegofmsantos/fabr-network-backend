/*
  Warnings:

  - You are about to drop the column `brasileirao` on the `Time` table. All the data in the column will be lost.
  - Made the column `estatisticas` on table `Jogador` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
CREATE SEQUENCE jogador_id_seq;
ALTER TABLE "Jogador" ALTER COLUMN "id" SET DEFAULT nextval('jogador_id_seq'),
ALTER COLUMN "estatisticas" SET NOT NULL;
ALTER SEQUENCE jogador_id_seq OWNED BY "Jogador"."id";

-- AlterTable
CREATE SEQUENCE time_id_seq;
ALTER TABLE "Time" DROP COLUMN "brasileirao",
ALTER COLUMN "id" SET DEFAULT nextval('time_id_seq');
ALTER SEQUENCE time_id_seq OWNED BY "Time"."id";
