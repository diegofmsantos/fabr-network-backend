// scripts/simular-fase-nacional.ts
// Script específico para simular Semifinal Nacional e Final Nacional

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function simularFaseNacional(): Promise<void> {
  console.log('🏆 SIMULANDO FASE NACIONAL (SEMIFINAL + FINAL)\n')
  
  try {
    // 1. Verificar se existem finais de conferência finalizadas
    const finaisConferencia = await prisma.playoffJogo.findMany({
      where: {
        fase: 'FINAL_CONFERENCIA',
        status: 'FINALIZADO'
      },
      include: {
        timeVencedor: true,
        conferencia: true
      }
    })

    if (finaisConferencia.length < 4) {
      console.error(`❌ Apenas ${finaisConferencia.length}/4 finais de conferência finalizadas!`)
      console.log('Execute primeiro o script de playoffs das conferências.')
      return
    }

    console.log('✅ Todas as 4 finais de conferência foram finalizadas')
    
    // 2. Identificar campeões por conferência
    const campeoes = {
      sul: finaisConferencia.find(f => f.conferencia?.tipo === 'SUL')?.timeVencedor,
      sudeste: finaisConferencia.find(f => f.conferencia?.tipo === 'SUDESTE')?.timeVencedor,
      nordeste: finaisConferencia.find(f => f.conferencia?.tipo === 'NORDESTE')?.timeVencedor,
      centroNorte: finaisConferencia.find(f => f.conferencia?.tipo === 'CENTRO_NORTE')?.timeVencedor
    }

    console.log('🏅 CAMPEÕES DE CONFERÊNCIA:')
    console.log(`   Sul: ${campeoes.sul?.nome}`)
    console.log(`   Sudeste: ${campeoes.sudeste?.nome}`)
    console.log(`   Nordeste: ${campeoes.nordeste?.nome}`)
    console.log(`   Centro-Norte: ${campeoes.centroNorte?.nome}`)

    if (!campeoes.sul || !campeoes.sudeste || !campeoes.nordeste || !campeoes.centroNorte) {
      console.error('❌ Nem todos os campeões foram identificados!')
      return
    }

    // 3. Buscar ou criar semifinais nacionais
    let semifinal1 = await prisma.playoffJogo.findFirst({
      where: {
        fase: 'SEMIFINAL_NACIONAL',
        nome: 'Semifinal Nacional 1'
      }
    })

    let semifinal2 = await prisma.playoffJogo.findFirst({
      where: {
        fase: 'SEMIFINAL_NACIONAL', 
        nome: 'Semifinal Nacional 2'
      }
    })

    // Se não existem, criar
    if (!semifinal1) {
      semifinal1 = await prisma.playoffJogo.create({
        data: {
          campeonatoId: finaisConferencia[0].campeonatoId,
          fase: 'SEMIFINAL_NACIONAL',
          rodada: 1,
          nome: 'Semifinal Nacional 1',
          timeClassificado1Id: campeoes.sul.id,
          timeClassificado2Id: campeoes.sudeste.id,
          dataJogo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'AGUARDANDO'
        }
      })
    } else {
      // Atualizar com times corretos
      await prisma.playoffJogo.update({
        where: { id: semifinal1.id },
        data: {
          timeClassificado1Id: campeoes.sul.id,
          timeClassificado2Id: campeoes.sudeste.id,
          status: 'AGUARDANDO'
        }
      })
    }

    if (!semifinal2) {
      semifinal2 = await prisma.playoffJogo.create({
        data: {
          campeonatoId: finaisConferencia[0].campeonatoId,
          fase: 'SEMIFINAL_NACIONAL',
          rodada: 1,
          nome: 'Semifinal Nacional 2', 
          timeClassificado1Id: campeoes.nordeste.id,
          timeClassificado2Id: campeoes.centroNorte.id,
          dataJogo: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
          status: 'AGUARDANDO'
        }
      })
    } else {
      // Atualizar com times corretos
      await prisma.playoffJogo.update({
        where: { id: semifinal2.id },
        data: {
          timeClassificado1Id: campeoes.nordeste.id,
          timeClassificado2Id: campeoes.centroNorte.id,
          status: 'AGUARDANDO'
        }
      })
    }

    // 4. Simular resultados das semifinais
    console.log('\n🏈 SIMULANDO SEMIFINAIS NACIONAIS...')

    // Gerar placares realistas
    const placarSemi1 = gerarPlacarRealista()
    const placarSemi2 = gerarPlacarRealista()

    const vencedorSemi1 = placarSemi1.placar1 > placarSemi1.placar2 ? campeoes.sul : campeoes.sudeste
    const vencedorSemi2 = placarSemi2.placar1 > placarSemi2.placar2 ? campeoes.nordeste : campeoes.centroNorte

    // Atualizar semifinal 1
    await prisma.playoffJogo.update({
      where: { id: semifinal1.id },
      data: {
        placarTime1: placarSemi1.placar1,
        placarTime2: placarSemi1.placar2,
        timeVencedorId: vencedorSemi1.id,
        status: 'FINALIZADO'
      }
    })

    // Atualizar semifinal 2
    await prisma.playoffJogo.update({
      where: { id: semifinal2.id },
      data: {
        placarTime1: placarSemi2.placar1,
        placarTime2: placarSemi2.placar2,
        timeVencedorId: vencedorSemi2.id,
        status: 'FINALIZADO'
      }
    })

    console.log(`   ✅ Semifinal 1: ${campeoes.sul.nome} ${placarSemi1.placar1} x ${placarSemi1.placar2} ${campeoes.sudeste.nome} → ${vencedorSemi1.nome}`)
    console.log(`   ✅ Semifinal 2: ${campeoes.nordeste.nome} ${placarSemi2.placar1} x ${placarSemi2.placar2} ${campeoes.centroNorte.nome} → ${vencedorSemi2.nome}`)

    // 5. Buscar ou criar final nacional
    let finalNacional = await prisma.playoffJogo.findFirst({
      where: {
        fase: 'FINAL_NACIONAL',
        nome: 'Grande Decisão Nacional'
      }
    })

    if (!finalNacional) {
      finalNacional = await prisma.playoffJogo.create({
        data: {
          campeonatoId: finaisConferencia[0].campeonatoId,
          fase: 'FINAL_NACIONAL',
          rodada: 1,
          nome: 'Grande Decisão Nacional',
          jogoAnterior1Id: semifinal1.id,
          jogoAnterior2Id: semifinal2.id,
          dataJogo: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          status: 'AGUARDANDO'
        }
      })
    } else {
      // Atualizar com dependências corretas
      await prisma.playoffJogo.update({
        where: { id: finalNacional.id },
        data: {
          timeClassificado1Id: vencedorSemi1.id,
          timeClassificado2Id: vencedorSemi2.id,
          jogoAnterior1Id: semifinal1.id,
          jogoAnterior2Id: semifinal2.id,
          status: 'AGUARDANDO'
        }
      })
    }

    // 6. Simular final nacional
    console.log('\n🏆 SIMULANDO FINAL NACIONAL...')

    const placarFinal = gerarPlacarRealista()
    const campeaoNacional = placarFinal.placar1 > placarFinal.placar2 ? vencedorSemi1 : vencedorSemi2

    await prisma.playoffJogo.update({
      where: { id: finalNacional.id },
      data: {
        placarTime1: placarFinal.placar1,
        placarTime2: placarFinal.placar2,
        timeVencedorId: campeaoNacional.id,
        status: 'FINALIZADO'
      }
    })

    console.log(`   🏆 FINAL: ${vencedorSemi1.nome} ${placarFinal.placar1} x ${placarFinal.placar2} ${vencedorSemi2.nome}`)
    console.log(`   🎉 CAMPEÃO NACIONAL 2025: ${campeaoNacional.nome}`)

    // 7. Atualizar status da superliga para FINALIZADO
    await prisma.campeonato.updateMany({
      where: {
        temporada: '2025',
        isSuperliga: true
      },
      data: {
        status: 'FINALIZADO'
      }
    })

    console.log('\n✅ FASE NACIONAL SIMULADA COM SUCESSO!')
    console.log(`🏆 Campeão Nacional: ${campeaoNacional.nome}`)
    console.log(`📍 Status da Superliga: FINALIZADO`)

  } catch (error) {
    console.error('❌ Erro ao simular fase nacional:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Função para gerar placar realista
function gerarPlacarRealista(): { placar1: number, placar2: number } {
  const pontuacoesPossiveis = [14, 17, 21, 24, 28, 31, 35, 38] // Playoffs tendem a ter mais pontos
  
  let placar1 = pontuacoesPossiveis[Math.floor(Math.random() * pontuacoesPossiveis.length)]
  let placar2 = pontuacoesPossiveis[Math.floor(Math.random() * pontuacoesPossiveis.length)]
  
  // Evitar empates
  while (placar1 === placar2) {
    placar2 = pontuacoesPossiveis[Math.floor(Math.random() * pontuacoesPossiveis.length)]
  }
  
  // Jogos equilibrados na fase nacional
  if (Math.abs(placar1 - placar2) > 10) {
    const menor = Math.min(placar1, placar2)
    const diferenca = Math.floor(Math.random() * 7) + 3 // Diferença de 3-10 pontos
    
    if (placar1 > placar2) {
      placar1 = menor + diferenca
      placar2 = menor
    } else {
      placar1 = menor
      placar2 = menor + diferenca
    }
  }
  
  return { placar1, placar2 }
}

// Executar se chamado diretamente
if (require.main === module) {
  simularFaseNacional()
    .then(() => {
      console.log('\n🎉 Simulação da fase nacional concluída!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro na simulação:', error)
      process.exit(1)
    })
}

export default simularFaseNacional