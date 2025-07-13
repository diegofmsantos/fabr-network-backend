// scripts/gerar-resultados-jogos-restantes.ts
// Script para gerar planilhas de RESULTADOS dos 20 jogos RESTANTES da temporada regular (jogos 65-84)
// Seguindo EXATAMENTE o padrão de gerar-resultados-por-fim-de-semana.ts

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

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

// ✅ GERAÇÃO DE PLACARES REALISTAS (mesmo padrão)
function gerarPlacarRealista(): { mandante: number; visitante: number } {
  const pontosComuns = [0, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42, 45, 48]
  
  const mandante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  let visitante = pontosComuns[Math.floor(Math.random() * pontosComuns.length)]
  
  // Evitar empates em 90% dos casos
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

// ✅ BUSCAR APENAS OS 20 JOGOS RESTANTES AGRUPADOS POR FIM DE SEMANA
async function buscarJogosRestantesAgrupados(): Promise<Map<number, any[]>> {
  console.log('🔍 Buscando os 20 jogos RESTANTES da temporada regular...')
  
  const superliga = await prisma.campeonato.findFirst({
    where: {
      temporada: '2025',
      isSuperliga: true
    }
  })

  if (!superliga) {
    throw new Error('❌ Superliga 2025 não encontrada no banco de dados')
  }

  console.log(`✅ Superliga encontrada: ID ${superliga.id}`)

  // Buscar TODOS os jogos da agenda ordenados por data
  const todosJogos = await prisma.jogo.findMany({
    where: {
      campeonatoId: superliga.id,
      fase: 'TEMPORADA REGULAR'
    },
    include: {
      timeCasa: { 
        select: { nome: true, sigla: true, estadio: true, cidade: true } 
      },
      timeVisitante: { 
        select: { nome: true, sigla: true } 
      }
    },
    orderBy: [
      { dataJogo: 'asc' },
      { id: 'asc' }
    ]
  })

  console.log(`📋 Total de jogos da temporada regular: ${todosJogos.length}`)

  if (todosJogos.length === 0) {
    throw new Error('❌ Nenhum jogo encontrado na agenda. Importe a agenda primeiro!')
  }

  // ✅ PEGAR APENAS OS 20 ÚLTIMOS JOGOS (jogos 65-84)
  // Se temos 84 jogos total, os últimos 20 são do índice 64 até 83 (84 jogos)
  const jogosRestantes = todosJogos.slice(-20) // Últimos 20 jogos

  console.log(`🎯 Jogos restantes encontrados: ${jogosRestantes.length}`)
  console.log(`📅 Data do primeiro jogo restante: ${new Date(jogosRestantes[0]?.dataJogo).toLocaleDateString('pt-BR')}`)
  console.log(`📅 Data do último jogo restante: ${new Date(jogosRestantes[jogosRestantes.length - 1]?.dataJogo).toLocaleDateString('pt-BR')}`)

  if (jogosRestantes.length === 0) {
    throw new Error('❌ Nenhum jogo restante encontrado. Todos os jogos já foram processados.')
  }

  // ✅ AGRUPAR JOGOS RESTANTES POR FIM DE SEMANA (mesma lógica do script original)
  const jogosPorFimDeSemana = new Map<number, any[]>()
  let fimDeSemanaAtual = 1
  let dataAnterior: Date | null = null

  jogosRestantes.forEach((jogo) => {
    const dataJogo = new Date(jogo.dataJogo)
    
    // Se mudou a data, verificar se é um novo fim de semana
    if (dataAnterior) {
      const diferencaDias = Math.abs(dataJogo.getTime() - dataAnterior.getTime()) / (1000 * 60 * 60 * 24)
      
      // ✅ NOVO FIM DE SEMANA APENAS SE DIFERENÇA > 3 DIAS
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

  // Log da distribuição
  console.log('\n📊 DISTRIBUIÇÃO DOS JOGOS RESTANTES POR FIM DE SEMANA:')
  jogosPorFimDeSemana.forEach((jogos, fimDeSemana) => {
    const datasJogos = [...new Set(jogos.map(j => new Date(j.dataJogo).toLocaleDateString('pt-BR')))]
    console.log(`   Fim de Semana ${String(fimDeSemana).padStart(2, '0')}: ${jogos.length} jogos (${datasJogos.join(', ')})`)
  })

  console.log(`\n🎯 Total de fins de semana dos jogos restantes: ${jogosPorFimDeSemana.size}`)

  return jogosPorFimDeSemana
}

// ✅ GERAR RESULTADOS FAKE PARA UM FIM DE SEMANA (mesmo padrão)
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
      fase: jogo.fase || 'TEMPORADA REGULAR',
      conferencia: jogo.conferencia || 'N/A',
      estadio: jogo.local || jogo.timeCasa.estadio || `Estádio ${jogo.timeCasa.cidade}`,
      status: 'FINALIZADO'
    }

    resultados.push(resultado)
    
    console.log(`   🏈 ${jogo.timeCasa.sigla} ${placar.mandante} x ${placar.visitante} ${jogo.timeVisitante.sigla}`)
  }

  return resultados
}

// ✅ CRIAR PLANILHA DE RESULTADOS PARA UM FIM DE SEMANA (mesmo padrão)
async function criarPlanilhaResultados(fimDeSemana: number, resultados: JogoResultado[]): Promise<string> {
  if (resultados.length === 0) {
    console.log(`⏭️  Pulando Fim de Semana ${fimDeSemana} - sem jogos`)
    return ''
  }

  const workbook = XLSX.utils.book_new()
  
  // ✅ ABA PRINCIPAL: RESULTADOS
  const worksheet = XLSX.utils.json_to_sheet(resultados)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RESULTADOS')
  
  // ✅ ABA INFO: Instruções de importação (mesmo padrão)
  const dataJogo = resultados[0]?.data_jogo || 'N/A'
  const info = [
    ['📋 SUPERLIGA 2025 - RESULTADOS DOS JOGOS RESTANTES'],
    [''],
    ['Fim de Semana:', fimDeSemana],
    ['Data dos Jogos:', dataJogo],
    ['Total de Jogos:', resultados.length],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    ['Status:', 'RESULTADOS FINAIS'],
    ['Tipo:', 'JOGOS RESTANTES DA TEMPORADA REGULAR'],
    [''],
    ['📖 INSTRUÇÕES DE IMPORTAÇÃO:'],
    ['1. Acesse o sistema admin: /admin/importar'],
    ['2. Vá na aba "Resultados"'],
    ['3. Faça upload deste arquivo'],
    ['4. Aguarde o processamento completo'],
    ['5. Verifique se os playoffs foram gerados automaticamente (se aplicável)'],
    [''],
    ['⚠️ IMPORTANTE:'],
    ['- Importe sempre na ordem sequencial dos fins de semana'],
    ['- Aguarde a conclusão antes de importar o próximo'],
    ['- A planilha de ESTATÍSTICAS deve ser importada 1 dia após'],
    ['- Estes são os ÚLTIMOS 20 JOGOS da temporada regular'],
    [''],
    ['🎯 PRÓXIMO PASSO:'],
    ['Após importar esta planilha, aguarde 1 dia e importe:'],
    [`estatisticas_jogos_restantes_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_${dataJogo.replace(/-/g, '')}.xlsx`]
  ]
  
  const infoWorksheet = XLSX.utils.aoa_to_sheet(info)
  XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'INFO')
  
  // ✅ CRIAR NOME DO ARQUIVO
  const dataFormatada = dataJogo.replace(/-/g, '')
  const nomeArquivo = `resultados_jogos_restantes_fim_de_semana_${String(fimDeSemana).padStart(2, '0')}_${dataFormatada}.xlsx`
  
  // ✅ GARANTIR QUE A PASTA EXISTE
  const pastaDestino = 'planilhas-resultados-jogos-restantes'
  if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true })
  }
  
  const caminhoCompleto = path.join(pastaDestino, nomeArquivo)
  
  // ✅ SALVAR ARQUIVO
  XLSX.writeFile(workbook, caminhoCompleto)
  
  return caminhoCompleto
}

