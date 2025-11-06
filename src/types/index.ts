import { Conferencia, Regional } from "@prisma/client"

export interface BaseEntity {
  id: number
  createdAt: string
  updatedAt: string
}

export interface Titulo {
  nacionais?: string
  conferencias?: string
  estaduais?: string
}

export interface Time extends BaseEntity {
  nome: string
  sigla: string
  temporada: string
  cor: string
  cidade: string
  bandeira_estado: string
  fundacao: string
  logo: string
  capacete: string
  instagram: string
  instagram2: string
  estadio: string
  presidente: string
  head_coach: string
  instagram_coach: string
  coord_ofen: string
  coord_defen: string
  titulos: Titulo[]

  jogadores?: JogadorTime[]

  _count?: {
    jogadores: number
    campeonatos: number
    vitorias: number
    derrotas: number
  }
}

export type TimeOptional = {
  id?: number
  nome?: string
  temporada?: string
  sigla?: string
  cor?: string
  cidade?: string
  bandeira_estado?: string
  fundacao?: string
  logo?: string
  capacete?: string
  instagram?: string
  instagram2?: string
  estadio?: string
  presidente?: string
  head_coach?: string
  instagram_coach?: string
  coord_ofen?: string
  coord_defen?: string
  titulos?: Titulo[]
  jogadores?: Jogador[]
}

export interface Transferencia {
  id: number
  jogadorNome: string
  timeOrigemId?: number
  timeOrigemNome?: string
  timeOrigemSigla?: string
  timeDestinoId: number
  timeDestinoNome?: string
  timeDestinoSigla?: string
  novaPosicao?: string | null
  novoSetor?: string | null
  novoNumero?: number | null
  novaCamisa?: string | null
  data: string
}

export interface TimeMercadoCardProps {
  timeNome: string
  jogadoresEntrando: Transferencia[]
  jogadoresSaindo: Transferencia[]
}

export interface Estatisticas {
  passe: {
    passes_completos: number
    passes_tentados: number
    jardas_de_passe: number
    td_passados: number
    interceptacoes_sofridas: number
    sacks_sofridos: number
    fumble_de_passador: number
  }
  corrida: {
    corridas: number
    jardas_corridas: number
    tds_corridos: number
    fumble_de_corredor: number
  }
  recepcao: {
    recepcoes: number
    alvo: number
    jardas_recebidas: number
    tds_recebidos: number
  }
  retorno: {
    retornos: number
    jardas_retornadas: number
    td_retornados: number
  }
  defesa: {
    tackles_totais: number
    tackles_for_loss: number
    sacks_forcado: number
    fumble_forcado: number
    interceptacao_forcada: number
    passe_desviado: number
    safety: number
    td_defensivo: number
  }
  kicker: {
    xp_bons: number
    tentativas_de_xp: number
    fg_bons: number
    tentativas_de_fg: number
    fg_mais_longo: number
  }
  punter: {
    punts: number
    jardas_de_punt: number
  }
}

export type EstatisticasOptional = {
  passe?: {
    passes_completos?: number
    passes_tentados?: number
    jardas_de_passe?: number
    td_passados?: number
    interceptacoes_sofridas?: number
    sacks_sofridos?: number
    fumble_de_passador?: number
  }
  corrida?: {
    corridas?: number
    jardas_corridas?: number
    tds_corridos?: number
    fumble_de_corredor?: number
  }
  recepcao?: {
    recepcoes?: number
    alvo?: number
    jardas_recebidas?: number
    tds_recebidos?: number
  }
  retorno?: {
    retornos?: number
    jardas_retornadas?: number
    td_retornados?: number
  }
  defesa?: {
    tackles_totais?: number
    tackles_for_loss?: number
    sacks_forcado?: number
    fumble_forcado?: number
    interceptacao_forcada?: number
    passe_desviado?: number
    safety?: number
    td_defensivo?: number
  }
  kicker?: {
    xp_bons?: number
    tentativas_de_xp?: number
    fg_bons?: number
    tentativas_de_fg?: number
    fg_mais_longo?: number
  }
  punter?: {
    punts?: number
    jardas_de_punt?: number
  }
}

export interface Classificacao {
  estrelas: number
  criterio_valor: number
}

export interface ClassificacaoPorCategoria {
  passe?: Classificacao
  corrida?: Classificacao
  recepcao?: Classificacao
  retorno?: Classificacao
  defesa?: Classificacao
  kicker?: Classificacao
  punter?: Classificacao
}

export interface Jogador extends BaseEntity {
  nome: string
  posicao: string
  setor: 'Ataque' | 'Defesa' | 'Special'
  experiencia: number
  idade: number
  altura: number
  peso: number
  instagram: string
  instagram2: string
  cidade: string
  nacionalidade: string
  timeFormador: string
  times?: JogadorTime[]
  timeId?: number
  numero?: number
  camisa?: string
  estatisticas?: Estatisticas
  classificacoes?: ClassificacaoPorCategoria
}

