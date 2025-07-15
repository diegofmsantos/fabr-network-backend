import { PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { TimeSchema } from '../schemas/Time'
import { calcularEstatisticasTimeFA, identificarJogadoresDestaqueFA } from '../utils/estatisticas'

const prisma = new PrismaClient()

export const timeRouter = express.Router()

timeRouter.get('/', async (req, res) => {
    console.log('Rota /api/times chamada')
    try {
        const { temporada } = req.query
        const temporadaFiltro = temporada ? String(temporada) : '2025'

        const times = await prisma.time.findMany({
            where: { temporada: temporadaFiltro },
            include: {
                jogadores: {
                    where: { temporada: temporadaFiltro },
                    include: { jogador: true }
                },
            },
        });

        const timesFormatados = times.map(time => {
            let titulosParsed = time.titulos;
            
            if (typeof time.titulos === 'string') {
                try {
                    titulosParsed = JSON.parse(time.titulos);
                } catch (error) {
                    console.error(`Erro ao fazer parse dos títulos para ${time.nome}:`, error);
                }
            }
            
            return {
                ...time,
                titulos: titulosParsed,
                jogadores: time.jogadores.map(jt => ({
                    ...jt.jogador,
                    numero: jt.numero,
                    camisa: jt.camisa,
                    estatisticas: jt.estatisticas,
                    timeId: time.id,
                    temporada: jt.temporada
                }))
            };
        });

        res.status(200).json(timesFormatados)
    } catch (error) {
        console.error('Erro ao buscar os times:', error)
        res.status(500).json({ error: 'Erro ao buscar os times' })
    }
})

timeRouter.post('/', async (req, res) => {
    try {
        const teamData = TimeSchema.parse(req.body)

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
                temporada: teamData.temporada || '2025', 
            },
        })

        if (teamData.jogadores && teamData.jogadores.length > 0) {
            for (const player of teamData.jogadores) {
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

                await prisma.jogadorTime.create({
                    data: {
                        jogadorId: jogadorCriado.id,
                        timeId: createdTeam.id,
                        temporada: teamData.temporada || '2025',
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

timeRouter.put('/time/:id', async (req, res) => {
    const { id } = req.params

    try {
        const timeData = TimeSchema.parse(req.body) 
        const { id: _, jogadores, ...updateData } = timeData 

        const updatedTime = await prisma.time.update({
            where: { id: parseInt(id) }, 
            data: updateData, 
        })

        res.status(200).json(updatedTime)
    } catch (error) {
        console.error('Erro ao atualizar o time:', error)
        res.status(500).json({ error: 'Erro ao atualizar o time' })
    }
})

timeRouter.delete('/time/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
        const id = parseInt(req.params.id, 10)

        if (isNaN(id)) {
            res.status(400).json({ error: "ID inválido" })
            return
        }

        const existingTime = await prisma.time.findUnique({
            where: { id },
        })

        if (!existingTime) {
            res.status(404).json({ error: "Time não encontrado" })
            return
        }

        await prisma.jogadorTime.deleteMany({
            where: { timeId: id },
        })

        await prisma.time.delete({
            where: { id },
        })

        res.status(200).json({ message: "Time excluído com sucesso!" })
    } catch (error) {
        console.error("Erro ao excluir time:", error)
        res.status(500).json({ error: "Erro ao excluir time" })
    }
})

timeRouter.get('/comparar-times', async function (req: Request, res: Response) {
    try {
        const time1Id = req.query.time1Id as string;
        const time2Id = req.query.time2Id as string;
        const temporada = (req.query.temporada as string) || '2025';

        if (!time1Id || !time2Id) {
            res.status(400).json({ error: 'É necessário fornecer IDs de dois times diferentes' });
            return;
        }

        if (time1Id === time2Id) {
            res.status(400).json({ error: 'Os times precisam ser diferentes para comparação' });
            return;
        }

        const [time1, time2] = await Promise.all([
            prisma.time.findUnique({
                where: { id: Number(time1Id) },
                include: {
                    jogadores: {
                        where: { temporada: temporada },
                        include: { jogador: true }
                    }
                }
            }),
            prisma.time.findUnique({
                where: { id: Number(time2Id) },
                include: {
                    jogadores: {
                        where: { temporada: temporada },
                        include: { jogador: true }
                    }
                }
            })
        ]);

        if (!time1 || !time2) {
            res.status(404).json({ error: 'Um ou ambos os times não foram encontrados' });
            return;
        }

        const time1Estatisticas = calcularEstatisticasTimeFA(time1);
        const time2Estatisticas = calcularEstatisticasTimeFA(time2);

        const time1Destaques = identificarJogadoresDestaqueFA(time1);
        const time2Destaques = identificarJogadoresDestaqueFA(time2);

        const result = {
            teams: {
                time1: {
                    id: time1.id,
                    nome: time1.nome,
                    sigla: time1.sigla,
                    cor: time1.cor,
                    logo: time1.logo,
                    cidade: time1.cidade,
                    estadio: time1.estadio,
                    head_coach: time1.head_coach,
                    fundacao: time1.fundacao,
                    titulos: time1.titulos,
                    estatisticas: time1Estatisticas,
                    destaques: time1Destaques
                },
                time2: {
                    id: time2.id,
                    nome: time2.nome,
                    sigla: time2.sigla,
                    cor: time2.cor,
                    logo: time2.logo,
                    cidade: time2.cidade,
                    estadio: time2.estadio,
                    head_coach: time2.head_coach,
                    fundacao: time2.fundacao,
                    titulos: time2.titulos,
                    estatisticas: time2Estatisticas,
                    destaques: time2Destaques
                }
            }
        };

        res.status(200).json(result);
    } catch (error) {
        console.error('Erro ao comparar times:', error);
        res.status(500).json({ error: 'Erro ao processar comparação de times' });
    }
});

