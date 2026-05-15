#!/bin/bash
# Install nginx and certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Configure nginx as reverse proxy
sudo tee /etc/nginx/sites-available/sahi-backend > /dev/null << 'EOF'
server {
    listen 80;
    server_name sahidata.duckdns.org;

    location / {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/sahi-backend /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d sahidata.duckdns.org --non-interactive --agree-tos -m pranjal.gupta@shaurryatele.com

sudo systemctl restart nginx
echo "HTTPS setup complete! Backend available at https://sahidata.duckdns.org"