// ✅ GERAR TODAS AS PLANILHAS DE RESULTADOS DOS JOGOS RESTANTES
async function gerarTodasAsPlanilhasResultadosJogosRestantes(): Promise<void> {
  console.log('🚀 INICIANDO GERAÇÃO DE PLANILHAS DOS 20 JOGOS RESTANTES\n')
  
  try {
    // Buscar jogos restantes agrupados por fim de semana
    const jogosPorFimDeSemana = await buscarJogosRestantesAgrupados()
    
    const arquivosGerados: string[] = []
    
    // Gerar planilha para cada fim de semana
    for (const [fimDeSemana, jogos] of jogosPorFimDeSemana) {
      console.log(`\n🗓️ Processando Fim de Semana ${fimDeSemana}...`)
      
      // Gerar resultados fake
      const resultados = await gerarResultadosFimDeSemana(fimDeSemana, jogos)
      
      // Criar planilha
      const caminhoArquivo = await criarPlanilhaResultados(fimDeSemana, resultados)
      
      if (caminhoArquivo) {
        arquivosGerados.push(caminhoArquivo)
        console.log(`✅ Planilha criada: ${caminhoArquivo}`)
      }
    }
    
    // ✅ RELATÓRIO FINAL
    console.log('\n🎉 GERAÇÃO DE RESULTADOS DOS JOGOS RESTANTES COMPLETA!')
    console.log(`📁 Total de planilhas geradas: ${arquivosGerados.length}`)
    console.log(`📊 Total de fins de semana: ${jogosPorFimDeSemana.size}`)
    
    console.log('\n📋 ARQUIVOS DE RESULTADOS DOS JOGOS RESTANTES GERADOS:')
    arquivosGerados.forEach((arquivo, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${arquivo}`)
    })
    
    console.log('\n📖 FLUXO DE IMPORTAÇÃO:')
    console.log('1. Importe as planilhas de RESULTADOS na ordem sequencial')
    console.log('2. Sistema admin: /admin/importar > aba "Resultados"')
    console.log('3. 1 dia após cada jogo, importe a planilha de ESTATÍSTICAS correspondente')
    console.log('4. O sistema deve gerar playoffs automaticamente após todos os jogos')
    console.log('')
    console.log('🔜 PRÓXIMO PASSO: Execute o script de gerar estatísticas dos jogos restantes')
    console.log('npm run generate:estatisticas-jogos-restantes')
    
  } catch (error) {
    console.error('❌ Erro na geração:', error)
    throw error
  }
}

// ✅ GERAR APENAS UM FIM DE SEMANA ESPECÍFICO
async function gerarFimDeSemanaEspecifico(numero: number): Promise<void> {
  console.log(`🎯 Gerando RESULTADOS apenas do Fim de Semana ${numero} dos jogos restantes...`)
  
  try {
    const jogosPorFimDeSemana = await buscarJogosRestantesAgrupados()
    const jogos = jogosPorFimDeSemana.get(numero)
    
    if (!jogos || jogos.length === 0) {
      throw new Error(`Fim de semana ${numero} não encontrado ou sem jogos. Disponíveis: 1-${jogosPorFimDeSemana.size}`)
    }
    
    const resultados = await gerarResultadosFimDeSemana(numero, jogos)
    const caminhoArquivo = await criarPlanilhaResultados(numero, resultados)
    
    console.log(`✅ Planilha de resultados criada: ${caminhoArquivo}`)
    
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
      console.log('📖 USO DO SCRIPT DE RESULTADOS DOS JOGOS RESTANTES:')
      console.log('')
      console.log('npm run generate:resultados-jogos-restantes              # Gerar todos os fins de semana')
      console.log('npm run generate:resultados-jogos-restantes --fs=N       # Gerar apenas fim de semana N')
      console.log('npm run generate:resultados-jogos-restantes --help       # Mostrar ajuda')
      console.log('')
      console.log('EXEMPLOS:')
      console.log('npm run generate:resultados-jogos-restantes --fs=1       # Apenas Fim de Semana 1')
      console.log('npm run generate:resultados-jogos-restantes --fs=4       # Apenas Fim de Semana 4')
      console.log('')
      console.log('⚠️ IMPORTANTE: Os primeiros 64 jogos devem ter sido importados!')
      console.log('⚠️ Estes são os 20 ÚLTIMOS jogos da temporada regular')
      return
    }
    
    const fimDeSemanaArg = args.find(arg => arg.startsWith('--fs='))
    
    if (fimDeSemanaArg) {
      const numero = parseInt(fimDeSemanaArg.split('=')[1])
      if (isNaN(numero) || numero < 1) {
        throw new Error('Fim de semana deve ser um número positivo')
      }
      await gerarFimDeSemanaEspecifico(numero)
    } else {
      await gerarTodasAsPlanilhasResultadosJogosRestantes()
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

export { gerarTodasAsPlanilhasResultadosJogosRestantes, gerarFimDeSemanaEspecifico }