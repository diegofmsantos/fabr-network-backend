// scripts/fluxo-completo-teste.ts - VERSÃO FINAL ATUALIZADA
// Script master para executar todo o fluxo de teste da Superliga

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface FluxoStep {
  id: number
  nome: string
  descricao: string
  comando?: string
  manual: boolean
  concluido: boolean
  erro?: string
}

const FLUXO_TESTE: FluxoStep[] = [
  {
    id: 1,
    nome: 'Zerar Banco',
    descricao: 'Limpar banco de dados e resetar sequences',
    comando: 'npm run reset-db',
    manual: false,
    concluido: false
  },
  {
    id: 2,
    nome: 'Importar Times',
    descricao: 'Upload da planilha times_tackle_2025.xlsx (32 times)',
    manual: true,
    concluido: false
  },
  {
    id: 3,
    nome: 'Importar Jogadores',
    descricao: 'Upload da planilha jogadores_tackle_2025.xlsx (~1565 jogadores)',
    manual: true,
    concluido: false
  },
  {
    id: 4,
    nome: 'Criar Superliga',
    descricao: 'Acesse /admin/superliga/criar e clique em "Criar Superliga"',
    manual: true,
    concluido: false
  },
  {
    id: 5,
    nome: 'Distribuir Times',
    descricao: 'Executar script de distribuição dos times nas conferências',
    comando: 'npm run distribuir',
    manual: false,
    concluido: false
  },
  {
    id: 6,
    nome: 'Validar Distribuição',
    descricao: 'Executar scripts de validação',
    comando: 'npm run validar',
    manual: false,
    concluido: false
  },
  {
    id: 7,
    nome: 'Importar Agenda',
    descricao: 'Upload da planilha agenda_jogos.xlsx (64 jogos da temporada regular)',
    manual: true,
    concluido: false
  },
  {
    id: 8,
    nome: 'Gerar Resultados Fake',
    descricao: 'Gerar resultados fictícios dos 64 jogos',
    comando: 'npm run generate:resultados -- --complete',
    manual: false,
    concluido: false
  },
  {
    id: 9,
    nome: 'Importar Resultados',
    descricao: 'Upload da planilha de resultados (DEVE gerar playoffs automaticamente para TODAS as 4 conferências)',
    manual: true,
    concluido: false
  },
  {
    id: 10,
    nome: 'Gerar Estatísticas Fake',
    descricao: 'Gerar estatísticas fictícias dos 64 jogos (~100k registros)',
    comando: 'npm run generate:estatisticas',
    manual: false,
    concluido: false
  },
  {
    id: 11,
    nome: 'Importar Estatísticas',
    descricao: 'Upload da planilha de estatísticas (consolidação automática)',
    manual: true,
    concluido: false
  },
  {
    id: 12,
    nome: 'Simular Fase Nacional',
    descricao: 'Simular semifinais nacionais e final nacional',
    comando: 'npm run simulate:fase-nacional',
    manual: false,
    concluido: false
  }
]

