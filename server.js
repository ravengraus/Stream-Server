// include modules
var restify = require('restify'),
	config = require('./config'),
	camera = require('./camera'),
	Datastore = require('nedb');
	
// set up rest-api server
var server = restify.createServer();

// set up logging
var system = new Datastore({ filename: __dirname + '/data/system.db', autoload: true });

system.log = function (level, message, print) {
	var entry = {
		level: level,
		message: message,
		timestamp: new Date().getTime()	
	};
	if (level == 'error' || print) {
		console.log(message);	
	}
	system.insert(entry, function (err) {
		if (err) console.log('Error: Unable to log system messages.', err);
	});
};

// load trains from config
var trains = config.trains,
    trainsJson = JSON.stringify(trains);

function startup() {
	for (var i = 0; i < trains.length; i++) {
		var cameras = trains[i].cameras;

		for (var j = 0; j < cameras.length; j++) {
			// load camera
			cameras[j].camera = new camera(cameras[j].name, cameras[j].ip);
			
			// activate camera
			initialize(cameras[j].camera);
		}
	}
}

function initialize(camera) {
	// TODO: trim camera log
	
	camera.status(function () {
		camera.log('info', 'Camera online.');
		system.log('info', 'Camera ' + camera.name + ' is online.');
	});
}

// controller routes for train actions
server.get('/train/:action/:id', function(req, res, next) {
	if (req.params.action == 'in') {
		system.log('info', 'Incoming train: ' + req.params.id);
		trainComingIn(req.params.id);
		res.send('Acknowledged. Train ' + req.params.id +  ' coming in.');
	}	
	else if (req.params.action == 'out') {
		system.log('info', 'Outgoing train: ' + req.params.id);
		trainGoingOut(req.params.id);
		res.send('Acknowledged. Train ' + req.params.id +  ' going out.');
	}
	else {
		res.send('Unsupported request.');
	}
	next();
});

// route for train configuration
server.get('/data/config/train', function (req, res, next) {
	var data = { };
	data.trains = JSON.parse(trainsJson)
	
	res.send(data);
	next();
});

// route for system data
server.get('/data/system', function (req, res, next) {
	system.find({}).sort({ timestamp: -1 }).limit(300).exec(function (err, dataset) {
	  if (err) {
		  system.log('error', 'Error retrieving system messages from database.');
		  res.send('Error.');
	  }
	  else {
		  res.send(dataset);
	  }
	  next();
	});
});

// route for camera data
server.get('/data/camera/:name', function (req, res, next) {	
	if (req.params.name) {
		var notFound = true;
		
		// search trains for camera
		for (var i = 0; i < trains.length; i++) {
			var cameras = trains[i].cameras;
		
			for (var j = 0; j < cameras.length; j++) {
				// camera matching name found
				if (cameras[j].camera.name == req.params.name) {
					notFound = false;
					
					// call camera for log dump
					cameras[j].camera.data(function (err, dataset) {
						if (err) {
							system.log('error', 'Failed to get event log for camera ' + camera.name + '.');
							res.send('Error.');
						}
						else {
							res.send(dataset);
						}
						next();
					});
					break;
				}
			}
		}
		
		if (notFound) {
			res.send('Camera not found.');
			next();
		}
	}
	else {
		res.send('Error.');
		next();
	}
});

server.get(/\/admin\/?.*/, restify.serveStatic({
  directory: './public',
  default: 'index.html'
}));

function fileSaved(camera, files, index) {
	var filename = files[index].name[0],
		offset = index + 1;
			
	var	message = 'Processed file ' + offset + ' of ' + files.length + ' for camera ' + camera.name;
		
	if (config.deleteFromCamera) {
		camera.deleteFile(filename, function () {
			system.log('info', message);
			processFiles(camera, files, offset);
		});
	}
	else {
		system.log('info', message);
		processFiles(camera, files, offset);
	}
}

function processFiles(camera, files, index) {
	if (!files || !files.length) {
		system.log('info', 'No files to process for camera ' + camera.name);
		return;
	}
	if (index != null && index > -1) {
		if (index < files.length) {
			camera.getFile(files, index, fileSaved);
		}
		else {
			system.log('info', 'Finished. All files processed for camera ' + camera.name);
		}
	}
	else {
		system.log('info', 'Begin processing files for camera ' + camera.name);
		processFiles(camera, files, 0);
	}
}

function trainComingIn(id) {
	var train = getTrain(id);
	
	if (train) {
		var cameras = train.cameras;
		
		for (var i = 0; i < cameras.length; i++) {
			var camera = cameras[i].camera;
			
			// get status of camera
			camera.status(function (s) {
				system.log('info', 'Camera ' + camera.name + ' recording status: ' + s.status);
				
				if (s.status != 'stopped') {
					// tell camera to stop recording
					camera.stopRecord(function () {
						// camera stopped, re-check status
						trainComingIn(id);
					});
				}
				else {
					processFiles(camera, s.files[0].file);
				}
			});
		}
	}
	else {
		system.log('info', 'Unknown train or train with no cameras. [id=' + id + ']');
	}
}

function trainGoingOut (id) {
	var train = getTrain(id);
	
	if (train) {
		var cameras = train.cameras;
		
		for (var i = 0; i < cameras.length; i++) {
			var camera = cameras[i].camera;
			
			// get status of camera
			camera.status(function (s) {
				system.log('info', 'Camera ' + camera.name + ' recording status: ' + s.status);
				
				if (s.status != 'running') {
					// tell camera to start recording
					camera.startRecord(function () {
						// all done
						system.log('info', 'Successfully started recording for camera ' + camera.name + ' on train ' + id);
					});
				}
				else {
					// unexpected state, camera is recording before going out...was not stopped coming in
					system.log('info', 'Camera ' + camera.name + ' on train ' + id + ' should not be recording');
				}
			});
		}
	}
	else {
		system.log('info', 'Unknown train or train with no cameras. [id=' + id + ']');
	}
}

function getTrain(id) {
	for (var i = 0; i < trains.length; i++) {
		if (trains[i].id == id) return trains[i];
	}
	return null;
}

process.on('uncaughtException', function (err) {
	system.log('error', 'Uncaught exception: ' + err.message);
	if (config.debug) system.log('error', 'Stack trace: ' + err.stack);

	process.exit(1);
});

startup();

server.listen(3000, function () {
	system.log('info', 'Server up. Listening on port 3000.', true);
});