export type JogadorOptional = {
  id?: number
  nome?: string
  time?: string
  timeId?: number
  timeFormador?: string
  posicao?: string
  setor?: "Ataque" | "Defesa" | "Special"
  experiencia?: number
  numero?: number
  idade?: number
  altura?: number
  peso?: number
  instagram?: string
  instagram2?: string
  cidade?: string
  nacionalidade?: string
  camisa?: string
  estatisticas?: EstatisticasOptional
}

export type JogadorType = Jogador

export interface JogadorTime extends BaseEntity {
  jogadorId: number
  timeId: number
  temporada: string
  numero: number
  camisa: string
  estatisticas: Estatisticas
  jogador?: Jogador
  time?: Time
}

export interface Materia extends BaseEntity {
  titulo: string
  subtitulo: string
  imagem: string
  legenda: string | null
  texto: string
  autor: string
  autorImage: string
  createdAt: string
  updatedAt: string
}

export type Noticia = Materia

export interface FormatoCampeonato {
  tipoDisputa: 'PONTOS CORRIDOS' | 'MATA MATA' | 'MISTO'
  numeroRodadas: number
  temGrupos: boolean
  numeroGrupos?: number
  timesGrupo?: number
  classificadosGrupo?: number
  temPlayoffs: boolean
  formatoPlayoffs?: string
}

export interface Campeonato extends BaseEntity {
  nome: string
  temporada: string
  tipo: 'REGULAR' | 'PLAYOFFS' | 'COPA'
  status: 'NÃO INICIADO' | 'EM ANDAMENTO' | 'FINALIZADO'
  dataInicio: string
  dataFim?: string
  descricao?: string
  formato: FormatoCampeonato
  grupos: Grupo[]
  jogos?: Jogo[]
  _count?: {
    grupos: number
    jogos: number
  }
}

export interface Grupo extends BaseEntity {
  nome: string
  campeonatoId: number
  ordem: number
  campeonato?: Campeonato
  times: GrupoTime[]
  classificacoes: ClassificacaoGrupo[]
  jogos?: Jogo[]
}

export interface GrupoTime extends BaseEntity {
  grupoId: number
  timeId: number
  grupo?: Grupo
  time: Time
}

export interface Jogo extends BaseEntity {
  campeonatoId: number
  grupoId?: number
  timeVisitanteId: number
  timeCasaId: number
  dataJogo: string
  local?: string
  rodada: number
  fase: string
  status: 'AGENDADO' | 'AO VIVO' | 'FINALIZADO' | 'ADIADO'
  placarCasa?: number
  placarVisitante?: number
  observacoes?: string
  estatisticasProcessadas: boolean

  videoUrl?: string
  playByPlay?: string

  campeonato?: {
    id: number
    nome: string
    temporada: string
  }
  grupo?: {
    id: number
    nome: string
  }
  timeCasa: Time
  timeVisitante: Time
  estatisticas?: EstatisticaJogo[]
}

export interface ClassificacaoGrupo extends BaseEntity {
  grupoId: number
  timeId: number
  posicao: number
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  pontosPro: number
  pontosContra: number
  saldoPontos: number
  pontos: number
  aproveitamento: number
  time: Time
  grupo?: {
    id: number
    nome: string
    ordem: number
  }
}

export interface EstatisticaJogo extends BaseEntity {
  jogoId: number
  jogadorId: number
  timeId: number
  estatisticas: Estatisticas
  jogo?: Jogo
  jogador: {
    id: number
    nome: string
    posicao: string
    numero?: number
    camisa?: string
  }
  time?: Time
}

export type StatKey =
  | keyof Estatisticas['passe']
  | keyof Estatisticas['corrida']
  | keyof Estatisticas['recepcao']
  | keyof Estatisticas['retorno']
  | keyof Estatisticas['defesa']
  | keyof Estatisticas['kicker']
  | keyof Estatisticas['punter']
  | 'passes_percentual'
  | 'jardas_media'
  | 'jardas_corridas_media'
  | 'jardas_recebidas_media'
  | 'jardas_retornadas_media'
  | 'extra_points'
  | 'field_goals'
  | 'jardas_punt_media'

export interface PasseStats {
  passes_completos: number
  passes_tentados: number
  jardas_de_passe: number
  td_passados: number
  interceptacoes_sofridas: number
  sacks_sofridos: number
  fumble_de_passador: number
}

export interface CorridaStats {
  corridas: number
  jardas_corridas: number
  tds_corridos: number
  fumble_de_corredor: number
}

export interface RecepcaoStats {
  recepcoes: number
  alvo: number
  jardas_recebidas: number
  tds_recebidos: number
}

export interface RetornoStats {
  retornos: number
  jardas_retornadas: number
  td_retornados: number
}

export interface DefesaStats {
  tackles_totais: number
  tackles_for_loss: number
  sacks_forcado: number
  fumble_forcado: number
  interceptacao_forcada: number
  passe_desviado: number
  safety: number
  td_defensivo: number
}

