// scripts/gerar-planilhas-por-fim-de-semana.ts
// Script para gerar planilhas separadas por fim de semana baseado na agenda real

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogoResultado {
  id: number
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

// Definir fins de semana baseado na agenda real da Superliga 2025
const FINS_DE_SEMANA = [
  { id: 1, data: '2025-07-06', descricao: 'Fim de Semana 1' },
  { id: 2, data: '2025-07-12', descricao: 'Fim de Semana 2' },
  { id: 3, data: '2025-07-19', descricao: 'Fim de Semana 3' },
  { id: 4, data: '2025-07-26', descricao: 'Fim de Semana 4' },
  { id: 5, data: '2025-08-02', descricao: 'Fim de Semana 5' },
  { id: 6, data: '2025-08-09', descricao: 'Fim de Semana 6' },
  { id: 7, data: '2025-08-16', descricao: 'Fim de Semana 7 - Wild Cards' },
  { id: 8, data: '2025-08-23', descricao: 'Fim de Semana 8 - Semifinais' },
  { id: 9, data: '2025-08-30', descricao: 'Fim de Semana 9 - Finais' },
  { id: 10, data: '2025-09-06', descricao: 'Fim de Semana 10 - Semifinais Nacionais' },
  { id: 11, data: '2025-09-13', descricao: 'Fim de Semana 11 - Final Nacional' }
]

function gerarPlacar(): number {
  const pontosComuns = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42]
  return pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
}

function gerarPlacarRealista(): { mandante: number; visitante: number } {
  const mandante = gerarPlacar()
  let visitante = gerarPlacar()
  
  // Evitar empates em 80% dos casos
  if (mandante === visitante && Math.random() < 0.8) {
    const incremento = Math.random() < 0.5 ? 3 : 7
    if (Math.random() < 0.5) {
      return { mandante: mandante + incremento, visitante }
    } else {
      return { mandante, visitante: visitante + incremento }
    }
  }
  
  return { mandante, visitante }
}

async function buscarJogosPorData(data: string): Promise<any[]> {
  const superliga = await prisma.campeonato.findFirst({
    where: {
      temporada: '2025',
      isSuperliga: true
    }
  })

  if (!superliga) {
    throw new Error('Superliga 2025 não encontrada')
  }

  // Buscar jogos na data específica
  const dataInicio = new Date(data)
  const dataFim = new Date(data)
  dataFim.setDate(dataFim.getDate() + 1) // Até o final do dia

  const jogos = await prisma.jogo.findMany({
    where: {
      campeonatoId: superliga.id,
      dataJogo: {
        gte: dataInicio,
        lt: dataFim
      }
    },
    include: {
      timeCasa: { select: { nome: true, sigla: true, estadio: true, cidade: true } },
      timeVisitante: { select: { nome: true, sigla: true } }
    },
    orderBy: { id: 'asc' }
  })

  return jogos
}

