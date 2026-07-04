const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const https = require('https');
const path = require('path');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors = require("cors");
const fs = require('fs');
const nodemailer = require("nodemailer");

const app = express();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "AdminLoginPage.html"));
});

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads', 'profile-images');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware setup
app.use(cookieParser());
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose
  .connect('mongodb+srv://amrita:amma123@amrita.gavaw.mongodb.net/combined_portal', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// Mongoose Schemas and Models
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: { 
    type: String, 
    required: true, 
    minlength: 6 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  image: { 
    type: String, 
    default: 'default.png' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  role: { //role field
    type: String,
    required: true,
    enum: ['admin', 'faculty'],
    default: 'faculty'  // 
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

const imageSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  data: Buffer,
  contentType: String,
});

const bookingSchema = new mongoose.Schema({
  venue: { type: String, required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  message: { type: String, required: true },
  userEmail: { type: String, required: true },
  bookingTime: { type: Date, default: Date.now },
});
const classBookerEaseSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  courseCode: { type: String, required: true },
  instructor: { type: String, required: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  day: { type: String, required: true },
  slots: [
    {
      slot: String,
      time: String,
      status: String,
    },
  ],
  description: { type: String },
  createdAt: { type: Date, default: Date.now } // Auto timestamps
});

//uploading timetable schema
const classformcreSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  courseCode: { type: String, required: true },
  instructor: { type: String, required: true },
  location: { type: String, required: true },
  day: { type: String, required: true },
  slots: [
    {
      slot: { type: String, required: true }, 
      time: { type: String }, 
      status: {
        type: String,
        enum: ["permanent", "temporary"],
        default: "permanent",
        required: true
      }
    }
  ],
  freeSlotCount: { type: Number, required: true }, 
  year: { type: String, required: true },          
  semester: { type: String, required: true },     
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});



function convertTo12HourFormat(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hour);
  date.setMinutes(minute);

  const options = { hour: '2-digit', minute: '2-digit', hour12: true };
  return date.toLocaleTimeString([], options); // Returns time in HH:MM AM/PM
}

const User = mongoose.model('User', userSchema);
const Image = mongoose.model('Image', imageSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const classbookering = mongoose.model("ClassBookerEase", classBookerEaseSchema);
const ClassFormCre = mongoose.model('ClassFormCre', classformcreSchema);

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
    }
  }
});

// Location model
const LocationSchema = new mongoose.Schema({
  location: { type: String, required: true, unique: true },
  floor: { type: String, required: true },
  capacity: { type: Number, required: true }
});

const Location = mongoose.model('Location', LocationSchema);

// Route to serve the HTML file
app.get('/locations', (req, res) => {
  res.sendFile(path.join(__dirname, 'locations.html'));
});

// API routes for locations
app.get("/api/locations", authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let locations;
    if (search) {
      locations = await Location.find({ floor: { $regex: search, $options: "i" } }); 
    } else {
      locations = await Location.find();
    }
    res.status(200).json({ locations }); 
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

app.post("/api/locations", authenticate, async (req, res) => {
  const { location, floor, capacity } = req.body;
  if (!location || !floor || !capacity) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const newLocation = new Location({ location, floor, capacity });
    await newLocation.save();
    res.status(201).json({ message: "Location added successfully" });
  } catch (error) {
    console.error("Error adding location:", error);
    res.status(500).json({ error: "Failed to add location" });
  }
});

app.delete("/api/locations/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLocation = await Location.findByIdAndDelete(id);
    if (!deletedLocation) {
      return res.status(404).json({ error: "Location not found" });
    }
    res.status(200).json({ message: "Location removed successfully" });
  } catch (error) {
    console.error("Error removing location:", error);
    res.status(500).json({ error: "Failed to remove location" });
  }
});
//reset 
app.delete("/api/locations", authenticate, async (req, res) => {
  try {
    const result = await Location.deleteMany({});
    const resu = await ClassFormCre.deleteMany({}); ///
    res.status(200).json({
      message: "All locations deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting locations" });
  }
});

//for edit - single id
app.get('/api/locations/:id', async (req, res) => {
    try {
        const location = await Location.findById(req.params.id);
        if (!location) {
            return res.status(404).json({ error: 'Location not found' });
        }
        res.json(location);
    } catch (error) {
        console.error('Error fetching location:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid location ID' });
        }
        res.status(500).json({ 
            error: 'Failed to fetch location',
            message: error.message 
        });
    }
});
//updation of classroom
app.put('/api/locations/:id', async (req, res) => {
    try {
        const { location, capacity, floor, name } = req.body;
        // Validation
        if (!location || !capacity || !floor) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['location', 'capacity', 'floor']
            });
        }
        if (isNaN(capacity) || parseInt(capacity) <= 0) {
            return res.status(400).json({ 
                error: 'Capacity must be a positive number' 
            });
        }
        // Check if another location with same name exists (excluding current one)
        const existingLocation = await Location.findOne({ 
            location: location.trim(),
            _id: { $ne: req.params.id }
        });

        if (existingLocation) {
            return res.status(409).json({ 
                error: 'Another location with this name already exists',
                existing: existingLocation 
            });
        }

        const updatedLocation = await Location.findByIdAndUpdate(
            req.params.id,
            {
                location: location.trim(),
                name: name ? name.trim() : location.trim(),
                capacity: parseInt(capacity),
                floor: floor.trim(),
                updatedAt: Date.now()
            },
            { 
                new: true, 
                runValidators: true
            }
        );

        if (!updatedLocation) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json(updatedLocation);
    } catch (error) {
        console.error('Error updating location:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid location ID' });
        }
        res.status(500).json({ 
            error: 'Failed to update location',
            message: error.message 
        });
    }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'AdminLoginPage.html'));
});


// Admin login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', username);
  try {
    const user = await User.findOne({ username });
    if (!user) return res.redirect('/?error=Username does not exist. Please try again.');

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      res.cookie('userName', user.name, { maxAge: 3600000, path: '/' });
      res.cookie('userEmail', user.email, { maxAge: 3600000, path: '/' });
      console.log('User role during login:', user.role); // Debug log
      if (user.role === 'admin') {
        console.log('Redirecting admin to /admin');
        res.redirect('/admin'); 
      } else {
        console.log('Redirecting regular user to /homepage');
        res.redirect('/homepage');  //user side
      }
    } else {
      console.log('Password mismatch for user:', username);
      res.redirect('/?error=Incorrect password. Please try again.');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.redirect('/?error=Internal Server Error. Please try again later.');
  }
});

// Admin route
app.get('/viewbooking', (req, res) => {
  res.sendFile(path.join(__dirname, 'viewbooking.html'));
});

