const express = require('express');
const app = express();
const port = 5000;
const cors = require('cors');
const fs = require('fs');
const jwt = require("jsonwebtoken");
const requireAuth = require('./middleware/requireAuth');

//Middlewares
app.use(cors({
	origin: "http://localhost:5173",
	credentials: true,
}));

app.use(express.json());

//Mongo connection
const { MongoClient } = require('mongodb');

async function main() {
	const uri =
		'mongodb+srv://Admin:12345@cluster0.xzob5cq.mongodb.net';
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

const ObjectId = require('mongodb').ObjectId;

app.post('/uploadExcelFile', upload.single('uploadfile'), async (req, res) => {
	try {
		const result = await cloudinary.uploader.upload(req.file.path, {
			resource_type: 'raw',
			public_id: req.file.originalname, // Use original filename as public_id
		});
		const fileUrl = result.secure_url;
		const fileId = new ObjectId().toString(); // Generate a new MongoDB ObjectId

		const userId = req.body.userId;

		// Assuming you have a database and collection set up
		const db = req.app.locals.client.db('Users');
		const collection = db.collection('excelsheets');

		// Insert the file URL and ID into MongoDB
		const insertResult = await collection.insertOne({
			_id: fileId,
			url: fileUrl,
			filename: req.file.originalname, // Save original filename in database
			userId: userId,
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
		// Access MongoDB collection
		const db = req.app.locals.client.db('Users');
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
		// Delete file record from MongoDB
		const db = app.locals.client.db('Users');
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

// Example usage:
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

app.post("/login", async (req, res) => {
	const { email, password } = req.body;

	if (!email || !password) {
		return res.status(400).json({ error: "Ingresa un correo y una contraseña" });
	}

	try {
		const db = req.app.locals.client.db("Users");
		const user = await db.collection("usuarios").findOne({ email });

		if (!user) {
			return res.status(401).json({ error: "Credenciales invalidas" });
		}

		const isMatch = (password === user.password);

		if (!isMatch) {
			return res.status(401).json({ error: "Credenciales invalidas" });
		}

		const token = jwt.sign({ userId: user._id, type: user.type, name: user.name }, "secret", { expiresIn: 60 * 60 * 24 });

		res.json({ token });
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({ error: "Internal server error" });
	}
})

app.get("/profile", requireAuth, async (req, res) => {
	return res.json({
		profile: {
			username: req.user
		},
		message: "profile data"
	})
})

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});