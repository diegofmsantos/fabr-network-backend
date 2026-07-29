import { PrismaClient } from '@prisma/client'
import express from 'express'
import { protectWrites } from '../middleware/auth'

const prisma = new PrismaClient()

export const materiaRouter = express.Router()

materiaRouter.use(protectWrites)

materiaRouter.get('/', async (req, res) => {
    try {
        const { tipo, limite } = req.query

        const materias = await prisma.materia.findMany({
            where: tipo && typeof tipo === 'string' ? { tipo } : undefined,
            orderBy: {
                createdAt: 'desc'
            },
            take: limite ? parseInt(limite as string) : undefined
        });
        res.status(200).json(materias)
    } catch (error) {
        console.error('Erro ao buscar as matérias:', error)
        res.status(500).json({ error: 'Erro ao buscar as matérias' })
    }
})

materiaRouter.post('/', async (req, res) => {
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
                tipo: materiaData.tipo || 'NORMAL',
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

materiaRouter.put('/:id', async (req, res) => {
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

materiaRouter.delete('/:id', async (req, res) => {
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