app.get('/admin', authenticate, async (req, res) => {
  const { userEmail } = req.cookies;
  try {
    const user = await User.findOne({ email: userEmail });
    console.log('User found:', user ? 'Yes' : 'No', user ? `Role: ${user.role}` : '');
    if (!user) {
      return res.redirect('/?error=User not found.');
    }
    if (user.role === 'admin') {
      console.log('Sending admin.html file from:', path.join(__dirname, 'admin.html'));
      res.sendFile(path.join(__dirname, 'admin.html'));  
    } else {
      console.log('User not admin, redirecting');
      res.redirect('/?error=You do not have access to this page.'); 
    }
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get("/api/bookings/all", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.status(200).json({ bookings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.put("/api/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const { venue, date, startTime, endTime, message, userEmail } = req.body;
  try {
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { venue, date, startTime, endTime, message, userEmail },
      { new: true }
    );
    if (!updatedBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.status(200).json({ message: "Booking updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update booking" });
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedBooking = await Booking.findByIdAndDelete(id);
    if (!deletedBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

app.post('/api/bookings', authenticate, async (req, res) => {
  const { venue, date, startTime, endTime, message, userEmail } = req.body;
  try {
    const formattedStartTime = convertTo12HourFormat(startTime);
    const formattedEndTime = convertTo12HourFormat(endTime);
    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);
    if (isNaN(startDateTime) || isNaN(endDateTime)) {
      return res.status(400).json({ error: 'Invalid date or time format.' });
    }
    const conflictingBooking = await Booking.findOne({
      venue,
      date,
      $or: [
        {
          $and: [
            { startTime: { $lt: endTime } },
            { endTime: { $gt: startTime } },
          ],
        },
      ],
    });
    if (conflictingBooking) return res.status(400).json({ error: 'Conflict: This slot is already booked!' });
    const newBooking = new Booking({
      venue,
      date,
      startTime: formattedStartTime,
      endTime: formattedEndTime,
      message,
      userEmail,
    });
    await newBooking.save();
    res.status(201).json({ message: "Booking successfully saved!", booking: newBooking });
  } catch (error) {
    console.error('Error saving booking:', error);
    res.status(500).json({ error: "Failed to save booking." });
  }
});

// Submit booking route
app.post("/submit-booking", async (req, res) => {
  try {
    
    const { userEmail, venue, date, startTime, endTime, message } = req.body;

    if (!userEmail || !venue || !date || !startTime || !endTime || !message) {
      return res.status(400).json({ error: "All fields are required!" });
    }

    const formattedStartTime = startTime;
    const formattedEndTime = endTime;

    const existingBooking = await Booking.findOne({
      venue,
      date,
      $or: [
        { startTime: { $lt: formattedEndTime }, endTime: { $gt: formattedStartTime } }
      ]
    });

    if (existingBooking) {
      return res.status(400).json({ error: "Conflict: This slot is already booked!" });
    }

    const newBooking = new Booking({ userEmail, venue, date, startTime, endTime, message });
    await newBooking.save();

    res.status(200).json({ message: "Booking successfully saved!" });
  } catch (error) {
    console.error("🔴 Error saving booking:", error);
    res.status(500).json({ error: "Failed to save booking." });
  }
});
app.get('/api/filtered-bookings', authenticate, async (req, res) => {
  const { venue, date } = req.query;

  try {
    const query = {};

    // Apply venue filter if provided
    if (venue && venue !== 'all') {
      query.venue = venue;
    }

    // Apply date filter if provided (match by date only, ignoring time part)
    if (date) {
      query.date = date; // Direct match on 'date' field in the database
    }

    const bookings = await Booking.find(query).select('venue date startTime endTime message -_id');

    // Return the bookings exactly as they are in the database
    const formattedBookings = bookings.map(booking => ({
      ...booking.toObject(), // Convert Mongoose document to plain object
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching filtered bookings:', error);
    res.status(500).json({ error: 'Failed to fetch filtered bookings' });
  }
});

// Random quote API route
const quotes1 = [
  { content: "Love is our true essence. This love should be awakened in every person.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "Compassion is the language the deaf can hear and the blind can see.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "The first step in spiritual life is to have the darshan of your own true self.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "In this universe, everything has a purpose. The invisible intelligence behind everything is what we call God.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "Happiness depends on how we react to external circumstances.", author: "Sri Mata Amritanandamayi Devi" }
];

app.get('/api/quotes', (req, res) => {
  const randomIndex = Math.floor(Math.random() * quotes1.length);
  res.json(quotes1[randomIndex]);
});

app.get('/api/bookings', authenticate, async (req, res) => {
  const { venue, start, end } = req.query;
  try {
    const query = {};
    if (venue && venue !== 'all') {
      query.venue = venue;
    }
    if (start && end) {
      query.date = { $gte: new Date(start), $lte: new Date(end) };
    }
    const bookings = await Booking.find(query);
    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Users
app.get('/addremoveuser', (req, res) => {
  res.sendFile(path.join(__dirname, 'addremoveuser.html'));
}); 

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}).select('-password').lean();
    if (!users || users.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No users found",
        users: [] 
      });
    }
    const transformedUsers = users.map(user => ({
      ...user,
      image: user.image || '/uploads/profile-images/default.png'
    }));
    res.status(200).json({ 
      success: true,
      users: transformedUsers
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch users",
      error: error.message
    });
  }
});

app.get("/api/debug/users", async (req, res) => {
  try {
    const rawUsers = await mongoose.connection.db.collection('users').find({}).toArray();
    res.status(200).json({
      success: true,
      count: rawUsers.length,
      users: rawUsers
    });
  } catch (error) {
    console.error("Debug fetch error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch users",
      error: error.message
    });
  }
});

app.post("/api/users", upload.single('image'), async (req, res) => {
  try {
    console.log('Request Body:', req.body);
    console.log('Request File:', req.file);
    const { username, password, name, email, role } = req.body; // Added role
    if (!username || !password || !name || !email) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required',
        missingFields: {
          username: !username,
          password: !password,
          name: !name,
          email: !email
        }
      });
    }
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });
    if (existingUser) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists',
        details: {
          usernameExists: existingUser.username === username,
          emailExists: existingUser.email === email
        }
      });
    }
    const userData = {
      username,
      password,
      name,
      email,
      role: role || 'user' // Default to 'user' if not provided
    };
    if (req.file) {
      userData.image = `/uploads/profile-images/${req.file.filename}`;
    }
    const newUser = new User(userData);
    await newUser.save();
    res.status(201).json({ 
      success: true, 
      message: 'User added successfully',
      user: {
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        image: newUser.image,
        role: newUser.role
      }
    });
  } catch (error) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error removing uploaded file:', unlinkError);
      }
    }
    console.error('User creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error creating user',
      errorDetails: error.toString()
    });
  }
});

app.delete("/api/users/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const deletedUser = await User.findOneAndDelete({ username });
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function convertTo12HourFormat(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hour);
  date.setMinutes(minute);
  const options = { hour: '2-digit', minute: '2-digit', hour12: true };
  return date.toLocaleTimeString([], options); 
}

function authenticate(req, res, next) {
  const { userName, userEmail } = req.cookies;
  console.log('Authentication check - cookies:', { userName, userEmail });
  if (!userName || !userEmail) {
    console.log('Authentication failed - redirecting to login');
    return res.redirect('/');
  }
  console.log('Authentication successful');
  next();
}

app.get('/homepage', authenticate, async (req, res) => {
  const { userEmail } = req.cookies;
  console.log('Homepage route accessed, userEmail from cookie:', userEmail);
  try {
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.redirect('/?error=User not found. Please log in again.');
    }
    console.log('User role in homepage:', user.role);
    if (user.role === 'admin') {
      console.log('Admin user accessing homepage, redirecting to admin page');
      return res.sendFile(path.join(__dirname, 'admin.html'));
    }
    console.log('Regular user accessing homepage');
    res.sendFile(path.join(__dirname, 'homepage.html')); 
  } catch (error) {
    console.error('Error fetching user:', error);
    res.redirect('/?error=Internal Server Error. Please try again later.');
  }
});

app.get('/booking', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'Booking.html'));
});

app.get('/forall', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'forall.html'));
});

app.post('/upload', authenticate, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!req.file) return res.status(400).send('No file uploaded.');
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(req.file.mimetype))
      return res.status(400).send('Invalid file type. Only JPEG, PNG, and GIF are allowed.');
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).send('File size exceeds 5MB.');
    const existingImage = await Image.findOne({ name });
    if (existingImage) return res.status(400).send('Name already exists.');
    const newImage = new Image({ name, data: req.file.buffer, contentType: req.file.mimetype });
    await newImage.save();
    res.status(200).send('Image uploaded successfully!');
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).send('An error occurred. Please try again.');
  }
});

app.get('/api/image', async (req, res) => {
  const { name } = req.query;
  try {
    const image = await Image.findOne({ name });
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.set('Content-Type', image.contentType);
    res.send(image.data);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

app.get('/showuserbooking', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "showuserbooking.html"));
});

const userBookingSchema = new mongoose.Schema({
  venue: { type: String, required: true },
  date: { type: String, required: true }, 
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  message: { type: String },
  userEmail: { type: String, required: true },
  bookingTime: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } 
}, { timestamps: true });

const UserBooking = mongoose.model('UserBooking', userBookingSchema);

app.get("/api/userbooking/all", async (req, res) => {
  try {
    console.log("Fetching all bookings from database...");
    const bookings = await UserBooking.find();
    console.log(`Found ${bookings.length} bookings:`, bookings);
    res.status(200).json({ bookings: bookings });
  } catch (err) {
    console.error('Error fetching all bookings:', err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.get("/api/userbookings", async (req, res) => {
  try {
    const venue = req.query.venue;
    if (!venue) {
      return res.status(400).json({ error: 'Venue search parameter is required' });
    }
    const venueRegex = new RegExp(venue, 'i');
    const bookings = await UserBooking.find({ venue: venueRegex });
    res.status(200).json({ userbookings: bookings });
  } catch (err) {
    console.error('Error searching bookings by venue:', err);
    res.status(500).json({ error: "Failed to search bookings" });
  }
});

app.get("/api/userbooking/search", async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const searchRegex = new RegExp(searchQuery, 'i');
    const bookings = await UserBooking.find({
      $or: [
        { venue: searchRegex },
        { message: searchRegex },
        { bookedBy: searchRegex }
      ]
    });
    res.status(200).json({ bookings });
  } catch (err) {
    console.error('Error searching bookings:', err);
    res.status(500).json({ error: "Failed to search bookings" });
  }
});
//approve or decline booking 

// Email transporter setup for user booking's status
const transporter_userauthorize = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "portalamrita@gmail.com",      
    pass: "oxao harq uehm vkfe",             
  },
});

