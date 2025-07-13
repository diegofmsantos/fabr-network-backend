// scripts/gerar-resultados-playoffs-corrigido.ts
// Script CORRIGIDO para gerar planilhas de playoffs incluindo jogos TBD

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

interface JogoResultado {
  id_jogo: number
  time_mandante: string
  time_visitante: string
  placar_mandante: number
  placar_visitante: number
  data_jogo: string
  rodada: number
  fase: string
  conferencia: string
  estadio: string
  status: string
}

// ✅ GERAR PLACAR REALISTA
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  const pontosComuns = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42]
  
  const mandante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  let visitante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  
  // Evitar empates
  if (mandante === visitante && Math.random() < 0.9) {
    const incrementos = [3, 7, 6]
    const incremento = incrementos[Math.floor(Math.random() * incrementos.length)]
    
    if (Math.random() < 0.5) {
      return { mandante: mandante + incremento, visitante }
    } else {
      return { mandante, visitante: visitante + incremento }
    }
  }
  
  return { mandante, visitante }
}

// ✅ MAPEAR FASE PARA FIM DE SEMANA
function determinarFimDeSemana(fase: string): number {
  switch (fase) {
    case 'WILD CARD': return 13
    case 'SEMIFINAL CONFERENCIA': return 14  
    case 'FINAL CONFERENCIA': return 15
    case 'SEMIFINAL NACIONAL': return 16
    case 'FINAL NACIONAL': return 17
    default: return 17
  }
}

// ✅ BUSCAR TODOS OS JOGOS DE PLAYOFF (incluindo TBD)
async function buscarJogosPlayoffs(): Promise<Map<number, any[]>> {
  try {
    console.log('🔍 Buscando TODOS os jogos de playoff (incluindo TBD)...')

    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      throw new Error('Superliga 2025 não encontrada')
    }

    // ✅ BUSCAR TODOS OS JOGOS DE PLAYOFF (mesmo com times TBD)
    const jogos = await prisma.playoffJogo.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        timeClassificado1: true,
        timeClassificado2: true,
        conferencia: true
      },
      orderBy: [{ fase: 'asc' }, { dataJogo: 'asc' }]
    })

    console.log(`✅ Total de jogos de playoff encontrados: ${jogos.length}`)

    // ✅ PROCESSAR TODOS OS JOGOS (mesmo TBD)
    const jogosFormatados = jogos.map((jogo, index) => ({
      id: jogo.id,
      dataJogo: jogo.dataJogo || new Date(Date.now() + (determinarFimDeSemana(jogo.fase) - 13) * 7 * 24 * 60 * 60 * 1000),
      rodada: jogo.rodada || 1,
      fase: jogo.fase,
      timeCasa: {
        nome: jogo.timeClassificado1?.nome || `TBD Time 1 - Jogo ${jogo.id}`,
        sigla: jogo.timeClassificado1?.sigla || 'TBD1',
        cidade: jogo.timeClassificado1?.cidade || 'São Paulo',
        estadio: jogo.timeClassificado1?.cidade ? `Estádio ${jogo.timeClassificado1.cidade}` : 'Estádio TBD'
      },
      timeVisitante: {
        nome: jogo.timeClassificado2?.nome || `TBD Time 2 - Jogo ${jogo.id}`,
        sigla: jogo.timeClassificado2?.sigla || 'TBD2'
      },
      conferencia: jogo.conferencia?.nome || 'Nacional',
      local: jogo.timeClassificado1?.cidade ? `Estádio ${jogo.timeClassificado1.cidade}` : 'Estádio TBD',
      isDefinido: !!(jogo.timeClassificado1Id && jogo.timeClassificado2Id)
    }))

    // ✅ AGRUPAR POR FIM DE SEMANA
    const jogosPorFimDeSemana = new Map<number, any[]>()

    jogosFormatados.forEach(jogo => {
      const fimDeSemana = determinarFimDeSemana(jogo.fase)
      
      if (!jogosPorFimDeSemana.has(fimDeSemana)) {
        jogosPorFimDeSemana.set(fimDeSemana, [])
      }
      
      jogosPorFimDeSemana.get(fimDeSemana)!.push(jogo)
    })

    // ✅ LOG DA DISTRIBUIÇÃO
    console.log('\n📊 DISTRIBUIÇÃO DOS PLAYOFFS:')
    jogosPorFimDeSemana.forEach((jogos, fimDeSemana) => {
      const definidos = jogos.filter(j => j.isDefinido).length
      const tbd = jogos.filter(j => !j.isDefinido).length
      const fasesDosJogos = [...new Set(jogos.map(j => j.fase))]
      console.log(`   Fim de Semana ${fimDeSemana}: ${jogos.length} jogos (${definidos} definidos, ${tbd} TBD) - ${fasesDosJogos.join(', ')}`)
    })

    return jogosPorFimDeSemana

  } catch (error) {
    console.error('❌ Erro ao buscar jogos de playoff:', error)
    throw error
  }
}

