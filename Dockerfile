FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8765

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY project_auth.py .
COPY static ./static
COPY scripts/manage_users.py ./scripts/manage_users.py

RUN mkdir -p /app/data /app/work/uploads

EXPOSE 8765

CMD ["python", "app.py"]
