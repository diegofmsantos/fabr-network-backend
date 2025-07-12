// src/utils/distribuicaoUtils.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


export async function buscarDistribuicaoCompleta(campeonatoId: number) {
  const distribuicao = await prisma.distribuicaoTime.findMany({
    where: { campeonatoId },
    include: {
      time: true,
      conferencia: true,
      regional: true
    }
  });

  return distribuicao.map(d => ({
    timeId: d.timeId,
    timeNome: d.time.nome,
    timeSigla: d.time.sigla,
    conferencia: d.conferencia.nome,
    conferenciaType: d.conferenciaType,
    regional: d.regional.nome,
    regionalType: d.regionalType
  }));
}

/**
 * Busca times de uma conferência específica
 */
export async function buscarTimesPorConferencia(campeonatoId: number, conferenciaType: string) {
  const distribuicao = await prisma.distribuicaoTime.findMany({
    where: {
      campeonatoId,
      conferenciaType
    },
    include: {
      time: true,
      conferencia: true,
      regional: true
    }
  });

  return distribuicao.map(d => ({
    timeId: d.timeId,
    timeNome: d.time.nome,
    timeSigla: d.time.sigla,
    conferencia: d.conferencia.nome,
    conferenciaType: d.conferenciaType,
    regional: d.regional.nome,
    regionalType: d.regionalType
  }));
}

/**
 * Busca times de um regional específico
 */
export async function buscarTimesPorRegional(campeonatoId: number, regionalType: string) {
  const distribuicao = await prisma.distribuicaoTime.findMany({
    where: {
      campeonatoId,
      regionalType
    },
    include: {
      time: true,
      conferencia: true,
      regional: true
    }
  });

  return distribuicao.map(d => ({
    timeId: d.timeId,
    timeNome: d.time.nome,
    timeSigla: d.time.sigla,
    conferencia: d.conferencia.nome,
    conferenciaType: d.conferenciaType,
    regional: d.regional.nome,
    regionalType: d.regionalType
  }));
}

/**
 * Calcula classificação de um regional específico
 */
export async function calcularClassificacaoRegional(campeonatoId: number, regionalType: string) {
  // 1. Buscar times do regional
  const timesRegional = await buscarTimesPorRegional(campeonatoId, regionalType);

  // 2. Buscar jogos finalizados envolvendo estes times
  const timeIds = timesRegional.map(t => t.timeId);

  const jogos = await prisma.jogo.findMany({
    where: {
      campeonatoId,
      status: 'FINALIZADO',
      OR: [
        { timeCasaId: { in: timeIds } },
        { timeVisitanteId: { in: timeIds } }
      ]
    },
    include: {
      timeCasa: true,
      timeVisitante: true
    }
  });

  // 3. Calcular estatísticas por time
  const estatisticas = new Map<number, {
    jogos: number;
    vitorias: number;
    derrotas: number;
    pontosPro: number;
    pontosContra: number;
  }>();

  // Inicializar estatísticas
  timesRegional.forEach(time => {
    estatisticas.set(time.timeId, {
      jogos: 0,
      vitorias: 0,
      derrotas: 0,
      pontosPro: 0,
      pontosContra: 0
    });
  });

  // Processar jogos
  jogos.forEach(jogo => {
    const placarCasa = jogo.placarCasa || 0;
    const placarVisitante = jogo.placarVisitante || 0;

    // Processar time da casa se estiver no regional
    if (timeIds.includes(jogo.timeCasaId)) {
      const stats = estatisticas.get(jogo.timeCasaId)!;
      stats.jogos++;
      stats.pontosPro += placarCasa;
      stats.pontosContra += placarVisitante;

      if (placarCasa > placarVisitante) {
        stats.vitorias++;
      } else {
        stats.derrotas++;
      }
    }

    // Processar time visitante se estiver no regional
    if (timeIds.includes(jogo.timeVisitanteId)) {
      const stats = estatisticas.get(jogo.timeVisitanteId)!;
      stats.jogos++;
      stats.pontosPro += placarVisitante;
      stats.pontosContra += placarCasa;

      if (placarVisitante > placarCasa) {
        stats.vitorias++;
      } else {
        stats.derrotas++;
      }
    }
  });

  // 4. Criar classificação
  const classificacao = timesRegional.map(time => {
    const stats = estatisticas.get(time.timeId)!;
    const saldo = stats.pontosPro - stats.pontosContra;
    const percentualVitorias = stats.jogos > 0 ? (stats.vitorias / stats.jogos) * 100 : 0;

    return {
      timeId: time.timeId,
      time: {
        id: time.timeId,
        nome: time.timeNome,
        sigla: time.timeSigla,
        logo: ''
      },
      posicaoRegional: 0,
      jogos: stats.jogos,
      vitorias: stats.vitorias,
      derrotas: stats.derrotas,
      pontosPro: stats.pontosPro,
      pontosContra: stats.pontosContra,
      saldo,
      percentualVitorias,
      regional: time.regional,
      regionalType: time.regionalType
    };
  });

  // 5. Ordenar e definir posições
  classificacao.sort((a, b) => {
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    return b.pontosPro - a.pontosPro;
  });

  classificacao.forEach((time, index) => {
    time.posicaoRegional = index + 1;
  });

  return classificacao;
}

