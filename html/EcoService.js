const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSessions = new Map(); 

class EcoService {
    constructor(repository) {
        this.repository = repository;
    }

    generateToken(userId, isAdmin, isBlocked) {
        const token = crypto.randomBytes(32).toString('hex');
        userSessions.set(token, { userId, isAdmin, isBlocked, timestamp: Date.now() });
        return token;
    }

    validateToken(token) {
        return userSessions.get(token);
    }

    removeToken(token) {
        userSessions.delete(token);
    }

    async registerUser(username, email, password) {
        if (!username || !email || !password) {
            throw { status: 400, message: "Все поля должны быть заполнены." };
        }
        
        const existingUser = await this.repository.findUserByUsername(username);
        if (existingUser) {
            throw { status: 409, message: "Пользователь с таким именем уже существует." };
        }
        
        const passwordHash = bcrypt.hashSync(password, 10);
        await this.repository.createUser(username, passwordHash, email);
        return { message: "Регистрация успешна! Теперь Вы можете войти." };
    }

    async loginUser(username, password) {
        if (!username || !password) {
            throw { status: 400, message: "Имя пользователя и пароль обязательны." };
        }

        const user = await this.repository.findUserByUsername(username);
        
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            throw { status: 401, message: "Неверное имя пользователя или пароль." };
        }

        if (user.is_blocked === 1) {
            throw { status: 403, message: "Ваш аккаунт заблокирован администратором." };
        }

