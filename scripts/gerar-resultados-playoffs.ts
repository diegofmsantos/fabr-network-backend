// scripts/gerar-resultados-playoffs.ts - COPIADO do script que funciona
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

// ✅ GERAR PLACAR REALISTA (igual ao original)
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  const base1 = Math.floor(Math.random() * 35) + 7
  const base2 = Math.floor(Math.random() * 35) + 7
  
  if (base1 === base2) {
    return { mandante: base1, visitante: base2 + 7 }
  }
  
  return { mandante: base1, visitante: base2 }
}

// ✅ DETERMINAR FIM DE SEMANA PELOS PLAYOFFS (baseado na fase)
function determinarFimDeSemana(jogo: any): number {
  // Mapear cada fase para um fim de semana específico
  switch (jogo.fase) {
    case 'WILD CARD': return 13
    case 'SEMIFINAL CONFERENCIA': return 14  
    case 'FINAL CONFERENCIA': return 15
    case 'SEMIFINAL NACIONAL': return 16
    case 'FINAL NACIONAL': return 17
    default: return 17
  }
}

// ✅ BUSCAR JOGOS AGRUPADOS POR FIM DE SEMANA (adaptado para playoffs)
async function buscarJogosAgrupados(): Promise<Map<number, any[]>> {
  try {
    console.log('🔍 Buscando jogos de playoff agrupados por fim de semana...')

    const superliga = await prisma.campeonato.findFirst({
      where: { temporada: '2025', isSuperliga: true }
    })

    if (!superliga) {
      throw new Error('Superliga 2025 não encontrada')
    }

    // ✅ BUSCAR TODOS OS JOGOS DE PLAYOFF
    const jogos = await prisma.playoffJogo.findMany({
      where: { campeonatoId: superliga.id },
      include: {
        timeClassificado1: true,
        timeClassificado2: true,
        conferencia: true
      },
      orderBy: [{ fase: 'asc' }, { dataJogo: 'asc' }]
    })

    // ✅ MAPEAR JOGOS (incluindo os TBD)
    const jogosFormatados = jogos.map(jogo => ({
      id: jogo.id,
      dataJogo: jogo.dataJogo || new Date(),
      rodada: 1,
      fase: jogo.fase,
      timeCasa: {
        nome: jogo.timeClassificado1?.nome || `Vencedor Jogo ${jogo.id - 5}`,
        sigla: jogo.timeClassificado1?.sigla || 'TBD',
        cidade: jogo.timeClassificado1?.cidade || 'N/A',
        estadio: `Estádio ${jogo.timeClassificado1?.cidade || 'TBD'}`
      },
      timeVisitante: {
        nome: jogo.timeClassificado2?.nome || `Vencedor Jogo ${jogo.id - 3}`,
        sigla: jogo.timeClassificado2?.sigla || 'TBD'
      },
      conferencia: jogo.conferencia?.nome || 'Nacional',
      local: `Estádio ${jogo.timeClassificado1?.cidade || 'TBD'}`
    }))

    // ✅ AGRUPAR POR FIM DE SEMANA PELA FASE
    const jogosPorFimDeSemana = new Map<number, any[]>()

    jogosFormatados.forEach(jogo => {
      const fimDeSemana = determinarFimDeSemana(jogo)  // ✅ PASSAR O JOGO INTEIRO
      
      if (!jogosPorFimDeSemana.has(fimDeSemana)) {
        jogosPorFimDeSemana.set(fimDeSemana, [])
      }
      
      jogosPorFimDeSemana.get(fimDeSemana)!.push(jogo)
    })

    console.log(`✅ Encontrados ${jogosFormatados.length} jogos de playoff`)
    
    jogosPorFimDeSemana.forEach((jogos, fimDeSemana) => {
      const datasJogos = [...new Set(jogos.map(j => new Date(j.dataJogo).toLocaleDateString('pt-BR')))]
      console.log(`   Fim de Semana ${fimDeSemana}: ${jogos.length} jogos (${datasJogos.join(', ')})`)
    })

    console.log(`\n🎯 Total de fins de semana dos playoffs: ${jogosPorFimDeSemana.size}`)

    return jogosPorFimDeSemana

  } catch (error) {
    console.error('❌ Erro ao buscar jogos de playoff:', error)
    throw error
  }
}

