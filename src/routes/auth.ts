import bcrypt from 'bcrypt'
import express from 'express'
import jwt from 'jsonwebtoken'

export const authRouter = express.Router()

authRouter.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            res.status(400).json({ error: 'Usuário e senha são obrigatórios' })
            return
        }

        const validUsername = username === process.env.ADMIN_USERNAME
        const validPassword = validUsername
            ? await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH as string)
            : false

        if (!validUsername || !validPassword) {
            res.status(401).json({ error: 'Credenciais inválidas' })
            return
        }

        const token = jwt.sign({ sub: username }, process.env.JWT_SECRET as string, { expiresIn: '12h' })

        res.status(200).json({ token })
    } catch (error) {
        console.error('Erro ao autenticar:', error)
        res.status(500).json({ error: 'Erro ao autenticar' })
    }
})