export interface KickerStats {
  xp_bons: number
  tentativas_de_xp: number
  fg_bons: number
  tentativas_de_fg: number
  fg_mais_longo: number
}

export interface PunterStats {
  punts: number
  jardas_de_punt: number
}

export interface StatsBase {
  passe: PasseStats
  corrida: CorridaStats
  recepcao: RecepcaoStats
  retorno: RetornoStats
  defesa: DefesaStats
  kicker: KickerStats
  punter: PunterStats
}

export interface StatGroup {
  title: string
  groupLabel: string
  stats: Array<{
    title: string
    urlParam: string
  }>
}

export interface CalculatedStats {
  jardas_media: number | null
  jardas_corridas_media: number | null
  jardas_recebidas_media: number | null
  jardas_retornadas_media: number | null
  jardas_punt_media: number | null
  passes_percentual: number | null
  field_goals: string | null
  extra_points: string | null
}

export type StatType = 'PASSE' | 'CORRIDA' | 'RECEPCAO' | 'RETORNO' | 'DEFESA' | 'KICKER' | 'PUNTER'

export interface StatConfig {
  key: string
  title: string
  category: string
  isCalculated?: boolean
}

export interface StatResult {
  value: number | null
  tier: number
}

export interface ProcessedPlayer {
  player: Jogador
  average: number
  baseStat: number
  teamInfo: any
  value: string | number
}

export interface ProcessedStatCard {
  title: string
  category: string
  players: Array<{
    id: number
    name: string
    team: string
    value: string
    camisa: string
    teamColor?: string
    teamLogo?: string
    isFirst?: boolean
  }>
}

export interface TeamStats {
  timeId: number
  passe: {
    jardas_de_passe: number
    passes_completos: number
    passes_tentados: number
    td_passados: number
    interceptacoes_sofridas: number
    sacks_sofridos: number
    fumble_de_passador: number
  }
  corrida: {
    jardas_corridas: number
    corridas: number
    tds_corridos: number
    fumble_de_corredor: number
  }
  recepcao: {
    jardas_recebidas: number
    recepcoes: number
    tds_recebidos: number
    alvo: number
  }
  retorno: {
    jardas_retornadas: number
    retornos: number
    td_retornados: number
  }
  defesa: {
    tackles_totais: number
    tackles_for_loss: number
    sacks_forcado: number
    fumble_forcado: number
    interceptacao_forcada: number
    passe_desviado: number
    safety: number
    td_defensivo: number
  }
  kicker: {
    xp_bons: number
    tentativas_de_xp: number
    fg_bons: number
    tentativas_de_fg: number
    fg_mais_longo: number
  }
  punter: {
    punts: number
    jardas_de_punt: number
  }
}

export type StatCategory = 'passe' | 'corrida' | 'recepcao' | 'retorno' | 'defesa' | 'kicker' | 'punter'

export interface TeamComparisonStats {
  passe: {
    jardas_de_passe: number
    passes_completos: number
    passes_tentados: number
    td_passados: number
    interceptacoes_sofridas: number
    sacks_sofridos: number
    fumble_de_passador: number
  }
  corrida: {
    jardas_corridas: number
    corridas: number
    tds_corridos: number
    fumble_de_corredor: number
  }
  recepcao: {
    jardas_recebidas: number
    recepcoes: number
    alvo: number
    tds_recebidos: number
  }
  retorno: {
    jardas_retornadas: number
    retornos: number
    td_retornados: number
  }
  defesa: {
    tackles_totais: number
    tackles_for_loss: number
    sacks_forcado: number
    fumble_forcado: number
    interceptacao_forcada: number
    passe_desviado: number
    safety: number
    td_defensivo: number
  }
  kicker: {
    fg_bons: number
    tentativas_de_fg: number
    fg_mais_longo: number
    xp_bons: number
    tentativas_de_xp: number
  }
  punter: {
    jardas_de_punt: number
    punts: number
  }
}

export interface TeamComparisonPlayer {
  id: number
  nome: string
  camisa: string
  numero: number
  posicao: string
  estatisticas: {
    passe?: Record<string, number>
    corrida?: Record<string, number>
    recepcao?: Record<string, number>
    retorno?: Record<string, number>
    defesa?: Record<string, number>
    kicker?: Record<string, number>
    punter?: Record<string, number>
  }
}

export interface TeamComparisonHighlights {
  ataque: {
    passador: TeamComparisonPlayer | null
    corredor: TeamComparisonPlayer | null
    recebedor: TeamComparisonPlayer | null
    retornador: TeamComparisonPlayer | null
  }
  defesa: {
    tackler: TeamComparisonPlayer | null
    rusher: TeamComparisonPlayer | null
    interceptador: TeamComparisonPlayer | null
    desviador: TeamComparisonPlayer | null
  }
  specialTeams: {
    kicker: TeamComparisonPlayer | null
    punter: TeamComparisonPlayer | null
  }
}

