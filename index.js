import fs, { existsSync } from 'fs';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import zlib from 'zlib';
import path, { basename } from 'path';

dotenv.config({ path: './.env' });

const app = express();
app.use(express.json());
app.use(express.static('ZippedLogs'))


function generateAccessToken(user) {
    const payload = {
        username: user.username,
        email: user.email,
        password: user.password,
    }
    const secret = process.env.JWT_SECRET;
    const options = {
        expiresIn: '10h',
    }
    return jwt.sign(payload, secret, options);
}

// in memory read and write
let userSearchedWebsites = ''
try{
    userSearchedWebsites = fs.readFileSync('users.json', 'utf8'); 
}
catch(error){
    if (error.code==='ENOENT'){
        userSearchedWebsites =fs.writeFileSync('users.json', JSON.stringify({}))

    }else{
        process.exit()
    }
}

let websiteStatus = '';
try{
    websiteStatus = fs.readFileSync('websiteStatus.json', 'utf8');
}
catch(error){
    if (error.code==='ENOENT'){
        websiteStatus=fs.writeFileSync('websiteStatus.json',JSON.stringify({}))
        websiteStatus='{}'
    }else{
        process.exit()
    }
}



async function checkWebsiteStatus(website){
    const result = await fetch(website,{method:'HEAD'})// Using fetch with the provided website URL
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
        .then(res=>{
           
            
            let data = JSON.parse(websiteStatus);
            if (!data[website]) data[website] = [res];
            else data[website].push(res)
            fs.writeFileSync('websiteStatus.json', JSON.stringify(data));
        
})
        .catch(err => err);
    
    return result

    }

setInterval(()=>{
    let data = JSON.parse(websiteStatus)

    const userHistory = JSON.parse(userSearchedWebsites);
    console.log('Checking website status')
    for (const user in userHistory) {
        if (!userHistory[user].hasOwnProperty('websites')){
            continue;
        }
        const websites = userHistory[user].websites;
        for (const website of websites) {
        Promise.allSettled(websites.map(website=>fetch(website,{method:'HEAD'})))
        .then((promises) =>promises.forEach(response =>{
            if (response.value.status === 200) {
                const result = {
                    "status": "UP",
                    "time": new Date().toLocaleString()
                }
                
                if (response.value.url===website){
                    if (!data[website]) data[website] = [result];
                    else data[website].push(result)
                }
                websiteStatus = JSON.stringify(data)
                
            }  else {
                const result = {
                        "status": "DOWN",
                        "time": new Date().toLocaleString()
                    }
                
                    if (!data[website]) data[website] = [result];
                    else data[website].push(result)
                    websiteStatus = JSON.stringify(data)
                }  
       
            
        }))
        .catch(err => err);
             

    }
    
}
fs.writeFileSync('websiteStatus.json', websiteStatus)
},1000*5)

let baseDir = path.join('/home/user/Desktop/httpserver/ZippedLogs')

if (!fs.existsSync(baseDir)){
        fs.mkdirSync(baseDir)
    }

