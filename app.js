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

app.get("/main", function (req, res) {
    hbs.registerHelper("importanceClass", (importance) => {
        return importance === "ВАЖНО!" ? "important" : "reminder";
    });

    hbs.registerHelper("formatDate", (date) => {
      if (!date) {
        return 'Не указано';
      }

      if (date instanceof Date) {
        date = date.toLocaleDateString("ru-RU");
      }

      if (typeof date === 'string' && date.includes('.')) {
        const dateParts = date.split('.');
        if (dateParts.length !== 3) {
          return 'Некорректная дата';
        }
        const [day, month, year] = dateParts;
        return `${day}.${month}.${year}`;
      }

      return date;
    });
    
    // Query for notifications and contracts
    pool.query("SELECT COUNT(*) AS active_users FROM contract WHERE contract_status = 'Активный'", (err, contractActiveResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Ошибка сервера. Попробуйте позже.");
    }

    pool.query("SELECT COUNT(*) AS passive_users FROM contract WHERE contract_status != 'Активный'", (err, contractPassiveResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Ошибка сервера. Попробуйте позже.");
      }

    pool.query("SELECT importance, content, date FROM notification ORDER BY id DESC LIMIT 5", (err, notificationResults) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }

        // Render the page with the query results
        res.render("main", {
            active_users: contractActiveResults[0].active_users,
            passive_users: contractPassiveResults[0].passive_users,
            notifications: notificationResults || []
        });
    });
});
});
});

app.get("/contract", function (req, res) {
      res.render("contract");
    });

app.get("/search", function (req, res) {
    res.render("search");
});

app.get("/server", function (req, res) {
    const activeTab = req.query.tab || 'tariffs';

    if (activeTab === 'tariffs') {
        // Получаем роль пользователя
        pool.query("SELECT role FROM user WHERE id = ?", [req.session.user.id], (err, roleResults) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера. Попробуйте позже.");
            }

            const userRole = roleResults[0]?.role || 'BASE';
            const canManageTariffs = ['PLUS', 'PRO'].includes(userRole);

            // Получаем тарифы
            pool.query("SELECT * FROM tariffplan", (err, tariffResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                }
                res.render("server", { 
                    activeTab,
                    tariffs: tariffResults,
                    canManageTariffs
                });
            });
        });
    } else {
        res.render("server", { activeTab });
    }
});

app.get("/settings", function (req, res) {
    const activeTab = req.query.tab || 'profile';
    
    pool.query("SELECT role, fullname FROM user WHERE id = ?", [req.session.user.id], (err, userResults) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }
        
        const userRole = userResults[0]?.role;
        const isPro = userRole === 'PRO';
        const canManageNotifications = ['PLUS', 'PRO'].includes(userRole);
        const userProfile = userResults[0];
        
        if (activeTab === 'users' && isPro) {
            pool.query("SELECT id, fullname, login, role FROM user", (err, usersResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                }
                
                res.render("settings", {
                    activeTab,
                    users: usersResults,
                    isPro,
                    canManageNotifications,
                    userProfile
                });
            });
        } else if (activeTab === 'notifications' && canManageNotifications) {
            pool.query("SELECT * FROM notification ORDER BY id DESC LIMIT 5", (err, notificationResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                }
                res.render("settings", {
                    activeTab,
                    isPro,
                    canManageNotifications,
                    userProfile,
                    notifications: notificationResults
                });
            });
        } else {
            res.render("settings", { 
                activeTab,
                isPro,
                canManageNotifications,
                userProfile
            });
        }
    });
});

app.get("/logout", function (req, res) {
    req.session.destroy();
    res.redirect("/");
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
          return res.status(401).render("auth", { error: "Неправильный логин или пароль." });
        }
    
        req.session.user = {
          id: user.id,
          login: user.login,
        };
    
        res.redirect("/main");
    });
});

app.post("/update-tariff", function (req, res) {
    const { id, name, speed, price, limit_gb } = req.body;
    
    pool.query(
        "UPDATE tariffplan SET name = ?, speed = ?, price = ?, limit_gb = ? WHERE id = ?",
        [name, speed, price, limit_gb, id],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера. Попробуйте позже.");
            }
            res.redirect("/server?tab=tariffs");
        }
    );
});

app.post("/create-tariff", function (req, res) {
    const { name, speed, price, limit_gb } = req.body;
    
    pool.query(
        "INSERT INTO tariffplan (name, limit_gb, speed, price) VALUES (?, ?, ?, ?)",
        [name, speed, price, limit_gb],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера. Попробуйте позже.");
            }
            res.redirect("/server?tab=tariffs");
        }
    );
});

app.get("/delete-tariff", function (req, res) {
    const id = req.query.id;
    
    pool.query(
        "DELETE FROM tariffplan WHERE id = ?",
        [id],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера. Попробуйте позже.");
            }
            res.redirect("/server?tab=tariffs");
        }
    );
});

app.post("/create-user", async function (req, res) {
    // Проверяем права доступа
    pool.query("SELECT role FROM user WHERE id = ?", [req.session.user.id], async (err, results) => {
        if (err) {
            return res.status(500).send("Ошибка сервера");
        }
        
        const userRole = results[0]?.role;
        if (userRole !== 'PRO') {
            return res.status(403).send("Недостаточно прав");
        }

        const { fullname, login, password, role } = req.body;
        
        try {
            // Хэшируем пароль
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Создаем пользователя
            pool.query(
                "INSERT INTO user (fullname, login, password, role) VALUES (?, ?, ?, ?)",
                [fullname, login, hashedPassword, role],
                (err, results) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                    }
                    res.redirect("/settings?tab=users");
                }
            );
        } catch (error) {
            console.error(error);
            res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }
    });
});

app.post("/update-user", async function (req, res) {
    const { id, fullname, login, password, role } = req.body;
    
    let query = "UPDATE user SET fullname = ?, login = ?, role = ?";
    let params = [fullname, login, role];
    
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ", password = ?";
        params.push(hashedPassword);
    }
    
    query += " WHERE id = ?";
    params.push(id);
    
    pool.query(query, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }
        res.redirect("/settings?tab=users");
    });
});

app.get("/delete-user", function (req, res) {
    const { id } = req.query;
    
    // Проверяем что пользователь не удаляет сам себя
    if (id === req.session.user.id.toString()) {
        return res.status(400).send("Нельзя удалить свою учетную запись");
    }
    
    pool.query("DELETE FROM user WHERE id = ?", [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }
        res.redirect("/settings?tab=users");
    });
});

app.post("/create-notification", function (req, res) {
    // Проверка прав
    pool.query("SELECT role FROM user WHERE id = ?", [req.session.user.id], (err, results) => {
        if (err) {
            return res.status(500).send("Ошибка сервера");
        }
        
        const userRole = results[0]?.role;
        if (!['PLUS', 'PRO'].includes(userRole)) {
            return res.status(403).send("Недостаточно прав");
        }

        const { importance, content } = req.body;
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');

        pool.query(
            "INSERT INTO notification (importance, content, date) VALUES (?, ?, ?)",
            [importance, content, date],
            (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                }
                res.redirect("/settings?tab=notifications");
            }
        );
    });
});

app.get("/delete-notification", function (req, res) {
    const { id } = req.query;
    
    pool.query("DELETE FROM notification WHERE id = ?", [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Ошибка сервера. Попробуйте позже.");
        }
        res.redirect("/settings?tab=notifications");
    });
});

app.listen(3000, function () {
    console.log("Сервер ожидает подключения на http://localhost:3000...");
});