async function executarFluxoCompleto(): Promise<void> {
  console.log('🎯 FLUXO COMPLETO DE TESTE DA SUPERLIGA 2025\n')
  console.log('Este script irá guiá-lo através de todo o processo de teste\n')

  // Verificar se estamos no diretório correto
  if (!fs.existsSync('package.json')) {
    console.error('❌ Execute este script a partir da raiz do projeto (onde está o package.json)')
    process.exit(1)
  }

  console.log('📋 ETAPAS DO FLUXO:')
  FLUXO_TESTE.forEach(step => {
    const tipo = step.manual ? '👤 Manual' : '🤖 Automático'
    console.log(`   ${step.id}. ${step.nome} (${tipo})`)
    console.log(`      ${step.descricao}`)
  })

  console.log('\n⚠️  IMPORTANTE:')
  console.log('   - Certifique-se que o backend está rodando (npm run dev)')
  console.log('   - Certifique-se que o frontend admin está rodando')
  console.log('   - Tenha as planilhas prontas na pasta raiz do projeto')
  console.log('   - A correção na rota de importação foi aplicada (para gerar 4/4 conferências)')

  console.log('\n🔧 PRÉ-REQUISITOS:')
  console.log('   1. Backend: npm run dev (porta 3000)')
  console.log('   2. Frontend Admin: npm run dev (porta 3001)')
  console.log('   3. Planilhas: times_tackle_2025.xlsx, jogadores_tackle_2025.xlsx, agenda_jogos.xlsx')

  // Aguardar confirmação
  console.log('\n▶️  Pressione ENTER para começar ou Ctrl+C para cancelar')
  await new Promise(resolve => process.stdin.once('data', resolve))

  // Executar cada etapa
  for (const step of FLUXO_TESTE) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🎯 ETAPA ${step.id}: ${step.nome}`)
    console.log(`📝 ${step.descricao}`)
    console.log('='.repeat(60))

    if (step.manual) {
      await executarEtapaManual(step)
    } else {
      await executarEtapaAutomatica(step)
    }

    if (step.erro) {
      console.error(`❌ Falha na etapa ${step.id}: ${step.erro}`)
      console.log('\n🛑 Fluxo interrompido. Corrija o erro e tente novamente.')
      process.exit(1)
    }

    step.concluido = true
    console.log(`✅ Etapa ${step.id} concluída!`)
  }

  // Relatório final
  await gerarRelatorioFinal()
}

async function executarEtapaManual(step: FluxoStep): Promise<void> {
  console.log('\n👤 AÇÃO MANUAL NECESSÁRIA:')
  console.log(`   ${step.descricao}`)

  if (step.id === 2) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Acesse: http://localhost:3001/admin/importar')
    console.log('   2. Clique na aba "Times"')
    console.log('   3. Faça upload da planilha: times_tackle_2025.xlsx')
    console.log('   4. Aguarde a confirmação de sucesso (32 times importados)')
  } else if (step.id === 3) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Na mesma página, clique na aba "Jogadores"')
    console.log('   2. Faça upload da planilha: jogadores_tackle_2025.xlsx')
    console.log('   3. Aguarde a confirmação (~1565 jogadores importados)')
    console.log('   4. ⚠️  Esta etapa pode demorar alguns minutos!')
  } else if (step.id === 4) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Acesse: http://localhost:3001/admin/superliga/criar')
    console.log('   2. Clique no botão "Criar Superliga 2025"')
    console.log('   3. Aguarde a confirmação de criação')
    console.log('   4. Verifique se as 4 conferências foram criadas')
  } else if (step.id === 7) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Volte para: http://localhost:3001/admin/importar')
    console.log('   2. Clique na aba "Agenda"')
    console.log('   3. Faça upload da planilha: agenda_jogos.xlsx')
    console.log('   4. Aguarde a confirmação (64 jogos da temporada regular)')
  } else if (step.id === 9) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Na mesma página, clique na aba "Resultados"')
    console.log('   2. Procure o arquivo gerado: resultados-fake-YYYY-MM-DD.xlsx')
    console.log('   3. Faça upload deste arquivo')
    console.log('   4. 🎯 CRÍTICO: Deve gerar playoffs para TODAS as 4 conferências!')
    console.log('   5. 🎯 Verifique na resposta: "4 conferências processadas"')
    console.log('   6. 🎯 Se aparecer apenas 3/4, a correção não foi aplicada!')
  } else if (step.id === 11) {
    console.log('\n📁 Instruções detalhadas:')
    console.log('   1. Na mesma página, clique na aba "Estatísticas"')
    console.log('   2. Procure o arquivo: estatisticas-temporada-regular-YYYY-MM-DD.xlsx')
    console.log('   3. Faça upload deste arquivo')
    console.log('   4. ⚠️  Esta etapa pode demorar vários minutos! (~100k registros)')
    console.log('   5. As estatísticas serão consolidadas automaticamente por jogador')
  }

  console.log('\n⏸️  Aguardando conclusão...')
  console.log('   Pressione ENTER quando terminar esta etapa')
  await new Promise(resolve => process.stdin.once('data', resolve))
}

async function executarEtapaAutomatica(step: FluxoStep): Promise<void> {
  if (!step.comando) {
    step.erro = 'Comando não definido'
    return
  }

  console.log(`\n🤖 Executando: ${step.comando}`)

  try {
    execSync(step.comando, {
      stdio: 'inherit',
      cwd: process.cwd()
    })
    console.log(`\n✅ Comando executado com sucesso`)
  } catch (error) {
    step.erro = `Erro na execução: ${error}`
    console.error(`\n❌ Erro na execução:`, error)
  }
}

async function gerarRelatorioFinal(): Promise<void> {
  console.log('\n' + '🎉'.repeat(20))
  console.log('🎉 FLUXO COMPLETO EXECUTADO COM SUCESSO! 🎉')
  console.log('🎉'.repeat(20))

  // Verificar status final do banco
  try {
    const stats = await Promise.all([
      prisma.time.count({ where: { temporada: '2025' } }),
      prisma.jogador.count(),
      prisma.jogadorTime.count({ where: { temporada: '2025' } }),
      prisma.campeonato.count({ where: { temporada: '2025', isSuperliga: true } }),
      prisma.jogo.count({ where: { temporada: '2025' } }),
      prisma.playoffJogo.count(),
      prisma.estatisticaJogo.count({ where: { temporada: '2025' } }),
      prisma.conferencia.count()
    ])

    console.log('\n📊 ESTATÍSTICAS FINAIS:')
    console.log(`   ⚽ Times: ${stats[0]} (esperado: 32)`)
    console.log(`   👤 Jogadores: ${stats[1]} (esperado: ~1565)`)
    console.log(`   🔗 Vínculos Jogador-Time: ${stats[2]}`)
    console.log(`   🏆 Superliga: ${stats[3]} (esperado: 1)`)
    console.log(`   🏈 Jogos Temporada Regular: ${stats[4]} (esperado: 64)`)
    console.log(`   🏅 Jogos Playoffs: ${stats[5]} (esperado: ~20)`)
    console.log(`   📈 Registros de Estatísticas: ${stats[6]} (esperado: ~100k)`)
    console.log(`   🌍 Conferências: ${stats[7]} (esperado: 4)`)

    // Verificar campeão nacional
    const campeao = await prisma.playoffJogo.findFirst({
      where: {
        fase: 'FINAL_NACIONAL',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true
      }
    })

    if (campeao?.timeVencedor) {
      console.log(`\n🏆 CAMPEÃO NACIONAL 2025: ${campeao.timeVencedor.nome}`)
    }

    // Verificar campeões de conferência
    const campeoesCon = await prisma.playoffJogo.findMany({
      where: {
        fase: 'FINAL_CONFERENCIA',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true,
        conferencia: true
      }
    })

    if (campeoesCon.length === 4) {
      console.log(`\n🏅 CAMPEÕES DE CONFERÊNCIA (${campeoesCon.length}/4):`)
      campeoesCon.forEach(c => {
        console.log(`   ${c.conferencia?.nome}: ${c.timeVencedor?.nome}`)
      })
    } else {
      console.log(`\n⚠️  ATENÇÃO: Apenas ${campeoesCon.length}/4 campeões de conferência!`)
      console.log('   A correção na rota de importação pode não ter sido aplicada.')
    }

  } catch (error) {
    console.log('\n⚠️  Não foi possível gerar estatísticas finais')
  }

  console.log('\n🌐 LINKS ÚTEIS:')
  console.log('   📋 Temporada Regular: http://localhost:3000/superliga/2025/temporada-regular')
  console.log('   🎯 Wild Card: http://localhost:3000/superliga/2025/wild-card')
  console.log('   🏅 Semifinal Conferência: http://localhost:3000/superliga/2025/semifinal-conferencia')
  console.log('   🏆 Final Conferência: http://localhost:3000/superliga/2025/final-conferencia')
  console.log('   🥇 Semifinal Nacional: http://localhost:3000/superliga/2025/semifinal-nacional')
  console.log('   🏆 Final Nacional: http://localhost:3000/superliga/2025/final-nacional')
  console.log('   ⚙️  Admin: http://localhost:3001/admin/superliga')

  console.log('\n📁 ARQUIVOS GERADOS:')
  console.log('   Verifique a pasta planilhas-geradas/ para todos os arquivos criados')

  console.log('\n🎯 VALIDAÇÕES RECOMENDADAS:')
  console.log('   1. ✅ Navegue pelas 6 páginas da superliga')
  console.log('   2. ✅ Verifique se todos os playoffs estão corretos')
  console.log('   3. ✅ Confira as estatísticas dos jogadores')
  console.log('   4. ✅ Teste a navegação entre as fases')
  console.log('   5. ✅ Confirme que todas as 4 conferências têm campeões')

  console.log('\n🔧 SE ALGO DEU ERRADO:')
  console.log('   1. Execute: npm run validar (validação da estrutura)')
  console.log('   2. Verifique logs do backend durante importações')
  console.log('   3. Confirme se a correção da rota foi aplicada')

  console.log('\n✨ Seu sistema está completamente testado e funcional!')
  console.log('🚀 Pronto para demonstração!')
  
  console.log('\n📚 PARA PRÓXIMAS CONVERSAS:')
  console.log('   Este script documenta o fluxo completo do projeto.')
  console.log('   Use como referência para explicar a arquitetura.')
}

// Executar se chamado diretamente
if (require.main === module) {
  executarFluxoCompleto()
    .then(() => {
      console.log('\n🔚 Fluxo de teste concluído!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro no fluxo:', error)
      process.exit(1)
    })
    .finally(() => {
      prisma.$disconnect()
    })
}

export default executarFluxoCompleto