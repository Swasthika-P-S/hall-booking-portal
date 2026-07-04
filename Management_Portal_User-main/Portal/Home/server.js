const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors = require("cors");
const moment = require('moment');
const app = express();
app.use(express.json());
app.use(cors());
// Middleware setup
app.use(cookieParser());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const nodemailer = require("nodemailer");

// MongoDB connection
mongoose
  .connect('mongodb+srv://amrita:amma123@amrita.gavaw.mongodb.net/combined_portal', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "portalamrita@gmail.com",      
    pass: "oxao harq uehm vkfe",             
  },
});
// Mongoose Schemas and Models
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
});

const imageSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  data: Buffer,
  contentType: String,
});

const bookingSchema = new mongoose.Schema({
  venue: String,
  date: String,
  startTime: String,
  endTime: String,
  message: String,
  userEmail: { type: String, required: true },
  bookingTime: { type: Date, default: Date.now },
}); 

const classformcreSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  courseCode: { type: String, required: true },
  instructor: { type: String, required: true },
  day: { type: String, required: true },
  slots: [
    {
      slot: String,
      time: String,
      status: String,
    },
  ],
  location: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
});

const classBookerEaseSchema = new mongoose.Schema({
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
const LocationSchema = new mongoose.Schema({
  location: { type: String, required: true },
  floor: { type: String, required: true },
  capacity: { type: Number, required: true }
}, { collation: { locale: 'en', strength: 2 }, unique: true });

LocationSchema.index({ location: 1, floor: 1 }, { unique: true });

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
const User = mongoose.model('User', userSchema);
const Image = mongoose.model('Image', imageSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const ClassFormCre = mongoose.model('ClassFormCre', classformcreSchema);
const classbookering = mongoose.model("ClassBookerEase", classBookerEaseSchema);
const locationrefere = mongoose.model('Location', LocationSchema);
// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper function to convert time to HH:MM AM/PM format
function convertTo12HourFormat(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hour);
  date.setMinutes(minute);

  const options = { hour: '2-digit', minute: '2-digit', hour12: true };
  return date.toLocaleTimeString([], options); // Returns time in HH:MM AM/PM
}

// Middleware to check authentication
function authenticate(req, res, next) {
  const { userName, userEmail } = req.cookies;
  if (!userName || !userEmail) return res.redirect('/');
  next();
}

// Routes

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'LoginPage.html'));
});

// User login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.redirect('/?error=Username does not exist. Please try again.');

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      res.cookie('userName', user.name, { maxAge: 3600000, path: '/' });
      res.cookie('userEmail', user.email, { maxAge: 3600000, path: '/' });
      res.redirect('/homepage');
    } else {
      res.redirect('/?error=Incorrect password. Please try again.');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.redirect('/?error=Internal Server Error. Please try again later.');
  }
});

// Homepage route
app.get('/homepage', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Booking page route
app.get('/booking', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'Booking.html'));
});

app.get('/forall', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'forall.html'));
});

app.get('/hall', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'hallcomine.html'));
});

// Submit booking route
// Submit booking route using UserBooking
// app.post("/submit-booking", async (req, res) => {
//   try {
//     const { userEmail, venue, date, startTime, endTime, message } = req.body;

//     if (!userEmail || !venue || !date || !startTime || !endTime || !message) {
//       return res.status(400).json({ error: "All fields are required!" });
//     }

//     const formattedStartTime = startTime;
//     const formattedEndTime = endTime;

//     const existingBooking = await UserBooking.findOne({
//       venue,
//       date,
//       $or: [
//         {
//           startTime: { $lt: formattedEndTime },
//           endTime: { $gt: formattedStartTime },
//         },
//       ],
//     });

//     if (existingBooking) {
//       return res.status(400).json({ error: "Conflict: This slot is already booked!" });
//     }

//     const newBooking = new UserBooking({
//       userEmail,
//       venue,
//       date,
//       startTime,
//       endTime,
//       message,
//       status: 'pending', 
//     });

//     await newBooking.save();

