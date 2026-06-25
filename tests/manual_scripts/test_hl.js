const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/social-app').then(async () => {
  const Highlight = require('./models/Highlight');
  const Story = require('./models/Story');
  
  const highlights = await Highlight.find().lean();
  console.log('Highlights count:', highlights.length);
  
  if (highlights.length > 0) {
    const hl = highlights[highlights.length - 1];
    console.log('Latest highlight:', hl);
    
    const storyIds = hl.items?.length > 0 ? hl.items : hl.stories;
    console.log('Story IDs to fetch:', storyIds);
    
    // Mongoose expects ObjectIds in $in for ObjectId fields, but if it's strings, it might cast them
    // Let's filter to valid ObjectIds first
    const validIds = storyIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    console.log('Valid IDs:', validIds);
    
    const storiesArray = await Story.find({ _id: { $in: validIds } }).lean();
    console.log('Fetched stories:', storiesArray);
  }
  
  process.exit();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
