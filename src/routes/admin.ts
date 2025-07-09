import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx'
import multer from 'multer'
import { TimeClassificado } from '../types';
import { calcularClassificacaoPorConferencia } from '../utils/distribuicaoUtils';
import { gerarPlayoffsCentroNorte, gerarPlayoffsNordeste, gerarPlayoffsSudeste, gerarPlayoffsSul } from '../utils/superligaUtils';

export async function verificarGeracaoAutomaticaPlayoffs(campeonatoId: number) {
    try {
        const totalJogosTemporada = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId,
                fase: 'TEMPORADA_REGULAR',
                status: 'FINALIZADO'
            }
        })

        console.log(`📊 Status: ${jogosFinalizados}/${totalJogosTemporada} jogos da temporada regular finalizados`)

        if (totalJogosTemporada > 0 && jogosFinalizados === totalJogosTemporada) {
            console.log('🏆 TODOS OS JOGOS FINALIZADOS! Gerando playoffs automaticamente...')

            const playoffsExistentes = await prisma.playoffJogo.count({
                where: { campeonatoId }
            })

            if (playoffsExistentes === 0) {
                await gerarTodosPlayoffs(campeonatoId)

                await prisma.campeonato.update({
                    where: { id: campeonatoId },
                    data: {
                        status: 'PLAYOFFS',
                        configSuperliga: {
                            faseAtual: 'PLAYOFFS_CONFERENCIA',
                            playoffsGeradosEm: new Date().toISOString()
                        } as any
                    }
                })

                console.log('🎉 PLAYOFFS GERADOS AUTOMATICAMENTE!')
                return { playoffsGerados: true }
            }
        }

        return { playoffsGerados: false }

    } catch (error) {
        console.error('❌ Erro na verificação automática:', error)
        return { playoffsGerados: false, erro: error }
    }
}

const prisma = new PrismaClient()

export const adminRouter = express.Router()

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 }
});

adminRouter.get('/transferencias-json', (req: Request, res: Response) => {
    try {
        const temporadaOrigem = req.query.temporadaOrigem as string;
        const temporadaDestino = req.query.temporadaDestino as string;

        if (!temporadaOrigem || !temporadaDestino) {
            res.status(400).json({
                error: 'Parâmetros temporadaOrigem e temporadaDestino são obrigatórios'
            });
            return;
        }

        const filePath = path.join(process.cwd(), 'public', 'data',
            `transferencias_${temporadaOrigem}_${temporadaDestino}.json`);

        console.log(`Buscando arquivo de transferências: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.log(`Arquivo de transferências não encontrado: ${filePath}`);
            res.status(404).json({
                error: `Não foram encontradas transferências de ${temporadaOrigem} para ${temporadaDestino}`
            });
            return;
        }

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');

            try {
                const transferencias = JSON.parse(fileContent);
                res.status(200).json(transferencias);
            } catch (parseError) {
                console.error('Erro ao fazer parse do JSON:', parseError);
                res.status(500).json({ error: 'Arquivo de transferências está corrompido' });
            }
        } catch (readError) {
            console.error('Erro ao ler arquivo:', readError);
            res.status(500).json({ error: 'Erro ao ler arquivo de transferências' });
        }
    } catch (error) {
        console.error('Erro geral ao buscar transferências:', error);
        res.status(500).json({ error: 'Erro ao buscar transferências' });
    }
});

adminRouter.post('/iniciar-temporada/:ano', async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
        try {
            const { ano } = req.params;
            const anoAnterior = (parseInt(ano) - 1).toString();

            interface TimeChange {
                timeId: number;
                nome?: string;
                sigla?: string;
                cor?: string;
                instagram?: string;
                instagram2?: string;
                logo?: string;
                capacete?: string;
                presidente?: string;
                head_coach?: string;
                instagram_coach?: string
                coord_ofen?: string;
                coord_defen?: string;
            }

            interface Transferencia {
                jogadorId: number;
                jogadorNome?: string;
                timeOrigemId?: number;
                timeOrigemNome?: string;
                novoTimeId: number;
                novoTimeNome?: string;
                novaPosicao?: string;
                novoSetor?: string;
                novoNumero?: number;
                novaCamisa?: string;
            }

            const timesAnoAnterior = await tx.time.findMany({
                where: { temporada: anoAnterior },
            });

            if (timesAnoAnterior.length === 0) {
                throw new Error(`Nenhum time encontrado na temporada ${anoAnterior}`);
            }

            const mapeamentoIds = new Map();
            const mapeamentoNomes = new Map();

            const timesNovos = [];
            for (const time of timesAnoAnterior) {
                const timeId = time.id;
                const nomeAntigo = time.nome;

                const timeChanges: TimeChange[] = req.body.timeChanges || [];
                const timeChange = timeChanges.find((tc: TimeChange) => tc.timeId === timeId);

                const nomeNovo = timeChange?.nome || time.nome;

                const novoTime = await tx.time.create({
                    data: {
                        nome: nomeNovo,
                        sigla: timeChange?.sigla || time.sigla,
                        cor: timeChange?.cor || time.cor,
                        cidade: time.cidade,
                        bandeira_estado: time.bandeira_estado,
                        fundacao: time.fundacao,
                        logo: timeChange?.logo || time.logo,
                        capacete: timeChange?.capacete || time.capacete,
                        instagram: timeChange?.instagram || time.instagram,
                        instagram2: timeChange?.instagram2 || time.instagram2,
                        estadio: time.estadio,
                        presidente: timeChange?.presidente || time.presidente,
                        head_coach: timeChange?.head_coach || time.head_coach,
                        instagram_coach: time.instagram_coach,
                        coord_ofen: timeChange?.coord_ofen || time.coord_ofen,
                        coord_defen: timeChange?.coord_defen || time.coord_defen,
                        titulos: time.titulos as any,
                        temporada: ano,
                    },
                });

                mapeamentoIds.set(timeId, novoTime.id);

                if (nomeAntigo !== nomeNovo) {
                    mapeamentoNomes.set(nomeAntigo, {
                        novoNome: nomeNovo,
                        novoId: novoTime.id
                    });
                }

                timesNovos.push(novoTime);
            }

            const jogadoresTimesAnoAnterior = await tx.jogadorTime.findMany({
                where: { temporada: anoAnterior },
                include: { jogador: true, time: true },
            });

            const jogadoresProcessados = new Set<number>();

            const transferencias = req.body.transferencias || [];

            for (const transferencia of transferencias) {
                try {
                    const jogadorId = transferencia.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const jogador = await tx.jogador.findUnique({
                        where: { id: jogadorId }
                    });

                    if (!jogador) {
                        continue;
                    }

                    const relacaoAtual = await tx.jogadorTime.findFirst({
                        where: {
                            jogadorId: jogadorId,
                            temporada: anoAnterior
                        },
                        include: { time: true }
                    });

                    if (!relacaoAtual) {
                        continue;
                    }

                    let timeDestino = null;

                    if (transferencia.novoTimeId) {
                        const novoId = mapeamentoIds.get(transferencia.novoTimeId);
                        if (novoId) {
                            timeDestino = await tx.time.findUnique({
                                where: { id: novoId }
                            });
                        }
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        timeDestino = await tx.time.findFirst({
                            where: {
                                nome: transferencia.novoTimeNome,
                                temporada: ano
                            }
                        });

                        if (timeDestino) {
                        }
                    }

                    if (!timeDestino && transferencia.novoTimeNome) {
                        for (const [antigo, info] of mapeamentoNomes.entries()) {
                            if (info.novoNome === transferencia.novoTimeNome) {
                                timeDestino = await tx.time.findUnique({
                                    where: { id: info.novoId }
                                });
                                if (timeDestino) {
                                    break;
                                }
                            }
                        }
                    }

                    if (!timeDestino) {
                        continue;
                    }

                    if (transferencia.novaPosicao || transferencia.novoSetor) {
                        const dadosAtualizacao: { posicao?: string, setor?: string } = {};

                        if (transferencia.novaPosicao) dadosAtualizacao.posicao = transferencia.novaPosicao;
                        if (transferencia.novoSetor) dadosAtualizacao.setor = transferencia.novoSetor;

                        await tx.jogador.update({
                            where: { id: jogadorId },
                            data: dadosAtualizacao
                        });
                    }

                    const novoVinculo = await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: timeDestino.id,
                            temporada: ano,
                            numero: transferencia.novoNumero || relacaoAtual.numero,
                            camisa: transferencia.novaCamisa || relacaoAtual.camisa,
                            estatisticas: {}
                        }
                    });

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar transferência:`, error);
                }
            }

            let jogadoresRegularesProcessados = 0;

            for (const jt of jogadoresTimesAnoAnterior) {
                try {
                    const jogadorId = jt.jogadorId;

                    if (jogadoresProcessados.has(jogadorId)) {
                        continue;
                    }

                    const timeOriginalId = jt.timeId;
                    const novoTimeId = mapeamentoIds.get(timeOriginalId);

                    if (!novoTimeId) {
                        console.error(`Não foi encontrado novo ID para o time original ${timeOriginalId}`);
                        continue;
                    }

                    await tx.jogadorTime.create({
                        data: {
                            jogadorId: jogadorId,
                            timeId: novoTimeId,
                            temporada: ano,
                            numero: jt.numero,
                            camisa: jt.camisa,
                            estatisticas: {}
                        }
                    });

                    jogadoresRegularesProcessados++;

                    jogadoresProcessados.add(jogadorId);

                } catch (error) {
                    console.error(`Erro ao processar jogador regular:`, error);
                }
            }

            const saveTransferenciasToJson = async (
                transferencias: Transferencia[],
                anoOrigem: string,
                anoDestino: string
            ): Promise<number> => {
                try {
                    const dirPath = path.join(process.cwd(), 'public', 'data');

                    if (!fs.existsSync(dirPath)) {
                        console.log(`Criando diretório: ${dirPath}`);
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    const transferenciasFormatadas = [];

                    for (const transferencia of transferencias) {
                        const jogador = await prisma.jogador.findUnique({
                            where: { id: transferencia.jogadorId }
                        });

                        const timeOrigem = transferencia.timeOrigemId ?
                            await prisma.time.findUnique({ where: { id: transferencia.timeOrigemId } }) :
                            null;

                        const timeDestino = await prisma.time.findUnique({
                            where: { id: transferencia.novoTimeId }
                        });

                        transferenciasFormatadas.push({
                            id: transferencia.jogadorId,
                            jogadorNome: jogador?.nome || transferencia.jogadorNome,
                            timeOrigemId: transferencia.timeOrigemId,
                            timeOrigemNome: timeOrigem?.nome || '',
                            timeOrigemSigla: timeOrigem?.sigla || '',
                            timeDestinoId: transferencia.novoTimeId,
                            timeDestinoNome: timeDestino?.nome || transferencia.novoTimeNome,
                            timeDestinoSigla: timeDestino?.sigla || '',
                            novaPosicao: transferencia.novaPosicao || null,
                            novoSetor: transferencia.novoSetor || null,
                            novoNumero: transferencia.novoNumero || null,
                            novaCamisa: transferencia.novaCamisa || null,
                            data: new Date().toISOString()
                        });
                    }

                    const filePath = path.join(dirPath, `transferencias_${anoOrigem}_${anoDestino}.json`);
                    console.log(`Salvando transferências em: ${filePath}`);

                    fs.writeFileSync(filePath, JSON.stringify(transferenciasFormatadas, null, 2));
                    console.log(`${transferenciasFormatadas.length} transferências salvas com sucesso em ${filePath}`);
                    return transferenciasFormatadas.length;
                } catch (error) {
                    console.error('Erro ao salvar transferências em JSON:', error);
                    return 0;
                }
            };

            const totalSalvo = await saveTransferenciasToJson(transferencias, anoAnterior, ano);
            console.log(`Total de ${totalSalvo} transferências salvas em JSON`);
            const jogadoresNovaTemporada = await tx.jogadorTime.count({
                where: { temporada: ano }
            });

            console.log(`Contagem final: ${jogadoresNovaTemporada} jogadores na temporada ${ano}`);

            return {
                message: `Temporada ${ano} iniciada com sucesso!`,
                times: 0,
                jogadores: 0,
                transferencias: totalSalvo
            };

        } catch (error) {
            console.error(`Erro ao iniciar temporada:`, error);
            throw error;
        }
    }, {
        timeout: 120000,
    });

    res.status(200).json(result);
});

