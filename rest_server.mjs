import * as path from 'node:path';
import * as url from 'node:url';

import { default as express, json } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

const port = 8000;

let app = express();
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
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