export interface TeamComparisonTeam {
  id: number
  nome: string
  sigla: string
  cor: string
  cidade: string
  bandeira_estado: string
  fundacao: string
  logo: string
  capacete: string
  estadio: string
  presidente: string
  head_coach: string
  coord_ofen: string
  coord_defen: string
  temporada: string
  estatisticas: TeamComparisonStats
  destaques: TeamComparisonHighlights
}

export interface TeamComparisonData {
  teams: {
    time1: TeamComparisonTeam
    time2: TeamComparisonTeam
  }
  metaData: {
    temporada: string
    geradoEm: string
    totalJogos: {
      time1: number
      time2: number
    }
  }
}

export interface ChartDataPoint {
  name: string
  [key: string]: string | number
}

export interface ComparisonCardData {
  title: string
  stat1: string
  stat2: string
  color1: string
  color2: string
  isFirstBetter?: boolean
  isSecondBetter?: boolean
  isEqual?: boolean
}

export interface PlayerComparisonData {
  title: string
  player1: TeamComparisonPlayer | null
  player2: TeamComparisonPlayer | null
  team1: TeamComparisonTeam
  team2: TeamComparisonTeam
  statKey: string
  statCategory: StatCategory
}

export interface ComparisonFilters {
  temporada: string
  categoria?: StatCategory
  tipoEstatistica?: StatTypeEnum
  ordenarPor?: 'nome' | 'valor' | 'diferenca'
  mostrarApenas?: 'melhores' | 'piores' | 'todos'
}

export interface ProcessedComparison {
  teams: {
    time1: TeamComparisonTeam
    time2: TeamComparisonTeam
  }
  comparisons: {
    [category in StatCategory]: ComparisonCardData[]
  }
  highlights: {
    [category in StatCategory]: PlayerComparisonData[]
  }
  charts: {
    [category in StatCategory]: ChartDataPoint[]
  }
  summary: {
    vencedor: 'time1' | 'time2' | 'empate'
    categorias_vencidas: {
      time1: StatCategory[]
      time2: StatCategory[]
      empates: StatCategory[]
    }
    pontuacao: {
      time1: number
      time2: number
    }
  }
}

export interface TeamComparisonResponse {
  success: boolean
  data: TeamComparisonData
  message?: string
  error?: string
}

export type StatComparison = {
  [K in StatCategory]: {
    [key: string]: number
  }
}

export enum StatTypeEnum {
  TOTAL = 'total',
  AVERAGE = 'average',
  PERCENTAGE = 'percentage',
  RATIO = 'ratio'
}

export interface TeamInfo {
  nome: string
  cor: string
}

export interface TeamCardProps {
  id: number
  name: string
  value: string
  teamColor?: string
  isFirst?: boolean
}

export interface TeamStatCardProps {
  title: string
  category: string
  teams: TeamCardProps[]
}

export interface TeamStatCardsGridProps {
  stats: TeamStatCardProps[]
  category: string
}


export interface CriarCampeonatoRequest {
  nome: string
  temporada: string
  tipo: 'REGULAR' | 'PLAYOFFS' | 'COPA'
  dataInicio: string
  dataFim?: string
  descricao?: string
  formato: FormatoCampeonato
  grupos?: Array<{
    nome: string
    times: number[]
  }>
  gerarJogos?: boolean
}

export interface CreateTimeRequest {
  nome: string
  sigla: string
  temporada: string
  cor: string
  cidade: string
  bandeira_estado: string
  fundacao: string
  logo: string
  capacete: string
  estadio: string
  presidente: string
  head_coach: string
  coord_ofen: string
  coord_defen: string
  instagram?: string
  instagram2?: string
  instagram_coach?: string
  titulos?: Titulo[]
}

export interface UpdateTimeRequest extends Partial<CreateTimeRequest> {
  id: number
}

export interface CreateJogadorRequest {
  nome: string
  posicao: string
  setor: 'Ataque' | 'Defesa' | 'Special'
  experiencia: number
  idade: number
  altura: number
  peso: number
  cidade: string
  nacionalidade: string
  timeFormador: string
  instagram?: string
  instagram2?: string
  timeId: number
  temporada: string
  numero: number
  camisa: string
  estatisticas?: Partial<Estatisticas>
}

export interface UpdateJogadorRequest extends Partial<CreateJogadorRequest> {
  id: number
}