/**
 * Calcula classificação completa por conferência
 */
export async function calcularClassificacaoPorConferencia(campeonatoId: number) {
  const resultado: Record<string, any[]> = {};

  // Buscar todas as conferências e regionais
  const conferencias = await prisma.conferencia.findMany({
    where: { campeonatoId },
    include: {
      regionais: true
    }
  });

  console.log('🔍 DEBUG: Conferências encontradas:', conferencias.map(c => ({ id: c.id, tipo: c.tipo, nome: c.nome })))

  for (const conferencia of conferencias) {
    const regionaisClassificacao = [];

    console.log(`🔍 Processando conferência: ${conferencia.tipo}`)

    for (const regional of conferencia.regionais) {
      console.log(`  🔍 Processando regional: ${regional.tipo}`)

      const classificacao = await calcularClassificacaoRegional(campeonatoId, regional.tipo);

      console.log(`  ✅ Regional ${regional.tipo}: ${classificacao.length} times`)

      regionaisClassificacao.push({
        regionalId: regional.id,
        regionalNome: regional.nome,
        regionalType: regional.tipo,
        times: classificacao
      });
    }

    // ✅ USAR SEMPRE A NOMENCLATURA DO BANCO
    resultado[conferencia.tipo] = regionaisClassificacao;
  }

  console.log('✅ Resultado final calcularClassificacaoPorConferencia:', Object.keys(resultado))

  return resultado;
}

/**
 * Busca informações de distribuição de um time específico
 */
export async function buscarDistribuicaoTime(campeonatoId: number, timeId: number) {
  const distribuicao = await prisma.distribuicaoTime.findFirst({
    where: {
      campeonatoId,
      timeId
    },
    include: {
      time: true,
      conferencia: true,
      regional: true
    }
  });

  if (!distribuicao) return null;

  return {
    timeId: distribuicao.timeId,
    timeNome: distribuicao.time.nome,
    timeSigla: distribuicao.time.sigla,
    conferencia: distribuicao.conferencia.nome,
    conferenciaType: distribuicao.conferenciaType,
    regional: distribuicao.regional.nome,
    regionalType: distribuicao.regionalType
  };
}

/**
 * Valida se a distribuição está completa e correta
 */
