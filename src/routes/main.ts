import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { TimeSchema } from '../schemas/Time'
import { JogadorSchema } from '../schemas/Jogador'
import { Times } from '../data/times'

const prisma = new PrismaClient()

export const mainRouter = express.Router()

// Rota para obter todos os times com seus jogadores, com filtro opcional de temporada
mainRouter.get('/times', async (req, res) => {
    console.log('Rota /api/times chamada')
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2024' // Default para 2024 se não especificado

        const times = await prisma.time.findMany({
            where: { temporada: temporadaFiltro },
            include: {
                jogadores: {
                    where: { temporada: temporadaFiltro },
                    include: { jogador: true }
                },
            },
        });

        // Transformar os dados para manter compatibilidade com o frontend existente
        const timesFormatados = times.map(time => ({
            ...time,
            jogadores: time.jogadores.map(jt => ({
                ...jt.jogador,
                numero: jt.numero,
                camisa: jt.camisa,
                estatisticas: jt.estatisticas,
                timeId: time.id,
                temporada: jt.temporada
            }))
        }));

        res.status(200).json(timesFormatados)
    } catch (error) {
        console.error('Erro ao buscar os times:', error)
        res.status(500).json({ error: 'Erro ao buscar os times' })
    }
})

// Rota para adicionar um único time e seus jogadores
mainRouter.post('/time', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body)

        // Criação do time sem permitir campos `undefined`
        const createdTeam = await prisma.time.create({
            data: {
                nome: teamData.nome || '',
                sigla: teamData.sigla || '',
                cor: teamData.cor || '',
                cidade: teamData.cidade || '',
                bandeira_estado: teamData.bandeira_estado || '',
                fundacao: teamData.fundacao || '',
                logo: teamData.logo || '',
                capacete: teamData.capacete || '',
                instagram: teamData.instagram || '',
                instagram2: teamData.instagram2 || '',
                estadio: teamData.estadio || '',
                presidente: teamData.presidente || '',
                head_coach: teamData.head_coach || '',
                instagram_coach: teamData.instagram_coach || '',
                coord_ofen: teamData.coord_ofen || '',
                coord_defen: teamData.coord_defen || '',
                titulos: teamData.titulos || [],
                temporada: teamData.temporada || '2024', // Adiciona temporada com valor padrão
            },
        })

        // Criação dos jogadores e seus vínculos com times
        if (teamData.jogadores && teamData.jogadores.length > 0) {
            for (const player of teamData.jogadores) {
                // Primeiro, cria o jogador
                const jogadorCriado = await prisma.jogador.create({
                    data: {
                        nome: player.nome || '',
                        timeFormador: player.timeFormador || '',
                        posicao: player.posicao || '',
                        setor: player.setor || 'Ataque',
                        experiencia: player.experiencia || 0,
                        idade: player.idade || 0,
                        altura: player.altura || 0,
                        peso: player.peso || 0,
                        instagram: player.instagram || '',
                        instagram2: player.instagram2 || '',
                        cidade: player.cidade || '',
                        nacionalidade: player.nacionalidade || '',
                    },
                })

                // Depois, cria o vínculo entre jogador e time
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: jogadorCriado.id,
                        timeId: createdTeam.id,
                        temporada: teamData.temporada || '2024',
                        numero: player.numero || 0,
                        camisa: player.camisa || '',
                        estatisticas: player.estatisticas || {},
                    },
                })
            }
        }

        res.status(201).json({
            team: createdTeam,
            players: teamData.jogadores?.length ? 'Jogadores criados' : 'Nenhum jogador adicionado',
        })
    } catch (error) {
        console.error('Erro ao criar time e jogadores:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

// Rota para atualizar informações de um time
mainRouter.put('/time/:id', async (req, res) => {
    const { id } = req.params

    try {
        // Remove o campo 'id' do objeto antes de enviar para o Prisma
        const timeData = TimeSchema.parse(req.body) // Valida os dados recebidos
        const { id: _, jogadores, ...updateData } = timeData // Remove campos indesejados como 'id' ou relações

        const updatedTime = await prisma.time.update({
            where: { id: parseInt(id) }, // Identifica o time pelo ID
            data: updateData, // Atualiza apenas os campos válidos
        })

        res.status(200).json(updatedTime)
    } catch (error) {
        console.error('Erro ao atualizar o time:', error)
        res.status(500).json({ error: 'Erro ao atualizar o time' })
    }
})

//Rota para deletar um time
mainRouter.delete('/time/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        // Extrai o ID do time dos parâmetros da URL
        const id = parseInt(req.params.id, 10)

        // Verifica se o ID é válido
        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        // Verifica se o time existe no banco de dados
        const existingTime = await prisma.time.findUnique({
            where: { id },
        })

        if (!existingTime) {
            res.status(404).json({ error: "Time não encontrado" })
            return
        }

        // Primeiro, exclui todos os vínculos de jogadores com esse time
        await prisma.jogadorTime.deleteMany({
            where: { timeId: id },
        })

        // Depois, deleta o time do banco de dados
        await prisma.time.delete({
            where: { id },
        })

        // Retorna uma mensagem de sucesso
        res.status(200).json({ message: "Time excluído com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir time:", error)
        res.status(500).json({ error: "Erro ao excluir time" })
    }
})

// Rota para obter jogadores, com dados formatados para compatibilidade com frontend
mainRouter.get('/jogadores', async (req, res) => {
    try {
        const { temporada = '2024', timeId } = req.query

        const jogadoresTimes = await prisma.jogadorTime.findMany({
            where: {
                temporada: String(temporada),
                ...(timeId ? { timeId: parseInt(String(timeId)) } : {})
            },
            include: {
                jogador: true,
                time: true
            },
            orderBy: {
                numero: 'asc'
            }
        })

        // Formatar dados para compatibilidade com o frontend
        const jogadoresFormatados = jogadoresTimes.map(jt => ({
            ...jt.jogador,
            numero: jt.numero,
            camisa: jt.camisa,
            estatisticas: jt.estatisticas,
            timeId: jt.timeId,
            temporada: jt.temporada,
            time: jt.time
        }))

        res.status(200).json(jogadoresFormatados)
    } catch (error) {
        console.error('Erro ao buscar os jogadores:', error)
        res.status(500).json({ error: 'Erro ao buscar os jogadores' })
    }
})

// Rota para adicionar um jogador a um time
mainRouter.post('/jogador', async (req, res) => {
    try {
        const { temporada = '2024', ...jogadorRawData } = req.body;
        const jogadorData = JogadorSchema.parse(jogadorRawData);

        const estatisticas = jogadorData.estatisticas ?? {};

        // Verifica se timeId foi fornecido
        if (!jogadorData.timeId) {
            res.status(400).json({ error: 'O campo "timeId" é obrigatório.' });
            return;
        }

        // Verifica se o time existe
        const timeExiste = await prisma.time.findUnique({
            where: { id: jogadorData.timeId }
        });

        if (!timeExiste) {
            res.status(404).json({ error: 'Time não encontrado.' });
            return;
        }

        // Primeiro, cria o jogador
        const jogadorCriado = await prisma.jogador.create({
            data: {
                nome: jogadorData.nome ?? '',
                posicao: jogadorData.posicao ?? '',
                setor: jogadorData.setor ?? 'Ataque',
                experiencia: jogadorData.experiencia ?? 0,
                idade: jogadorData.idade ?? 0,
                altura: jogadorData.altura ?? 0,
                peso: jogadorData.peso ?? 0,
                instagram: jogadorData.instagram ?? '',
                instagram2: jogadorData.instagram2 ?? '',
                cidade: jogadorData.cidade ?? '',
                nacionalidade: jogadorData.nacionalidade ?? '',
                timeFormador: jogadorData.timeFormador ?? '',
            },
        });

        // Depois, cria o vínculo do jogador com o time na temporada
        const jogadorTimeVinculo = await prisma.jogadorTime.create({
            data: {
                jogadorId: jogadorCriado.id,
                timeId: jogadorData.timeId,
                temporada: String(temporada),
                numero: jogadorData.numero ?? 0,
                camisa: jogadorData.camisa ?? '',
                estatisticas: estatisticas,
            }
        });

        res.status(201).json({
            jogador: jogadorCriado,
            vinculo: jogadorTimeVinculo
        });
    } catch (error) {
        console.error('Erro ao criar o jogador:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});

// Rota para atualizar um jogador
mainRouter.put('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        console.log("Iniciando atualização do jogador...")

        // Valida o ID da URL
        const id = parseInt(req.params.id, 10)
        if (isNaN(id)) {
            console.warn("ID inválido recebido:", req.params.id)
            res.status(400).json({ error: "ID inválido" })
            return;
        }

        const { estatisticas, numero, camisa, timeId, temporada, ...jogadorData } = req.body

        // Converte campos numéricos para o tipo correto
        const numericFields = ["experiencia", "idade", "altura", "peso"]
        for (const field of numericFields) {
            if (jogadorData[field] !== undefined) {
                jogadorData[field] = Number(jogadorData[field])
            }
        }

        // Atualiza os dados básicos do jogador
        const updatedJogador = await prisma.jogador.update({
            where: { id },
            data: jogadorData,
        })

        // Atualiza o vínculo jogador-time se fornecido temporada, timeId e estatísticas
        if (temporada && timeId) {
            // Remove campos inválidos das estatísticas
            const filteredEstatisticas = estatisticas
                ? Object.fromEntries(
                    Object.entries(estatisticas).map(([group, stats]) => [
                        group,
                        Object.fromEntries(
                            Object.entries(stats || {}).filter(
                                ([_, value]) => value !== undefined && value !== ""
                            )
                        ),
                    ])
                )
                : {};

            // Busca o vínculo existente
            const vinculoExistente = await prisma.jogadorTime.findFirst({
                where: {
                    jogadorId: id,
                    timeId: parseInt(timeId),
                    temporada: temporada,
                }
            })

            if (vinculoExistente) {
                // Atualiza o vínculo existente
                await prisma.jogadorTime.update({
                    where: { id: vinculoExistente.id },
                    data: {
                        numero: numero !== undefined ? parseInt(numero) : vinculoExistente.numero,
                        camisa: camisa || vinculoExistente.camisa,
                        estatisticas: filteredEstatisticas || vinculoExistente.estatisticas,
                    }
                })
            } else {
                // Cria um novo vínculo se não existir
                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: id,
                        timeId: parseInt(timeId),
                        temporada: temporada,
                        numero: numero !== undefined ? parseInt(numero) : 0,
                        camisa: camisa || '',
                        estatisticas: filteredEstatisticas || {},
                    }
                })
            }
        }

        res.status(200).json(updatedJogador)
    } catch (error) {
        console.error("Erro ao atualizar o jogador:", error)
        res.status(500).json({ error: "Erro ao atualizar o jogador" })
    }
})

