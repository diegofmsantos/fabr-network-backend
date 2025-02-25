import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrarJogadores() {
  console.log('Iniciando migração dos jogadores...');
  
  // 1. Obter todos os jogadores existentes
  const jogadores = await prisma.jogador.findMany();
  
  console.log(`Encontrados ${jogadores.length} jogadores para migrar.`);
  
  // 2. Para cada jogador, criar o vínculo JogadorTime
  for (const jogador of jogadores) {
    if (jogador.timeId) {
      try {
        await prisma.jogadorTime.create({
          data: {
            jogadorId: jogador.id,
            timeId: jogador.timeId,
            temporada: '2024',
            numero: jogador.numero || 0,
            camisa: jogador.camisa || '',
            estatisticas: jogador.estatisticas || {},
          },
        });
        console.log(`Criado vínculo para jogador ID ${jogador.id} com time ID ${jogador.timeId}`);
      } catch (error) {
        console.error(`Erro ao criar vínculo para jogador ID ${jogador.id}:`, error);
      }
    } else {
      console.warn(`Jogador ID ${jogador.id} não tem timeId definido.`);
    }
  }
  
  // Nota: Não estamos removendo o campo timeId dos jogadores ainda,
  // para garantir que a migração possa ser revertida se necessário.
  
  console.log('Migração concluída!');
}

migrarJogadores()
  .catch((e) => {
    console.error('Erro durante a migração:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });