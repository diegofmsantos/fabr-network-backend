// scripts/fluxo-completo-teste.ts - VERSÃO ATUALIZADA COM SIMULAÇÃO COMPLETA
// Script master para executar todo o fluxo de teste da Superliga

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as fs from 'fs'

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
    nome: 'Simular Playoffs Completos',
    descricao: 'Simular TODOS os playoffs: Wild Cards, Semifinais de Conferência, Finais de Conferência, Semifinais Nacionais e Final Nacional - COROAR CAMPEÃO!',
    comando: 'npm run simulate:playoffs',
    manual: false,
    concluido: false
  }
]

// ==================== FUNÇÃO DE SIMULAÇÃO DE PLAYOFFS INTEGRADA ====================

interface JogoSimulacao {
  id: number
  timeClassificado1Id: number | null
  timeClassificado2Id: number | null
  fase: string
  nome: string
  conferenciaId?: number | null
}

// Função para gerar placar realista
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  const base1 = Math.floor(Math.random() * 35) + 7  // 7-41
  const base2 = Math.floor(Math.random() * 35) + 7  // 7-41
  
  // Garantir que não haja empate
  if (base1 === base2) {
    return { mandante: base1, visitante: base2 + 7 }
  }
  
  return { mandante: base1, visitante: base2 }
}

// Função para simular um jogo e retornar o vencedor
async function simularJogo(jogo: JogoSimulacao): Promise<number> {
  console.log(`🎮 Simulando: ${jogo.nome}`)
  
  if (!jogo.timeClassificado1Id || !jogo.timeClassificado2Id) {
    throw new Error(`Jogo ${jogo.id} não tem times definidos`)
  }

  const placar = gerarPlacarRealista()
  const vencedorId = placar.mandante > placar.visitante ? jogo.timeClassificado1Id : jogo.timeClassificado2Id

  // Atualizar o jogo no banco
  await prisma.playoffJogo.update({
    where: { id: jogo.id },
    data: {
      placarTime1: placar.mandante,
      placarTime2: placar.visitante,
      timeVencedorId: vencedorId,
      status: 'FINALIZADO'
    }
  })

  // Buscar nome do time vencedor para log
  const timeVencedor = await prisma.time.findUnique({
    where: { id: vencedorId },
    select: { nome: true, sigla: true }
  })

  console.log(`   📊 Resultado: ${placar.mandante} x ${placar.visitante}`)
  console.log(`   🏆 Vencedor: ${timeVencedor?.nome} (${timeVencedor?.sigla})`)

  return vencedorId
}

// Função para corrigir times nas semifinais baseado nos wild cards finalizados
async function corrigirTimesSemifinais(campeonatoId: number) {
  console.log('🔧 Corrigindo times nas semifinais baseado nos Wild Cards...')

  // Buscar vencedores dos Wild Cards finalizados
  const wildCardsFinalizados = await prisma.playoffJogo.findMany({
    where: {
      campeonatoId,
      fase: 'WILD CARD',
      status: 'FINALIZADO'
    },
    include: {
      timeVencedor: true,
      conferencia: true
    },
    orderBy: { id: 'asc' }
  })

  console.log(`   📊 Wild Cards finalizados: ${wildCardsFinalizados.length}`)

  // Buscar semifinais com times em falta
  const semifinaisPendentes = await prisma.playoffJogo.findMany({
    where: {
      campeonatoId,
      fase: 'SEMIFINAL CONFERENCIA',
      status: 'AGUARDANDO',
      timeClassificado2Id: null
    },
    include: { conferencia: true },
    orderBy: { id: 'asc' }
  })

  console.log(`   🏅 Semifinais para corrigir: ${semifinaisPendentes.length}`)

  // Corrigir cada semifinal
  for (const semifinal of semifinaisPendentes) {
    // Encontrar wild cards da mesma conferência
    const wildCardsDaConferencia = wildCardsFinalizados.filter(wc => 
      wc.conferenciaId === semifinal.conferenciaId
    )

    if (wildCardsDaConferencia.length > 0) {
      // Para conferências com múltiplos wild cards, usar o primeiro disponível
      const wildCardParaUsar = wildCardsDaConferencia.find(wc => {
        // Verificar se este vencedor já não foi usado em outra semifinal
        return wc.timeVencedorId
      })

      if (wildCardParaUsar?.timeVencedorId) {
        await prisma.playoffJogo.update({
          where: { id: semifinal.id },
          data: { timeClassificado2Id: wildCardParaUsar.timeVencedorId }
        })
        console.log(`   ✅ ${semifinal.nome}: ${wildCardParaUsar.timeVencedor?.nome}`)
      }
    }
  }
}

// Função para atualizar times nos jogos dependentes
async function atualizarJogosDependentes(vencedorId: number, fase: string, conferenciaId?: number | null) {
  if (fase === 'SEMIFINAL CONFERENCIA') {
    // Semifinal alimenta final da mesma conferência
    const finalParaAtualizar = await prisma.playoffJogo.findFirst({
      where: {
        conferenciaId,
        fase: 'FINAL CONFERENCIA'
      }
    })

    if (finalParaAtualizar) {
      if (!finalParaAtualizar.timeClassificado1Id) {
        await prisma.playoffJogo.update({
          where: { id: finalParaAtualizar.id },
          data: { timeClassificado1Id: vencedorId }
        })
      } else if (!finalParaAtualizar.timeClassificado2Id) {
        await prisma.playoffJogo.update({
          where: { id: finalParaAtualizar.id },
          data: { timeClassificado2Id: vencedorId }
        })
      }
      console.log(`   ➡️  Classificado para Final da Conferência`)
    }
  }
}

// Função para gerar semifinais nacionais
async function gerarSemifinaisNacionais(campeonatoId: number) {
  console.log('\n🏆 GERANDO SEMIFINAIS NACIONAIS...')

  // Buscar campeões de cada conferência
  const finalsConferencia = await prisma.playoffJogo.findMany({
    where: {
      campeonatoId,
      fase: 'FINAL CONFERENCIA',
      status: 'FINALIZADO'
    },
    include: {
      conferencia: true,
      timeVencedor: true
    }
  })

  if (finalsConferencia.length !== 4) {
    throw new Error(`Esperadas 4 finais de conferência finalizadas, encontradas ${finalsConferencia.length}`)
  }

  // Organizar por conferência
  const campeoes: { [key: string]: any } = {}
  finalsConferencia.forEach(final => {
    if (final.conferencia && final.timeVencedor) {
      campeoes[final.conferencia.tipo] = final.timeVencedor
    }
  })

  console.log('🏆 Campeões de Conferência:')
  Object.entries(campeoes).forEach(([conf, time]) => {
    console.log(`   ${conf}: ${time.nome}`)
  })

  // Criar Semifinal Nacional 1: Sudeste × Sul
  const semifinal1 = await prisma.playoffJogo.create({
    data: {
      campeonatoId,
      timeClassificado1Id: campeoes['SUDESTE']?.id,
      timeClassificado2Id: campeoes['SUL']?.id,
      fase: 'SEMIFINAL NACIONAL',
      rodada: 1,
      nome: 'Semifinal Nacional 1: Sudeste × Sul',
      dataJogo: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
      status: 'AGUARDANDO'
    }
  })

  // Criar Semifinal Nacional 2: Nordeste × Centro-Norte
  const semifinal2 = await prisma.playoffJogo.create({
    data: {
      campeonatoId,
      timeClassificado1Id: campeoes['NORDESTE']?.id,
      timeClassificado2Id: campeoes['CENTRO_NORTE']?.id,
      fase: 'SEMIFINAL NACIONAL',
      rodada: 2,
      nome: 'Semifinal Nacional 2: Nordeste × Centro-Norte',
      dataJogo: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
      status: 'AGUARDANDO'
    }
  })

  console.log('✅ Semifinais Nacionais criadas:')
  console.log(`   Semifinal 1: ${campeoes['SUDESTE']?.sigla} × ${campeoes['SUL']?.sigla}`)
  console.log(`   Semifinal 2: ${campeoes['NORDESTE']?.sigla} × ${campeoes['CENTRO_NORTE']?.sigla}`)

  return [semifinal1, semifinal2]
}

