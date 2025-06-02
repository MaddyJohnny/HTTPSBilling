const mysql = require("mysql2");
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const hbs = require("hbs");
const ping = require("ping");
const app = express();

app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));

// Регистрируем хелперы в начале файла
hbs.registerHelper("formatDate", function(date) {
    if (!date) return "Не определено";
    return new Date(date).toLocaleDateString("ru-RU");
});

hbs.registerHelper("hasRole", function (userRole, roles) {
    return roles.includes(userRole);
});

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

// Add this function before app.get("/contract")
function formatContractNumber(date, count) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const number = String(count + 1).padStart(2, '0');
    return `${month}${day}${number}/${year}`;
}

// Add this helper function at the top of the file
function formatDateForInput(mysqlDate) {
    if (!mysqlDate) return '';
    const date = new Date(mysqlDate);
    return date.toLocaleDateString('en-CA'); // Формат YYYY-MM-DD без изменения временной зоны
}

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
    
    // Добавляем хелпер для форматирования телефона
hbs.registerHelper("formatPhone", (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^7(\d{10})$/);
    if (match) {
        return `+7${match[1]}`;
    }
    return phone;
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
    const activeTab = req.query.tab || 'parameters';
    const contractNumber = req.query.number;

    // Получаем роль пользователя
    pool.query("SELECT role FROM user WHERE id = ?", [req.session.user.id], (err, roleResults) => {
        if (err) {
            return res.status(500).send("Ошибка сервера");
        }

        const userRole = roleResults[0]?.role || 'BASE';
        const canDeleteContract = ['PLUS', 'PRO'].includes(userRole);

        if (contractNumber) {
            if (activeTab === 'connections') {
                // Получаем список соединений
                pool.query(
                    `SELECT c.*, c.connection_id, c.ip, t.name as tariff_name 
                     FROM contract c 
                     LEFT JOIN tariffplan t ON c.tariff_id = t.id 
                     WHERE c.contract_number = ?`,
                    [contractNumber],
                    (err, contractResults) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }

                        const contract = contractResults[0];
                        // Получаем последние два октета IP если он есть
                        let ipSuffix = '';
                        if (contract.ip) {
                            ipSuffix = contract.ip.split('.').slice(2).join('.');
                        }

                        // Получаем все соединения
                        pool.query("SELECT * FROM connection", (err, connectionResults) => {
                            if (err) {
                                console.error(err);
                                return res.status(500).send("Ошибка сервера");
                            }

                            res.render("contract", {
                                activeTab,
                                contract: {
                                    ...contract,
                                    ip_suffix: contract.ip ? contract.ip.split('.').slice(2).join('.') : ''
                                },
                                contractNumber,
                                connections: connectionResults,
                                scripts: [
                                    `<script>
                                    document.addEventListener('DOMContentLoaded', function() {
                                        const connectionSelect = document.getElementById('connectionSelect');
                                        const ipInputContainer = document.getElementById('ipInputContainer');
                                        const ipPrefix = document.getElementById('ipPrefix');
                                        const ipSuffix = document.getElementById('ipSuffix');

                                        // Показываем IP поле и текущее значение если соединение выбрано
                                        if (connectionSelect.value) {
                                            const selected = connectionSelect.selectedOptions[0];
                                            const minIp = selected.dataset.minIp;
                                            const prefix = minIp.split('.').slice(0, 2).join('.');
                                            ipPrefix.textContent = prefix + '.';
                                            ipInputContainer.style.display = 'block';

                                            // Отображаем только последние два октета текущего IP
                                            if (ipSuffix.value) {
                                                ipSuffix.value = ipSuffix.value.split('.').slice(-2).join('.');
                                            }
                                        }

                                        // Обработчик изменения соединения
                                        connectionSelect.addEventListener('change', function() {
                                            const selected = connectionSelect.selectedOptions[0];
                                            if (selected.value) {
                                                const minIp = selected.dataset.minIp;
                                                const maxIp = selected.dataset.maxIp;
                                                
                                                const prefix = minIp.split('.').slice(0, 2).join('.');
                                                ipPrefix.textContent = prefix + '.';
                                                
                                                const minRange = minIp.split('.').slice(2);
                                                const maxRange = maxIp.split('.').slice(2);
                                                
                                                ipSuffix.value = '';
                                                ipSuffix.setAttribute('placeholder', minRange.join('.') + ' - ' + maxRange.join('.'));
                                                

                                                ipInputContainer.style.display = 'block';
                                            } else {
                                                ipInputContainer.style.display = 'none';
                                            }
                                        });
                                    });
                                    </script>`
                                ],
                                userRole,
                                canDeleteContract,
                                hasContract: !!contractNumber
                            });
                        });
                    }
                );
            } else if (activeTab === 'tariff') {
                // Получаем данные договора и список тарифов
                pool.query(
                    `SELECT c.*, t.name as tariff_name 
                     FROM contract c 
                     LEFT JOIN tariffplan t ON c.tariff_id = t.id 
                     WHERE c.contract_number = ?`,
                    [contractNumber],
                    (err, contractResults) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }

                        // Получаем все тарифы для выбора
                        pool.query("SELECT * FROM tariffplan", (err, tariffResults) => {
                            if (err) {
                                console.error(err);
                                return res.status(500).send("Ошибка сервера");
                            }

                            res.render("contract", {
                                activeTab,
                                contract: contractResults[0],
                                contractNumber,
                                tariffs: tariffResults,
                                userRole,
                                canDeleteContract,
                                hasContract: !!contractNumber
                            });
                        });
                    }
                );
            } else if (activeTab === 'balance') {
                pool.query(
                    `SELECT c.*, b.current_balance, b.last_debit, b.last_credit, b.last_debit_date, b.next_debit_date 
                     FROM contract c 
                     LEFT JOIN balance b ON c.balance_id = b.id 
                     WHERE c.contract_number = ?`,
                    [contractNumber],
                    (err, results) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }
                        
                        const contract = results[0];
                        res.render("contract", {
                            activeTab,
                            contractNumber,
                            contract: {
                                ...contract,
                                current_balance: Number(contract.current_balance || 0).toFixed(2),
                                last_debit: Number(contract.last_debit || 0).toFixed(2),
                                last_credit: Number(contract.last_credit || 0).toFixed(2)
                            },
                            userRole,
                            canDeleteContract,
                            hasContract: !!contractNumber
                        });
                    }
                );
            } else {
                pool.query("SELECT * FROM contract WHERE contract_number = ?", [contractNumber], (err, results) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                    }
                    
                    const contract = results[0];
                    res.render("contract", { 
                        activeTab,
                        contract,
                        contractExists: !!contract,
                        // Обновляем имена переменных
                        contractNumber: contract.contract_number,
                        contract_status: contract.contract_status, // убедимся, что передается правильное имя поля
                        full_name: contract.full_name,
                        phone: contract.phone,
                        connection_address: contract.connection_address,
                        registration_address: contract.registration_address,  // изменено с registrationAddress
                        birthDate: formatDateForInput(contract.birth_date),
                        documentType: contract.document_type,
                        documentSeries: contract.document_series,
                        documentNumber: contract.document_number,
                        documentIssuedBy: contract.issued_by,
                        documentIssueDate: formatDateForInput(contract.issue_date),
                        contractStatus: contract.contract_status,
                        contract_date: formatDateForInput(contract.contract_date),
                        connection_date: formatDateForInput(contract.actual_connection_date),
                        userRole,
                        canDeleteContract,
                        hasContract: !!contractNumber
                    });
                });
            }
        } else {
            // Получаем количество договоров за сегодня
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            pool.query(
                "SELECT COUNT(*) as count FROM contract WHERE DATE(contract_date) = DATE(?)",
                [today],
                (err, results) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                    }

                    const contractNumber = formatContractNumber(today, results[0].count);
                    
                    res.render("contract", { 
                        activeTab,
                        contractExists: false,
                        contractNumber,
                        userRole,
                        canDeleteContract,
                        hasContract: false
                    });
                }
            );
        }
    });
});

