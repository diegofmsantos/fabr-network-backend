import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export async function calcularClassificacaoRegional(campeonatoId: number, regionalType: string) {
  const timesRegional = await buscarTimesPorRegional(campeonatoId, regionalType);

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

  const estatisticas = new Map<number, {
    jogos: number;
    vitorias: number;
    derrotas: number;
    pontosPro: number;
    pontosContra: number;
  }>();

  timesRegional.forEach(time => {
    estatisticas.set(time.timeId, {
      jogos: 0,
      vitorias: 0,
      derrotas: 0,
      pontosPro: 0,
      pontosContra: 0
    });
  });

  jogos.forEach(jogo => {
    const placarCasa = jogo.placarCasa || 0;
    const placarVisitante = jogo.placarVisitante || 0;

    if (jogo.timeCasaId && timeIds.includes(jogo.timeCasaId)) {
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

    if (jogo.timeVisitanteId && timeIds.includes(jogo.timeVisitanteId)) {
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

export async function calcularClassificacaoPorConferencia(campeonatoId: number) {
  const resultado: Record<string, any[]> = {};

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

    resultado[conferencia.tipo] = regionaisClassificacao;
  }

  console.log('✅ Resultado final calcularClassificacaoPorConferencia:', Object.keys(resultado))

  return resultado;
}