// Função para gerar final nacional
async function gerarFinalNacional(campeonatoId: number) {
  console.log('\n🥇 GERANDO FINAL NACIONAL...')

  // Buscar vencedores das semifinais nacionais
  const semifinaisNacionais = await prisma.playoffJogo.findMany({
    where: {
      campeonatoId,
      fase: 'SEMIFINAL NACIONAL',
      status: 'FINALIZADO'
    },
    include: {
      timeVencedor: true
    },
    orderBy: { rodada: 'asc' }
  })

  if (semifinaisNacionais.length !== 2) {
    throw new Error(`Esperadas 2 semifinais nacionais finalizadas, encontradas ${semifinaisNacionais.length}`)
  }

  const finalista1 = semifinaisNacionais[0].timeVencedor
  const finalista2 = semifinaisNacionais[1].timeVencedor

  if (!finalista1 || !finalista2) {
    throw new Error('Finalistas não encontrados')
  }

  // Criar Final Nacional
  const finalNacional = await prisma.playoffJogo.create({
    data: {
      campeonatoId,
      timeClassificado1Id: finalista1.id,
      timeClassificado2Id: finalista2.id,
      fase: 'FINAL NACIONAL',
      rodada: 1,
      nome: 'Final Nacional - Grande Decisão',
      dataJogo: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      status: 'AGUARDANDO'
    }
  })

  console.log('✅ Final Nacional criada:')
  console.log(`   ${finalista1.nome} × ${finalista2.nome}`)

  return finalNacional
}

// Função integrada para simular playoffs completos
async function simularPlayoffsCompletos(): Promise<void> {
  try {
    console.log('\n🚀 INICIANDO SIMULAÇÃO COMPLETA DOS PLAYOFFS')
    console.log('=' .repeat(60))

    // Buscar campeonato da Superliga 2025
    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      throw new Error('Superliga 2025 não encontrada')
    }

    console.log(`📋 Superliga encontrada: ${superliga.nome}`)

    // ===============================
    // FASE 1: CORRIGIR TIMES NAS SEMIFINAIS
    // ===============================
    console.log('\n🔧 FASE 0: CORRIGINDO CONEXÕES DOS WILD CARDS...')
    await corrigirTimesSemifinais(superliga.id)

    // ===============================
    // FASE 2: SIMULAR WILD CARDS (se houver pendentes)
    // ===============================
    console.log('\n🃏 FASE 1: SIMULANDO WILD CARDS RESTANTES...')
    
    const wildCards = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'WILD CARD',
        status: { not: 'FINALIZADO' }
      },
      orderBy: [{ conferenciaId: 'asc' }, { rodada: 'asc' }]
    })

    console.log(`📊 Wild Cards para simular: ${wildCards.length}`)

    for (const wildCard of wildCards) {
      const vencedorId = await simularJogo(wildCard)
      // Removido atualizarJogosDependentes para wild cards pois já foi corrigido acima
    }

    // ===============================
    // FASE 3: SIMULAR SEMIFINAIS DE CONFERÊNCIA
    // ===============================
    console.log('\n🏅 FASE 2: SIMULANDO SEMIFINAIS DE CONFERÊNCIA...')
    
    const semifinaisConferencia = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'SEMIFINAL CONFERENCIA',
        status: { not: 'FINALIZADO' },
        AND: [
          { timeClassificado1Id: { not: null } },
          { timeClassificado2Id: { not: null } }
        ]
      },
      orderBy: [{ conferenciaId: 'asc' }, { rodada: 'asc' }]
    })

    console.log(`📊 Semifinais para simular: ${semifinaisConferencia.length}`)

    for (const semifinal of semifinaisConferencia) {
      const vencedorId = await simularJogo(semifinal)
      await atualizarJogosDependentes(vencedorId, 'SEMIFINAL CONFERENCIA', semifinal.conferenciaId)
    }

    // ===============================
    // FASE 4: SIMULAR FINAIS DE CONFERÊNCIA
    // ===============================
    console.log('\n🏆 FASE 3: SIMULANDO FINAIS DE CONFERÊNCIA...')
    
    const finaisConferencia = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'FINAL CONFERENCIA',
        status: { not: 'FINALIZADO' },
        AND: [
          { timeClassificado1Id: { not: null } },
          { timeClassificado2Id: { not: null } }
        ]
      },
      orderBy: { conferenciaId: 'asc' }
    })

    console.log(`📊 Finais de conferência para simular: ${finaisConferencia.length}`)

    for (const final of finaisConferencia) {
      await simularJogo(final)
    }

    // ===============================
    // FASE 5: GERAR E SIMULAR SEMIFINAIS NACIONAIS
    // ===============================
    const semifinaisNacionais = await gerarSemifinaisNacionais(superliga.id)
    
    console.log('\n🥇 FASE 4: SIMULANDO SEMIFINAIS NACIONAIS...')
    for (const semifinal of semifinaisNacionais) {
      await simularJogo(semifinal)
    }

    // ===============================
    // FASE 6: GERAR E SIMULAR FINAL NACIONAL
    // ===============================
    const finalNacional = await gerarFinalNacional(superliga.id)
    
    console.log('\n👑 FASE 5: SIMULANDO FINAL NACIONAL...')
    const campeaoId = await simularJogo(finalNacional)

    // Buscar dados do campeão
    const campeao = await prisma.time.findUnique({
      where: { id: campeaoId },
      select: { nome: true, sigla: true, cidade: true }
    })

    console.log('\n' + '🏆'.repeat(20))
    console.log('🎉 SIMULAÇÃO COMPLETA FINALIZADA!')
    console.log('🏆'.repeat(20))
    console.log(`👑 CAMPEÃO NACIONAL 2025: ${campeao?.nome}`)
    console.log(`🏆 Sigla: ${campeao?.sigla}`)
    console.log(`🌎 Cidade: ${campeao?.cidade}`)
    console.log('🏆'.repeat(20))

  } catch (error) {
    console.error('❌ Erro na simulação de playoffs:', error)
    throw error
  }
}

