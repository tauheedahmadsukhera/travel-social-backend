const mongoose = require('mongoose');
const highlightController = require('../src/controllers/highlightController');
require('../src/models/Highlight');
require('../src/models/Story');
require('../src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to DB");

    // 1. Create a dummy highlight to use
    const Highlight = mongoose.model('Highlight');
    const dummyHl = new Highlight({
      userId: "6956afd36d2fa5db6bdb2909",
      title: "Test Temp Highlight",
      coverImage: "https://example.com/cover.jpg",
      stories: [],
      items: []
    });
    await dummyHl.save();
    const highlightId = String(dummyHl._id);
    console.log("✅ Dummy Highlight created:", highlightId);

    const res = {
      statusCode: 200,
      status: function(code) {
        this.statusCode = code;
        console.log("Response status called:", code);
        return this;
      },
      json: function(data) {
        console.log("Response JSON called:", JSON.stringify(data, null, 2));
        return this;
      }
    };

    // Test Case 2a: Standard addStoryToHighlight payload
    console.log("\n--- Test Case 2a: Standard addStoryToHighlight ---");
    const req2a = {
      params: { id: highlightId },
      body: {
        storyId: "65f1a234567890abcdef0124",
        storySnapshot: {
          id: "65f1a234567890abcdef0124",
          imageUrl: "https://example.com/story2.jpg"
        }
      }
    };
    await highlightController.addStoryToHighlight(req2a, res);

    // Test Case 2b: addStoryToHighlight with missing storyId in body but inside snapshot
    console.log("\n--- Test Case 2b: addStoryToHighlight with storyId missing in body root but present in snapshot ---");
    const req2b = {
      params: { id: highlightId },
      body: {
        storySnapshot: {
          id: "65f1a234567890abcdef0125",
          storyId: "65f1a234567890abcdef0125",
          imageUrl: "https://example.com/story3.jpg"
        }
      }
    };
    await highlightController.addStoryToHighlight(req2b, res);

    // Test Case 2c: addStoryToHighlight with completely missing storyId
    console.log("\n--- Test Case 2c: addStoryToHighlight with completely missing storyId ---");
    const req2c = {
      params: { id: highlightId },
      body: {
        storySnapshot: {
          imageUrl: "https://example.com/story4.jpg"
        }
      }
    };
    await highlightController.addStoryToHighlight(req2c, res);

    // Clean up
    await Highlight.deleteOne({ _id: dummyHl._id });
    console.log("✅ Dummy Highlight deleted");

  } catch (err) {
    console.error("Error in test script:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from DB");
    process.exit(0);
  }
}

run();
