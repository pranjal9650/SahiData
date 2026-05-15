#!/bin/bash
sudo tee /etc/systemd/system/sahi-backend.service > /dev/null << 'EOF'
[Unit]
Description=Sahi Data Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/SahiData/excel_validation_api
ExecStart=/home/ubuntu/SahiData/excel_validation_api/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sahi-backend
sudo systemctl start sahi-backend
sudo systemctl status sahi-backend
