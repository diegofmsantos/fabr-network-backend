import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetDatabase() {
  try {
    console.log('🗑️  Iniciando limpeza do banco de dados...');

    // 1. Limpar dados na ordem correta (respeitando dependências)
    console.log('📊 Limpando dados das tabelas...');
    
    // ✅ ORDEM ATUALIZADA RESPEITANDO TODAS AS DEPENDÊNCIAS
    
    // Limpar estatísticas de jogos primeiro (dependem de Jogo, Jogador, Time)
    await prisma.estatisticaJogo.deleteMany();
    console.log('   ✅ EstatisticaJogo limpa');
    
    // Limpar jogos de playoff (dependem de Campeonato, Conferencia, Time)
    await prisma.playoffJogo.deleteMany();
    console.log('   ✅ PlayoffJogo limpa');
    
    // Limpar jogos regulares (dependem de Campeonato, Time)
    await prisma.jogo.deleteMany();
    console.log('   ✅ Jogo limpa');
    
    // ✅ NOVA: Limpar distribuição de times (depende de Campeonato, Conferencia, Regional, Time)
    await prisma.distribuicaoTime.deleteMany();
    console.log('   ✅ DistribuicaoTime limpa');
    
    // Limpar regionais (dependem de Conferencia)
    await prisma.regional.deleteMany();
    console.log('   ✅ Regional limpa');
    
    // Limpar conferências (dependem de Campeonato)
    await prisma.conferencia.deleteMany();
    console.log('   ✅ Conferencia limpa');
    
    // Limpar campeonatos
    await prisma.campeonato.deleteMany();
    console.log('   ✅ Campeonato limpa');
    
    // Limpar relacionamento jogador-time (depende de Jogador, Time)
    await prisma.jogadorTime.deleteMany();
    console.log('   ✅ JogadorTime limpa');
    
    // Limpar jogadores
    await prisma.jogador.deleteMany();
    console.log('   ✅ Jogador limpa');
    
    // Limpar times
    await prisma.time.deleteMany();
    console.log('   ✅ Time limpa');
    
    // Limpar metadados (independente)
    await prisma.metaDados.deleteMany();
    console.log('   ✅ MetaDados limpa');
    
    // Limpar matérias (independente)
    await prisma.materia.deleteMany();
    console.log('   ✅ Materia limpa');

    console.log('✅ Todos os dados removidos com sucesso!');

    // 2. Resetar todas as sequences (IDs voltam para 1)
    console.log('🔄 Resetando sequences...');
    
    // ✅ SEQUENCES ATUALIZADAS COM BASE NO NOVO SCHEMA
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Time_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "MetaDados_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Conferencia_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Regional_id_seq" RESTART WITH 1;');
    
    // ✅ NOVA SEQUENCE PARA DISTRIBUIÇÃO
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "DistribuicaoTime_id_seq" RESTART WITH 1;');
    
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "PlayoffJogo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1;');
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1;');
  

    console.log('✅ Sequences resetadas com sucesso!');

    // 3. Verificação final expandida
    console.log('🔍 Verificando limpeza...');
    
    const counts = await Promise.all([
      prisma.time.count(),
      prisma.jogador.count(),
      prisma.jogadorTime.count(),
      prisma.campeonato.count(),
      prisma.conferencia.count(),
      prisma.regional.count(),
      prisma.distribuicaoTime.count(), 
      prisma.jogo.count(),
      prisma.playoffJogo.count(),
      prisma.estatisticaJogo.count(),
      prisma.metaDados.count(),
      prisma.materia.count(),
    ]);

    console.log('📊 Contagem final:');
    console.log(`   Times: ${counts[0]}`);
    console.log(`   Jogadores: ${counts[1]}`);
    console.log(`   Jogador-Time: ${counts[2]}`);
    console.log(`   Campeonatos: ${counts[3]}`);
    console.log(`   Conferências: ${counts[4]}`);
    console.log(`   Regionais: ${counts[5]}`);
    console.log(`   Distribuições: ${counts[6]}`); 
    console.log(`   Jogos: ${counts[7]}`);
    console.log(`   Playoff Jogos: ${counts[8]}`);
    console.log(`   Estatísticas: ${counts[9]}`);
    console.log(`   MetaDados: ${counts[10]}`);
    console.log(`   Matérias: ${counts[11]}`);

    if (counts.every(count => count === 0)) {
      console.log('🎉 BANCO ZERADO COM SUCESSO!');
      console.log('✨ Pronto para novos dados!');
      console.log('');
      console.log('📋 Próximos passos recomendados:');
      console.log('   1. Importar Times: npm run import-times');
      console.log('   2. Importar Jogadores: npm run import-players');
      console.log('   3. Criar Superliga: npx ts-node scripts/criar-superliga.ts');
      console.log('   4. Popular Distribuição: npx ts-node scripts/populate-distribuicao-inicial.ts');
    } else {
      console.log('⚠️  Atenção: Alguns dados podem não ter sido removidos');
      
      const tableNames = [
        'Times', 'Jogadores', 'Jogador-Time', 'Campeonatos', 
        'Conferências', 'Regionais', 'Distribuições', 'Jogos', 
        'Playoff Jogos', 'Estatísticas', 'MetaDados', 'Matérias'
      ];
      
      counts.forEach((count, index) => {
        if (count > 0) {
          console.log(`   ⚠️  ${tableNames[index]}: ${count} registros restantes`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Erro ao resetar banco:', error);
    
    // ✅ INFORMAÇÕES ÚTEIS PARA DEBUG
    if (error instanceof Error) {
      console.error('📝 Detalhes do erro:', error.message);
      
      if (error.message.includes('sequence')) {
        console.log('💡 Dica: Algumas sequences podem não existir ainda (normal em banco novo)');
      }
      
      if (error.message.includes('relation') || error.message.includes('table')) {
        console.log('💡 Dica: Execute primeiro "npx prisma migrate dev" para criar as tabelas');
      }
    }
    
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Conexão com banco encerrada');
  }
}

// ✅ FUNÇÃO AUXILIAR PARA RESET COMPLETO (OPCIONAL)
async function resetCompleto() {
  console.log('🚨 RESET COMPLETO DO BANCO DE DADOS');
  console.log('⚠️  Esta operação vai remover TODOS os dados e resetar TODAS as migrations!');
  console.log('');
  
  try {
    // Reset das migrations (cuidado - remove todas as tabelas)
    console.log('🔄 Fazendo reset das migrations...');
    // await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    
    console.log('⚠️  Para reset completo das migrations, execute:');
    console.log('   npx prisma migrate reset --force');
    console.log('   npx prisma migrate dev');
    
  } catch (error) {
    console.error('❌ Erro no reset completo:', error);
  }
}

// ✅ VERIFICAR ARGUMENTOS DA LINHA DE COMANDO
const args = process.argv.slice(2);

if (args.includes('--complete') || args.includes('-c')) {
  resetCompleto();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('📖 USO DO SCRIPT:');
  console.log('');
  console.log('  npm run reset-db          # Reset normal (dados apenas)');
  console.log('  npm run reset-db --complete # Reset completo (migrations + dados)');
  console.log('  npm run reset-db --help     # Mostrar esta ajuda');
  console.log('');
  console.log('🔍 O que cada comando faz:');
  console.log('  Normal: Remove dados e reseta IDs, mantém estrutura das tabelas');
  console.log('  Completo: Remove tudo e recria database do zero');
} else {
  resetDatabase();
}