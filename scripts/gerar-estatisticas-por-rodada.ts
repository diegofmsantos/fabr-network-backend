// scripts/gerar-estatisticas-por-rodada.ts
// Script para gerar estatísticas fake individualizadas por rodada

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JogadorEstatistica {
  jogador_id: number
  jogador_nome: string
  time_id: number
  time_nome: string
  id_jogo: number
  data_jogo: string
  posicao: string
  setor: string
  
  // Estatísticas de Passe
  passes_completos: number
  passes_tentados: number
  jardas_de_passe: number
  td_passados: number
  interceptacoes_sofridas: number
  sacks_sofridos: number
  fumble_de_passador: number
  
  // Estatísticas de Corrida
  corridas: number
  jardas_corridas: number
  tds_corridos: number
  fumble_de_corredor: number
  
  // Estatísticas de Recepção
  recepcoes: number
  alvo: number
  jardas_recebidas: number
  tds_recebidos: number
  
  // Estatísticas de Retorno
  retornos: number
  jardas_retornadas: number
  td_retornados: number
  
  // Estatísticas de Defesa
  tackles_totais: number
  tackles_for_loss: number
  sacks_forcado: number
  fumble_forcado: number
  interceptacao_forcada: number
  passe_desviado: number
  safety: number
  td_defensivo: number
  
  // Estatísticas de Kicker
  xp_bons: number
  tentativas_de_xp: number
  fg_bons: number
  tentativas_de_fg: number
  fg_mais_longo: number
  
  // Estatísticas de Punter
  punts: number
  jardas_de_punt: number
}

// Calendário das rodadas (mesmo do script anterior)
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

function gerarEstatisticasQB(isStarter: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
  if (!isStarter) return {}
  
  const eficiencia = pontuacaoTime > 20 ? 'alta' : pontuacaoTime > 10 ? 'media' : 'baixa'
  
  const tentativas = eficiencia === 'alta' ? 
    Math.floor(Math.random() * 20) + 25 :
    eficiencia === 'media' ?
    Math.floor(Math.random() * 15) + 15 :
    Math.floor(Math.random() * 10) + 10
  
  const completos = Math.floor(tentativas * (
    eficiencia === 'alta' ? 0.65 :
    eficiencia === 'media' ? 0.55 : 0.45
  ))
  
  const jardas = completos * (Math.floor(Math.random() * 8) + 6)
  const tds = eficiencia === 'alta' ? 
    Math.floor(Math.random() * 3) + 1 :
    Math.floor(Math.random() * 2)
  
  return {
    passes_tentados: tentativas,
    passes_completos: completos,
    jardas_de_passe: jardas,
    td_passados: tds,
    interceptacoes_sofridas: Math.floor(Math.random() * 2),
    sacks_sofridos: Math.floor(Math.random() * 4),
    fumble_de_passador: Math.floor(Math.random() * 1)
  }
}

function gerarEstatisticasRB(isStarter: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
  if (!isStarter) return {}
  
  const corridas = Math.floor(Math.random() * 15) + 5
  const jardas = corridas * (Math.floor(Math.random() * 4) + 2)
  const tds = pontuacaoTime > 20 ? Math.floor(Math.random() * 2) + 1 : Math.floor(Math.random() * 2)
  
  return {
    corridas,
    jardas_corridas: jardas,
    tds_corridos: tds,
    fumble_de_corredor: Math.floor(Math.random() * 1)
  }
}

function gerarEstatisticasWR(isStarter: boolean, pontuacaoTime: number): Partial<JogadorEstatistica> {
  const alvos = isStarter ? 
    Math.floor(Math.random() * 8) + 4 :
    Math.floor(Math.random() * 4) + 1
  
  const recepcoes = Math.floor(alvos * 0.6)
  const jardas = recepcoes * (Math.floor(Math.random() * 12) + 8)
  const tds = pontuacaoTime > 20 && isStarter ? Math.floor(Math.random() * 2) : 0
  
  return {
    recepcoes,
    alvo: alvos,
    jardas_recebidas: jardas,
    tds_recebidos: tds
  }
}