adminRouter.post('/importar-times', upload.single('arquivo'), async (req, res) => {
    console.log('Rota /importar-times chamada')
    try {
        if (!req.file) {
            console.log('Nenhum arquivo enviado');
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const timeSheet = workbook.Sheets[sheetName];

        let timesRaw = xlsx.utils.sheet_to_json(timeSheet) as any[];

        const times = timesRaw.map(time => ({
            ...time,
            temporada: time.temporada ? String(time.temporada) : '2025'
        }));

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        for (const time of times) {
            try {
                console.log(`Processando time: ${time.nome}, temporada: ${time.temporada}`);

                if (!time.nome || !time.sigla || !time.cor) {
                    resultados.erros.push({
                        time: time.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                const timeExistente = await prisma.time.findFirst({
                    where: {
                        nome: time.nome,
                        temporada: String(time.temporada)
                    }
                });

                if (timeExistente) {
                    await prisma.time.update({
                        where: { id: timeExistente.id },
                        data: {
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            fundacao: time.fundacao || '',
                            logo: time.logo || '',
                            capacete: time.capacete || '',
                            instagram: time.instagram || '',
                            instagram2: time.instagram2 || '',
                            estadio: time.estadio || '',
                            presidente: time.presidente || '',
                            head_coach: time.head_coach || '',
                            instagram_coach: time.instagram_coach || '',
                            coord_ofen: time.coord_ofen || '',
                            coord_defen: time.coord_defen || '',
                            titulos: time.titulos || []
                        }
                    });
                } else {
                    await prisma.time.create({
                        data: {
                            nome: time.nome,
                            sigla: time.sigla,
                            cor: time.cor,
                            cidade: time.cidade || '',
                            bandeira_estado: time.bandeira_estado || '',
                            fundacao: time.fundacao || '',
                            logo: time.logo || '',
                            capacete: time.capacete || '',
                            instagram: time.instagram || '',
                            instagram2: time.instagram2 || '',
                            estadio: time.estadio || '',
                            presidente: time.presidente || '',
                            head_coach: time.head_coach || '',
                            instagram_coach: time.instagram_coach || '',
                            coord_ofen: time.coord_ofen || '',
                            coord_defen: time.coord_defen || '',
                            titulos: time.titulos || [],
                            temporada: String(time.temporada)
                        }
                    });
                }

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar time ${time.nome}:`, error);
                resultados.erros.push({
                    time: time.nome || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} times importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de times:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de times',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.post('/importar-jogadores', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('Arquivo recebido:', req.file.path);

        const workbook = xlsx.readFile(req.file.path, {
            raw: false,
            cellText: true
        });

        const sheetName = workbook.SheetNames[0];
        const jogadorSheet = workbook.Sheets[sheetName];

        let jogadoresRaw = xlsx.utils.sheet_to_json(jogadorSheet) as any[];

        function convertNumbersToStrings(obj: any): any {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj === 'number') return String(obj);
            if (Array.isArray(obj)) return obj.map(item => convertNumbersToStrings(item));
            if (typeof obj === 'object') {
                const result: any = {};
                for (const key in obj) {
                    result[key] = convertNumbersToStrings(obj[key]);
                }
                return result;
            }
            return obj;
        }

        jogadoresRaw = convertNumbersToStrings(jogadoresRaw);

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        for (const jogador of jogadoresRaw) {
            try {
                if (!jogador.nome || !jogador.time_nome) {
                    resultados.erros.push({
                        jogador: jogador.nome || 'Desconhecido',
                        erro: 'Dados obrigatórios ausentes'
                    });
                    continue;
                }

                const time = await prisma.time.findFirst({
                    where: {
                        nome: jogador.time_nome,
                        temporada: jogador.temporada || '2025'
                    }
                });

                if (!time) {
                    resultados.erros.push({
                        jogador: jogador.nome,
                        erro: `Time "${jogador.time_nome}" não encontrado`
                    });
                    continue;
                }

                const estatisticas = {
                    passe: {
                        passes_completos: Number(jogador.passes_completos || 0),
                        passes_tentados: Number(jogador.passes_tentados || 0),
                        jardas_de_passe: Number(jogador.jardas_de_passe || 0),
                        td_passados: Number(jogador.td_passados || 0),
                        interceptacoes_sofridas: Number(jogador.interceptacoes_sofridas || 0),
                        sacks_sofridos: Number(jogador.sacks_sofridos || 0),
                        fumble_de_passador: Number(jogador.fumble_de_passador || 0)
                    },
                    corrida: {
                        corridas: Number(jogador.corridas || 0),
                        jardas_corridas: Number(jogador.jardas_corridas || 0),
                        tds_corridos: Number(jogador.tds_corridos || 0),
                        fumble_de_corredor: Number(jogador.fumble_de_corredor || 0)
                    },
                    recepcao: {
                        recepcoes: Number(jogador.recepcoes || 0),
                        alvo: Number(jogador.alvo || 0),
                        jardas_recebidas: Number(jogador.jardas_recebidas || 0),
                        tds_recebidos: Number(jogador.tds_recebidos || 0)
                    },
                    retorno: {
                        retornos: Number(jogador.retornos || 0),
                        jardas_retornadas: Number(jogador.jardas_retornadas || 0),
                        td_retornados: Number(jogador.td_retornados || 0)
                    },
                    defesa: {
                        tackles_totais: Number(jogador.tackles_totais || 0),
                        tackles_for_loss: Number(jogador.tackles_for_loss || 0),
                        sacks_forcado: Number(jogador.sacks_forcado || 0),
                        fumble_forcado: Number(jogador.fumble_forcado || 0),
                        interceptacao_forcada: Number(jogador.interceptacao_forcada || 0),
                        passe_desviado: Number(jogador.passe_desviado || 0),
                        safety: Number(jogador.safety || 0),
                        td_defensivo: Number(jogador.td_defensivo || 0)
                    },
                    kicker: {
                        xp_bons: Number(jogador.xp_bons || 0),
                        tentativas_de_xp: Number(jogador.tentativas_de_xp || 0),
                        fg_bons: Number(jogador.fg_bons || 0),
                        tentativas_de_fg: Number(jogador.tentativas_de_fg || 0),
                        fg_mais_longo: Number(jogador.fg_mais_longo || 0)
                    },
                    punter: {
                        punts: Number(jogador.punts || 0),
                        jardas_de_punt: Number(jogador.jardas_de_punt || 0)
                    }
                };

                let jogadorExistente = await prisma.jogador.findFirst({
                    where: {
                        nome: jogador.nome,
                        times: {
                            some: {
                                timeId: time.id,
                                temporada: jogador.temporada || '2025'
                            }
                        }
                    },
                    include: {
                        times: {
                            where: {
                                timeId: time.id,
                                temporada: jogador.temporada || '2025'
                            }
                        }
                    }
                });

                if (jogadorExistente) {
                    if (jogadorExistente.times && jogadorExistente.times.length > 0) {
                        await prisma.jogadorTime.update({
                            where: { id: jogadorExistente.times[0].id },
                            data: {
                                numero: Number(jogador.numero || 0),
                                camisa: jogador.camisa || '',
                                estatisticas: estatisticas
                            }
                        });
                    }
                } else {
                    const novoJogador = await prisma.jogador.create({
                        data: {
                            nome: jogador.nome,
                            posicao: jogador.posicao || '',
                            setor: jogador.setor || 'Ataque',
                            experiencia: Number(jogador.experiencia || 0),
                            idade: Number(jogador.idade || 0),
                            altura: Number(jogador.altura || 0),
                            peso: Number(jogador.peso || 0),
                            instagram: jogador.instagram || '',
                            instagram2: jogador.instagram2 || '',
                            cidade: jogador.cidade || '',
                            nacionalidade: jogador.nacionalidade || '',
                            timeFormador: jogador.timeFormador || ''
                        }
                    });

                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: novoJogador.id,
                            timeId: time.id,
                            temporada: jogador.temporada || '2025',
                            numero: Number(jogador.numero || 0),
                            camisa: jogador.camisa || '',
                            estatisticas: estatisticas
                        }
                    });
                }

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar jogador ${jogador.nome}:`, error);
                resultados.erros.push({
                    jogador: jogador.nome || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Processamento concluído: ${resultados.sucesso} jogadores importados com sucesso`,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar planilha de jogadores:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de jogadores',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// SUBSTITUIR a rota existente em src/routes/admin.ts

adminRouter.post('/importar-agenda-jogos', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        console.log('📋 Iniciando importação de agenda de jogos...');
        console.log('Arquivo recebido:', req.file.path);

        // ✅ 1. LER PLANILHA
        const workbook = xlsx.readFile(req.file.path, {
            raw: false,
            cellText: true
        });

        const sheetName = workbook.SheetNames[0];
        const agendaSheet = workbook.Sheets[sheetName];

        let jogosRaw = xlsx.utils.sheet_to_json(agendaSheet) as any[];

        // ✅ 2. CONVERTER NÚMEROS PARA STRINGS
        function convertNumbersToStrings(obj: any): any {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj === 'number') return String(obj);
            if (Array.isArray(obj)) return obj.map(item => convertNumbersToStrings(item));
            if (typeof obj === 'object') {
                const result: any = {};
                for (const key in obj) {
                    result[key] = convertNumbersToStrings(obj[key]);
                }
                return result;
            }
            return obj;
        }

        jogosRaw = convertNumbersToStrings(jogosRaw);

        console.log(`📊 Total de jogos na planilha: ${jogosRaw.length}`);

        // ✅ 3. VALIDAR ESTRUTURA DA PLANILHA
        if (jogosRaw.length === 0) {
            res.status(400).json({ error: 'Planilha vazia ou sem dados válidos' });
            return;
        }

        // Verificar colunas obrigatórias
        const primeiroJogo = jogosRaw[0];
        const colunasObrigatorias = ['data', 'time_mandante', 'time_visitante', 'rodada'];
        const colunasFaltando = colunasObrigatorias.filter(col => !(col in primeiroJogo));

        if (colunasFaltando.length > 0) {
            res.status(400).json({
                error: 'Colunas obrigatórias faltando na planilha',
                colunasFaltando,
                colunasEncontradas: Object.keys(primeiroJogo)
            });
            return;
        }

        // ✅ 4. BUSCAR SUPERLIGA
        const temporada = primeiroJogo.temporada || '2025';
        const superliga = await prisma.campeonato.findFirst({
            where: {
                temporada: '2025', // ✅ HARDCODED POR ENQUANTO
                isSuperliga: true
            }
        });

        if (!superliga) {
            res.status(400).json({
                error: 'Superliga 2025 não encontrada',
                message: 'Crie a Superliga antes de importar a agenda de jogos'
            });
            return;
        }

        // ✅ ADICIONAR BUSCA DE DISTRIBUIÇÃO DE TIMES
        const distribuicaoTimes = await prisma.distribuicaoTime.findMany({
            where: { campeonatoId: superliga.id },
            include: {
                time: true,
                conferencia: true,
                regional: true
            }
        });

        if (distribuicaoTimes.length === 0) {
            res.status(400).json({
                error: 'Times não distribuídos',
                message: 'Execute o script de distribuição dos times antes de importar a agenda'
            });
            return;
        }

        // ✅ 5. BUSCAR TODOS OS TIMES E DISTRIBUIÇÃO
        const times = await prisma.time.findMany({
            where: { temporada }
        });

        const distribuicao = await prisma.distribuicaoTime.findMany({
            where: { campeonatoId: superliga.id },
            include: {
                time: true,
                conferencia: true,
                regional: true
            }
        });

        console.log(`📋 Times cadastrados: ${times.length}`);
        console.log(`🗺️  Distribuição configurada: ${distribuicao.length}`);

        // ✅ 6. CRIAR MAPA DE TIMES POR NOME
        const mapaTimes = new Map<string, any>();
        times.forEach(time => {
            // Múltiplas variações do nome para busca flexível
            const nomeNormalizado = time.nome.toLowerCase().trim();
            mapaTimes.set(nomeNormalizado, time);
            mapaTimes.set(time.sigla.toLowerCase().trim(), time);
        });

        // ✅ 7. CRIAR MAPA DE DISTRIBUIÇÃO
        const mapaDistribuicao = new Map<number, any>();
        distribuicao.forEach(dist => {
            mapaDistribuicao.set(dist.timeId, {
                conferencia: dist.conferenciaType,
                regional: dist.regionalType,
                conferenciaObj: dist.conferencia,
                regionalObj: dist.regional
            });
        });

        // ✅ 8. PROCESSAR JOGOS
        const resultados = {
            sucesso: 0,
            erros: [] as any[],
            warnings: [] as any[]
        };

        for (let i = 0; i < jogosRaw.length; i++) {
            const jogoData = jogosRaw[i];
            const linha = i + 2; // +2 porque linha 1 é header e array começa em 0

            try {
                // Buscar time mandante
                const nomeTimeMandante = jogoData.time_mandante?.toString().toLowerCase().trim();
                const timeMandante = mapaTimes.get(nomeTimeMandante);

                if (!timeMandante) {
                    resultados.erros.push({
                        linha,
                        jogo: `${jogoData.time_mandante} vs ${jogoData.time_visitante}`,
                        erro: `Time mandante "${jogoData.time_mandante}" não encontrado`
                    });
                    continue;
                }

                // Buscar time visitante
                const nomeTimeVisitante = jogoData.time_visitante?.toString().toLowerCase().trim();
                const timeVisitante = mapaTimes.get(nomeTimeVisitante);

                if (!timeVisitante) {
                    resultados.erros.push({
                        linha,
                        jogo: `${jogoData.time_mandante} vs ${jogoData.time_visitante}`,
                        erro: `Time visitante "${jogoData.time_visitante}" não encontrado`
                    });
                    continue;
                }

                // Validar data
                let dataJogo: Date;
                try {
                    const dataRaw = jogoData.data;

                    // Se a data é um número (formato serial do Excel)
                    if (typeof dataRaw === 'number' || !isNaN(Number(dataRaw))) {
                        // Converter número serial do Excel para data
                        // Excel conta dias desde 1/1/1900 (com bug: trata 1900 como bissexto)
                        const serialNumber = Number(dataRaw);
                        const excelEpoch = new Date(1900, 0, 1); // 1 de janeiro de 1900
                        dataJogo = new Date(excelEpoch.getTime() + (serialNumber - 2) * 24 * 60 * 60 * 1000);
                    }
                    // Se a data é uma string
                    else if (typeof dataRaw === 'string') {
                        dataJogo = new Date(dataRaw);
                    }
                    // Se já é um objeto Date
                    else if (dataRaw instanceof Date) {
                        dataJogo = dataRaw;
                    }
                    // Formato não reconhecido
                    else {
                        throw new Error(`Formato de data não reconhecido: ${dataRaw}`);
                    }

                    // Validar se a data é válida
                    if (isNaN(dataJogo.getTime())) {
                        throw new Error(`Data inválida: ${dataRaw}`);
                    }

                    // Validar se a data está em um range razoável (entre 2020 e 2030)
                    const year = dataJogo.getFullYear();
                    if (year < 2020 || year > 2030) {
                        throw new Error(`Data fora do range válido (2020-2030): ${dataJogo.toISOString()}`);
                    }

                } catch (error) {
                    resultados.erros.push({
                        linha,
                        jogo: `${jogoData.time_mandante} vs ${jogoData.time_visitante}`,
                        erro: `Erro de data: ${error instanceof Error ? error.message : 'Data inválida'} (valor original: ${jogoData.data})`
                    });
                    continue;
                }

                // Buscar informações de distribuição
                const distMandante = mapaDistribuicao.get(timeMandante.id);
                const distVisitante = mapaDistribuicao.get(timeVisitante.id);

                // ✅ 9. DETERMINAR CONFERÊNCIA E REGIONAL DO JOGO
                let conferenciaJogo = jogoData.conferencia || null;
                let regionalJogo = jogoData.regional || null;

                // Se não especificado na planilha, usar do time mandante
                if (!conferenciaJogo && distMandante) {
                    conferenciaJogo = distMandante.conferencia;
                }
                if (!regionalJogo && distMandante) {
                    regionalJogo = distMandante.regional;
                }

                // ✅ 10. CRIAR JOGO NO BANCO
                const novoJogo = await prisma.jogo.create({
                    data: {
                        campeonatoId: superliga.id,
                        timeCasaId: timeMandante.id,
                        timeVisitanteId: timeVisitante.id,
                        dataJogo: dataJogo,
                        rodada: parseInt(jogoData.rodada?.toString()) || 1,
                        fase: jogoData.fase || 'TEMPORADA_REGULAR',
                        status: 'AGENDADO',
                        local: jogoData.local || timeMandante.estadio || `Estádio ${timeMandante.cidade}`,
                        observacoes: jogoData.observacoes || null,

                        // ✅ NOVOS CAMPOS DA FASE 1
                        conferencia: conferenciaJogo,
                        regional: regionalJogo,
                        temporada: temporada
                    }
                });

                resultados.sucesso++;

                console.log(`✅ Jogo ${resultados.sucesso}: ${timeMandante.sigla} vs ${timeVisitante.sigla} - Rodada ${novoJogo.rodada}`);

            } catch (error) {
                resultados.erros.push({
                    linha,
                    jogo: `${jogoData.time_mandante} vs ${jogoData.time_visitante}`,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        // ✅ 11. LIMPAR ARQUIVO
        fs.unlinkSync(req.file.path);

        // ✅ 12. RESPOSTA FINAL
        console.log(`🎉 Importação concluída: ${resultados.sucesso} jogos criados`);

        // ✅ 12. DEBUG TEMPORÁRIO - ADICIONAR ANTES DA RESPOSTA FINAL
        console.log('\n' + '='.repeat(80));
        console.log('🔍 DEBUG DETALHADO DA IMPORTAÇÃO');
        console.log('='.repeat(80));

        console.log(`📊 RESUMO GERAL:`);
        console.log(`   📥 Total de jogos na planilha: ${jogosRaw.length}`);
        console.log(`   ✅ Jogos criados com sucesso: ${resultados.sucesso}`);
        console.log(`   ❌ Jogos com erro: ${resultados.erros.length}`);
        console.log(`   ⚠️  Warnings: ${resultados.warnings.length}`);

        if (resultados.erros.length > 0) {
            console.log(`\n❌ PRIMEIROS 10 ERROS:`);
            resultados.erros.slice(0, 10).forEach((erro, index) => {
                console.log(`   ${index + 1}. Linha ${erro.linha}: ${erro.erro}`);
                console.log(`      Jogo: ${erro.jogo}`);
            });
        }

        console.log(`\n📋 TIMES CADASTRADOS NO SISTEMA (primeiros 15):`);
        times.slice(0, 15).forEach(time => {
            console.log(`   - "${time.nome}" (Sigla: "${time.sigla}", ID: ${time.id})`);
        });

        console.log(`\n📑 PRIMEIROS 5 JOGOS DA PLANILHA:`);
        jogosRaw.slice(0, 5).forEach((jogo, index) => {
            console.log(`   ${index + 1}. "${jogo.time_mandante}" vs "${jogo.time_visitante}"`);
            console.log(`      Data: ${jogo.data}, Rodada: ${jogo.rodada}`);
            console.log(`      Temporada: ${jogo.temporada || 'não informada'}`);
        });

        console.log(`\n🗺️  DISTRIBUIÇÃO CONFIGURADA:`);
        const amostraDistribuicao = distribuicao.slice(0, 5);
        amostraDistribuicao.forEach(dist => {
            console.log(`   - ${dist.time.nome} -> ${dist.conferencia.nome} / ${dist.regional.nome}`);
        });

        console.log(`\n🔍 TESTE DE BUSCA DE TIMES (primeiros 3 jogos):`);
        for (let i = 0; i < Math.min(3, jogosRaw.length); i++) {
            const jogo = jogosRaw[i];

            console.log(`\n   JOGO ${i + 1}: ${jogo.time_mandante} vs ${jogo.time_visitante}`);

            // Teste busca mandante
            const nomeMandate = jogo.time_mandante?.toString().toLowerCase().trim();
            const mandanteEncontrado = mapaTimes.get(nomeMandate);
            console.log(`      Mandante "${jogo.time_mandante}" -> normalizado: "${nomeMandate}"`);
            console.log(`      Encontrado: ${mandanteEncontrado ? `✅ ${mandanteEncontrado.nome}` : '❌ NÃO'}`);

            // Teste busca visitante
            const nomeVisitante = jogo.time_visitante?.toString().toLowerCase().trim();
            const visitanteEncontrado = mapaTimes.get(nomeVisitante);
            console.log(`      Visitante "${jogo.time_visitante}" -> normalizado: "${nomeVisitante}"`);
            console.log(`      Encontrado: ${visitanteEncontrado ? `✅ ${visitanteEncontrado.nome}` : '❌ NÃO'}`);
        }

        console.log(`\n🔤 MAPA DE TIMES (primeiras 10 chaves):`);
        const chavesMapaTimes = Array.from(mapaTimes.keys()).slice(0, 10);
        chavesMapaTimes.forEach(chave => {
            const time = mapaTimes.get(chave);
            console.log(`   "${chave}" -> ${time?.nome}`);
        });

        console.log(`\n📈 ANÁLISE DE PROBLEMAS COMUNS:`);

        // Verificar se há times com nomes similares
        const timesNaoPlanilha = jogosRaw.slice(0, 5).map(j => [j.time_mandante, j.time_visitante]).flat();
        const timesSistema = times.map(t => t.nome);

        console.log(`   🔍 Buscando correspondências aproximadas:`);
        timesNaoPlanilha.forEach(timePlanilha => {
            const nomeNormalizado = timePlanilha?.toString().toLowerCase().trim();
            if (!mapaTimes.has(nomeNormalizado)) {
                console.log(`      "${timePlanilha}" não encontrado. Possíveis correspondências:`);

                const palavras = nomeNormalizado.split(' ').filter((p: string) => p.length > 2);
                const possiveis = timesSistema.filter(timeSistema => {
                    const nomeSistemaNorm = timeSistema.toLowerCase();
                    return palavras.some((palavra: string) => nomeSistemaNorm.includes(palavra));
                });

                if (possiveis.length > 0) {
                    possiveis.slice(0, 3).forEach(possivel => {
                        console.log(`         - "${possivel}"`);
                    });
                } else {
                    console.log(`         - Nenhuma correspondência encontrada`);
                }
            }
        });

        console.log('='.repeat(80));
        console.log('🔍 FIM DO DEBUG - VERIFIQUE AS INFORMAÇÕES ACIMA');
        console.log('='.repeat(80) + '\n');

        // ✅ 13. RESPOSTA FINAL (após o debug)

        res.status(200).json({
            mensagem: `Importação concluída: ${resultados.sucesso} jogos criados com sucesso`,
            sucesso: resultados.sucesso,
            total: jogosRaw.length,
            erros: resultados.erros.length > 0 ? resultados.erros : null,
            warnings: resultados.warnings.length > 0 ? resultados.warnings : null,
            resumo: {
                totalProcessado: jogosRaw.length,
                totalSucesso: resultados.sucesso,
                totalErros: resultados.erros.length,
                percentualSucesso: ((resultados.sucesso / jogosRaw.length) * 100).toFixed(1)
            }
        });

    } catch (error) {
        console.error('❌ Erro ao processar planilha de agenda:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar a planilha de agenda',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.post('/atualizar-estatisticas', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const { id_jogo, data_jogo } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        for (const stat of estatisticasJogo) {
            try {
                if (!stat.jogador_id && !stat.jogador_nome) {
                    resultados.erros.push({
                        linha: JSON.stringify(stat),
                        erro: 'ID ou nome do jogador é obrigatório'
                    });
                    continue;
                }

                const temporada = String(stat.temporada || '2025');

                let jogador;
                let jogadorTime;

                if (stat.jogador_id) {
                    const jogadorId = Number(stat.jogador_id);

                    jogador = await prisma.jogador.findUnique({
                        where: { id: jogadorId }
                    });

                    if (!jogador) {
                        throw new Error(`Jogador ID ${jogadorId} não encontrado`);
                    }

                    const jogadorTimes = await prisma.jogadorTime.findMany({
                        where: {
                            jogadorId: jogadorId,
                            temporada: temporada
                        }
                    });

                    if (!jogadorTimes || jogadorTimes.length === 0) {
                        throw new Error(`Jogador ID ${jogadorId} não tem relação com time na temporada ${temporada}`);
                    }

                    jogadorTime = jogadorTimes[0];
                }

                if (!jogador || !jogadorTime) {
                    resultados.erros.push({
                        jogador: stat.jogador_nome || stat.jogador_id,
                        erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                    });
                    continue;
                }

                const estatisticasAtuais = jogadorTime.estatisticas as any || {};

                const estatisticasDoJogo = {
                    passe: {
                        passes_completos: Number(stat.passes_completos || 0),
                        passes_tentados: Number(stat.passes_tentados || 0),
                        jardas_de_passe: Number(stat.jardas_de_passe || 0),
                        td_passados: Number(stat.td_passados || 0),
                        interceptacoes_sofridas: Number(stat.interceptacoes_sofridas || 0),
                        sacks_sofridos: Number(stat.sacks_sofridos || 0),
                        fumble_de_passador: Number(stat.fumble_de_passador || 0)
                    },
                    corrida: {
                        corridas: Number(stat.corridas || 0),
                        jardas_corridas: Number(stat.jardas_corridas || 0),
                        tds_corridos: Number(stat.tds_corridos || 0),
                        fumble_de_corredor: Number(stat.fumble_de_corredor || 0)
                    },
                    recepcao: {
                        recepcoes: Number(stat.recepcoes || 0),
                        alvo: Number(stat.alvo || 0),
                        jardas_recebidas: Number(stat.jardas_recebidas || 0),
                        tds_recebidos: Number(stat.tds_recebidos || 0)
                    },
                    retorno: {
                        retornos: Number(stat.retornos || 0),
                        jardas_retornadas: Number(stat.jardas_retornadas || 0),
                        td_retornados: Number(stat.td_retornados || 0)
                    },
                    defesa: {
                        tackles_totais: Number(stat.tackles_totais || 0),
                        tackles_for_loss: Number(stat.tackles_for_loss || 0),
                        sacks_forcado: Number(stat.sacks_forcado || 0),
                        fumble_forcado: Number(stat.fumble_forcado || 0),
                        interceptacao_forcada: Number(stat.interceptacao_forcada || 0),
                        passe_desviado: Number(stat.passe_desviado || 0),
                        safety: Number(stat.safety || 0),
                        td_defensivo: Number(stat.td_defensivo || 0)
                    },
                    kicker: {
                        xp_bons: Number(stat.xp_bons || 0),
                        tentativas_de_xp: Number(stat.tentativas_de_xp || 0),
                        fg_bons: Number(stat.fg_bons || 0),
                        tentativas_de_fg: Number(stat.tentativas_de_fg || 0),
                        fg_mais_longo: Number(stat.fg_mais_longo || 0)
                    },
                    punter: {
                        punts: Number(stat.punts || 0),
                        jardas_de_punt: Number(stat.jardas_de_punt || 0)
                    }
                };

                const novasEstatisticas = {
                    passe: {
                        passes_completos: (estatisticasAtuais.passe?.passes_completos || 0) + estatisticasDoJogo.passe.passes_completos,
                        passes_tentados: (estatisticasAtuais.passe?.passes_tentados || 0) + estatisticasDoJogo.passe.passes_tentados,
                        jardas_de_passe: (estatisticasAtuais.passe?.jardas_de_passe || 0) + estatisticasDoJogo.passe.jardas_de_passe,
                        td_passados: (estatisticasAtuais.passe?.td_passados || 0) + estatisticasDoJogo.passe.td_passados,
                        interceptacoes_sofridas: (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) + estatisticasDoJogo.passe.interceptacoes_sofridas,
                        sacks_sofridos: (estatisticasAtuais.passe?.sacks_sofridos || 0) + estatisticasDoJogo.passe.sacks_sofridos,
                        fumble_de_passador: (estatisticasAtuais.passe?.fumble_de_passador || 0) + estatisticasDoJogo.passe.fumble_de_passador
                    },
                    corrida: {
                        corridas: (estatisticasAtuais.corrida?.corridas || 0) + estatisticasDoJogo.corrida.corridas,
                        jardas_corridas: (estatisticasAtuais.corrida?.jardas_corridas || 0) + estatisticasDoJogo.corrida.jardas_corridas,
                        tds_corridos: (estatisticasAtuais.corrida?.tds_corridos || 0) + estatisticasDoJogo.corrida.tds_corridos,
                        fumble_de_corredor: (estatisticasAtuais.corrida?.fumble_de_corredor || 0) + estatisticasDoJogo.corrida.fumble_de_corredor
                    },
                    recepcao: {
                        recepcoes: (estatisticasAtuais.recepcao?.recepcoes || 0) + estatisticasDoJogo.recepcao.recepcoes,
                        alvo: (estatisticasAtuais.recepcao?.alvo || 0) + estatisticasDoJogo.recepcao.alvo,
                        jardas_recebidas: (estatisticasAtuais.recepcao?.jardas_recebidas || 0) + estatisticasDoJogo.recepcao.jardas_recebidas,
                        tds_recebidos: (estatisticasAtuais.recepcao?.tds_recebidos || 0) + estatisticasDoJogo.recepcao.tds_recebidos
                    },
                    retorno: {
                        retornos: (estatisticasAtuais.retorno?.retornos || 0) + estatisticasDoJogo.retorno.retornos,
                        jardas_retornadas: (estatisticasAtuais.retorno?.jardas_retornadas || 0) + estatisticasDoJogo.retorno.jardas_retornadas,
                        td_retornados: (estatisticasAtuais.retorno?.td_retornados || 0) + estatisticasDoJogo.retorno.td_retornados
                    },
                    defesa: {
                        tackles_totais: (estatisticasAtuais.defesa?.tackles_totais || 0) + estatisticasDoJogo.defesa.tackles_totais,
                        tackles_for_loss: (estatisticasAtuais.defesa?.tackles_for_loss || 0) + estatisticasDoJogo.defesa.tackles_for_loss,
                        sacks_forcado: (estatisticasAtuais.defesa?.sacks_forcado || 0) + estatisticasDoJogo.defesa.sacks_forcado,
                        fumble_forcado: (estatisticasAtuais.defesa?.fumble_forcado || 0) + estatisticasDoJogo.defesa.fumble_forcado,
                        interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasDoJogo.defesa.interceptacao_forcada,
                        passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasDoJogo.defesa.passe_desviado,
                        safety: (estatisticasAtuais.defesa?.safety || 0) + estatisticasDoJogo.defesa.safety,
                        td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasDoJogo.defesa.td_defensivo
                    },
                    kicker: {
                        xp_bons: (estatisticasAtuais.kicker?.xp_bons || 0) + estatisticasDoJogo.kicker.xp_bons,
                        tentativas_de_xp: (estatisticasAtuais.kicker?.tentativas_de_xp || 0) + estatisticasDoJogo.kicker.tentativas_de_xp,
                        fg_bons: (estatisticasAtuais.kicker?.fg_bons || 0) + estatisticasDoJogo.kicker.fg_bons,
                        tentativas_de_fg: (estatisticasAtuais.kicker?.tentativas_de_fg || 0) + estatisticasDoJogo.kicker.tentativas_de_fg,
                        fg_mais_longo: Math.max(estatisticasAtuais.kicker?.fg_mais_longo || 0, estatisticasDoJogo.kicker.fg_mais_longo)
                    },
                    punter: {
                        punts: (estatisticasAtuais.punter?.punts || 0) + estatisticasDoJogo.punter.punts,
                        jardas_de_punt: (estatisticasAtuais.punter?.jardas_de_punt || 0) + estatisticasDoJogo.punter.jardas_de_punt
                    }
                };

                await prisma.jogadorTime.update({
                    where: { id: jogadorTime.id },
                    data: {
                        estatisticas: novasEstatisticas
                    }
                });

                resultados.sucesso++;
            } catch (error) {
                console.error(`Erro ao processar estatísticas para jogador:`, error);
                resultados.erros.push({
                    jogador: stat.jogador_nome || stat.jogador_id || 'Desconhecido',
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                });
            }
        }

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} processadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao processar estatísticas do jogo:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao processar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.get('/campeonatos/estatisticas', async (req, res) => {
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2025'

        const [
            totalCampeonatos,
            campeonatosAtivos,
            timesAtivos,
            totalJogos,
            jogosFinalizados
        ] = await Promise.all([
            prisma.campeonato.count({ where: { temporada: temporadaFiltro } }),
            prisma.campeonato.count({
                where: {
                    temporada: temporadaFiltro,
                    status: 'EM_ANDAMENTO'
                }
            }),
            prisma.time.count({ where: { temporada: temporadaFiltro } }),
            prisma.jogo.count(),
            prisma.jogo.count({ where: { status: 'FINALIZADO' } })
        ])

        const stats = {
            totalCampeonatos,
            campeonatosAtivos,
            jogosAgendados: totalJogos - jogosFinalizados,
            jogosFinalizados,
            timesAtivos,
            timesParticipantes: timesAtivos,
            jogosEstaSemana: 0,
            crescimentoCampeonatos: 0,
            novosTimes: 0,
            melhoriaOperacional: 0,
            taxaConclusao: 0,
            campeonatosPorStatus: [],
            jogosPorMes: [],
            evolucaoCampeonatos: [],
            statusJogos: [],
            performancePorTipo: [],
            participacaoRegional: [],
            tendenciaMensal: [],
            atividadesRecentes: [],
            alertas: [],
            topCampeonatos: [],
            topTimes: [],
            topRegioes: [],
            mediaJogosPorCampeonato: 0,
            tempoMedioDuracao: 0,
            taxaAdiamentos: 0,
            mediaGruposPorCampeonato: 0,
            participacaoMedia: 0,
            pontuacaoMedia: 0,

            recentActivities: [],
            alerts: []
        }

        res.status(200).json(stats)
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error)
        res.status(500).json({ error: 'Erro ao buscar estatísticas' })
    }
})

adminRouter.post('/reprocessar-jogo', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' });
            return;
        }

        const { id_jogo, data_jogo, force } = req.body;

        if (!id_jogo || !data_jogo) {
            res.status(400).json({ error: 'ID do jogo e data são obrigatórios' });
            return;
        }

        const jogosJaProcessados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        let jogosProcessados: Record<string, any> = {};
        if (jogosJaProcessados && jogosJaProcessados.valor) {
            try {
                jogosProcessados = JSON.parse(jogosJaProcessados.valor);
            } catch (e) {
                console.warn('Erro ao parsear jogos processados:', e);
                jogosProcessados = {};
            }
        }

        if (!jogosProcessados[id_jogo] && !force) {
            res.status(400).json({
                error: `O jogo ${id_jogo} não foi processado anteriormente.`,
                message: 'Use a rota /atualizar-estatisticas para processá-lo pela primeira vez.'
            });
            return;
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const statsSheet = workbook.Sheets[sheetName];

        const estatisticasJogo = xlsx.utils.sheet_to_json(statsSheet) as any[];

        console.log(`Reprocessando estatísticas de ${estatisticasJogo.length} jogadores para o jogo ${id_jogo}`);

        const resultados = {
            sucesso: 0,
            erros: [] as any[]
        };

        const estatisticasOriginais = await prisma.metaDados.findFirst({
            where: { chave: `estatisticas_jogo_${id_jogo}` }
        });

        let estatisticasAnteriores: Array<{
            jogadorId: number;
            timeId: number;
            temporada: string;
            estatisticas: any;
        }> = [];

        if (estatisticasOriginais && estatisticasOriginais.valor) {
            try {
                estatisticasAnteriores = JSON.parse(estatisticasOriginais.valor);
            } catch (e) {
                console.warn('Erro ao parsear estatísticas originais:', e);
                estatisticasAnteriores = [];
            }
        }

        await prisma.$transaction(async (tx) => {

            if (estatisticasAnteriores.length > 0) {
                console.log(`Revertendo estatísticas anteriores do jogo ${id_jogo}`);

                for (const estatAnterior of estatisticasAnteriores) {
                    try {
                        const jogador = await tx.jogador.findUnique({
                            where: { id: estatAnterior.jogadorId },
                            include: {
                                times: {
                                    where: {
                                        temporada: estatAnterior.temporada,
                                        timeId: estatAnterior.timeId
                                    }
                                }
                            }
                        });

                        if (!jogador || !jogador.times || jogador.times.length === 0) {
                            console.warn(`Jogador ${estatAnterior.jogadorId} não encontrado para reverter estatísticas`);
                            continue;
                        }

                        const jogadorTime = jogador.times[0];
                        const estatisticasAtuais = jogadorTime.estatisticas as any;
                        const novasEstatisticas = {
                            passe: {
                                passes_completos: Math.max(0, (estatisticasAtuais.passe?.passes_completos || 0) - (estatAnterior.estatisticas.passe?.passes_completos || 0)),
                                passes_tentados: Math.max(0, (estatisticasAtuais.passe?.passes_tentados || 0) - (estatAnterior.estatisticas.passe?.passes_tentados || 0)),
                                jardas_de_passe: Math.max(0, (estatisticasAtuais.passe?.jardas_de_passe || 0) - (estatAnterior.estatisticas.passe?.jardas_de_passe || 0)),
                                td_passados: Math.max(0, (estatisticasAtuais.passe?.td_passados || 0) - (estatAnterior.estatisticas.passe?.td_passados || 0)),
                                interceptacoes_sofridas: Math.max(0, (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) - (estatAnterior.estatisticas.passe?.interceptacoes_sofridas || 0)),
                                sacks_sofridos: Math.max(0, (estatisticasAtuais.passe?.sacks_sofridos || 0) - (estatAnterior.estatisticas.passe?.sacks_sofridos || 0)),
                                fumble_de_passador: Math.max(0, (estatisticasAtuais.passe?.fumble_de_passador || 0) - (estatAnterior.estatisticas.passe?.fumble_de_passador || 0))
                            },
                            corrida: {
                                corridas: Math.max(0, (estatisticasAtuais.corrida?.corridas || 0) - (estatAnterior.estatisticas.corrida?.corridas || 0)),
                                jardas_corridas: Math.max(0, (estatisticasAtuais.corrida?.jardas_corridas || 0) - (estatAnterior.estatisticas.corrida?.jardas_corridas || 0)),
                                tds_corridos: Math.max(0, (estatisticasAtuais.corrida?.tds_corridos || 0) - (estatAnterior.estatisticas.corrida?.tds_corridos || 0)),
                                fumble_de_corredor: Math.max(0, (estatisticasAtuais.corrida?.fumble_de_corredor || 0) - (estatAnterior.estatisticas.corrida?.fumble_de_corredor || 0))
                            },
                            recepcao: {
                                recepcoes: Math.max(0, (estatisticasAtuais.recepcao?.recepcoes || 0) - (estatAnterior.estatisticas.recepcao?.recepcoes || 0)),
                                alvo: Math.max(0, (estatisticasAtuais.recepcao?.alvo || 0) - (estatAnterior.estatisticas.recepcao?.alvo || 0)),
                                jardas_recebidas: Math.max(0, (estatisticasAtuais.recepcao?.jardas_recebidas || 0) - (estatAnterior.estatisticas.recepcao?.jardas_recebidas || 0)),
                                tds_recebidos: Math.max(0, (estatisticasAtuais.recepcao?.tds_recebidos || 0) - (estatAnterior.estatisticas.recepcao?.tds_recebidos || 0))
                            },
                            retorno: {
                                retornos: Math.max(0, (estatisticasAtuais.retorno?.retornos || 0) - (estatAnterior.estatisticas.retorno?.retornos || 0)),
                                jardas_retornadas: Math.max(0, (estatisticasAtuais.retorno?.jardas_retornadas || 0) - (estatAnterior.estatisticas.retorno?.jardas_retornadas || 0)),
                                td_retornados: Math.max(0, (estatisticasAtuais.retorno?.td_retornados || 0) - (estatAnterior.estatisticas.retorno?.td_retornados || 0))
                            },
                            defesa: {
                                tackles_totais: Math.max(0, (estatisticasAtuais.defesa?.tackles_totais || 0) - (estatAnterior.estatisticas.defesa?.tackles_totais || 0)),
                                tackles_for_loss: Math.max(0, (estatisticasAtuais.defesa?.tackles_for_loss || 0) - (estatAnterior.estatisticas.defesa?.tackles_for_loss || 0)),
                                sacks_forcado: Math.max(0, (estatisticasAtuais.defesa?.sacks_forcado || 0) - (estatAnterior.estatisticas.defesa?.sacks_forcado || 0)),
                                fumble_forcado: Math.max(0, (estatisticasAtuais.defesa?.fumble_forcado || 0) - (estatAnterior.estatisticas.defesa?.fumble_forcado || 0)),
                                interceptacao_forcada: Math.max(0, (estatisticasAtuais.defesa?.interceptacao_forcada || 0) - (estatAnterior.estatisticas.defesa?.interceptacao_forcada || 0)),
                                passe_desviado: Math.max(0, (estatisticasAtuais.defesa?.passe_desviado || 0) - (estatAnterior.estatisticas.defesa?.passe_desviado || 0)),
                                safety: Math.max(0, (estatisticasAtuais.defesa?.safety || 0) - (estatAnterior.estatisticas.defesa?.safety || 0)),
                                td_defensivo: Math.max(0, (estatisticasAtuais.defesa?.td_defensivo || 0) - (estatAnterior.estatisticas.defesa?.td_defensivo || 0))
                            },
                            kicker: {
                                xp_bons: Math.max(0, (estatisticasAtuais.kicker?.xp_bons || 0) - (estatAnterior.estatisticas.kicker?.xp_bons || 0)),
                                tentativas_de_xp: Math.max(0, (estatisticasAtuais.kicker?.tentativas_de_xp || 0) - (estatAnterior.estatisticas.kicker?.tentativas_de_xp || 0)),
                                fg_bons: Math.max(0, (estatisticasAtuais.kicker?.fg_bons || 0) - (estatAnterior.estatisticas.kicker?.fg_bons || 0)),
                                tentativas_de_fg: Math.max(0, (estatisticasAtuais.kicker?.tentativas_de_fg || 0) - (estatAnterior.estatisticas.kicker?.tentativas_de_fg || 0)),
                                fg_mais_longo: estatisticasAtuais.kicker?.fg_mais_longo || 0 // Mantém o valor atual para campo mais longo
                            },
                            punter: {
                                punts: Math.max(0, (estatisticasAtuais.punter?.punts || 0) - (estatAnterior.estatisticas.punter?.punts || 0)),
                                jardas_de_punt: Math.max(0, (estatisticasAtuais.punter?.jardas_de_punt || 0) - (estatAnterior.estatisticas.punter?.jardas_de_punt || 0))
                            }
                        };

                        await tx.jogadorTime.update({
                            where: { id: jogadorTime.id },
                            data: {
                                estatisticas: novasEstatisticas
                            }
                        });

                    } catch (error) {
                        console.error(`Erro ao reverter estatísticas para jogador ${estatAnterior.jogadorId}:`, error);
                    }
                }
            }

            const novasEstatisticasJogo: Array<{
                jogadorId: number;
                timeId: number;
                temporada: string;
                estatisticas: any;
            }> = [];

            for (const stat of estatisticasJogo) {
                try {
                    if (!stat.jogador_id && !stat.jogador_nome) {
                        resultados.erros.push({
                            linha: JSON.stringify(stat),
                            erro: 'ID ou nome do jogador é obrigatório'
                        });
                        continue;
                    }

                    const temporada = String(stat.temporada || '2025');

                    let jogador;
                    if (stat.jogador_id) {
                        jogador = await tx.jogador.findUnique({
                            where: { id: parseInt(stat.jogador_id) },
                            include: {
                                times: {
                                    where: { temporada: temporada },
                                    include: { time: true }
                                }
                            }
                        });
                    }

                    if (!jogador || !jogador.times || jogador.times.length === 0) {
                        resultados.erros.push({
                            jogador: stat.jogador_nome || stat.jogador_id,
                            erro: 'Jogador não encontrado ou não relacionado a nenhum time'
                        });
                        continue;
                    }

                    const jogadorTime = jogador.times[0];
                    const estatisticasAtuais = jogadorTime.estatisticas as any;

                    const estatisticasDoJogo = {
                        passe: {
                            passes_completos: parseInt(stat.passes_completos) || 0,
                            passes_tentados: parseInt(stat.passes_tentados) || 0,
                            jardas_de_passe: parseInt(stat.jardas_de_passe) || 0,
                            td_passados: parseInt(stat.td_passados) || 0,
                            interceptacoes_sofridas: parseInt(stat.interceptacoes_sofridas) || 0,
                            sacks_sofridos: parseInt(stat.sacks_sofridos) || 0,
                            fumble_de_passador: parseInt(stat.fumble_de_passador) || 0
                        },
                        corrida: {
                            corridas: parseInt(stat.corridas) || 0,
                            jardas_corridas: parseInt(stat.jardas_corridas) || 0,
                            tds_corridos: parseInt(stat.tds_corridos) || 0,
                            fumble_de_corredor: parseInt(stat.fumble_de_corredor) || 0
                        },
                        recepcao: {
                            recepcoes: parseInt(stat.recepcoes) || 0,
                            alvo: parseInt(stat.alvo) || 0,
                            jardas_recebidas: parseInt(stat.jardas_recebidas) || 0,
                            tds_recebidos: parseInt(stat.tds_recebidos) || 0
                        },
                        retorno: {
                            retornos: parseInt(stat.retornos) || 0,
                            jardas_retornadas: parseInt(stat.jardas_retornadas) || 0,
                            td_retornados: parseInt(stat.td_retornados) || 0
                        },
                        defesa: {
                            tackles_totais: parseInt(stat.tackles_totais) || 0,
                            tackles_for_loss: parseInt(stat.tackles_for_loss) || 0,
                            sacks_forcado: parseInt(stat.sacks_forcado) || 0,
                            fumble_forcado: parseInt(stat.fumble_forcado) || 0,
                            interceptacao_forcada: parseInt(stat.interceptacao_forcada) || 0,
                            passe_desviado: parseInt(stat.passe_desviado) || 0,
                            safety: parseInt(stat.safety) || 0,
                            td_defensivo: parseInt(stat.td_defensivo) || 0
                        },
                        kicker: {
                            xp_bons: parseInt(stat.xp_bons) || 0,
                            tentativas_de_xp: parseInt(stat.tentativas_de_xp) || 0,
                            fg_bons: parseInt(stat.fg_bons) || 0,
                            tentativas_de_fg: parseInt(stat.tentativas_de_fg) || 0,
                            fg_mais_longo: parseInt(stat.fg_mais_longo) || 0
                        },
                        punter: {
                            punts: parseInt(stat.punts) || 0,
                            jardas_de_punt: parseInt(stat.jardas_de_punt) || 0
                        }
                    };

                    novasEstatisticasJogo.push({
                        jogadorId: jogador.id,
                        timeId: jogadorTime.timeId,
                        temporada,
                        estatisticas: estatisticasDoJogo
                    });

                    const novasEstatisticasTotais = {
                        passe: {
                            passes_completos: (estatisticasAtuais.passe?.passes_completos || 0) + estatisticasDoJogo.passe.passes_completos,
                            passes_tentados: (estatisticasAtuais.passe?.passes_tentados || 0) + estatisticasDoJogo.passe.passes_tentados,
                            jardas_de_passe: (estatisticasAtuais.passe?.jardas_de_passe || 0) + estatisticasDoJogo.passe.jardas_de_passe,
                            td_passados: (estatisticasAtuais.passe?.td_passados || 0) + estatisticasDoJogo.passe.td_passados,
                            interceptacoes_sofridas: (estatisticasAtuais.passe?.interceptacoes_sofridas || 0) + estatisticasDoJogo.passe.interceptacoes_sofridas,
                            sacks_sofridos: (estatisticasAtuais.passe?.sacks_sofridos || 0) + estatisticasDoJogo.passe.sacks_sofridos,
                            fumble_de_passador: (estatisticasAtuais.passe?.fumble_de_passador || 0) + estatisticasDoJogo.passe.fumble_de_passador
                        },
                        corrida: {
                            corridas: (estatisticasAtuais.corrida?.corridas || 0) + estatisticasDoJogo.corrida.corridas,
                            jardas_corridas: (estatisticasAtuais.corrida?.jardas_corridas || 0) + estatisticasDoJogo.corrida.jardas_corridas,
                            tds_corridos: (estatisticasAtuais.corrida?.tds_corridos || 0) + estatisticasDoJogo.corrida.tds_corridos,
                            fumble_de_corredor: (estatisticasAtuais.corrida?.fumble_de_corredor || 0) + estatisticasDoJogo.corrida.fumble_de_corredor
                        },
                        recepcao: {
                            recepcoes: (estatisticasAtuais.recepcao?.recepcoes || 0) + estatisticasDoJogo.recepcao.recepcoes,
                            alvo: (estatisticasAtuais.recepcao?.alvo || 0) + estatisticasDoJogo.recepcao.alvo,
                            jardas_recebidas: (estatisticasAtuais.recepcao?.jardas_recebidas || 0) + estatisticasDoJogo.recepcao.jardas_recebidas,
                            tds_recebidos: (estatisticasAtuais.recepcao?.tds_recebidos || 0) + estatisticasDoJogo.recepcao.tds_recebidos
                        },
                        retorno: {
                            retornos: (estatisticasAtuais.retorno?.retornos || 0) + estatisticasDoJogo.retorno.retornos,
                            jardas_retornadas: (estatisticasAtuais.retorno?.jardas_retornadas || 0) + estatisticasDoJogo.retorno.jardas_retornadas,
                            td_retornados: (estatisticasAtuais.retorno?.td_retornados || 0) + estatisticasDoJogo.retorno.td_retornados
                        },
                        defesa: {
                            tackles_totais: (estatisticasAtuais.defesa?.tackles_totais || 0) + estatisticasDoJogo.defesa.tackles_totais,
                            tackles_for_loss: (estatisticasAtuais.defesa?.tackles_for_loss || 0) + estatisticasDoJogo.defesa.tackles_for_loss,
                            sacks_forcado: (estatisticasAtuais.defesa?.sacks_forcado || 0) + estatisticasDoJogo.defesa.sacks_forcado,
                            fumble_forcado: (estatisticasAtuais.defesa?.fumble_forcado || 0) + estatisticasDoJogo.defesa.fumble_forcado,
                            interceptacao_forcada: (estatisticasAtuais.defesa?.interceptacao_forcada || 0) + estatisticasDoJogo.defesa.interceptacao_forcada,
                            passe_desviado: (estatisticasAtuais.defesa?.passe_desviado || 0) + estatisticasDoJogo.defesa.passe_desviado,
                            safety: (estatisticasAtuais.defesa?.safety || 0) + estatisticasDoJogo.defesa.safety,
                            td_defensivo: (estatisticasAtuais.defesa?.td_defensivo || 0) + estatisticasDoJogo.defesa.td_defensivo
                        },
                        kicker: {
                            xp_bons: (estatisticasAtuais.kicker?.xp_bons || 0) + estatisticasDoJogo.kicker.xp_bons,
                            tentativas_de_xp: (estatisticasAtuais.kicker?.tentativas_de_xp || 0) + estatisticasDoJogo.kicker.tentativas_de_xp,
                            fg_bons: (estatisticasAtuais.kicker?.fg_bons || 0) + estatisticasDoJogo.kicker.fg_bons,
                            tentativas_de_fg: (estatisticasAtuais.kicker?.tentativas_de_fg || 0) + estatisticasDoJogo.kicker.tentativas_de_fg,
                            fg_mais_longo: Math.max(estatisticasAtuais.kicker?.fg_mais_longo || 0, estatisticasDoJogo.kicker.fg_mais_longo)
                        },
                        punter: {
                            punts: (estatisticasAtuais.punter?.punts || 0) + estatisticasDoJogo.punter.punts,
                            jardas_de_punt: (estatisticasAtuais.punter?.jardas_de_punt || 0) + estatisticasDoJogo.punter.jardas_de_punt
                        }
                    };

                    await tx.jogadorTime.update({
                        where: { id: jogadorTime.id },
                        data: {
                            estatisticas: novasEstatisticasTotais
                        }
                    });

                    resultados.sucesso++;
                } catch (error) {
                    console.error(`Erro ao processar estatísticas para jogador:`, error);
                    resultados.erros.push({
                        jogador: stat.jogador_nome || stat.jogador_id || 'Desconhecido',
                        erro: error instanceof Error ? error.message : 'Erro desconhecido'
                    });
                }
            }

            await tx.metaDados.upsert({
                where: { chave: `estatisticas_jogo_${id_jogo}` },
                update: { valor: JSON.stringify(novasEstatisticasJogo) },
                create: {
                    chave: `estatisticas_jogo_${id_jogo}`,
                    valor: JSON.stringify(novasEstatisticasJogo)
                }
            });

            jogosProcessados[id_jogo] = {
                dataJogo: data_jogo,
                processadoEm: new Date().toISOString(),
                reprocessado: true
            };

            await tx.metaDados.upsert({
                where: { chave: 'jogos_processados' },
                update: { valor: JSON.stringify(jogosProcessados) },
                create: {
                    chave: 'jogos_processados',
                    valor: JSON.stringify(jogosProcessados)
                }
            });

            await tx.metaDados.upsert({
                where: { chave: `jogo_${id_jogo}` },
                update: {
                    valor: JSON.stringify({
                        id_jogo,
                        data_jogo,
                        processadoEm: new Date().toISOString(),
                        jogadoresProcessados: resultados.sucesso,
                        nomeArquivo: req.file?.originalname,
                        reprocessado: true
                    })
                },
                create: {
                    chave: `jogo_${id_jogo}`,
                    valor: JSON.stringify({
                        id_jogo,
                        data_jogo,
                        processadoEm: new Date().toISOString(),
                        jogadoresProcessados: resultados.sucesso,
                        nomeArquivo: req.file?.originalname,
                        reprocessado: true
                    })
                }
            });
        });

        fs.unlinkSync(req.file.path);

        res.status(200).json({
            mensagem: `Estatísticas do jogo ${id_jogo} reprocessadas com sucesso para ${resultados.sucesso} jogadores`,
            data_jogo,
            erros: resultados.erros.length > 0 ? resultados.erros : null
        });
    } catch (error) {
        console.error('Erro ao reprocessar estatísticas do jogo:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Erro ao reprocessar estatísticas do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

adminRouter.get('/jogos-processados', async (req, res) => {
    try {
        console.log('Rota /jogos-processados acessada');

        const metaDados = await prisma.metaDados.findFirst({
            where: { chave: 'jogos_processados' }
        });

        if (!metaDados || !metaDados.valor) {
            console.log('Nenhum jogo processado encontrado');
            res.status(200).json({ jogos: [] });
            return;
        }

        if (metaDados.valor.length > 5000000) {
            console.warn('Dados muito grandes, enviando versão simplificada');
            res.status(200).json({
                jogos: [],
                error: 'Dados muito grandes para processar',
                message: 'Por favor, contate o administrador do sistema'
            });
            return;
        }

        let jogosProcessados: Record<string, any> = {};
        try {
            const parsed = JSON.parse(metaDados.valor);

            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Formato de dados inválido');
            }

            jogosProcessados = parsed as Record<string, any>;

            console.log(`Encontrados ${Object.keys(jogosProcessados).length} jogos processados`);
        } catch (e) {
            console.error('Erro ao fazer parse do JSON de jogos processados:', e);
            res.status(200).json({
                jogos: [],
                error: 'Erro ao processar dados de jogos'
            });
            return;
        }

        const MAX_JOGOS = 100;
        const jogoKeys = Object.keys(jogosProcessados).slice(0, MAX_JOGOS);

        const jogosArray = [];
        for (const id_jogo of jogoKeys) {
            const dados = jogosProcessados[id_jogo];
            if (dados && typeof dados === 'object') {
                jogosArray.push({
                    id_jogo,
                    data_jogo: dados.dataJogo || 'Data desconhecida',
                    processado_em: dados.processadoEm || new Date().toISOString(),
                    reprocessado: !!dados.reprocessado
                });
            }
        }

        jogosArray.sort((a, b) => {
            const dateA = new Date(a.processado_em).getTime();
            const dateB = new Date(b.processado_em).getTime();

            if (isNaN(dateA) || isNaN(dateB)) return 0;

            return dateB - dateA;
        });

        res.status(200).json({
            jogos: jogosArray,
            total: Object.keys(jogosProcessados).length,
            limit: MAX_JOGOS
        });
        return;

    } catch (error) {
        console.error('Erro ao buscar jogos processados:', error);
        res.status(200).json({
            jogos: [],
            error: 'Erro interno ao buscar jogos processados'
        });
    }
});

adminRouter.get('/jogos', async (req, res) => {
    try {
        const {
            temporada = '2025',
            status,
            fase,
            rodada,
            conferencia,
            limite
        } = req.query

        const where: any = {}

        if (temporada) {
            const campeonato = await prisma.campeonato.findFirst({
                where: {
                    temporada: temporada as string,
                    isSuperliga: true
                }
            })

            if (campeonato) {
                where.campeonatoId = campeonato.id
            } else {
                res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
                return
            }
        }

        if (status) where.status = status as string
        if (fase) where.fase = fase as string
        if (rodada) where.rodada = parseInt(rodada as string)

        const jogos = await prisma.jogo.findMany({
            where,
            include: {
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true
                    }
                },
                campeonato: {
                    select: {
                        id: true,
                        nome: true,
                        temporada: true
                    }
                }
            },
            orderBy: [
                { dataJogo: 'asc' },
                { rodada: 'asc' }
            ],
            take: limite ? parseInt(limite as string) : undefined
        })

        let jogosFiltrados = jogos
        if (conferencia) {
            const timesConferencia = await prisma.time.findMany({
                where: {
                    temporada: temporada as string,
                }
            })

            const idsTimesConferencia = timesConferencia.map(t => t.id)
            jogosFiltrados = jogos.filter(jogo =>
                idsTimesConferencia.includes(jogo.timeCasaId) ||
                idsTimesConferencia.includes(jogo.timeVisitanteId)
            )
        }

        res.json(jogosFiltrados)
    } catch (error) {
        console.error('Erro ao buscar jogos:', error)
        res.status(500).json({
            error: 'Erro ao buscar jogos',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/jogos/:id', async (req, res) => {
    try {
        const { id } = req.params

        const jogo = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                timeCasa: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true,
                        presidente: true,
                        head_coach: true,
                        estadio: true
                    }
                },
                timeVisitante: {
                    select: {
                        id: true,
                        nome: true,
                        sigla: true,
                        logo: true,
                        cor: true,
                        presidente: true,
                        head_coach: true,
                        estadio: true
                    }
                },
                campeonato: {
                    select: {
                        id: true,
                        nome: true,
                        temporada: true,
                        isSuperliga: true
                    }
                },
                estatisticas: {
                    include: {
                        jogador: {
                            select: {
                                id: true,
                                nome: true,
                                posicao: true
                            }
                        },
                        time: {
                            select: {
                                id: true,
                                nome: true,
                                sigla: true
                            }
                        }
                    }
                }
            }
        })

        if (!jogo) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        res.json(jogo)
    } catch (error) {
        console.error('Erro ao buscar jogo:', error)
        res.status(500).json({
            error: 'Erro ao buscar jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.put('/jogos/:id/resultado', async (req, res) => {
    try {
        const { id } = req.params
        const { placarCasa, placarVisitante, status, observacoes } = req.body

        if (placarCasa === undefined || placarVisitante === undefined) {
            res.status(400).json({ error: 'Placares são obrigatórios' })
            return
        }

        if (placarCasa < 0 || placarVisitante < 0) {
            res.status(400).json({ error: 'Placares não podem ser negativos' })
            return
        }

        const jogoExistente = await prisma.jogo.findUnique({
            where: { id: parseInt(id) },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        })

        if (!jogoExistente) {
            res.status(404).json({ error: 'Jogo não encontrado' })
            return
        }

        let novoStatus = status || 'FINALIZADO'
        if (placarCasa === placarVisitante && (placarCasa > 0 || placarVisitante > 0)) {
            novoStatus = 'FINALIZADO'
        }

        const jogoAtualizado = await prisma.jogo.update({
            where: { id: parseInt(id) },
            data: {
                placarCasa: parseInt(placarCasa),
                placarVisitante: parseInt(placarVisitante),
                status: novoStatus,
                observacoes: observacoes || null
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            }
        })

        console.log(`Resultado atualizado: ${jogoAtualizado.timeCasa.nome} ${placarCasa} x ${placarVisitante} ${jogoAtualizado.timeVisitante.nome}`)

        res.json({
            message: 'Resultado atualizado com sucesso',
            jogo: jogoAtualizado
        })
    } catch (error) {
        console.error('Erro ao atualizar resultado:', error)
        res.status(500).json({
            error: 'Erro ao atualizar resultado do jogo',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})

adminRouter.get('/jogos/stats/:temporada', async (req, res) => {
    try {
        const { temporada } = req.params

        const campeonato = await prisma.campeonato.findFirst({
            where: {
                temporada: temporada,
                isSuperliga: true
            }
        })

        if (!campeonato) {
            res.status(404).json({ error: `Superliga ${temporada} não encontrada` })
            return
        }

        const totalJogos = await prisma.jogo.count({
            where: { campeonatoId: campeonato.id }
        })

        const jogosPorStatus = await prisma.jogo.groupBy({
            by: ['status'],
            where: { campeonatoId: campeonato.id },
            _count: { status: true }
        })

        const jogosPorFase = await prisma.jogo.groupBy({
            by: ['fase'],
            where: { campeonatoId: campeonato.id },
            _count: { fase: true }
        })

        const jogosPorRodada = await prisma.jogo.groupBy({
            by: ['rodada'],
            where: { campeonatoId: campeonato.id },
            _count: { rodada: true },
            orderBy: { rodada: 'asc' }
        })

        const proximosJogos = await prisma.jogo.findMany({
            where: {
                campeonatoId: campeonato.id,
                status: 'AGENDADO',
                dataJogo: { gte: new Date() }
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'asc' },
            take: 5
        })

        const ultimosResultados = await prisma.jogo.findMany({
            where: {
                campeonatoId: campeonato.id,
                status: 'FINALIZADO'
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'desc' },
            take: 5
        })

        const stats = {
            temporada,
            totalJogos,
            statusBreakdown: jogosPorStatus.reduce((acc, item) => {
                acc[item.status] = item._count.status
                return acc
            }, {} as Record<string, number>),
            faseBreakdown: jogosPorFase.reduce((acc, item) => {
                acc[item.fase] = item._count.fase
                return acc
            }, {} as Record<string, number>),
            rodadaBreakdown: jogosPorRodada.map(item => ({
                rodada: item.rodada,
                jogos: item._count.rodada
            })),
            proximosJogos,
            ultimosResultados
        }

        res.json(stats)
    } catch (error) {
        console.error('Erro ao buscar estatísticas dos jogos:', error)
        res.status(500).json({
            error: 'Erro ao buscar estatísticas',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})


adminRouter.post('/importar-resultados-jogos', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado' })
            return
        }

        console.log('📋 Iniciando importação de resultados...')
        console.log('Arquivo recebido:', req.file.path)

        // ✅ 1. LER E PROCESSAR PLANILHA
        const workbook = xlsx.readFile(req.file.path)
        const sheetName = workbook.SheetNames[0]
        const resultadosSheet = workbook.Sheets[sheetName]
        const resultadosRaw = xlsx.utils.sheet_to_json(resultadosSheet) as any[]

        const resultados = { sucesso: 0, erros: [] as any[] }

        // ✅ 2. PROCESSAR CADA RESULTADO
        for (const resultado of resultadosRaw) {
            try {
                const jogo = await prisma.jogo.findUnique({
                    where: { id: parseInt(resultado.id_jogo) }
                })

                if (!jogo) {
                    resultados.erros.push({
                        linha: resultado.id_jogo,
                        erro: 'Jogo não encontrado'
                    })
                    continue
                }

                await prisma.jogo.update({
                    where: { id: jogo.id },
                    data: {
                        placarCasa: parseInt(resultado.placar_mandante) || 0,
                        placarVisitante: parseInt(resultado.placar_visitante) || 0,
                        status: 'FINALIZADO'
                    }
                })

                resultados.sucesso++
                console.log(`✅ Jogo ${jogo.id} atualizado: ${resultado.placar_mandante} x ${resultado.placar_visitante}`)

            } catch (error) {
                resultados.erros.push({
                    linha: resultado.id_jogo,
                    erro: error instanceof Error ? error.message : 'Erro desconhecido'
                })
            }
        }

        fs.unlinkSync(req.file.path)
        console.log(`🎉 Importação concluída: ${resultados.sucesso} jogos atualizados`)

        // ✅ 3. LÓGICA AUTOMÁTICA DE GERAÇÃO DE PLAYOFFS
        console.log('\n🔍 Verificando se deve gerar playoffs automaticamente...')

        // Buscar superliga
        const superliga = await prisma.campeonato.findFirst({
            where: {
                temporada: '2025',
                isSuperliga: true
            },
            include: {
                conferencias: {
                    include: {
                        regionais: true
                    }
                }
            }
        })

        if (!superliga) {
            console.log('⚠️  Superliga não encontrada')
            res.json({
                mensagem: `${resultados.sucesso} resultados importados`,
                erros: resultados.erros.length > 0 ? resultados.erros : null
            })
            return
        }

        // Verificar status atual
        const jogosTemporadaRegular = await prisma.jogo.count({
            where: {
                campeonatoId: superliga.id,
                fase: 'TEMPORADA_REGULAR'
            }
        })

        const jogosFinalizados = await prisma.jogo.count({
            where: {
                campeonatoId: superliga.id,
                fase: 'TEMPORADA_REGULAR',
                status: 'FINALIZADO'
            }
        })

        console.log(`📊 Status: ${jogosFinalizados}/${jogosTemporadaRegular} jogos da temporada regular finalizados`)

        // ✅ 4. VERIFICAR SE DEVE GERAR PLAYOFFS
        if (jogosFinalizados === jogosTemporadaRegular && jogosTemporadaRegular > 0) {
            // Verificar se playoffs já existem
            const playoffsExistentes = await prisma.playoffJogo.count({
                where: { campeonatoId: superliga.id }
            })

            if (playoffsExistentes === 0) {
                console.log('🏆 TODOS OS JOGOS FINALIZADOS! Gerando playoffs automaticamente...')

                try {
                    // ✅ 5. CALCULAR CLASSIFICAÇÃO
                    const distribuicao = await prisma.distribuicaoTime.findMany({
                        where: { campeonatoId: superliga.id },
                        include: {
                            time: true,
                            conferencia: true,
                            regional: true
                        }
                    })

                    const jogos = await prisma.jogo.findMany({
                        where: {
                            campeonatoId: superliga.id,
                            fase: 'TEMPORADA_REGULAR',
                            status: 'FINALIZADO'
                        }
                    })

                    // Calcular classificação por regional
                    const classificacaoPorRegional = new Map()

                    // Agrupar times por regional
                    const timesPorRegional = new Map()
                    distribuicao.forEach(dist => {
                        const key = dist.regionalType
                        if (!timesPorRegional.has(key)) {
                            timesPorRegional.set(key, [])
                        }
                        timesPorRegional.get(key).push(dist)
                    })

                    // Calcular estatísticas para cada regional
                    for (const [regionalTipo, timesRegional] of timesPorRegional) {
                        const classificacao = []

                        for (const dist of timesRegional) {
                            const jogosTime = jogos.filter(j =>
                                j.timeCasaId === dist.timeId || j.timeVisitanteId === dist.timeId
                            )

                            let vitorias = 0, derrotas = 0, pontosPro = 0, pontosContra = 0

                            jogosTime.forEach(jogo => {
                                const isTimeCasa = jogo.timeCasaId === dist.timeId
                                const pontosFeitos = isTimeCasa ? (jogo.placarCasa || 0) : (jogo.placarVisitante || 0)
                                const pontosSofridos = isTimeCasa ? (jogo.placarVisitante || 0) : (jogo.placarCasa || 0)

                                pontosPro += pontosFeitos
                                pontosContra += pontosSofridos

                                if (pontosFeitos > pontosSofridos) {
                                    vitorias++
                                } else if (pontosSofridos > pontosFeitos) {
                                    derrotas++
                                }
                            })

                            classificacao.push({
                                timeId: dist.timeId,
                                time: dist.time,
                                vitorias,
                                derrotas,
                                pontosPro,
                                pontosContra,
                                saldo: pontosPro - pontosContra,
                                regionalTipo
                            })
                        }

                        // Ordenar por vitórias, depois por saldo
                        classificacao.sort((a, b) => {
                            if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                            if (b.saldo !== a.saldo) return b.saldo - a.saldo
                            return b.pontosPro - a.pontosPro
                        })

                        classificacao.forEach((item, index) => {
                            (item as any).posicaoRegional = index + 1
                        })

                        classificacaoPorRegional.set(regionalTipo, classificacao)
                        console.log(`   📋 ${regionalTipo}: ${classificacao.length} times classificados`)
                    }

                    // ✅ 6. GERAR PLAYOFFS POR CONFERÊNCIA
                    let totalPlayoffJogos = 0

                    for (const conferencia of superliga.conferencias) {
                        console.log(`\n🏟️  Gerando playoffs ${conferencia.nome}...`)

                        if (conferencia.tipo === 'CENTRO_NORTE') {
                            // Centro-Norte: direto para semifinal (3 times por regional)
                            const cerrado = classificacaoPorRegional.get('CERRADO') || []
                            const amazonia = classificacaoPorRegional.get('AMAZONIA') || []

                            if (cerrado.length > 0 && amazonia.length > 0) {
                                // Semifinal 1: 1º Cerrado vs 2º Amazônia
                                const semi1 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'SEMIFINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Semifinal ${conferencia.nome} 1`,
                                        timeClassificado1Id: cerrado[0]?.timeId,
                                        timeClassificado2Id: amazonia[1]?.timeId,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                // Semifinal 2: 1º Amazônia vs 2º Cerrado
                                const semi2 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'SEMIFINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Semifinal ${conferencia.nome} 2`,
                                        timeClassificado1Id: amazonia[0]?.timeId,
                                        timeClassificado2Id: cerrado[1]?.timeId,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                // Final da conferência
                                await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'FINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Final ${conferencia.nome}`,
                                        jogoAnterior1Id: semi1.id,
                                        jogoAnterior2Id: semi2.id,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                totalPlayoffJogos += 3
                                console.log(`     ✅ 3 jogos gerados`)
                            }

                        } else {
                            // Outras conferências: com wild cards
                            const regionaisTipos = conferencia.regionais.map(r => r.tipo)
                            const primeirosColocados: TimeClassificado[] = []
                            const segundosColocados: TimeClassificado[] = []

                            regionaisTipos.forEach(regionalTipo => {
                                const classificacao = classificacaoPorRegional.get(regionalTipo) || []
                                if (classificacao[0]) primeirosColocados.push(classificacao[0])
                                if (classificacao[1]) segundosColocados.push(classificacao[1])
                            })

                            // Ordenar primeiros e segundos colocados
                            const ordenarTimes = (times: TimeClassificado[]) => times.sort((a, b) => {
                                if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
                                if (b.saldo !== a.saldo) return b.saldo - a.saldo
                                return b.pontosPro - a.pontosPro
                            })

                            ordenarTimes(primeirosColocados)
                            ordenarTimes(segundosColocados)

                            if (primeirosColocados.length >= 2 && segundosColocados.length >= 2) {
                                // Wild Cards
                                const wc1 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'WILD_CARD',
                                        rodada: 1,
                                        nome: `Wild Card ${conferencia.nome} 1`,
                                        timeClassificado1Id: primeirosColocados[2]?.timeId || segundosColocados[0]?.timeId,
                                        timeClassificado2Id: segundosColocados[2]?.timeId || segundosColocados[1]?.timeId,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                const wc2 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'WILD_CARD',
                                        rodada: 1,
                                        nome: `Wild Card ${conferencia.nome} 2`,
                                        timeClassificado1Id: segundosColocados[0]?.timeId,
                                        timeClassificado2Id: segundosColocados[1]?.timeId,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                // Semifinais
                                const semi1 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'SEMIFINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Semifinal ${conferencia.nome} 1`,
                                        timeClassificado1Id: primeirosColocados[0]?.timeId,
                                        jogoAnterior2Id: wc1.id,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                const semi2 = await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'SEMIFINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Semifinal ${conferencia.nome} 2`,
                                        timeClassificado1Id: primeirosColocados[1]?.timeId,
                                        jogoAnterior2Id: wc2.id,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                // Final da conferência
                                await prisma.playoffJogo.create({
                                    data: {
                                        campeonatoId: superliga.id,
                                        conferenciaId: conferencia.id,
                                        fase: 'FINAL_CONFERENCIA',
                                        rodada: 1,
                                        nome: `Final ${conferencia.nome}`,
                                        jogoAnterior1Id: semi1.id,
                                        jogoAnterior2Id: semi2.id,
                                        status: 'AGUARDANDO'
                                    }
                                })

                                totalPlayoffJogos += 5
                                console.log(`     ✅ 5 jogos gerados (2 WC + 2 SF + 1 F)`)
                            }
                        }
                    }

                    // ✅ 7. GERAR FASE NACIONAL
                    const semifinalNacional1 = await prisma.playoffJogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            fase: 'SEMIFINAL_NACIONAL',
                            rodada: 1,
                            nome: 'Semifinal Nacional 1',
                            status: 'AGUARDANDO'
                        }
                    })

                    const semifinalNacional2 = await prisma.playoffJogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            fase: 'SEMIFINAL_NACIONAL',
                            rodada: 1,
                            nome: 'Semifinal Nacional 2',
                            status: 'AGUARDANDO'
                        }
                    })

                    await prisma.playoffJogo.create({
                        data: {
                            campeonatoId: superliga.id,
                            fase: 'FINAL_NACIONAL',
                            rodada: 1,
                            nome: 'Grande Decisão Nacional',
                            jogoAnterior1Id: semifinalNacional1.id,
                            jogoAnterior2Id: semifinalNacional2.id,
                            status: 'AGUARDANDO'
                        }
                    })

                    totalPlayoffJogos += 3

                    // ✅ 8. ATUALIZAR STATUS DA SUPERLIGA
                    await prisma.campeonato.update({
                        where: { id: superliga.id },
                        data: { status: 'PLAYOFFS' }
                    })

                    console.log(`\n🎉 PLAYOFFS GERADOS AUTOMATICAMENTE!`)
                    console.log(`📊 Total de jogos de playoff: ${totalPlayoffJogos}`)
                    console.log(`✅ Status da Superliga: PLAYOFFS`)

                    // Resposta com playoffs gerados
                    res.json({
                        mensagem: `${resultados.sucesso} resultados importados`,
                        erros: resultados.erros.length > 0 ? resultados.erros : null,
                        playoffsGerados: true,
                        totalJogosPlayoffs: totalPlayoffJogos,
                        statusSuperliga: 'PLAYOFFS',
                        proximaFase: '🏆 Playoffs gerados automaticamente! Acesse as páginas de Wild Card.'
                    })
                    return

                } catch (errorPlayoffs) {
                    console.error('❌ Erro ao gerar playoffs automaticamente:', errorPlayoffs)
                    // Continuar normalmente mesmo se der erro
                }
            } else {
                console.log(`⚠️  Playoffs já existem (${playoffsExistentes} jogos)`)
            }
        } else {
            const faltam = jogosTemporadaRegular - jogosFinalizados
            console.log(`⏳ Ainda faltam ${faltam} jogos para finalizar a temporada regular`)
        }

        // ✅ 9. RESPOSTA NORMAL (se não gerou playoffs)
        res.json({
            mensagem: `${resultados.sucesso} resultados importados`,
            erros: resultados.erros.length > 0 ? resultados.erros : null,
            statusTemporadaRegular: `${jogosFinalizados}/${jogosTemporadaRegular} jogos finalizados`,
            proximaFase: jogosFinalizados === jogosTemporadaRegular ? 'Pronto para playoffs!' : `Faltam ${jogosTemporadaRegular - jogosFinalizados} jogos`
        })

    } catch (error) {
        console.error('❌ Erro ao processar resultados:', error)

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path)
        }

        res.status(500).json({
            error: 'Erro ao processar resultados',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
    }
})