export interface BaseFilters {
  temporada?: string
  page?: number
  limit?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export interface TimesFilters extends BaseFilters {
  cidade?: string
  setor?: string
  ativo?: boolean
}

export interface JogadoresFilters extends BaseFilters {
  timeId?: number
  posicao?: string
  setor?: 'Ataque' | 'Defesa' | 'Special'
  idadeMin?: number
  idadeMax?: number
  nacionalidade?: string
}

export interface FiltroJogos {
  campeonatoId?: number
  timeId?: number
  grupoId?: number
  rodada?: number
  status?: string
  fase?: string
  dataInicio?: string
  dataFim?: string
  limit?: number
  offset?: number
}

export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
  timestamp: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ApiError {
  message: string
  code?: string
  status?: number
  field?: string
}

export type EntityStatus = 'ativo' | 'inativo' | 'suspenso'
export type Temporada = '2024' | '2025' | '2026'
export type TipoSetor = 'Ataque' | 'Defesa' | 'Special'

export interface JogoCardProps {
  jogo: Jogo
  showDate?: boolean
  showGroup?: boolean
  compact?: boolean
}

export interface TabelaClassificacaoProps {
  classificacao: ClassificacaoGrupo[]
  grupoNome?: string
  showGroup?: boolean
  compact?: boolean
}

export interface CampeonatoHeaderProps {
  campeonato: Campeonato
  activeTab?: string
  onTabChange?: (tab: string) => void
}


export interface UseQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

export interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  isPending: boolean
  error: Error | null
  reset: () => void
}

export interface TimeChange {
  timeId: number
  alteracoes: Record<string, any>
}

export interface TimeClassificado {
  timeId: number
  nome: string
  sigla: string
  vitorias: number
  derrotas: number
  pontos: number
  pontosPro: number
  pontosContra: number
  saldo: number
  regional: string
  conferencia: string
}

export interface ClassificacaoResultado {
  conferencia: string
  primeirosColocados: TimeClassificado[]
  segundosColocados: TimeClassificado[]
  terceirosColocados: TimeClassificado[]
}

export interface TransferenciaTemporada {
  jogadorId: number
  timeOrigemId: number
  timeDestinoId: number
  novoNumero?: number
  novaCamisa?: string
}

export interface IniciarTemporadaData {
  timeChanges: TimeChange[]
  transferencias: TransferenciaTemporada[]
}

export interface IniciarTemporadaResponse {
  message: string
  times: number
  jogadores: number
  transferencias: number
}

export interface AdminStats {
  totalCampeonatos: number
  campeonatosAtivos: number
  jogosAgendados: number
  jogosFinalizados: number
  timesAtivos: number
  timesParticipantes: number
  jogosEstaSemana: number

  crescimentoCampeonatos: number
  novosTimes: number
  melhoriaOperacional: number
  taxaConclusao: number

  campeonatosPorStatus: Array<{
    status: string
    quantidade: number
    cor: string
  }>

  jogosPorMes: Array<{
    mes: string
    jogos: number
    finalizados: number
  }>

  evolucaoCampeonatos: Array<{
    data: string
    total: number
    ativos: number
  }>

  statusJogos: Array<{
    status: string
    quantidade: number
    porcentagem: number
  }>

  performancePorTipo: Array<{
    tipo: string
    quantidade: number
    media: number
  }>

  participacaoRegional: Array<{
    regiao: string
    times: number
    porcentagem: number
  }>

  tendenciaMensal: Array<{
    mes: string
    valor: number
    variacao: number
  }>

  atividadesRecentes: Array<{
    id: string
    tipo: 'campeonato criado' | 'jogo finalizado' | 'classificacao atualizada'
    titulo: string
    descricao: string
    data: string
    usuario?: string
  }>

  alertas: Array<{
    id: string
    titulo: string
    descricao: string
    prioridade: 'alta' | 'media' | 'baixa'
    tipo: 'warning' | 'error' | 'info'
    data: string
  }>

  topCampeonatos: Array<{
    id: number
    nome: string
    jogos: number
    times: number
    popularidade: number
  }>

  topTimes: Array<{
    id: number
    nome: string
    campeonatos: number
    vitorias: number
    pontos: number
  }>

  topRegioes: Array<{
    nome: string
    times: number
    campeonatos: number
    crescimento: number
  }>

  mediaJogosPorCampeonato: number
  tempoMedioDuracao: number
  taxaAdiamentos: number
  mediaGruposPorCampeonato: number
  participacaoMedia: number
  pontuacaoMedia: number

  recentActivities: Array<{
    id: string
    type: string
    message: string
    timestamp: string
    user?: string
  }>

  alerts: string[]
}

export interface AdminStatsParams {
  temporada?: string
  period?: string
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  timestamp: Date
}

export interface RecentActivityItem {
  id: string
  type: string
  message: string
  timestamp: string
  user?: string
  link?: string
}

export interface RecentActivityProps {
  activities: RecentActivityItem[]
  maxItems?: number
}

export interface CampeonatoValidation {
  id?: number
  nome: string
  temporada: string
  tipo: 'REGULAR' | 'PLAYOFFS' | 'COPA'
  status: 'NAO INICIADO' | 'EM ANDAMENTO' | 'FINALIZADO'
  dataInicio: Date | string
  dataFim?: Date | string
  descricao?: string
  formato: FormatoCampeonato
}

export interface GrupoValidation {
  id?: number
  nome: string
  campeonatoId: number
  ordem: number
  times?: number[]
}

