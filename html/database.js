const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const DataRepository = require('./DataRepository'); 
const db = new sqlite3.Database('./eco_contribution.db');
const repository = new DataRepository(db);

const salt = bcrypt.genSaltSync(10);
const adminPasswordHash = bcrypt.hashSync('adminpass', salt);

function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT UNIQUE,
            registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_admin BOOLEAN DEFAULT 0,
            is_blocked BOOLEAN DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Coefficients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            value REAL NOT NULL,
            unit_description TEXT,
            emission_unit TEXT DEFAULT 'kg CO2e', 
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL, 
            unit_of_measure TEXT NOT NULL, 
            coefficient_id INTEGER,
            FOREIGN KEY (coefficient_id) REFERENCES Coefficients(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action_id INTEGER,
            quantity REAL NOT NULL,
            record_date DATE DEFAULT (strftime('%Y-%m-%d', 'now')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(id),
            FOREIGN KEY (action_id) REFERENCES Actions(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS UserPoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            total_points INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT '🏆',
            points_reward INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS UserAchievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id INTEGER NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_id),
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (achievement_id) REFERENCES Achievements(id)
        )`);
        
        db.get("SELECT COUNT(*) AS count FROM Achievements", (err, row) => {
            if (!err && row.count === 0) {
                const s = db.prepare(`INSERT INTO Achievements (code,name,description,icon,points_reward) VALUES (?,?,?,?,?)`);
                s.run('first_record',  'Первый шаг',         'Добавить первую запись',            '🌱', 50);
                s.run('records_10',    'Эко-активист',        'Добавить 10 записей',               '🌿', 100);
                s.run('records_50',    'Защитник природы',    'Добавить 50 записей',               '🌳', 300);
                s.run('records_100',   'Эко-герой',           'Добавить 100 записей',              '🦸', 500);
                s.run('co2_10',        'Эко-начало',          'Предотвратить 10 кг CO₂',           '💨', 75);
                s.run('co2_100',       'Чистый воздух',       'Предотвратить 100 кг CO₂',          '🌬️', 200);
                s.run('co2_1000',      'Климатический герой', 'Предотвратить 1000 кг CO₂',         '🌍', 1000);
                s.run('streak_7',      'Неделя заботы',       'Записи 7 дней подряд',              '🔥', 150);
                s.run('categories_3',  'Разносторонний',      'Действия в 3 разных категориях',    '🎯', 100);
                s.run('top_10',        'Топ-10',              'Войти в топ-10 рейтинга',           '🥉', 200);
                s.run('top_3',         'Призёр',              'Войти в топ-3 рейтинга',            '🥈', 500);
                s.run('rank_1',        'Чемпион',             'Занять 1-е место в рейтинге',       '🥇', 1000);
                s.finalize();
            }
        });

        db.get("SELECT COUNT(*) AS count FROM Coefficients", (err, row) => {
            if (row.count === 0) {
                const coeffStmt = db.prepare("INSERT INTO Coefficients (value, unit_description, emission_unit) VALUES (?, ?, ?)");
                // Транспорт
                coeffStmt.run(0.21,  'кг CO₂ на км (авто → велосипед)',          'kg CO2e');
                coeffStmt.run(0.089, 'кг CO₂ на км (общественный транспорт)',     'kg CO2e');
                coeffStmt.run(0.041, 'кг CO₂ на км (электротранспорт)',           'kg CO2e');
                // Отходы
                coeffStmt.run(0.12,  'кг CO₂ на кг (сортировка отходов)',         'kg CO2e');
                coeffStmt.run(0.35,  'кг CO₂ на кг (компостирование)',            'kg CO2e');
                coeffStmt.run(1.80,  'кг CO₂ на кг (переработка электроники)',    'kg CO2e');
                // Энергия
                coeffStmt.run(0.50,  'кг CO₂ на кВт*ч (электросеть)',            'kg CO2e');
                coeffStmt.run(0.00,  'кг CO₂ на кВт*ч (солнце / ветер)',         'kg CO2e');
                // Питание
                coeffStmt.run(2.50,  'кг CO₂ на кг (мясо)',                       'kg CO2e');
                coeffStmt.run(0.30,  'кг CO₂ на кг (местные овощи и фрукты)',     'kg CO2e');
                // Вода
                coeffStmt.run(0.003, 'кг CO₂ на литр (водопровод)',               'kg CO2e');
                // Покупки
                coeffStmt.run(5.00,  'кг CO₂ на ед. (одежда)',                    'kg CO2e');
                coeffStmt.finalize(() => {
                    db.all("SELECT id FROM Coefficients ORDER BY id ASC LIMIT 12", (err, rows) => {
                        if (!rows || rows.length < 12) return;

                        const [
                            cTransport, cBus, cElectro,
                            cWaste, cCompost, cElecWaste,
                            cEnergy, cSolar,
                            cMeat, cVeggies,
                            cWater,
                            cClothes
                        ] = rows.map(r => r.id);

                        const actionStmt = db.prepare(
                            "INSERT INTO Actions (name, description, category, unit_of_measure, coefficient_id) VALUES (?, ?, ?, ?, ?)"
                        );

                        // Транспорт
                        actionStmt.run("Поездка на велосипеде",            "Использование велосипеда вместо личного автомобиля.",             "Транспорт", "км",    cTransport);
                        actionStmt.run("Поездка на общественном транспорте","Автобус, троллейбус или трамвай вместо личного авто.",            "Транспорт", "км",    cBus);
                        actionStmt.run("Поездка на электросамокате",        "Использование электросамоката или электровелосипеда.",            "Транспорт", "км",    cElectro);
                        actionStmt.run("Пешая прогулка вместо авто",        "Ходьба пешком при расстоянии до 3 км.",                          "Транспорт", "км",    cTransport);

                        // Отходы
                        actionStmt.run("Сортировка мусора",                 "Раздельный сбор и сдача отходов на переработку.",                "Отходы",    "кг",    cWaste);
                        actionStmt.run("Компостирование пищевых отходов",   "Компостирование органических отходов дома или на даче.",          "Отходы",    "кг",    cCompost);
                        actionStmt.run("Сдача электроники на переработку",  "Сдача старых гаджетов и техники в пункты приёма.",               "Отходы",    "кг",    cElecWaste);
                        actionStmt.run("Отказ от пластиковых пакетов",      "Использование многоразовой сумки вместо одноразового пакета.",    "Отходы",    "шт",    cWaste);

                        // Энергия
                        actionStmt.run("Экономия электроэнергии",           "Снижение потребления электроэнергии дома или на работе.",         "Энергия",   "кВт*ч", cEnergy);
                        actionStmt.run("Использование солнечной энергии",   "Генерация электроэнергии из солнечных панелей.",                  "Энергия",   "кВт*ч", cSolar);
                        actionStmt.run("Замена лампочек на LED",             "Замена обычной лампочки на светодиодную.",                       "Энергия",   "шт",    cEnergy);
                        actionStmt.run("Выключение приборов из сети",        "Отключение электроприборов в режиме ожидания (standby).",        "Энергия",   "кВт*ч", cEnergy);

                        // Питание
                        actionStmt.run("Отказ от мяса",                     "Вегетарианский или веганский приём пищи.",                       "Питание",   "кг",    cMeat);
                        actionStmt.run("Покупка местных продуктов",          "Покупка продуктов местного производства (радиус до 100 км).",    "Питание",   "кг",    cVeggies);
                        actionStmt.run("Сокращение пищевых отходов",         "Употребление в пищу того, что иначе было бы выброшено.",         "Питание",   "кг",    cVeggies);

                        // Вода
                        actionStmt.run("Экономия воды",                     "Сокращение расхода воды при купании, стирке, мытье посуды.",     "Вода",      "л",     cWater);
                        actionStmt.run("Сбор дождевой воды",                 "Использование дождевой воды для полива растений.",               "Вода",      "л",     cWater);

                        // Покупки
                        actionStmt.run("Покупка secondhand одежды",          "Приобретение одежды в секонд-хэнде вместо новой.",               "Покупки",   "шт",    cClothes);
                        actionStmt.run("Ремонт вместо замены",               "Починка вещи вместо покупки новой.",                             "Покупки",   "шт",    cClothes);

                        // Природа
                        actionStmt.run("Посадка деревьев",                   "Посадка дерева или кустарника.",                                 "Природа",   "шт",    cVeggies);
                        actionStmt.run("Участие в субботнике",               "Уборка мусора на природной территории.",                         "Природа",   "кг",    cWaste);

                        actionStmt.finalize();
                        console.log("Extended actions added: 20 actions across 7 categories.");

                        // ── Тестовые пользователи ──────────────────────────────────
                        const salt2 = bcrypt.genSaltSync(10);
                        const demoUsers = [
                            ['ecouser1',  bcrypt.hashSync('pass123', salt2), 'eco1@test.com'],
                            ['greenlife', bcrypt.hashSync('pass123', salt2), 'green@test.com'],
                            ['natasha_v', bcrypt.hashSync('pass123', salt2), 'natasha@test.com'],
                            ['dmitry_k',  bcrypt.hashSync('pass123', salt2), 'dmitry@test.com'],
                            ['oksana_m',  bcrypt.hashSync('pass123', salt2), 'oksana@test.com'],
                        ];
                        demoUsers.forEach(([u, h, e]) => {
                            db.run("INSERT OR IGNORE INTO Users (username, password_hash, email) VALUES (?,?,?)", [u, h, e]);
                        });

                        // ── Демо-записи ───────────────────────────────────────────
                        setTimeout(() => {
                            db.all("SELECT id FROM Users WHERE is_admin = 0 ORDER BY id ASC LIMIT 6", (err, userRows) => {
                                db.all("SELECT id FROM Actions ORDER BY id ASC LIMIT 20", (err, actionRows) => {
                                    if (!userRows || !actionRows || actionRows.length === 0) return;

                                    const dates = [
                                        '2025-04-01','2025-04-05','2025-04-10','2025-04-15','2025-04-20',
                                        '2025-05-01','2025-05-07','2025-05-14','2025-05-21','2025-05-28',
                                        '2025-06-03','2025-06-10','2025-06-17','2025-06-24',
                                        '2025-07-02','2025-07-09','2025-07-16','2025-07-23',
                                        '2025-08-05','2025-08-12','2025-08-19','2025-08-26',
                                        '2025-09-02','2025-09-09','2025-09-16','2025-09-23',
                                        '2025-10-01','2025-10-08','2025-10-15','2025-10-22',
                                        '2025-11-04','2025-11-11','2025-11-18','2025-11-25',
                                        '2025-12-02','2025-12-09','2025-12-16','2025-12-23',
                                        '2026-01-07','2026-01-14','2026-01-21','2026-01-28',
                                        '2026-02-04','2026-02-11','2026-02-18','2026-02-25',
                                        '2026-03-04','2026-03-11','2026-03-18','2026-03-25',
                                        '2026-04-01','2026-04-08','2026-04-15','2026-04-22',
                                        '2026-05-06','2026-05-13','2026-05-20','2026-05-27',
                                    ];
                                    const qtys = [1, 2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 50];

                                    const recStmt = db.prepare(
                                        "INSERT INTO Records (user_id, action_id, quantity, record_date) VALUES (?,?,?,?)"
                                    );
                                    userRows.forEach((user, ui) => {
                                        const count = 20 + ui * 4;
                                        for (let i = 0; i < count; i++) {
                                            const action = actionRows[(ui * 7 + i * 3) % actionRows.length];
                                            const date   = dates[(ui * 5 + i * 4) % dates.length];
                                            const qty    = qtys[(ui * 3 + i * 2) % qtys.length];
                                            recStmt.run(user.id, action.id, qty, date);
                                        }
                                    });
                                    recStmt.finalize();
                                    console.log("Demo records added.");

                                    // Начисляем очки пользователям
                                    db.all("SELECT user_id, COUNT(*) as cnt FROM Records GROUP BY user_id", (err, stats) => {
                                        if (!stats) return;
                                        stats.forEach(s => {
                                            db.run(
                                                `INSERT INTO UserPoints (user_id, total_points) VALUES (?,?)
                                                ON CONFLICT(user_id) DO UPDATE SET total_points = excluded.total_points`,
                                                [s.user_id, s.cnt * 25]
                                            );
                                        });
                                    });
                                });
                            });
                        }, 500);
                    });
                });
            }
        });

        db.get("SELECT COUNT(*) AS count FROM Users WHERE is_admin = 1", (err, row) => {
            if (row.count === 0) {
                db.run("INSERT INTO Users (username, password_hash, email, is_admin) VALUES (?, ?, ?, ?)",
                    ['admin', adminPasswordHash, 'admin@eco.com', 1],
                    (err) => {
                        if (err) { console.error("Error adding admin:", err.message); }
                        else { console.log("Admin user 'admin' added (password: adminpass)"); }
                    });

                db.run("INSERT INTO Users (username, password_hash, email, is_admin) VALUES (?, ?, ?, ?)",
                    ['testuser', bcrypt.hashSync('testpass', salt), 'test@eco.com', 0],
                    (err) => {
                        if (err) { console.error("Error adding test user:", err.message); }
                        else { console.log("Test user 'testuser' added (password: testpass)"); }
                    });
            }
        });
    });
}

module.exports = { db, initializeDatabase, repository };