async function gerarTodosPlayoffs(campeonatoId: number) {
    const conferencias = await prisma.conferencia.findMany({
        where: { campeonatoId },
        include: { regionais: true }
    })

    let totalPlayoffJogos = 0

    for (const conf of conferencias) {
        console.log(`   📋 ${conf.nome}: ${conf.regionais.length} regionais`)

        try {
            let resultado

            switch (conf.tipo) {
                case 'SUDESTE':
                    resultado = await gerarPlayoffsSudeste(campeonatoId, conf.id)
                    totalPlayoffJogos += 5
                    break

                case 'SUL':
                    resultado = await gerarPlayoffsSul(campeonatoId, conf.id)
                    totalPlayoffJogos += 5
                    break

                case 'NORDESTE':
                    resultado = await gerarPlayoffsNordeste(campeonatoId, conf.id)
                    totalPlayoffJogos += 4
                    break

                case 'CENTRO_NORTE':
                    resultado = await gerarPlayoffsCentroNorte(campeonatoId, conf.id)
                    totalPlayoffJogos += 3
                    break
            }

            if (resultado) {
                console.log(`     ✅ ${resultado.wildcards.length} WC + ${resultado.semifinais.length} SF + 1 F`)
            }

        } catch (error) {
            console.error(`     ❌ Erro ao gerar playoffs ${conf.nome}:`, error)
        }
    }

    console.log(`🎉 PLAYOFFS GERADOS AUTOMATICAMENTE!`)
    console.log(`📊 Total de jogos de playoff: ${totalPlayoffJogos}`)
}

