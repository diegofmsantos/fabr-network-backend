import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetDatabase() {
  try {
    console.log('🗑️ Iniciando reset do banco de dados via API...');

    // 1. Limpar dados na ordem correta (respeitando dependências)
    console.log('📊 Limpando dados das tabelas...');
    
    // ✅ ORDEM ATUALIZADA RESPEITANDO TODAS AS DEPENDÊNCIAS
    
    // Limpar estatísticas de jogos primeiro (dependem de Jogo, Jogador, Time)
    await prisma.estatisticaJogo.deleteMany();
    console.log('   ✅ EstatisticaJogo limpa');
    
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
    
    // Limpar matérias (independente)
    await prisma.materia.deleteMany();
    console.log('   ✅ Materia limpa');

    console.log('✅ Todos os dados removidos com sucesso!');

    // 2. Resetar todas as sequences (IDs voltam para 1)
    console.log('🔄 Resetando sequences...');
    console.log('⚠️ Algumas sequences podem não existir ainda (normal em banco novo)');
    
    // ✅ SEQUENCES ATUALIZADAS COM SINTAXE CORRETA
    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Time_id_seq" RESTART WITH 1`;
      console.log('   ✅ Time_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Time_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1`;
      console.log('   ✅ Jogador_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Jogador_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1`;
      console.log('   ✅ JogadorTime_id_seq resetada');
    } catch { 
      console.log('   ⚠️ JogadorTime_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1`;
      console.log('   ✅ Materia_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Materia_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1`;
      console.log('   ✅ Campeonato_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Campeonato_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Conferencia_id_seq" RESTART WITH 1`;
      console.log('   ✅ Conferencia_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Conferencia_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Regional_id_seq" RESTART WITH 1`;
      console.log('   ✅ Regional_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Regional_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "DistribuicaoTime_id_seq" RESTART WITH 1`;
      console.log('   ✅ DistribuicaoTime_id_seq resetada');
    } catch { 
      console.log('   ⚠️ DistribuicaoTime_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1`;
      console.log('   ✅ Jogo_id_seq resetada');
    } catch { 
      console.log('   ⚠️ Jogo_id_seq: não existe'); 
    }

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1`;
      console.log('   ✅ EstatisticaJogo_id_seq resetada');
    } catch { 
      console.log('   ⚠️ EstatisticaJogo_id_seq: não existe'); 
    }

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
      prisma.estatisticaJogo.count(),
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
    console.log(`   Estatísticas: ${counts[8]}`);
    console.log(`   Matérias: ${counts[9]}`);

    if (counts.every(count => count === 0)) {
      console.log('🎉 BANCO ZERADO COM SUCESSO!');
      console.log('✨ Pronto para novos dados!');
      console.log('');
      console.log('📋 Próximos passos recomendados:');
      console.log('   1. Importar Times: frontend admin → Times');
      console.log('   2. Importar Jogadores: frontend admin → Jogadores');
      console.log('   3. Criar Superliga: frontend admin → Superliga/Criar');
      console.log('   4. Importar Agenda: frontend admin → Agenda');
      console.log('   5. Importar Resultados: frontend admin → Resultados');
    } else {
      console.log('⚠️ Atenção: Alguns dados podem não ter sido removidos');
      
      const tableNames = [
        'Times', 'Jogadores', 'Jogador-Time', 'Campeonatos', 
        'Conferências', 'Regionais', 'Distribuições', 'Jogos', 'Estatísticas', 'Matérias'
      ];
      
      counts.forEach((count, index) => {
        if (count > 0) {
          console.log(`   ⚠️ ${tableNames[index]}: ${count} registros restantes`);
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
  console.log('⚠️ Esta operação vai remover TODOS os dados e resetar TODAS as migrations!');
  console.log('');
  
  try {
    console.log('⚠️ Para reset completo das migrations, execute:');
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
  console.log('  npm run reset-db          # Reset normal (dados + sequências)');
  console.log('  npm run reset-db --complete # Reset completo (migrations + dados)');
  console.log('  npm run reset-db --help     # Mostrar esta ajuda');
  console.log('');
  console.log('🔍 O que cada comando faz:');
  console.log('  Normal: Remove dados e reseta IDs para 1, mantém estrutura das tabelas');
  console.log('  Completo: Remove tudo e recria database do zero');
} else {
  resetDatabase();
}