// ==================== FUNÇÕES PRINCIPAIS DO FLUXO ====================

async function executarFluxoCompleto(): Promise<void> {
  console.log('🎯 FLUXO COMPLETO DE TESTE DA SUPERLIGA 2025\n')

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
    if (step.id === 12) {
      // Etapa 12: Executar simulação integrada de playoffs
      await simularPlayoffsCompletos()
    } else {
      // Outras etapas: executar comando externo
      execSync(step.comando, {
        stdio: 'inherit',
        cwd: process.cwd()
      })
    }
    console.log(`\n✅ Comando executado com sucesso`)
  } catch (error) {
    step.erro = `Erro na execução: ${error}`
    console.error(`\n❌ Erro na execução:`, error)
  }
}

async function gerarRelatorioFinal(): Promise<void> {
  console.log('\n' + '🎉'.repeat(20))
  console.log('🎉 FLUXO COMPLETO EXECUTADO COM SUCESSO!')
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
        fase: 'FINAL NACIONAL',
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
        fase: 'FINAL CONFERENCIA',
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
    }

  } catch (error) {
    console.log('\n⚠️  Não foi possível gerar estatísticas finais')
  }

  console.log('\n📁 ARQUIVOS GERADOS:')
  console.log('   Verifique a pasta planilhas-geradas/ para todos os arquivos criados')

  console.log('\n🌐 LINKS PARA VERIFICAÇÃO:')
  console.log('   📋 Temporada Regular: http://localhost:3000/superliga/2025/temporada-regular')
  console.log('   🃏 Wild Card: http://localhost:3000/superliga/2025/wild-card')
  console.log('   🏅 Semifinal Conferência: http://localhost:3000/superliga/2025/semifinal-conferencia')
  console.log('   🏆 Final Conferência: http://localhost:3000/superliga/2025/final-conferencia')
  console.log('   🥇 Semifinal Nacional: http://localhost:3000/superliga/2025/semifinal-nacional')
  console.log('   👑 Final Nacional: http://localhost:3000/superliga/2025/final-nacional')
  console.log('   ⚙️ Admin: http://localhost:3001/admin/superliga')
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