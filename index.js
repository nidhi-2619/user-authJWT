
import cron from 'node-cron';
import http from 'http';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';
import readLastLines from 'read-last-lines';
import fetch from 'node-fetch';
import { log } from 'console';
import { reverse } from 'dns';

dotenv.config({ path: './.env' });

const app = express();
app.use(express.json());

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

function verifyAccessToken(token) {
    const secret = process.env.JWT_SECRET;
    try {
        const decoded = jwt.verify(token, secret);
        return { success: true, data: decoded };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function checkWebsiteStatus(website){
    const result = await fetch(website)// Using fetch with the provided website URL
        .then(response => {
            if (response['status'] === 200) {
                    // return  `${website} is up at ${new Date()}`;
                    return ({
                        "status": "UP",
                        "time": new Date().toLocaleString()
                    })
                
            } else {
                // return `${website} is down at ${new Date()}`;
                return ({
                    "status": "DOWN",
                    "time": new Date().toLocaleString()
                })
            }
        })
        .then(res=>{
           
            if (fs.existsSync('checkedwebsite.json') === false)
                fs.writeFileSync('checkedwebsite.json', JSON.stringify({}));
            const websiteStatus = fs.readFileSync('checkedwebsite.json', 'utf8');
            let data = JSON.parse(websiteStatus);
            if (!data[website]) data[website] = [res];
            else data[website].push(res)
            fs.writeFileSync('checkedwebsite.json', JSON.stringify(data));
        
})
        .catch(err => err);
    
    return result

    }



setInterval( ()=>{
    const userSearchedWebsites = fs.readFileSync('users.json', 'utf8');
    const userHistory = JSON.parse(userSearchedWebsites);
    // console.log(userHistory)
    console.log('Checking website status')
    for (const user in userHistory) {
        if (!userHistory[user].hasOwnProperty('websites')){
            continue;
        }
        const websites = userHistory[user].websites;
        for (const website of websites) {

        fetch(website)// Using fetch with the provided website URL
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
        .then((result)=>{
            if (fs.existsSync('checkedwebsite.json') === false)
                fs.writeFile('checkedwebsite.json', JSON.stringify({}));
            const websiteStatus = fs.readFileSync('checkedwebsite.json', 'utf8');
            let data = JSON.parse(websiteStatus);
            console.log(data)
            if (!data[website]) data[website] = [result];
            else data[website].push(result)
            fs.writeFileSync('checkedwebsite.json', JSON.stringify(data));
        
        })
        .catch(err => err);
    }
}

},1000*60*30);


  

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
                const websiteStatus = fs.readFileSync('checkedwebsite.json', 'utf8');
                const data = JSON.parse(websiteStatus);

                logs.push({
                    "website": website,
                    "logs": data.hasOwnProperty(website)?data[website].slice(-1):"no logs found"
                })
            }
            res.json({

                "recent logs": logs
            });




        }
    });
});






const PORT = process.env.PORT || 3000; // Setting default port to 3000 if not provided in .env
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
