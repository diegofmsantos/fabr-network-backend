// scripts/gerar-estatisticas-jogos-restantes.ts
// Script para gerar planilhas de ESTATÍSTICAS dos 20 jogos RESTANTES da temporada regular
// Seguindo EXATAMENTE o padrão de gerar-estatisticas-por-fim-de-semana.ts

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// ✅ INTERFACE SEGUINDO O PADRÃO EXATO DOS SCRIPTS EXISTENTES
interface EstatisticaJogador {
  jogo_id: number
  jogador_id: number
  jogador_nome: string
  time_id: number
  time_nome: string
  time_sigla: string
  posicao: string
  setor: string
  data_jogo: string
  rodada: number
  fase: string
  
  // Estatísticas de Passe
  passe_completado: number
  passe_tentado: number
  jardas_passadas: number
  tds_passados: number
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

// ✅ BUSCAR DADOS PARA ESTATÍSTICAS DOS JOGOS RESTANTES
async function buscarDadosParaEstatisticasJogosRestantes() {
  console.log('🔍 Buscando dados para estatísticas dos 20 jogos restantes...')

  const superliga = await prisma.campeonato.findFirst({
    where: {
      temporada: '2025',
      isSuperliga: true
    }
  })

  if (!superliga) {
    throw new Error('❌ Superliga 2025 não encontrada')
  }

  // Buscar TODOS os jogos da temporada regular ordenados
  const todosJogos = await prisma.jogo.findMany({
    where: {
      campeonatoId: superliga.id,
      fase: 'TEMPORADA REGULAR'
    },
    include: {
      timeCasa: { select: { id: true, nome: true, sigla: true } },
      timeVisitante: { select: { id: true, nome: true, sigla: true } }
    },
    orderBy: [
      { dataJogo: 'asc' },
      { id: 'asc' }
    ]
  })

  // ✅ PEGAR APENAS OS 20 ÚLTIMOS JOGOS
  const jogosRestantes = todosJogos.slice(-20)

  if (jogosRestantes.length === 0) {
    throw new Error('❌ Nenhum jogo restante encontrado')
  }

  // ✅ AGRUPAR POR FIM DE SEMANA (mesma lógica do script original)
  const jogosPorFimDeSemana = new Map<string, any[]>()
  let fimDeSemanaAtual = 1
  let dataAnterior: Date | null = null

  jogosRestantes.forEach((jogo) => {
    const dataJogo = new Date(jogo.dataJogo)
    
    if (dataAnterior) {
      const diferencaDias = Math.abs(dataJogo.getTime() - dataAnterior.getTime()) / (1000 * 60 * 60 * 24)
      if (diferencaDias > 3) {
        fimDeSemanaAtual++
      }
    }

    const chave = `FS${fimDeSemanaAtual}`
    if (!jogosPorFimDeSemana.has(chave)) {
      jogosPorFimDeSemana.set(chave, [])
    }

    jogosPorFimDeSemana.get(chave)!.push(jogo)
    dataAnterior = dataJogo
  })

  // Buscar todos os jogadores da temporada 2025
  const jogadores = await prisma.jogadorTime.findMany({
    where: { temporada: '2025' },
    include: {
      jogador: { select: { nome: true, posicao: true, setor: true } },
      time: { select: { nome: true, sigla: true } }
    }
  })

  console.log(`📊 Total de jogos restantes: ${jogosRestantes.length}`)
  console.log(`📊 Total de fins de semana: ${jogosPorFimDeSemana.size}`)
  console.log(`👥 Total de jogadores disponíveis: ${jogadores.length}`)

  return { jogosPorFimDeSemana, jogadores }
}

// ✅ GERAR ESTATÍSTICAS PARA UM FIM DE SEMANA
async function gerarEstatisticasFimDeSemana(fimDeSemana: number, jogos: any[], jogadores: any[]): Promise<EstatisticaJogador[]> {
  console.log(`📊 Gerando estatísticas para Fim de Semana ${fimDeSemana} (${jogos.length} jogos)...`)
  
  const estatisticas: EstatisticaJogador[] = []

  for (const jogo of jogos) {
    // Buscar jogadores dos dois times (mesmo padrão)
    const jogadoresTimeCasa = jogadores.filter(j => j.timeId === jogo.timeCasaId)
    const jogadoresTimeVisitante = jogadores.filter(j => j.timeId === jogo.timeVisitanteId)

    // Selecionar ~25 jogadores por time (padrão dos scripts)
    const jogadoresAtivosTimeCasa = jogadoresTimeCasa.slice(0, 25)
    const jogadoresAtivosTimeVisitante = jogadoresTimeVisitante.slice(0, 25)

    const dataJogo = new Date(jogo.dataJogo).toISOString().split('T')[0]

    // Gerar estatísticas para time casa
    for (const jogadorTime of jogadoresAtivosTimeCasa) {
      const stats = gerarEstatisticasPorPosicao(jogadorTime.jogador.posicao, jogadorTime.jogador.setor)
      
      const estatistica: EstatisticaJogador = {
        jogo_id: jogo.id,
        jogador_id: jogadorTime.jogadorId,
        jogador_nome: jogadorTime.jogador.nome,
        time_id: jogo.timeCasaId,
        time_nome: jogo.timeCasa.nome,
        time_sigla: jogo.timeCasa.sigla,
        posicao: jogadorTime.jogador.posicao,
        setor: jogadorTime.jogador.setor,
        data_jogo: dataJogo,
        rodada: jogo.rodada || 1,
        fase: jogo.fase || 'TEMPORADA REGULAR',
        ...stats
      }
      
      estatisticas.push(estatistica)
    }

    // Gerar estatísticas para time visitante
    for (const jogadorTime of jogadoresAtivosTimeVisitante) {
      const stats = gerarEstatisticasPorPosicao(jogadorTime.jogador.posicao, jogadorTime.jogador.setor)
      
      const estatistica: EstatisticaJogador = {
        jogo_id: jogo.id,
        jogador_id: jogadorTime.jogadorId,
        jogador_nome: jogadorTime.jogador.nome,
        time_id: jogo.timeVisitanteId,
        time_nome: jogo.timeVisitante.nome,
        time_sigla: jogo.timeVisitante.sigla,
        posicao: jogadorTime.jogador.posicao,
        setor: jogadorTime.jogador.setor,
        data_jogo: dataJogo,
        rodada: jogo.rodada || 1,
        fase: jogo.fase || 'TEMPORADA REGULAR',
        ...stats
      }
      
      estatisticas.push(estatistica)
    }
  }

  console.log(`✅ ${estatisticas.length} estatísticas geradas para Fim de Semana ${fimDeSemana}`)
  return estatisticas
}

// ✅ GERAR ESTATÍSTICAS POR POSIÇÃO (mesmo padrão dos scripts existentes)
function gerarEstatisticasPorPosicao(posicao: string, setor: string) {
  const stats = {
    // Passe
    passe_completado: 0,
    passe_tentado: 0,
    jardas_passadas: 0,
    tds_passados: 0,
    interceptacoes_sofridas: 0,
    sacks_sofridos: 0,
    fumble_de_passador: 0,
    
    // Corrida
    corridas: 0,
    jardas_corridas: 0,
    tds_corridos: 0,
    fumble_de_corredor: 0,
    
    // Recepção
    recepcoes: 0,
    alvo: 0,
    jardas_recebidas: 0,
    tds_recebidos: 0,
    
    // Retorno
    retornos: 0,
    jardas_retornadas: 0,
    td_retornados: 0,
    
    // Defesa
    tackles_totais: 0,
    tackles_for_loss: 0,
    sacks_forcado: 0,
    fumble_forcado: 0,
    interceptacao_forcada: 0,
    passe_desviado: 0,
    safety: 0,
    td_defensivo: 0,
    
    // Kicker
    xp_bons: 0,
    tentativas_de_xp: 0,
    fg_bons: 0,
    tentativas_de_fg: 0,
    fg_mais_longo: 0,
    
    // Punter
    punts: 0,
    jardas_de_punt: 0
  }

  // Mesma lógica dos scripts existentes
  switch (setor) {
    case 'Offense':
      if (posicao === 'QB') {
        stats.passe_completado = Math.floor(Math.random() * 25) + 15
        stats.passe_tentado = stats.passe_completado + Math.floor(Math.random() * 15) + 5
        stats.jardas_passadas = Math.floor(Math.random() * 300) + 150
        stats.tds_passados = Math.floor(Math.random() * 4)
        stats.interceptacoes_sofridas = Math.random() < 0.3 ? 1 : 0
        stats.sacks_sofridos = Math.floor(Math.random() * 4)
        stats.fumble_de_passador = Math.random() < 0.2 ? 1 : 0
        stats.corridas = Math.floor(Math.random() * 8) + 2
        stats.jardas_corridas = Math.floor(Math.random() * 60) + 10
      }
      else if (posicao === 'RB' || posicao === 'FB') {
        stats.corridas = Math.floor(Math.random() * 20) + 10
        stats.jardas_corridas = Math.floor(Math.random() * 120) + 40
        stats.tds_corridos = Math.floor(Math.random() * 3)
        stats.fumble_de_corredor = Math.random() < 0.1 ? 1 : 0
        stats.recepcoes = Math.floor(Math.random() * 8) + 2
        stats.alvo = stats.recepcoes + Math.floor(Math.random() * 4)
        stats.jardas_recebidas = Math.floor(Math.random() * 80) + 10
      }
      else if (posicao === 'WR' || posicao === 'TE') {
        stats.recepcoes = Math.floor(Math.random() * 10) + 3
        stats.alvo = stats.recepcoes + Math.floor(Math.random() * 5) + 1
        stats.jardas_recebidas = Math.floor(Math.random() * 120) + 30
        stats.tds_recebidos = Math.floor(Math.random() * 2)
      }
      break

    case 'Defense':
      stats.tackles_totais = Math.floor(Math.random() * 10) + 2
      stats.tackles_for_loss = Math.floor(Math.random() * 3)
      
      if (posicao === 'DE' || posicao === 'DT') {
        stats.sacks_forcado = Math.random() < 0.4 ? Math.floor(Math.random() * 2) + 1 : 0
        stats.fumble_forcado = Math.random() < 0.2 ? 1 : 0
      }
      if (posicao === 'CB' || posicao === 'S') {
        stats.interceptacao_forcada = Math.random() < 0.2 ? 1 : 0
        stats.passe_desviado = Math.floor(Math.random() * 3) + 1
      }
      if (posicao === 'LB') {
        stats.sacks_forcado = Math.random() < 0.3 ? 1 : 0
      }
      stats.safety = Math.random() < 0.05 ? 1 : 0
      stats.td_defensivo = Math.random() < 0.1 ? 1 : 0
      break

    case 'Special':
      if (posicao === 'K') {
        stats.tentativas_de_xp = Math.floor(Math.random() * 6) + 1
        stats.xp_bons = Math.floor(stats.tentativas_de_xp * (0.9 + Math.random() * 0.1))
        stats.tentativas_de_fg = Math.floor(Math.random() * 3)
        stats.fg_bons = Math.floor(stats.tentativas_de_fg * (0.7 + Math.random() * 0.3))
        stats.fg_mais_longo = stats.fg_bons > 0 ? Math.floor(Math.random() * 30) + 25 : 0
      }
      else if (posicao === 'P') {
        stats.punts = Math.floor(Math.random() * 5) + 2
        stats.jardas_de_punt = stats.punts * (Math.floor(Math.random() * 15) + 35)
      }
      else if (posicao === 'RS') {
        stats.retornos = Math.floor(Math.random() * 4) + 1
        stats.jardas_retornadas = Math.floor(Math.random() * 80) + 10
        stats.td_retornados = Math.random() < 0.15 ? 1 : 0
      }
      break
  }

  return stats
}

// ✅ CRIAR PLANILHA DE ESTATÍSTICAS PARA UM FIM DE SEMANA
async function criarPlanilhaEstatisticas(fimDeSemana: number, estatisticas: EstatisticaJogador[], dataJogo: string): Promise<string> {
  if (estatisticas.length === 0) {
    console.log(`⏭️  Pulando Fim de Semana ${fimDeSemana} - sem estatísticas`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  // ✅ ABA PRINCIPAL: ESTATÍSTICAS
  const worksheet = XLSX.utils.json_to_sheet(estatisticas)
  
  // Definir largura das colunas
  const cols = [
    { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 20 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 15 },
    ...Array(50).fill({ wch: 8 })
  ]
  worksheet['!cols'] = cols
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ESTATISTICAS')
  
  // ✅ ABA INFO: Instruções (mesmo padrão)
  const info = [
    ['📊 SUPERLIGA 2025 - ESTATÍSTICAS DOS JOGOS RESTANTES'],
    [''],
    ['Fim de Semana:', fimDeSemana],
    ['Data dos Jogos:', dataJogo],
    ['Total de Estatísticas:', estatisticas.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    ['Status:', 'PRONTO PARA IMPORTAÇÃO'],
    ['Tipo:', 'JOGOS RESTANTES DA TEMPORADA REGULAR'],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Acesse o sistema admin: /admin/importar'],
    ['2. Vá na aba "Estatísticas"'],
    ['3. Faça upload deste arquivo'],
    ['4. Aguarde o processamento (pode demorar alguns minutos)'],
    ['5. As estatísticas aparecerão nos perfis dos jogadores'],
    [''],
    ['⚠️ IMPORTANTE:'],
    ['- Importe APÓS importar os resultados correspondentes'],
    ['- Aguarde a conclusão completa do processamento'],
    ['- Verifique se as estatísticas foram consolidadas'],
    ['- Estes são os dados dos ÚLTIMOS 20 JOGOS da temporada'],
    [''],
    ['🎯 ORDEM DE IMPORTAÇÃO:'],
    ['1º. Importe os RESULTADOS do fim de semana'],
    ['2º. Aguarde alguns minutos'],
    ['3º. Importe as ESTATÍSTICAS desta planilha'],
    ['4º. Repita para o próximo fim de semana']
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // ✅ CRIAR NOME DO ARQUIVO
  const dataFormatada = dataJogo.replace(/-/g, '')
  const nomeArquivo = `estatisticas_jogos_restantes_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_${dataFormatada}.xlsx`
  
  // ✅ GARANTIR QUE A PASTA EXISTE
  const pastaDestino = 'planilhas-estatisticas-jogos-restantes'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  // ✅ SALVAR ARQUIVO
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

// ✅ GERAR TODAS AS PLANILHAS DE ESTATÍSTICAS DOS JOGOS RESTANTES
async function gerarTodasAsPlanilhasEstatisticasJogosRestantes(): Promise<void> {
  console.log('🚀 INICIANDO GERAÇÃO DE PLANILHAS DE ESTATÍSTICAS DOS JOGOS RESTANTES\n')
  
  try {
    const { jogosPorFimDeSemana, jogadores } = await buscarDadosParaEstatisticasJogosRestantes()
    
    const arquivosGerados: string[] = []
    let totalEstatisticas = 0
    
    // Gerar planilha para cada fim de semana
    let fimDeSemanaNumero = 1
    for (const [chave, jogos] of jogosPorFimDeSemana) {
      console.log(`\n📊 Processando ${chave}...`)
      
      // Gerar estatísticas
      const estatisticas = await gerarEstatisticasFimDeSemana(fimDeSemanaNumero, jogos, jogadores)
      
      // Data do primeiro jogo do fim de semana
      const dataJogo = jogos[0] ? new Date(jogos[0].dataJogo).toISOString().split('T')[0] : '2025-07-06'
      
      // Criar planilha
      const caminhoArquivo = await criarPlanilhaEstatisticas(fimDeSemanaNumero, estatisticas, dataJogo)
      
      if (caminhoArquivo) {
        arquivosGerados.push(caminhoArquivo)
        totalEstatisticas += estatisticas.length
        console.log(`✅ Planilha criada: ${caminhoArquivo}`)
      }
      
      fimDeSemanaNumero++
    }
    
    // ✅ RELATÓRIO FINAL
    console.log('\n🎉 GERAÇÃO DE ESTATÍSTICAS DOS JOGOS RESTANTES COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log(`📊 Total de estatísticas geradas: ${totalEstatisticas.toLocaleString()}`)
    console.log(`🎮 Total de fins de semana: ${jogosPorFimDeSemana.size}`)
    console.log(`👥 Total de jogadores disponíveis: ${jogadores.length}`)
    
    console.log('\n📋 ARQUIVOS DE ESTATÍSTICAS DOS JOGOS RESTANTES GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${arquivo}`)
    })
    
    console.log('\n📖 FLUXO DE IMPORTAÇÃO RECOMENDADO:')
    console.log('1. DIA DO JOGO: Importe a planilha de RESULTADOS')
    console.log('2. 1 DIA APÓS: Importe a planilha de ESTATÍSTICAS correspondente')
    console.log('3. Sistema admin: /admin/importar > aba "Estatísticas"')
    console.log('4. Repita para cada fim de semana na ordem sequencial')
    console.log('5. As estatísticas aparecerão automaticamente nos perfis dos jogadores')
    console.log('6. Após todos os jogos: Os playoffs devem ser gerados automaticamente')
    console.log('')
    console.log('✅ PROCESSO COMPLETO DOS JOGOS RESTANTES: Resultados + Estatísticas prontas!')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// ✅ GERAR APENAS UM FIM DE SEMANA ESPECÍFICO
async function gerarEstatisticasFimDeSemanaEspecifico(numero: number): Promise<void> {
  console.log(`🎯 Gerando ESTATÍSTICAS apenas do Fim de Semana ${numero} dos jogos restantes...`)
  
  try {
    const { jogosPorFimDeSemana, jogadores } = await buscarDadosParaEstatisticasJogosRestantes()
    
    // Converter o mapa para array e pegar o fim de semana específico
    const finsArray = Array.from(jogosPorFimDeSemana.entries())
    if (numero < 1 || numero > finsArray.length) {
      throw new Error(`Fim de semana ${numero} não encontrado. Disponíveis: 1-${finsArray.length}`)
    }
    
    const [chave, jogos] = finsArray[numero - 1]
    
    const estatisticas = await gerarEstatisticasFimDeSemana(numero, jogos, jogadores)
    const dataJogo = jogos[0] ? new Date(jogos[0].dataJogo).toISOString().split('T')[0] : '2025-07-06'
    const caminhoArquivo = await criarPlanilhaEstatisticas(numero, estatisticas, dataJogo)
    
    console.log(`✅ Planilha de estatísticas criada: ${caminhoArquivo}`)
    console.log(`📊 Total de estatísticas geradas: ${estatisticas.length}`)
    
  } catch (error) {
    console.error('❌ Erro:', error)
    throw error
  }
}

// ✅ FUNÇÃO PRINCIPAL
async function main() {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('📖 USO DO SCRIPT DE ESTATÍSTICAS DOS JOGOS RESTANTES:')
      console.log('')
      console.log('npm run generate:estatisticas-jogos-restantes              # Gerar todos os fins de semana')
      console.log('npm run generate:estatisticas-jogos-restantes --fs=N       # Gerar apenas fim de semana N')
      console.log('npm run generate:estatisticas-jogos-restantes --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:estatisticas-jogos-restantes --fs=1       # Apenas Fim de Semana 1')
      console.log('npm run generate:estatisticas-jogos-restantes --fs=4       # Apenas Fim de Semana 4')
      console.log('')
      console.log('⚠️ IMPORTANTE: Execute APÓS gerar e importar os resultados!')
      console.log('⚠️ Use: npm run generate:resultados-jogos-restantes primeiro')
      console.log('⚠️ Estes são os dados dos 20 ÚLTIMOS jogos da temporada regular')
      return
    }
    
    const fimDeSemanaArg = args.find(arg => arg.startsWith('--fs='))
    
    if (fimDeSemanaArg) {
      const numero = parseInt(fimDeSemanaArg.split('=')[1])
      if (isNaN(numero) || numero < 1) {
        throw new Error('Fim de semana deve ser um número positivo')
      }
      await gerarEstatisticasFimDeSemanaEspecifico(numero)
    } else {
      await gerarTodasAsPlanilhasEstatisticasJogosRestantes()
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

export { gerarTodasAsPlanilhasEstatisticasJogosRestantes, gerarEstatisticasFimDeSemanaEspecifico }