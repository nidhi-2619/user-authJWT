import fs, { existsSync } from 'fs';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import zlib from 'zlib';
import path, { basename } from 'path';
import { MongoClient, ObjectId } from 'mongodb';
dotenv.config({ path: './.env' });

const app = express();
app.use(express.json());
app.use(express.static('ZippedLogs'))

const mongo = new MongoClient(`${process.env.MONGO_URI}`)
const db = mongo.db(process.env.DB_NAME)
const userCollection = db.collection("users")
const websiteStatus = db.collection("websitestatus")

const DB_CONNECTION = async()=>{

    try{
    await mongo.connect()
    console.log("Connected to database")
    }
    catch(error){
    console.log("MongoDB connection error.", error)
    process.exit()
    
    }
}



function generateAccessToken(username, email) {
    const payload = {
        username: username,
        email: email,
    }
    const secret = process.env.JWT_SECRET;
    const options = {
        expiresIn: '10h',
    }
    return jwt.sign(payload, secret, options);
}



async function checkWebsiteStatus(website,userId){
    let user;
    await fetch(website,{method:'HEAD'})// Using fetch with the provided website URL
        .then(response => {
            if (response.status === 200) {
                   
                    return ({
                        "status": "UP",
                        "time": new Date().toLocaleString()
                    })
                
            } else {
               
                return ({
                    "status": "DOWN",
                    "time": new Date().toLocaleString()
                })
            }
        })
        .then(async (status)=>{  
            if(!await websiteStatus.findOne({userId:userId,website:website})){
                 user = await websiteStatus.insertOne({
                        userId:userId,
                        website:website,
                        status:status
                    })   
            }
            
        
})
        .catch(err => err);
    
    
    const log = await websiteStatus.findOne({website})
    return log

    }

let websiteLogs = []
// console.log(websiteStatus.deleteMany({document:null}))
// let  userSearchedWebsites =  await websiteStatus.find()

setInterval(async()=>{
        console.log("checking website")
        await websiteStatus.find().forEach((websiteData)=>{
            // console.log(websiteData)
            fetch(websiteData['website'])
            .then((response)=>{
                let result = {}
                if (response.status === 200) {
                    result = {
                        "status": "UP",
                        "time": new Date().toLocaleString()
                    }
                }
                else{
                    result = {
                        "status": "DOWN",
                        "time": new Date().toLocaleString()
                    }
                }    
                
               const log = {
                userId:websiteData['userId'],
                website:websiteData['website'],
                status:result
               }
               websiteLogs.push(log)
    
               
            })
            .catch((err)=>console.log(err))
            
        })
    },1000*5)



if(websiteLogs.length!==0){
    setInterval(async()=>{
            await websiteStatus.insertMany(
                websiteLogs
            )
        websiteLogs = [] 
        
    },1000*10)
}



let baseDir = path.join('home/app','ZippedLogs')


async function createZip(logs){
    return new Promise(async (resolve, reject) => {
        console.log("Creating zip");
        const LOGS = logs.toJSON()
        const readStream = fs.createReadStream('LOGS');
        const writeStream = fs.createWriteStream(`${baseDir}/${Date.now()}.gz`);
        const gzip = zlib.createGzip();
        readStream.pipe(gzip).pipe(writeStream);
        writeStream.on('close', () => {
            console.log("Zip created");
            resolve();
        });
        writeStream.on('error', (err) => {
            reject(err);
        });
    });
}
// setInterval( async ()=>{
//     await createZip()
//     websiteStatus = '{}'
//     fs.writeFileSync('websiteStatus.json', websiteStatus);
//     console.log("websiteStatus.json cleared");
//    },1000*10)



function verifyUser(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ');
        const token = bearerToken[1];
        if (token){
            const user = jwt.verify(token, process.env.JWT_SECRET)
            req.user = user
        }
        else{
            return res.sendStatus(403)
        }
        next();
    } else {
        res.sendStatus(403);
    }
}

