import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface EstatisticaJogo {
  jogo_id: number
  jogador_id: number
  jogador_nome: string
  time_nome: string
  posicao: string
  setor: string
  
  passes_completos: number
  passes_tentados: number
  jardas_de_passe: number
  td_passados: number
  interceptacoes_sofridas: number
  sacks_sofridos: number
  fumble_de_passador: number
  
  corridas: number
  jardas_corridas: number
  tds_corridos: number
  fumble_de_corredor: number
  
  recepcoes: number
  alvo: number
  jardas_recebidas: number
  tds_recebidos: number
  
  retornos: number
  jardas_retornadas: number
  td_retornados: number
  
  tackles_totais: number
  tackles_for_loss: number
  sacks_forcado: number
  fumble_forcado: number
  interceptacao_forcada: number
  passe_desviado: number
  safety: number
  td_defensivo: number
  
  xp_bons: number
  tentativas_de_xp: number
  fg_bons: number
  tentativas_de_fg: number
  fg_mais_longo: number
  
  punts: number
  jardas_de_punt: number
}

function gerarEstatisticasPorPosicao(posicao: string, setor: string): EstatisticaJogo {
  const stats: EstatisticaJogo = {
    jogo_id: 0, // será preenchido depois
    jogador_id: 0, // será preenchido depois
    jogador_nome: '', // será preenchido depois
    time_nome: '', // será preenchido depois
    posicao: '', // será preenchido depois
    setor: '', // será preenchido depois
    
    passes_completos: 0,
    passes_tentados: 0,
    jardas_de_passe: 0,
    td_passados: 0,
    interceptacoes_sofridas: 0,
    sacks_sofridos: 0,
    fumble_de_passador: 0,
    
    corridas: 0,
    jardas_corridas: 0,
    tds_corridos: 0,
    fumble_de_corredor: 0,
    
    recepcoes: 0,
    alvo: 0,
    jardas_recebidas: 0,
    tds_recebidos: 0,
    
    retornos: 0,
    jardas_retornadas: 0,
    td_retornados: 0,
    
    tackles_totais: 0,
    tackles_for_loss: 0,
    sacks_forcado: 0,
    fumble_forcado: 0,
    interceptacao_forcada: 0,
    passe_desviado: 0,
    safety: 0,
    td_defensivo: 0,
    
    xp_bons: 0,
    tentativas_de_xp: 0,
    fg_bons: 0,
    tentativas_de_fg: 0,
    fg_mais_longo: 0,
    
    punts: 0,
    jardas_de_punt: 0
  }
  
  if (posicao === 'QB' || setor === 'Ataque' && Math.random() < 0.1) {
    const tentativas = Math.floor(Math.random() * 35) + 10 
    const completos = Math.floor(tentativas * (0.55 + Math.random() * 0.3)) 
    
    stats.passes_tentados = tentativas
    stats.passes_completos = Math.min(completos, tentativas)
    stats.jardas_de_passe = completos * (4 + Math.random() * 12) 
    stats.td_passados = Math.random() < 0.3 ? Math.floor(Math.random() * 4) : 0
    stats.interceptacoes_sofridas = Math.random() < 0.2 ? Math.floor(Math.random() * 3) : 0
    stats.sacks_sofridos = Math.random() < 0.4 ? Math.floor(Math.random() * 4) : 0
  }
  
  // RUNNING BACKS (Ataque)
  if (posicao === 'RB' || (setor === 'Ataque' && Math.random() < 0.2)) {
    const corridas = Math.floor(Math.random() * 20) + 5 // 5-25 corridas
    
    stats.corridas = corridas
    stats.jardas_corridas = corridas * (2 + Math.random() * 6) // 2-8 jardas por corrida
    stats.tds_corridos = Math.random() < 0.2 ? Math.floor(Math.random() * 3) : 0
    stats.fumble_de_corredor = Math.random() < 0.1 ? 1 : 0
  }
  
  // RECEIVERS (Ataque)
  if (['WR', 'TE'].includes(posicao) || (setor === 'Ataque' && Math.random() < 0.3)) {
    const alvos = Math.floor(Math.random() * 12) + 2 // 2-14 alvos
    const recepcoes = Math.floor(alvos * (0.4 + Math.random() * 0.4)) // 40-80% aproveitamento
    
    stats.alvo = alvos
    stats.recepcoes = recepcoes
    stats.jardas_recebidas = recepcoes * (5 + Math.random() * 15) // 5-20 jardas por rec
    stats.tds_recebidos = Math.random() < 0.15 ? Math.floor(Math.random() * 3) : 0
  }
  
  // DEFESA
  if (setor === 'Defesa' || ['LB', 'DB', 'DL'].includes(posicao)) {
    stats.tackles_totais = Math.floor(Math.random() * 8) + 1 // 1-9 tackles
    stats.tackles_for_loss = Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0
    stats.sacks_forcado = Math.random() < 0.2 ? Math.floor(Math.random() * 2) + 1 : 0
    stats.fumble_forcado = Math.random() < 0.1 ? 1 : 0
    stats.interceptacao_forcada = Math.random() < 0.1 ? 1 : 0
    stats.passe_desviado = Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0
    stats.td_defensivo = Math.random() < 0.05 ? 1 : 0
  }
  
  // KICKERS
  if (posicao === 'K' || (setor === 'Special' && Math.random() < 0.3)) {
    const tentativas_xp = Math.floor(Math.random() * 6) + 1 // 1-7 XP
    const tentativas_fg = Math.floor(Math.random() * 4) // 0-4 FG
    
    stats.tentativas_de_xp = tentativas_xp
    stats.xp_bons = Math.floor(tentativas_xp * (0.8 + Math.random() * 0.2)) // 80-100%
    stats.tentativas_de_fg = tentativas_fg
    stats.fg_bons = Math.floor(tentativas_fg * (0.6 + Math.random() * 0.3)) // 60-90%
    stats.fg_mais_longo = tentativas_fg > 0 ? Math.floor(Math.random() * 30) + 25 : 0 // 25-55 jardas
  }
  
  // PUNTERS
  if (posicao === 'P' || (setor === 'Special' && Math.random() < 0.2)) {
    const punts = Math.floor(Math.random() * 6) + 1 // 1-7 punts
    
    stats.punts = punts
    stats.jardas_de_punt = punts * (35 + Math.random() * 20) // 35-55 jardas por punt
  }
  
  // RETORNADORES (Special Teams)
  if (setor === 'Special' && Math.random() < 0.4) {
    const retornos = Math.floor(Math.random() * 4) + 1 // 1-5 retornos
    
    stats.retornos = retornos
    stats.jardas_retornadas = retornos * (10 + Math.random() * 25) // 10-35 jardas por retorno
    stats.td_retornados = Math.random() < 0.1 ? 1 : 0
  }
  
  return stats
}