app.get("/search", function (req, res) {
    const { contract_number, full_name, connection_address, page = 1 } = req.query;
    const limit = 5;
    const offset = (page - 1) * limit;
    
    let conditions = [];
    let params = [];
    
    if (contract_number) {
        conditions.push("contract_number LIKE ?");
        params.push(`%${contract_number}%`);
    }
    if (full_name) {
        conditions.push("full_name LIKE ?");
        params.push(`%${full_name}%`);
    }
    if (connection_address) {
        conditions.push("connection_address LIKE ?");
        params.push(`%${connection_address}%`);
    }

    if (conditions.length > 0) {
        const whereClause = conditions.join(" AND ");
        
        // Получаем общее количество результатов
        pool.query(
            `SELECT COUNT(*) as total FROM contract WHERE ${whereClause}`,
            params,
            (err, countResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Ошибка сервера");
                }

                const total = countResults[0].total;
                const totalPages = Math.ceil(total / limit);

                // Получаем результаты для текущей страницы
                pool.query(
                    `SELECT contract_number, full_name, contract_status 
                     FROM contract 
                     WHERE ${whereClause} 
                     LIMIT ? OFFSET ?`,
                    [...params, limit, offset],
                    (err, results) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }

                        // Формируем параметры для пагинации
                        const queryParams = new URLSearchParams(req.query);
                        queryParams.delete('page');
                        const baseQuery = queryParams.toString();

                        res.render("search", {
                            results,
                            isSearch: true,
                            query: req.query,
                            totalResults: total,
                            pagination: {
                                currentPage: parseInt(page),
                                totalPages,
                                prev: page > 1,
                                next: page < totalPages,
                                prevQuery: `${baseQuery}&page=${parseInt(page) - 1}`,
                                nextQuery: `${baseQuery}&page=${parseInt(page) + 1}`
                            }
                        });
                    }
                );
            }
        );
    } else {
        res.render("search", { isSearch: false });
    }
});

