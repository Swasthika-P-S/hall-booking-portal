const mongoose = require("mongoose");
const MONGO_URI = "mongodb+srv://amrita:amma123@amrita.gavaw.mongodb.net/combined_portal?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("Error connecting to MongoDB:", err));
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", userSchema);
async function removeUser(username) {
  try {
    const result = await User.deleteOne({ username });
    if (result.deletedCount > 0) {
      console.log(`User "${username}" removed successfully.`);
    } else {
      console.log(`User "${username}" not found.`);
    }
  } catch (error) {
    console.error("Error removing user:", error);
  }
}
removeUser("admin")
  .then(() => mongoose.disconnect())
  .catch(err => console.error(err));