// ✅ GERAR RESULTADOS FAKE PARA UM FIM DE SEMANA (igual ao original)
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
      status: 'FINALIZADO'
    }

    resultados.push(resultado)
    
    console.log(`   🏈 ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
  }

  return resultados
}

// ✅ CRIAR PLANILHA DE RESULTADOS (igual ao original)
async function criarPlanilhaResultados(fimDeSemana: number, resultados: JogoResultado[]): Promise<string> {
  if (resultados.length === 0) {
    console.log(`⏭️  Pulando Fim de Semana ${fimDeSemana} - sem jogos`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  const worksheet = XLSX.utils.json_to_sheet(resultados)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS')
  
  const dataJogo = resultados[0]?.data_jogo || 'N/A'
  const info = [
    ['📋 SUPERLIGA 2025 - RESULTADOS DOS PLAYOFFS'],
    [''],
    ['Fim de Semana:', fimDeSemana],
    ['Data dos Jogos:', dataJogo],
    ['Total de Jogos:', resultados.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    ['Status:', 'RESULTADOS FINAIS'],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Acesse o sistema admin: /admin/importar'],
    ['2. Vá na aba "Resultados"'],
    ['3. Faça upload deste arquivo'],
    ['4. Aguarde o processamento completo'],
    [''],
    ['⚠️ IMPORTANTE:'],
    ['- Importe sempre na ordem sequencial dos fins de semana'],
    ['- Aguarde a conclusão antes de importar o próximo'],
    ['- A planilha de ESTATÍSTICAS deve ser importada 1 dia após'],
    [''],
    ['🎯 PRÓXIMO PASSO:'],
    ['Após importar esta planilha, aguarde 1 dia e importe:'],
    [`estatisticas_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_playoffs.xlsx`]
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  const dataFormatada = dataJogo.replace(/-/g, '')
  const nomeArquivo = `resultados_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_playoffs_${dataFormatada}.xlsx`
  
  const pastaDestino = 'planilhas-resultados-playoffs'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

// ✅ GERAR TODAS AS PLANILHAS (igual ao original)
async function gerarTodasAsPlanilhasResultados(): Promise<void> {
  console.log('🚀 INICIANDO GERAÇÃO DE PLANILHAS DE RESULTADOS DOS PLAYOFFS\n')
  
  try {
    const jogosPorFimDeSemana = await buscarJogosAgrupados()
    
    const arquivosGerados: string[] = []
    
    for (const [fimDeSemana, jogos] of jogosPorFimDeSemana) {
      console.log(`\n🗓️ Processando Fim de Semana ${fimDeSemana}...`)
      
      const resultados = await gerarResultadosFimDeSemana(fimDeSemana, jogos)
      
      const caminhoArquivo = await criarPlanilhaResultados(fimDeSemana, resultados)
      
      if (caminhoArquivo) {
        arquivosGerados.push(caminhoArquivo)
        console.log(`✅ Planilha criada: ${caminhoArquivo}`)
      }
    }
    
    console.log('\n🎉 GERAÇÃO DE RESULTADOS DOS PLAYOFFS COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log(`📊 Total de fins de semana: ${jogosPorFimDeSemana.size}`)
    
    console.log('\n📋 ARQUIVOS DE RESULTADOS DOS PLAYOFFS GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${path.basename(arquivo)}`)
    })
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// ✅ MAIN (igual ao original)
async function main() {
  try {
    await gerarTodasAsPlanilhasResultados()
  } catch (error) {
    console.error('❌ Erro durante execução:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n🔚 Geração de resultados dos playoffs concluída.')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 Erro:', error)
      process.exit(1)
    })
}

export default main