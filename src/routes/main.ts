import { PrismaClient } from '@prisma/client'
import express from 'express'
import { TimeSchema } from '../schemas/Time'
import { JogadorSchema } from '../schemas/Jogador'
import { Time } from '../types/time'
import { Jogador } from '../types/jogador'
import { Times } from '../data/times'

const prisma = new PrismaClient()
export const mainRouter = express.Router()

// Rota para obter todos os times com seus jogadores
mainRouter.get('/times', async (req, res) => {
    try {
        const times = await prisma.time.findMany({
            include: {
                jogadores: true,
            },
        })

        res.status(200).json(times)
    } catch (error) {
        console.error('Erro ao buscar os times:', error)
        res.status(500).json({ error: 'Erro ao buscar os times' })
    }
})

// Rota para obter todos os jogadores
mainRouter.get('/jogadores', async (req, res) => {
    try {
        const jogadores = await prisma.jogador.findMany({
            include: {
                time: true,
            },
        })

        res.status(200).json(jogadores)
    } catch (error) {
        console.error('Erro ao buscar os jogadores:', error);
        res.status(500).json({ error: 'Erro ao buscar os jogadores' });
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
                fundacao: teamData.fundacao || '',
                logo: teamData.logo || '',
                capacete: teamData.capacete || '',
                instagram: teamData.instagram || '',
                instagram2: teamData.instagram2 || '',
                estadio: teamData.estadio || '',
                presidente: teamData.presidente || '',
                head_coach: teamData.head_coach || '',
                coord_ofen: teamData.coord_ofen || '',
                coord_defen: teamData.coord_defen || '',
                titulos: teamData.titulos || [],
            },
        })

        // Criação dos jogadores, sem permitir campos `undefined`
        if (teamData.jogadores && teamData.jogadores.length > 0) {
            await prisma.jogador.createMany({
                data: teamData.jogadores.map((player) => ({
                    nome: player.nome || '',
                    timeFormador: player.timeFormador || '',
                    posicao: player.posicao || '',
                    setor: player.setor || 'Ataque',
                    experiencia: player.experiencia || 0,
                    numero: player.numero || 0,
                    idade: player.idade || 0,
                    altura: player.altura || 0,
                    peso: player.peso || 0,
                    instagram: player.instagram || '',
                    instagram2: player.instagram2 || '',
                    cidade: player.cidade || '',
                    nacionalidade: player.nacionalidade || '',
                    camisa: player.camisa || '',
                    estatisticas: player.estatisticas || {},
                    timeId: createdTeam.id,
                })),
                skipDuplicates: true,
            })
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

// Rota para adicionar múltiplos times e seus jogadores
mainRouter.post('/times', async (req, res) => {
    try {
        const teamsData: Time[] = req.body.map((teamData: any) => TimeSchema.parse(teamData))

        const createdTeams = await Promise.all(
            teamsData.map(async (teamData: Time) => {
                const createdTeam = await prisma.time.create({
                    data: {
                        nome: teamData.nome || '',
                        sigla: teamData.sigla || '',
                        cor: teamData.cor || '',
                        cidade: teamData.cidade || '',
                        fundacao: teamData.fundacao || '',
                        logo: teamData.logo || '',
                        capacete: teamData.capacete || '',
                        instagram: teamData.instagram || '',
                        instagram2: teamData.instagram2 || '',
                        estadio: teamData.estadio || '',
                        presidente: teamData.presidente || '',
                        head_coach: teamData.head_coach || '',
                        coord_ofen: teamData.coord_ofen || '',
                        coord_defen: teamData.coord_defen || '',
                        titulos: teamData.titulos || [],
                    },
                })

                if (teamData.jogadores && teamData.jogadores.length > 0) {
                    const players = teamData.jogadores.map((player: Jogador) => ({
                        nome: player.nome || '',
                        timeFormador: player.timeFormador || '',
                        posicao: player.posicao || '',
                        setor: player.setor || 'Ataque',
                        experiencia: player.experiencia || 0,
                        numero: player.numero || 0,
                        idade: player.idade || 0,
                        altura: player.altura || 0,
                        peso: player.peso || 0,
                        instagram: player.instagram || '',
                        instagram2: player.instagram2 || '',
                        cidade: player.cidade || '',
                        nacionalidade: player.nacionalidade || '',
                        camisa: player.camisa || '',
                        estatisticas: player.estatisticas || {},
                        timeId: createdTeam.id,
                    }))

                    await prisma.jogador.createMany({
                        data: players,
                        skipDuplicates: true,
                    })
                }

                return createdTeam;
            })
        )

        res.status(201).json({ teams: createdTeams })
    } catch (error) {
        console.error('Erro ao criar múltiplos times e jogadores:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

// Rota para adicionar um jogador a um time existente
mainRouter.post('/jogador', async (req, res) => {
    try {
        const jogadorData = JogadorSchema.parse(req.body)

        if (typeof jogadorData.timeId !== 'number') {
            throw new Error('O campo "timeId" é obrigatório e deve ser um número.')
        }

        const estatisticas = jogadorData.estatisticas ? jogadorData.estatisticas : {}

        const { id, time, ...jogadorDataWithoutIdAndTime } = jogadorData;

        const jogadorCriado = await prisma.jogador.create({
            data: {
                ...jogadorDataWithoutIdAndTime,
                nome: jogadorData.nome ?? '',
                posicao: jogadorData.posicao ?? '',
                setor: jogadorData.setor ?? 'Ataque',
                experiencia: jogadorData.experiencia ?? 0,
                numero: jogadorData.numero ?? 0,
                idade: jogadorData.idade ?? 0,
                altura: jogadorData.altura ?? 0,
                peso: jogadorData.peso ?? 0,
                instagram: jogadorData.instagram ?? '',
                instagram2: jogadorData.instagram2 ?? '',
                cidade: jogadorData.cidade ?? '',
                nacionalidade: jogadorData.nacionalidade ?? '',
                camisa: jogadorData.camisa ?? '',
                estatisticas: estatisticas,
                timeFormador: jogadorData.timeFormador ?? '',
                timeId: jogadorData.timeId,
            },
        })

        res.status(201).json({ jogador: jogadorCriado })
    } catch (error) {
        console.error('Erro ao criar o jogador:', error)
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        })
    }
})

mainRouter.post('/importar-dados', async (req, res) => {
    try {
        const teamsData = Times; 

        const createdTeams = await Promise.all(
            teamsData.map(async (teamData) => {
                const createdTeam = await prisma.time.create({
                    data: {
                        nome: teamData.nome || '',
                        sigla: teamData.sigla || '',
                        cor: teamData.cor || '',
                        cidade: teamData.cidade || '',
                        fundacao: teamData.fundacao || '',
                        logo: teamData.logo || '',
                        capacete: teamData.capacete || '',
                        instagram: teamData.instagram || '',
                        instagram2: teamData.instagram2 || '',
                        estadio: teamData.estadio || '',
                        presidente: teamData.presidente || '',
                        head_coach: teamData.head_coach || '',
                        coord_ofen: teamData.coord_ofen || '',
                        coord_defen: teamData.coord_defen || '',
                        titulos: teamData.titulos || [],
                    },
                });

                if (teamData.jogadores && teamData.jogadores.length > 0) {
                    const players = teamData.jogadores.map((player) => ({
                        nome: player.nome || '',
                        timeFormador: player.timeFormador || '',
                        posicao: player.posicao || '',
                        setor: player.setor || 'Ataque',
                        experiencia: player.experiencia || 0,
                        numero: player.numero || 0,
                        idade: player.idade || 0,
                        altura: player.altura || 0,
                        peso: player.peso || 0,
                        instagram: player.instagram || '',
                        instagram2: player.instagram2 || '',
                        cidade: player.cidade || '',
                        nacionalidade: player.nacionalidade || '',
                        camisa: player.camisa || '',
                        estatisticas: player.estatisticas || {},
                        timeId: createdTeam.id,
                    }));

                    await prisma.jogador.createMany({
                        data: players,
                        skipDuplicates: true,
                    });
                }

                return createdTeam;
            })
        );

        res.status(201).json({ message: 'Dados importados com sucesso!', teams: createdTeams });
    } catch (error) {
        console.error('Erro ao importar os dados:', error);
        res.status(500).json({ error: 'Erro ao importar os dados' });
    }
});

