// ========== ROTAS CORRIGIDAS ==========

// ✅ CORRIGIDO: Tipagem explícita das rotas
adminRouter.get('/status-superliga/:temporada', async (req: Request, res: Response): Promise<void> => {
    try {
        const { temporada } = req.params

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true },
            include: {
                conferencias: {
                    include: { regionais: true }
                }
            }
        })

        if (!superliga) {
            res.status(404).json({ error: 'Superliga não encontrada' })
            return
        }

        const jogosStats = await prisma.jogo.groupBy({
            by: ['status'],
            where: { campeonatoId: superliga.id },
            _count: { id: true }
        })

        const playoffStats = await prisma.playoffJogo.groupBy({
            by: ['status'],
            where: { campeonatoId: superliga.id },
            _count: { id: true }
        })

        const proximosJogos = await prisma.jogo.findMany({
            where: {
                campeonatoId: superliga.id,
                status: 'AGENDADO',
                dataJogo: { gte: new Date() }
            },
            include: {
                timeCasa: { select: { nome: true, sigla: true } },
                timeVisitante: { select: { nome: true, sigla: true } }
            },
            orderBy: { dataJogo: 'asc' },
            take: 10
        })

        const classificacao = await calcularClassificacaoPorConferencia(superliga.id)

        const config = superliga.configSuperliga as any
        const faseAtual = config?.faseAtual || 'CONFIGURACAO'
        const playoffsFinalizados = playoffStats.find(s => s.status === 'FINALIZADO')?._count.id || 0

        const status = {
            superliga: {
                id: superliga.id,
                nome: superliga.nome,
                temporada: superliga.temporada,
                status: superliga.status,
                fase: faseAtual
            },
            estrutura: {
                conferencias: superliga.conferencias.length,
                regionais: superliga.conferencias.reduce((acc, c) => acc + c.regionais.length, 0),
                times: 32
            },
            jogos: {
                temporadaRegular: jogosStats.reduce((acc, stat) => acc + stat._count.id, 0),
                playoffs: playoffStats.reduce((acc, stat) => acc + stat._count.id, 0),
                porStatus: {
                    agendados: jogosStats.find(s => s.status === 'AGENDADO')?._count.id || 0,
                    finalizados: jogosStats.find(s => s.status === 'FINALIZADO')?._count.id || 0,
                    aoVivo: jogosStats.find(s => s.status === 'AO_VIVO')?._count.id || 0
                }
            },
            proximosJogos,
            classificacao,
            acoes: {
                podeGerarPlayoffs: (jogosStats.find(s => s.status === 'FINALIZADO')?._count.id || 0) === 64,
                podeGerarFaseNacional: playoffsFinalizados >= 16
            }
        }

        res.json(status)
        return

    } catch (error) {
        console.error('Erro ao buscar status:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
        return
    }
})

