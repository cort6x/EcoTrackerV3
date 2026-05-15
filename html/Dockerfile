FROM node:25-slim

# Инструменты для компиляции нативных модулей (sqlite3)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Сначала копируем только package.json
COPY package*.json ./

# npm install ВНУТРИ контейнера (Linux-бинарники)
RUN npm install --build-from-source

# Потом копируем весь остальной код
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]