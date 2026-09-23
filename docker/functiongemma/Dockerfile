FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
COPY backend/inference/requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/inference/ .
ENV HF_HOME=/models PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
