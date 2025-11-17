import * as path from 'node:path';
import * as url from 'node:url';

import { default as express, json } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

let public_dir = './public';

const port = 8080;

let app = express();
app.use(express.static(public_dir));
app.use(express.json());

/********************************************************************
 ***   DATABASE FUNCTIONS                                         *** 
 ********************************************************************/
// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.log('Error opening ' + path.basename(db_filename));
    }
    else {
        console.log('Now connected to ' + path.basename(db_filename));
    }
});

// Create Promise for SQLite3 database SELECT query 
function dbSelect(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        });
    });
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

/********************************************************************
 ***   REST REQUEST HANDLERS                                      *** 
 ********************************************************************/
// GET request handler for crime codes
app.get('/codes', async (req, res) => {
    try {
        const rows = await dbSelect(
            'SELECT code, incident_type AS type FROM Codes ORDER BY code ASC',
            []
        );
        res.status(200).type('json').send(rows);
    } catch (err) {
        console.error(err);
        res.status(500).type('json').send({ error: 'Database error' });
    }
});

// GET request handler for neighborhoods
app.get('/neighborhoods', async (req, res) => {
    try {
        const rows = await dbSelect(
            'SELECT neighborhood_number AS id, neighborhood_name AS name FROM Neighborhoods ORDER BY neighborhood_number ASC',
            []
        );
        res.status(200).type('json').send(rows);
    } catch (err) {
        console.error(err);
        res.status(500).type('json').send({ error: 'Database error' });
    }
});

// GET request handler for crime incidents

app.get('/incidents', async (req, res) => {
    try {
        const rows = await dbSelect(
            `SELECT
                case_number,
                date(date_time) AS date,
                time(date_time) AS time,
                code,
                incident,
                police_grid,
                neighborhood_number,
                block
             FROM Incidents
             ORDER BY datetime(date_time) DESC`,
            []
        );
        res.status(200).type('json').send(rows);
    } catch (err) {
        console.error(err);
        res.status(500).type('json').send({ error: 'Database error' });
    }
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    const case_number = req.body.case_number;
    const date = req.body.date;
    const time = req.body.time;
    const code = req.body.code;
    const incident = req.body.incident;
    const police_grid = req.body.police_grid;
    const neighborhood_number = req.body.neighborhood_number;
    const block = req.body.block;

    if (!case_number || !date || !time || !code || !incident || !police_grid || !neighborhood_number || !block) {
        res.status(400).type('txt').send('Missing one or more required fields');
        return;
    }

    const date_time = `${date}T${time}`;

    const sql = `INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block)
                VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        case_number,
        date_time,
        code,
        incident,
        police_grid,
        neighborhood_number,
        block
    ];

    dbRun(sql, params)
    .then(() => {
        res.status(200).type('txt').send('success');
    })
    .catch(err => {
        console.error('error inserting incident', err);
        if (err.code === 'SQLITE_CONSTRAINT') {
            res.status(400).type('txt').send('Incident already exists');
        }
        else {
            res.status(500).type('txt').send('Database error');
        }
    })
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.body); // uploaded data
    let case_num = req.body.case_number;
    let sql = "DELETE FROM Incidents WHERE case_number = ?";
    dbRun(sql,[case_num])
        .then(() =>{
            res.status(200).type('txt').send("success");
        })
        .catch((err) =>{
            console.log(err);
            res.status(500).type('txt').send("SQL error");
        })
});

/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
