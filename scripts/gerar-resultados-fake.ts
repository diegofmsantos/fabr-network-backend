// scripts/gerar-resultados-fake.ts
// Script para gerar resultados fictícios para todos os jogos da temporada regular
// Executar: npx ts-node scripts/gerar-resultados-fake.ts

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogoFake {
  id_jogo: number
  time_mandante: string
  time_visitante: string
  placar_mandante: number
  placar_visitante: number
  estadio: string
  status: string
}

// Função para gerar placar realista de futebol americano
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  // Placares típicos do futebol americano (múltiplos de 3 e 7, mais alguns de 2)
  const pontosComuns = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42]

  const mandante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  const visitante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]

  // Garantir que nem todos os jogos sejam empates
  if (mandante === visitante && Math.random() < 0.8) {
    // 80% de chance de alterar um dos placares se for empate
    const incremento = Math.random() < 0.5 ? 3 : 7 // Field Goal ou Touchdown
    if (Math.random() < 0.5) {
      return { mandante: mandante + incremento, visitante }
    } else {
      return { mandante, visitante: visitante + incremento }
    }
  }

  return { mandante, visitante }
}

async function gerarResultadosFake(): Promise<void> {
  console.log('🎲 INICIANDO GERAÇÃO DE RESULTADOS FICTÍCIOS...\n')

  try {
    // 1. Buscar Superliga 2025
    const superliga = await prisma.campeonato.findFirst({
      where: {
        temporada: '2025',
        isSuperliga: true
      }
    })

    if (!superliga) {
      console.error('❌ Superliga 2025 não encontrada!')
      console.log('Execute primeiro: npm run create-superliga')
      return
    }

    console.log(`✅ Superliga encontrada: ${superliga.nome}`)

    // 2. Buscar todos os jogos da temporada regular
    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR'
      },
      include: {
        timeCasa: true,
        timeVisitante: true
      },
      orderBy: [
        { rodada: 'asc' },
        { dataJogo: 'asc' }
      ]
    })

    if (jogos.length === 0) {
      console.error('❌ Nenhum jogo encontrado na temporada regular!')
      console.log('Execute primeiro a importação da agenda de jogos.')
      return
    }

    console.log(`📋 Encontrados ${jogos.length} jogos na temporada regular`)

    // 3. Gerar resultados fictícios
    const resultadosFake: JogoFake[] = []
    let jogosComResultado = 0

    for (const jogo of jogos) {
      // Verificar se já tem resultado
      if (jogo.status === 'FINALIZADO' && jogo.placarCasa !== null && jogo.placarVisitante !== null) {
        console.log(`⏭️  Jogo ${jogo.id} já finalizado: ${jogo.timeCasa.sigla} ${jogo.placarCasa} x ${jogo.placarVisitante} ${jogo.timeVisitante.sigla}`)
        jogosComResultado++
        continue
      }

      // Gerar placar fictício
      const placar = gerarPlacarRealista()

      const resultadoFake: JogoFake = {
        id_jogo: jogo.id,
        time_mandante: jogo.timeCasa.nome,
        time_visitante: jogo.timeVisitante.nome,
        placar_mandante: placar.mandante,
        placar_visitante: placar.visitante,
        estadio: jogo.local || jogo.timeCasa.estadio || `Estádio ${jogo.timeCasa.cidade}`,
        status: 'FINALIZADO'
      }

      resultadosFake.push(resultadoFake)

      console.log(`🎯 Jogo ${jogo.id} (R${jogo.rodada}): ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
    }

    // 4. Estatísticas
    console.log('\n📊 ESTATÍSTICAS DOS RESULTADOS GERADOS:')
    console.log(`   📥 Total de jogos: ${jogos.length}`)
    console.log(`   ✅ Já finalizados: ${jogosComResultado}`)
    console.log(`   🎲 Novos resultados: ${resultadosFake.length}`)

    if (resultadosFake.length === 0) {
      console.log('\n🎉 Todos os jogos já possuem resultados!')
      return
    }

    // 5. Gerar planilha Excel
    const outputDir = path.join(process.cwd(), 'planilhas-geradas')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputFile = path.join(outputDir, `resultados-fake-${new Date().toISOString().split('T')[0]}.xlsx`)

    // Criar workbook
    const workbook = XLSX.utils.book_new()

    // Criar worksheet com os dados
    const worksheet = XLSX.utils.json_to_sheet(resultadosFake)

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS_FAKE')

    // Salvar arquivo
    XLSX.writeFile(workbook, outputFile)

    console.log(`\n💾 Planilha gerada: ${outputFile}`)

    // 6. Analisar distribuição de placares
    const placaresMandante = resultadosFake.map(r => r.placar_mandante)
    const placaresVisitante = resultadosFake.map(r => r.placar_visitante)

    const vitoriasMandante = resultadosFake.filter(r => r.placar_mandante > r.placar_visitante).length
    const vitoriasVisitante = resultadosFake.filter(r => r.placar_visitante > r.placar_mandante).length
    const empates = resultadosFake.filter(r => r.placar_mandante === r.placar_visitante).length

    console.log('\n📈 ANÁLISE DOS RESULTADOS:')
    console.log(`   🏠 Vitórias mandante: ${vitoriasMandante} (${(vitoriasMandante / resultadosFake.length * 100).toFixed(1)}%)`)
    console.log(`   ✈️  Vitórias visitante: ${vitoriasVisitante} (${(vitoriasVisitante / resultadosFake.length * 100).toFixed(1)}%)`)
    console.log(`   🤝 Empates: ${empates} (${(empates / resultadosFake.length * 100).toFixed(1)}%)`)

    const mediaMandante = placaresMandante.reduce((a, b) => a + b, 0) / placaresMandante.length
    const mediaVisitante = placaresVisitante.reduce((a, b) => a + b, 0) / placaresVisitante.length

    console.log(`   📊 Média mandante: ${mediaMandante.toFixed(1)} pontos`)
    console.log(`   📊 Média visitante: ${mediaVisitante.toFixed(1)} pontos`)

    // 7. Instruções para uso
    console.log('\n🚀 PRÓXIMOS PASSOS:')
    console.log('1. Acesse o painel admin: http://localhost:3001/admin/importar')
    console.log('2. Vá para a aba "Importar Resultados"')
    console.log(`3. Faça upload do arquivo: ${path.basename(outputFile)}`)
    console.log('4. Aguarde a importação e verifique se os playoffs são gerados automaticamente')

    console.log('\n⚠️  IMPORTANTE:')
    console.log('   - Estes são resultados FICTÍCIOS para teste')
    console.log('   - Use apenas para validar o funcionamento do sistema')
    console.log('   - Para resultados reais, importe a planilha oficial')

  } catch (error) {
    console.error('❌ Erro ao gerar resultados fictícios:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Função para aplicar resultados direto no banco (opcional)
async function aplicarResultadosNoBanco(): Promise<void> {
  console.log('\n🔄 APLICANDO RESULTADOS DIRETAMENTE NO BANCO...')

  try {
    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      console.error('❌ Superliga não encontrada!')
      return
    }

    const jogos = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR',
        status: { not: 'FINALIZADO' }
      }
    })

    let atualizados = 0

    for (const jogo of jogos) {
      const placar = gerarPlacarRealista()

      await prisma.jogo.update({
        where: { id: jogo.id },
        data: {
          placarCasa: placar.mandante,
          placarVisitante: placar.visitante,
          status: 'FINALIZADO'
        }
      })

      atualizados++
      console.log(`✅ Jogo ${jogo.id} atualizado`)
    }

    console.log(`\n🎉 ${atualizados} jogos atualizados no banco de dados!`)

  } catch (error) {
    console.error('❌ Erro ao aplicar resultados no banco:', error)
    throw error
  }
}

// ADICIONAR estas funções no arquivo scripts/gerar-resultados-fake.ts

// ✅ NOVA FUNÇÃO: Aplicar resultados e simular todas as fases
async function aplicarResultadosCompletoNoBanco(): Promise<void> {
  console.log('\n🏆 APLICANDO RESULTADOS COMPLETOS - TEMPORADA + PLAYOFFS + FASE NACIONAL')

  try {
    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      console.error('❌ Superliga não encontrada!')
      return
    }

    // ETAPA 1: Finalizar todos os jogos da temporada regular
    console.log('\n⚽ ETAPA 1: Finalizando temporada regular...')
    const jogosTemporada = await prisma.jogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'TEMPORADA_REGULAR',
        status: { not: 'FINALIZADO' }
      }
    })

    for (const jogo of jogosTemporada) {
      const placar = gerarPlacarRealista()
      await prisma.jogo.update({
        where: { id: jogo.id },
        data: {
          placarCasa: placar.mandante,
          placarVisitante: placar.visitante,
          status: 'FINALIZADO'
        }
      })
    }
    console.log(`✅ ${jogosTemporada.length} jogos da temporada regular finalizados`)

    // ETAPA 2: Gerar playoffs se não existirem
    let playoffsExistentes = await prisma.playoffJogo.count({
      where: { campeonatoId: superliga.id }
    })

    if (playoffsExistentes === 0) {
      console.log('\n🏅 ETAPA 2: Gerando playoffs das conferências...')
      await gerarTodosPlayoffs(superliga.id)

      playoffsExistentes = await prisma.playoffJogo.count({
        where: { campeonatoId: superliga.id }
      })
      console.log(`✅ ${playoffsExistentes} jogos de playoff gerados`)
    } else {
      console.log(`⏭️ Playoffs já existem (${playoffsExistentes} jogos)`)
    }

    // ETAPA 3: Simular resultados dos playoffs de conferência
    console.log('\n🏆 ETAPA 3: Simulando playoffs de conferência...')

    // Wild Cards
    const wildCards = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'WILD_CARD',
        status: 'AGUARDANDO'
      }
    })

    for (const jogo of wildCards) {
      const placar = gerarPlacarRealista()
      const vencedor = placar.mandante > placar.visitante
        ? jogo.timeClassificado1Id
        : jogo.timeClassificado2Id

      await prisma.playoffJogo.update({
        where: { id: jogo.id },
        data: {
          placarTime1: placar.mandante,
          placarTime2: placar.visitante,
          timeVencedorId: vencedor,
          status: 'FINALIZADO'
        }
      })
    }
    console.log(`✅ ${wildCards.length} wild cards simulados`)

    // Aguardar um pouco para que os vencedores sejam processados
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Semifinais de Conferência
    const semifinais = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'SEMIFINAL_CONFERENCIA',
        status: 'AGUARDANDO'
      }
    })

    for (const jogo of semifinais) {
      // Verificar se tem times classificados ou vem de wild card
      let time1 = jogo.timeClassificado1Id
      let time2 = jogo.timeClassificado2Id

      // Se vem de wild card, buscar vencedor
      if (jogo.jogoAnterior1Id && !time1) {
        const jogoAnterior1 = await prisma.playoffJogo.findUnique({
          where: { id: jogo.jogoAnterior1Id }
        })
        time1 = jogoAnterior1?.timeVencedorId || null
      }

      if (jogo.jogoAnterior2Id && !time2) {
        const jogoAnterior2 = await prisma.playoffJogo.findUnique({
          where: { id: jogo.jogoAnterior2Id }
        })
        time2 = jogoAnterior2?.timeVencedorId|| null
      }

      if (time1 && time2) {
        const placar = gerarPlacarRealista()
        const vencedor = placar.mandante > placar.visitante ? time1 : time2

        await prisma.playoffJogo.update({
          where: { id: jogo.id },
          data: {
            timeClassificado1Id: time1,
            timeClassificado2Id: time2,
            placarTime1: placar.mandante,
            placarTime2: placar.visitante,
            timeVencedorId: vencedor,
            status: 'FINALIZADO'
          }
        })
      }
    }
    console.log(`✅ ${semifinais.length} semifinais de conferência simuladas`)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Finais de Conferência
    const finais = await prisma.playoffJogo.findMany({
      where: {
        campeonatoId: superliga.id,
        fase: 'FINAL_CONFERENCIA',
        status: 'AGUARDANDO'
      }
    })

    for (const jogo of finais) {
      // Buscar vencedores das semifinais
      let time1 = jogo.timeClassificado1Id
      let time2 = jogo.timeClassificado2Id

      if (jogo.jogoAnterior1Id && !time1) {
        const sf1 = await prisma.playoffJogo.findUnique({
          where: { id: jogo.jogoAnterior1Id }
        })
        time1 = sf1?.timeVencedorId|| null
      }

      if (jogo.jogoAnterior2Id && !time2) {
        const sf2 = await prisma.playoffJogo.findUnique({
          where: { id: jogo.jogoAnterior2Id }
        })
        time2 = sf2?.timeVencedorId|| null
      }

      if (time1 && time2) {
        const placar = gerarPlacarRealista()
        const vencedor = placar.mandante > placar.visitante ? time1 : time2

        await prisma.playoffJogo.update({
          where: { id: jogo.id },
          data: {
            timeClassificado1Id: time1,
            timeClassificado2Id: time2,
            placarTime1: placar.mandante,
            placarTime2: placar.visitante,
            timeVencedorId: vencedor,
            status: 'FINALIZADO'
          }
        })
      }
    }
    console.log(`✅ ${finais.length} finais de conferência simuladas`)

    // ETAPA 4: Gerar e simular fase nacional
    console.log('\n🥇 ETAPA 4: Gerando e simulando fase nacional...')

    // Verificar se fase nacional já existe
    const faseNacionalExistente = await prisma.playoffJogo.count({
      where: {
        campeonatoId: superliga.id,
        fase: { in: ['SEMIFINAL_NACIONAL', 'FINAL_NACIONAL'] }
      }
    })

    if (faseNacionalExistente === 0) {
      // Criar fase nacional
      const campeoes = await prisma.playoffJogo.findMany({
        where: {
          campeonatoId: superliga.id,
          fase: 'FINAL_CONFERENCIA',
          status: 'FINALIZADO'
        },
        include: { conferencia: true }
      })

      if (campeoes.length === 4) {
        const sudeste = campeoes.find(c => c.conferencia?.tipo === 'SUDESTE')
        const sul = campeoes.find(c => c.conferencia?.tipo === 'SUL')
        const nordeste = campeoes.find(c => c.conferencia?.tipo === 'NORDESTE')
        const centroNorte = campeoes.find(c => c.conferencia?.tipo === 'CENTRO_NORTE')

        // Semifinal Nacional 1: Sudeste vs Nordeste
        const sf1 = await prisma.playoffJogo.create({
          data: {
            campeonatoId: superliga.id,
            fase: 'SEMIFINAL_NACIONAL',
            rodada: 1,
            nome: 'Semifinal Nacional 1',
            timeClassificado1Id: sudeste?.timeVencedorId,
            timeClassificado2Id: nordeste?.timeVencedorId,
            dataJogo: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
          }
        })

        // Semifinal Nacional 2: Sul vs Centro-Norte
        const sf2 = await prisma.playoffJogo.create({
          data: {
            campeonatoId: superliga.id,
            fase: 'SEMIFINAL_NACIONAL',
            rodada: 1,
            nome: 'Semifinal Nacional 2',
            timeClassificado1Id: sul?.timeVencedorId,
            timeClassificado2Id: centroNorte?.timeVencedorId,
            dataJogo: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
          }
        })

        // Simular semifinais nacionais
        for (const sf of [sf1, sf2]) {
          const placar = gerarPlacarRealista()
          const vencedor = placar.mandante > placar.visitante
            ? sf.timeClassificado1Id
            : sf.timeClassificado2Id

          await prisma.playoffJogo.update({
            where: { id: sf.id },
            data: {
              placarTime1: placar.mandante,
              placarTime2: placar.visitante,
              timeVencedorId: vencedor,
              status: 'FINALIZADO'
            }
          })
        }

        // Final Nacional
        const finalNacional = await prisma.playoffJogo.create({
          data: {
            campeonatoId: superliga.id,
            fase: 'FINAL_NACIONAL',
            rodada: 1,
            nome: 'Final Nacional - Brasil Bowl',
            timeClassificado1Id: sf1.timeClassificado1Id, // Será atualizado
            timeClassificado2Id: sf2.timeClassificado1Id, // Será atualizado
            jogoAnterior1Id: sf1.id,
            jogoAnterior2Id: sf2.id,
            dataJogo: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
            status: 'AGUARDANDO'
          }
        })

        // Buscar vencedores das semifinais e simular final
        const sf1Final = await prisma.playoffJogo.findUnique({ where: { id: sf1.id } })
        const sf2Final = await prisma.playoffJogo.findUnique({ where: { id: sf2.id } })

        const placarFinal = gerarPlacarRealista()
        const campeaoNacional = placarFinal.mandante > placarFinal.visitante
          ? sf1Final?.timeVencedorId
          : sf2Final?.timeVencedorId

        await prisma.playoffJogo.update({
          where: { id: finalNacional.id },
          data: {
            timeClassificado1Id: sf1Final?.timeVencedorId,
            timeClassificado2Id: sf2Final?.timeVencedorId,
            placarTime1: placarFinal.mandante,
            placarTime2: placarFinal.visitante,
            timeVencedorId: campeaoNacional,
            status: 'FINALIZADO'
          }
        })

        console.log('✅ Fase nacional gerada e simulada')

        // Buscar nome do campeão
        const campeao = await prisma.time.findUnique({
          where: { id: campeaoNacional! }
        })

        console.log(`🏆 CAMPEÃO NACIONAL 2025: ${campeao?.nome}`)
      }
    }

    // ESTATÍSTICAS FINAIS
    const stats = await Promise.all([
      prisma.jogo.count({ where: { campeonatoId: superliga.id, status: 'FINALIZADO' } }),
      prisma.playoffJogo.count({ where: { campeonatoId: superliga.id, status: 'FINALIZADO' } })
    ])

    console.log('\n📊 SIMULAÇÃO COMPLETA:')
    console.log(`   ⚽ Jogos Temporada Regular: ${stats[0]}`)
    console.log(`   🏆 Jogos de Playoff: ${stats[1]}`)
    console.log(`   🎯 Total de Jogos: ${stats[0] + stats[1]}`)
    console.log('\n🎉 TEMPORADA COMPLETA SIMULADA COM SUCESSO!')

  } catch (error) {
    console.error('❌ Erro durante simulação completa:', error)
    throw error
  }
}

// ✅ ADICIONAR função para gerar todos os playoffs (se não existir)
async function gerarTodosPlayoffs(campeonatoId: number) {
  // Importar funções de playoff
  const {
    gerarPlayoffsSudeste,
    gerarPlayoffsSul,
    gerarPlayoffsNordeste,
    gerarPlayoffsCentroNorte
  } = await import('../src/utils/superligaUtils')

  const conferencias = await prisma.conferencia.findMany({
    where: { campeonatoId },
    include: { regionais: true }
  })

  for (const conf of conferencias) {
    try {
      switch (conf.tipo) {
        case 'SUDESTE':
          await gerarPlayoffsSudeste(campeonatoId, conf.id)
          break
        case 'SUL':
          await gerarPlayoffsSul(campeonatoId, conf.id)
          break
        case 'NORDESTE':
          await gerarPlayoffsNordeste(campeonatoId, conf.id)
          break
        case 'CENTRO_NORTE':
          await gerarPlayoffsCentroNorte(campeonatoId, conf.id)
          break
      }
    } catch (error) {
      console.error(`Erro ao gerar playoffs ${conf.nome}:`, error)
    }
  }
}

// ✅ ATUALIZAR a função main para incluir opção completa
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--complete') || args.includes('-c')) {
    await aplicarResultadosCompletoNoBanco()
  } else if (args.includes('--apply-direct') || args.includes('-d')) {
    await aplicarResultadosNoBanco()
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('📖 USO DO SCRIPT:')
    console.log('')
    console.log('  npm run generate:resultados           # Gerar planilha Excel (só temporada regular)')
    console.log('  npm run generate:resultados -d       # Aplicar direto no banco (só temporada regular)')
    console.log('  npm run generate:resultados -c       # SIMULAR TEMPORADA COMPLETA (temporada + playoffs + final)')
    console.log('  npm run generate:resultados --help   # Mostrar esta ajuda')
    console.log('')
    console.log('🔍 O que cada comando faz:')
    console.log('  Planilha: Gera arquivo Excel para importar via interface')
    console.log('  Direto: Aplica resultados diretamente no banco (mais rápido)')
    console.log('  Completo: Simula TODA a temporada até a final nacional')
  } else {
    await gerarResultadosFake()
  }
}



// Executar se chamado diretamente
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n🔚 Script concluído.')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro durante execução:', error)
      process.exit(1)
    })
}

export default gerarResultadosFake