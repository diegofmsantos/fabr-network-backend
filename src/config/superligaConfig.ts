import type { ConferenciaConfig, TipoConferencia, TipoRegional } from '../types'

export const TOTAL_TIMES_SUPERLIGA = 29

export const TIMES_SUPERLIGA: Record<TipoRegional, string[]> = {
  SERRAMAR: [
    'Locomotiva FA',
    'Spartans FA',
    'Flamengo Imperadores',
    'Galo FA',
    'Vasco Almirantes',
    'Guarulhos Rhynos',
    'Ocelots FA',
  ],
  ARAUCARIA: [
    'Coritiba Crocodiles',
    'Londrina Bristlebacks',
    'Curitiba Brown Spiders',
    'Istepôs FA',
  ],
  PAMPA: [
    'Santa Maria Soldiers',
    'Juventude FA',
    'Bravos FA',
    'Timbó Rex',
  ],
  ATLANTICO: [
    'Recife Mariners',
    'Fortaleza Tritões',
    'João Pessoa Espectros',
    'Cavalaria 2 de Julho',
    'Ceará Sabres',
    'Caruaru Wolves',
  ],
  CERRADO: [
    'Rondonópolis Hawks',
    'Cuiabá Arsenal',
    'Tubarões do Cerrado',
    'Goiás FA',
    'Rio Preto Weilers',
  ],
  AMAZONIA: [
    'Porto Velho Miners',
    'Manaus FA',
    'Manaus Cavaliers',
  ],
}

export const SUPERLIGA_CONFIG: ConferenciaConfig[] = [
  {
    tipo: 'SUDESTE',
    nome: 'Conferência Sudeste',
    icone: '🏭',
    totalTimes: 7,
    regionais: [
      { tipo: 'SERRAMAR', nome: 'Regional Serramar', conferencia: 'SUDESTE', timesPorRegional: 7, times: [] },
    ],
    playoffConfig: { semifinalDireta: 2, wildcardVagas: 4, estrutura: 'CONFERENCIA' },
  },
  {
    tipo: 'SUL',
    nome: 'Conferência Sul',
    icone: '🧊',
    totalTimes: 8,
    regionais: [
      { tipo: 'ARAUCARIA', nome: 'Regional Araucária', conferencia: 'SUL', timesPorRegional: 4, times: [] },
      { tipo: 'PAMPA', nome: 'Regional Pampa', conferencia: 'SUL', timesPorRegional: 4, times: [] },
    ],
    playoffConfig: { semifinalDireta: 2, wildcardVagas: 2, estrutura: 'CONFERENCIA' },
  },
  {
    tipo: 'NORDESTE',
    nome: 'Conferência Nordeste',
    icone: '🌵',
    totalTimes: 6,
    regionais: [
      { tipo: 'ATLANTICO', nome: 'Regional Atlântico', conferencia: 'NORDESTE', timesPorRegional: 6, times: [] },
    ],
    playoffConfig: { semifinalDireta: 2, wildcardVagas: 2, estrutura: 'CONFERENCIA' },
  },
  {
    tipo: 'CENTRO NORTE',
    nome: 'Conferência Centro-Norte',
    icone: '🌲',
    totalTimes: 8,
    regionais: [
      { tipo: 'CERRADO', nome: 'Regional Cerrado', conferencia: 'CENTRO NORTE', timesPorRegional: 5, times: [] },
      { tipo: 'AMAZONIA', nome: 'Regional Amazônia', conferencia: 'CENTRO NORTE', timesPorRegional: 3, times: [] },
    ],
    playoffConfig: { semifinalDireta: 0, wildcardVagas: 4, estrutura: 'CONFERENCIA' },
  },
]

// ==================== HELPERS ====================

export function getConferenciaConfig(tipo: TipoConferencia): ConferenciaConfig {
  const conf = SUPERLIGA_CONFIG.find(c => c.tipo === tipo)
  if (!conf) throw new Error(`Conferência ${tipo} não encontrada`)
  return conf
}

export function getRegionalConfig(tipo: TipoRegional) {
  for (const conf of SUPERLIGA_CONFIG) {
    const regional = conf.regionais.find(r => r.tipo === tipo)
    if (regional) return regional
  }
  throw new Error(`Regional ${tipo} não encontrada`)
}

export function getTimesByRegional(regional: TipoRegional): string[] {
  return TIMES_SUPERLIGA[regional] || []
}

export function getRegionalDoTime(nomeTime: string): TipoRegional | null {
  const alvo = nomeTime.trim().toLowerCase()
  for (const [regional, times] of Object.entries(TIMES_SUPERLIGA) as [TipoRegional, string[]][]) {
    if (times.some(t => t.toLowerCase() === alvo)) return regional
  }
  return null
}

export function normalizarConferencia(valor: string): TipoConferencia {
  const norm = (valor || '').trim().toUpperCase().replace(/-/g, ' ')
  return norm as TipoConferencia
}

export function getDistribuicaoConfig(): {
  [conf: string]: { regionais: { [reg: string]: string[] } }
} {
  const out: { [conf: string]: { regionais: { [reg: string]: string[] } } } = {}
  for (const conf of SUPERLIGA_CONFIG) {
    out[conf.tipo] = { regionais: {} }
    for (const regional of conf.regionais) {
      out[conf.tipo].regionais[regional.tipo] = TIMES_SUPERLIGA[regional.tipo] || []
    }
  }
  return out
}