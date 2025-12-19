const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;

/* middleWare */
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fcwgrle.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("scholarstream-db");
    const userCollection = db.collection("users");
    const scholarshipCollection = db.collection("scholarships");
    const reviewsCollection = db.collection("reviews");
    const applicationsCollection = db.collection("applications");

    /* User related Api */
    app.post("/users", async (req, res) => {
      const { name, email, photo } = req.body;

      let role = "Student";

      if (email === process.env.ADMIN_EMAIL) {
        role = "Admin";
      }
      const newUser = {
        name,
        email,
        photo,
        role,
        createdAt: new Date(),
      };

      const existingUser = await userCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/users/role/:id", async (req, res) => {
      const targetId = req.params.id; // MongoDB ObjectId
      const { role } = req.body; // নতুন role: "Admin" / "Moderator"

      // 1️⃣ Verify requester (SuperAdmin only)
      const requesterEmail = req.headers["x-user-email"]; // frontend থেকে পাঠানো
      const requester = await userCollection.findOne({ email: requesterEmail });

      if (!requester || requester.role !== "SuperAdmin") {
        return res
          .status(403)
          .send({ message: "Only SuperAdmin can change roles" });
      }

      // 2️⃣ Prevent changing SuperAdmin role
      const targetUser = await userCollection.findOne({
        _id: new ObjectId(targetId),
      });
      if (!targetUser) {
        return res.status(404).send({ message: "User not found" });
      }
      if (targetUser.email === process.env.SUPER_ADMIN_EMAIL) {
        return res
          .status(403)
          .send({ message: "Cannot change SuperAdmin role" });
      }

      const result = await userCollection.updateOne(
        { _id: new ObjectId(targetId) },
        { $set: { role } }
      );

      res.send({ message: "Role updated successfully", result });
    });

    app.patch("/users/role/:id", async (req, res) => {
      const targetId = req.params.id;
      const { role } = req.body;

      const requesterEmail = req.headers["x-user-email"];
      const requester = await userCollection.findOne({ email: requesterEmail });

      if (!requester || requester.role !== "Admin") {
        return res.status(403).send({ message: "Only Admin can change roles" });
      }

      const targetUser = await userCollection.findOne({
        _id: new ObjectId(targetId),
      });
      if (!targetUser) {
        return res.status(404).send({ message: "User not found" });
      }
      if (targetUser.email === process.env.ADMIN_EMAIL) {
        return res.status(403).send({ message: "Cannot change Admin role" });
      }
      const result = await userCollection.updateOne(
        { _id: new ObjectId(targetId) },
        { $set: { role } }
      );

      res.send({ message: "Role updated successfully", result });
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });

      if (!user) {
        return res.send({ role: "Student" });
      }

      res.send({ role: user.role });
    });

    // Scholarship related APIs
    app.get("/scholarships", async (req, res) => {
      try {
        const { search, scholarshipCategory, subjectCategory, location } =
          req.query;

        let query = {};
        if (search) {
          query.$or = [
            { scholarshipName: { $regex: search, $option: "i" } },
            { universityName: { $regex: search, $option: "i" } },
            { degree: { $regex: search, $option: "i" } },
          ];
        }
        if (scholarshipCategory) {
          query.scholarshipCategory = scholarshipCategory;
        }
        if (subjectCategory) {
          query.subjectCategory = subjectCategory;
        }
        if (location) {
          query.location = location;
        }

        const result = await scholarshipCollection.find(query).toArray();

        res.send(result);
      } catch {
        res.status(500).send({ message: "Server Error", error });
      }
    });

    app.get("/scholarships/:id", async (req, res) => {
      const id = req.params.id;

      let result = null;

      if (ObjectId.isValid(id)) {
        result = await scholarshipCollection.findOne({ _id: new ObjectId(id) });
      }

      if (!result) {
        result = await scholarshipCollection.findOne({ _id: id });
      }

      if (!result) {
        return res.status(404).send({ message: "Scholarship Not Found" });
      }
      res.send(result);
    });

    app.get("/top-scholarships", async (req, res) => {
      const result = await scholarshipCollection.find().toArray();
      res.send(result);
    });

    app.get("/scholarships", async (req, res) => {
      const result = await scholarshipCollection.find().toArray();
      res.send(result);
    });

    app.post("/scholarships", async (req, res) => {
      const newScholarship = req.body;
      const result = await scholarshipCollection.insertOne(newScholarship);
      res.send(result);
    });

    app.delete("/scholarships/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/scholarships/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(id) };

      const updateFields = {
        ...updatedData,
      };

      if (updatedData.universityWorldRank !== undefined) {
        updateFields.universityWorldRank = Number(
          updatedData.universityWorldRank
        );
      }

      if (updatedData.tuitionFees !== undefined) {
        updateFields.tuitionFees = Number(updatedData.tuitionFees) || 0;
      }

      if (updatedData.applicationFees !== undefined) {
        updateFields.applicationFees = Number(updatedData.applicationFees);
      }

      if (updatedData.serviceCharge !== undefined) {
        updateFields.serviceCharge = Number(updatedData.serviceCharge);
      }

      if (updatedData.universityCountry) {
        updateFields.location = updatedData.universityCountry;
      }

      const updateDoc = {
        $set: updateFields,
      };

      const result = await scholarshipCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    //  rating Api
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/reviews/:scholarshipId", async (req, res) => {
      const scholarshipId = req.params.scholarshipId;
      const result = await reviewsCollection.find({ scholarshipId }).toArray();
      res.send(result);
    });

    // Application related API
    app.post("/applications", async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

/* server API */
app.get("/", (req, res) => {
  res.send("scholarstream-server is running");
});

app.listen(port, () => {
  console.log(`scholarstream-server is running on port :${port}`);
});