async function createZip(){
    return new Promise((resolve, reject) => {
        console.log("Creating zip");
        const readStream = fs.createReadStream('websiteStatus.json');
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
setInterval( async ()=>{
    await createZip()
    websiteStatus = '{}'
    fs.writeFileSync('websiteStatus.json', websiteStatus);
    console.log("websiteStatus.json cleared");
   },1000*10)



// process.on('uncaughtException',(err,origin)=>{
//     fs.writeSync(
//         process.stderr.fd,
//         `Caught exception: ${err}\n` +
//         `Exception origin: ${origin}\n`,
//       );
   
//             fs.writeFileSync('websiteStatus.json', websiteStatus)
//     process.exit()
   
// }) 
process.on('SIGINT',()=>{
    fs.writeFileSync('websiteStatus.json', websiteStatus)
    process.exit()
})


function verifyUser(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ');
        const bearer = bearerToken[1];
        req.token = bearer;
        next();
    } else {
        res.sendStatus(403);
    }
}

app.get('/', (req, res) => {
    res.send('Welcome to the home page of Authentication System using JWT');
});

app.post('/register', (req, res) => {
    const user = req.body;
    if (fs.existsSync('users.json') === false)
        fs.writeFileSync('users.json', JSON.stringify({}));
    const userCredentials = fs.readFileSync('users.json', 'utf8');
    let data = JSON.parse(userCredentials);
    const accessToken = generateAccessToken(user);
    if (data && typeof (data) === 'object') {
        data[user.email] = user;
    }
    fs.writeFile('users.json', JSON.stringify(data), (err) => {
        if (err) {
            return res.status(500).json('Failed to register user');
        }
        res.json({
            "message": "User registered successfully",
            "token": accessToken
        });
    });
});



app.post('/login', (req, res) => {
    const user = req.body;
    let userData = fs.readFileSync('users.json', 'utf8');
    let data = JSON.parse(userData);
    if (!data[user.email]) {
        return res.status(404).json('User not found');
    }
    const accessToken = generateAccessToken(user);
    try {
        res.json({
            "message": "Login successful",
            "email": user.email,
            "token": accessToken
        });
    } catch (error) {
        res.status(500).json('Failed to login');
    }
});




app.post('/check', verifyUser,(req, res) => {
    jwt.verify(req.token, process.env.JWT_SECRET, (err, userData) => {
        if (err) {
            res.status(401).json('You are not authorized');
        } else {
                const { website } = req.body; // Extracting website from request body
               
                const userInfo = fs.readFileSync('users.json', 'utf8');
                const data = JSON.parse(userInfo);
                if (!data[userData.email].hasOwnProperty('websites')) {
                    data[userData.email]['websites'] = [];
                }

                if (!data[userData.email]['websites'].includes(website)) {
                    data[userData.email]['websites'].push(website);
                    fs.writeFileSync('users.json', JSON.stringify(data));
                }
                
                const result = checkWebsiteStatus(website);
                if (result === undefined) {
                    return res.status(500).json('Failed to check website status');
                }
                else{
                res.json("Website status checked successfully .Check Status at endpoint /logs");
                // res.end();
                }
 // Sending the status message to the client
        }
    })
});

app.get('/logs', verifyUser, (req, res) => {
    jwt.verify(req.token, process.env.JWT_SECRET, (err, userData) => {
        if (err) {
            res.status(401).json('You are not authorized');
        } else {
            const readUser = fs.readFileSync('users.json', 'utf8');
            const dataUser = JSON.parse(readUser);
            //now fetch the websites from it
            if (dataUser[userData.email]['websites'].length === 0) {
                return res.status(404).json('No website to check');
            }
            const logs = []
            for (const website of dataUser[userData.email]['websites']) {
                const websiteStatus = fs.readFileSync('websiteStatus.json', 'utf8');
                const data = JSON.parse(websiteStatus);

                logs.push({
                    "website": website,
                    "logs": data.hasOwnProperty(website)?data[website].slice(-1):"no logs found"
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




        }
    });
});


app.get('/downloadzip',(req,res)=>{
//     jwt.verify(req.token, process.env.JWT_SECRET, (err, userData) => {
        // if (err) {
            // res.status(401).json('You are not authorized');
        // } else {
            if(req.query.zipfile && fs.existsSync(path.join(baseDir,req.query.zipfile))){
                // res.download(baseDir+req.query.zipfile)
                // res.setHeader(
                //     'Content-Disposition', `attachment; filename=${req.query.zipfile}`);
                res.download(`${path.join(baseDir,req.query.zipfile)}`,'LogZip.zip');
                
               
            }
            else if(!req.query.zipfile){
                fs.readdir(baseDir, (err, files) => {
                    if (err) {
                        return res.status(500).send('Error reading folder');
                    }
            
                    const downloadLinks = files.map(file => {
                        return `${req.protocol}://${req.get('host')}/logs/${encodeURIComponent(file)}`;
                    });
            
                    res.json(downloadLinks);
                });
            }
            else{
                res.status(404).json('File not found')
            }
           
        // }
    // })
})








const PORT = process.env.PORT || 3000; // Setting default port to 3000 if not provided in .env
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
