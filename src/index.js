const express = require('express');
const app = express();
const port = 5000;
const cors = require('cors');
const fs = require('fs');
const ObjectId = require('mongodb').ObjectId;
const nodemailer = require('nodemailer');

//Middlewares
app.use(cors());
app.use(express.json());

//Mongo connection
const { MongoClient } = require('mongodb');

async function main() {
	const uri =
		'mongodb+srv://diegob:diegobpassword@cluster0.ghjxtwc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
	const client = new MongoClient(uri, {});

	try {
		await client.connect();
		console.log('Connected to MongoDB Atlas');
		// Keep the connection open here
		app.locals.client = client;
	} catch (e) {
		console.error('Error connecting to MongoDB Atlas:', e);
		process.exit(1);
	}
}

main().catch(console.error);

//nodemailer settings
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: 'potenciapanadera@gmail.com',
		pass: 'disc xkgw kceb iiyg ',
	},
});

//API Routes
app.get('/', (req, res) => res.json({ message: 'Hello World!' }));

const multer = require('multer');
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'uploads/');
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname);
	},
});
const upload = multer({ storage: storage });

const cloudinary = require('cloudinary').v2;
cloudinary.config({
	cloud_name: 'djdwvjmpr',
	api_key: '297153838963993',
	api_secret: 'gVnd-ifaeI8YsiB4F2hruEtoZwQ',
});

app.post('/uploadExcelFile', upload.single('uploadfile'), async (req, res) => {
	try {
		const result = await cloudinary.uploader.upload(req.file.path, {
			resource_type: 'raw',
			public_id: req.file.originalname,
		});
		const fileUrl = result.secure_url;
		const fileId = new ObjectId().toString(); // Generate a new MongoDB ObjectId

		const db = req.app.locals.client.db('curriculums');
		const collection = db.collection('excelsheets');

		// Insert the file URL and ID into MongoDB
		const insertResult = await collection.insertOne({
			_id: fileId,
			url: fileUrl,
			filename: req.file.originalname,
		});

		// Delete the file from the upload directory
		fs.unlink(req.file.path, (err) => {
			if (err) {
				console.error('Error deleting file:', err);
				res.status(500).send('Error deleting file');
			} else {
				console.log('File deleted from upload directory');
				res.send({
					message: 'File uploaded successfully and deleted from server',
					fileId: fileId,
				});
			}
		});
	} catch (error) {
		console.error('Upload error:', error);
		res.status(500).send('Upload error');
	}
});

