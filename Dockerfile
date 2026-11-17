FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/app ./app
COPY --from=frontend /build/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/data
EXPOSE 8767
CMD ["python", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8767"]