// Approve booking endpoint
app.put('/api/userbooking/approve/:id', async (req, res) => {
  try {
    console.log("Approve endpoint called with ID:", req.params.id);
    
    const userBooking = await UserBooking.findById(req.params.id);
    console.log("Found booking:", userBooking);
    
    if (!userBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    if (userBooking.status === 'declined') {
      return res.status(400).json({ error: 'Cannot approve a declined booking' });
    }
    
    const newBooking = new Booking({
      venue: userBooking.venue,
      date: userBooking.date,
      startTime: userBooking.startTime,
      endTime: userBooking.endTime,
      message: userBooking.message,
      userEmail: userBooking.userEmail, 
      createdAt: userBooking.createdAt || new Date(),
      status: 'approved'
    });
    
    const savedBooking = await newBooking.save();
    console.log("New booking saved:", savedBooking);
    
    await UserBooking.findByIdAndDelete(req.params.id);
    console.log("Original booking deleted.");
    
    // ✅ Send immediate response
    res.status(200).json({
      message: 'Booking approved and moved successfully',
      booking: savedBooking
    });
    
    // 📧 Send approval email to user in background (non-blocking)
    const approvalMailOptions = {
      from: '"Booking System" <portalamrita@gmail.com>',
      to: userBooking.userEmail,
      subject: "Booking Approved - Confirmation",
      html: `
        <h2>🎉 Your Booking Has Been Approved!</h2>
        <p>Dear User,</p>
        <p>We're pleased to inform you that your booking request has been approved.</p>
        
        <h3>Booking Details:</h3>
        <p><strong>Venue:</strong> ${userBooking.venue}</p>
        <p><strong>Date:</strong> ${userBooking.date}</p>
        <p><strong>Time:</strong> ${userBooking.startTime} to ${userBooking.endTime}</p>
        <p><strong>Message:</strong> ${userBooking.message}</p>
        
        <p>Thank you.</p>
      `,
    };
    
    transporter_userauthorize.sendMail(approvalMailOptions).catch(err => {
      console.error("Approval email sending failed:", err);
    });
    
  } catch (error) {
    console.error('🔴 Error approving booking:', error);
    res.status(500).json({ error: 'Failed to approve booking', details: error.message });
  }
});

// Decline booking endpoint
app.delete('/api/userbooking/:id', async (req, res) => {
  try {
    console.log("Decline endpoint called with ID:", req.params.id);
    
    const userBooking = await UserBooking.findById(req.params.id);
    console.log("Found booking for decline:", userBooking);
    
    if (!userBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const deletedBooking = await UserBooking.findByIdAndDelete(req.params.id);
    console.log("Deleted booking:", deletedBooking);
    
    // ✅ Send immediate response
    res.status(200).json({
      message: 'Booking declined and deleted successfully',
      booking: deletedBooking
    });
    
    // 📧 Send decline email to user in background (non-blocking)
    const declineMailOptions = {
      from: '"Booking System" <portalamrita@gmail.com>',
      to: userBooking.userEmail,
      subject: "Booking Request - Update",
      html: `
        <h2>Booking Request Update</h2>
        <p>Dear User,</p>
        <p>We regret to inform you that your booking request could not be approved at this time.</p>
        
        <h3>Booking Details:</h3>
        <p><strong>Venue:</strong> ${userBooking.venue}</p>
        <p><strong>Date:</strong> ${userBooking.date}</p>
        <p><strong>Time:</strong> ${userBooking.startTime} to ${userBooking.endTime}</p>
        <p><strong>Message:</strong> ${userBooking.message}</p>
        
        <p>Please feel free to submit a new request for different dates or times.</p>
        <p>Thank you for your understanding.</p>
      `,
    };
    
    transporter_userauthorize.sendMail(declineMailOptions).catch(err => {
      console.error("Decline email sending failed:", err);
    });
    
  } catch (error) {
    console.error('🔴 Error declining booking:', error);
    res.status(500).json({ error: 'Failed to decline booking', details: error.message });
  }
});

const xlsx = require('xlsx');
const locationrefere = mongoose.model('Location', LocationSchema);
let uploadedExcelFile = null;
const uploadexcel = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const excelUploadDir = path.join(__dirname, 'uploads', 'excel-files');

      if (!fs.existsSync(excelUploadDir)) {
        fs.mkdirSync(excelUploadDir, { recursive: true });
      }

      cb(null, excelUploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'excel-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];

    const allowedExtensions = ['.xlsx', '.xls', '.xlsm'];

    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
    const isValidExtension = allowedExtensions.includes(path.extname(file.originalname).toLowerCase());

    if (isValidMimeType && isValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls, .xlsm) are allowed.'), false);
    }
  }
});

// Route for Excel upload in locations
app.post('/upload-excel', uploadexcel.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a valid Excel file to upload'
      });
    }
    console.log('Uploaded Excel File:', {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
    const workbook = xlsx.readFile(req.file.path);

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        error: 'Invalid Excel file',
        message: 'No sheets found in the uploaded Excel file'
      });
    }
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    if (!data || data.length === 0) {
      return res.status(400).json({
        error: 'Empty File',
        message: 'The uploaded Excel file is empty'
      });
    }
    const savedLocations = [];
    for (const row of data) {
      const newLocation = new Location({
        location: row.Location, 
        floor: row.Floor,
        capacity: row.Capacity
      });
      await newLocation.save();
      savedLocations.push(newLocation);
    }
    fs.unlinkSync(req.file.path);
    res.status(200).json({
      message: 'Excel file uploaded and processed successfully',
      recordsProcessed: savedLocations.length
    });
  } catch (error) {
    console.error('Excel Upload Error:', error);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    res.status(500).json({
      error: 'Upload failed',
      message: error.message || 'Failed to process the uploaded Excel file'
    });
  }
});

app.get('/download-excel', authenticate, async (req, res) => {
  try {
    const locations = await locationrefere.find({}, { _id: 0, __v: 0 }).lean();
    if (!locations.length) return res.status(404).send('No location data found.');
    const data = locations.map(location => ({
      'Location': location.location,
      'Floor': location.floor,
      'Capacity': location.capacity
    }));
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Locations');
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=locations_data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).send('Failed to download Excel file.');
  }
});

app.get('/excel', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'excel.html'));
});

app.get('/download-location-data', authenticate, async (req, res) => {
  try {
    const locations = await Location.find({});
    const data = locations.map(location => ({
      'Location': location.location,
      'Floor': location.floor,
      'Capacity': location.capacity
    }));
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Location Data');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=location_data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading location data:', error);
    res.status(500).send('Failed to download location data.');
  }
});

app.get('/classroombooking', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

app.get("/api/image", async (req, res) => {
  const { name } = req.query;
  try {
    const image = await Image.findOne({ name });
    if (!image) return res.status(404).json({ error: "Image not found" });
    res.set("Content-Type", image.contentType);
    res.send(image.data);
  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

const Teacher = mongoose.model("Teacher", new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  available_slots: Object,
}));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "invigilation.messenger@gmail.com",
    pass: "xxxt cqvj snzg yjzr",
  },
});

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

app.get("/admin", (req, res) => {
  res.send(`
    <h1>Welcome to the Teacher Scheduling System</h1>
    <ul>
      <li><a href="/old-project">Old Project (Teacher Availability)</a></li>
      <li><a href="/new-project">New Project (Common Meeting Slots)</a></li>
      <li><a href="/gds-project">GDS Module (Group Discussion Slots)</a></li>
    </ul>
  `);
});

app.get("/ftm", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/ccm", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "ccm.html"));
});

