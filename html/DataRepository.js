const { db } = require('./database');

class DataRepository {
    constructor(db) {
        this.db = db;
    }

    _run(sql, params = []) {
        return new Promise((resolve, reject) => {
        this.db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
        });
    }

    _get(sql, params = []) {
        return new Promise((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
        });
    }

    _all(sql, params = []) {
        return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
        });
    }


    async findUserByUsername(username) {
        return this._get(`SELECT * FROM Users WHERE username = ?`, [username]);
    }

    async findUserById(id) {
        return this._get(`SELECT id, username, email, is_admin, is_blocked, registration_date FROM Users WHERE id = ?`, [id]);
    }

    async createUser(username, passwordHash, email) {
        return this._run(`INSERT INTO Users (username, password_hash, email) VALUES (?, ?, ?)`, 
            [username, passwordHash, email]);
    }

    async updateUserStatus(userId, isBlocked) {
        return this._run(`UPDATE Users SET is_blocked = ? WHERE id = ?`, [isBlocked, userId]);
    }

    async updateUserRole(userId, isAdmin) {
        return this._run(`UPDATE Users SET is_admin = ? WHERE id = ?`, [isAdmin, userId]);
    }

    async searchUsers(query) {
        const sql = `SELECT id, username, email, is_admin, is_blocked FROM Users WHERE username LIKE ? OR email LIKE ?`;
        const search = `%${query}%`;
        return this._all(sql, [search, search]);
    }
    async getAllActions() {
        return this._all(`
            SELECT 
                A.id, A.name, A.description, A.category, A.unit_of_measure, 
                C.id AS coefficient_id, C.value AS coefficient_value, C.emission_unit 
            FROM Actions A
            JOIN Coefficients C ON A.coefficient_id = C.id
            ORDER BY A.name
        `);
    }

    async createAction(name, description, category, unitOfMeasure, coefficientId) {
        return this._run(`INSERT INTO Actions (name, description, category, unit_of_measure, coefficient_id) VALUES (?, ?, ?, ?, ?)`,
            [name, description, category, unitOfMeasure, coefficientId]);
    }
    
    async createCoefficient(value, emissionUnit) {
        return this._run(`INSERT INTO Coefficients (value, emission_unit) VALUES (?, ?)`, [value, emissionUnit]);
    }

    async updateCoefficientValue(coefficientId, value) {
        return this._run(`UPDATE Coefficients SET value = ? WHERE id = ?`, [value, coefficientId]);
    }
    async createRecord(userId, actionId, quantity, recordDate) {
        return this._run(`INSERT INTO Records (user_id, action_id, quantity, record_date) VALUES (?, ?, ?, ?)`,
            [userId, actionId, quantity, recordDate]);
    }

    async getRecordsByUserId(userId) {
        return this._all(`
            SELECT R.*, A.name AS action_name, A.unit_of_measure, C.value AS coefficient_value, C.emission_unit 
            FROM Records R
            JOIN Actions A ON R.action_id = A.id
            JOIN Coefficients C ON A.coefficient_id = C.id
            WHERE R.user_id = ?
            ORDER BY R.record_date DESC
        `, [userId]);
    }

    async getReportData(userId, startDate, endDate) {
        let sql = `
            SELECT 
                A.category, 
                SUM(R.quantity * C.value) AS contribution 
            FROM Records R
            JOIN Actions A ON R.action_id = A.id
            JOIN Coefficients C ON A.coefficient_id = C.id
            WHERE R.user_id = ? 
        `;
        const params = [userId];

        if (startDate) {
            sql += ` AND R.record_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND R.record_date <= ?`;
            params.push(endDate);
        }

        sql += ` GROUP BY A.category ORDER BY contribution DESC`;
        
        return this._all(sql, params);
    }


    async updatePassword(userId, newHash) {
        return this._run(`UPDATE Users SET password_hash = ? WHERE id = ?`, [newHash, userId]);
    }

    async getUserStats(userId) {
        const totalRecords = await this._get(
            `SELECT COUNT(*) AS cnt, MIN(record_date) AS first_date, MAX(record_date) AS last_date FROM Records WHERE user_id = ?`, [userId]);
        const totalCo2 = await this._get(
            `SELECT SUM(R.quantity * C.value) AS total FROM Records R JOIN Actions A ON R.action_id = A.id JOIN Coefficients C ON A.coefficient_id = C.id WHERE R.user_id = ?`, [userId]);
        const topCategory = await this._get(
            `SELECT A.category, COUNT(*) AS cnt FROM Records R JOIN Actions A ON R.action_id = A.id WHERE R.user_id = ? GROUP BY A.category ORDER BY cnt DESC LIMIT 1`, [userId]);
        const topAction = await this._get(
            `SELECT A.name, COUNT(*) AS cnt FROM Records R JOIN Actions A ON R.action_id = A.id WHERE R.user_id = ? GROUP BY A.name ORDER BY cnt DESC LIMIT 1`, [userId]);
        const last30 = await this._get(
            `SELECT COUNT(*) AS cnt FROM Records WHERE user_id = ? AND record_date >= date('now', '-30 days')`, [userId]);
        return { totalRecords, totalCo2, topCategory, topAction, last30 };
    }

    async deleteUser(userId) {
        await this._run(`DELETE FROM Records WHERE user_id = ?`, [userId]);
        return this._run(`DELETE FROM Users WHERE id = ?`, [userId]);
    }

    async getAllUsers() {
        return this._all(`SELECT id, username, email, is_admin, is_blocked, registration_date FROM Users ORDER BY registration_date DESC`);
    }

    async getSystemStats() {
        const totalUsers   = await this._get(`SELECT COUNT(*) AS cnt FROM Users`);
        const totalRecords = await this._get(`SELECT COUNT(*) AS cnt FROM Records`);
        const totalActions = await this._get(`SELECT COUNT(*) AS cnt FROM Actions`);
        const totalCo2     = await this._get(`SELECT SUM(R.quantity * C.value) AS total FROM Records R JOIN Actions A ON R.action_id = A.id JOIN Coefficients C ON A.coefficient_id = C.id`);
        const activeToday  = await this._get(`SELECT COUNT(DISTINCT user_id) AS cnt FROM Records WHERE record_date = date('now')`);
        const activeWeek   = await this._get(`SELECT COUNT(DISTINCT user_id) AS cnt FROM Records WHERE record_date >= date('now','-7 days')`);
        const newUsersWeek = await this._get(`SELECT COUNT(*) AS cnt FROM Users WHERE registration_date >= date('now','-7 days')`);
        const topAction    = await this._get(`SELECT A.name, COUNT(*) AS cnt FROM Records R JOIN Actions A ON R.action_id = A.id GROUP BY A.name ORDER BY cnt DESC LIMIT 1`);
        const topUser      = await this._get(`SELECT U.username, COUNT(*) AS cnt FROM Records R JOIN Users U ON R.user_id = U.id GROUP BY R.user_id ORDER BY cnt DESC LIMIT 1`);
        return { totalUsers, totalRecords, totalActions, totalCo2, activeToday, activeWeek, newUsersWeek, topAction, topUser };
    }

    async getRecentActivity(limit = 30) {
        return this._all(`
            SELECT R.id, R.quantity, R.record_date, R.quantity * C.value AS contribution,
                   U.username, A.name AS action_name, A.category, A.unit_of_measure, C.emission_unit
            FROM Records R
            JOIN Users U ON R.user_id = U.id
            JOIN Actions A ON R.action_id = A.id
            JOIN Coefficients C ON A.coefficient_id = C.id
            ORDER BY R.id DESC LIMIT ?`, [limit]);
    }

    async deleteAction(actionId) {
        await this._run(`DELETE FROM Records WHERE action_id = ?`, [actionId]);
        const action = await this._get(`SELECT coefficient_id FROM Actions WHERE id = ?`, [actionId]);
        await this._run(`DELETE FROM Actions WHERE id = ?`, [actionId]);
        if (action) await this._run(`DELETE FROM Coefficients WHERE id = ?`, [action.coefficient_id]);
        return { changes: 1 };
    }

    async exportAllRecords() {
        return this._all(`
            SELECT R.id, U.username, A.name AS action, A.category, R.quantity, A.unit_of_measure,
                   R.quantity * C.value AS co2_kg, R.record_date
            FROM Records R
            JOIN Users U ON R.user_id = U.id
            JOIN Actions A ON R.action_id = A.id
            JOIN Coefficients C ON A.coefficient_id = C.id
            ORDER BY R.record_date DESC`);
    }
    // ─── RATING & ACHIEVEMENTS ───────────────────────────────────

    async getUserPoints(userId) {
        return this._get(`SELECT total_points FROM UserPoints WHERE user_id = ?`, [userId]);
    }

    async upsertUserPoints(userId, points) {
        return this._run(`
            INSERT INTO UserPoints (user_id, total_points) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET total_points = total_points + excluded.total_points
        `, [userId, points]);
    }

    async getLeaderboard(limit = 50) {
        return this._all(`
            SELECT 
                U.id, U.username,
                COALESCE(UP.total_points, 0) AS total_points,
                COALESCE(SUM(R.quantity * C.value), 0) AS total_co2,
                COUNT(R.id) AS total_records,
                RANK() OVER (ORDER BY COALESCE(UP.total_points, 0) DESC) AS rank
            FROM Users U
            LEFT JOIN UserPoints UP ON UP.user_id = U.id
            LEFT JOIN Records R ON R.user_id = U.id
            LEFT JOIN Actions A ON A.id = R.action_id
            LEFT JOIN Coefficients C ON C.id = A.coefficient_id
            WHERE U.is_blocked = 0
            GROUP BY U.id
            ORDER BY total_points DESC
            LIMIT ?
        `, [limit]);
    }

    async getUserRank(userId) {
        return this._get(`
            SELECT rank, total_points FROM (
                SELECT 
                    user_id,
                    COALESCE(total_points, 0) AS total_points,
                    RANK() OVER (ORDER BY COALESCE(total_points, 0) DESC) AS rank
                FROM UserPoints
            ) WHERE user_id = ?
        `, [userId]);
    }

    async getAllAchievements() {
        return this._all(`SELECT * FROM Achievements ORDER BY points_reward ASC`);
    }

    async getUserAchievements(userId) {
        return this._all(`
            SELECT A.*, UA.earned_at
            FROM UserAchievements UA
            JOIN Achievements A ON A.id = UA.achievement_id
            WHERE UA.user_id = ?
            ORDER BY UA.earned_at DESC
        `, [userId]);
    }

    async getUserAchievementCodes(userId) {
        const rows = await this._all(`
            SELECT A.code FROM UserAchievements UA
            JOIN Achievements A ON A.id = UA.achievement_id
            WHERE UA.user_id = ?
        `, [userId]);
        return rows.map(r => r.code);
    }

    async grantAchievement(userId, achievementCode) {
        const ach = await this._get(`SELECT * FROM Achievements WHERE code = ?`, [achievementCode]);
        if (!ach) return null;
        try {
            await this._run(`INSERT INTO UserAchievements (user_id, achievement_id) VALUES (?, ?)`, [userId, ach.id]);
            await this.upsertUserPoints(userId, ach.points_reward);
            return ach;
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE')) return null;
            throw e;
        }
    }

    async addPointsForRecord(userId, co2contribution) {
        const pts = Math.max(1, Math.round(co2contribution * 2));
        await this.upsertUserPoints(userId, pts);
        return pts;
    }
}
module.exports = DataRepository;