// Rota para deletar um jogador
mainRouter.delete('/jogador/:id', async (req: Request<{ id: string }>, res: Response) => {
    console.log(`DELETE request received for ID: ${req.params.id}`)
    try {
        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            console.log("Invalid ID provided")
            res.status(400).json({ error: "ID inválido" })
            return
        }

        // Primeiro, exclui todos os vínculos do jogador com times
        await prisma.jogadorTime.deleteMany({
            where: { jogadorId: id },
        })

        // Depois, exclui o jogador
        await prisma.jogador.delete({
            where: { id },
        })

        console.log(`Jogador com ID ${id} excluído com sucesso.`)
        res.status(200).json({ message: "Jogador excluído com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir jogador:", error)
        res.status(500).json({ error: "Erro ao excluir jogador" })
    }
})

// Rota para obter todas as matérias
mainRouter.get('/materias', async (req, res) => {
    try {
        const materias = await prisma.materia.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.status(200).json(materias)
    } catch (error) {
        console.error('Erro ao buscar as matérias:', error)
        res.status(500).json({ error: 'Erro ao buscar as matérias' })
    }
})

// Rota para criar matéria
mainRouter.post('/materias', async (req, res) => {
    try {
        const materiaData = req.body;

        const createdMateria = await prisma.materia.create({
            data: {
                titulo: materiaData.titulo,
                subtitulo: materiaData.subtitulo,
                imagem: materiaData.imagem,
                legenda: materiaData.legenda,
                texto: materiaData.texto,
                autor: materiaData.autor,
                autorImage: materiaData.autorImage,
                createdAt: new Date(materiaData.createdAt),
                updatedAt: new Date(materiaData.updatedAt)
            }
        });

        res.status(201).json(createdMateria);
    } catch (error) {
        console.error('Erro ao criar matéria:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
});

// Rota para atualizar matéria
mainRouter.put('/materias/:id', async (req, res) => {
    const { id } = req.params;
    const materiaData = req.body;

    try {
        const updatedMateria = await prisma.materia.update({
            where: { id: parseInt(id) },
            data: {
                ...materiaData,
                createdAt: new Date(materiaData.createdAt),
                updatedAt: new Date(materiaData.updatedAt)
            }
        });

        res.status(200).json(updatedMateria);
    } catch (error) {
        console.error('Erro ao atualizar matéria:', error);
        res.status(500).json({ error: 'Erro ao atualizar matéria' });
    }
});

// Rota para deletar uma matéria
mainRouter.delete('/materia/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        const existingMateria = await prisma.materia.findUnique({
            where: { id }
        })
        if (!existingMateria) {
            res.status(404).json({ error: "Matéria não encontrada" })
            return
        }

        await prisma.materia.delete({
            where: { id }
        })

        res.status(200).json({ message: "Matéria excluída com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir matéria:", error)
        res.status(500).json({ error: "Erro ao excluir matéria" })
    }
})