app.get("/server", function (req, res) {
    const activeTab = req.query.tab || 'tariffs';
    
    // Получаем роль пользователя
    pool.query("SELECT role FROM user WHERE id = ?", [req.session.user.id], (err, roleResults) => {
        if (err) {
            return res.status(500).send("Ошибка сервера");
        }

        const userRole = roleResults[0]?.role || 'BASE';
        const canManageTariffs = ['PLUS', 'PRO'].includes(userRole);
        const isPro = userRole === 'PRO';

        if (activeTab === 'connections' && !isPro) {
            return res.redirect('/server?tab=tariffs');
        }

        if (activeTab === 'network') {
            pool.query("SELECT * FROM connection", (err, connections) => {
                if (err) {
                    return res.status(500).send("Ошибка сервера");
                }
                res.render("server", { activeTab, connections, isPro, canManageTariffs });
            });
        } else if (activeTab === 'connections' && isPro) {
            pool.query("SELECT * FROM connection", (err, connections) => {
                if (err) {
                    return res.status(500).send("Ошибка сервера");
                }
                res.render("server", { activeTab, connections, isPro, canManageTariffs });
            });
        } else {
            pool.query("SELECT * FROM tariffplan", (err, tariffResults) => {
                if (err) {
                    return res.status(500).send("Ошибка сервера");
                }
                res.render("server", { 
                    activeTab,
                    tariffs: tariffResults,
                    canManageTariffs,
                    isPro
                });
            });
        }
    });
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

app.post("/create-contract", function (req, res) {
    // Сначала создаем запись в balance
    pool.query(
        "INSERT INTO balance (current_balance, last_debit, last_debit_date, next_debit_date) VALUES (0, 0, NULL, NULL)",
        (err, balanceResult) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера. Попробуйте позже.");
            }

            const balanceId = balanceResult.insertId;
            const {
                contract_number,
                full_name,
                phone,
                connection_address,
                registration_address,
                birth_date,
                document_type,
                document_series,
                document_number,
                document_issued_by,
                document_issue_date,
                contract_status,
                contract_date,
                connection_date
            } = req.body;

            // Проверяем дату подключения
            const actual_connection_date = connection_date || null;

            // Затем создаем запись в contract
            pool.query(
                `INSERT INTO contract (
                    contract_number, full_name, phone, connection_address, 
                    registration_address, birth_date, document_type, 
                    document_series, document_number, issued_by, 
                    issue_date, contract_status, contract_date, 
                    actual_connection_date, balance_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    contract_number,
                    full_name,
                    phone,
                    connection_address,
                    registration_address,
                    birth_date,
                    document_type,
                    document_series,
                    document_number,
                    document_issued_by,
                    document_issue_date,
                    contract_status,
                    contract_date,
                    actual_connection_date,
                    balanceId
                ],
                (err, contractResult) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера. Попробуйте позже.");
                    }
                    // После создания договора редиректим с номером договора
                    res.redirect(`/contract?tab=parameters&number=${req.body.contract_number}`);
                }
            );
        }
    );
});

app.post("/contract/set-tariff", function (req, res) {
    const { contract_number, tariff_id } = req.body;
    
    // Получаем информацию о тарифе и текущем балансе
    pool.query(
        `SELECT t.price, c.balance_id, b.current_balance 
         FROM tariffplan t, contract c 
         LEFT JOIN balance b ON c.balance_id = b.id 
         WHERE t.id = ? AND c.contract_number = ?`,
        [tariff_id, contract_number],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }

            const { price, balance_id, current_balance } = results[0];
            const newBalance = parseFloat(current_balance) - parseFloat(price);
            const now = new Date();
            const nextDebitDate = new Date(now);
            nextDebitDate.setDate(nextDebitDate.getDate() + 31);

            // Обновляем договор и баланс
            pool.query(
                `UPDATE contract c 
                 INNER JOIN balance b ON c.balance_id = b.id 
                 SET 
                    c.tariff_id = ?,
                    c.contract_status = ?,
                    b.current_balance = ?,
                    b.last_credit = ?,
                    b.last_debit_date = ?,
                    b.next_debit_date = ?
                 WHERE c.contract_number = ?`,
                [
                    tariff_id,
                    newBalance < 0 ? 'Приостановлен' : 'Активный',
                    newBalance,
                    price,
                    now,
                    nextDebitDate,
                    contract_number
                ],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера");
                    }
                    res.redirect(`/contract?tab=balance&number=${contract_number}`);
                }
            );
        }
    );
});

app.post("/contract/add-payment", function (req, res) {
    const { contract_number, amount } = req.body;
    
    // Проверяем сумму платежа
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Некорректная сумма платежа");
    }
    
    // Получаем информацию о договоре, тарифе и балансе
    pool.query(
        `SELECT c.*, t.price, b.current_balance, b.next_debit_date 
         FROM contract c 
         LEFT JOIN tariffplan t ON c.tariff_id = t.id 
         LEFT JOIN balance b ON c.balance_id = b.id
         WHERE c.contract_number = ?`,
        [contract_number],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }

            const contract = results[0];
            if (!contract) {
                return res.status(404).send("Договор не найден");
            }

            const currentBalance = parseFloat(contract.current_balance) || 0;
            const newBalance = currentBalance + parseFloat(amount);
            const now = new Date();
            
            // Проверяем нужно ли списывать абонплату
            const shouldDebit = contract.price && newBalance >= contract.price && 
                              (!contract.next_debit_date || new Date(contract.next_debit_date) <= now);

            if (shouldDebit) {
                const lastDebitDate = now;
                const nextDebitDate = new Date(now);
                nextDebitDate.setDate(nextDebitDate.getDate() + 31);
                
                const finalBalance = newBalance - contract.price;
                
                // Обновляем договор и баланс
                pool.query(
                    `UPDATE contract c 
                     INNER JOIN balance b ON c.balance_id = b.id 
                     SET 
                        b.current_balance = ?,
                        b.last_debit = ?,
                        b.last_debit_date = ?,
                        b.next_debit_date = ?,
                        c.contract_status = CASE 
                            WHEN ? >= 0 THEN 'Активный'
                            ELSE 'Приостановлен'
                        END
                     WHERE c.contract_number = ?`,
                    [
                        finalBalance,
                        amount,
                        lastDebitDate,
                        nextDebitDate,
                        finalBalance,
                        contract_number
                    ],
                    (err) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }
                        res.redirect(`/contract?tab=balance&number=${contract_number}`);
                    }
                );
            } else {
                pool.query(
                    `UPDATE contract c
                     INNER JOIN balance b ON c.balance_id = b.id 
                     SET 
                        b.current_balance = ?,
                        b.last_debit = ?,
                        b.last_debit_date = ?,
                        c.contract_status = CASE 
                            WHEN ? >= 0 THEN 'Активный'
                            ELSE 'Приостановлен'
                        END
                     WHERE c.contract_number = ?`,
                    [newBalance, amount, new Date(), newBalance, contract_number],
                    (err) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Ошибка сервера");
                        }
                        res.redirect(`/contract?tab=balance&number=${contract_number}`);
                    }
                );
            }
        }
    );
});

app.post("/contract/debit-balance", function (req, res) {
    const { contract_number, amount } = req.body;
    const debitAmount = parseFloat(amount);

    if (isNaN(debitAmount) || debitAmount <= 0) {
        return res.status(400).send("Некорректная сумма списания");
    }

    pool.query(
        `SELECT b.current_balance 
         FROM contract c 
         INNER JOIN balance b ON c.balance_id = b.id 
         WHERE c.contract_number = ?`,
        [contract_number],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }

            const currentBalance = parseFloat(results[0]?.current_balance || 0);
            const newBalance = currentBalance - debitAmount;

            if (newBalance < 0) {
                return res.status(400).send("Недостаточно средств для списания");
            }

            pool.query(
                `UPDATE balance b 
                 INNER JOIN contract c ON c.balance_id = b.id 
                 SET b.current_balance = ?,
                     b.last_credit = ? 
                 WHERE c.contract_number = ?`,
                [newBalance, debitAmount, contract_number],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера");
                    }
                    res.redirect(`/contract?tab=balance&number=${contract_number}`);
                }
            );
        }
    );
});

app.post("/update-contract", function (req, res) {
    const originalContractNumber = req.body.original_contract_number;
    
    // Обрабатываем даты без добавления времени
    const updateData = {
        contract_number: req.body.contract_number,
        full_name: req.body.full_name,
        phone: req.body.phone,
        connection_address: req.body.connection_address,
        document_type: req.body.document_type,
        document_series: req.body.document_series,
        document_number: req.body.document_number,
        issued_by: req.body.document_issued_by,
        issue_date: req.body.document_issue_date, // только дата
        registration_address: req.body.registration_address,
        birth_date: req.body.birth_date, // только дата
        contract_status: req.body.contract_status,
        contract_date: req.body.contract_date, // только дата
        actual_connection_date: req.body.connection_date || null // только дата или null
    };

    pool.query(
        "UPDATE contract SET ? WHERE contract_number = ?",
        [updateData, originalContractNumber],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }
            res.redirect(`/contract?tab=parameters&number=${req.body.contract_number}`);
        }
    );
});

app.post("/create-connection", function (req, res) {
    const { name, min_ip, max_ip, host } = req.body;
    
    pool.query(
        "INSERT INTO connection (name, min_ip, max_ip, host) VALUES (?, ?, ?, ?)",
        [name, min_ip, max_ip, host],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }
            res.redirect("/server?tab=connections");
        }
    );
});

app.post("/contract/set-connection", function (req, res) {
    const { contract_number, connection_id, ip_suffix } = req.body;

    pool.query(
        "SELECT min_ip FROM connection WHERE id = ?",
        [connection_id],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Ошибка сервера");
            }

            const prefixIP = results[0].min_ip.split('.').slice(0, 2).join('.');
            const fullIP = `${prefixIP}.${ip_suffix}`;

            pool.query(
                "UPDATE contract SET connection_id = ?, ip = ? WHERE contract_number = ?",
                [connection_id, fullIP, contract_number],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Ошибка сервера");
                    }
                    res.redirect(`/contract?tab=connections&number=${contract_number}`);
                }
            );
        }
    );
});

// Убедимся что это последний обработчик перед app.listen
app.get("/test-connection", function (req, res) {
    const host = req.query.host;
    
    ping.promise.probe(host)
        .then(function (result) {
            res.json({ 
                alive: result.alive,
                time: result.time || 0
            });
        })
        .catch(function (error) {
            res.status(500).json({ error: "Ошибка проверки" });
        });
});

app.get('/delete-contract', (req, res) => {
    const contractNumber = req.query.number;
    
    // Получаем balance_id перед удалением
    pool.query('SELECT balance_id FROM contract WHERE contract_number = ?', [contractNumber], (err, results) => {
        if (err) {
            console.error('Error checking contract:', err);
            return res.status(500).send('Ошибка при проверке договора');
        }

        if (results.length === 0) {
            return res.status(404).send('Договор не найден');
        }

        const balanceId = results[0].balance_id;

        // Сначала удаляем договор
        pool.query('DELETE FROM contract WHERE contract_number = ?', [contractNumber], (err) => {
            if (err) {
                console.error('Error deleting contract:', err);
                return res.status(500).send('Ошибка при удалении договора');
            }

            // Затем удаляем баланс
            pool.query('DELETE FROM balance WHERE id = ?', [balanceId], (err) => {
                if (err) {
                    console.error('Error deleting balance:', err);
                    return res.status(500).send('Ошибка при удалении баланса');
                }
                res.redirect('/main');
            });
        });
    });
});

// Слушаем порт в самом конце файла
app.listen(3000, function () {
    console.log("Сервер ожидает подключения на http://localhost:3000...");
});