app.get("/gds", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "gds.html"));
});
app.get('/bookclass', (req, res) => {
  res.sendFile(path.join(__dirname, 'obldkook.html'));
});
app.post("/add-class", async (req, res) => {
  try {
    const { courseName, courseCode, instructor, day, slots, location, description } = req.body;

    // Check if slot is already taken for that day AND location
    const existingClass = await ClassFormCre.findOne({ day, location, "slots.slot": slots[0].slot });

    if (existingClass) {
      return res.status(400).json({ message: "Error: Slot already exists for this day and location!" });
    }

    // Save new class (allowing same courseCode, but different location/slot/day)
    const newClass = new ClassFormCre({
      courseName,
      courseCode,  // ✅ No unique constraint on courseCode now
      instructor,
      day,
      slots,
      location,
      description
    });

    await newClass.save();
    res.json({ message: "Class added successfully!" });

  } catch (error) {
    console.error("🔥 Error saving class:", error);
    res.status(500).json({ message: "Error saving class", error: error.message });
  }
});


app.get("/get-permanent-slots", async (req, res) => {
  try {
    const { day, location } = req.query;
    if (!day || !location) {
      return res.status(400).json({ message: "Day and Location are required" });
    }

    // Find all permanent slots on the given day and location
    const takenSlots = await ClassFormCre.find({ day, location, "slots.status": "permanent" })
      .select("slots.slot");

    // Flatten results into an array of occupied slot numbers
    const occupiedSlots = takenSlots.flatMap(cls => cls.slots.map(slot => slot.slot));

    res.json(occupiedSlots);
  } catch (error) {
    res.status(500).json({ message: "Error fetching permanent slots", error });
  }
});
// 📌 Endpoint to Fetch Booked Slots by Location & Date**
app.get("/get-booked-slots", async (req, res) => {
  try {
    const { date, location } = req.query;

    if (!date || !location) {
      return res.status(400).json({ message: "Date and location are required!" });
    }

    // Convert date to the format stored in MongoDB
    const formattedDate = new Date(date).toISOString().split("T")[0];

    // Find bookings matching the given date and location
    const bookedClasses = await classbookering.find({
      location,
      date: { $gte: new Date(formattedDate), $lt: new Date(formattedDate + "T23:59:59.999Z") },
    });

    // Extract booked slots
    let bookedSlots = [];
    bookedClasses.forEach((classBooking) => {
      classBooking.slots.forEach((slot) => {
        bookedSlots.push(slot.slot);
      });
    });

    res.json(bookedSlots);
  } catch (error) {
    console.error("🔥 Error fetching booked slots:", error);
    res.status(500).json({ message: "Error fetching booked slots", error: error.message });
  }
});
// 📌Endpoint to Add a Class Booking**
app.post("/add-classbookerease", async (req, res) => {
  try {
    const { courseName, courseCode, instructor, location, date, day, slots, description } = req.body;

    const formattedDate = new Date(date).toISOString().split("T")[0];

    const newBooking = new classbookering({
      courseName,
      courseCode,
      instructor,
      location,
      date: formattedDate,
      day,
      slots,
      description,
    });

    await newBooking.save();
    res.json({ message: "Class booked successfully!" });
  } catch (error) {
    console.error("🔥 Error saving class booking:", error);
    res.status(500).json({ message: "Error saving class booking", error: error.message });
  }
});// ➤ Add a new location

app.get('/get-locations', async (req, res) => {
  try {
    const locations = await locationrefere.find();
    const locationArray = locations.map(item => item.location);
    const floorArray = locations.map(item => item.floor);
    res.json({ locations: locationArray, floors: floorArray });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching locations' });
  }
});
// ➤ Fetch all locations, floors, and capacities
app.get('/get-cap-locations', async (req, res) => {
  try {
    const locations = await locationrefere.find();
    const locationArray = locations.map(item => item.location);
    const floorArray = locations.map(item => item.floor);
    const capacityArray = locations.map(item => item.capacity);
    res.json({ locations: locationArray, floors: floorArray, capacities: capacityArray });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching locations' });
  }
});
app.get("/get-available-locations", async (req, res) => {
  try {
    const { date, slot } = req.query;
    if (!date || !slot) {
      return res.status(400).json({ message: "Date and slot are required!" });
    }
    const formattedDate = new Date(date).toISOString().split("T")[0];
    const bookedClasses = await classbookering.find({
      date: { $gte: new Date(formattedDate), $lt: new Date(formattedDate + "T23:59:59.999Z") },
      "slots.slot": slot,
    }).select("location");
    const bookedLocations = bookedClasses.map((cls) => cls.location);
    // Get all locations
    const allLocations = await locationrefere.find().select("location");
    const locationArray = allLocations.map((item) => item.location);
    // Filter available locations
    const availableLocations = locationArray.filter(loc => !bookedLocations.includes(loc));
    res.json({ availableLocations });
  } catch (error) {
    console.error("🔥 Error fetching available locations:", error);
    res.status(500).json({ message: "Error fetching available locations", error: error.message });
  }
});
app.get("/get-locations-by-date-slot", async (req, res) => {
  try {
    const { date, slot } = req.query;

    if (!date || !slot) {
      return res.status(400).json({ message: "Date and Slot are required" });
    }

    // Convert date to the corresponding day of the week
    const dayOfWeek = moment(date, "YYYY-MM-DD").format("dddd"); // Converts "2024-02-12" to "Monday"

    // Find all entries that match the given day and slot
    const classes = await ClassFormCre.find({ day: dayOfWeek, "slots.slot": slot }).select("location");

    // Extract locations from the results
    const locations = classes.map(cls => cls.location);

    res.json(locations);
  } catch (error) {
    console.error("🔥 Error fetching locations:", error);
    res.status(500).json({ message: "Error fetching locations", error: error.message });
  }
});


