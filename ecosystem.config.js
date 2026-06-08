module.exports = {
  apps: [
    {
      name: "sahi-backend",
      script: "/home/ubuntu/SahiData/excel_validation_api/venv/bin/uvicorn",
      args: "main:app --host 0.0.0.0 --port 8001",
      cwd: "/home/ubuntu/SahiData/excel_validation_api",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: { NODE_ENV: "production" },
    },
  ],
};