// ✅ BUSCAR JOGADORES E JOGOS AGRUPADOS
async function buscarDadosParaEstatisticas(): Promise<{
  jogosPorFimDeSemana: Map<number, any[]>,
  jogadores: any[]
}> {
  console.log('🔍 Buscando dados para geração de estatísticas...')
  
  const superliga = await prisma.campeonato.findFirst({
    where: {
      temporada: '2025',
      isSuperliga: true
    }
  })

  if (!superliga) {
    throw new Error('❌ Superliga 2025 não encontrada')
  }

  // Buscar jogos agrupados por fim de semana (mesma lógica do script de resultados)
  const jogos = await prisma.jogo.findMany({
    where: {
      campeonatoId: superliga.id
    },
    include: {
      timeCasa: { select: { id: true, nome: true } },
      timeVisitante: { select: { id: true, nome: true } }
    },
    orderBy: [
      { dataJogo: 'asc' },
      { id: 'asc' }
    ]
  })

  // ✅ AGRUPAR POR FIM DE SEMANA (MESMA LÓGICA DOS RESULTADOS)
  const jogosPorFimDeSemana = new Map<number, any[]>()
  let fimDeSemanaAtual = 1
  let dataAnterior: Date | null = null

  jogos.forEach((jogo) => {
    const dataJogo = new Date(jogo.dataJogo)
    
    if (dataAnterior) {
      const diferencaDias = Math.abs(dataJogo.getTime() - dataAnterior.getTime()) / (1000 * 60 * 60 * 24)
      
      // ✅ NOVO FIM DE SEMANA APENAS SE DIFERENÇA > 3 DIAS
      // Agrupa jogos de sábado/domingo/segunda no mesmo fim de semana
      if (diferencaDias > 3) {
        fimDeSemanaAtual++
      }
    }

    if (!jogosPorFimDeSemana.has(fimDeSemanaAtual)) {
      jogosPorFimDeSemana.set(fimDeSemanaAtual, [])
    }

    jogosPorFimDeSemana.get(fimDeSemanaAtual)!.push(jogo)
    dataAnterior = dataJogo
  })

  // Buscar todos os jogadores
  const jogadores = await prisma.jogador.findMany({
    include: {
      times: { 
        include: {
          time: { select: { id: true, nome: true } }
        }
      }
    }
  })

  console.log(`✅ Encontrados ${jogos.length} jogos em ${jogosPorFimDeSemana.size} fins de semana`)
  console.log(`✅ Encontrados ${jogadores.length} jogadores`)

  return { jogosPorFimDeSemana, jogadores }
}