app.get('/', (req, res) => {
    res.send('Welcome to the home page of Authentication System using JWT');
});

app.post('/register', async(req, res) => {
    const {username, email, password} = req.body;
    const user = await userCollection.findOne({
        $or:[{email},{username}]
    })

    if (user){
        return res.status(409).json('User already exists')
    }
    const accessToken = generateAccessToken(username, email);
    const newUser = {
        username:username,
        email:email,
        password:password,
        websites:[]
    }
    await userCollection.insertOne(newUser)
    res.json({
            
            "message": "User registered successfully",
            user:{
                "username": username,
                "email": email
            },
            "token": accessToken,
        });
});



app.post('/login', async(req, res) => {
    const {username,email} = req.body;
    
    const userFound = await userCollection.findOne({
        $or:[{email:email},{username:username}]
    })

    if (!userFound){
        return res.status(404).json('User not found');
    }

    const accessToken = generateAccessToken(username, email);
    try {
        res.json({
            "message": "Login successful",
            "email": email,
            "token": accessToken
        });
    } catch (error) {
        res.status(500).json('Failed to login');
    }
});




app.post('/check', verifyUser, async(req, res) => {
        const { website } = req.body; // Extracting website from request body
        // fetching the website status        
        const username = req.user.username
        const userId = await userCollection.findOne({username})
        const result = await checkWebsiteStatus(website, userId?._id);
        
        // store website to user collection
        console.log(result)
        
        await userCollection.updateOne(
            {userId},
            {   
                $addToSet:{
                   websites:{
                    $each:[website]
                   }
                   
                }
            }
        ) 
                res.json({
                    "status": result,
                    "message": "Website status fetched successfully"
                })
            
 // Sending the status message to the client
      
   
});

app.get('/logs', verifyUser, async (req, res) => {

    // Fetching user data 
    const dataUser = await userCollection.findOne(req.user?._id)
    //now fetch the websites from it
    if (dataUser['websites'].length === 0) {
            return res.status(404).json('No website to check');
        }
    
    const logs = []
    for (const website of dataUser['websites']) {
        
        const data = await websiteStatus.findOne({website})
    
        logs.push({
                    "website": website,
                    "logs": data.hasOwnProperty("status")?data["status"].slice(-1):"no logs found"
                })
        }
            if (req.query.website){
                res.json({
                    "recent logs":logs.filter(log=>log.website===req.query.website)
                })
            }
            else{
                res.json({

                "recent logs": logs
            });
            
        }



      
});


app.get('/downloadzip',verifyUser, async(req,res)=>{
//     jwt.verify(req.token, process.env.JWT_SECRET, (err, userData) => {
        // if (err) {
            // res.status(401).json('You are not authorized');
        // } else {
            const user = await userCollection.findOne(req.user.username)
            
            if(req.query.zipfile && req.query.zipfile in user.website){
                // res.download(baseDir+req.query.zipfile)
                // res.setHeader(
                //     'Content-Disposition', `attachment; filename=${req.query.zipfile}`);
                const requestedWebsiteLogs = await websiteStatus.findOne(req.query.zipfile)
                const zippedFile = await createZip(requestedWebsiteLogs)
                res.download(`${zippedFile}`,'LogZip.zip');
                
               
            }
            // else if(!req.query.zipfile){
            //     fs.readdir(baseDir, (err, files) => {
            //         if (err) {
            //             return res.status(500).send('Error reading folder');
            //         }
            
            //         const downloadLinks = files.map(file => {
            //             return `${req.protocol}://${req.get('host')}/logs/${encodeURIComponent(file)}`;
            //         });
            
            //         res.json(downloadLinks);
            //     });
            // }
            else{
                res.status(404).json('File not found')
            }
           
        // }
    // })
})








const PORT = process.env.PORT || 3000; // Setting default port to 3000 if not provided in .env

DB_CONNECTION()
.then(()=>
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    }))
.catch((err)=>{
    console.log("MONGODB connection failed!", err)
})