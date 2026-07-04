const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const MONGO_URI = "mongodb+srv://amrita:amma123@amrita.gavaw.mongodb.net/combined_portal?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.log("Error connecting to MongoDB Atlas:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true }
});

const User = mongoose.model("User", userSchema);

async function addUser(username, password, name, email) {
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({
      username: username,
      password: hashedPassword,
      name: name,
      email: email
    });
    await newUser.save();
    console.log("User added successfully:", username);
  } catch (error) {
    console.error("Error adding user:", error);
  }
}
addUser("admin", "admin@123", "Keshav", "keshav@example.com")
  .then(() => mongoose.disconnect())
  .catch(err => console.error(err));
