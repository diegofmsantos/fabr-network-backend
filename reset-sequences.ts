import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetDatabase() {
  try {
    console.log('🗑️  Iniciando limpeza do banco de dados...');

    // 1. Limpar dados na ordem correta (respeitando dependências)
    console.log('📊 Limpando dados das tabelas...');
    
    await prisma.estatisticaJogo.deleteMany();
    await prisma.jogo.deleteMany();
    await prisma.campeonato.deleteMany();
    await prisma.jogadorTime.deleteMany();
    await prisma.jogador.deleteMany();
    await prisma.time.deleteMany();
    await prisma.metaDados.deleteMany();
    await prisma.materia.deleteMany();

    console.log('✅ Dados removidos com sucesso!');

    // 2. Resetar todas as sequences (IDs voltam para 1)
    console.log('🔄 Resetando sequences...');
    
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Time_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Grupo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "GrupoTime_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "ClassificacaoGrupo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "MetaDados_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1;');

    console.log('✅ Sequences resetadas com sucesso!');

    // 3. Verificação final
    console.log('🔍 Verificando limpeza...');
    
    const counts = await Promise.all([
      prisma.time.count(),
      prisma.jogador.count(),
      prisma.campeonato.count(),
      prisma.jogo.count(),
    ]);

    console.log('📊 Contagem final:');
    console.log(`   Times: ${counts[0]}`);
    console.log(`   Jogadores: ${counts[1]}`);
    console.log(`   Campeonatos: ${counts[2]}`);
    console.log(`   Jogos: ${counts[3]}`);

    if (counts.every(count => count === 0)) {
      console.log('🎉 BANCO ZERADO COM SUCESSO!');
      console.log('✨ Pronto para novos dados!');
    } else {
      console.log('⚠️  Atenção: Alguns dados podem não ter sido removidos');
    }

  } catch (error) {
    console.error('❌ Erro ao resetar banco:', error);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Conexão com banco encerrada');
  }
}

resetDatabase();