export async function validarDistribuicao(campeonatoId: number) {
  const errors: string[] = [];

  // Buscar distribuição completa
  const distribuicao = await buscarDistribuicaoCompleta(campeonatoId);

  // ✅ CORRIGIDO: Tipagem explícita para evitar erro 7053
  const timesPorConferencia: Record<string, number> = {};
  distribuicao.forEach(d => {
    timesPorConferencia[d.conferenciaType] = (timesPorConferencia[d.conferenciaType] || 0) + 1;
  });

  // Validações baseadas no briefing
  const expectedDistribution = {
    'SUDESTE': 12,
    'SUL': 8,
    'NORDESTE': 6,
    'CENTRO NORTE': 6
  };

  Object.entries(expectedDistribution).forEach(([conf, expectedCount]) => {
    const actualCount = timesPorConferencia[conf] || 0;
    if (actualCount !== expectedCount) {
      errors.push(`Conferência ${conf}: esperado ${expectedCount} times, encontrado ${actualCount}`);
    }
  });

  // Verificar total
  const totalExpected = Object.values(expectedDistribution).reduce((a, b) => a + b, 0);
  if (distribuicao.length !== totalExpected) {
    errors.push(`Total de times: esperado ${totalExpected}, encontrado ${distribuicao.length}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    summary: {
      totalTimes: distribuicao.length,
      timesPorConferencia
    }
  };
}

/**
 * Helper para obter times classificados para playoffs
 */
export async function obterTimesClassificadosPlayoffs(campeonatoId: number) {
  const classificacao = await calcularClassificacaoPorConferencia(campeonatoId);

  // Processar Sudeste (3 regionais)
  const sudeste = classificacao['SUDESTE'] || [];
  const primeirosSudeste = sudeste.map(r => r.times[0]).filter(Boolean);
  const segundosSudeste = sudeste.map(r => r.times[1]).filter(Boolean);

  // Processar Sul (2 regionais)
  const sul = classificacao['SUL'] || [];
  const primeirosSul = sul.map(r => r.times[0]).filter(Boolean);
  const segundosSul = sul.map(r => r.times[1]).filter(Boolean);

  // Processar Nordeste (1 regional, 6 times)
  const nordeste = classificacao['NORDESTE']?.[0]?.times || [];

  // Processar Centro-Norte (2 regionais)
  const centroNorte = classificacao['CENTRO NORTE'] || [];
  const timesCentroNorte = centroNorte.flatMap(r => r.times.slice(0, 2));

  return {
    sudeste: {
      primeiros: primeirosSudeste,
      segundos: segundosSudeste
    },
    sul: {
      primeiros: primeirosSul,
      segundos: segundosSul
    },
    nordeste,
    centroNorte: timesCentroNorte
  };
}

/**
 * Verifica se um time está em determinado regional (usado em outras funções)
 */
export async function verificarTimeNoRegional(campeonatoId: number, timeId: number, regionalType: string): Promise<boolean> {
  const distribuicao = await prisma.distribuicaoTime.findFirst({
    where: {
      campeonatoId,
      timeId,
      regionalType
    }
  });

  return !!distribuicao;
}

/**
 * Busca estatísticas consolidadas da distribuição
 */
export async function obterEstatisticasDistribuicao(campeonatoId: number) {
  const distribuicao = await buscarDistribuicaoCompleta(campeonatoId);

  const estatisticas = {
    totalTimes: distribuicao.length,
    timesPorConferencia: {} as Record<string, number>,
    timesPorRegional: {} as Record<string, number>,
    conferencias: new Set<string>(),
    regionais: new Set<string>()
  };

  distribuicao.forEach(d => {
    // Contar por conferência
    estatisticas.timesPorConferencia[d.conferenciaType] =
      (estatisticas.timesPorConferencia[d.conferenciaType] || 0) + 1;

    // Contar por regional
    estatisticas.timesPorRegional[d.regionalType] =
      (estatisticas.timesPorRegional[d.regionalType] || 0) + 1;

    // Adicionar aos sets
    estatisticas.conferencias.add(d.conferenciaType);
    estatisticas.regionais.add(d.regionalType);
  });

  return {
    ...estatisticas,
    totalConferencias: estatisticas.conferencias.size,
    totalRegionais: estatisticas.regionais.size
  };
}

/**
 * Busca times disponíveis para distribuição (ainda não distribuídos)
 */
export async function buscarTimesDisponiveis(campeonatoId: number, temporada: string) {
  // Buscar todos os times da temporada
  const todosTimes = await prisma.time.findMany({
    where: { temporada }
  });

  // Buscar times já distribuídos
  const timesDistribuidos = await prisma.distribuicaoTime.findMany({
    where: { campeonatoId },
    select: { timeId: true }
  });

  const idsDistribuidos = timesDistribuidos.map(d => d.timeId);

  // Filtrar times ainda não distribuídos
  return todosTimes.filter(time => !idsDistribuidos.includes(time.id));
}

export default {
  buscarDistribuicaoCompleta,
  buscarTimesPorConferencia,
  buscarTimesPorRegional,
  calcularClassificacaoRegional,
  calcularClassificacaoPorConferencia,
  buscarDistribuicaoTime,
  validarDistribuicao,
  obterTimesClassificadosPlayoffs,
  verificarTimeNoRegional,
  obterEstatisticasDistribuicao,
  buscarTimesDisponiveis
};