app.post("/api/find-teacher", async (req, res) => {
  const { date, startTime, endTime } = req.body;
  const dayOfWeek = new Date(date).toLocaleString("en-US", { weekday: "long" });
  try {
    console.log(`Finding teachers for: ${dayOfWeek}, ${startTime}-${endTime}`);
    const allTeachers = await Teacher.find({ [`available_slots.${dayOfWeek}`]: { $exists: true } });
    console.log("All teachers available on this day:", allTeachers.map((t) => t.name));
    const bookedTeachers = await Booking.find({ day: dayOfWeek });
    console.log("Bookings found:", bookedTeachers);
    const bookedTeacherNames = bookedTeachers
      .filter((booking) => {
        if (!booking.slot) {
          console.warn(`⚠️ Booking for ${booking.teacher_name} has no slot! Skipping.`);
          return false;
        }
        const [bookedStart, bookedEnd] = booking.slot.split("-").map((time) => time.trim());
        console.log(`Checking booking: ${booking.teacher_name} - ${bookedStart} to ${bookedEnd}`);
        const overlap =
          timeToMinutes(bookedStart) < timeToMinutes(endTime) &&
          timeToMinutes(bookedEnd) > timeToMinutes(startTime);
        if (overlap) {
          console.log(`❌ ${booking.teacher_name} is booked during this time.`);
        }
        return overlap;
      })
      .map((booking) => booking.teacher_name);
    console.log("Booked teacher names:", bookedTeacherNames);
    const availableTeachers = allTeachers.filter((teacher) => {
      const availableSlots = teacher.available_slots?.[dayOfWeek] || [];
      if (!Array.isArray(availableSlots) || availableSlots.length === 0) {
        console.log(`🚫 ${teacher.name} has no slots on ${dayOfWeek}.`);
        return false;
      }
      const hasMatchingSlot = availableSlots.some((slot) => {
        if (!slot) return false;
        const [teacherStart, teacherEnd] = slot.split("-").map((time) => time.trim());
        return (
          timeToMinutes(teacherStart) < timeToMinutes(endTime) &&
          timeToMinutes(teacherEnd) > timeToMinutes(startTime)
        );
      });
      if (!hasMatchingSlot) {
        console.log(`🚫 ${teacher.name} is not available in ${startTime}-${endTime}`);
        return false;
      }
      const isBooked = bookedTeachers.some((booking) => {
        if (booking.teacher_name !== teacher.name || !booking.slot) return false;
        const [bookedStart, bookedEnd] = booking.slot.split("-").map((time) => time.trim());
        return (
          timeToMinutes(bookedStart) < timeToMinutes(endTime) &&
          timeToMinutes(bookedEnd) > timeToMinutes(startTime)
        );
      });
      if (isBooked) {
        console.log(`❌ ${teacher.name} is already booked in ${startTime}-${endTime}`);
        return false;
      }
      return true;
    });
    console.log("✅ Available teachers:", availableTeachers.map((t) => t.name));
    res.json(
      availableTeachers.map((teacher) => ({
        name: teacher.name,
        email: teacher.email,
        subject: teacher.subject,
        slot: teacher.available_slots[dayOfWeek].join(", "),
      }))
    );
  } catch (err) {
    console.error("Error fetching teachers:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.post("/api/notify-teacher", async (req, res) => {
  const { teacherName, teacherEmail, date, startTime, endTime } = req.body;
  try {
    await transporter.sendMail({
      from: "invigilation.messenger@gmail.com",
      to: teacherEmail,
      subject: "Invigilation Duty Request",
      text: `Dear ${teacherName},\n\nYou have been requested for invigilation duty on ${date} from ${startTime} to ${endTime}.\n\nPlease confirm your availability.\n\nThank you.`,
    });
    res.json({ success: true, message: "Notification sent successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send email" });
  }
});

function findTopSlots(teachers, dayOfWeek) {
  const allSlots = teachers.flatMap((teacher) => teacher.available_slots[dayOfWeek] || []);
  const slotCounts = {};
  allSlots.forEach((slot) => {
    if (!slotCounts[slot]) {
      slotCounts[slot] = 0;
    }
    slotCounts[slot]++;
  });
  const sortedSlots = Object.entries(slotCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([slot]) => slot);
  return sortedSlots.slice(0, 3);
}

app.post("/api/find-common-slots", async (req, res) => {
  const { date } = req.body;
  const dayOfWeek = new Date(date).toLocaleString("en-US", { weekday: "long" });
  try {
    const teachers = await Teacher.find({ [`available_slots.${dayOfWeek}`]: { $exists: true } });
    const topSlots = findTopSlots(teachers, dayOfWeek);
    if (topSlots.length === 0) {
      return res.json([]);
    }
    const availableSlots = topSlots.map((slot) => {
      const [startTime, endTime] = slot.split("-");
      const availableTeachers = teachers
        .filter((teacher) => teacher.available_slots[dayOfWeek].includes(slot))
        .map((teacher) => teacher.name);
      return { startTime, endTime, teachers: availableTeachers };
    });
    res.json(availableSlots);
  } catch (err) {
    console.error("Error finding top slots:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.post("/api/notify-common-slot", async (req, res) => {
  const { date, slot, teachers } = req.body;
  try {
    const teacherData = await Teacher.find({ name: { $in: teachers } }).select("name email -_id");
    if (teacherData.length === 0) {
      return res.status(404).json({ error: "No teachers found with the provided names." });
    }
    const emailPromises = teacherData.map((teacher) => {
      return transporter.sendMail({
        from: "invigilation.messenger@gmail.com",
        to: teacher.email,
        subject: "Common Meeting Slot Notification",
        text: `Dear ${teacher.name},\n\nA common meeting slot has been identified on ${date} from ${slot}.\n\nPlease confirm your availability.\n\nThank you.`,
      });
    });
    await Promise.all(emailPromises);
    res.json({ success: true, message: "Notifications sent successfully!" });
  } catch (error) {
    console.error("Error sending notifications:", error);
    res.status(500).json({ error: "Failed to send notifications" });
  }
});

app.get("/api/get-subjects", async (req, res) => {
  try {
    const teachers = await Teacher.find({});
    const subjects = [...new Set(teachers.map((teacher) => teacher.subject))];
    res.json(subjects);
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.post("/api/find-gds-slot", async (req, res) => {
  const { date, subject } = req.body;
  const dayOfWeek = new Date(date).toLocaleString("en-US", { weekday: "long" });
  try {
    const teachers = await Teacher.find({ subject, [`available_slots.${dayOfWeek}`]: { $exists: true } });
    const topSlots = findTopSlots(teachers, dayOfWeek);
    if (topSlots.length === 0) {
      return res.json([]);
    }
    const availableSlots = topSlots.map((slot) => {
      const [startTime, endTime] = slot.split("-");
      const availableTeachers = teachers
        .filter((teacher) => teacher.available_slots[dayOfWeek].includes(slot))
        .map((teacher) => teacher.name);
      return { startTime, endTime, teachers: availableTeachers };
    });
    res.json(availableSlots);
  } catch (err) {
    console.error("Error finding GDS slots:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.post("/api/notify-gds-slot", async (req, res) => {
  const { date, slot, teachers } = req.body;
  try {
    const teacherData = await Teacher.find({ name: { $in: teachers } }).select("name email -_id");
    if (teacherData.length === 0) {
      return res.status(404).json({ error: "No teachers found with the provided names." });
    }
    const emailPromises = teacherData.map((teacher) => {
      return transporter.sendMail({
        from: "invigilation.messenger@gmail.com",
        to: teacher.email,
        subject: "Group Discussion Slot Notification",
        text: `Dear ${teacher.name},\n\nA group discussion slot has been identified on ${date} from ${slot}.\n\nPlease confirm your availability.\n\nThank you.`,
      });
    });
    await Promise.all(emailPromises);
    res.json({ success: true, message: "Notifications sent successfully!" });
  } catch (error) {
    console.error("Error sending notifications:", error);
    res.status(500).json({ error: "Failed to send notifications" });
  }
});

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!req.file) return res.status(400).send("No file uploaded.");
    if (!["image/jpeg", "image/png", "image/gif"].includes(req.file.mimetype))
      return res.status(400).send("Invalid file type. Only JPEG, PNG, and GIF are allowed.");
    if (req.file.size > 5 * 1024 * 1024) return res.status(400).send("File size exceeds 5MB.");
    const existingImage = await Image.findOne({ name });
    if (existingImage) return res.status(400).send("Name already exists.");
    const newImage = new Image({ name, data: req.file.buffer, contentType: req.file.mimetype });
    await newImage.save();
    res.status(200).send("Image uploaded successfully!");
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send("An error occurred. Please try again.");
  }
});
app.get('/displayclass', (req, res) => {
  res.sendFile(path.join(__dirname, 'finaldisplayer.html'));
});


app.get("/timetable",(req,res)=>{
  res.sendFile(path.join(__dirname,"views","timetable.html"));
})

const timetableSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  courseCode: { type: String, required: true },
  instructor: { type: String, required: true },
  location: { type: String, required: true },
  day: { type: String, required: true },
  slots: [
    {
      slot: { type: String, required: true },
      time: { type: String },
      status: { 
        type: String, 
        enum: ["permanent", "temporary"],
        default: "permanent",
        required: true
      }
    }
  ],
  freeSlotCount: { type: Number, required: true },
  year: { type: String, required: true },
  semester: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Timetable = mongoose.models.classformcres || mongoose.model("classformcres", timetableSchema);
app.post('/upload-timetable', uploadexcel.single('timetableFile'), async (req, res) => {
  try {
    const file = req.file;
    const { year, semester } = req.body;
    
    if (!file) {
      return res.status(400).json({ message: 'No Excel file uploaded.' });
    }
    if (!year || !semester) {
      return res.status(400).json({ message: 'Year and semester are required.' });
    }

    // Read Excel file
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays format for easier processing
    const rawData = xlsx.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '', 
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });

    // Create our custom DataFrame
    const df = new ExcelDataFrame(rawData);
    
    // Automatically detect timetable structure
    const timetableInfo = detectTimetableStructure(df);
    
    if (!timetableInfo.isValid) {
      return res.status(400).json({ 
        message: 'Invalid timetable format. Could not detect proper structure.',
        debug: timetableInfo
      });
    }

    // Extract metadata dynamically
    const metadata = extractMetadata(df);
    
    // Process timetable data
    const { addedCount, updatedCount, errors } = await processTimetableData(
      df, 
      timetableInfo, 
      metadata, 
      year, 
      semester
    );

    // Clean up uploaded file
    fs.unlinkSync(file.path);
    
    res.status(200).json({
      message: 'Timetable uploaded successfully!',
      details: {
        addedCount,
        updatedCount,
        metadata,
        structure: timetableInfo,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (err) {
    console.error('🔥 Upload timetable failed:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    res.status(500).json({ 
      message: 'Internal server error during timetable upload', 
      error: err.message 
    });
  }
});

// Custom DataFrame class for Excel data processing
class ExcelDataFrame {
  constructor(data) {
    this.data = data || [];
    this.rows = this.data.length;
    this.cols = this.data[0]?.length || 0;
  }

  // Get cell value by row and column index
  iloc(row, col) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      const value = this.data[row][col];
      return value ? value.toString().trim() : '';
    }
    return '';
  }

  // Find all cells containing specific text
  findCells(searchText, options = {}) {
    const { caseSensitive = false, exactMatch = false } = options;
    const results = [];
    
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < (this.data[row]?.length || 0); col++) {
        const cellValue = this.iloc(row, col);
        if (!cellValue) continue;
        
        const searchValue = caseSensitive ? searchText : searchText.toLowerCase();
        const cellValueToCheck = caseSensitive ? cellValue : cellValue.toLowerCase();
        
        const isMatch = exactMatch ? 
          cellValueToCheck === searchValue : 
          cellValueToCheck.includes(searchValue);
        
        if (isMatch) {
          results.push({ row, col, value: cellValue });
        }
      }
    }
    return results;
  }

  // Get entire row
  getRow(rowIndex) {
    return this.data[rowIndex] || [];
  }

  // Get entire column
  getColumn(colIndex) {
    return this.data.map(row => row[colIndex] || '');
  }

  // Find first non-empty cell in a row starting from a column
  findFirstNonEmpty(row, startCol = 0) {
    for (let col = startCol; col < this.cols; col++) {
      const value = this.iloc(row, col);
      if (value && value !== '-' && value.length > 0) {
        return { col, value };
      }
    }
    return null;
  }

  // Check if a row is mostly empty
  isRowEmpty(rowIndex, threshold = 0.8) {
    const row = this.getRow(rowIndex);
    const emptyCount = row.filter(cell => !cell || cell.toString().trim() === '').length;
    return (emptyCount / row.length) >= threshold;
  }
}

// Detect timetable structure automatically
function detectTimetableStructure(df) {
  const structure = {
    isValid: false,
    timeSlotRow: -1,
    timeSlotStartCol: -1,
    dayStartRow: -1,
    dayEndRow: -1,
    coursesStartRow: -1,
    coursesEndRow: -1,
    labsStartRow: -1,
    labsEndRow: -1,
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    timeSlots: [],
    debugInfo: {}
  };

  try {
    // Method 1: Find time slots by looking for "SLOT" pattern
    let slotCells = df.findCells('SLOT');
    structure.debugInfo.slotCells = slotCells.length;
    
    if (slotCells.length === 0) {
      // Method 2: Look for time patterns (XX:XX format)
      slotCells = df.findCells(':');
      structure.debugInfo.timeCells = slotCells.length;
    }

    if (slotCells.length === 0) {
      // Method 3: Look for numbered slots (1, 2, 3, etc. in sequence)
      for (let row = 0; row < Math.min(15, df.rows); row++) {
        let consecutiveNumbers = 0;
        for (let col = 1; col < df.cols; col++) {
          const cellValue = df.iloc(row, col);
          if (cellValue === (col).toString() || cellValue === `${col}` || cellValue.includes(`${col}`)) {
            consecutiveNumbers++;
            if (consecutiveNumbers >= 3) { // At least 3 consecutive slots
              structure.timeSlotRow = row;
              structure.timeSlotStartCol = col - consecutiveNumbers + 1;
              slotCells.push({ row, col, value: cellValue });
              break;
            }
          } else {
            consecutiveNumbers = 0;
          }
        }
        if (structure.timeSlotRow !== -1) break;
      }
    }

    // Set time slot row from found cells
    if (slotCells.length > 0 && structure.timeSlotRow === -1) {
      structure.timeSlotRow = slotCells[0].row;
      structure.timeSlotStartCol = slotCells[0].col;
    }

    // Extract time slots information
    if (structure.timeSlotRow !== -1) {
      const timeRow = df.getRow(structure.timeSlotRow);
      const timeRowBelow = df.getRow(structure.timeSlotRow + 1);
      
      let slotCount = 0;
      for (let col = structure.timeSlotStartCol; col < df.cols && slotCount < 15; col++) {
        const slotValue = timeRow[col] || '';
        const timeValue = timeRowBelow[col] || '';
        
        // Check if this looks like a time slot
        const isTimeSlot = slotValue.includes('SLOT') || 
                          slotValue.match(/^\d+$/) || 
                          timeValue.includes(':') ||
                          (slotCount > 0 && (slotValue !== '' || timeValue !== ''));
        
        if (isTimeSlot) {
          slotCount++;
          structure.timeSlots.push({
            slot: slotCount,
            time: timeValue || slotValue || `Slot ${slotCount}`,
            column: col,
            slotHeader: slotValue
          });
        } else if (slotCount > 0 && slotValue === '' && timeValue === '') {
          // Stop if we hit empty columns after finding slots
          break;
        }
      }
    }

    // Find day rows by searching for weekday names
    const dayPositions = {};
    for (const day of structure.days) {
      const dayCells = df.findCells(day, { caseSensitive: false });
      if (dayCells.length > 0) {
        const dayRow = dayCells[0].row;
        dayPositions[day] = dayRow;
        
        if (structure.dayStartRow === -1 || dayRow < structure.dayStartRow) {
          structure.dayStartRow = dayRow;
        }
        if (dayRow > structure.dayEndRow) {
          structure.dayEndRow = dayRow;
        }
      }
    }
    structure.debugInfo.dayPositions = dayPositions;

    // Find theory courses section
    const theoryPatterns = ['Theory', 'THEORY', 'Course Code', 'Subject Code'];
    for (const pattern of theoryPatterns) {
      const theoryCells = df.findCells(pattern, { caseSensitive: false });
      if (theoryCells.length > 0) {
        structure.coursesStartRow = theoryCells[0].row + 1;
        
        // Find end of theory section (look for empty row or "Lab" section)
        for (let row = structure.coursesStartRow; row < df.rows; row++) {
          if (df.isRowEmpty(row) || df.findCells('Lab', { caseSensitive: false }).some(cell => cell.row === row)) {
            structure.coursesEndRow = row - 1;
            break;
          }
        }
        break;
      }
    }

    // Find lab section
    const labPatterns = ['Lab', 'LAB', 'Laboratory'];
    for (const pattern of labPatterns) {
      const labCells = df.findCells(pattern, { caseSensitive: false });
      if (labCells.length > 0) {
        structure.labsStartRow = labCells[0].row + 1;
        
        // Find end of lab section
        for (let row = structure.labsStartRow; row < df.rows; row++) {
          if (df.isRowEmpty(row)) {
            structure.labsEndRow = row - 1;
            break;
          }
        }
        if (structure.labsEndRow === -1) {
          structure.labsEndRow = Math.min(structure.labsStartRow + 10, df.rows - 1);
        }
        break;
      }
    }

    // Validate structure
    structure.isValid = structure.timeSlotRow !== -1 && 
                      structure.dayStartRow !== -1 && 
                      structure.timeSlots.length >= 3; // At least 3 time slots

    structure.debugInfo.isValid = structure.isValid;
    structure.debugInfo.foundTimeSlots = structure.timeSlots.length;

    return structure;
    
  } catch (error) {
    console.error('Error detecting timetable structure:', error);
    structure.debugInfo.error = error.message;
    return structure;
  }
}

// Extract metadata from the timetable
function extractMetadata(df) {
  const metadata = {
    department: '',
    semester: '',
    section: '',
    location: 'ABIII - F405', // Default location
    classAdvisors: '',
    academicYear: ''
  };

  try {
    // Search for metadata in first 10 rows
    for (let row = 0; row < Math.min(10, df.rows); row++) {
      for (let col = 0; col < df.cols; col++) {
        const cellValue = df.iloc(row, col);
        const lowerValue = cellValue.toLowerCase();
        
        if (lowerValue.includes('dept') || lowerValue.includes('department')) {
          metadata.department = cellValue;
        }
        if (lowerValue.includes('semester') || lowerValue.includes('sem')) {
          metadata.semester = cellValue;
        }
        if (lowerValue.includes('section') || lowerValue.includes('sec')) {
          metadata.section = cellValue;
        }
        if (cellValue.includes('ABIII') || cellValue.includes('AB3') || cellValue.includes('AB-III')) {
          metadata.location = cellValue.includes('-') ? cellValue : 'ABIII - F405';
        }
        if (lowerValue.includes('advisor') || lowerValue.includes('faculty')) {
          metadata.classAdvisors = cellValue;
        }
        if (lowerValue.includes('year') && (cellValue.includes('20') || cellValue.includes('-'))) {
          metadata.academicYear = cellValue;
        }
      }
    }

    return metadata;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return metadata;
  }
}

// Build course lookup from theory and lab sections
function buildCourseLookup(df, structure) {
  const lookup = {};
  
  try {
    // Process theory courses
    if (structure.coursesStartRow !== -1) {
      const endRow = structure.coursesEndRow !== -1 ? structure.coursesEndRow : structure.coursesStartRow + 15;
      
      for (let row = structure.coursesStartRow; row <= endRow && row < df.rows; row++) {
        const courseCode = df.iloc(row, 0);
        const courseName = df.iloc(row, 1);
        const instructor = df.iloc(row, 2);
        const location = df.iloc(row, 4) || df.iloc(row, 3);
        
        if (courseCode && courseCode.length > 1 && !courseCode.toLowerCase().includes('code')) {
          lookup[courseCode.toUpperCase()] = {
            courseName: courseName || courseCode,
            instructor: instructor || 'TBD',
            location: location || 'ABIII - F405',
            type: 'theory'
          };
        }
      }
    }
    
    // Process lab courses
    if (structure.labsStartRow !== -1) {
      const endRow = structure.labsEndRow !== -1 ? structure.labsEndRow : structure.labsStartRow + 8;
      
      for (let row = structure.labsStartRow; row <= endRow && row < df.rows; row++) {
        const courseCode = df.iloc(row, 0);
        const courseName = df.iloc(row, 1);
        const instructor = df.iloc(row, 2);
        const location = df.iloc(row, 4) || df.iloc(row, 3);
        
        if (courseCode && courseCode.length > 1 && !courseCode.toLowerCase().includes('code')) {
          lookup[courseCode.toUpperCase()] = {
            courseName: courseName || courseCode,
            instructor: instructor || 'TBD',
            location: location || 'ABIII - F405',
            type: 'lab'
          };
        }
      }
    }
    
    return lookup;
  } catch (error) {
    console.error('Error building course lookup:', error);
    return {};
  }
}

// Process timetable data with the detected structure
async function processTimetableData(df, structure, metadata, year, semester) {
  const errors = [];
  let addedCount = 0;
  let updatedCount = 0;

  try {
    // Build course lookup dictionary
    const courseLookup = buildCourseLookup(df, structure);
    console.log('Course lookup built:', Object.keys(courseLookup).length, 'courses');
    
    // Process each day
    for (let dayIndex = 0; dayIndex < structure.days.length; dayIndex++) {
      const day = structure.days[dayIndex];
      const dayRow = structure.dayStartRow + dayIndex;
      
      // Skip if this day row doesn't exist
      if (dayRow >= df.rows) continue;
      
      // Process each time slot for this day
      for (const timeSlot of structure.timeSlots) {
        const cellValue = df.iloc(dayRow, timeSlot.column);
        
        // Skip empty cells or meaningless entries
        if (!cellValue || cellValue === '-' || cellValue.length < 2) {
          continue;
        }

        try {
          // Extract course information
          const courseInfo = extractCourseInfo(cellValue, courseLookup, metadata);
          
          if (!courseInfo.courseCode) {
            continue;
          }

          const slotData = {
            slot: timeSlot.slot,
            time: timeSlot.time,
            status: 'permanent'
          };

          // Check if entry already exists
          const existingEntry = await Timetable.findOne({
            courseCode: courseInfo.courseCode,
            day: day,
            'slots.slot': slotData.slot,
            location: courseInfo.location,
            year: year,
            semester: semester
          });

          if (existingEntry) {
            await Timetable.findByIdAndUpdate(existingEntry._id, {
              courseName: courseInfo.courseName,
              instructor: courseInfo.instructor,
              slots: [slotData],
              freeSlotCount: 0,
              year,
              semester,
              description: 'class'
            });
            updatedCount++;
          } else {
            const newEntry = new Timetable({
              courseName: courseInfo.courseName,
              courseCode: courseInfo.courseCode,
              instructor: courseInfo.instructor,
              day,
              location: courseInfo.location,
              slots: [slotData],
              freeSlotCount: 0,
              year,
              semester,
              description: 'class',
              createdAt: new Date()
            });

            await newEntry.save();
            addedCount++;
          }

          // Handle location
          await handleLocation(courseInfo.location);

        } catch (cellError) {
          console.error(`Error processing ${day} ${timeSlot.slot}:`, cellError);
          errors.push(`Error processing ${day} slot ${timeSlot.slot}: ${cellError.message}`);
        }
      }
    }

    return { addedCount, updatedCount, errors };
    
  } catch (error) {
    console.error('Error processing timetable data:', error);
    errors.push(`General processing error: ${error.message}`);
    return { addedCount, updatedCount, errors };
  }
}

// Extract course information from cell value
function extractCourseInfo(cellValue, courseLookup, metadata) {
  const courseCode = cellValue.trim().toUpperCase();
  const defaultLocation = metadata.location || 'ABIII - F405';
  
  if (courseLookup[courseCode]) {
    return {
      courseCode,
      courseName: courseLookup[courseCode].courseName,
      instructor: courseLookup[courseCode].instructor,
      location: courseLookup[courseCode].location
    };
  }
  
  // If not found in lookup, use default values
  return {
    courseCode,
    courseName: courseCode,
    instructor: 'TBD',
    location: defaultLocation
  };
}

// Handle location creation
async function handleLocation(location) {
  try {
    const existingLocation = await Location.findOne({ location });
    if (!existingLocation) {
      const newLocation = new Location({
        location,
        floor: location.includes('F4') ? 'Fourth Floor' : 
               location.includes('F3') ? 'Third Floor' :
               location.includes('F2') ? 'Second Floor' :
               location.includes('F1') ? 'First Floor' : 'Unknown',
        capacity: 50
      });
      await newLocation.save();
    }
  } catch (locationError) {
    console.warn(`Could not add location ${location}:`, locationError.message);
  }
}

//user excel
app.get("/userexcel",(req,res)=>{
  res.sendFile(path.join(__dirname,"views","userexcel.html"));
})
const uploadUserExcel = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Validation functions
function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!username || typeof username !== 'string') {
    return { valid: false, message: 'Username is required' };
  }
  username = username.trim();
  if (!usernameRegex.test(username)) {
    return { valid: false, message: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores' };
  }
  return { valid: true };
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' };
  }
  return { valid: true };
}