//     res.status(200).json({ message: "Booking successfully saved!" });
//   } catch (error) {
//     console.error("🔴 Error saving booking:", error);
//     res.status(500).json({ error: "Failed to save booking." });
//   }
// });
app.post("/submit-booking", async (req, res) => {
  try {
    const { userEmail, venue, date, startTime, endTime, message } = req.body;

    if (!userEmail || !venue || !date || !startTime || !endTime || !message) {
      return res.status(400).json({ error: "All fields are required!" });
    }

    const existingBooking = await UserBooking.findOne({
      venue,
      date,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        },
      ],
    });

    if (existingBooking) {
      return res.status(400).json({ error: "Conflict: This slot is already booked!" });
    }

    const newBooking = new UserBooking({
      userEmail,
      venue,
      date,
      startTime,
      endTime,
      message,
      status: 'pending',
    });

    await newBooking.save();

    // Send admin email alert
    const mailOptions = {
      from: '"Booking System" <your-email@gmail.com>',
      to: "keshavs100605@gmail.com",
      subject: "New Booking Request Submitted",
      html: `
        <h2>New Booking Submitted</h2>
        <p><strong>User:</strong> ${userEmail}</p>
        <p><strong>Venue:</strong> ${venue}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Time:</strong> ${startTime} to ${endTime}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p>Please log in to approve or reject the request.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Booking saved and admin notified!" });
  } catch (error) {
    console.error("🔴 Error during booking:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
});
const quotes = [
  { content: "Love is our true essence. This love should be awakened in every person.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "Compassion is the language the deaf can hear and the blind can see.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "The first step in spiritual life is to have the darshan of your own true self.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "In this universe, everything has a purpose. The invisible intelligence behind everything is what we call God.", author: "Sri Mata Amritanandamayi Devi" },
  { content: "Happiness depends on how we react to external circumstances.", author: "Sri Mata Amritanandamayi Devi" }
];

app.get('/api/quote', (req, res) => {
  const randomIndex = Math.floor(Math.random() * quotes.length);
  res.json(quotes[randomIndex]);
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
app.get('/api/bookings/upcoming', async (req, res) => {
  try {
    const { venue } = req.query;

    if (!venue) {
      return res.status(400).json({ error: "Venue is required" });
    }

    const today = new Date().toISOString().split('T')[0];

    const bookings = await Booking.find({
      venue: { $regex: `^${venue}$`, $options: 'i' }, // case-insensitive exact match
      date: { $gte: today }
    });

    res.json({ bookings });
  } catch (error) {
    res.status(500).json({ error: "Server error fetching bookings" });
  }
});
app.get('/api/bookings/pending', async (req, res) => {
  try {
    const { venue } = req.query;
    if (!venue) return res.status(400).json({ error: 'Venue is required' });

    const today = new Date().toISOString().split('T')[0];

    const bookings = await UserBooking.find({
      venue,
      date: { $gte: today },
      status: 'pending'
    }).sort({ date: 1, startTime: 1 });

    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/filtered-bookings', authenticate, async (req, res) => {
  const { venue, date } = req.query;
  try {
    const query = {};
    if (venue && venue !== 'all') {
      query.venue = venue;
    }
    if (date) {
      query.date = date;
    }
    const bookings = await Booking.find(query).select('venue date startTime endTime message -_id');
    const formattedBookings = bookings.map(booking => ({
      ...booking.toObject(),
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching filtered bookings:', error);
    res.status(500).json({ error: 'Failed to fetch filtered bookings' });
  }
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

// Get image by name API route
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

// Route to serve classformcre.html
app.get('/createclass', (req, res) => {
  res.sendFile(path.join(__dirname, 'classformcre.html'));
});
// Route to serve obldkook.html
app.get('/bookclass', (req, res) => {
  res.sendFile(path.join(__dirname, 'obldkook.html'));
});
// Route to serve finaldisplayer.html
app.get('/class', (req, res) => {
  res.sendFile(path.join(__dirname, 'finaldisplayer.html'));
});
// Route to serve locationbooker.html
app.get('/locationbooker', (req, res) => {
  res.sendFile(path.join(__dirname, 'locationbooker.html'));
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
// 📌 **Updated: Endpoint to Fetch Booked Slots by Location & Date**
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
// Add this endpoint to your server code
app.get('/get-user', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email }).select('name username -_id');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});
// 📌 **Updated: Endpoint to Add a Class Booking**
app.post("/add-classbookerease", async (req, res) => {
  try {
    const { instructor, location, date, day, slots, description } = req.body;

    const formattedDate = new Date(date).toISOString().split("T")[0];

    const newBooking = new classbookering({
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
app.post('/add-location', async (req, res) => {
  try {
    const { location, floor, capacity } = req.body;

    if (!location || !floor || capacity === undefined) {
      return res.status(400).json({ error: "Location, Floor, and Capacity are required" });
    }

    const newLocation = new locationrefere({ location, floor, capacity });
    await newLocation.save();
    res.status(201).json({ message: "Location added successfully" });

  } catch (error) {
    console.error("Error adding location:", error); // Log full error
    if (error.code === 11000) {
      return res.status(400).json({ error: "This location already exists" });
    }
    res.status(500).json({ error: error.message || "Error adding location" });
  }
});

// ➤ Remove a location
app.post('/remove-location', async (req, res) => {
  try {
    const { location, floor } = req.body;
    if (!location || !floor) {
      return res.status(400).json({ error: 'Location and Floor are required' });
    }
    const result = await locationrefere.findOneAndDelete({ location, floor });
    if (result) {
      res.json({ message: 'Location deleted successfully' });
    } else {
      res.status(404).json({ error: 'Location not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error deleting location' });
  }
});

// ➤ Fetch all locations and floors
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
// Add this to your backend (Node.js)
// Update your server endpoint to query classbookering collection
app.get('/get-booking-details', async (req, res) => {
    try {
        const { date, slot, location } = req.query;
        
        if (!date || !slot || !location) {
            return res.status(400).json({ message: "Date, slot and location are required" });
        }

        // Convert date to proper format
        const formattedDate = new Date(date).toISOString().split("T")[0];
        
        const booking = await classbookering.findOne({ 
            location,
            date: { $gte: new Date(formattedDate), $lt: new Date(formattedDate + "T23:59:59.999Z") },
            "slots.slot": slot 
        }).lean();
        
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }
        
        // Format the response to match what the frontend expects
        const response = {
            instructor: booking.instructor,
            location: booking.location,
            date: booking.date,
            day: booking.day,
            slot: slot,
            description: booking.description || "No description provided"
        };
        
        res.json(response);
    } catch (error) {
        console.error("Error fetching booking details:", error);
        res.status(500).json({ message: "Error fetching booking details", error: error.message });
    }
});
app.get("/get-available-locations", async (req, res) => {
  try {
    const { date, slot } = req.query;

    if (!date || !slot) {
      return res.status(400).json({ message: "Date and slot are required!" });
    }

    // Convert date to the correct format
    const formattedDate = new Date(date).toISOString().split("T")[0];

    // Get all booked locations for the given date and slot
    const bookedClasses = await classbookering.find({
      date: { $gte: new Date(formattedDate), $lt: new Date(formattedDate + "T23:59:59.999Z") },
      "slots.slot": slot,
    }).select("location");

    // Extract booked locations
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
// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));