// Rota para importar dados do arquivo Times
mainRouter.post('/importar-dados', async (req, res) => {
    try {
        const teamsData = Times
        const createdTeams = []

        for (const teamData of teamsData) {
            // Cria o time
            const createdTeam = await prisma.time.create({
                data: {
                    nome: teamData.nome || '',
                    sigla: teamData.sigla || '',
                    cor: teamData.cor || '',
                    cidade: teamData.cidade || '',
                    bandeira_estado: teamData.bandeira_estado || '',
                    fundacao: teamData.fundacao || '',
                    logo: teamData.logo || '',
                    capacete: teamData.capacete || '',
                    instagram: teamData.instagram || '',
                    instagram2: teamData.instagram2 || '',
                    estadio: teamData.estadio || '',
                    presidente: teamData.presidente || '',
                    head_coach: teamData.head_coach || '',
                    instagram_coach: teamData.instagram_coach || '',
                    coord_ofen: teamData.coord_ofen || '',
                    coord_defen: teamData.coord_defen || '',
                    titulos: teamData.titulos || [],
                    temporada: teamData.temporada || '2024',
                },
            })

            createdTeams.push(createdTeam)

            // Cria os jogadores e seus vínculos
            if (teamData.jogadores && teamData.jogadores.length > 0) {
                for (const player of teamData.jogadores) {
                    // Primeiro, cria o jogador
                    const jogadorCriado = await prisma.jogador.create({
                        data: {
                            nome: player.nome || '',
                            timeFormador: player.timeFormador || '',
                            posicao: player.posicao || '',
                            setor: player.setor || 'Ataque',
                            experiencia: player.experiencia || 0,
                            idade: player.idade || 0,
                            altura: player.altura || 0,
                            peso: player.peso || 0,
                            instagram: player.instagram || '',
                            instagram2: player.instagram2 || '',
                            cidade: player.cidade || '',
                            nacionalidade: player.nacionalidade || '',
                        },
                    })

                    // Depois, cria o vínculo entre jogador e time
                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: jogadorCriado.id,
                            timeId: createdTeam.id,
                            temporada: teamData.temporada || '2024',
                            numero: player.numero || 0,
                            camisa: player.camisa || '',
                            estatisticas: player.estatisticas || {},
                        },
                    })
                }
            }
        }

        res.status(201).json({ message: 'Dados importados com sucesso!', teams: createdTeams.length })
    } catch (error) {
        console.error('Erro ao importar os dados:', error)
        res.status(500).json({ error: 'Erro ao importar os dados' })
    }
})