function validateName(name) {
  const nameRegex = /^[a-zA-Z\s.'-]{2,50}$/;
  if (!name || typeof name !== 'string') {
    return { valid: false, message: 'Name is required' };
  }
  name = name.trim();
  if (!nameRegex.test(name)) {
    return { valid: false, message: 'Name must be 2-50 characters and contain only letters, spaces, dots, hyphens, and apostrophes' };
  }
  return { valid: true };
}

function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' };
  }
  email = email.trim().toLowerCase();
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Please enter a valid email address' };
  }
  if (email.length > 100) {
    return { valid: false, message: 'Email must be less than 100 characters' };
  }
  return { valid: true };
}

// Helper function to normalize Excel column names
function normalizeColumnNames(data) {
  return data.map(row => {
    const normalizedRow = {};
    Object.keys(row).forEach(key => {
      const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '');
      let mappedKey = normalizedKey;
      
      // Handle common column name variations
      if (normalizedKey.includes('user') && normalizedKey.includes('name')) {
        mappedKey = 'username';
      } else if (normalizedKey.includes('pass')) {
        mappedKey = 'password';
      } else if (normalizedKey.includes('name') && !normalizedKey.includes('user')) {
        mappedKey = 'name';
      } else if (normalizedKey.includes('email') || normalizedKey.includes('mail')) {
        mappedKey = 'email';
      }
      
      normalizedRow[mappedKey] = row[key] ? String(row[key]).trim() : '';
    });
    return normalizedRow;
  });
}