export interface JogoValidation {
  id?: number
  campeonatoId: number
  grupoId?: number
  timeVisitanteId: number
  timeCasaId: number
  dataJogo: Date | string
  local?: string
  rodada: number
  fase: 'FASE GRUPOS' | 'OITAVAS' | 'QUARTAS' | 'SEMI' | 'FINAL'
  status: 'AGENDADO' | 'AO VIVO' | 'FINALIZADO' | 'ADIADO'
  placarCasa?: number
  placarVisitante?: number
  observacoes?: string
}

export type FilterStatus = 'todos' | 'AGENDADO' | 'AO VIVO' | 'FINALIZADO' | 'ADIADO'
export type ViewMode = 'calendar' | 'list' | 'table'

export interface TeamComparisonProps {
  currentTeam: Time
  selectedSetor: string
}

export type {
  Estatisticas as Stats,
  EstatisticasOptional as StatsOptional,
  StatCategory as Category,
  StatKey as Key
}


export type TipoConferencia = 'SUDESTE' | 'SUL' | 'NORDESTE' | 'CENTRO NORTE'

export type TipoRegional =
  | 'SERRAMAR' | 'CANASTRA' | 'CANTAREIRA'
  | 'ARAUCARIA' | 'PAMPA'
  | 'ATLANTICO'
  | 'CERRADO' | 'AMAZONIA'

export interface ConferenciaConfig {
  tipo: TipoConferencia
  nome: string
  icone: string
  totalTimes: number
  regionais: RegionalConfig[]
  playoffConfig: PlayoffConfig
}

export interface RegionalConfig {
  tipo: TipoRegional
  nome: string
  conferencia: TipoConferencia
  timesPorRegional: number
  times: number[]
}

export interface PlayoffConfig {
  semifinalDireta: number
  wildcardVagas: number
  estrutura: 'CONFERENCIA' | 'REGIONAL' | 'GERAL'
}

export const TIMES_SUPERLIGA: Record<TipoRegional, string[]> = {
  SERRAMAR: [
    'Vasco Almirantes',
    'Flamengo Imperadores',
    'Locomotiva FA',
    'Tritões FA'
  ],

  CANASTRA: [
    'Galo FA',
    'Moura Lacerda Dragons',
    'Rio Preto Weilers',
    'Spartans FA'
  ],

  CANTAREIRA: [
    'Corinthians Steamrollers',
    'Cruzeiro FA',
    'Guarulhos Rhynos',
    'Ocelots FA'
  ],

  ARAUCARIA: [
    'Timbó Rex',
    'Coritiba Crocodiles',
    'Calvary Cavaliers',
    'Brown Spiders'
  ],

  PAMPA: [
    'Santa Maria Soldiers',
    'Juventude FA',
    'Bravos FA',
    'Istepôs FA'
  ],

  ATLANTICO: [
    'Fortaleza Tritões',
    'Ceará Sabres',
    'João Pessoa Espectros',
    'Recife Mariners',
    'Cavalaria 2 de Julho',
    'Caruaru Wolves'
  ],

  CERRADO: [
    'Rondonópolis Hawks',
    'Cuiabá Arsenal',
    'Tubarões do Cerrado'
  ],

  AMAZONIA: [
    'Porto Velho Miners',
    'Manaus FA',
    'São Raimundo Cavaliers'
  ]
}

export const SUPERLIGA_CONFIG: ConferenciaConfig[] = [
  {
    tipo: 'SUDESTE',
    nome: 'Conferência Sudeste',
    icone: '🏭',
    totalTimes: 12,
    regionais: [
      {
        tipo: 'SERRAMAR',
        nome: 'Regional Serramar',
        conferencia: 'SUDESTE',
        timesPorRegional: 4,
        times: []
      },
      {
        tipo: 'CANASTRA',
        nome: 'Regional Canastra',
        conferencia: 'SUDESTE',
        timesPorRegional: 4,
        times: []
      },
      {
        tipo: 'CANTAREIRA',
        nome: 'Regional Cantareira',
        conferencia: 'SUDESTE',
        timesPorRegional: 4,
        times: []
      }
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 4,
      estrutura: 'CONFERENCIA'
    }
  },

  {
    tipo: 'SUL',
    nome: 'Conferência Sul',
    icone: '🧊',
    totalTimes: 8,
    regionais: [
      {
        tipo: 'ARAUCARIA',
        nome: 'Regional Araucária',
        conferencia: 'SUL',
        timesPorRegional: 4,
        times: []
      },
      {
        tipo: 'PAMPA',
        nome: 'Regional Pampa',
        conferencia: 'SUL',
        timesPorRegional: 4,
        times: []
      }
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 4,
      estrutura: 'CONFERENCIA'
    }
  },
  {
    tipo: 'NORDESTE',
    nome: 'Conferência Nordeste',
    icone: '🌵',
    totalTimes: 6,
    regionais: [
      {
        tipo: 'ATLANTICO',
        nome: 'Regional Atlântico',
        conferencia: 'NORDESTE',
        timesPorRegional: 6,
        times: []
      }
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 2,
      estrutura: 'CONFERENCIA'
    }
  },

  {
    tipo: 'CENTRO NORTE',
    nome: 'Conferência Centro-Norte',
    icone: '🌲',
    totalTimes: 6,
    regionais: [
      {
        tipo: 'CERRADO',
        nome: 'Regional Cerrado',
        conferencia: 'CENTRO NORTE',
        timesPorRegional: 3,
        times: []
      },
      {
        tipo: 'AMAZONIA',
        nome: 'Regional Amazônia',
        conferencia: 'CENTRO NORTE',
        timesPorRegional: 3,
        times: []
      }
    ],
    playoffConfig: {
      semifinalDireta: 2,
      wildcardVagas: 2,
      estrutura: 'CONFERENCIA'
    }
  }
]

