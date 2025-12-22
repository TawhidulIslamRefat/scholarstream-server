const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;
const jwt = require("jsonwebtoken");

/* middleWare */
app.use(cors());
app.use(express.json());

// Verify Token
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

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
    // await client.connect();

    const db = client.db("scholarstream-db");
    const userCollection = db.collection("users");
    const scholarshipCollection = db.collection("scholarships");
    const reviewsCollection = db.collection("reviews");
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");
    /* middleWare*/
    // JWT
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyModerator = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });

      if (!user || user.role !== "Moderator") {
        return res.status(403).send({ message: "Forbidden - Moderator only" });
      }

      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });

      if (!user || user.role !== "Admin") {
        return res.status(403).send({ message: "Forbidden - Admin only" });
      }

      next();
    };

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

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/users/role/:id", verifyJWT, verifyAdmin, async (req, res) => {
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
        const {
          search,
          scholarshipCategory,
          subjectCategory,
          location,
          sort,
          page = 1,
          limit = 9,
        } = req.query;

        let query = {};

        if (search) {
          query.$or = [
            { scholarshipName: { $regex: search, $options: "i" } },
            { universityName: { $regex: search, $options: "i" } },
            { degree: { $regex: search, $options: "i" } },
          ];
        }

        if (scholarshipCategory)
          query.scholarshipCategory = scholarshipCategory;
        if (subjectCategory) query.subjectCategory = subjectCategory;
        if (location) query.location = location;

        let sortOption = {};
        if (sort === "fee_asc") sortOption.applicationFees = 1;
        if (sort === "fee_desc") sortOption.applicationFees = -1;
        if (sort === "date_desc") sortOption.scholarshipPostDate = -1;

        const skip = (page - 1) * limit;

        const total = await scholarshipCollection.countDocuments(query);

        const result = await scholarshipCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        res.send({
          total,
          result,
        });
      } catch (error) {
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

    app.post("/scholarships", verifyJWT, async (req, res) => {
      const newScholarship = req.body;
      const result = await scholarshipCollection.insertOne(newScholarship);
      res.send(result);
    });

    app.delete("/scholarships/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/scholarships/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const query = { _id: id || new ObjectId(id) };

        const update = {
          $set: {
            scholarshipName: updatedData.scholarshipName,
            scholarshipDescription: updatedData.scholarshipDescription,
            stipendCoverage: updatedData.stipendCoverage,
            universityName: updatedData.universityName,
            universityImage: updatedData.universityImage,
            universityCountry: updatedData.universityCountry,
            universityCity: updatedData.universityCity,
            universityWorldRank:
              updatedData.universityWorldRank !== undefined
                ? Number(updatedData.universityWorldRank)
                : undefined,
            subjectCategory: updatedData.subjectCategory,
            scholarshipCategory: updatedData.scholarshipCategory,
            degree: updatedData.degree,
            tuitionFees:
              updatedData.tuitionFees !== undefined
                ? Number(updatedData.tuitionFees)
                : 0,
            applicationFees:
              updatedData.applicationFees !== undefined
                ? Number(updatedData.applicationFees)
                : 0,
            serviceCharge:
              updatedData.serviceCharge !== undefined
                ? Number(updatedData.serviceCharge)
                : 0,
            applicationDeadline: updatedData.applicationDeadline,
            scholarshipPostDate: updatedData.scholarshipPostDate,
            postedUserEmail: updatedData.postedUserEmail,
            location: updatedData.universityCountry || updatedData.location,
          },
        };

        const result = await scholarshipCollection.updateOne(query, update);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Scholarship not found" });
        }

        res.send({ message: "Updated successfully", result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    //  Review Api
    app.post("/reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.delete("/reviews/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await reviewsCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    app.patch("/reviews/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { comment, rating } = req.body;

      const result = await reviewsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            comment,
            rating,
            updatedAt: new Date(),
          },
        }
      );

      res.send(result);
    });

    app.get("/reviews/:scholarshipId", async (req, res) => {
      const scholarshipId = req.params.scholarshipId;
      const result = await reviewsCollection.find({ scholarshipId }).toArray();
      res.send(result);
    });

    app.get("/reviewsByName/:scholarshipName", async (req, res) => {
      try {
        const name = req.params.scholarshipName;
        const reviews = await reviewsCollection
          .find({ scholarshipName: name })
          .toArray();
        res.send(reviews);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch reviews", error: err });
      }
    });

    // Application related API
    app.post("/applications", verifyJWT, async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    app.get("/applications", verifyJWT, verifyModerator, async (req, res) => {
      try {
        const result = await applicationsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching applications", error });
      }
    });

    app.get("/applications/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await applicationsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Application not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching application", error });
      }
    });

    app.get("/applications/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = {
        applicantEmail: email,
      };
      try {
        const result = await applicationsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching applications", error });
      }
    });

    app.patch("/applications/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updates = req.body;

      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updates }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Application not found" });
        }

        res.send({ message: "Application updated successfully", result });
      } catch (error) {
        res.status(500).send({ message: "Error updating application", error });
      }
    });

    app.delete("/applications/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await applicationsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Application not found" });
        }

        res.send({ message: "Application deleted successfully" });
      } catch (error) {
        res.status(500).send({ message: "Error deleting application", error });
      }
    });

    // payment
    app.post("/create-checkout-session", verifyJWT, async (req, res) => {
      const {
        applicationFees,
        applicationId,
        applicantEmail,
        scholarshipName,
        universityName,
      } = req.body;

      if (!applicationId) {
        return res.status(400).send({ message: "applicationId missing" });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: parseInt(applicationFees) * 100,
                product_data: { name: scholarshipName },
              },
              quantity: 1,
            },
          ],
          customer_email: applicantEmail,
          metadata: {
            applicationId,
            scholarshipName,
            universityName,
          },
          mode: "payment",
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${
            process.env.SITE_DOMAIN
          }/dashboard/payment-failed?scholarshipName=${encodeURIComponent(
            scholarshipName
          )}`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe checkout error:", error);
        res.status(500).send({
          message: "Failed to create checkout session",
          error: error.message,
        });
      }
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ message: "Session ID missing" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ message: "Payment not successful" });
        }

        const applicationId = session.metadata.applicationId;

        const application = await applicationsCollection.findOne({
          _id: new ObjectId(applicationId),
        });
        if (!application) {
          return res.status(404).send({ message: "Application not found" });
        }

        let scholarshipName = null;
        let scholarship = null;
        if (application.scholarshipId) {
          scholarship = await scholarshipCollection.findOne({
            _id: new ObjectId(application.scholarshipId),
          });
          if (scholarship) scholarshipName = scholarship.scholarshipName;
        }

        await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          {
            $set: {
              paymentStatus: "paid",
              applicationStatus: "pending",
            },
          }
        );

        const transactionId = session.payment_intent || session.id;

        await paymentsCollection.updateOne(
          { transactionId },
          {
            $set: {
              applicationId,
              scholarshipName: session.metadata.scholarshipName || "N/A",
              universityName: session.metadata.universityName || "N/A",
              amount: session.amount_total / 100,
              currency: session.currency,
              customerEmail: session.customer_email,
              paymentStatus: "paid",
              paidAt: new Date(),
            },
          },
          { upsert: true }
        );

        const paymentRecord = await paymentsCollection.findOne({
          transactionId,
        });

        res.send({
          success: true,
          message: "Payment successful & recorded",
          payment: {
            scholarshipName: paymentRecord.scholarshipName,
            universityName: paymentRecord.universityName,
            amount: paymentRecord.amount,
            currency: paymentRecord.currency,
          },
        });
      } catch (error) {
        console.error("Payment success error:", error);
        res.status(500).send({
          message: "Payment verification failed",
          error: error.message,
        });
      }
    });

    app.get("/payment-failed", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res.status(400).send({ message: "Session ID missing" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        let scholarshipName = null;
        if (session.metadata && session.metadata.applicationId) {
          const application = await applicationsCollection.findOne({
            _id: new ObjectId(session.metadata.applicationId),
          });
          if (application) {
            const scholarship = await scholarshipCollection.findOne({
              _id: new ObjectId(application.scholarshipId),
            });
            if (scholarship) scholarshipName = scholarship.scholarshipName;
          }
        }

        res.send({
          success: false,
          scholarshipName,
          message: "Payment failed or canceled",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          scholarshipName: "N/A",
          message: "Error fetching payment info",
          error: error.message,
        });
      }
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      try {
        const result = await paymentsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching applications", error });
      }
    });

    // Analytics API
    app.get("/analytics", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalScholarships = await scholarshipCollection.countDocuments();

        const payments = await paymentsCollection
          .find({ paymentStatus: "paid" })
          .toArray();
        const totalFeesCollected = payments.reduce(
          (acc, curr) => acc + (curr.amount || 0),
          0
        );

        const pipeline = [
          {
            $group: {
              _id: {
                $ifNull: ["$scholarshipCategory", "Unknown"],
              },
              count: { $sum: 1 },
            },
          },
        ];
        const applicationsPerCategory = await applicationsCollection
          .aggregate(pipeline)
          .toArray();

        res.send({
          totalUsers,
          totalScholarships,
          totalFeesCollected,
          applicationsPerCategory,
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ message: "Error fetching analytics data", error });
      }
    });

    // await client.db("admin").command({ ping: 1 });
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