// Main upload route
app.post('/uploaduserexcel', uploadUserExcel.single('excelFile'), async (req, res) => {
  let uploadedFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a valid Excel file.'
      });
    }

    uploadedFilePath = req.file.path;
    console.log('Processing user Excel file:', {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });

    // Read the Excel file
    let workbook;
    try {
      workbook = xlsx.readFile(uploadedFilePath);
    } catch (xlsxError) {
      console.error('Excel file read error:', xlsxError);
      return res.status(400).json({
        success: false,
        message: 'Invalid Excel file format. Please ensure the file is not corrupted.'
      });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Excel file: No sheets found in the uploaded file'
      });
    }

    const allData = {};

    try {
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        allData[sheetName] = sheetData;
      });
    } catch (sheetError) {
      console.error('Sheet parsing error:', sheetError);
      return res.status(400).json({
        success: false,
        message: 'Error parsing Excel sheets. Please check the file format.'
      });
    }

    // Check if all sheets are empty
    const isAllEmpty = Object.values(allData).every(sheet => sheet.length === 0);

    if (isAllEmpty) {
      return res.status(400).json({
        success: false,
        message: 'Empty file: The uploaded Excel file contains no data in any sheet.'
      });
    }

    // Get data from first sheet (or you can modify this to handle multiple sheets)
    const firstSheetName = workbook.SheetNames[0];
    let data = allData[firstSheetName];

    console.log(`Processing ${data.length} user records...`);

    // Normalize column names
    data = normalizeColumnNames(data);

    // Validate required columns
    const requiredColumns = ['username', 'password', 'name', 'email'];
    const firstRow = data[0];
    const availableColumns = Object.keys(firstRow || {});
    const missingColumns = requiredColumns.filter(col => !availableColumns.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingColumns.join(', ')}. Available columns: ${availableColumns.join(', ')}. Please ensure your Excel file contains: username, password, name, email`
      });
    }

    // Process users
    const results = {
      totalRecords: data.length,
      successCount: 0,
      updatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errors: [],
      duplicateUsernames: [],
      duplicateEmails: []
    };

    // Track duplicates within the file
    const usernamesInFile = new Set();
    const emailsInFile = new Set();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // Excel row number (accounting for header)

      try {
        let { username, password, name, email } = row;

        // Skip completely empty rows
        if (!username && !password && !name && !email) {
          results.skippedCount++;
          continue;
        }

        // Trim and normalize data
        username = username ? username.toString().trim() : '';
        password = password ? password.toString() : '';
        name = name ? name.toString().trim() : '';
        email = email ? email.toString().trim().toLowerCase() : '';

        // Check for duplicates within the file
        if (usernamesInFile.has(username)) {
          results.errors.push({
            row: rowNumber,
            field: 'username',
            value: username,
            message: 'Duplicate username found in file'
          });
          results.failedCount++;
          continue;
        }

        if (emailsInFile.has(email)) {
          results.errors.push({
            row: rowNumber,
            field: 'email',
            value: email,
            message: 'Duplicate email found in file'
          });
          results.failedCount++;
          continue;
        }

        // Add to tracking sets
        if (username) usernamesInFile.add(username);
        if (email) emailsInFile.add(email);

        // Validate each field
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
          results.errors.push({
            row: rowNumber,
            field: 'username',
            value: username,
            message: usernameValidation.message
          });
          results.failedCount++;
          continue;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          results.errors.push({
            row: rowNumber,
            field: 'password',
            message: passwordValidation.message
          });
          results.failedCount++;
          continue;
        }

        const nameValidation = validateName(name);
        if (!nameValidation.valid) {
          results.errors.push({
            row: rowNumber,
            field: 'name',
            value: name,
            message: nameValidation.message
          });
          results.failedCount++;
          continue;
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          results.errors.push({
            row: rowNumber,
            field: 'email',
            value: email,
            message: emailValidation.message
          });
          results.failedCount++;
          continue;
        }

        // Hash the password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Check if user already exists
        const existingUser = await User.findOne({ 
          $or: [
            { username: username },
            { email: email }
          ]
        });

        if (existingUser) {
          // Update existing user
          const updateData = {
            password: hashedPassword,
            name: name,
            updatedAt: new Date()
          };

          // Check if we need to update username or email
          if (existingUser.username !== username) {
            const usernameExists = await User.findOne({ 
              username: username,
              _id: { $ne: existingUser._id }
            });
            if (usernameExists) {
              results.errors.push({
                row: rowNumber,
                field: 'username',
                value: username,
                message: 'Username already exists for another user'
              });
              results.failedCount++;
              continue;
            }
            updateData.username = username;
          }

          if (existingUser.email !== email) {
            const emailExists = await User.findOne({ 
              email: email,
              _id: { $ne: existingUser._id }
            });
            if (emailExists) {
              results.errors.push({
                row: rowNumber,
                field: 'email',
                value: email,
                message: 'Email already exists for another user'
              });
              results.failedCount++;
              continue;
            }
            updateData.email = email;
          }
          
          await User.findByIdAndUpdate(existingUser._id, updateData);
          results.updatedCount++;
        } else {
          // Create new user
          const newUser = new User({
            username: username,
            password: hashedPassword,
            name: name,
            email: email,
            image: 'default.png',
            createdAt: new Date(),
            updatedAt: new Date()
          });

          await newUser.save();
          results.successCount++;
        }

      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        
        // Handle specific MongoDB errors
        if (error.code === 11000) {
          const field = Object.keys(error.keyPattern)[0];
          results.errors.push({
            row: rowNumber,
            field: field,
            message: `${field} already exists in database`
          });
        } else {
          results.errors.push({
            row: rowNumber,
            message: error.message || 'Unknown error occurred'
          });
        }
        results.failedCount++;
      }
    }

    // Update total records to exclude skipped rows
    results.totalRecords = results.totalRecords - results.skippedCount;

    // Clean up uploaded file
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }

    // Prepare response
    const processedRecords = results.successCount + results.updatedCount;
    const successRate = results.totalRecords > 0 ? 
      ((processedRecords) / results.totalRecords * 100).toFixed(1) : 0;
    
    let message = `Excel upload completed! ${successRate}% success rate.`;
    
    if (results.successCount > 0) {
      message += ` ${results.successCount} new users created.`;
    }
    if (results.updatedCount > 0) {
      message += ` ${results.updatedCount} existing users updated.`;
    }
    if (results.failedCount > 0) {
      message += ` ${results.failedCount} records failed validation.`;
    }
    if (results.skippedCount > 0) {
      message += ` ${results.skippedCount} empty rows skipped.`;
    }

    // Return appropriate status based on results
    if (results.failedCount === 0) {
      res.status(200).json({
        success: true,
        message: message,
        details: results
      });
    } else if (results.successCount === 0 && results.updatedCount === 0) {
      res.status(400).json({
        success: false,
        message: 'All records failed validation. Please check your data format.',
        details: results,
        errors: results.errors.slice(0, 20) // Send first 20 errors
      });
    } else {
      res.status(207).json({ // Multi-status
        success: true,
        message: message,
        details: results,
        errors: results.errors.slice(0, 20) // Send first 20 errors
      });
    }

  } catch (error) {
    console.error('Excel upload error:', error);
    
    // Clean up uploaded file on error
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process the uploaded Excel file'
    });
  }
});

// Route to export existing users
app.get('/download-users-excel', async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000; // Default limit
    const skip = (page - 1) * limit;

    // Fetch users from database with pagination
    const users = await User.find({}, 'username name email createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No users found to export'
      });
    }

    // Get total count for reference
    const totalUsers = await User.countDocuments();

    // Prepare data for Excel (exclude sensitive info like passwords)
    const exportData = users.map((user, index) => ({
      'S.No': (skip + index + 1),
      'Username': user.username,
      'Name': user.name,
      'Email': user.email,
      'Created Date': user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US') : 'N/A',
      'Last Updated': user.updatedAt ? new Date(user.updatedAt).toLocaleDateString('en-US') : 'N/A'
    }));

    // Create workbook and worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(exportData);

    // Set column widths
    worksheet['!cols'] = [
      { width: 8 },  // S.No
      { width: 15 }, // Username
      { width: 25 }, // Name
      { width: 30 }, // Email
      { width: 12 }, // Created Date
      { width: 12 }  // Last Updated
    ];

    // Add header styling
    const headerRow = 1;
    const headerCells = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'];
    headerCells.forEach(cell => {
      if (worksheet[cell]) {
        worksheet[cell].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "4472C4" } },
          color: { rgb: "FFFFFF" }
        };
      }
    });

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Users');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `users-export-${timestamp}-page${page}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Total-Count', totalUsers.toString());
    res.setHeader('X-Current-Page', page.toString());
    res.setHeader('X-Records-In-File', users.length.toString());

    // Send file
    res.send(buffer);

  } catch (error) {
    console.error('Users export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users data'
    });
  }
});

// Route to get upload statistics
app.get('/upload-stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayUsers = await User.countDocuments({
      createdAt: { $gte: todayStart }
    });

    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const weeklyUsers = await User.countDocuments({
      createdAt: { $gte: lastWeekStart }
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        todayUsers,
        weeklyUsers,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum allowed size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Please use "excelFile" as the field name.'
      });
    }
  }
  
  if (error.message === 'Only Excel files (.xlsx, .xls) are allowed') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Optional: Route to clear all users (for testing purposes)
app.delete('/clear-all-users', async (req, res) => {
  try {
    // Add authentication/authorization check here in production
    const result = await User.deleteMany({});
    res.json({
      success: true,
      message: `${result.deletedCount} users deleted successfully`
    });
  } catch (error) {
    console.error('Clear users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear users'
    });
  }
});

module.exports = app;


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));