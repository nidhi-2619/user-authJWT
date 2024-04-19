
import cron from 'node-cron';
import http from 'http';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';
import readLastLines from 'read-last-lines';
// import fetch from 'node-fetch';

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
        expiresIn: '1h',
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

async function checkWebsiteStatus(website, userData){

    const result = await fetch(website)// Using fetch with the provided website URL
        .then(response => {
            // console.log(response)
            return response})
        .then(response => {
            // console.log(typeof(response))
            if (response['status'] === 200) {
                fs.appendFile(`${userData.email}.log.csv`,`${website} is up at ${new Date()}\n`, (err) => {
                    if (err) {
                        console.log(err);
                    } 
                    });
                    return  `${website} is up at ${new Date()}`;
                     
                
            } else {
                fs.appendFile(`${userData.email}.log.csv`, `${website} is down at ${new Date()}\n`, (err) => {
                    if (err) {
                        console.log(err);
                    } 
                });
                return `${website} is down at ${new Date()}`;
            
            }
        })
        .then((result)=>{
            const checkedWebsite = new URL(website)
            // console.log(checkedWebsite)
            fs.appendFile(`${checkedWebsite.hostname}.csv`, `${result}\n`,(err) => {
                if (err) {
                    console.log(err);
                } 
                });
        })
        .catch(err => err);

    return result;

    }


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




app.post('/check', verifyUser, (req, res) => {
    jwt.verify(req.token, process.env.JWT_SECRET, (err, userData) => {
        if (err) {
            res.status(401).json('You are not authorized');
        } else {
                const { website } = req.body; // Extracting website from request body
                const task = cron.schedule('*/5 * * * * *',()=>{
                    checkWebsiteStatus(website, userData);
                } );
                task.start();
                if (fs.existsSync(`${new URL(website).hostname}.csv`)){
                    return res.json("Website Status has been updated please check on /logs endpoint")
                }
                const userInfo = fs.readFileSync('users.json', 'utf8');
                const data = JSON.parse(userInfo);
                if (!data[userData.email]['website'].includes(website)) {
                    data[userData.email]['website'].push(website);
                    fs.writeFileSync('users.json', JSON.stringify(data));
                }
                   
                
                const result = checkWebsiteStatus(website, userData);
                if (result === undefined) {
                    return res.status(500).json('Failed to check website status');
                }
                else{
                    res.json("Website status checked successfully .Check Status at endpoint /logs");
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
            fs.readFile(`${userData.email}.log.csv`, 'utf8', (err, data) => {
                if (err) {
                    return res.status(404).json('Logs not found');
                }
                const result = data.split('\n');
                res.json({
                    "recent_logs": result.slice(-2),
                    "logs": result

                });
            });
        }
    });
});






const PORT = process.env.PORT || 3000; // Setting default port to 3000 if not provided in .env
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
