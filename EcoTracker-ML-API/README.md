# EcoTracker ML API

Быстрое развертывание ML модели для классификации экологического влияния через FastAPI и Swagger.

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Запуск API

```bash
cd app
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Доступ к API

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **API Root**: http://localhost:8000/

## 📋 Структура проекта

```
EcoTracker-ML-API/
├── app/
│   └── main.py              # FastAPI приложение
├── models/
│   ├── best_model.pkl       # Обученная модель
│   ├── scaler.pkl           # Scaler для нормализации
│   └── feature_names.pkl    # Имена признаков
├── data/
│   └── eco_tracker_data.csv # Исходные данные
├── notebooks/
│   └── analysis_and_modeling.ipynb  # Jupyter Notebook анализа
├── requirements.txt         # Зависимости
├── Dockerfile               # Docker-образ для локальной разработки
├── Dockerfile.prod          # Оптимизированный Docker-образ для Yandex Cloud
├── docker-compose.yml       # Docker Compose конфигурация
└── README.md               # Этот файл
```

## 🎯 Основные эндпоинты

### Health Check
```bash
GET /health
```

### Единичное предсказание
```bash
POST /predict
```

Пример тела запроса:
```json
{
  "carbon_footprint_kg": 20.5,
  "water_usage_liters": 250.0,
  "waste_generated_kg": 10.0,
  "transportation_km": 30.0,
  "renewable_energy_percent": 50.0,
  "eco_activities_count": 5,
  "daily_temperature_celsius": 20.0,
  "recycling_rate_percent": 60.0,
  "consumption_level": 2,
  "eco_score": 75.0
}
```

### Пакетное предсказание
```bash
POST /predict-batch
```

### Информация о модели
```bash
GET /model-info
```

## 📊 Характеристики модели

- **Тип**: Random Forest Classifier
- **Точность (Test Accuracy)**: 86.00%
- **F1-Score**: 0.8367
- **Признаков**: 10
- **Классов**: 4 (Poor, Average, Good, Excellent)

## 🐳 Docker (локальная разработка)

```bash
docker build -t ecotracker-ml-api .
docker run -p 8000:8000 ecotracker-ml-api
```

Или через Docker Compose:
```bash
docker-compose up
```

## ☁️ Развертывание в Yandex Cloud (Serverless Containers)

### Требования
- Зарегистрированный аккаунт в [Yandex Cloud](https://cloud.yandex.ru)
- Установленный [Yandex Cloud CLI](https://cloud.yandex.ru/docs/cli/quickstart)
- Установленный Docker

### Шаг 1. Инициализация CLI
```bash
yc init
yc config list
```

### Шаг 2. Создание каталога для проекта
```bash
yc resource-manager folder create --name ml-project --description "ML API deployment"
```

### Шаг 3. Создание Container Registry
```bash
yc container registry create --name ml-registry --folder-id <FOLDER_ID>
REGISTRY_ID=$(yc container registry get --name ml-registry --format json | jq -r .id)
echo $REGISTRY_ID
```

### Шаг 4. Настройка аутентификации Docker
```bash
yc container registry configure-docker
```

### Шаг 5. Сборка и загрузка образа
```bash
# Сборка для linux/amd64 (требование Yandex Cloud)
docker build -f Dockerfile.prod --platform linux/amd64 -t cr.yandex/${REGISTRY_ID}/ml-api:v1 .

# Загрузка образа в реестр
docker push cr.yandex/${REGISTRY_ID}/ml-api:v1

# Проверка
yc container image list
```

### Шаг 6. Создание сервисного аккаунта
```bash
yc iam service-account create --name ml-sa
SA_ID=$(yc iam service-account get --name ml-sa --format json | jq -r .id)

# Роль для скачивания образов
yc container registry add-access-binding   --id $REGISTRY_ID   --role container-registry.images.puller   --subject serviceAccount:$SA_ID

# Роль для запуска serverless
yc resource-manager folder add-access-binding   --name ml-project   --role serverless.containers.invoker   --subject serviceAccount:$SA_ID
```

### Шаг 7. Развертывание контейнера
```bash
yc serverless container create --name ml-api

yc serverless container revision deploy \
  --container-name ml-api \
  --image cr.yandex/${REGISTRY_ID}/ml-api:v1 \
  --service-account-id $SA_ID \
  --cores 1 \
  --memory 1GB \
  --concurrency 1 \
  --execution-timeout 30s \
  --environment DEBUG=False
```

### Шаг 8. Настройка публичного доступа
```bash
yc serverless container allow-unauthenticated-invoke --name ml-api

# Получение публичного URL
CONTAINER_URL=$(yc serverless container get --name ml-api --format json | jq -r .url)
echo "Ваш API доступен по адресу: $CONTAINER_URL"
```

### Шаг 9. Проверка доступа
```bash
curl https://$CONTAINER_URL/health
# Открыть документацию в браузере:
# https://<ваш-контейнер>.containers.yandexcloud.net/docs
```

### Остановка и удаление ресурсов
```bash
# Временная остановка
yc serverless container stop --name ml-api

# Полное удаление
yc serverless container delete --name ml-api
yc container registry delete --name ml-registry
yc iam service-account delete --name ml-sa
```

## 📝 Разработчик

EcoTracker ML Team  
Версия: 1.0.0