adminRouter.post('/gerar-playoffs-manual/:temporada', async (req: Request, res: Response): Promise<void> => {
    try {
        const { temporada } = req.params

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true }
        })

        if (!superliga) {
            res.status(404).json({ error: 'Superliga não encontrada' })
            return
        }

        const playoffsExistentes = await prisma.playoffJogo.count({
            where: { campeonatoId: superliga.id }
        })

        if (playoffsExistentes > 0) {
            res.status(400).json({
                error: 'Playoffs já foram gerados',
                total: playoffsExistentes
            })
            return
        }

        await gerarTodosPlayoffs(superliga.id)

        await prisma.campeonato.update({
            where: { id: superliga.id },
            data: {
                status: 'PLAYOFFS',
                configSuperliga: {
                    faseAtual: 'PLAYOFFS_CONFERENCIA',
                    playoffsGeradosEm: new Date().toISOString(),
                    geradoManualmente: true
                } as any
            }
        })

        const totalPlayoffs = await prisma.playoffJogo.count({
            where: { campeonatoId: superliga.id }
        })

        res.json({
            message: 'Playoffs gerados com sucesso!',
            totalJogos: totalPlayoffs,
            status: 'PLAYOFFS'
        })
        return

    } catch (error) {
        console.error('Erro ao gerar playoffs:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
        return
    }
})