export interface PlayoffBracket {
  conferencia: TipoConferencia
  wildcards: WildCardGame[]
  semifinais: SemifinalGame[]
  final: FinalGame
}

export interface WildCardGame {
  id: string
  nome: string
  time1: PlayoffTeam
  time2: PlayoffTeam
  vencedor?: PlayoffTeam
}

export interface SemifinalGame {
  id: string
  nome: string
  time1: PlayoffTeam | 'VencedorWC'
  time2: PlayoffTeam | 'VencedorWC'
  vencedor?: PlayoffTeam
}

export interface FinalGame {
  id: string
  nome: string
  time1: PlayoffTeam | 'VencedorSF'
  time2: PlayoffTeam | 'VencedorSF'
  vencedor?: PlayoffTeam
}

export interface PlayoffTeam {
  timeId: number
  nome: string
  sigla: string
  regional: TipoRegional
  posicaoRegional: number
  classificacao: 'DIRETO' | 'WILD CARD'
}

export interface SemifinalNacional {
  id: string
  nome: string
  time1: {
    conferencia: TipoConferencia
    campeao: PlayoffTeam
  }
  time2: {
    conferencia: TipoConferencia
    campeao: PlayoffTeam
  }
  vencedor?: PlayoffTeam
}

export interface FinalNacional {
  id: string
  nome: 'Grande Decisão Nacional'
  semifinal1: SemifinalNacional
  semifinal2: SemifinalNacional
  vencedor?: PlayoffTeam
}

export interface SuperligaBracket {
  temporada: string
  status: 'CONFIGURANDO' | 'FASE GRUPOS' | 'PLAYOFFS' | 'FINALIZADO'

  playoffsSudeste: PlayoffBracket
  playoffsSul: PlayoffBracket
  playoffsNordeste: PlayoffBracket
  playoffsCentroNorte: PlayoffBracket
  semifinalNacional1: SemifinalNacional
  semifinalNacional2: SemifinalNacional
  finalNacional: FinalNacional
}

export function getConferenciaConfig(tipo: TipoConferencia): ConferenciaConfig {
  return SUPERLIGA_CONFIG.find(c => c.tipo === tipo)!
}

export function getRegionalConfig(tipo: TipoRegional): RegionalConfig {
  for (const conf of SUPERLIGA_CONFIG) {
    const regional = conf.regionais.find(r => r.tipo === tipo)
    if (regional) return regional
  }
  throw new Error(`Regional ${tipo} não encontrada`)
}

export function getTimesByRegional(regional: TipoRegional): string[] {
  return TIMES_SUPERLIGA[regional] || []
}

export interface SuperligaJogo extends Jogo {
  conferencia?: TipoConferencia
  regional?: TipoRegional
  tipoJogo: 'TEMPORADA REGULAR' | 'WILD CARD' | 'SEMIFINAL CONFERENCIA' | 'FINAL CONFERENCIA' | 'SEMIFINAL NACIONAL' | 'FINAL NACIONAL'
}

export interface ClassificacaoRegional {
  regionalId: number
  regional: TipoRegional
  conferencia: TipoConferencia
  times: ClassificacaoTime[]
}

export interface ClassificacaoTime {
  posicao: number
  timeId: number
  time: Time
  jogos: number
  vitorias: number
  derrotas: number
  pontosPro: number
  pontosContra: number
  saldo: number
  aproveitamento: number
}

export interface SuperligaStatus {
  campeonatoId: number
  fase: 'CONFIGURACAO' | 'TEMPORADA REGULAR' | 'PLAYOFFS CONFERENCIA' | 'FASE NACIONAL' | 'FINALIZADO'
  jogosTemporadaRegular: {
    total: number
    finalizados: number
    percentual: number
  }
  playoffsStatus: {
    [key in TipoConferencia]?: {
      wildcardCompleto: boolean
      semifinalCompleto: boolean
      finalCompleto: boolean
      campeao?: Time
    }
  }
  faseNacionalStatus?: {
    semifinaisCompletas: boolean
    campeaoNacional?: Time
  }
}

export interface DistribuirTimesRequest {
  campeonatoId: number
  distribuicao: {
    [key in TipoRegional]?: number[]
  }
}