function gerarEstatisticasDefesa(posicao: string): Partial<JogadorEstatistica> {
  const tacklesBase = posicao.includes('LB') ? 
    Math.floor(Math.random() * 8) + 4 :
    posicao.includes('DE') || posicao.includes('DT') ?
    Math.floor(Math.random() * 6) + 2 :
    Math.floor(Math.random() * 5) + 1
  
  return {
    tackles_totais: tacklesBase,
    tackles_for_loss: Math.floor(Math.random() * 2),
    sacks_forcado: posicao.includes('DE') || posicao.includes('DT') ? Math.floor(Math.random() * 2) : 0,
    fumble_forcado: Math.floor(Math.random() * 1),
    interceptacao_forcada: posicao.includes('CB') || posicao.includes('S') ? Math.floor(Math.random() * 1) : 0,
    passe_desviado: Math.floor(Math.random() * 3),
    safety: 0,
    td_defensivo: Math.floor(Math.random() * 0.1) // Raro
  }
}

function gerarEstatisticasKicker(placares: number[], isStarter: boolean): Partial<JogadorEstatistica> {
  if (!isStarter) return {}
  
  const tdsTime = Math.floor(placares.reduce((a, b) => a + b, 0) / 14) // Estimativa de TDs
  const tentativasXP = tdsTime
  const xpBons = Math.floor(tentativasXP * 0.95) // 95% de conversão
  
  const tentativasFG = Math.floor(Math.random() * 3) + 1
  const fgBons = Math.floor(tentativasFG * 0.8) // 80% de conversão
  
  return {
    xp_bons: xpBons,
    tentativas_de_xp: tentativasXP,
    fg_bons: fgBons,
    tentativas_de_fg: tentativasFG,
    fg_mais_longo: Math.floor(Math.random() * 25) + 25 // 25-50 jardas
  }
}

function gerarEstatisticasPunter(isStarter: boolean): Partial<JogadorEstatistica> {
  if (!isStarter) return {}
  
  const punts = Math.floor(Math.random() * 4) + 2
  const jardas = punts * (Math.floor(Math.random() * 10) + 35) // 35-45 jardas por punt
  
  return {
    punts,
    jardas_de_punt: jardas
  }
}

async function gerarEstatisticasParaRodada(rodada: number): Promise<JogadorEstatistica[]> {
  console.log(`📊 Gerando estatísticas para Rodada ${rodada}...`)
  
  const dataRodada = CALENDARIO_SUPERLIGA[rodada]?.data || '2025-07-06'
  const todasEstatisticas: JogadorEstatistica[] = []
  
  // Buscar jogos da rodada
  const jogos = await prisma.jogo.findMany({
    where: {
      rodada: rodada,
      temporada: '2025'
    },
    include: {
      timeCasa: {
        include: {
          jogadores: {
            where: { temporada: '2025' },
            include: {
              jogador: true
            }
          }
        }
      },
      timeVisitante: {
        include: {
          jogadores: {
            where: { temporada: '2025' },
            include: {
              jogador: true
            }
          }
        }
      }
    }
  })
  
  if (jogos.length === 0) {
    console.log(`⚠️  Nenhum jogo encontrado para rodada ${rodada}`)
    return []
  }
  
  console.log(`✅ Encontrados ${jogos.length} jogos na rodada ${rodada}`)
  
  for (const jogo of jogos) {
    const placarCasa = jogo.placarCasa || Math.floor(Math.random() * 35) + 7
    const placarVisitante = jogo.placarVisitante || Math.floor(Math.random() * 35) + 7
    
    console.log(`🏈 Processando Jogo ${jogo.id}: ${jogo.timeCasa?.sigla || 'TIME'} vs ${jogo.timeVisitante?.sigla || 'TIME'}`)
    
    // Processar time da casa
    if (jogo.timeCasa?.jogadores) {
      await processarEstatisticasTime(
        jogo.timeCasa.jogadores,
        jogo,
        dataRodada,
        placarCasa,
        todasEstatisticas
      )
      console.log(`   ✅ Time Casa: ${jogo.timeCasa.jogadores.length} jogadores processados`)
    }
    
    // Processar time visitante
    if (jogo.timeVisitante?.jogadores) {
      await processarEstatisticasTime(
        jogo.timeVisitante.jogadores,
        jogo,
        dataRodada,
        placarVisitante,
        todasEstatisticas
      )
      console.log(`   ✅ Time Visitante: ${jogo.timeVisitante.jogadores.length} jogadores processados`)
    }
  }
  
  console.log(`\n📊 Rodada ${rodada}: ${todasEstatisticas.length} estatísticas geradas para ${jogos.length} jogos`)
  return todasEstatisticas
}

