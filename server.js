const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'tims-secret-key-change-in-production';

// ─── Database Setup ────────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, 'db', 'cars.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    price REAL NOT NULL,
    mileage INTEGER DEFAULT 0,
    fuel_type TEXT DEFAULT 'Petrol',
    transmission TEXT DEFAULT 'Automatic',
    color TEXT DEFAULT '',
    condition TEXT DEFAULT 'Used',
    body_type TEXT DEFAULT 'Sedan',
    engine TEXT DEFAULT '',
    description TEXT DEFAULT '',
    features TEXT DEFAULT '[]',
    featured INTEGER DEFAULT 0,
    sold INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS car_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

// Default settings
const defaultSettings = {
  whatsapp_number: '1234567890',
  whatsapp_message: 'Hi Tim! I\'m interested in a car from your catalog.',
  dealer_name: "Tim's Car Deals",
  dealer_tagline: 'Premium Pre-Owned Vehicles',
  dealer_location: 'Your City, Country',
};

for (const [key, value] of Object.entries(defaultSettings)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // set to true if using HTTPS directly (Caddy handles it)
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ─── File Upload Setup ─────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'temp');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|heic/i;
    if (allowed.test(path.extname(file.originalname)) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ─── Auth Middleware ───────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ─── Helper Functions ──────────────────────────────────────────────────────────
function processImage(tempPath, outputDir) {
  const filename = `${uuidv4()}.webp`;
  const outputPath = path.join(outputDir, filename);
  fs.mkdirSync(outputDir, { recursive: true });
  return sharp(tempPath)
    .resize(1400, 900, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(outputPath)
    .then(() => {
      fs.unlinkSync(tempPath);
      return filename;
    });
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function formatCar(car) {
  if (!car) return null;
  const images = db.prepare('SELECT * FROM car_images WHERE car_id = ? ORDER BY is_primary DESC, sort_order ASC').all(car.id);
  return {
    ...car,
    features: JSON.parse(car.features || '[]'),
    images: images.map(img => ({
      id: img.id,
      url: `/uploads/cars/${img.filename}`,
      isPrimary: !!img.is_primary
    }))
  };
}

// ─── Public API Routes ─────────────────────────────────────────────────────────

// Get all cars (with filters)
app.get('/api/cars', (req, res) => {
  const { search, make, min_price, max_price, condition, sort, featured } = req.query;
  
  let query = 'SELECT * FROM cars WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (title LIKE ? OR make LIKE ? OR model LIKE ? OR description LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (make) { query += ' AND make = ?'; params.push(make); }
  if (min_price) { query += ' AND price >= ?'; params.push(Number(min_price)); }
  if (max_price) { query += ' AND price <= ?'; params.push(Number(max_price)); }
  if (condition) { query += ' AND condition = ?'; params.push(condition); }
  if (featured === 'true') { query += ' AND featured = 1'; }

  const sortMap = {
    'price_asc': 'price ASC',
    'price_desc': 'price DESC',
    'year_desc': 'year DESC',
    'newest': 'created_at DESC',
  };
  query += ` ORDER BY sold ASC, featured DESC, ${sortMap[sort] || 'created_at DESC'}`;

  const cars = db.prepare(query).all(...params);
  res.json(cars.map(formatCar));
});

// Get single car
app.get('/api/cars/:id', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(formatCar(car));
});

// Get all unique makes (for filter)
app.get('/api/makes', (req, res) => {
  const makes = db.prepare('SELECT DISTINCT make FROM cars ORDER BY make').all().map(r => r.make);
  res.json(makes);
});

// Get public settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// ─── Admin Auth Routes ─────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ─── Admin Car Routes ──────────────────────────────────────────────────────────

// Get all cars (admin, includes sold)
app.get('/api/admin/cars', requireAuth, (req, res) => {
  const cars = db.prepare('SELECT * FROM cars ORDER BY created_at DESC').all();
  res.json(cars.map(formatCar));
});

// Create car
app.post('/api/admin/cars', requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const {
      title, make, model, year, price, mileage,
      fuel_type, transmission, color, condition,
      body_type, engine, description, features, featured
    } = req.body;

    const result = db.prepare(`
      INSERT INTO cars (title, make, model, year, price, mileage, fuel_type, transmission, color, condition, body_type, engine, description, features, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, make, model, Number(year), Number(price),
      Number(mileage || 0), fuel_type || 'Petrol',
      transmission || 'Automatic', color || '',
      condition || 'Used', body_type || 'Sedan',
      engine || '', description || '',
      features || '[]', featured === 'true' || featured === '1' ? 1 : 0
    );

    const carId = result.lastInsertRowid;
    const carDir = path.join(__dirname, 'uploads', 'cars');

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filename = await processImage(file.path, carDir);
        db.prepare(`
          INSERT INTO car_images (car_id, filename, is_primary, sort_order)
          VALUES (?, ?, ?, ?)
        `).run(carId, filename, i === 0 ? 1 : 0, i);
      }
    }

    res.json(formatCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(carId)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update car
app.put('/api/admin/cars/:id', requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const carId = req.params.id;
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carId);
    if (!car) return res.status(404).json({ error: 'Car not found' });

    const {
      title, make, model, year, price, mileage,
      fuel_type, transmission, color, condition,
      body_type, engine, description, features,
      featured, sold, delete_images
    } = req.body;

    db.prepare(`
      UPDATE cars SET title=?, make=?, model=?, year=?, price=?, mileage=?,
      fuel_type=?, transmission=?, color=?, condition=?, body_type=?, engine=?,
      description=?, features=?, featured=?, sold=?
      WHERE id=?
    `).run(
      title, make, model, Number(year), Number(price),
      Number(mileage || 0), fuel_type, transmission,
      color, condition, body_type, engine, description,
      features || '[]',
      featured === 'true' || featured === '1' ? 1 : 0,
      sold === 'true' || sold === '1' ? 1 : 0,
      carId
    );

    // Delete specific images
    if (delete_images) {
      const toDelete = JSON.parse(delete_images);
      for (const imgId of toDelete) {
        const img = db.prepare('SELECT * FROM car_images WHERE id = ? AND car_id = ?').get(imgId, carId);
        if (img) {
          const imgPath = path.join(__dirname, 'uploads', 'cars', img.filename);
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
          db.prepare('DELETE FROM car_images WHERE id = ?').run(imgId);
        }
      }
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      const carDir = path.join(__dirname, 'uploads', 'cars');
      const existingCount = db.prepare('SELECT COUNT(*) as count FROM car_images WHERE car_id = ?').get(carId).count;
      const hasPrimary = db.prepare('SELECT COUNT(*) as count FROM car_images WHERE car_id = ? AND is_primary = 1').get(carId).count;

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filename = await processImage(file.path, carDir);
        db.prepare(`
          INSERT INTO car_images (car_id, filename, is_primary, sort_order)
          VALUES (?, ?, ?, ?)
        `).run(carId, filename, (existingCount === 0 && hasPrimary === 0 && i === 0) ? 1 : 0, existingCount + i);
      }
    }

    // Ensure there's always a primary image
    const primary = db.prepare('SELECT id FROM car_images WHERE car_id = ? AND is_primary = 1').get(carId);
    if (!primary) {
      const first = db.prepare('SELECT id FROM car_images WHERE car_id = ? ORDER BY sort_order ASC LIMIT 1').get(carId);
      if (first) db.prepare('UPDATE car_images SET is_primary = 1 WHERE id = ?').run(first.id);
    }

    res.json(formatCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(carId)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete car
app.delete('/api/admin/cars/:id', requireAuth, (req, res) => {
  const carId = req.params.id;
  const images = db.prepare('SELECT * FROM car_images WHERE car_id = ?').all(carId);
  
  for (const img of images) {
    const imgPath = path.join(__dirname, 'uploads', 'cars', img.filename);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }

  db.prepare('DELETE FROM car_images WHERE car_id = ?').run(carId);
  db.prepare('DELETE FROM cars WHERE id = ?').run(carId);
  res.json({ success: true });
});

// Toggle featured/sold
app.patch('/api/admin/cars/:id', requireAuth, (req, res) => {
  const { featured, sold } = req.body;
  const carId = req.params.id;
  if (featured !== undefined) db.prepare('UPDATE cars SET featured = ? WHERE id = ?').run(featured ? 1 : 0, carId);
  if (sold !== undefined) db.prepare('UPDATE cars SET sold = ? WHERE id = ?').run(sold ? 1 : 0, carId);
  res.json(formatCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(carId)));
});

// Set primary image
app.patch('/api/admin/cars/:id/primary-image/:imgId', requireAuth, (req, res) => {
  const { id, imgId } = req.params;
  db.prepare('UPDATE car_images SET is_primary = 0 WHERE car_id = ?').run(id);
  db.prepare('UPDATE car_images SET is_primary = 1 WHERE id = ? AND car_id = ?').run(imgId, id);
  res.json({ success: true });
});

// Admin settings
app.get('/api/admin/settings', requireAuth, (req, res) => {
  res.json(getSettings());
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const allowed = ['whatsapp_number', 'whatsapp_message', 'dealer_name', 'dealer_tagline', 'dealer_location'];
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of allowed) {
    if (req.body[key] !== undefined) stmt.run(key, req.body[key]);
  }
  res.json(getSettings());
});

// Admin stats
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM cars').get().c;
  const available = db.prepare('SELECT COUNT(*) as c FROM cars WHERE sold = 0').get().c;
  const sold = db.prepare('SELECT COUNT(*) as c FROM cars WHERE sold = 1').get().c;
  const featured = db.prepare('SELECT COUNT(*) as c FROM cars WHERE featured = 1').get().c;
  res.json({ total, available, sold, featured });
});

// ─── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚗 Tim's Car Deals running on port ${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   Admin:    http://localhost:${PORT}/admin`);
});