export interface GerarJogosRequest {
  campeonatoId: number
  rodadas: number
  algoritmo: 'ROUND ROBIN' | 'CUSTOM'
}

export interface GerarPlayoffsRequest {
  campeonatoId: number
  conferencia: TipoConferencia
}

export interface AtualizarJogoPlayoffRequest {
  jogoId: number
  placarTime1: number
  placarTime2: number
  observacoes?: string
}


export interface DistribuicaoTime {
  timeId: number
  timeNome: string
  conferencia: TipoConferencia
  regional: TipoRegional
}

export interface EstatisticasSuperliga {
  campeonatoId: number
  temporada: string
  totalJogos: number
  jogosRealizados: number
  mediaGolsPorJogo: number
  maiorGoleada: {
    jogo: Jogo
    placar: string
  }
  artilheiros: Array<{
    jogador: Jogador
    time: Time
    tds: number
  }>
  melhoresDefesas: Array<{
    time: Time
    pontosSofridos: number
    mediaPorJogo: number
  }>
  melhoresAtaques: Array<{
    time: Time
    pontosMarcados: number
    mediaPorJogo: number
  }>
}

export interface SuperligaCardProps {
  campeonato: Campeonato & {
    _count?: {
      jogos: number
      conferencias: number
    }
  }
  onEdit?: () => void
  onDelete?: () => void
  onViewDetails?: () => void
}

export interface ConferenciaViewProps {
  conferencia: Conferencia & {
    regionais: Regional[]
    _count?: {
      times: number
      jogos: number
    }
  }
  classificacao?: ClassificacaoRegional[]
  jogos?: Jogo[]
}

export interface RegionalViewProps {
  regional: Regional & {
    conferencia: Conferencia
  }
  classificacao: ClassificacaoTime[]
  jogos: Jogo[]
}

export interface FormDistribuirTimes {
  [regional: string]: number[]
}

export interface FormGerarJogos {
  rodadas: number
  dataInicio: string
  intervaloEntreDatas: number
  jogosSimultaneos: boolean
}

export interface FormAtualizarPlacar {
  placarCasa: string
  placarVisitante: string
  observacoes?: string
}

export interface DistribuicaoTime {
  id: number;
  campeonatoId: number;
  conferenciaId: number;
  regionalId: number;
  timeId: number;
  temporada: string;
  conferenciaType: TipoConferencia;
  regionalType: TipoRegional;
  createdAt: Date;
  updatedAt: Date;
}

export interface DistribuicaoTimeCompleta {
  id: number;
  campeonatoId: number;
  conferenciaId: number;
  regionalId: number;
  timeId: number;
  temporada: string;
  conferenciaType: TipoConferencia;
  regionalType: TipoRegional;
  createdAt: Date;
  updatedAt: Date;
  time: {
    id: number;
    nome: string;
    sigla: string;
    logo: string;
    cor: string;
  };
  conferencia: {
    id: number;
    nome: string;
    tipo: TipoConferencia;
    icone: string;
  };
  regional: {
    id: number;
    nome: string;
    tipo: TipoRegional;
  };
}

export interface TimeClassificadoSuperliga {
  timeId: number;
  time: {
    id: number;
    nome: string;
    sigla: string;
    logo: string;
    cor?: string;
  };
  posicaoRegional: number;
  jogos: number;
  vitorias: number;
  derrotas: number;
  pontosPro: number;
  pontosContra: number;
  saldo: number;
  percentualVitorias: number;
  regional: string;
  regionalType: TipoRegional;
}

export interface ClassificacaoRegionalSuperliga {
  regionalId: number;
  regionalNome: string;
  regionalType: TipoRegional;
  times: TimeClassificadoSuperliga[];
}

export interface ClassificacaoConferenciaSuperliga {
  conferenciaId: number;
  conferenciaNome: string;
  conferenciaType: TipoConferencia;
  icone: string;
  regionais: ClassificacaoRegionalSuperliga[];
  totalTimes: number;
}

export interface ValidacaoDistribuicao {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  summary: {
    totalTimes: number;
    timesPorConferencia: Record<TipoConferencia, number>;
    timesPorRegional: Record<TipoRegional, number>;
  };
}

export interface AgendaJogoRow {
  id_jogo?: number;
  data: string;
  fase: string;
  time_mandante: string;
  time_visitante: string;
  rodada: string | number;
  conferencia?: string;
  regional?: string;
  temporada?: string;
  local?: string;
  observacoes?: string;
}

export interface ResultadoJogoRow {
  id_jogo: number;
  placar_mandante: number;
  placar_visitante: number;
  status?: string;
  observacoes?: string;
}

export interface ImportacaoResponse {
  sucesso: number;
  erros: Array<{
    linha?: number;
    item?: string;
    erro: string;
  }>;
  warnings?: Array<{
    linha?: number;
    item?: string;
    warning: string;
  }>;
  resumo?: {
    totalProcessado: number;
    totalSucesso: number;
    totalErros: number;
    totalWarnings: number;
  };
}