async function processarEstatisticasTime(
  jogadoresTime: any[],
  jogo: any,
  dataRodada: string,
  pontuacao: number,
  todasEstatisticas: JogadorEstatistica[]
): Promise<void> {
  
  for (const jogadorTime of jogadoresTime) {
    const jogador = jogadorTime.jogador
    const posicao = jogador.posicao
    const setor = jogador.setor
    
    // Determinar se é titular (baseado no número da camisa ou posição)
    const isStarter = parseInt(jogadorTime.numero) <= 50 || 
                     ['QB', 'RB', 'WR', 'TE', 'K', 'P'].includes(posicao)
    
    // Inicializar com estatísticas zeradas
    const estatisticasZeradas: Partial<JogadorEstatistica> = {
      passes_completos: 0, passes_tentados: 0, jardas_de_passe: 0, td_passados: 0,
      interceptacoes_sofridas: 0, sacks_sofridos: 0, fumble_de_passador: 0,
      corridas: 0, jardas_corridas: 0, tds_corridos: 0, fumble_de_corredor: 0,
      recepcoes: 0, alvo: 0, jardas_recebidas: 0, tds_recebidos: 0,
      retornos: 0, jardas_retornadas: 0, td_retornados: 0,
      tackles_totais: 0, tackles_for_loss: 0, sacks_forcado: 0, fumble_forcado: 0,
      interceptacao_forcada: 0, passe_desviado: 0, safety: 0, td_defensivo: 0,
      xp_bons: 0, tentativas_de_xp: 0, fg_bons: 0, tentativas_de_fg: 0, fg_mais_longo: 0,
      punts: 0, jardas_de_punt: 0
    }
    
    let estatisticas = estatisticasZeradas
    
    // Aplicar estatísticas específicas por posição
    if (posicao === 'QB') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasQB(isStarter, pontuacao) }
    } else if (posicao === 'RB' || posicao === 'FB') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasRB(isStarter, pontuacao) }
    } else if (posicao === 'WR' || posicao === 'TE') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasWR(isStarter, pontuacao) }
    } else if (setor === 'Defesa') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasDefesa(posicao) }
    } else if (posicao === 'K') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasKicker([pontuacao], isStarter) }
    } else if (posicao === 'P') {
      estatisticas = { ...estatisticasZeradas, ...gerarEstatisticasPunter(isStarter) }
    }
    
    // Determinar nome do time correto
    const nomeTime = jogo.timeCasa?.id === jogadorTime.timeId ? 
                     jogo.timeCasa.nome : 
                     jogo.timeVisitante?.nome || 'Time Desconhecido'
    
    // Adicionar à lista
    todasEstatisticas.push({
      jogador_id: jogadorTime.jogadorId,
      jogador_nome: jogador.nome,
      time_id: jogadorTime.timeId,
      time_nome: nomeTime,
      id_jogo: jogo.id,
      data_jogo: dataRodada,
      posicao: posicao,
      setor: setor,
      ...estatisticas
    } as JogadorEstatistica)
  }
}

