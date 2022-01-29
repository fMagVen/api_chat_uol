const express = require('express')
const cors = require('cors')
const joi = require('joi')
const dotenv = require('dotenv')
const dayjs = require('dayjs')
const {MongoClient} = require('mongodb')
const { any } = require('joi')
dotenv.config()

const mongoClient = new MongoClient(process.env.MONGO_URI)

const app = express()
app.use(cors())
app.use(express.json())

app.listen(5000)

const participantSchema = joi.object({
    name: joi.string().required()
})

app.post('/participants', async(req, res) =>{
    try{
        let validate = participantSchema.validate(req.body)
        if(validate.error){
            if(validate.error.details[0].type == 'string.empty'){
                res.status(422).send('O campo nome não pode estar vazio')
                return
            }
            if(validate.error.details[0].type == 'any.required'){
                res.status(422).send('É necessário enviar um nome')
                return
            }
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
            res.status(201)
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
        res.send(get)
        mongoClient.close()
    }
    catch{
        res.status(500).send('Que feio servidor! Você não pode fazer isso!')
        mongoClient.close()
    }
})