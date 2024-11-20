-- AlterTable
ALTER TABLE "Jogador" ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "Jogador_id_seq";

-- AlterTable
ALTER TABLE "Time" ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "Time_id_seq";
