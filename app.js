const mysql = require("mysql2");
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const hbs = require("hbs");
const ping = require("ping");
const app = express();

app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));

hbs.registerHelper('encodeURIComponent', function (value) {
  return encodeURIComponent(value);
});

hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

hbs.registerHelper("or", (a, b) => a || b);

app.use(session({
  secret: "sdhfgjksd65gdf5",
  resave: false,
  saveUninitialized: true
}));

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: "3306",
  user: "root",
  password: "admin",
  database: "httpsbilling",
  charset: "UTF8_GENERAL_CI"
});

app.set("view engine", "hbs");

app.get("/", function (req, res) {
    res.render("auth");
});

app.post("/login", function (req, res) {
    const { login, password } = req.body;

    pool.query("SELECT * FROM user WHERE login = ?", [login], async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).render("auth", { error: "Ошибка сервера. Попробуйте позже." });
        }
    
        if (results.length === 0) {
          return res.status(401).render("auth", { error: "Неправильный логин или пароль." });
        }
    
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).render("auth", { error: ";kgf" });
        }
    
        req.session.user = {
          id: user.id,
          login: user.login,
        };
    
        res.redirect("/main");
    });
});










app.listen(3000, function () {
    console.log("Сервер ожидает подключения на http://localhost:3000...");
});