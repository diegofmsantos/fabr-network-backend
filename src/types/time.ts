import { Jogador } from "./jogador";

type Titulos = {
  nacionais?: string;
  regionais?: string;
  estaduais?: string;
};

export type Time = {
  id?: number;
  nome?: string;
  sigla?: string;
  cor?: string;
  cidade?: string;
  fundacao?: string;
  logo?: string;
  capacete?: string;
  instagram?: string;
  instagram2?: string;
  estadio?: string;
  presidente?: string;
  head_coach?: string;
  coord_ofen?: string;
  coord_defen?: string;
  titulos?: Titulos[];
  brasileirao?: boolean;
  jogadores?: Jogador[];
};