        const token = this.generateToken(user.id, user.is_admin, user.is_blocked);
        return { token, message: "Вход успешен!" };
    }

    async getCurrentUser(userId) {
        const user = await this.repository.findUserById(userId);
        if (!user) {
            throw { status: 404, message: "Пользователь не найден." };
        }
        return {
            userId: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.is_admin,
            isBlocked: user.is_blocked
        };
    }
    async createRecord(userId, actionId, quantity, recordDate) {
        if (!actionId || quantity <= 0 || !recordDate) {
            throw { status: 400, message: "Некорректные данные для записи." };
        }
        await this.repository.createRecord(userId, actionId, quantity, recordDate);

        // Начисляем очки
        const records = await this.repository.getRecordsByUserId(userId);
        const lastRecord = records[0];
        if (lastRecord) {
            const contribution = (lastRecord.quantity * lastRecord.coefficient_value) || 0;
            await this.repository.addPointsForRecord(userId, contribution);
        }

        // Получаем CO2
        const statsData = await this.repository.getUserStats(userId);
        const totalCo2 = statsData && statsData.totalCo2 && statsData.totalCo2.total
            ? statsData.totalCo2.total : 0;

        const newAchievements = await this.checkAndGrantAchievements(userId, records, totalCo2);
        return { message: "Запись успешно добавлена!", newAchievements };
    }

    async checkAndGrantAchievements(userId, records, totalCo2) {
        const earned = await this.repository.getUserAchievementCodes(userId);
        const granted = [];

        const check = async (code) => {
            if (!earned.includes(code)) {
                const ach = await this.repository.grantAchievement(userId, code);
                if (ach) granted.push(ach);
            }
        };

        const count = records.length;
        if (count >= 1)   await check('first_record');
        if (count >= 10)  await check('records_10');
        if (count >= 50)  await check('records_50');
        if (count >= 100) await check('records_100');

        if (totalCo2 >= 10)   await check('co2_10');
        if (totalCo2 >= 100)  await check('co2_100');
        if (totalCo2 >= 1000) await check('co2_1000');

        const cats = new Set(records.map(r => r.category));
        if (cats.size >= 3) await check('categories_3');

        // Серия 7 дней
        const dates = [...new Set(records.map(r => (r.record_date||'').slice(0,10)))].sort().reverse();
        let streak = 1;
        for (let i = 1; i < dates.length; i++) {
            const diff = Math.round((new Date(dates[i-1]) - new Date(dates[i])) / 86400000);
            if (diff === 1) { streak++; if (streak >= 7) break; }
            else break;
        }
        if (streak >= 7) await check('streak_7');

        // Рейтинг
        const rankRow = await this.repository.getUserRank(userId);
        if (rankRow) {
            if (rankRow.rank <= 10) await check('top_10');
            if (rankRow.rank <= 3)  await check('top_3');
            if (rankRow.rank === 1) await check('rank_1');
        }

        return granted;
    }

    async getUserRecords(userId) {
        return this.repository.getRecordsByUserId(userId);
    }

    async generateReport(userId, startDate, endDate) {
        const rawData = await this.repository.getReportData(userId, startDate, endDate);
        
        const totalContribution = rawData.reduce((sum, item) => sum + item.contribution, 0);
        const emissionUnit = rawData.length > 0 ? 'kg CO2e' : 'kg CO2e';

        return {
            total_contribution: totalContribution,
            unit: emissionUnit,
            details_by_category: rawData
        };
    }

    async getAllActions() {
        return this.repository.getAllActions();
    }


    async addAction(actionData) {
        const { name, description, category, unit_of_measure, coefficient_value, emission_unit } = actionData;
        
        if (!name || !coefficient_value) {
            throw { status: 400, message: "Необходимо указать название и коэффициент." };
        }

        const coeffResult = await this.repository.createCoefficient(coefficient_value, emission_unit || 'kg CO2e');
        
        await this.repository.createAction(name, description, category, unit_of_measure, coeffResult.id);

        return { message: "Действие успешно добавлено." };
    }

    async updateCoefficient(actionId, coefficientId, coefficientValue) {
        if (!coefficientId || !coefficientValue || isNaN(coefficientValue)) {
            throw { status: 400, message: "Некорректные данные коэффициента." };
        }
        const result = await this.repository.updateCoefficientValue(coefficientId, coefficientValue);
        if (result.changes === 0) {
            throw { status: 404, message: "Коэффициент не найден или значение не изменилось." };
        }
        return { message: "Коэффициент успешно обновлен." };
    }

    async searchUsers(query) {
        return this.repository.searchUsers(query);
    }

    async toggleBlockUser(adminId, userIdToChange, isBlocked) {
        if (adminId === userIdToChange) {
            throw { status: 403, message: "Администратор не может заблокировать себя через API." };
        }
        const result = await this.repository.updateUserStatus(userIdToChange, isBlocked);
        if (result.changes === 0) {
            throw { status: 404, message: "Пользователь не найден или статус не изменился." };
        }
        
        const statusMessage = isBlocked === 1 ? 'заблокирован' : 'разблокирован';
        
        userSessions.forEach((session, token) => {
            if (session.userId === userIdToChange) {
                userSessions.delete(token);
            }
        });
        
        return { message: `Пользователь ID ${userIdToChange} успешно ${statusMessage}.` };
    }

    async toggleUserRole(adminId, userIdToChange, isAdmin) {
        if (adminId === userIdToChange) {
            throw { status: 403, message: "Администратор не может изменить собственную роль через API." };
        }
        
        const result = await this.repository.updateUserRole(userIdToChange, isAdmin);
        if (result.changes === 0) {
            throw { status: 404, message: 'Пользователь не найден или роль не изменилась.' };
        }

        const roleMessage = isAdmin === 1 ? 'назначена администратором' : 'назначена обычным пользователем';
        
        userSessions.forEach((session, token) => {
            if (session.userId === userIdToChange) {
                userSessions.delete(token);
            }
        });

        return { message: `Пользователю ID ${userIdToChange} успешно ${roleMessage}.` };
    }


    async changePassword(userId, currentPassword, newPassword) {
        if (!currentPassword || !newPassword) {
            throw { status: 400, message: 'Все поля обязательны.' };
        }
        if (newPassword.length < 6) {
            throw { status: 400, message: 'Новый пароль должен содержать минимум 6 символов.' };
        }
        const user = await this.repository.findUserByUsername(
            (await this.repository.findUserById(userId)).username
        );
        if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
            throw { status: 401, message: 'Текущий пароль неверен.' };
        }
        const newHash = bcrypt.hashSync(newPassword, 10);
        await this.repository.updatePassword(userId, newHash);
        return { message: 'Пароль успешно изменён.' };
    }

    async getUserStats(userId) {
        return this.repository.getUserStats(userId);
    }

    async getSystemStats() {
        return this.repository.getSystemStats();
    }

    async getRecentActivity(limit = 30) {
        return this.repository.getRecentActivity(limit);
    }

    async getAllUsers() {
        return this.repository.getAllUsers();
    }

    async deleteUser(adminId, targetUserId) {
        if (adminId === targetUserId) throw { status: 400, message: 'Нельзя удалить собственный аккаунт.' };
        return this.repository.deleteUser(targetUserId);
    }

    async deleteAction(actionId) {
        return this.repository.deleteAction(actionId);
    }

    async exportAllRecords() {
        return this.repository.exportAllRecords();
    }
    async getLeaderboard(limit = 50) {
        return this.repository.getLeaderboard(limit);
    }

    async getUserRatingInfo(userId) {
        const [rankRow, pointsRow, achievements, allAchievements] = await Promise.all([
            this.repository.getUserRank(userId),
            this.repository.getUserPoints(userId),
            this.repository.getUserAchievements(userId),
            this.repository.getAllAchievements()
        ]);
        return {
            rank: rankRow ? rankRow.rank : null,
            points: pointsRow ? pointsRow.total_points : 0,
            achievements,
            allAchievements
        };
    }
}
module.exports = { EcoService, userSessions };