// Rota para iniciar nova temporada
mainRouter.post('/iniciar-temporada/:ano', async (req, res) => {
    try {
        const { ano } = req.params;
        const anoAnterior = (parseInt(ano) - 1).toString();

        // Define interfaces para as estruturas de dados
        interface TimeChange {
            timeId: number;
            nome?: string;
            sigla?: string;
            cor?: string;
            logo?: string;
            capacete?: string;
            presidente?: string;
            head_coach?: string;
            coord_ofen?: string;
            coord_defen?: string;
        }

        interface Transferencia {
            jogadorId: number;
            novoTimeId: number;
            novoNumero?: number;
            novaCamisa?: string;
        }

        console.log(`Iniciando criação da temporada ${ano} baseada em ${anoAnterior}`);

        // 1. Obter todos os times da temporada anterior
        const timesAnoAnterior = await prisma.time.findMany({
            where: { temporada: anoAnterior },
        });

        console.log(`Encontrados ${timesAnoAnterior.length} times da temporada ${anoAnterior}`);

        // 2. Criar novos times para a nova temporada
        const timesNovos = [];
        for (const time of timesAnoAnterior) {
            // Verificar se o time sofrerá alterações
            const timeChanges: TimeChange[] = req.body.timeChanges || [];
            const timeChange = timeChanges.find((tc: TimeChange) => tc.timeId === time.id);

            const novoTime = await prisma.time.create({
                data: {
                    nome: timeChange?.nome || time.nome,
                    sigla: timeChange?.sigla || time.sigla,
                    cor: timeChange?.cor || time.cor,
                    cidade: time.cidade,
                    bandeira_estado: time.bandeira_estado,
                    fundacao: time.fundacao,
                    logo: timeChange?.logo || time.logo,
                    capacete: timeChange?.capacete || time.capacete,
                    instagram: time.instagram,
                    instagram2: time.instagram2,
                    estadio: time.estadio,
                    presidente: timeChange?.presidente || time.presidente,
                    head_coach: timeChange?.head_coach || time.head_coach,
                    instagram_coach: time.instagram_coach,
                    coord_ofen: timeChange?.coord_ofen || time.coord_ofen,
                    coord_defen: timeChange?.coord_defen || time.coord_defen,
                    titulos: time.titulos as any, // Usando any temporariamente para resolver o erro de tipo
                    temporada: ano,
                },
            });

            timesNovos.push(novoTime);
        }

        console.log(`Criados ${timesNovos.length} times para a temporada ${ano}`);

        // 3. Obter todas as relações jogador-time do ano anterior
        const jogadoresTimesAnoAnterior = await prisma.jogadorTime.findMany({
            where: { temporada: anoAnterior },
            include: { jogador: true },
        });

        console.log(`Encontrados ${jogadoresTimesAnoAnterior.length} jogadores-times da temporada ${anoAnterior}`);

        // 4. Criar novas relações para o novo ano (considerando transferências)
        const transferencias: Transferencia[] = req.body.transferencias || [];
        const novasRelacoes = [];

        for (const jt of jogadoresTimesAnoAnterior) {
            // Verificar se o jogador foi transferido
            const transferencia = transferencias.find((t: Transferencia) => t.jogadorId === jt.jogadorId);

            if (transferencia) {
                // Jogador transferido para outro time
                const novoTimeId = transferencia.novoTimeId;

                const novoTime = timesNovos.find((t) => t.id === novoTimeId);
                const novaCamisa = transferencia.novaCamisa ||
                    `camisa-${novoTime?.sigla.toLowerCase() || 'novo'}-${transferencia.novoNumero || jt.numero}.png`;

                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: jt.jogadorId,
                        timeId: novoTimeId,
                        temporada: ano,
                        numero: transferencia.novoNumero || jt.numero,
                        camisa: novaCamisa,
                        estatisticas: {}, // Estatísticas zeradas para a nova temporada
                    },
                });

                novasRelacoes.push({
                    jogador: jt.jogador.nome,
                    timeAntigo: jt.timeId,
                    timeNovo: novoTimeId
                });
            } else {
                // Jogador permanece no mesmo time
                const timeAntigo = timesAnoAnterior.find(ta => ta.id === jt.timeId);
                const novoTimeCorrespondente = timeAntigo ?
                    timesNovos.find(t => t.nome === timeAntigo.nome) : undefined;

                if (novoTimeCorrespondente) {
                    await prisma.jogadorTime.create({
                        data: {
                            jogadorId: jt.jogadorId,
                            timeId: novoTimeCorrespondente.id,
                            temporada: ano,
                            numero: jt.numero,
                            camisa: jt.camisa,
                            estatisticas: {}, // Estatísticas zeradas para a nova temporada
                        },
                    });
                }
            }
        }

        console.log(`Criadas ${novasRelacoes.length} transferências para a temporada ${ano}`);

        res.status(200).json({
            message: `Temporada ${ano} iniciada com sucesso!`,
            times: timesNovos.length,
            jogadores: jogadoresTimesAnoAnterior.length,
            transferencias: novasRelacoes
        });
    } catch (error) {
        console.error(`Erro ao iniciar temporada ${req.params.ano}:`, error);
        res.status(500).json({ error: 'Erro ao iniciar nova temporada' });
    }
});

export default mainRouter