adminRouter.post('/simular-temporada/:temporada', async (req: Request, res: Response): Promise<void> => {
    try {
        const { temporada } = req.params
        const { etapas } = req.body

        const superliga = await prisma.campeonato.findFirst({
            where: { temporada, isSuperliga: true }
        })

        if (!superliga) {
            res.status(404).json({ error: 'Superliga não encontrada' })
            return
        }

        const resultados = {
            temporadaRegular: 0,
            playoffs: 0,
            faseNacional: 0
        }

        if (!etapas || etapas.includes('temporada')) {
            const jogosTemporada = await prisma.jogo.findMany({
                where: {
                    campeonatoId: superliga.id,
                    status: 'AGENDADO'
                }
            })

            for (const jogo of jogosTemporada) {
                await prisma.jogo.update({
                    where: { id: jogo.id },
                    data: {
                        placarCasa: Math.floor(Math.random() * 42) + 3,
                        placarVisitante: Math.floor(Math.random() * 42) + 3,
                        status: 'FINALIZADO'
                    }
                })
            }

            resultados.temporadaRegular = jogosTemporada.length
        }

        if (!etapas || etapas.includes('playoffs')) {
            await gerarTodosPlayoffs(superliga.id)

            const jogosPlayoff = await prisma.playoffJogo.findMany({
                where: {
                    campeonatoId: superliga.id,
                    fase: { in: ['WILD_CARD', 'SEMIFINAL_CONFERENCIA', 'FINAL_CONFERENCIA'] }
                }
            })

            for (const jogo of jogosPlayoff) {
                const time1 = jogo.timeClassificado1Id
                const time2 = jogo.timeClassificado2Id

                if (time1 && time2) {
                    const vencedor = Math.random() > 0.5 ? time1 : time2

                    await prisma.playoffJogo.update({
                        where: { id: jogo.id },
                        data: {
                            status: 'FINALIZADO',
                            timeVencedorId: vencedor,
                            placarTime1: Math.floor(Math.random() * 35) + 10,
                            placarTime2: Math.floor(Math.random() * 28) + 7
                        }
                    })
                }
            }

            resultados.playoffs = jogosPlayoff.length
        }

        if (!etapas || etapas.includes('nacional')) {
            resultados.faseNacional = 4
        }

        res.json({
            message: 'Simulação concluída com sucesso!',
            resultados,
            total: resultados.temporadaRegular + resultados.playoffs + resultados.faseNacional
        })
        return

    } catch (error) {
        console.error('Erro na simulação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
        return
    }
})

// ✅ CORRIGIDO: Import e uso correto do xlsx
adminRouter.post('/importar-resultados-incremental', upload.single('arquivo'), async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Arquivo não enviado' })
            return
        }

        const { temporada } = req.body

        if (!temporada) {
            res.status(400).json({ error: 'Temporada é obrigatória' })
            return
        }

        // ✅ CORRIGIDO: Usar xlsx em vez de XLSX
        const workbook = xlsx.read(req.file.buffer)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const dados = xlsx.utils.sheet_to_json(worksheet)

        console.log(`📥 Importação incremental: ${dados.length} jogos`)

        let jogosAtualizados = 0
        let playoffsGerados = false
        const erros: string[] = []

        for (const linha of dados as any[]) {
            try {
                const jogoId = parseInt(linha.ID || linha.id || linha.JOGO_ID)
                const placarCasa = parseInt(linha.PLACAR_CASA || linha.placarCasa)
                const placarVisitante = parseInt(linha.PLACAR_VISITANTE || linha.placarVisitante)

                if (isNaN(jogoId) || isNaN(placarCasa) || isNaN(placarVisitante)) {
                    throw new Error('Dados inválidos: ID, placar casa e visitante são obrigatórios')
                }

                const jogo = await prisma.jogo.update({
                    where: { id: jogoId },
                    data: {
                        placarCasa,
                        placarVisitante,
                        status: 'FINALIZADO',
                        observacoes: linha.OBSERVACOES || linha.observacoes || null
                    },
                    include: { campeonato: true }
                })

                console.log(`✅ Jogo ${jogoId} atualizado: ${placarCasa} x ${placarVisitante}`)
                jogosAtualizados++

                const jogoAtualizado = await prisma.jogo.findFirst({
                    where: { id: jogoId },
                    include: { campeonato: true }
                })

                if (jogoAtualizado?.campeonato.isSuperliga) {
                    const resultado = await verificarGeracaoAutomaticaPlayoffs(jogoAtualizado.campeonatoId)
                    if (resultado.playoffsGerados) {
                        console.log('🎉 Playoffs gerados automaticamente após importação!')
                    }
                }

                if (jogo.campeonato.isSuperliga && !playoffsGerados) {
                    const resultado = await verificarGeracaoAutomaticaPlayoffs(jogo.campeonatoId)
                    if (resultado.playoffsGerados) {
                        playoffsGerados = true
                        console.log('🎉 Playoffs gerados automaticamente!')
                    }
                }

            } catch (error) {
                erros.push(`Jogo ID ${linha.ID}: ${error}`)
                console.error(`❌ Erro no jogo ${linha.ID}:`, error)
            }
        }

        const resposta = {
            message: `Importação incremental concluída`,
            jogosAtualizados,
            playoffsGerados,
            erros: erros.length > 0 ? erros : undefined,
            proximaEtapa: playoffsGerados ? 'Playoffs gerados! Verifique as páginas de playoff.' : 'Continue importando jogos conforme acontecem.'
        }
        res.status(200).json(resposta)
        return

    } catch (error) {
        console.error('Erro na importação incremental:', error)
        res.status(500).json({
            error: 'Erro interno do servidor',
            details: error instanceof Error ? error.message : 'Erro desconhecido'
        })
        return
    }
})

export default adminRouter