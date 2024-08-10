const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const mysql2Timeout = require("mysql2-timeout-additions");
require("dotenv").config();
const MAX_QUERY_EXECUTION_TIME_SECONDS = 5;

app.use(bodyParser.json());

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});
const promisePool = pool.promise();

promisePool
  .getConnection()
  .then((connection) => {
    console.log("Connected to MySQL database!");
    connection.release();
  })
  .catch((err) => {
    console.error("Error connecting to MySQL database:", err);
  });

const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
  console.error("JWT secret not found in environment variable!");
  process.exit(1);
}

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.userId = decoded.userId;
    next();
  });
};

app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "Access granted" });
});

app.get("/appointments", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql =
      "SELECT a.status, a.appointment_id, a.app_reason, a.appointment_time, a.appointment_date, b.patient_name, c.staff_name " +
      "FROM appointment AS a " +
      "INNER JOIN patient AS b ON a.patient_id = b.patient_id " +
      "INNER JOIN staff AS c ON a.doctor_id = c.staff_id";

    const params = [];
    if (id) {
      sql += " WHERE a.patient_id = ? ORDER BY a.appointment_date DESC";
      params.push(id);
    }

    const [rows] = await promisePool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: "Error fetching appointments" });
  }
});

app.get("/latestappointments", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql =
      "SELECT a.appointment_id, a.app_reason, a.appointment_time, a.appointment_date, b.patient_name, c.staff_name " +
      "FROM appointment AS a " +
      "INNER JOIN patient AS b ON a.patient_id = b.patient_id " +
      "INNER JOIN staff AS c ON a.doctor_id = c.staff_id";

    const params = [];
    if (id) {
      sql += " WHERE a.patient_id = ? ORDER BY a.appointment_date DESC LIMIT 2";
      params.push(id);
    }

    const [rows] = await promisePool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: "Error fetching appointments" });
  }
});

app.get("/bills", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql =
      "SELECT SUM(CASE WHEN type = 'prescription' THEN bill_amount ELSE 0 END) AS prescription_sum, " +
      "SUM(CASE WHEN type = 'treatment' THEN bill_amount ELSE 0 END) AS treatment_sum " +
      "FROM bill WHERE (type = 'prescription' OR type = 'treatment')";

    const params = [];
    if (id) {
      sql += " AND patient_id = ?";
      params.push(id);
    }

    const [rows] = await promisePool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ error: "Error fetching bills" });
  }
});

app.get("/ticket", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql =
      "SELECT a.patient_id, a.ticket_date, a.ticket_time, a.ticket_number, b.patient_name, b.phone, c.staff_name " +
      "FROM ticket AS a " +
      "INNER JOIN patient AS b ON a.patient_id = b.patient_id " +
      "INNER JOIN staff AS c ON a.doctor_id = c.staff_id";

    const params = [];
    if (id) {
      sql += " WHERE a.patient_id = ? ORDER BY a.ticket_id LIMIT 1";
      params.push(id);
    }

    const [rows] = await promisePool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Error fetching ticket" });
  }
});

app.get("/payments", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql = "SELECT SUM(paid_amount) AS paid_sum FROM payment WHERE 1=1";

    const params = [];
    if (id) {
      sql += " AND patient_id = ?";
      params.push(id);
    }

    const [rows] = await promisePool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Error fetching payments" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    const [rows] = await promisePool.execute(
      "SELECT * FROM patient WHERE phone = ?",
      [phoneNumber]
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ isAuthenticated: false, message: "User not found" });
    }

    const user = rows[0];

    const isMatch = await bcryptjs.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ userId: user.patient_id }, secretKey);
      res.json({ isAuthenticated: true, data: user, JWTtoken: token });
    } else {
      res
        .status(401)
        .json({ isAuthenticated: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Error logging in" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
