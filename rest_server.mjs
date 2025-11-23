import * as path from 'node:path';
import * as url from 'node:url';

import { default as express, json } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

let public_dir = './public';

const port = 8000;

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
    let codeParam = req.query.code;
    let sql;
    let params = [];

    if (!codeParam) {
        sql = 'SELECT code, incident_type AS type FROM Codes ORDER BY code ASC';    
    } else {
        let codes = [];
        let codeStrings = codeParam.split(',');

        for (let i = 0; i < codeStrings.length; i++) {
            let num = Number(codeStrings[i].trim());
            if (!Number.isNaN(num)) {
                codes.push(num);
            }
        }

        // wrong input given
        if (codes.length === 0) {
            res.status(400).type('txt').send('Invalid code parameter');
            return;
        }

        let placeholders = codes.map(() => '?').join(',');    
        sql = 'SELECT code, incident_type AS type FROM Codes WHERE code IN (' + placeholders + ') ORDER BY code ASC';
        params = codes;
    }
    
    dbSelect(sql, params)
    .then(rows => {
        res.status(200).type('json').send(rows);
    })
    .catch(err => {
        console.log(err);
        res.status(500).type('text').send('Error', err);
    })
});

// GET request handler for neighborhoods
app.get('/neighborhoods', async (req, res) => {
    let idParam = req.query.id;
    let sql;
    let params = [];

    if (!idParam) {
        sql = 'SELECT neighborhood_number AS id, neighborhood_name AS name FROM Neighborhoods ORDER BY neighborhood_number ASC';
    } else {
        let ids = [];
        let idString = idParam.split(',');

        for (let i = 0; i < idString.length; i++) {
            let num = Number(idString[i].trim());
            if (!Number.isNaN(num)) {
                ids.push(num);
            }
        }

        // wrong input given
        if (ids.length === 0) {
            res.status(400).type('txt').send('Invalid id parameter');
            return;
        }

        let placeholders = ids.map(() => '?').join(',');    
        sql = 'SELECT neighborhood_number AS id, neighborhood_name AS name FROM Neighborhoods WHERE neighborhood_number IN (' + placeholders + ') ORDER BY neighborhood_number ASC';
        params = ids;
    }
    
    dbSelect(sql, params)
    .then(rows => {
        res.status(200).type('json').send(rows);
    })
    .catch(err => {
        console.log(err);
        res.status(500).type('text').send('Error', err);
    })
});

// GET request handler for crime incidents

app.get('/incidents', async (req, res) => {
    try {
        const {
            start_date,
            end_date,
            code,
            grid,
            neighborhood,
            limit: limitRaw
        } = req.query;

        //validate dates
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (start_date && !datePattern.test(String(start_date))) {
            return res.status(400).type('json').send({
                error: 'start_date must be in YYYY-MM-DD format'
            });
        }
        if (end_date && !datePattern.test(String(end_date))) {
            return res.status(400).type('json').send({
                error: 'end_date must be in YYYY-MM-DD format'
            });
        }

        //limit (default 1000)
        let limit = 1000;
        if (limitRaw !== undefined && String(limitRaw).trim() !== '') {
            const n = Number(limitRaw);
            if (!Number.isInteger(n) || n <= 0) {
                return res.status(400).type('json').send({
                    error: 'limit must be a positive integer'
                });
            }
            limit = n;
        }

        let sql = `
            SELECT
                case_number,
                date(date_time) AS date,
                time(date_time) AS time,
                code,
                incident,
                police_grid,
                neighborhood_number,
                block
            FROM Incidents
        `;
        const params = [];
        const where = [];

        //date range filters
        if (start_date) {
            where.push('date(date_time) >= ?');
            params.push(start_date);
        }
        if (end_date) {
            where.push('date(date_time) <= ?');
            params.push(end_date);
        }

        // helper INSIDE this route to add int-list filters
        function addIntListFilter(rawValue, columnName, paramName) {
            if (rawValue === undefined) return; // no filter
            const rawList = String(rawValue).split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            const nums = rawList.map(v => Number(v));
            if (rawList.length === 0 || nums.some(n => !Number.isInteger(n))) {
                throw {
                    clientError: true,
                    message: `Query parameter "${paramName}" must be a comma-separated list of integers`
                };
            }
            where.push(`${columnName} IN (${nums.map(() => '?').join(',')})`);
            params.push(...nums);
        }

        //code, grid, neighborhood filters
        try {
            addIntListFilter(code, 'code', 'code');
            addIntListFilter(grid, 'police_grid', 'grid');
            addIntListFilter(neighborhood, 'neighborhood_number', 'neighborhood');
        } catch (e) {
            if (e.clientError) {
                return res.status(400).type('json').send({ error: e.message });
            }
            throw e; // real error, handled by catch below
        }

        // apply WHERE if we have any filters
        if (where.length > 0) {
            sql += ' WHERE ' + where.join(' AND ');
        }

        // most recent first + limit
        sql += ' ORDER BY datetime(date_time) DESC';
        sql += ' LIMIT ?';
        params.push(limit);

        const rows = await dbSelect(sql, params);
        res.status(200).type('json').send(rows);
    } catch (err) {
        console.error(err);
        res.status(500).type('json').send({ error: 'Database error' });
    }
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    let case_number = req.body.case_number;
    let date = req.body.date;
    let time = req.body.time;
    let code = req.body.code;
    let incident = req.body.incident;
    let police_grid = req.body.police_grid;
    let neighborhood_number = req.body.neighborhood_number;
    let block = req.body.block;

    if (!case_number || !date || !time || !code || !incident || !police_grid || !neighborhood_number || !block) {
        res.status(400).type('txt').send('Missing one or more required fields');
        return;
    }

    let date_time = `${date}T${time}`;

    let sql = `INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block)
                VALUES (?, ?, ?, ?, ?, ?, ?)`;

    let params = [
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
            res.status(500).type('txt').send('Incident already exists');
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
    let sql2 = "SELECT * FROM Incidents WHERE case_number = ?";
    dbSelect(sql2,[case_num])
        .then((rows) =>{
            if(rows.length === 0){
                res.status(500).type('txt').send("Case Number: " + case_num + ", doesn't exist");
                return;
            }
            dbRun(sql,[case_num])
                .then(() =>{
                    res.status(200).type('txt').send("Case Number: " + case_num + ", successfully deleted");
                })
                .catch((err) =>{
                    console.log(err);
                    res.status(500).type('txt').send("SQL error");
                })
        })
        .catch((err)=>{
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