async function gerarResultadosPorFimDeSemana(fimDeSemana: typeof FINS_DE_SEMANA[0]): Promise<JogoResultado[]> {
  console.log(`🎲 Gerando resultados para ${fimDeSemana.descricao} (${fimDeSemana.data})...`)
  
  const jogos = await buscarJogosPorData(fimDeSemana.data)
  
  if (jogos.length === 0) {
    console.log(`⚠️  Nenhum jogo encontrado para ${fimDeSemana.data}`)
    return []
  }

  console.log(`📋 Encontrados ${jogos.length} jogos para ${fimDeSemana.data}`)

  const resultados: JogoResultado[] = []

  for (const jogo of jogos) {
    const placar = gerarPlacarRealista()
    
    const resultado: JogoResultado = {
      id: jogo.id,
      time_mandante: jogo.timeCasa.nome,
      time_visitante: jogo.timeVisitante.nome,
      placar_mandante: placar.mandante,
      placar_visitante: placar.visitante,
      data_jogo: fimDeSemana.data,
      rodada: jogo.rodada,
      fase: jogo.fase,
      conferencia: jogo.conferencia || 'Geral',
      estadio: jogo.local || jogo.timeCasa.estadio || `Estádio ${jogo.timeCasa.cidade}`,
      status: 'FINALIZADO'
    }

    resultados.push(resultado)
    
    console.log(`   🏈 ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
  }

  return resultados
}

async function criarPlanilhaFimDeSemana(fimDeSemana: typeof FINS_DE_SEMANA[0], resultados: JogoResultado[]): Promise<string> {
  if (resultados.length === 0) {
    console.log(`⏭️  Pulando ${fimDeSemana.descricao} - sem jogos`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  // ✅ ABA PRINCIPAL: RESULTADOS
  const worksheet = XLSX.utils.json_to_sheet(resultados)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS')
  
  // ✅ ABA INFO: Instruções
  const info = [
    ['📋 INFORMAÇÕES DA PLANILHA'],
    [''],
    ['Fim de Semana:', fimDeSemana.descricao],
    ['Data:', fimDeSemana.data],
    ['Total de Jogos:', resultados.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Use o sistema admin em "Importar Dados" > "Resultados"'],
    ['2. Faça upload deste arquivo'],
    ['3. Aguarde o processamento'],
    ['4. Verifique se os playoffs foram gerados automaticamente'],
    [''],
    ['⚠️  IMPORTANTE:'],
    ['- Importe os fins de semana em ordem sequencial'],
    ['- Aguarde a conclusão antes de importar o próximo'],
    ['- Verifique se não há erros antes de continuar']
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // ✅ CRIAR NOME DO ARQUIVO
  const dataFormatada = fimDeSemana.data.replace(/-/g, '')
  const nomeArquivo = `resultados_fim_de_semana_${String(fimDeSemana.id).padStart(2, '0')}_${dataFormatada}.xlsx`
  
  // ✅ GARANTIR QUE A PASTA EXISTS
  const pastaDestino = 'planilhas-fins-de-semana'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  // ✅ SALVAR ARQUIVO
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

async function gerarTodasAsPlanilhasFimDeSemana(): Promise<void> {
  console.log('📊 INICIANDO GERAÇÃO DE PLANILHAS POR FIM DE SEMANA\n')
  
  const arquivosGerados: string[] = []
  
  try {
    for (const fimDeSemana of FINS_DE_SEMANA) {
      console.log(`\n🗓️  Processando ${fimDeSemana.descricao} (${fimDeSemana.data})...`)
      
      // Gerar resultados para o fim de semana
      const resultados = await gerarResultadosPorFimDeSemana(fimDeSemana)
      
      if (resultados.length > 0) {
        // Criar planilha
        const caminhoArquivo = await criarPlanilhaFimDeSemana(fimDeSemana, resultados)
        
        if (caminhoArquivo) {
          arquivosGerados.push(caminhoArquivo)
          console.log(`✅ Planilha criada: ${caminhoArquivo}`)
        }
      }
    }
    
    console.log('\n🎉 GERAÇÃO COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log('\n📋 ARQUIVOS GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${index + 1}. ${arquivo}`)
    })
    
    console.log('\n📖 FLUXO DE IMPORTAÇÃO RECOMENDADO:')
    console.log('1. Importe as planilhas na ordem sequencial (Fim de Semana 01, 02, 03...)')
    console.log('2. Use o sistema admin: "Importar Dados" > "Resultados"')
    console.log('3. Aguarde o processamento após cada importação')
    console.log('4. O sistema deve gerar playoffs automaticamente após o Fim de Semana 6')
    console.log('5. Continue importando os playoffs em sequência')
    console.log('6. O campeão será definido após o Fim de Semana 11')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// Função para gerar apenas um fim de semana específico
async function gerarFimDeSemanaEspecifico(numero: number): Promise<void> {
  console.log(`🎯 Gerando apenas o Fim de Semana ${numero}...`)
  
  const fimDeSemana = FINS_DE_SEMANA.find(fs => fs.id === numero)
  
  if (!fimDeSemana) {
    throw new Error(`Fim de semana ${numero} não encontrado. Disponíveis: 1-11`)
  }
  
  const resultados = await gerarResultadosPorFimDeSemana(fimDeSemana)
  
  if (resultados.length > 0) {
    const caminhoArquivo = await criarPlanilhaFimDeSemana(fimDeSemana, resultados)
    console.log(`✅ Planilha criada: ${caminhoArquivo}`)
  } else {
    console.log(`⚠️  Nenhum jogo encontrado para ${fimDeSemana.descricao}`)
  }
}

// Executar script
async function main() {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('📖 USO DO SCRIPT:')
      console.log('')
      console.log('npm run generate:fins-de-semana              # Gerar todos os fins de semana')
      console.log('npm run generate:fins-de-semana --fs=N       # Gerar apenas fim de semana N')
      console.log('npm run generate:fins-de-semana --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:fins-de-semana --fs=1       # Apenas Fim de Semana 1')
      console.log('npm run generate:fins-de-semana --fs=7       # Apenas Wild Cards')
      console.log('npm run generate:fins-de-semana --fs=11      # Apenas Final Nacional')
      return
    }
    
    const fimDeSemanaArg = args.find(arg => arg.startsWith('--fs='))
    
    if (fimDeSemanaArg) {
      const numero = parseInt(fimDeSemanaArg.split('=')[1])
      if (isNaN(numero) || numero < 1 || numero > 11) {
        throw new Error('Fim de semana deve ser um número entre 1 e 11')
      }
      await gerarFimDeSemanaEspecifico(numero)
    } else {
      await gerarTodasAsPlanilhasFimDeSemana()
    }
    
  } catch (error) {
    console.error('💥 Erro:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main()
}

export { gerarTodasAsPlanilhasFimDeSemana, gerarFimDeSemanaEspecifico }