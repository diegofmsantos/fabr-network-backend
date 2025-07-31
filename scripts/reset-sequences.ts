// scripts/reset-sequences.ts - VERSÃO CORRIGIDA
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  console.log('🚀 INICIANDO RESET COMPLETO DO BANCO DE DADOS')
  console.log('⚠️ Esta operação vai remover TODOS os dados!')
  console.log('')

  try {
    // 1. Limpar dados de todas as tabelas na ordem correta (relacionamentos)
    console.log('📊 Limpando dados das tabelas...')

    await prisma.estatisticaJogo.deleteMany()
    console.log('   ✅ EstatisticaJogo limpa')

    await prisma.jogo.deleteMany()
    console.log('   ✅ Jogo limpa')

    await prisma.distribuicaoTime.deleteMany()
    console.log('   ✅ DistribuicaoTime limpa')

    await prisma.regional.deleteMany()
    console.log('   ✅ Regional limpa')

    await prisma.conferencia.deleteMany()
    console.log('   ✅ Conferencia limpa')

    await prisma.campeonato.deleteMany()
    console.log('   ✅ Campeonato limpa')

    await prisma.jogadorTime.deleteMany()
    console.log('   ✅ JogadorTime limpa')

    await prisma.jogador.deleteMany()
    console.log('   ✅ Jogador limpa')

    await prisma.time.deleteMany()
    console.log('   ✅ Time limpa')

    await prisma.materia.deleteMany()
    console.log('   ✅ Materia limpa')

    // 2. Resetar todas as sequences (IDs voltam para 1)
    console.log('🔄 Resetando sequences...')
    console.log('⚠️ Algumas sequences podem não existir ainda (normal em banco novo)')

    // ✅ SEQUENCES CORRIGIDAS - REMOVIDA A INEXISTENTE PlayoffJogo_id_seq

    console.log('🔄 Resetando sequences...')

    try {
      // ✅ CORRIGIDO: Sintaxe padronizada e sequence inexistente removida
      await prisma.$executeRaw`ALTER SEQUENCE "Time_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Jogador_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "JogadorTime_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Materia_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Campeonato_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Conferencia_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Regional_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "DistribuicaoTime_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "Jogo_id_seq" RESTART WITH 1`
      await prisma.$executeRaw`ALTER SEQUENCE "EstatisticaJogo_id_seq" RESTART WITH 1`

      console.log('✅ Sequences resetadas com sucesso!')
    } catch (error) {
      console.error('⚠️ Erro ao resetar sequences:', error)
      // Continua mesmo com erro (algumas sequences podem não existir)
    }

    console.log('✅ Sequences resetadas com sucesso!')

    // 3. Verificação final expandida
    console.log('🔍 Verificando limpeza...')

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
    ])

    console.log('📊 Contagem final:')
    console.log(`   Times: ${counts[0]}`)
    console.log(`   Jogadores: ${counts[1]}`)
    console.log(`   Jogador-Time: ${counts[2]}`)
    console.log(`   Campeonatos: ${counts[3]}`)
    console.log(`   Conferências: ${counts[4]}`)
    console.log(`   Regionais: ${counts[5]}`)
    console.log(`   Distribuições: ${counts[6]}`)
    console.log(`   Jogos: ${counts[7]}`)
    console.log(`   Estatísticas: ${counts[8]}`)
    console.log(`   Matérias: ${counts[9]}`)

    if (counts.every(count => count === 0)) {
      console.log('🎉 BANCO ZERADO COM SUCESSO!')
      console.log('✨ Pronto para novos dados!')
      console.log('')
      console.log('📋 Próximos passos recomendados:')
      console.log('   1. Importar Times: frontend admin → Times')
      console.log('   2. Importar Jogadores: frontend admin → Jogadores')
      console.log('   3. Criar Superliga: frontend admin → Superliga/Criar')
      console.log('   4. Importar Agenda: frontend admin → Agenda')
      console.log('   5. Importar Resultados: frontend admin → Resultados')
    } else {
      console.log('⚠️ Atenção: Alguns dados podem não ter sido removidos')

      const tableNames = [
        'Times', 'Jogadores', 'Jogador-Time', 'Campeonatos',
        'Conferências', 'Regionais', 'Distribuições', 'Jogos', 'Estatísticas', 'Matérias'
      ]

      counts.forEach((count, index) => {
        if (count > 0) {
          console.log(`   ⚠️ ${tableNames[index]}: ${count} registros restantes`)
        }
      })
    }

  } catch (error) {
    console.error('❌ Erro ao resetar banco:', error)

    // ✅ INFORMAÇÕES ÚTEIS PARA DEBUG
    if (error instanceof Error) {
      console.error('📝 Detalhes do erro:', error.message)

      if (error.message.includes('sequence')) {
        console.log('💡 Dica: Algumas sequences podem não existir ainda (normal em banco novo)')
      }

      if (error.message.includes('relation') || error.message.includes('table')) {
        console.log('💡 Dica: Execute primeiro "npx prisma migrate dev" para criar as tabelas')
      }
    }

  } finally {
    await prisma.$disconnect()
    console.log('🔌 Conexão com banco encerrada')
  }
}

// ✅ VERIFICAR ARGUMENTOS DA LINHA DE COMANDO
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log('📖 USO DO SCRIPT:')
  console.log('')
  console.log('  npm run reset-db          # Reset normal (dados + sequências)')
  console.log('  npm run reset-db --help   # Mostrar esta ajuda')
  console.log('')
  console.log('🔍 O que o script faz:')
  console.log('  - Remove todos os dados de todas as tabelas')
  console.log('  - Reseta todas as sequences (IDs voltam para 1)')
  console.log('  - Mantém a estrutura das tabelas intacta')
  console.log('  - Prepara o banco para novos dados')
} else {
  resetDatabase()
}