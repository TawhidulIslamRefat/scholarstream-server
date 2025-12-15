const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "user already exits.do not need to insert again" });
      } else {
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      }
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

    // Scholarship related APIs
    app.get('/scholarships', async (req,res) =>{
      try{
        const {
          search,
          scholarshipCategory,
          subjectCategory,
          location
        } = req.query;

        let query = {};
        if (search) {
          query.$or = [
            {scholarshipName:{$regex : search, $option:"i"}},
            {universityName:{$regex : search, $option:"i"}},
            {degree:{$regex : search, $option:"i"}},
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
      }catch{
        res.status(500).send({message:"Server Error", error})
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


    app.post("/scholarships", async (req, res) => {
      const newScholarship = req.body;
      const result = await scholarshipCollection.insertOne(newScholarship);
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
