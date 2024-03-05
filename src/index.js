const express = require('express');
const app = express();
const port = 5000;
const cors = require('cors');
const fs = require('fs');

//Middlewares
app.use(cors());

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

		// Assuming you have a database and collection set up
		const db = req.app.locals.client.db('curriculums');
		const collection = db.collection('excelsheets');

		// Insert the file URL and ID into MongoDB
		const insertResult = await collection.insertOne({
			_id: fileId,
			url: fileUrl,
			filename: req.file.originalname, // Save original filename in database
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
		// Delete file record from MongoDB
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

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
