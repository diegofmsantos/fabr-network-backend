// ==================== BASE TYPES ====================

export interface BaseEntity {
  id: number
  createdAt: string
  updatedAt: string
}

// ==================== TIME ====================

export interface Titulo {
  nacionais?: string
  conferencias?: string
  estaduais?: string
}

// Versão principal do Time (usada no backend/admin)
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
  titulos: Titulo[] // Sempre array, nunca undefined
  
  // Relacionamentos (para frontend)
  jogadores?: JogadorTime[]
  
  // Campos calculados (cache/otimização)
  _count?: {
    jogadores: number
    campeonatos: number
    vitorias: number
    derrotas: number
  }
}

// Versão com campos opcionais (compatibilidade com frontend antigo)
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

// ==================== JOGADOR ====================

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

// Versão com campos opcionais das estatísticas (frontend antigo)
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

// Versão principal do Jogador (backend/admin)
export interface Jogador extends BaseEntity {
  nome: string
  posicao: string
  setor: 'Ataque' | 'Defesa' | 'Special'
  experiencia: number
  idade: number
  altura: number // Float no banco
  peso: number
  instagram: string
  instagram2: string
  cidade: string
  nacionalidade: string
  timeFormador: string
  
  // Relacionamentos (para frontend - via JogadorTime)
  times?: JogadorTime[]
  
  // Dados do relacionamento atual (para facilitar acesso)
  timeId?: number
  numero?: number
  camisa?: string
  estatisticas?: Estatisticas
  classificacoes?: ClassificacaoPorCategoria
}

// Versão com campos opcionais (compatibilidade frontend antigo)
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

// ✅ IMPORTANTE: JogadorType é um ALIAS para compatibilidade
export type JogadorType = Jogador

export interface JogadorTime extends BaseEntity {
  jogadorId: number
  timeId: number
  temporada: string
  numero: number
  camisa: string
  estatisticas: Estatisticas // Sempre presente, mesmo que vazio
  
  // Relacionamentos (quando incluídos)
  jogador?: Jogador
  time?: Time
}

// ==================== MATÉRIAS/NOTÍCIAS ====================

export interface Materia extends BaseEntity {
  titulo: string
  subtitulo: string
  imagem: string
  legenda: string | null
  texto: string
  autor: string
  autorImage: string
  // ✅ PADRONIZADO: sempre string ISO (vem da API assim)
  createdAt: string
  updatedAt: string
}

// Alias para compatibilidade com código existente
export type Noticia = Materia

// ==================== CAMPEONATOS ====================

export interface FormatoCampeonato {
  tipoDisputa: 'PONTOS_CORRIDOS' | 'MATA_MATA' | 'MISTO'
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
  status: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'FINALIZADO'
  dataInicio: string // ISO string
  dataFim?: string
  descricao?: string
  formato: FormatoCampeonato
  
  // Relacionamentos
  grupos: Grupo[]
  jogos?: Jogo[]
  
  // Contadores
  _count?: {
    grupos: number
    jogos: number
  }
}

export interface Grupo extends BaseEntity {
  nome: string
  campeonatoId: number
  ordem: number
  
  // Relacionamentos
  campeonato?: Campeonato
  times: GrupoTime[]
  classificacoes: ClassificacaoGrupo[]
  jogos?: Jogo[]
}

export interface GrupoTime extends BaseEntity {
  grupoId: number
  timeId: number
  
  // Relacionamentos
  grupo?: Grupo
  time: Time
}

export interface Jogo extends BaseEntity {
  campeonatoId: number
  grupoId?: number // Null se não for jogo de grupo
  timeVisitanteId: number
  timeCasaId: number
  dataJogo: string // ISO string
  local?: string
  rodada: number
  fase: string // "FASE_GRUPOS", "OITAVAS", "QUARTAS", "SEMI", "FINAL"
  status: 'AGENDADO' | 'AO_VIVO' | 'FINALIZADO' | 'ADIADO'
  placarCasa?: number
  placarVisitante?: number
  observacoes?: string
  estatisticasProcessadas: boolean
  
  // Relacionamentos
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
  pontos: number // Pontos na tabela (vitória = 3, empate = 1)
  aproveitamento: number
  
  // Relacionamentos
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
  estatisticas: Estatisticas // Mesma estrutura das estatísticas existente
  
  // Relacionamentos
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

// ==================== ESTATÍSTICAS E STATS ====================

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

// Interfaces específicas para compatibilidade
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

// ==================== TEAM STATS E COMPARAÇÕES ====================

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

// ==================== REQUESTS/RESPONSES ====================

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
  
  // Dados do relacionamento atual
  timeId: number
  temporada: string
  numero: number
  camisa: string
  
  // Estatísticas iniciais (opcional)
  estatisticas?: Partial<Estatisticas>
}

export interface UpdateJogadorRequest extends Partial<CreateJogadorRequest> {
  id: number
}

// ==================== FILTROS ====================

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

// ==================== API RESPONSES ====================

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

// ==================== TIPOS UTILITÁRIOS ====================

export type EntityStatus = 'ativo' | 'inativo' | 'suspenso'
export type Temporada = '2024' | '2025' | '2026'
export type TipoSetor = 'Ataque' | 'Defesa' | 'Special'

// ==================== PROPS DE COMPONENTES ====================

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

// ==================== HOOKS RETURN TYPES ====================

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

// ==================== TEMPORADA ====================

export interface TimeChange {
  timeId: number
  alteracoes: Record<string, any>
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

// ==================== ESTATÍSTICAS ADMIN ====================

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
    tipo: 'campeonato_criado' | 'jogo_finalizado' | 'classificacao_atualizada'
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

// ==================== NOTIFICAÇÕES ====================

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  timestamp: Date
}

// ==================== COMPONENTES ADMIN ====================

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

// ==================== SCHEMAS ZOD (para referência) ====================

export interface CampeonatoValidation {
  id?: number
  nome: string
  temporada: string
  tipo: 'REGULAR' | 'PLAYOFFS' | 'COPA'
  status: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'FINALIZADO'
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
  fase: 'FASE_GRUPOS' | 'OITAVAS' | 'QUARTAS' | 'SEMI' | 'FINAL'
  status: 'AGENDADO' | 'AO_VIVO' | 'FINALIZADO' | 'ADIADO'
  placarCasa?: number
  placarVisitante?: number
  observacoes?: string
}

// ==================== TYPES ESPECÍFICOS PARA PÁGINAS ====================

// Tipos para página de jogos do admin
export type FilterStatus = 'todos' | 'AGENDADO' | 'AO_VIVO' | 'FINALIZADO' | 'ADIADO'
export type ViewMode = 'calendar' | 'list' | 'table'

// Tipos para comparação de times
export interface TeamComparisonProps {
  currentTeam: Time
  selectedSetor: string
}


// Re-exports para facilitar imports
export type { 
  Estatisticas as Stats,
  EstatisticasOptional as StatsOptional,
  StatCategory as Category,
  StatKey as Key
}
