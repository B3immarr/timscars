# 🚗 Tim's Car Deals

A premium car catalog web app with a beautiful Apple/Framer-style storefront and a clean admin dashboard. Buyers browse and contact via WhatsApp; Tim manages inventory from a password-protected admin panel.

---

## Features

### Storefront (`/`)
- Stunning Apple/Framer-inspired design with smooth animations
- Car grid with real-time search and filters (make, condition, featured)
- Sort by price or year
- Full-screen car detail modal with image gallery (keyboard navigable)
- WhatsApp contact button pre-filled with car details
- Sold cars shown with badge, contact disabled
- Stats bar showing total / available / featured
- Fully responsive (mobile first)

### Admin Dashboard (`/admin`)
- Password-protected login
- Dashboard stats (total, available, sold, featured)
- Full car CRUD — add, edit, delete
- Upload up to 20 photos per car (auto-converted to WebP, resized)
- Drag-and-drop image upload
- Set primary/cover image
- Features/options tag system with quick-add shortcuts
- Toggle featured + sold status
- Settings: WhatsApp number, dealer name, location, tagline
- Live site link from admin sidebar

### Technical
- Node.js + Express backend
- SQLite database (zero setup, file-based)
- Sharp for server-side image processing (auto WebP conversion)
- Session-based authentication
- Docker + Caddy ready with automatic HTTPS

---

## Quick Start (Local Development)

```bash
# 1. Clone and install
git clone <your-repo>
cd tims-car-deals
npm install

# 2. Set environment
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD and SESSION_SECRET

# 3. Start
node server.js

# Open storefront:  http://localhost:3000
# Open admin:       http://localhost:3000/admin
```

---

## Production Deployment (VPS + Docker + Caddy)

### Step 1: Server Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### Step 2: Deploy the App

```bash
# Upload project to VPS (or git clone)
scp -r ./tims-car-deals user@your-vps-ip:/opt/tims-car-deals

# On the VPS
cd /opt/tims-car-deals

# Create data directories
mkdir -p data/uploads/cars data/uploads/temp data/db

# Create .env from example
cp .env.example .env
nano .env  # Set ADMIN_PASSWORD and SESSION_SECRET!

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f
```

### Step 3: Configure Caddy

```bash
# Edit Caddyfile — replace cars.yourdomain.com with your domain
nano /etc/caddy/Caddyfile

# Add the contents of the Caddyfile in this repo
# Make sure your domain's DNS A record points to your VPS IP

# Reload Caddy
sudo systemctl reload caddy
```

Caddy automatically handles HTTPS certificates via Let's Encrypt. No further SSL setup needed.

### Step 4: Verify

- Storefront: `https://cars.yourdomain.com`
- Admin: `https://cars.yourdomain.com/admin`

---

## Security Notes

- Change `ADMIN_PASSWORD` to something strong (20+ chars recommended)
- Generate `SESSION_SECRET` with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- The admin panel has no IP restriction by default. To restrict by IP, see the commented section in `Caddyfile`
- Images are served from `/uploads/` — only processed WebP files land there
- The database and uploads are persisted in `./data/` outside the container

---

## File Structure

```
tims-car-deals/
├── server.js              # Express backend + all API routes
├── package.json
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── public/
│   ├── index.html         # Storefront
│   └── admin/
│       └── index.html     # Admin dashboard
└── data/                  # Created at runtime (gitignored)
    ├── db/
    │   └── cars.db        # SQLite database
    └── uploads/
        └── cars/          # Processed car images (WebP)
```

---

## API Reference (for custom integrations)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cars` | No | List cars (supports ?search, ?make, ?condition, ?sort, ?featured) |
| GET | `/api/cars/:id` | No | Get single car with images |
| GET | `/api/makes` | No | Get list of unique makes |
| GET | `/api/settings` | No | Get public settings |
| POST | `/api/admin/login` | No | Login with password |
| POST | `/api/admin/logout` | Yes | Logout |
| GET | `/api/admin/cars` | Yes | List all cars (including sold) |
| POST | `/api/admin/cars` | Yes | Create car (multipart/form-data) |
| PUT | `/api/admin/cars/:id` | Yes | Update car |
| DELETE | `/api/admin/cars/:id` | Yes | Delete car + images |
| PATCH | `/api/admin/cars/:id` | Yes | Toggle featured/sold |
| GET/PUT | `/api/admin/settings` | Yes | Get/save settings |
| GET | `/api/admin/stats` | Yes | Get dashboard counts |

---

## Customisation Tips

- **Currency**: Change `currency: 'USD'` in both HTML files to your local currency (e.g. `'ZAR'`, `'EUR'`)
- **Logo**: Replace the 🚗 emoji in the nav with an `<img>` tag pointing to your logo
- **Colours**: Edit the CSS variables in `:root` in `public/index.html`
- **WhatsApp**: Set the number in Admin → Settings (include country code, no spaces or +)
- **Admin password**: Set `ADMIN_PASSWORD` in `.env` or `docker-compose.yml`

---

Built with ❤️ for Tim.