// ✅ GERAR ESTATÍSTICAS PARA UM FIM DE SEMANA
async function gerarEstatisticasFimDeSemana(
  fimDeSemana: number, 
  jogos: any[], 
  jogadores: any[]
): Promise<EstatisticaJogo[]> {
  console.log(`📊 Gerando estatísticas para Fim de Semana ${fimDeSemana} (${jogos.length} jogos)...`)
  
  const estatisticas: EstatisticaJogo[] = []
  
  for (const jogo of jogos) {
    // Jogadores dos dois times que participaram do jogo
    const jogadoresJogo = jogadores.filter(jogador => 
      jogador.times.some((jt: any) => jt.time.id === jogo.timeCasa.id || jt.time.id === jogo.timeVisitante.id)
    )
    
    console.log(`   🏈 ${jogo.timeCasa.nome} vs ${jogo.timeVisitante.nome} - ${jogadoresJogo.length} jogadores`)
    
    // Gerar estatísticas para cada jogador (nem todos jogam)
    for (const jogador of jogadoresJogo) {
      // 60% de chance do jogador ter participado do jogo
      if (Math.random() < 0.6) {
        // ✅ SEMPRE ADICIONAR - TODOS OS JOGADORES TÊM TODAS AS ESTATÍSTICAS
        // Encontrar o time correto do jogador para este jogo
        const jogadorTime = jogador.times.find((jt: any) => 
          jt.time.id === jogo.timeCasa.id || jt.time.id === jogo.timeVisitante.id
        )
        
        const statsGeradas = gerarEstatisticasPorPosicao(jogador.posicao, jogador.setor)
        
        // ✅ PREENCHER APENAS OS CAMPOS QUE NÃO FORAM PREENCHIDOS
        statsGeradas.jogo_id = jogo.id
        statsGeradas.jogador_id = jogador.id
        statsGeradas.jogador_nome = jogador.nome
        statsGeradas.time_nome = jogadorTime?.time.nome || 'Time Desconhecido'
        statsGeradas.posicao = jogador.posicao
        statsGeradas.setor = jogador.setor
        
        estatisticas.push(statsGeradas)
      }
    }
  }
  
  console.log(`   📈 Total de estatísticas geradas: ${estatisticas.length}`)
  return estatisticas
}

