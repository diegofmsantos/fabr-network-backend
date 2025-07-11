// scripts/gerar-planilhas-por-rodada.ts
// Script para gerar planilhas de resultados separadas por fim de semana/rodada

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogoRodada {
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

// Definir as datas dos fins de semana baseado no calendário real da Superliga 2025
const CALENDARIO_SUPERLIGA: Record<number, { data: string; descricao: string }> = {
  1: { data: '2025-07-06', descricao: 'Fim de Semana 1 - Temporada Regular Rodada 1' },
  2: { data: '2025-07-12', descricao: 'Fim de Semana 2 - Temporada Regular Rodada 2' },
  3: { data: '2025-07-19', descricao: 'Fim de Semana 3 - Temporada Regular Rodada 3' },
  4: { data: '2025-07-26', descricao: 'Fim de Semana 4 - Temporada Regular Rodada 4' },
  5: { data: '2025-08-02', descricao: 'Fim de Semana 5 - Temporada Regular Rodada 5' },
  6: { data: '2025-08-09', descricao: 'Fim de Semana 6 - Temporada Regular Rodada 6 (Final)' },
  7: { data: '2025-08-16', descricao: 'Fim de Semana 7 - Wild Cards de Conferência' },
  8: { data: '2025-08-23', descricao: 'Fim de Semana 8 - Semifinais de Conferência' },
  9: { data: '2025-08-30', descricao: 'Fim de Semana 9 - Finais de Conferência' },
  10: { data: '2025-09-06', descricao: 'Fim de Semana 10 - Semifinais Nacionais' },
  11: { data: '2025-09-13', descricao: 'Fim de Semana 11 - Final Nacional' }
}

async function gerarResultadosFakeParaRodada(rodada: number, totalJogos: number): Promise<JogoRodada[]> {
  console.log(`🎲 Gerando ${totalJogos} resultados fake para rodada ${rodada}...`)
  
  const resultados: JogoRodada[] = []
  const dataRodada = CALENDARIO_SUPERLIGA[rodada]?.data || '2025-07-06'
  
  // Buscar jogos da rodada no banco (se existirem)
  const jogosExistentes = await prisma.jogo.findMany({
    where: {
      rodada: rodada,
      temporada: '2025'
    },
    include: {
      timeCasa: true,
      timeVisitante: true
    }
  })
  
  if (jogosExistentes.length > 0) {
    // Se existem jogos no banco, usar os dados reais
    console.log(`✅ Encontrados ${jogosExistentes.length} jogos existentes na rodada ${rodada}`)
    
    jogosExistentes.forEach(jogo => {
      resultados.push({
        id: jogo.id,
        time_mandante: jogo.timeCasa.nome,
        time_visitante: jogo.timeVisitante.nome,
        placar_mandante: jogo.placarCasa || gerarPlacar(),
        placar_visitante: jogo.placarVisitante || gerarPlacar(),
        data_jogo: dataRodada,
        rodada: rodada,
        fase: jogo.fase,
        conferencia: jogo.conferencia || 'GERAL',
        estadio: jogo.local || 'Estádio Padrão',
        status: 'FINALIZADO'
      })
    })
  } else {
    // Se não existem jogos, gerar dados fictícios baseados na estrutura esperada
    console.log(`⚠️ Nenhum jogo encontrado na rodada ${rodada}, gerando dados fictícios...`)
    
    const timesDisponiveis = await prisma.time.findMany({
      where: { temporada: '2025' },
      select: { id: true, nome: true, sigla: true, estadio: true }
    })
    
    if (timesDisponiveis.length === 0) {
      throw new Error('Nenhum time encontrado no banco de dados')
    }
    
    // Gerar jogos fictícios
    for (let i = 0; i < totalJogos; i++) {
      const timeCasa = timesDisponiveis[Math.floor(Math.random() * timesDisponiveis.length)]
      const timeVisitante = timesDisponiveis[Math.floor(Math.random() * timesDisponiveis.length)]
      
      if (timeCasa.id !== timeVisitante.id) {
        resultados.push({
          id: i + 1,
          time_mandante: timeCasa.nome,
          time_visitante: timeVisitante.nome,
          placar_mandante: gerarPlacar(),
          placar_visitante: gerarPlacar(),
          data_jogo: dataRodada,
          rodada: rodada,
          fase: rodada <= 4 ? 'TEMPORADA_REGULAR' : 'PLAYOFFS',
          conferencia: 'GERAL',
          estadio: timeCasa.estadio || 'Estádio Padrão',
          status: 'FINALIZADO'
        })
      }
    }
  }
  
  console.log(`✅ Rodada ${rodada}: Gerados ${resultados.length} jogos (esperado: ${totalJogos})`)
  
  if (resultados.length !== totalJogos) {
    console.log(`⚠️ ATENÇÃO: Rodada ${rodada} tem ${resultados.length} jogos, mas deveria ter ${totalJogos}!`)
  }
  
  return resultados
}

function gerarPlacar(): number {
  // Gerar placares realistas de futebol americano (múltiplos de 3 e 7, entre 0-50)
  const base = Math.floor(Math.random() * 8) // 0-7 touchdowns
  const fieldGoals = Math.floor(Math.random() * 4) // 0-3 field goals
  const extras = Math.floor(Math.random() * 2) // 0-1 safety/conversão de 2 pontos
  
  return (base * 7) + (fieldGoals * 3) + (extras * 2)
}

async function criarPlanilhaRodada(rodada: number, jogos: JogoRodada[]): Promise<string> {
  const workbook = XLSX.utils.book_new()
  
  // Criar planilha principal com os resultados
  const worksheet = XLSX.utils.json_to_sheet(jogos)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS')
  
  // Criar planilha de informações
  const info = [
    ['SUPERLIGA 2025 - RESULTADOS POR RODADA'],
    [''],
    ['Rodada:', rodada],
    ['Data:', CALENDARIO_SUPERLIGA[rodada]?.data || 'Data não definida'],
    ['Descrição:', CALENDARIO_SUPERLIGA[rodada]?.descricao || 'Rodada padrão'],
    ['Total de Jogos:', jogos.length],
    [''],
    ['INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Use este arquivo no sistema admin'],
    ['2. Navegue até "Importar Dados" > "Resultados"'],
    ['3. Faça upload deste arquivo'],
    ['4. Aguarde o processamento'],
    ['5. Verifique se os playoffs foram gerados automaticamente']
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // Criar nome do arquivo
  const dataFormatada = CALENDARIO_SUPERLIGA[rodada]?.data?.replace(/-/g, '') || '20250706'
  const nomeArquivo = `resultados_rodada_${String(rodada).padStart(2, '0')}_${dataFormatada}.xlsx`
  
  // Garantir que a pasta existe
  const pastaDestino = 'planilhas-geradas'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  // Salvar arquivo
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

async function gerarTodasAsPlanilhas(): Promise<void> {
  console.log('📊 INICIANDO GERAÇÃO DE PLANILHAS POR RODADA\n')
  
  // Definir quantos jogos por rodada (baseado na análise REAL da sua agenda)
  const JOGOS_POR_RODADA: Record<number, number> = {
    1: 15, // Temporada Regular - Rodada 1
    2: 15, // Temporada Regular - Rodada 2  
    3: 15, // Temporada Regular - Rodada 3
    4: 15, // Temporada Regular - Rodada 4
    5: 2,  // Temporada Regular - Rodada 5 (fim temporada regular)
    6: 2,  // Temporada Regular - Rodada 6 (fim temporada regular)
    7: 5,  // Wild Cards de Conferência
    8: 8,  // Semifinais de Conferência
    9: 4,  // Finais de Conferência
    10: 2, // Semifinais Nacionais
    11: 1  // Final Nacional
  }
  
  const arquivosGerados: string[] = []
  
  try {
    for (const [rodadaStr, totalJogos] of Object.entries(JOGOS_POR_RODADA)) {
      const rodada = parseInt(rodadaStr)
      
      console.log(`\n🏈 Processando Rodada ${rodada} (${totalJogos} jogos esperados)...`)
      
      // Gerar resultados para a rodada
      const resultados = await gerarResultadosFakeParaRodada(rodada, totalJogos)
      
      // Criar planilha
      const caminhoArquivo = await criarPlanilhaRodada(rodada, resultados)
      arquivosGerados.push(caminhoArquivo)
      
      console.log(`✅ Planilha criada: ${caminhoArquivo}`)
    }
    
    console.log('\n🎉 GERAÇÃO COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log('\n📋 ARQUIVOS GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${index + 1}. ${arquivo}`)
    })
    
    console.log('\n📖 INSTRUÇÕES DE USO:')
    console.log('1. Importe as planilhas na ordem sequencial (Rodada 01, 02, 03...)')
    console.log('2. Use o sistema admin: "Importar Dados" > "Resultados"')
    console.log('3. Aguarde o processamento após cada importação')
    console.log('4. O sistema deve gerar playoffs automaticamente após a Rodada 4')
    console.log('5. Continue importando as rodadas de playoffs em sequência')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// Função para gerar apenas uma rodada específica
async function gerarRodadaEspecifica(rodada: number, totalJogos?: number): Promise<void> {
  console.log(`🎯 Gerando apenas a Rodada ${rodada}...`)
  
  const JOGOS_DEFAULT: Record<number, number> = {
    1: 15, 2: 15, 3: 15, 4: 15, 5: 2, 6: 2,  // Temporada Regular
    7: 5, 8: 8, 9: 4, 10: 2, 11: 1           // Playoffs
  }
  
  const jogosNaRodada = totalJogos || JOGOS_DEFAULT[rodada] || 10
  
  const resultados = await gerarResultadosFakeParaRodada(rodada, jogosNaRodada)
  const caminhoArquivo = await criarPlanilhaRodada(rodada, resultados)
  
  console.log(`✅ Planilha da Rodada ${rodada} criada: ${caminhoArquivo}`)
}

// Executar script
async function main() {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('📖 USO DO SCRIPT:')
      console.log('')
      console.log('npm run generate:planilhas-rodada              # Gerar todas as rodadas')
      console.log('npm run generate:planilhas-rodada --rodada=N   # Gerar apenas rodada N')
      console.log('npm run generate:planilhas-rodada --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:planilhas-rodada --rodada=1   # Apenas Rodada 1')
      console.log('npm run generate:planilhas-rodada --rodada=5   # Apenas Wild Cards')
      return
    }
    
    const rodadaArg = args.find(arg => arg.startsWith('--rodada='))
    
    if (rodadaArg) {
      const rodada = parseInt(rodadaArg.split('=')[1])
              if (isNaN(rodada) || rodada < 1 || rodada > 11) {
        throw new Error('Rodada deve ser um número entre 1 e 11')
      }
      await gerarRodadaEspecifica(rodada)
    } else {
      await gerarTodasAsPlanilhas()
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

export { gerarTodasAsPlanilhas, gerarRodadaEspecifica }