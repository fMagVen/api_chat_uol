import express  from 'express'
import cors from 'cors'
import joi from 'joi'
import dotenv from 'dotenv'
import dayjs from 'dayjs'
import {MongoClient, ObjectId} from 'mongodb'
import {stripHtml} from 'string-strip-html'

dotenv.config()

const mongoClient = new MongoClient(process.env.MONGO_URI)

const app = express()
app.use(cors())
app.use(express.json())

app.listen(5000)

const participantSchema = joi.object({
    name: joi.string().required()
})
const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message')
})

app.post('/participants', async(req, res) =>{
    try{
        req.body.name = stripHtml(req.body.name, {trimOnlySpaces: true}).result
        let validate = participantSchema.validate(req.body)
        if(validate.error){
            res.status(422).send('Envie um nome em um formato válido')
            return
        }
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        validate = await db.collection('participants').find(req.body).toArray()
        if(validate.length > 0){
            res.status(409).send('Esse nome já está sendo usado')
            mongoClient.close()
        }
        else{
            await db.collection('participants').insertOne( {name: req.body.name, lastStatus: Date.now()} )
            await db.collection('messages').insertOne( {from: req.body.name, to: "Todos", text: "entra na sala...", type: "status", time: dayjs().locale('pt-br').format('HH:mm:ss')} )
            res.sendStatus(201)
            mongoClient.close()
        }
    }catch{
        res.status(500).send('Que feio servidor! Você não pode fazer isso!')
        mongoClient.close()
    }
})

app.get('/participants', async(req, res) =>{
    try{
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        const get = await db.collection('participants').find({}).toArray()
        res.status(200).send(get)
        await mongoClient.close()
    }
    catch(e){
        res.sendStatus(500)
        console.log(e)
        await mongoClient.close()
    }
})

app.post('/messages', async (req, res) =>{
    try{
        req.headers.user = stripHtml(req.headers.user, {trimOnlySpaces: true}).result
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        const user = await db.collection('participants').find({name: req.headers.user}).toArray()
        if(user.length == 0){
            res.status(422).send('Participante não encontrado')
            await mongoClient.close()
            return
        }
        req.body.to = stripHtml(req.body.to, {trimOnlySpaces: true}).result
        req.body.text = stripHtml(req.body.text, {trimOnlySpaces: true}).result
        req.body.type = stripHtml(req.body.type, {trimOnlySpaces: true}).result
        const validate = messageSchema.validate(req.body)
        if(validate.error){
            res.status(422).send('Formato de mensagem inválido')
            await mongoClient.close()
            return
        }
        await db.collection('messages').insertOne( {from: req.headers.user, ...req.body, time: dayjs().locale('pt-br').format('HH:mm:ss')} )
        res.sendStatus(201)
        await mongoClient.close()
    }
    catch(e){
        console.log(e)
        res.sendStatus(500)
        await mongoClient.close()
    }
})

app.get('/messages', async(req, res) =>{
    try{
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        let messages = await db.collection('messages').find( { $or: [ {from: req.headers.user}, {to: req.headers.user}, {to: "Todos"}, {type: "message"} ] } ).toArray()
        let limit = parseInt(req.query.limit)
        if(isNaN(limit) || limit < 0){
            messages.reverse()
            res.status(200).send(messages)
            mongoClient.close()
        }
        else{
            let i = messages.length
            let limitedMessages = []
            while(i > 0 && limit > 0){
                limitedMessages.push(messages[i - 1])
                i--
                limit--
            }
            limitedMessages.reverse()
            res.status(200).send(limitedMessages)
            mongoClient.close()
        }
    }
    catch{
        res.status(500).send('Que feio servidor! Você não pode fazer isso!')
        mongoClient.close()
    }
})

app.post('/status', async (req, res) =>{
    try{
        let requester = stripHtml(req.headers.user, {trimOnlySpaces: true}).result
        await mongoClient.connect()
        let db = mongoClient.db('db_api_uol')
        let user = await db.collection('participants').find({name: requester}).toArray()
        if(user.length == 0){
            res.sendStatus(404)
            await mongoClient.close()
            return
        }
        await db.collection('participants').updateOne({name: requester},{$set: {lastStatus: Date.now()}})
        res.sendStatus(200)
        await mongoClient.close()
    }catch{
        res.sendStatus(500)
        await mongoClient.close()
    }
})


setInterval(async() => {
    try{
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        const time = Date.now() - 10000
        let leave = await db.collection('participants').find( { lastStatus: {$lt : time} } ).toArray()
        let i = leave.length
        while(i > 0){
            await db.collection('messages').insertOne( {from: leave[i - 1].name, to: "Todos", text: "sai da sala...", type: "status", time: dayjs().locale('pt-br').format('HH:mm:ss')} )
            await db.collection('participants').deleteOne( { name: leave[i - 1].name } )
            i--
        }
        mongoClient.close()
    }
    catch(erro){
        console.log('é com grande pesar que anuncio que essa parada que tu tentou aí deu ruim pai')
        console.log(erro)
        mongoClient.close()
    }
}, 15000)


app.delete('/messages/:id', async(req, res) =>{
    try{
        req.headers.user = stripHtml(req.headers.user, {trimOnlySpaces: true}).result
        req.params.id = stripHtml(req.params.id, {trimOnlySpaces: true}).result
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        const message = await db.collection('messages').findOne( { _id: new ObjectId(req.params.id) } )
        if(!message){
            res.sendStatus(404)
            mongoClient.close()
            return
        }
        if(message.from != req.headers.user){
            res.sendStatus(401)
            mongoClient.close()
            return
        }
        await db.collection('messages').deleteOne( { _id: new ObjectId(req.params.id) } )
        res.sendStatus(200)
        mongoClient.close()
    }
    catch(e){
        res.status(500).send('Que feio servidor! Você não pode fazer isso!')
        console.log(e)
        mongoClient.close()
    }
})

app.put('/messages/:id', async(req, res) =>{
    try{
        req.headers.user = stripHtml(req.headers.user, {trimOnlySpaces: true}).result
        await mongoClient.connect()
        const db = mongoClient.db('db_api_uol')
        const user = await db.collection('participants').find({name: req.headers.user}).toArray()
        if(user.length == 0){
            res.status(422).send('Participante não encontrado')
            mongoClient.close()
            return
        }
        req.body.to = stripHtml(req.body.to, {trimOnlySpaces: true}).result
        req.body.text = stripHtml(req.body.text, {trimOnlySpaces: true}).result
        req.body.type = stripHtml(req.body.type, {trimOnlySpaces: true}).result
        const validate = messageSchema.validate(req.body)
        if(validate.error){
            res.status(422).send('Formato de mensagem inválido')
            mongoClient.close()
            return
        }
        req.params.id = stripHtml(req.params.id, {trimOnlySpaces: true}).result
        const message = await db.collection('messages').findOne( { _id: new ObjectId(req.params.id) } )
        if(!message){
            res.sendStatus(404)
            mongoClient.close()
            return
        }
        if(message.from != req.headers.user){
            res.sendStatus(401)
            mongoClient.close()
            return
        }
        await db.collection('messages').updateOne( { _id: new ObjectId(req.params.id) }, { $set: {from: req.headers.user, ...req.body, time: dayjs().locale('pt-br').format('HH:mm:ss')}} )
        res.sendStatus(200)
        mongoClient.close()
    }
    catch(e){
        res.sendStatus(500).send('Que feio servidor! Você não pode fazer isso!')
        console.log(e)
        mongoClient.close()
    }
})