// ✅ CRIAR PLANILHA DE ESTATÍSTICAS PARA UM FIM DE SEMANA
async function criarPlanilhaEstatisticas(fimDeSemana: number, estatisticas: EstatisticaJogo[], dataJogo: string): Promise<string> {
  if (estatisticas.length === 0) {
    console.log(`⏭️  Pulando Fim de Semana ${fimDeSemana} - sem estatísticas`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  // ✅ ABA PRINCIPAL: ESTATÍSTICAS
  const worksheet = XLSX.utils.json_to_sheet(estatisticas)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ESTATISTICAS')
  
  // ✅ ABA RESUMO: Estatísticas por jogo
  const resumoPorJogo = new Map<number, { jogo_id: number, total_estatisticas: number, jogadores_participantes: number }>()
  
  estatisticas.forEach(stat => {
    if (!resumoPorJogo.has(stat.jogo_id)) {
      resumoPorJogo.set(stat.jogo_id, {
        jogo_id: stat.jogo_id,
        total_estatisticas: 0,
        jogadores_participantes: 0
      })
    }
    const resumo = resumoPorJogo.get(stat.jogo_id)!
    resumo.total_estatisticas++
    resumo.jogadores_participantes++
  })
  
  const resumoArray = Array.from(resumoPorJogo.values())
  const resumoWorksheet = XLSX.utils.json_to_sheet(resumoArray)
  XLSX.utils.book_append_sheet(workbook, resumoWorksheet, 'RESUMO')
  
  // ✅ ABA INFO: Instruções de importação
  const info = [
    ['📊 SUPERLIGA 2025 - ESTATÍSTICAS DOS JOGOS'],
    [''],
    ['Fim de Semana:', fimDeSemana],
    ['Data dos Jogos:', dataJogo],
    ['Total de Estatísticas:', estatisticas.length],
    ['Jogadores com Estatísticas:', new Set(estatisticas.map(s => s.jogador_id)).size],
    ['Jogos com Estatísticas:', resumoArray.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    ['Status:', 'PLAY-BY-PLAY FINALIZADO'],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Acesse o sistema admin: /admin/importar'],
    ['2. Vá na aba "Estatísticas"'],
    ['3. Faça upload deste arquivo'],
    ['4. Aguarde o processamento completo'],
    ['5. Verifique se as estatísticas aparecem nos perfis dos jogadores'],
    [''],
    ['⚠️ IMPORTANTE:'],
    ['- Importe APENAS após importar a planilha de resultados correspondente'],
    ['- Este arquivo deve ser importado 1 dia após o jogo'],
    ['- Aguarde a conclusão antes de importar o próximo fim de semana'],
    [''],
    ['📋 ESTRUTURA DOS DADOS:'],
    ['- Cada linha = 1 jogador em 1 jogo específico'],
    ['- Estatísticas são agrupadas por categoria (passe, corrida, etc.)'],
    ['- Jogadores sem participação não aparecem na planilha'],
    [''],
    ['🎯 CATEGORIAS DE ESTATÍSTICAS:'],
    ['- Passe: completos, tentados, jardas, TDs, INTs, sacks'],
    ['- Corrida: corridas, jardas, TDs, fumbles'],
    ['- Recepção: recepções, alvos, jardas, TDs'],
    ['- Defesa: tackles, TFL, sacks, fumbles forçados, INTs'],
    ['- Kicker: XPs, FGs, tentativas, mais longo'],
    ['- Punter: punts, jardas, mais longo, dentro de 20'],
    ['- Retorno: retornos, jardas, TDs']
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // ✅ CRIAR NOME DO ARQUIVO
  const dataFormatada = dataJogo.replace(/-/g, '')
  const nomeArquivo = `estatisticas_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_${dataFormatada}.xlsx`
  
  // ✅ GARANTIR QUE A PASTA EXISTE
  const pastaDestino = 'planilhas-estatisticas-fins-de-semana'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  // ✅ SALVAR ARQUIVO
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

// ✅ GERAR TODAS AS PLANILHAS DE ESTATÍSTICAS
async function gerarTodasAsPlanilhasEstatisticas(): Promise<void> {
  console.log('🚀 INICIANDO GERAÇÃO DE PLANILHAS DE ESTATÍSTICAS POR FIM DE SEMANA\n')
  
  try {
    // Buscar dados necessários
    const { jogosPorFimDeSemana, jogadores } = await buscarDadosParaEstatisticas()
    
    const arquivosGerados: string[] = []
    let totalEstatisticas = 0
    
    // Gerar planilha para cada fim de semana
    for (const [fimDeSemana, jogos] of jogosPorFimDeSemana) {
      console.log(`\n📊 Processando Fim de Semana ${fimDeSemana}...`)
      
      // Gerar estatísticas fake
      const estatisticas = await gerarEstatisticasFimDeSemana(fimDeSemana, jogos, jogadores)
      totalEstatisticas += estatisticas.length
      
      // Obter data do primeiro jogo
      const dataJogo = jogos[0] ? new Date(jogos[0].dataJogo).toISOString().split('T')[0] : '2025-07-06'
      
      // Criar planilha
      const caminhoArquivo = await criarPlanilhaEstatisticas(fimDeSemana, estatisticas, dataJogo)
      
      if (caminhoArquivo) {
        arquivosGerados.push(caminhoArquivo)
        console.log(`✅ Planilha criada: ${caminhoArquivo}`)
      }
    }
    
    // ✅ RELATÓRIO FINAL
    console.log('\n🎉 GERAÇÃO DE ESTATÍSTICAS COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log(`📊 Total de estatísticas geradas: ${totalEstatisticas.toLocaleString()}`)
    console.log(`🎮 Total de fins de semana: ${jogosPorFimDeSemana.size}`)
    console.log(`👥 Total de jogadores disponíveis: ${jogadores.length}`)
    
    console.log('\n📋 ARQUIVOS DE ESTATÍSTICAS GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${arquivo}`)
    })
    
    console.log('\n📖 FLUXO DE IMPORTAÇÃO RECOMENDADO:')
    console.log('1. DIA DO JOGO: Importe a planilha de RESULTADOS')
    console.log('2. 1 DIA APÓS: Importe a planilha de ESTATÍSTICAS correspondente')
    console.log('3. Sistema admin: /admin/importar > aba "Estatísticas"')
    console.log('4. Repita para cada fim de semana na ordem sequencial')
    console.log('5. As estatísticas aparecerão automaticamente nos perfis dos jogadores')
    console.log('')
    console.log('✅ PROCESSO COMPLETO: Resultados + Estatísticas prontas!')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// ✅ GERAR APENAS UM FIM DE SEMANA ESPECÍFICO
async function gerarEstatisticasFimDeSemanaEspecifico(numero: number): Promise<void> {
  console.log(`🎯 Gerando ESTATÍSTICAS apenas do Fim de Semana ${numero}...`)
  
  try {
    const { jogosPorFimDeSemana, jogadores } = await buscarDadosParaEstatisticas()
    const jogos = jogosPorFimDeSemana.get(numero)
    
    if (!jogos || jogos.length === 0) {
      throw new Error(`Fim de semana ${numero} não encontrado ou sem jogos. Disponíveis: 1-${jogosPorFimDeSemana.size}`)
    }
    
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

async function main() {
  try {
    const args = process.argv.slice(2)
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('📖 USO DO SCRIPT DE ESTATÍSTICAS:')
      console.log('')
      console.log('npm run generate:estatisticas-fins-de-semana              # Gerar todos os fins de semana')
      console.log('npm run generate:estatisticas-fins-de-semana --fs=N       # Gerar apenas fim de semana N')
      console.log('npm run generate:estatisticas-fins-de-semana --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:estatisticas-fins-de-semana --fs=1       # Apenas Fim de Semana 1')
      console.log('npm run generate:estatisticas-fins-de-semana --fs=17      # Apenas Fim de Semana 17')
      console.log('')
      console.log('⚠️ IMPORTANTE: Execute após gerar os resultados!')
      console.log('⚠️ Use: npm run generate:resultados-fins-de-semana primeiro')
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
      await gerarTodasAsPlanilhasEstatisticas()
    }
    
  } catch (error) {
    console.error('💥 Erro:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main()
}

export { gerarTodasAsPlanilhasEstatisticas, gerarEstatisticasFimDeSemanaEspecifico }