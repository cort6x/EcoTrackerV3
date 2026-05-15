"""
EcoTracker ML API
FastAPI приложение для классификации экологического влияния
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import joblib
import numpy as np

# Загружаем модель и скейлер
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(BASE_DIR, '../models/best_model.pkl'))
scaler = joblib.load(os.path.join(BASE_DIR, '../models/scaler.pkl'))
feature_names = joblib.load(os.path.join(BASE_DIR, '../models/feature_names.pkl'))

# Создаем приложение
app = FastAPI(
    title="EcoTracker ML API",
    description="API для предсказания категории экологического влияния на основе ML модели",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Классы для валидации данных
class EcoTrackerInput(BaseModel):
    """Входные данные для предсказания"""
    carbon_footprint_kg: float
    water_usage_liters: float
    waste_generated_kg: float
    transportation_km: float
    renewable_energy_percent: float
    eco_activities_count: int
    daily_temperature_celsius: float
    recycling_rate_percent: float
    consumption_level: int  # 1=Low, 2=Medium, 3=High
    eco_score: float

    class Config:
        json_schema_extra = {
            "example": {
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
        }

class EcoTrackerOutput(BaseModel):
    """Выходные данные предсказания"""
    category: str
    confidence: float
    probabilities: dict
    input_data: dict

class BatchPredictionInput(BaseModel):
    """Входные данные для пакетного предсказания"""
    records: List[EcoTrackerInput]

class HealthResponse(BaseModel):
    """Ответ проверки здоровья"""
    status: str
    model_name: str
    model_version: str
    feature_count: int

# Маппинг категорий
CATEGORY_MAPPING = {
    0: "Poor",
    1: "Average",
    2: "Good",
    3: "Excellent"
}

# API endpoints

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Проверка здоровья API

    Returns:
        HealthResponse: Информация о статусе и модели
    """
    return HealthResponse(
        status="healthy",
        model_name="Random Forest Classifier",
        model_version="1.0.0",
        feature_count=len(feature_names)
    )

@app.post("/predict", response_model=EcoTrackerOutput, tags=["Predictions"])
async def predict(input_data: EcoTrackerInput):
    """
    Предсказание категории экологического влияния

    Args:
        input_data: Входные данные для классификации

    Returns:
        EcoTrackerOutput: Предсказанная категория и вероятности
    """
    try:
        # Подготовка данных
        features = np.array([[
            input_data.carbon_footprint_kg,
            input_data.water_usage_liters,
            input_data.waste_generated_kg,
            input_data.transportation_km,
            input_data.renewable_energy_percent,
            input_data.eco_activities_count,
            input_data.daily_temperature_celsius,
            input_data.recycling_rate_percent,
            input_data.consumption_level,
            input_data.eco_score
        ]])

        # Масштабирование
        features_scaled = scaler.transform(features)

        # Предсказание
        prediction = model.predict(features_scaled)[0]
        probabilities = model.predict_proba(features_scaled)[0]

        # Подготовка результата
        category = CATEGORY_MAPPING[prediction]
        confidence = float(probabilities[prediction])

        probs_dict = {
            CATEGORY_MAPPING[i]: float(probabilities[i])
            for i in range(len(probabilities))
        }

        return EcoTrackerOutput(
            category=category,
            confidence=confidence,
            probabilities=probs_dict,
            input_data=input_data.dict()
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка предсказания: {str(e)}")

@app.post("/predict-batch", tags=["Predictions"])
async def predict_batch(batch_input: BatchPredictionInput):
    """
    Пакетное предсказание для нескольких записей

    Args:
        batch_input: Массив входных данных

    Returns:
        List[EcoTrackerOutput]: Массив предсказаний
    """
    try:
        results = []
        for record in batch_input.records:
            result = await predict(record)
            results.append(result)
        return results

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка пакетного предсказания: {str(e)}")

@app.get("/model-info", tags=["System"])
async def model_info():
    """
    Информация о модели

    Returns:
        dict: Детали модели и признаков
    """
    return {
        "model_type": "Random Forest Classifier",
        "n_features": len(feature_names),
        "features": list(feature_names),
        "target_classes": list(CATEGORY_MAPPING.values()),
        "class_mapping": {v: k for k, v in CATEGORY_MAPPING.items()}
    }

@app.get("/", tags=["System"])
async def root():
    """Корневой endpoint"""
    return {
        "message": "EcoTracker ML API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "redoc_url": "/redoc"
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
