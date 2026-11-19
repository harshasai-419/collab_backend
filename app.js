const path = require("path");
const fs = require("fs");

// Load .env variables natively if available
if (typeof process.loadEnvFile === "function") {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
        process.loadEnvFile(envPath);
    }
}

let express = require("express");
const app = express();
const cors = require("cors");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "users.db");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");

let db = null;
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",").map(url => url.trim()) : []),
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("CORS not allowed for this origin"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

let intializeDbAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (e) {
        console.log(e);
    }
};
intializeDbAndServer();

app.post("/ai", async (req, res) => {
    try {
        const { message } = req.body;
        const agentsRulesPath = path.join(__dirname, "../AGENTS.md");
        const agentsRules = fs.existsSync(agentsRulesPath) ? fs.readFileSync(agentsRulesPath, "utf-8") : "";

        const API_KEY = process.env.OPENROUTER_API_KEY;
        if (!API_KEY) {
            return res.status(500).send("OpenRouter API key is not configured in environment");
        }

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "nvidia/nemotron-3-nano-30b-a3b:free",
                messages: [
                    {
                        role: "system",
                        content: agentsRules,
                    },
                    {
                        role: "user",
                        content: message,
                    },
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(`[${new Date().toLocaleTimeString()}] response received`);
        res.json(response.data.choices[0].message.content);
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Error from AI");
    }
});

app.post("/login", async (request, response) => {
    const { username, password } = request.body;
    const getQuery = `select * from user where username='${username}'`;
    const getItem = await db.get(getQuery);

    if (getItem === undefined) {
        response.status(401);
        response.send("Invalid username");
    } else {
        const isPassMatch = await bcrypt.compare(password, getItem.password);
        if (isPassMatch === true) {
            const payload = {
                username: username,
            };
            const jwtToken = jwt.sign(payload, JWT_SECRET);
            response.send({ jwtToken });
        } else {
            response.status(400);
            response.send("Invalid password");
        }
    }
});

app.post("/register", async (request, response) => {
    const { username, password } = request.body;
    const getQuery = `select * from user where username='${username}'`;
    const getItem = await db.get(getQuery);

    if (getItem === undefined) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = `insert into user (username,password) values ('${username}','${hashedPassword}');`;
        await db.run(insertQuery);
        response.send("registered successfully");
    } else {
        response.send('username already exists');
    }
});

app.post('/addTask', async (request, response) => {
    const { title, teamName, date, priority } = request.body;
    const insertQuery = `insert into tasks (teamName,date,priority,status,title) values ('${teamName}','${date}','${priority}','InProgress','${title}');`;
    await db.run(insertQuery);
    const getQuery = `select * from tasks`;
    const res = await db.all(getQuery);
    response.send(res);
});

app.post('/addTeam', async (request, response) => {
    const { teamLead, teamName } = request.body;
    const insertQuery = `insert into teams (teamName,teamLead) values ('${teamName}','${teamLead}');`;
    await db.run(insertQuery);
    const getQuery = `select * from teams`;
    const res = await db.all(getQuery);
    response.send(res);
});

app.delete('/deleteTeam', async (req, res) => {
    const { teamLead } = req.query;
    let deleteQuery = `delete from teams where teamLead='${teamLead}'`;
    await db.run(deleteQuery);
    let getResQuery = `select * from teams`;
    let getRes = await db.all(getResQuery);
    res.send(getRes);
});

app.post('/editTask', async (request, response) => {
    const { title, teamName, date, priority, status, taskId } = request.body;
    const updateQuery = `update tasks set teamName='${teamName}',date='${date}',priority='${priority}',status='${status}',title='${title}' where id=${taskId}`;
    await db.run(updateQuery);
    const getQuery = `select * from tasks`;
    const res = await db.all(getQuery);
    console.log(res);
    response.send(res);
});

app.post('/changeStatus', async (request, response) => {
    const { taskId, status } = request.body;
    const updateQuery = `update tasks set status='${status}' where id=${taskId}`;
    await db.run(updateQuery);
    let getQuery = `select * from tasks`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.get("/getTasks", async (request, response) => {
    let getQuery = `select * from tasks`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.get("/getTeam", async (request, response) => {
    let getQuery = `select * from teams`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.get("/getCount", async (request, response) => {
    let getQuery = `select priority,COUNT() AS number from tasks GROUP BY priority`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.get("/getCompleted", async (request, response) => {
    let getQuery = `select * from tasks where status='Completed'`;
    let getItem = await db.all(getQuery);
    console.log(getItem);
    response.send(getItem);
});

app.get("/gettodo", async (request, response) => {
    let getQuery = `select * from tasks where status='ToDo'`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.get("/getinprogress", async (request, response) => {
    let getQuery = `select * from tasks where status='InProgress'`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.post("/duplicate", async (request, response) => {
    let { taskId } = request.body;
    let getQuery = `select * from tasks where id=${taskId}`;
    let getItem = await db.get(getQuery);
    let { teamName, date, priority, status, title } = getItem;
    let insertQuery = `insert into tasks (teamName,date,priority,status,title) values ('${teamName}','${date}','${priority}','${status}','${title}');`;
    await db.run(insertQuery);
    let getResQuery = `select * from tasks`;
    let getRes = await db.all(getResQuery);
    response.send(getRes);
});

app.post("/delete", async (request, response) => {
    let { taskId } = request.body;
    let getQuery = `select * from tasks where id=${taskId}`;
    let getItem = await db.get(getQuery);
    let { teamName, title, date, priority, status } = getItem;
    let insertQuery = `insert into trash (teamName,date,priority,status,title) values ('${teamName}','${date}','${priority}','${status}','${title}');`;
    await db.run(insertQuery);
    let deleteQuery = `delete from tasks where id=${taskId}`;
    await db.run(deleteQuery);
    let getResQuery = `select * from tasks`;
    let getRes = await db.all(getResQuery);
    response.send(getRes);
});

app.get("/getStatus", async (request, response) => {
    let getQuery = `select status,COUNT() AS count from tasks GROUP BY status`;
    let getQuery2 = `select count() AS totalCount from tasks`;
    let getItem = await db.all(getQuery);
    let getItem2 = await db.get(getQuery2);
    response.send({ getItem, getItem2 });
});

app.get("/getTrash", async (request, response) => {
    let getQuery = `select * from trash`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.post("/trashTask", async (request, response) => {
    let { trashId } = request.body;
    let deleteQuery = `delete from trash where id=${trashId}`;
    await db.run(deleteQuery);
    let getQuery = `select * from trash`;
    let getItem = await db.all(getQuery);
    response.send(getItem);
});

app.post("/restoreTask", async (request, response) => {
    let { trashId } = request.body;
    console.log(trashId);
    let getQuery = `select * from trash where id=${trashId}`;
    let getItem = await db.get(getQuery);
    let { teamName, title, date, priority, status } = getItem;
    let insertQuery = `insert into tasks (teamName,date,priority,status,title) values ('${teamName}','${date}','${priority}','${status}','${title}');`;
    await db.run(insertQuery);
    let deleteQuery = `delete from trash where id=${trashId}`;
    await db.run(deleteQuery);
    let getQuery2 = `select * from trash`;
    let getItem2 = await db.all(getQuery2);

    response.send(getItem2);
});

const buildPath = path.join(__dirname, "../frontend/build");
if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
}

module.exports = app;
