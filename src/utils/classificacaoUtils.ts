export interface JogoResultado {
  timeCasaId: number | null
  timeVisitanteId: number | null
  placarCasa: number | null
  placarVisitante: number | null
}

export interface TimeClassificavel {
  timeId: number
  vitorias: number
  saldo: number
  pontosPro: number
}

interface Contexto {
  jogos: { vencedorId: number | null; timeAId: number; timeBId: number }[]
  vitoriasPorTime: Map<number, number>
  vencidosPorTime: Map<number, number[]>
}

type Criterio = (grupo: TimeClassificavel[], ctx: Contexto) => Map<number, number> | null

// Confronto direto: só vale quando todos os times empatados se enfrentaram
// entre si. Sem isso não há como comparar (ex: Galo x Ocelots nunca jogaram).
const confrontoDireto: Criterio = (grupo, ctx) => {
  const ids = new Set(grupo.map(t => t.timeId))
  const vitorias = new Map<number, number>()
  const partidas = new Map<number, number>()
  const paresJogados = new Set<string>()

  for (const jogo of ctx.jogos) {
    if (!ids.has(jogo.timeAId) || !ids.has(jogo.timeBId)) continue
    paresJogados.add([jogo.timeAId, jogo.timeBId].sort((a, b) => a - b).join('-'))
    partidas.set(jogo.timeAId, (partidas.get(jogo.timeAId) ?? 0) + 1)
    partidas.set(jogo.timeBId, (partidas.get(jogo.timeBId) ?? 0) + 1)
    if (jogo.vencedorId !== null) {
      vitorias.set(jogo.vencedorId, (vitorias.get(jogo.vencedorId) ?? 0) + 1)
    }
  }

  const totalPares = (grupo.length * (grupo.length - 1)) / 2
  if (paresJogados.size < totalPares) return null

  return new Map(grupo.map(t => [t.timeId, (vitorias.get(t.timeId) ?? 0) / (partidas.get(t.timeId) ?? 1)]))
}

// Força de vitória: soma das vitórias dos times que o time derrotou.
const forcaDeVitoria: Criterio = (grupo, ctx) =>
  new Map(
    grupo.map(t => [
      t.timeId,
      (ctx.vencidosPorTime.get(t.timeId) ?? []).reduce((soma, vencidoId) => soma + (ctx.vitoriasPorTime.get(vencidoId) ?? 0), 0)
    ])
  )

const CRITERIOS: Criterio[] = [
  grupo => new Map(grupo.map(t => [t.timeId, t.vitorias])),
  confrontoDireto,
  forcaDeVitoria,
  grupo => new Map(grupo.map(t => [t.timeId, t.saldo])),
  grupo => new Map(grupo.map(t => [t.timeId, t.pontosPro]))
]

function ordenarGrupo<T extends TimeClassificavel>(grupo: T[], ctx: Contexto): T[] {
  if (grupo.length <= 1) return grupo

  for (const criterio of CRITERIOS) {
    const chaves = criterio(grupo, ctx)
    if (!chaves) continue

    const faixas = new Map<number, T[]>()
    for (const time of grupo) {
      const chave = chaves.get(time.timeId) ?? 0
      const faixa = faixas.get(chave)
      if (faixa) faixa.push(time)
      else faixas.set(chave, [time])
    }

    if (faixas.size === 1) continue

    // Quem ainda continua empatado dentro da faixa recomeça a cascata só entre si
    return [...faixas.keys()].sort((a, b) => b - a).flatMap(chave => ordenarGrupo(faixas.get(chave)!, ctx))
  }

  return grupo
}

export function ordenarClassificacao<T extends TimeClassificavel>(times: T[], jogos: JogoResultado[]): T[] {
  const ctx: Contexto = { jogos: [], vitoriasPorTime: new Map(), vencidosPorTime: new Map() }

  for (const jogo of jogos) {
    if (jogo.timeCasaId === null || jogo.timeVisitanteId === null) continue

    const placarCasa = jogo.placarCasa ?? 0
    const placarVisitante = jogo.placarVisitante ?? 0
    const vencedorId =
      placarCasa > placarVisitante ? jogo.timeCasaId : placarVisitante > placarCasa ? jogo.timeVisitanteId : null
    const perdedorId = vencedorId === jogo.timeCasaId ? jogo.timeVisitanteId : jogo.timeCasaId

    ctx.jogos.push({ vencedorId, timeAId: jogo.timeCasaId, timeBId: jogo.timeVisitanteId })

    if (vencedorId !== null) {
      ctx.vitoriasPorTime.set(vencedorId, (ctx.vitoriasPorTime.get(vencedorId) ?? 0) + 1)
      const vencidos = ctx.vencidosPorTime.get(vencedorId)
      if (vencidos) vencidos.push(perdedorId)
      else ctx.vencidosPorTime.set(vencedorId, [perdedorId])
    }
  }

  return ordenarGrupo(times, ctx)
}