async function criarPlanilhaEstatisticas(rodada: number, estatisticas: JogadorEstatistica[]): Promise<string> {
  const workbook = XLSX.utils.book_new()
  
  // Criar planilha principal com as estatísticas
  const worksheet = XLSX.utils.json_to_sheet(estatisticas)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ESTATISTICAS')
  
  // Criar planilha de informações
  const info = [
    ['SUPERLIGA 2025 - ESTATÍSTICAS POR RODADA'],
    [''],
    ['Rodada:', rodada],
    ['Data:', CALENDARIO_SUPERLIGA[rodada]?.data || 'Data não definida'],
    ['Descrição:', CALENDARIO_SUPERLIGA[rodada]?.descricao || 'Rodada padrão'],
    ['Total de Registros:', estatisticas.length],
    [''],
    ['INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. IMPORTANTE: Importe DEPOIS dos resultados da rodada'],
    ['2. Use este arquivo no sistema admin'],
    ['3. Navegue até "Importar Dados" > "Estatísticas"'],
    ['4. Faça upload deste arquivo'],
    ['5. Aguarde o processamento (pode demorar alguns minutos)'],
    ['6. As estatísticas serão consolidadas automaticamente']
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // Criar resumo por posição
  const resumoPorPosicao = new Map()
  estatisticas.forEach(stat => {
    if (!resumoPorPosicao.has(stat.posicao)) {
      resumoPorPosicao.set(stat.posicao, 0)
    }
    resumoPorPosicao.set(stat.posicao, resumoPorPosicao.get(stat.posicao) + 1)
  })
  
  const resumoData = Array.from(resumoPorPosicao.entries()).map(([posicao, quantidade]) => ({
    Posicao: posicao,
    Quantidade: quantidade
  }))
  
  const resumoWorksheet = XLSX.utils.json_to_sheet(resumoData)
  XLSX.utils.book_append_sheet(workbook, resumoWorksheet, 'RESUMO')
  
  // Criar nome do arquivo
  const dataFormatada = CALENDARIO_SUPERLIGA[rodada]?.data?.replace(/-/g, '') || '20250706'
  const nomeArquivo = `estatisticas_rodada_${String(rodada).padStart(2, '0')}_${dataFormatada}.xlsx`
  
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

async function gerarEstatisticasTodasRodadas(): Promise<void> {
  console.log('📊 INICIANDO GERAÇÃO DE ESTATÍSTICAS POR RODADA\n')
  
  const arquivosGerados: string[] = []
  
  try {
    // Gerar apenas para rodadas da temporada regular (1-6) inicialmente
    for (let rodada = 1; rodada <= 6; rodada++) {
      console.log(`\n🏈 Processando Estatísticas da Rodada ${rodada}...`)
      
      // Gerar estatísticas para a rodada
      const estatisticas = await gerarEstatisticasParaRodada(rodada)
      
      if (estatisticas.length > 0) {
        // Criar planilha
        const caminhoArquivo = await criarPlanilhaEstatisticas(rodada, estatisticas)
        arquivosGerados.push(caminhoArquivo)
        
        console.log(`✅ Planilha de estatísticas criada: ${caminhoArquivo}`)
      } else {
        console.log(`⚠️  Nenhuma estatística gerada para Rodada ${rodada} (verificar se há jogos no banco)`)
      }
    }
    
    console.log('\n🎉 GERAÇÃO DE ESTATÍSTICAS COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log('\n📋 ARQUIVOS GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${index + 1}. ${arquivo}`)
    })
    
    console.log('\n📖 INSTRUÇÕES DE USO:')
    console.log('1. SEMPRE importe primeiro os RESULTADOS da rodada')
    console.log('2. DEPOIS importe as ESTATÍSTICAS da mesma rodada')
    console.log('3. Use o sistema admin: "Importar Dados" > "Estatísticas"')
    console.log('4. Aguarde o processamento (pode demorar alguns minutos)')
    console.log('5. Verifique se as estatísticas aparecem nas páginas dos jogadores')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// Função para gerar apenas uma rodada específica
async function gerarEstatisticasRodadaEspecifica(rodada: number): Promise<void> {
  console.log(`🎯 Gerando estatísticas apenas para Rodada ${rodada}...`)
  
  const estatisticas = await gerarEstatisticasParaRodada(rodada)
  
  if (estatisticas.length > 0) {
    const caminhoArquivo = await criarPlanilhaEstatisticas(rodada, estatisticas)
    console.log(`✅ Planilha de estatísticas da Rodada ${rodada} criada: ${caminhoArquivo}`)
  } else {
    console.log(`⚠️  Nenhuma estatística gerada para Rodada ${rodada}`)
    console.log('💡 Dica: Certifique-se de que:')
    console.log('   - Os jogos da rodada existem no banco de dados')
    console.log('   - Os times têm jogadores cadastrados')
    console.log('   - Os resultados da rodada foram importados')
  }
}

// Executar script
async function main() {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('📖 USO DO SCRIPT:')
      console.log('')
      console.log('npm run generate:estatisticas-rodada              # Gerar todas as rodadas')
      console.log('npm run generate:estatisticas-rodada --rodada=N   # Gerar apenas rodada N')
      console.log('npm run generate:estatisticas-rodada --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:estatisticas-rodada --rodada=1   # Apenas Rodada 1')
      console.log('npm run generate:estatisticas-rodada --rodada=6   # Última Rodada Temporada Regular')
      console.log('')
      console.log('⚠️  IMPORTANTE:')
      console.log('- Importe sempre os RESULTADOS antes das ESTATÍSTICAS')
      console.log('- Certifique-se de que os jogos existem no banco de dados')
      console.log('- Rodadas 1-6: Temporada Regular')
      console.log('- Rodadas 7-11: Playoffs (Wild Cards, Semifinais, Finais)')
      return
    }
    
    const rodadaArg = args.find(arg => arg.startsWith('--rodada='))
    
    if (rodadaArg) {
      const rodada = parseInt(rodadaArg.split('=')[1])
      if (isNaN(rodada) || rodada < 1 || rodada > 11) {
        throw new Error('Rodada deve ser um número entre 1 e 11')
      }
      await gerarEstatisticasRodadaEspecifica(rodada)
    } else {
      await gerarEstatisticasTodasRodadas()
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

export { gerarEstatisticasTodasRodadas, gerarEstatisticasRodadaEspecifica }