// ✅ GERAR RESULTADOS PARA UM FIM DE SEMANA
async function gerarResultadosFimDeSemana(fimDeSemana: number, jogos: any[]): Promise<JogoResultado[]> {
  console.log(`🎲 Gerando resultados para Fim de Semana ${fimDeSemana} (${jogos.length} jogos)...`)
  
  const resultados: JogoResultado[] = []

  for (const jogo of jogos) {
    const placar = gerarPlacarRealista()
    
    const resultado: JogoResultado = {
      id_jogo: jogo.id,
      time_mandante: jogo.timeCasa.nome,
      time_visitante: jogo.timeVisitante.nome,
      placar_mandante: placar.mandante,
      placar_visitante: placar.visitante,
      data_jogo: new Date(jogo.dataJogo).toISOString().split('T')[0],
      rodada: jogo.rodada || 1,
      fase: jogo.fase,
      conferencia: jogo.conferencia,
      estadio: jogo.local,
      status: jogo.isDefinido ? 'FINALIZADO' : 'TBD'
    }

    resultados.push(resultado)
    
    const status = jogo.isDefinido ? '✅' : '⏳'
    console.log(`   ${status} ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
  }

  return resultados
}

// ✅ CRIAR PLANILHA DE RESULTADOS
async function criarPlanilhaResultados(fimDeSemana: number, resultados: JogoResultado[]): Promise<string> {
  if (resultados.length === 0) {
    console.log(`⏭️  Pulando Fim de Semana ${fimDeSemana} - sem jogos`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  const worksheet = XLSX.utils.json_to_sheet(resultados)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS')
  
  const dataJogo = resultados[0]?.data_jogo || 'N/A'
  const fases = [...new Set(resultados.map(r => r.fase))].join(', ')
  
  // ✅ ABA DE INFORMAÇÕES
  const info = [
    ['📋 SUPERLIGA 2025 - RESULTADOS DOS PLAYOFFS'],
    [''],
    ['Fim de Semana:', fimDeSemana],
    ['Fases:', fases],
    ['Data dos Jogos:', dataJogo],
    ['Total de Jogos:', resultados.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    ['Status:', 'PLAYOFFS - RESULTADOS SIMULADOS'],
    [''],
    ['⚠️  ATENÇÃO: Alguns jogos podem ter times TBD'],
    ['Importe os resultados sequencialmente para atualizar os playoffs'],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Acesse o sistema admin: /admin/importar'],
    ['2. Vá na aba "Resultados"'],
    ['3. Faça upload deste arquivo'],
    ['4. O sistema atualizará os próximos jogos automaticamente'],
    ['5. Aguarde e importe o próximo fim de semana'],
    [''],
    ['🏆 SEQUÊNCIA DOS PLAYOFFS:'],
    ['Fim de Semana 13: Wild Cards'],
    ['Fim de Semana 14: Semifinais de Conferência'],
    ['Fim de Semana 15: Finais de Conferência'],
    ['Fim de Semana 16: Semifinais Nacionais'],
    ['Fim de Semana 17: Final Nacional'],
  ]
  
  const infoSheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'INFO')

  // ✅ SALVAR ARQUIVO
  const nomeArquivo = `resultados_playoffs_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}.xlsx`
  const caminhoCompleto = path.join(process.cwd(), 'planilhas_geradas', nomeArquivo)
  
  // Criar diretório se não existir
  const diretorio = path.dirname(caminhoCompleto)
  if (!fs.existsSync(diretorio)) {
    fs.mkdirSync(diretorio, { recursive: true })
  }

  XLSX.writeFile(workbook, caminhoCompleto)
  
  return nomeArquivo
}

// ✅ FUNÇÃO PRINCIPAL
async function main() {
  try {
    console.log('🚀 INICIANDO GERAÇÃO DE RESULTADOS DOS PLAYOFFS...')
    console.log('📅 Fins de Semana dos Playoffs: 13-17')
    console.log('')

    const jogosPorFimDeSemana = await buscarJogosPlayoffs()
    
    if (jogosPorFimDeSemana.size === 0) {
      throw new Error('❌ Nenhum jogo de playoff encontrado! Execute a geração de playoffs primeiro.')
    }

    const args = process.argv.slice(2)
    const fimDeSemanaArg = args.find(arg => arg.startsWith('--fs='))
    
    if (fimDeSemanaArg) {
      // ✅ GERAR APENAS UM FIM DE SEMANA ESPECÍFICO
      const numeroFS = parseInt(fimDeSemanaArg.split('=')[1])
      
      if (numeroFS < 13 || numeroFS > 17) {
        throw new Error('Fim de semana deve ser entre 13-17 (playoffs)')
      }
      
      const jogos = jogosPorFimDeSemana.get(numeroFS)
      if (!jogos || jogos.length === 0) {
        throw new Error(`Fim de semana ${numeroFS} não tem jogos de playoff`)
      }
      
      const resultados = await gerarResultadosFimDeSemana(numeroFS, jogos)
      const arquivo = await criarPlanilhaResultados(numeroFS, resultados)
      
      console.log(`\n✅ Planilha criada: ${arquivo}`)
      
    } else {
      // ✅ GERAR TODOS OS FINS DE SEMANA
      const arquivosGerados: string[] = []
      
      const finsOrdenados = Array.from(jogosPorFimDeSemana.keys()).sort((a, b) => a - b)
      
      for (const fimDeSemana of finsOrdenados) {
        const jogos = jogosPorFimDeSemana.get(fimDeSemana)!
        const resultados = await gerarResultadosFimDeSemana(fimDeSemana, jogos)
        const arquivo = await criarPlanilhaResultados(fimDeSemana, resultados)
        
        if (arquivo) {
          arquivosGerados.push(arquivo)
          console.log(`✅ ${arquivo}`)
        }
      }
      
      // ✅ RELATÓRIO FINAL
      console.log('\n🎉 GERAÇÃO DE PLAYOFFS COMPLETA!')
      console.log(`📁 Total de planilhas: ${arquivosGerados.length}`)
      
      console.log('\n📋 ARQUIVOS GERADOS:')
      arquivosGerados.forEach((arquivo, index) => {
        console.log(`${String(index + 1).padStart(2, '0')}. ${arquivo}`)
      })
      
      console.log('\n📖 FLUXO DE IMPORTAÇÃO:')
      console.log('1. Importe as planilhas NA ORDEM (13, 14, 15, 16, 17)')
      console.log('2. Após cada importação, os próximos jogos serão atualizados')
      console.log('3. Sistema admin: /admin/importar > aba "Resultados"')
      console.log('4. Aguarde a atualização antes de importar o próximo')
    }
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error)
}

export { main as gerarResultadosPlayoffs }