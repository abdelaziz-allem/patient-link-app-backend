const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

app.use(bodyParser.json());
const pool = mysql
  .createPool({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
  })
  .promise();

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
  res.json({ message: "Access denied" });
});

app.get("/appointments", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql =
      "SELECT a.appointment_id,a.app_reason,a.appointment_time,a.appointment_date,b.patient_name,c.staff_name FROM appointment AS a INNER JOIN patient AS b ON a.patient_id=b.patient_id INNER JOIN staff AS c ON a.doctor_id = c.staff_id";
    if (id) {
      sql += ` WHERE a.patient_id = ${id} ORDER BY a.appointment_date DESC`;
    }
    const [rows] = await pool.execute(sql);
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
      "SELECT a.appointment_id,a.app_reason,a.appointment_time,a.appointment_date,b.patient_name,c.staff_name FROM appointment AS a INNER JOIN patient AS b ON a.patient_id=b.patient_id INNER JOIN staff AS c ON a.doctor_id = c.staff_id";
    if (id) {
      sql += ` WHERE a.patient_id = ${id} ORDER BY a.appointment_date DESC LIMIT 2`;
    }
    const [rows] = await pool.execute(sql);
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
      "SELECT appointment_id, SUM(CASE WHEN type = 'prescription' THEN bill_amount ELSE 0 END) AS prescription_sum, SUM(CASE WHEN type = 'treatment' THEN bill_amount ELSE 0 END) AS treatment_sum FROM bill ";
    if (id) {
      sql += `WHERE patient_id=${id} AND (type = 'prescription' OR type = 'treatment') GROUP BY appointment_id`;
    }
    const [rows] = await pool.execute(sql);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ error: "Error fetching bills" });
  }
});

app.get("/discounts", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql = "SELECT SUM(discount_amount) AS discount_sum FROM discount ";
    if (id) {
      sql += `WHERE patient_id=${id}`;
      const [rows] = await pool.execute(sql);
      res.json(rows);
    }
  } catch (error) {
    console.error("Error fetching discounts:", error);
    res.status(500).json({ error: "Error fetching discounts" });
  }
});

app.get("/payments", authenticateToken, async (req, res) => {
  try {
    const id = req.query.id;
    let sql = "SELECT SUM(paid_amount) AS paid_sum FROM payment ";
    if (id) {
      sql += `WHERE patient_id=${id}`;
    }
    const [rows] = await pool.execute(sql);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Error fetching payments" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const userData = req.body;
    let sql = "SELECT * FROM patient";
    if (userData) {
      sql += ` WHERE phone = '${userData.phoneNumber}' AND password = '${userData.password}'  `;
    }
    const [rows] = await pool.execute(sql);

    if (rows.length !== 0) {
      const token = jwt.sign({ userId: rows[0].id }, secretKey);
      res.json({ isAuthenticated: true, data: rows, JWTtoken: token });
    } else {
      res.json({ isAuthenticated: false, data: [] });
    }
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({ error: "Error fetching patient" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