app.get('/excelsheets', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const collection = db.collection('excelsheets');

		// Query the collection to retrieve data
		const data = await collection.find({}).toArray(); // Retrieve all documents from collection

		// Send retrieved data as response
		res.json(data);
	} catch (error) {
		console.error('Error retrieving data:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

async function deleteFile(fileId) {
	try {
		const db = app.locals.client.db('curriculums');
		const collection = db.collection('excelsheets');
		await collection.deleteOne({ _id: fileId });

		// Delete file from Cloudinary
		const result = await cloudinary.uploader.destroy(fileId); // Assuming fileId is the public_id of the file in Cloudinary

		console.log('File deleted successfully from both MongoDB and Cloudinary');
		return true;
	} catch (error) {
		console.error('Error deleting file:', error);
		return false;
	}
}

app.delete('/deleteFile/:fileId', async (req, res) => {
	const fileId = req.params.fileId;

	try {
		const deleted = await deleteFile(fileId);
		if (deleted) {
			res.json({
				message: 'File deleted successfully from both MongoDB and Cloudinary',
			});
		} else {
			res.status(500).json({ error: 'Failed to delete file' });
		}
	} catch (error) {
		console.error('Error deleting file:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//Trello routes
app.post('/api/boards', async (req, res) => {
	try {
		const { name, gradient } = req.body;

		// Check if the name is empty
		if (!name || name.trim().length === 0) {
			return res.status(400).json({ error: 'Board name must not be empty' });
		}

		const db = req.app.locals.client.db('curriculums');
		const boardsCollection = db.collection('boards');
		const listsCollection = db.collection('lists');

		// Create default lists
		const defaultListsData = [
			{ listName: 'Tasks', position: 1 },
			{ listName: 'In Process', position: 2 },
			{ listName: 'Done', position: 3 },
		];

		// Insert default lists into the 'lists' collection
		const insertedLists = await listsCollection.insertMany(defaultListsData);

		// Check the result of insertMany operation
		if (!insertedLists || !insertedLists.insertedIds) {
			console.error('Error: Invalid result from insertMany operation');
			return res.status(500).json({ error: 'Database operation error' });
		}

		// Extract the IDs of the inserted lists
		const listIds = Object.values(insertedLists.insertedIds);

		// Create a new board with references to the default lists
		const boardData = {
			_id: new ObjectId(),
			boardName: name,
			boardGradient: gradient,
			lists: listIds, // Store references to the lists
		};

		// Insert the board into the 'boards' collection
		const result = await boardsCollection.insertOne(boardData);

		res
			.status(201)
			.json({ message: 'Board created successfully', data: result[0] });
	} catch (error) {
		console.error('Error creating board:', error);
		if (error.code === 11000) {
			// Duplicate key error
			return res.status(409).json({ error: 'Board name already exists' });
		}
		res.status(500).json({ error: 'Error creating board: ' + error.message });
	}
});

app.get('/api/boards', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const collection = db.collection('boards');

		// Query the collection to retrieve all boards
		const data = await collection.find({}).toArray();

		// Send retrieved data as response
		res.json(data);
	} catch (error) {
		console.error('Error retrieving boards:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/boards/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const boardsCollection = db.collection('boards');

		// Convert the ID from string to ObjectId
		const id = new ObjectId(req.params.id);

		// Find the board by ID
		const board = await boardsCollection.findOne({ _id: id });
		if (!board) {
			return res.status(404).json({ error: 'Board not found' });
		}

		// Since the board document already contains list IDs, you can directly include them in the response
		res.json(board);
	} catch (error) {
		console.error('Error retrieving board:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.put('/api/boards/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const collection = db.collection('boards');

		// Convert the ID from string to ObjectId
		const id = new ObjectId(req.params.id);

		// Extract the new data from the request body
		const { boardName, boardGradient } = req.body;

		// Update the document
		const result = await collection.updateOne(
			{ _id: id },
			{ $set: { boardName, boardGradient } }
		);

		if (result.matchedCount === 0) {
			return res.status(404).json({ error: 'Board not found' });
		}

		// Send a success response
		res.json({ message: 'Board updated successfully' });
	} catch (error) {
		console.error('Error updating board:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.delete('/api/boards/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const boardsCollection = db.collection('boards');
		const listsCollection = db.collection('lists');
		const cardsCollection = db.collection('cards');

		// Convert the ID from string to ObjectId
		const boardId = new ObjectId(req.params.id);

		// Fetch the board document to get its associated lists
		const board = await boardsCollection.findOne({ _id: boardId });

		if (!board) {
			return res.status(404).json({ error: 'Board not found' });
		}

		// Fetch the list IDs associated with the board
		const listIds = board.lists.map((list) => list.toString());

		const objectListIds = board.lists.map((list) => new ObjectId(list));

		// Fetch and delete associated cards
		const cardDeleteResult = await cardsCollection.deleteMany({
			listId: { $in: listIds },
		});

		// Delete the board document
		const boardDeleteResult = await boardsCollection.deleteOne({
			_id: boardId,
		});

		// Delete the associated lists
		const listDeleteResult = await listsCollection.deleteMany({
			_id: { $in: objectListIds },
		});

		// Send a success response
		res.json({
			message: 'Board, associated lists, and cards deleted successfully',
		});
	} catch (error) {
		console.error('Error deleting board, lists, and cards:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//Lists
app.post('/api/lists', async (req, res) => {
	try {
		const { listIds } = req.body;

		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Convert the list IDs from strings to ObjectIds
		const objectIdListIds = listIds.map((listId) => new ObjectId(listId));

		// Find lists by IDs
		const lists = await listsCollection
			.find({ _id: { $in: objectIdListIds } })
			.toArray();

		res.status(200).json(lists);
	} catch (error) {
		console.error('Error fetching lists:', error);
		res.status(500).json({ error: 'Error fetching lists' });
	}
});

app.post('/api/lists/new', async (req, res) => {
	try {
		const { title, boardId } = req.body;

		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');
		const boardsCollection = db.collection('boards');

		// Check if the boardId is provided and valid
		if (!boardId || typeof boardId !== 'string') {
			return res.status(400).json({ error: 'Invalid boardId' });
		}

		// Check if the board exists
		const board = await boardsCollection.findOne({
			_id: new ObjectId(boardId),
		});
		if (!board) {
			return res.status(404).json({ error: 'Board not found' });
		}

		// Get the current lists for the board and determine the position for the new list
		const currentLists = await listsCollection
			.find({ _id: { $in: board.lists } })
			.toArray();
		const newPosition = currentLists.length + 1; // Position is one more than the current number of lists

		// Insert the new list with the title, boardId, and position
		const result = await listsCollection.insertOne({
			listName: title,
			position: newPosition,
		});

		// Update the board's lists array with the new listId
		await boardsCollection.updateOne(
			{ _id: new ObjectId(boardId) },
			{ $push: { lists: result.insertedId } }
		);

		res.status(200).json({ message: 'List added successfully', result });
	} catch (error) {
		console.error('Error adding list:', error);
		res.status(500).json({ error: 'Error adding list' });
	}
});

app.get('/api/lists', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Fetch all lists
		const lists = await listsCollection.find({}).toArray();

		res.status(200).json(lists);
	} catch (error) {
		console.error('Error fetching lists:', error);
		res.status(500).json({ error: 'Error fetching lists' });
	}
});

app.delete('/api/lists/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Convert the ID from string to ObjectId
		const boardId = new ObjectId(req.params.id);
		const deleteResult = await listsCollection.deleteOne({
			_id: boardId,
		});

		if (deleteResult.deletedCount === 0) {
			return res.status(404).json({ error: 'List not found' });
		}

		res.status(200).json({ message: 'List deleted successfully' });
	} catch (error) {
		console.error('Error deleting list:', error);
		res.status(500).json({ error: 'Error deleting list' });
	}
});

app.delete('/api/lists', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Delete all documents in the "lists" collection
		const deleteResult = await listsCollection.deleteMany({});

		if (deleteResult.deletedCount === 0) {
			return res
				.status(404)
				.json({ error: 'No documents found in "lists" collection' });
		}

		res.status(200).json({
			message: 'All documents in "lists" collection deleted successfully',
		});
	} catch (error) {
		console.error('Error deleting documents:', error);
		res.status(500).json({ error: 'Error deleting documents' });
	}
});

app.put('/api/lists/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Convert the ID from string to ObjectId
		const listId = new ObjectId(req.params.id);

		// Extract the new title from the request body
		const { newTitle } = req.body;

		// Update the list's title
		const updateResult = await listsCollection.updateOne(
			{ _id: listId },
			{ $set: { listName: newTitle } }
		);

		if (updateResult.modifiedCount === 0) {
			return res
				.status(404)
				.json({ error: 'List not found or title not updated' });
		}

		res.status(200).json({ message: 'List title updated successfully' });
	} catch (error) {
		console.error('Error updating list title:', error);
		res.status(500).json({ error: 'Error updating list title' });
	}
});

//Get the available positions
app.get('/api/lists/positions/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Convert the ID from string to ObjectId
		const id = new ObjectId(req.params.id);

		// Find the board by ID
		const board = await boardsCollection.findOne({ _id: id });

		// Fetch all lists for the given board ID
		const lists = await listsCollection.find({ boardId: id }).toArray();

		if (!lists || lists.length === 0) {
			return res
				.status(404)
				.json({ error: 'Lists not found for the specified board ID' });
		}

		// Extract positions from lists
		const positions = lists.map((list) => list.position);

		res.status(200).json({ positions });
	} catch (error) {
		console.error('Error fetching valid positions:', error);
		res.status(500).json({ error: 'Error fetching valid positions' });
	}
});

//Move the list based on the position
app.put('/api/lists/:listId/position', async (req, res) => {
	try {
		const { listId } = req.params;
		const { newPosition } = req.body;

		const db = req.app.locals.client.db('curriculums');
		const listsCollection = db.collection('lists');

		// Check if the listId is provided and valid
		if (!listId || typeof listId !== 'string') {
			return res.status(400).json({ error: 'Invalid listId' });
		}

		// Check if the list exists
		const existingList = await listsCollection.findOne({
			_id: new ObjectId(listId),
		});
		if (!existingList) {
			return res.status(404).json({ error: 'List not found' });
		}

		// Get the current position of the list
		const currentPosition = existingList.position;

		// Update the position of the list being moved
		await listsCollection.updateOne(
			{ _id: new ObjectId(listId) },
			{ $set: { position: newPosition } }
		);

		// Update positions of other lists accordingly
		if (newPosition < currentPosition) {
			// Move lists down (increase position) between newPosition and currentPosition
			await listsCollection.updateMany(
				{
					position: { $gte: newPosition, $lt: currentPosition },
					_id: { $ne: new ObjectId(listId) },
				},
				{ $inc: { position: 1 } }
			);
		} else if (newPosition > currentPosition) {
			// Move lists up (decrease position) between currentPosition and newPosition
			await listsCollection.updateMany(
				{
					position: { $gt: currentPosition, $lte: newPosition },
					_id: { $ne: new ObjectId(listId) },
				},
				{ $inc: { position: -1 } }
			);
		}

		res.status(200).json({ message: 'List position updated successfully' });
	} catch (error) {
		console.error('Error updating list position:', error);
		res.status(500).json({ error: 'Error updating list position' });
	}
});

//cards
app.post('/api/cards', async (req, res) => {
	try {
		const { listId, title, description, url } = req.body;
		// Check if listId is provided
		if (!listId) {
			return res.status(400).json({ error: 'List ID is required' });
		}

		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		// Insert the new card into the database
		const result = await cardsCollection.insertOne({
			listId,
			title,
			description,
		});

		res.status(201).json({
			_id: result.insertedId.toHexString(),
			listId,
			title,
			description,
		});
	} catch (error) {
		console.error('Error creating card:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/cards', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		const cards = await cardsCollection.find({}).toArray();

		// Return the fetched cards
		res.json(cards);
	} catch (error) {
		console.error('Error fetching cards:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/cards/:id', async (req, res) => {
	try {
		const { id } = req.params;

		// Validate the ID format
		if (!ObjectId.isValid(id)) {
			return res.status(400).json({ error: 'Invalid card ID' });
		}

		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		// Find the card by ID
		const card = await cardsCollection.findOne({ _id: new ObjectId(id) });

		if (!card) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Return the fetched card
		res.json(card);
	} catch (error) {
		console.error('Error fetching card by ID:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.delete('/api/cards/:id', async (req, res) => {
	try {
		const { id } = req.params;

		// Validate the ID format
		if (!ObjectId.isValid(id)) {
			return res.status(400).json({ error: 'Invalid card ID' });
		}

		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		// Delete the card by ID
		const result = await cardsCollection.deleteOne({ _id: new ObjectId(id) });

		if (result.deletedCount === 0) {
			return res.status(404).json({ error: 'Card not found' });
		}

		// Return success message
		res.json({ message: 'Card deleted successfully' });
	} catch (error) {
		console.error('Error deleting card by ID:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.put(
	'/api/cards/:id',
	upload.fields([
		{ name: 'cardFile', maxCount: 1 },
		{ name: 'mediaFile', maxCount: 1 },
	]),
	async (req, res) => {
		try {
			const { id } = req.params;
			const { title, description } = req.body;

			// Validate the ID format
			if (!ObjectId.isValid(id)) {
				return res.status(400).json({ error: 'Invalid card ID' });
			}

			const db = req.app.locals.client.db('curriculums');
			const cardsCollection = db.collection('cards');

			// Update the card by ID
			let updateFields = { title, description };

			if (req.files['cardFile'] && req.files['cardFile'][0]) {
				const cardFile = req.files['cardFile'][0];
				const result = await cloudinary.uploader.upload(cardFile.path, {
					resource_type: 'raw',
					public_id: cardFile.originalname || 'default_name', // Use default name if originalname is undefined
					filename: title,
				});
				updateFields.cardUrl = result.secure_url;
				// Delete the card file from the upload directory
				fs.unlink(cardFile.path, (err) => {
					if (err) {
						console.error('Error deleting card file:', err);
					} else {
						console.log('Card file deleted from upload directory');
					}
				});
			}

			if (req.files['mediaFile'] && req.files['mediaFile'][0]) {
				const mediaFile = req.files['mediaFile'][0];
				const result = await cloudinary.uploader.upload(mediaFile.path, {
					resource_type: 'auto',
					public_id: mediaFile.originalname || 'default_name', // Use default name if originalname is undefined
					imagename: title,
				});
				updateFields.mediaUrl = result.secure_url;
				// Delete the media file from the upload directory
				fs.unlink(mediaFile.path, (err) => {
					if (err) {
						console.error('Error deleting media file:', err);
					} else {
						console.log('Media file deleted from upload directory');
					}
				});
			}

			const result = await cardsCollection.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: updateFields } // Update fields as needed
			);

			if (result.modifiedCount === 0) {
				return res.status(404).json({ error: 'Card not found' });
			}

			// Return success message
			res.json({ message: 'Card updated successfully', data: result });
		} catch (error) {
			console.error('Error updating card by ID:', error);
			res.status(500).json({ error: 'Internal server error' });
		}
	}
);

app.delete('/api/delete/cards', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		// Delete all documents in the card collection
		const result = await cardsCollection.deleteMany({});

		// Check if any documents were deleted
		if (result.deletedCount > 0) {
			// Return success message
			res.json({ message: 'All cards deleted successfully' });
		} else {
			res.status(404).json({ error: 'No cards found to delete' });
		}
	} catch (error) {
		console.error('Error deleting all cards:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//Find the cards related to the list by listId
app.get('/api/cards/list/:listId', async (req, res) => {
	try {
		const { listId } = req.params;

		// Validate the listId format
		if (!ObjectId.isValid(listId)) {
			return res.status(400).json({ error: 'Invalid list ID' });
		}

		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		// Find cards by listId
		const cards = await cardsCollection.find({ listId }).toArray();

		// Return the fetched cards
		res.json(cards);
	} catch (error) {
		res.status(500).json({ error: 'Internal server error' });
	}
});

//Move the cards from one place to another
app.post('/api/cards/move/:cardId', async (req, res) => {
	try {
		const { cardId } = req.params;
		const { newListId } = req.body;

		// Validate incoming data
		if (!cardId || !newListId) {
			return res.status(400).json({ error: 'Incomplete data' });
		}

		// Update the card's listId in the database
		const db = req.app.locals.client.db('curriculums');
		const cardsCollection = db.collection('cards');

		const updatedCard = await cardsCollection.findOneAndUpdate(
			{ _id: new ObjectId(cardId) },
			{ $set: { listId: newListId } },
			{ returnOriginal: false }
		);

		res.json({ message: 'Card moved successfully' });
	} catch (error) {
		console.error('Error moving card:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

//users
app.post('/api/users', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums'); // Assuming 'curriculums' is your database name
		const collection = db.collection('users'); // Create or access the 'users' collection
		const userData = req.body;

		// Extracting specific properties from nested objects in userData
		const email_address = userData.data.email_addresses[0].email_address;
		const first_name = userData.data.first_name;
		const last_name = userData.data.last_name;
		const username = userData.data.username;
		const phone_number = userData.data.phone_numbers[0].phone_number;

		// Creating a new object with the extracted properties
		const userObject = {
			email_address,
			first_name,
			last_name,
			username,
			phone_number,
		};

		// Insert the userObject into the 'users' collection
		const result = await collection.insertOne(userObject);

		res.status(201).json(result[0]);
	} catch (error) {
		console.error('Error inserting user data:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/users', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums'); // Assuming 'curriculums' is your database name
		const collection = db.collection('users'); // Access the 'users' collection

		// Query the 'users' collection to retrieve all user data
		const userData = await collection.find({}).toArray();

		// Send retrieved user data as response
		res.json(userData);
	} catch (error) {
		console.error('Error retrieving user data:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.get('/api/users/:id', async (req, res) => {
	try {
		const db = req.app.locals.client.db('curriculums'); // Assuming 'curriculums' is your database name
		const collection = db.collection('users'); // Access the 'users' collection

		const userId = req.params.id; // Get the user ID from the request parameters

		// Query the 'users' collection to find a user by ID
		const user = await collection.findOne({ _id: userId });

		if (!user) {
			// If user is not found, return 404 status with a message
			return res.status(404).json({ error: 'User not found' });
		}

		// Send the retrieved user data as response
		res.json(user);
	} catch (error) {
		console.error('Error retrieving user data by ID:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.delete('/api/users/:id', async (req, res) => {
	try {
		const userId = req.params.id;
		const db = req.app.locals.client.db('curriculums'); // Assuming 'curriculums' is your database name
		const collection = db.collection('users'); // Access the 'users' collection

		// Delete the user with the specified ID
		const result = await collection.deleteOne({ _id: new ObjectId(userId) });

		if (result.deletedCount === 1) {
			res.status(200).json({ message: 'User deleted successfully' });
		} else {
			res.status(404).json({ error: 'User not found' });
		}
	} catch (error) {
		console.error('Error deleting user:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

app.post('/api/send-email', upload.single('image'), async (req, res) => {
	try {
		const { recipients, subject, message } = req.body;

		if (!recipients || !subject) {
			return res
				.status(400)
				.json({ error: 'Recipients and subject are required' });
		}

		const attachment = req.file ? req.file.buffer : null;

		const mailOptions = {
			from: {
				name: 'Diego Elizalde',
				address: 'potenciapanadera@gmail.com',
			},
			to: recipients,
			subject: subject,
			text: message,
			attachments: [{ filename: 'image.png', content: attachment }],
		};

		await transporter.sendMail(mailOptions);

		res.status(200).json({ message: 'Email sent successfully' });
	} catch (error) {
		console.error('Error sending email:', error);

		// Check for specific error types and provide descriptive error messages
		if (error.code === 'EENVELOPE') {
			return res
				.status(400)
				.json({ error: 'Invalid email address in recipients list' });
		} else if (error.code === 'EMESSAGE') {
			return res
				.status(400)
				.json({ error: 'Error creating or sending email message' });
		}

		res
			.status(500)
			.json({ error: 'Error sending email. Please try again later.' });
	}
});

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
